function executeInfinitePanelsScripts(container) {
    // Scripts inserted via innerHTML do not execute automatically.
    container.querySelectorAll('script').forEach((oldScript) => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
    });
}

function infinitePanelsIdFromUrl(url) {
    const external = window.FokusPaneProviders?.fromUrl(url);
    if (external) return external.id;
    const targetUrl = new URL(url, window.location.href);
    const queryPageId = targetUrl.searchParams.get('id');
    if (queryPageId) return queryPageId;
    const baseUrl = new URL(DOKU_BASE, window.location.origin);
    let pagePath = targetUrl.pathname;
    if (pagePath.startsWith(baseUrl.pathname)) pagePath = pagePath.slice(baseUrl.pathname.length);
    return decodeURIComponent(pagePath.replace(/^\/+|\/+$/g, ''));
}

function infinitePanelsUrlFromId(id) {
    const provided = window.FokusPaneProviders?.urlForId(id);
    if (provided) return provided;
    const baseUrl = new URL(DOKU_BASE, window.location.origin);
    const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
    const pagePath = encodeURIComponent(id).replace(/%3A/gi, ':');
    return new URL(`${basePath}${pagePath}`, baseUrl.origin).href;
}

document.addEventListener('DOMContentLoaded', () => {
    const content = document.getElementById('dokuwiki__content');
    const pageContext = document.querySelector('#dokuwiki__top.mode_show') || document.body;
    if (!content || !pageContext.classList.contains('mode_show')) return;

    // Keep the plugin template-agnostic: wrap the normal DokuWiki content
    // column instead of requiring panel markup in a particular template.
    const pageContent = content.querySelector(':scope > .pad.group') || content.firstElementChild;
    if (!pageContent) return;

    const currentPageId = window.JSINFO?.id || window.InfinitePanelsConfig?.pageId || '';
    const startPageId = window.InfinitePanelsConfig?.startPageId || '';

    let minimizedShelf = null;
    let viewport = null;
    let panes = null;
    let zoomBackdrop = null;
    let zoomPane = null;
    let zoomPlaceholder = null;
    let zoomTrigger = null;
    let zoomTemporaryPane = false;
    let editBackdrop = null;
    let editPane = null;
    let editTrigger = null;
    let editDirty = false;
    let editComplete = null;
    const paneElements = [];
    let navigationVersion = 0;
    let focusedPaneIndex = 0;
    const focusedPaneIndexes = new Set();

    function updatePaneOverflow() {
        if (!viewport) return;
        const gutter = Number.parseFloat(
            window.getComputedStyle(document.documentElement).getPropertyValue('--fokus-page-gutter')
        ) || 0;
        // Compare against the viewport width with the left gutter removed. This
        // keeps overflow detection stable as the padding changes the viewport width.
        const alreadyScrolled = document.body.classList.contains('infinitepanels-scrolled');
        const availableWidth = viewport.clientWidth + (alreadyScrolled ? 0 : gutter);
        const hasOverflow = viewport.scrollWidth > availableWidth + 1;
        document.body.classList.toggle('infinitepanels-overflowing', hasOverflow);
        document.body.classList.toggle(
            'infinitepanels-scrolled',
            hasOverflow && viewport.scrollLeft > 1
        );
    }

    function createPanelLayout() {
        const wrapper = document.createElement('div');
        wrapper.className = 'infinitepanels-wrapper';
        minimizedShelf = document.createElement('div');
        minimizedShelf.className = 'infinitepanels-minimized-shelf';
        minimizedShelf.setAttribute('role', 'group');
        minimizedShelf.setAttribute('aria-label', 'Workspace shelf');
        const workspaceBar = document.querySelector('#dokuwiki__header .fokus-workspace-bar');
        if (workspaceBar) {
            workspaceBar.appendChild(minimizedShelf);
            // The shelf lives in the template header, outside #dokuwiki__content,
            // so its pill clicks cannot reach the content-level delegated handler.
            minimizedShelf.addEventListener('click', (event) => {
                const target = event.target instanceof Element ? event.target : event.target.parentElement;
                const button = target?.closest('.infinitepanels-spine');
                if (!button || !minimizedShelf.contains(button)) return;
                const index = Number.parseInt(button.dataset.paneIndex || '', 10) - 1;
                focusPaneFromSpine(index);
            });
        }
        viewport = document.createElement('div');
        viewport.className = 'infinitepanels-viewport';
        panes = document.createElement('div');
        panes.className = 'infinitepanels-panes';
        viewport.appendChild(panes);
        const paneOverflowObserver = new ResizeObserver(updatePaneOverflow);
        paneOverflowObserver.observe(viewport);
        paneOverflowObserver.observe(panes);
        viewport.addEventListener('scroll', updatePaneOverflow, { passive: true });
        wrapper.appendChild(viewport);
        content.insertBefore(wrapper, pageContent);

        // Pane bodies scroll vertically on their own, so horizontal wheel
        // gestures over their content do not naturally reach the viewport.
        // Forward those gestures to the shared pane scroller.
        viewport.addEventListener('wheel', (event) => {
            if (!window.matchMedia('(min-width: 1200px)').matches) return;

            let delta = event.deltaX;
            if (!delta && event.shiftKey) delta = event.deltaY;
            if (!delta) return;

            const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? 16
                : (event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientWidth : 1);
            delta *= multiplier;

            const target = event.target instanceof Element ? event.target : event.target.parentElement;
            let nestedScroller = target;
            while (nestedScroller && nestedScroller !== viewport) {
                const style = window.getComputedStyle(nestedScroller);
                const canScrollHorizontally = nestedScroller.scrollWidth > nestedScroller.clientWidth
                    && /(auto|scroll)/.test(style.overflowX);
                const canConsumeDelta = delta < 0
                    ? nestedScroller.scrollLeft > 0
                    : nestedScroller.scrollLeft + nestedScroller.clientWidth < nestedScroller.scrollWidth;
                if (canScrollHorizontally && canConsumeDelta) return;
                nestedScroller = nestedScroller.parentElement;
            }

            const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
            const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, viewport.scrollLeft + delta));
            if (nextScrollLeft !== viewport.scrollLeft) {
                event.preventDefault();
                viewport.scrollLeft = nextScrollLeft;
            }
        }, { passive: false });

        const rootPane = document.createElement('section');
        rootPane.className = 'infinitepanels-pane infinitepanels-pane-root';
        rootPane.dataset.pageId = currentPageId;
        rootPane.appendChild(pageContent);
        panes.appendChild(rootPane);
        paneElements.push(rootPane);
        addPaneControls(rootPane, currentPageId, document, true);
        activatePanelMode();
        updatePaneOverflow();
        refreshOpenPageLinks();
    }

    function updatePaneHeight() {
        const header = document.getElementById('dokuwiki__header');
        const headerBottom = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        const availableHeight = Math.max(240, window.innerHeight - headerBottom);
        document.documentElement.style.setProperty('--infinitepanels-viewport-height', `${availableHeight}px`);
    }

    function pageIdForUrl(url) {
        return infinitePanelsIdFromUrl(url);
    }

    function normalizePageId(pageId) {
        if (!pageId) return '';
        if (pageId.startsWith('wp.')) return pageId;
        try {
            return decodeURIComponent(pageId);
        } catch (_error) {
            return pageId;
        }
    }

    function pageIdForLink(anchor) {
        const external = window.FokusPaneProviders.fromLink(anchor);
        if (external) return external.id;
        return normalizePageId(anchor.dataset.wikiId || pageIdForUrl(anchor.href));
    }

    function findOpenPageIndex(pageId) {
        const normalizedId = normalizePageId(pageId);
        if (!normalizedId) return -1;
        const identity = id => id.startsWith('wp.') ? id.split('#')[0] : id;
        return paneElements.findIndex((pane) => identity(normalizePageId(pane.dataset.pageId)) === identity(normalizedId));
    }

    function focusOpenPage(index, url, companionIndex = -1, persistUrl = true) {
        const pane = paneElements[index];
        if (!pane) return;
        if (pane.dataset.provider !== 'wikipedia') window.fokusRegisterRecentPage?.(pane.dataset.pageId);
        else {
            pane.dataset.pageId = pageIdForUrl(url);
            pane.dataset.pageUrl = url;
        }
        pane.classList.remove('infinitepanels-pane-minimized');
        focusedPaneIndex = index;
        if (document.body.classList.contains('infinitepanels-focused')) {
            focusedPaneIndexes.add(index);
            if (companionIndex >= 0) focusedPaneIndexes.add(companionIndex);
        }
        updateFocusedLayout();
        if (persistUrl) saveUrlState();
        if (viewport) {
            const firstVisibleIndex = document.body.classList.contains('infinitepanels-focused') && companionIndex >= 0
                ? Math.min(index, companionIndex)
                : index;
            const firstVisiblePane = paneElements[firstVisibleIndex];
            viewport.scrollTo({
                left: document.body.classList.contains('infinitepanels-focused')
                    ? (firstVisiblePane?.offsetLeft || 0)
                    : pane.offsetLeft,
                behavior: 'smooth'
            });
        }

        const hash = new URL(url, window.location.href).hash;
        if (!hash) return;
        let anchorId = hash.slice(1);
        try {
            anchorId = decodeURIComponent(anchorId);
        } catch (_error) {
            // Keep the encoded fragment if it is malformed.
        }
        const target = Array.from(pane.querySelectorAll('[id]')).find((element) => element.id === anchorId || element.dataset.originalId === anchorId);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function refreshOpenPageLinks() {
        const openPageIds = new Set(paneElements.map((pane) => pane.dataset.pageId)
            .map(normalizePageId).filter(Boolean));

        content.querySelectorAll('a.wikilink1, a.wikilink2, a.interwiki, [data-provider="wikipedia"] a').forEach((anchor) => {
            if (anchor.getAttribute('href')?.startsWith('#') || anchor.hasAttribute('data-pane-original')) return;
            const targetPageId = pageIdForLink(anchor);
            anchor.classList.toggle('infinitepanels-open-page-link', openPageIds.has(targetPageId) || findOpenPageIndex(targetPageId) >= 0);
        });
    }

    function saveUrlState() {
        const focused = document.body.classList.contains('infinitepanels-focused');
        const url = new URL(window.location.href);
        ['p', 'm', 'f'].forEach((parameter) => url.searchParams.delete(parameter));
        paneElements.forEach((pane, index) => {
            const id = pane.dataset.pageId;
            if (!id) return;
            const isFocusAnchor = focused && index === focusedPaneIndex;
            const isMinimized = pane.classList.contains('infinitepanels-pane-minimized')
                || (focused && !focusedPaneIndexes.has(index));
            const state = isFocusAnchor ? 'f' : (isMinimized ? 'm' : (index > 0 ? 'p' : ''));
            if (state) url.searchParams.append(state, id);
        });

        // URLSearchParams escapes namespace separators. Keep DokuWiki's
        // readable colon notation in pane values while preserving all other
        // query parameter encoding.
        const query = url.searchParams.toString().replace(/(^|&)([pmf])=([^&]*)/g, (_match, prefix, parameter, value) => {
            return `${prefix}${parameter}=${value.replace(/%3A/gi, ':')}`;
        });
        const readableUrl = `${url.origin}${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
        if (readableUrl !== window.location.href) {
            window.history.pushState(window.history.state, '', readableUrl);
        }
    }

    function ensurePaneVisible(pane) {
        if (!pane || !viewport) return;
        const viewportRect = viewport.getBoundingClientRect();
        const paneRect = pane.getBoundingClientRect();
        let nextScrollLeft = viewport.scrollLeft;
        if (paneRect.left < viewportRect.left) {
            nextScrollLeft -= viewportRect.left - paneRect.left;
        } else if (paneRect.right > viewportRect.right) {
            nextScrollLeft += paneRect.right - viewportRect.right;
        }
        if (nextScrollLeft !== viewport.scrollLeft) {
            viewport.scrollTo({ left: nextScrollLeft, behavior: 'smooth' });
        }
    }

    function activatePanelMode() {
        const wasActive = document.body.classList.contains('infinitepanels-active');
        const desktop = window.matchMedia('(min-width: 1200px)').matches;
        const root = paneElements[0];
        const scrollOffset = !wasActive && desktop ? Math.max(0, -root.getBoundingClientRect().top) : 0;
        updatePaneHeight();
        document.body.classList.add('infinitepanels-active');
        if (!wasActive && desktop) {
            root.scrollTop = scrollOffset;
            window.scrollTo(0, 0);
        }
    }

    function updateFocusControls() {
        const focused = document.body.classList.contains('infinitepanels-focused');
        paneElements.forEach((pane, index) => {
            const button = pane.querySelector('.infinitepanels-focus-toggle');
            if (button) {
                const isPrimaryPane = focused && index === focusedPaneIndex;
                const label = !focused
                    ? 'Focus on this pane'
                    : (isPrimaryPane ? 'Show all panes' : 'Focus only this pane');
                button.title = label;
                button.setAttribute('aria-label', label);
                button.setAttribute('aria-pressed', String(isPrimaryPane));
                const icon = button.querySelector('svg');
                if (icon) icon.replaceWith(createPhosphorIcon(isPrimaryPane ? 'book-open-text' : 'cube-focus'));
            }

        });
    }

    function updateFocusedLayout() {
        const focused = document.body.classList.contains('infinitepanels-focused');
        paneElements.forEach((pane, index) => {
            pane.classList.toggle('infinitepanels-pane-current', index === focusedPaneIndex);
            pane.classList.toggle(
                'infinitepanels-focused-active',
                focused && focusedPaneIndexes.has(index)
            );
        });
        updateMinimizedShelf();
        updateFocusControls();
        const activePageId = paneElements[focusedPaneIndex]?.dataset.pageId;
        if (activePageId) document.dispatchEvent(new CustomEvent('fokus:pagechange', { detail: { pageId: activePageId } }));
    }

    function updateMinimizedShelf() {
        if (!minimizedShelf) return;
        paneElements.forEach((pane, index) => {
            const spine = pane.querySelector('.infinitepanels-spine')
                || Array.from(minimizedShelf.querySelectorAll('.infinitepanels-spine'))
                    .find((button) => button._infinitePanelsPane === pane);
            if (!spine) return;
            const minimized = pane.classList.contains('infinitepanels-pane-minimized')
                || (document.body.classList.contains('infinitepanels-focused') && !focusedPaneIndexes.has(index));
            spine.dataset.paneIndex = String(index + 1);
            spine.dataset.state = minimized ? 'minimized' : 'open';
            spine.dataset.current = String(index === focusedPaneIndex);
            const paneTitle = spine.querySelector('.infinitepanels-spine-label')?.textContent || pane.dataset.pageId || '';
            spine.title = `${paneTitle} · ${minimized ? 'Minimized' : 'Open'}`;
            spine.setAttribute('aria-label', `${minimized ? 'Restore' : 'Show'} ${paneTitle} (${minimized ? 'minimized' : 'open'})`);
            spine.setAttribute('aria-pressed', String(!minimized));
            if (minimizedShelf.children[index] !== spine) {
                minimizedShelf.insertBefore(spine, minimizedShelf.children[index] || null);
            }
        });
        if (document.body.classList.contains('infinitepanels-active')) updatePaneHeight();
    }

    function toggleFocusedView(index) {
        const wasFocused = document.body.classList.contains('infinitepanels-focused');
        const isShowingAll = wasFocused && index === focusedPaneIndex;
        if (isShowingAll) {
            document.body.classList.remove('infinitepanels-focused');
            focusedPaneIndexes.clear();
            paneElements.forEach((pane) => {
                pane.classList.remove('infinitepanels-pane-minimized');
            });
        } else {
            focusedPaneIndex = Math.max(0, index);
            focusedPaneIndexes.clear();
            focusedPaneIndexes.add(focusedPaneIndex);
            document.body.classList.add('infinitepanels-focused');
        }
        updateFocusedLayout();
        saveUrlState();
        const pane = paneElements[focusedPaneIndex];
        if (pane && viewport) {
            if (isShowingAll) {
                viewport.scrollTo({ left: pane.offsetLeft, behavior: 'smooth' });
            } else if (wasFocused) {
                ensurePaneVisible(pane);
            } else {
                viewport.scrollTo({ left: 0, behavior: 'smooth' });
            }
        }
    }

    function focusPaneFromSpine(index) {
        if (index < 0 || index >= paneElements.length) return;
        const pane = paneElements[index];
        focusedPaneIndex = index;
        pane.classList.remove('infinitepanels-pane-minimized');
        if (document.body.classList.contains('infinitepanels-focused')) {
            focusedPaneIndexes.add(index);
            updateFocusedLayout();
            ensurePaneVisible(pane);
        } else {
            updateFocusedLayout();
            if (viewport) viewport.scrollTo({ left: pane.offsetLeft, behavior: 'smooth' });
        }
        saveUrlState();
        pane?.querySelector('.infinitepanels-focus-toggle')?.focus({ preventScroll: true });
    }

    function togglePaneMinimized(index) {
        const pane = paneElements[index];
        if (!pane) return;
        const minimized = pane.classList.toggle('infinitepanels-pane-minimized');
        if (document.body.classList.contains('infinitepanels-focused')) {
            if (minimized) {
                focusedPaneIndexes.delete(index);
                if (index === focusedPaneIndex && focusedPaneIndexes.size > 0) {
                    focusedPaneIndex = focusedPaneIndexes.values().next().value;
                }
            }
            else focusedPaneIndexes.add(index);
        }
        updateFocusControls();
        updateFocusedLayout();
        saveUrlState();
    }

    function setZoomButtonState(pane, isZoomed) {
        const button = pane?.querySelector('.infinitepanels-zoom');
        if (!button) return;
        const label = isZoomed ? 'Restore pane size' : 'Zoom pane';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(isZoomed));
        const icon = button.querySelector('svg');
        if (icon) icon.replaceWith(createPhosphorIcon('magnifying-glass-plus'));
    }

    function closeZoomPane(restoreFocus = true) {
        if (!zoomBackdrop) return;
        const pane = zoomPane;
        const backdrop = zoomBackdrop;
        const placeholder = zoomPlaceholder;
        const trigger = zoomTrigger;
        const temporary = zoomTemporaryPane;

        // Clear the modal state first so a later UI update cannot leave zoom
        // stuck if moving the pane or updating its controls throws.
        zoomBackdrop = null;
        zoomPane = null;
        zoomPlaceholder = null;
        zoomTrigger = null;
        zoomTemporaryPane = false;

        try {
            if (pane && temporary) {
                window.InfinitePanelsAdapters?.annotations?.destroy(pane);
                pane.remove();
            } else if (pane && placeholder?.isConnected) {
                placeholder.before(pane);
            }
        } finally {
            placeholder?.remove();
            backdrop.remove();
            document.body.classList.remove('infinitepanels-zoom-active');
            setZoomButtonState(pane, false);
            if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
        }
    }

    function toggleZoomPane(pane, trigger, temporary = false) {
        if (zoomPane === pane) {
            closeZoomPane();
            return;
        }
        if (zoomBackdrop) closeZoomPane(false);

        if (!temporary) {
            zoomPlaceholder = document.createElement('div');
            zoomPlaceholder.className = 'infinitepanels-pane-placeholder';
            pane.before(zoomPlaceholder);
        }

        zoomBackdrop = document.createElement('div');
        zoomBackdrop.className = 'infinitepanels-zoom-backdrop';
        zoomBackdrop.setAttribute('role', 'dialog');
        zoomBackdrop.setAttribute('aria-modal', 'true');
        zoomBackdrop.setAttribute('aria-label', `Zoomed wiki page ${pane.dataset.pageId || ''}`);
        zoomBackdrop.addEventListener('click', (event) => {
            if (event.target === zoomBackdrop) closeZoomPane();
        });
        zoomPane = pane;
        zoomTrigger = trigger;
        zoomTemporaryPane = temporary;
        content.appendChild(zoomBackdrop);
        zoomBackdrop.appendChild(pane);
        document.body.classList.add('infinitepanels-zoom-active');
        setZoomButtonState(pane, true);
    }

    function closeNativeEdit(refreshPane = false) {
        if (!editBackdrop) return true;
        if (!refreshPane && editDirty && !window.confirm('Close the editor and discard unsaved changes?')) {
            return false;
        }
        const pane = editPane;
        const trigger = editTrigger;
        const onComplete = editComplete;
        editBackdrop.remove();
        editBackdrop = null;
        editPane = null;
        editTrigger = null;
        editDirty = false;
        editComplete = null;
        if (refreshPane && onComplete) {
            Promise.resolve().then(onComplete).catch(error => console.error('Fokus: could not open created page', error));
        }
        if (refreshPane && pane?.isConnected) {
            if (pane.classList.contains('infinitepanels-pane')) {
                const pageId = pane.dataset.pageId;
                const pageUrl = pane.dataset.pageUrl || infinitePanelsUrlFromId(pageId);
                loadPane(pane, pageUrl, pageId, navigationVersion).catch((error) => {
                    console.error('infinitepanels: failed to refresh edited page', error);
                });
            } else {
                window.location.reload();
            }
        }
        if (!refreshPane && trigger?.isConnected) trigger.focus({ preventScroll: true });
        return true;
    }

    function createDokuWikiActionPopup({ title, frameTitle, onClose, onFrameLoad, extraActions = [] }) {
        const backdrop = document.createElement('div');
        backdrop.className = 'infinitepanels-action-popup-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-label', title);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) onClose();
        });

        const windowElement = document.createElement('div');
        windowElement.className = 'infinitepanels-action-popup-window';
        const toolbar = document.createElement('div');
        toolbar.className = 'infinitepanels-action-popup-toolbar';
        const titleElement = document.createElement('span');
        titleElement.className = 'infinitepanels-action-popup-title';
        titleElement.textContent = title;
        const toolbarActions = document.createElement('div');
        toolbarActions.className = 'infinitepanels-action-popup-actions';
        extraActions.forEach((action) => toolbarActions.appendChild(action));

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'infinitepanels-action-popup-action';
        closeButton.title = 'Close';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.appendChild(createPhosphorIcon('x-square'));
        closeButton.addEventListener('click', onClose);
        toolbarActions.appendChild(closeButton);
        toolbar.append(titleElement, toolbarActions);

        const frame = document.createElement('iframe');
        frame.className = 'infinitepanels-action-popup-frame';
        frame.title = frameTitle;
        frame.addEventListener('load', () => onFrameLoad?.(frame));
        windowElement.append(toolbar, frame);
        backdrop.appendChild(windowElement);
        document.body.appendChild(backdrop);
        return { backdrop, frame, closeButton };
    }

    function openNativeEdit(pane, pageId, trigger, onComplete = null) {
        if (!closeNativeEdit(false)) return false;
        editDirty = false;

        const nativeEditUrl = new URL(DOKU_BASE + 'doku.php', window.location.origin);
        nativeEditUrl.searchParams.set('do', 'edit');
        nativeEditUrl.searchParams.set('id', pageId);
        const nativeEditLink = document.createElement('a');
        nativeEditLink.className = 'infinitepanels-action-popup-action';
        nativeEditLink.title = 'Open native editor in a new tab';
        nativeEditLink.setAttribute('aria-label', nativeEditLink.title);
        nativeEditLink.target = '_blank';
        nativeEditLink.rel = 'noopener';
        nativeEditLink.href = nativeEditUrl.href;
        nativeEditLink.appendChild(createPhosphorIcon('arrow-square-out'));

        const editUrl = new URL(DOKU_BASE + 'doku.php', window.location.origin);
        editUrl.searchParams.set('do', 'edit');
        editUrl.searchParams.set('id', pageId);
        editUrl.searchParams.set('fokus_moai_popup', '1');
        let popup;
        popup = createDokuWikiActionPopup({
            title: `${onComplete ? 'Create' : 'Edit'} ${pageId}`,
            frameTitle: `DokuWiki editor for ${pageId}`,
            extraActions: [nativeEditLink],
            onClose: () => closeNativeEdit(false),
            onFrameLoad: (frame) => {
                // Appending the iframe can fire an initial about:blank load
                // before createDokuWikiActionPopup has returned its handles.
                if (!popup) return;
                if (editBackdrop !== popup.backdrop) return;

                try {
                    const frameWindow = frame.contentWindow;
                    const frameDocument = frame.contentDocument;
                    if (!frameWindow || !frameDocument) return;

                    if (frameDocument.querySelector('#dokuwiki__top.mode_show')) {
                        closeNativeEdit(true);
                        return;
                    }

                    const editForm = frameDocument.querySelector('#dw__editform');
                    if (editForm && !editForm.dataset.infinitePanelsDirtyTracking) {
                        editForm.dataset.infinitePanelsDirtyTracking = 'true';
                        const markDirty = () => { editDirty = true; };
                        editForm.addEventListener('input', markDirty);
                        editForm.addEventListener('change', markDirty);
                    }

                    if (!frameDocument.getElementById('infinitepanels-editor-layout')) {
                        const style = frameDocument.createElement('style');
                        style.id = 'infinitepanels-editor-layout';
                        style.textContent = `
                            #dokuwiki__site { width: 100% !important; max-width: none !important; margin: 0 !important; }
                            #dokuwiki__header, #dokuwiki__pagetools { display: none !important; }
                            #dokuwiki__site > #dokuwiki__top > .wrapper { display: block !important; margin: 0 !important; }
                            #dokuwiki__content { float: none !important; width: 100% !important; max-width: none !important; margin: 0 !important; }
                            #dokuwiki__content > .pad.group { box-sizing: border-box !important; width: 100% !important; max-width: none !important; padding: 1rem !important; }
                            #dokuwiki__content .page.group { width: 100% !important; max-width: none !important; }
                        `;
                        frameDocument.head.appendChild(style);
                    }
                } catch (error) {
                    console.warn('infinitepanels: could not adjust editor popup layout', error);
                }
            }
        });
        editBackdrop = popup.backdrop;
        editPane = pane;
        editTrigger = trigger;
        editComplete = onComplete;
        popup.frame.src = editUrl.href;
        popup.closeButton.focus({ preventScroll: true });
        return true;
    }

    function addPaneControls(pane, pageId, parsedDocument, includePaneActions = true, includeZoomAction = includePaneActions) {
        const topBanner = pane.querySelector('.topBanner');
        let actions = pane.querySelector('.infinitepanels-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'infinitepanels-actions';
        }

        let spineButton = pane.querySelector('.infinitepanels-spine')
            || Array.from(minimizedShelf?.querySelectorAll('.infinitepanels-spine') || [])
                .find((button) => button._infinitePanelsPane === pane);
        if (!spineButton) {
            spineButton = document.createElement('button');
            spineButton.type = 'button';
            spineButton.className = 'infinitepanels-spine';
        }
        spineButton._infinitePanelsPane = pane;
        if (spineButton.parentElement !== pane) pane.prepend(spineButton);
        const pageHeading = pane.querySelector('.fokus-page-title, .page h1, h1.page-title');
        const paneTitle = pageHeading?.textContent.trim() || pageId;
        let spineLabel = spineButton.querySelector('.infinitepanels-spine-label');
        if (!spineLabel) {
            spineLabel = document.createElement('span');
            spineLabel.className = 'infinitepanels-spine-label';
            spineButton.replaceChildren(spineLabel);
        }
        spineLabel.textContent = paneTitle;
        let spinePageId = spineButton.querySelector('.infinitepanels-spine-pageid');
        if (!spinePageId) {
            spinePageId = document.createElement('span');
            spinePageId.className = 'infinitepanels-spine-pageid';
            spineButton.appendChild(spinePageId);
        }
        spinePageId.textContent = normalizePageId(pageId) || pageId;
        spineButton.title = `Show ${paneTitle}`;
        spineButton.setAttribute('aria-label', `Show ${paneTitle}`);
        spineButton.dataset.paneIndex = String(paneElements.indexOf(pane) + 1);
        spineButton.dataset.pageId = normalizePageId(pageId) || pageId;

        const pageTools = pane.dataset.provider === 'wiki' || !pane.dataset.provider ? parsedDocument.querySelector('#dokuwiki__pagetools') : null;
        const pageUrl = pane.dataset.pageUrl || window.location.href;
        const paneToolLinks = [
            {
                name: 'edit',
                label: 'Edit page',
                selector: '.action.edit a, a[href*="do=edit"]',
                icon: 'pen-nib'
            },
            {
                name: 'revisions',
                label: 'Old revisions',
                selector: 'a[href*="do=revisions"]',
                icon: 'clock-counter-clockwise'
            },
            {
                name: 'rename',
                label: 'Rename page',
                selector: '.plugin_move_page a, a.plugin_move_page, a[href*="do=plugin_move"]',
                icon: 'cursor-text'
            }
        ];

        paneToolLinks.forEach((tool) => {
            if (actions.querySelector(`.infinitepanels-tool-${tool.name}`)) return;
            const sourceLink = pageTools?.querySelector(tool.selector);
            const sourceHref = sourceLink?.getAttribute('href');
            if (!sourceLink || (!sourceHref && tool.name !== 'rename')) return;

            const link = document.createElement('a');
            link.className = `infinitepanels-tool infinitepanels-tool-${tool.name}`;
            if (tool.name === 'rename') {
                link.href = pageUrl;
            } else if (tool.name === 'edit' || tool.name === 'revisions') {
                const actionUrl = new URL(`${DOKU_BASE}doku.php`, window.location.origin);
                actionUrl.searchParams.set('do', tool.name);
                actionUrl.searchParams.set('id', pageId);
                link.href = actionUrl.href;
            } else {
                link.href = new URL(sourceHref, pageUrl).href;
            }
            link.title = tool.label;
            link.setAttribute('aria-label', tool.label);

            if (tool.name === 'edit') {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    openNativeEdit(pane, pageId, link);
                });
            }

            if (tool.name === 'revisions') {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    openPagePopup(link.href, pageId, link, 'infinitepanels-revisions-popup-pane');
                });
            }

            if (tool.name === 'rename') {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const moveButton = document.querySelector('#dokuwiki__pagetools .plugin_move_page');
                    if (!moveButton || !window.JSINFO) {
                        window.location.href = pageUrl;
                        return;
                    }

                    const previousId = window.JSINFO.id;
                    const previousRenamePermission = window.JSINFO.move_renameokay;
                    window.JSINFO.id = pageId;
                    window.JSINFO.move_renameokay = true;
                    let dialog = null;
                    let dialogObserver;
                    const restorePageContext = () => {
                        dialogObserver?.disconnect();
                        window.JSINFO.id = previousId;
                        window.JSINFO.move_renameokay = previousRenamePermission;
                    };
                    const findDialog = () => {
                        dialog = document.querySelector('.plugin_move_dialog');
                        if (!dialog) return false;
                        clearTimeout(dialogTimeout);
                        return true;
                    };

                    dialogObserver = new MutationObserver(() => {
                        if (!dialog && !findDialog()) return;
                        if (dialog && (!dialog.isConnected || window.getComputedStyle(dialog).display === 'none')) {
                            restorePageContext();
                        }
                    });
                    dialogObserver.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['style', 'class', 'aria-hidden']
                    });

                    const dialogTimeout = setTimeout(() => {
                        if (!findDialog()) restorePageContext();
                    }, 2000);
                    moveButton.click();
                    findDialog();
                });
            }

            link.appendChild(createPhosphorIcon(tool.icon));
            actions.appendChild(link);
        });

        if (includePaneActions && !actions.querySelector('.infinitepanels-open')) {
            const openButton = document.createElement('button');
            openButton.type = 'button';
            openButton.className = 'infinitepanels-open';
            openButton.title = 'Open page by itself';
            openButton.setAttribute('aria-label', 'Open page by itself');
            openButton.appendChild(createPhosphorIcon('arrow-square-out'));
            if (pane.dataset.provider === 'wikipedia') {
                openButton.title = 'Open original Wikipedia article';
                openButton.setAttribute('aria-label', openButton.title);
            }
            actions.appendChild(openButton);
        }

        if (!actions.querySelector('.infinitepanels-focus-toggle')) {
            const focusButton = document.createElement('button');
            focusButton.type = 'button';
            focusButton.className = 'infinitepanels-focus-toggle';
            focusButton.title = 'Focus on this pane';
            focusButton.setAttribute('aria-label', 'Focus on this pane');
            focusButton.setAttribute('aria-pressed', 'false');
            focusButton.appendChild(createPhosphorIcon('cube-focus'));
            actions.appendChild(focusButton);
        }

        if (includeZoomAction && !actions.querySelector('.infinitepanels-zoom')) {
            const zoomButton = document.createElement('button');
            zoomButton.type = 'button';
            zoomButton.className = 'infinitepanels-zoom';
            zoomButton.title = 'Zoom pane';
            zoomButton.setAttribute('aria-label', 'Zoom pane');
            zoomButton.setAttribute('aria-pressed', 'false');
            zoomButton.appendChild(createPhosphorIcon('magnifying-glass-plus'));
            actions.appendChild(zoomButton);
        }

        if (includePaneActions && !actions.querySelector('.infinitepanels-close')) {
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'infinitepanels-close';
            closeButton.title = 'Close this pane';
            closeButton.setAttribute('aria-label', 'Close this pane');
            closeButton.appendChild(createPhosphorIcon('x-square'));
            actions.appendChild(closeButton);
        }

        if (topBanner) {
            topBanner.classList.add('infinitepanels-pane-minimize-header');
            let rightSide = topBanner.querySelector(':scope > .infinitepanels-header-right');
            if (!rightSide) {
                rightSide = document.createElement('div');
                rightSide.className = 'infinitepanels-header-right';
                topBanner.appendChild(rightSide);
            }
            const titleBlock = topBanner.querySelector(':scope > .fokus-page-heading');
            if (titleBlock) titleBlock.classList.add('infinitepanels-header-title');
            if (!actions.parentElement) rightSide.appendChild(actions);
        } else {
            let toolbar = pane.querySelector('.infinitepanels-pane-toolbar');
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.className = 'infinitepanels-pane-toolbar';
                const title = document.createElement('span');
                title.className = 'infinitepanels-pane-title';
                title.textContent = pageId;
                toolbar.appendChild(title);
                pane.prepend(toolbar);
            }
            toolbar.classList.add('infinitepanels-pane-minimize-header');
            if (!actions.parentElement) toolbar.appendChild(actions);
        }
        pane.dataset.pageId = pageId;
    }

    function createPaneIcon(paths) {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');
        icon.innerHTML = paths;
        return icon;
    }

    // Phosphor Icons Duotone SVG paths, from @phosphor-icons/core (MIT).
    function createPhosphorIcon(name) {
        const icons = {
            'notebook': `<path d="M48,32H176A24,24 0 0 1 200,56V216A8,8 0 0 1 192,224H64A32,32 0 0 1 32,192V48A16,16 0 0 1 48,32Z" opacity="0.2"/><path d="M176,24H48A24,24 0 0 0 24,48V192A40,40 0 0 0 64,232H192A16,16 0 0 0 208,216V56A32,32 0 0 0 176,24ZM40,48A8,8 0 0 1 48,40H176A16,16 0 0 1 192,56V208H64A24,24 0 0 1 40,184ZM192,216H64A24,24 0 0 1 40,192.2 39.7,39.7 0 0 0 64,200H192ZM72,72H160A8,8 0 0 1 160,88H72A8,8 0 0 1 72,72ZM72,112H160A8,8 0 0 1 160,128H72A8,8 0 0 1 72,112ZM72,152H136A8,8 0 0 1 136,168H72A8,8 0 0 1 72,152Z"/>`,
            'text-t': `<path d="M32,40H224V80H144V216H112V80H32Z"/><path d="M40,48H216V72H40Z" opacity="0.2"/>`,
            'magnifying-glass': `<g opacity="0.2"><circle cx="115.99512" cy="116" r="84"/></g><path d="M229.64648,218.34424l-43.2229-43.2229a92.111,92.111,0,1,0-11.31445,11.31347l43.2229,43.2229a8.00018,8.00018,0,1,0,11.31445-11.31347ZM39.99512,116a76,76,0,1,1,76,76A76.08614,76.08614,0,0,1,39.99512,116Z"/>`,
            'magnifying-glass-plus': `<g opacity="0.2"><circle cx="112" cy="112" r="80"/></g><path d="M229.66,218.34,179.6,168.28a88.21,88.21,0,1,0-11.32,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/><path d="M112 80a8 8 0 0 1 8 8v16h16a8 8 0 0 1 0 16h-16v16a8 8 0 0 1-16 0v-16H88a8 8 0 0 1 0-16h16V88a8 8 0 0 1 8-8Z"/>`,
            'pen-nib': `<path d="M128,48,68.32,70.38a8,8,0,0,0-5.08,6.17L40,216l139.45-23.24a8,8,0,0,0,6.17-5.08L208,128Zm-4,104a20,20,0,1,1,20-20A20,20,0,0,1,124,152Z" opacity="0.2"/><path d="M248,92.68a15.86,15.86,0,0,0-4.69-11.31L174.63,12.68a16,16,0,0,0-22.63,0L123.57,41.11l-58,21.77A16.06,16.06,0,0,0,55.35,75.23L32.11,214.68A8,8,0,0,0,40,224a8.4,8.4,0,0,0,1.32-.11l139.44-23.24a16,16,0,0,0,12.35-10.17l21.77-58L243.31,104A15.87,15.87,0,0,0,248,92.68Zm-69.87,92.19L63.32,204l47.37-47.37a28,28,0,1,0-11.32-11.32L52,192.7,71.13,77.86,126,57.29,198.7,130ZM112,132a12,12,0,1,1,12,12A12,12,0,0,1,112,132Zm96-15.32L139.31,48l24-24L232,92.68Z"/>`,
            'clock-counter-clockwise': `<path d="M216,128a88,88,0,1,1-88-88A88,88,0,0,1,216,128Z" opacity="0.2"/><path d="M136,80v43.47l36.12,21.67a8,8,0,0,1-8.24,13.72l-40-24A8,8,0,0,1,120,128V80a8,8,0,0,1,16,0Zm-8-48A95.44,95.44,0,0,0,60.08,60.15C52.81,67.51,46.35,74.59,40,82V64a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H72a8,8,0,0,0,0-16H49c7.15-8.42,14.27-16.35,22.39-24.57a80,80,0,1,1,1.66,114.75,8,8,0,1,0-11,11.64A96,96,0,1,0,128,32Z"/>`,
            'cursor-text': `<path d="M176,48V208H160a32,32,0,0,1-32-32,32,32,0,0,1-32,32H80V48H96a32,32,0,0,1,32,32,32,32,0,0,1,32-32Z" opacity="0.2"/><path d="M184,208a8,8,0,0,1-8,8H160a40,40,0,0,1-32-16,40,40,0,0,1-32,16H80a8,8,0,0,1,0-16H96a24,24,0,0,0,24-24V136H104a8,8,0,0,1,0-16h16V80A24,24,0,0,0,96,56H80a8,8,0,0,1,0-16H96a40,40,0,0,1,32,16,40,40,0,0,1,32-16h16a8,8,0,0,1,0,16H160a24,24,0,0,0-24,24v40h16a8,8,0,0,1,0,16H136v40a24,24,0,0,0,24,24h16A8,8,0,0,1,184,208Z"/>`,
            'arrow-square-out': `<path d="M184,80V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V80a8,8,0,0,1,8-8H176A8,8,0,0,1,184,80Z" opacity="0.2"/><path d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z"/>`,
            'arrows-out': `<path d="M208,48V208H48V48Z" opacity="0.2"/><path d="M216,48V96a8,8,0,0,1-16,0V67.31l-42.34,42.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48ZM98.34,146.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l42.35-42.34a8,8,0,0,0-11.32-11.32ZM208,152a8,8,0,0,0-8,8v28.69l-42.34-42.35a8,8,0,0,0-11.32,11.32L188.69,200H160a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V160A8,8,0,0,0,208,152ZM67.31,56H96a8,8,0,0,0,0-16H48a8,8,0,0,0-8,8V96a8,8,0,0,0,16,0V67.31l42.34,42.35a8,8,0,0,0,11.32-11.32Z"/>`,
            'arrows-in': `<path d="M224,48V208a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48Z" opacity="0.2"/><path d="M144,104V64a8,8,0,0,1,16,0V84.69l42.34-42.35a8,8,0,0,1,11.32,11.32L171.31,96H192a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm-40,40H64a8,8,0,0,0,0,16H84.69L42.34,202.34a8,8,0,0,0,11.32,11.32L96,171.31V192a8,8,0,0,0,16,0V152A8,8,0,0,0,104,144Zm67.31,16H192a8,8,0,0,0,0-16H152a8,8,0,0,0-8,8v40a8,8,0,0,0,16,0V171.31l42.34,42.35a8,8,0,0,0,11.32-11.32ZM104,56a8,8,0,0,0-8,8V84.69L53.66,42.34A8,8,0,0,0,42.34,53.66L84.69,96H64a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V64A8,8,0,0,0,104,56Z"/>`,
            'cube-focus': `<path d="M184,96v64l-56,32L72,160V96l56-32Z" opacity="0.2"/><path d="M232,48V88a8,8,0,0,1-16,0V56H184a8,8,0,0,1,0-16h40A8,8,0,0,1,232,48ZM72,200H40V168a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H72a8,8,0,0,0,0-16Zm152-40a8,8,0,0,0-8,8v32H184a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V168A8,8,0,0,0,224,160ZM32,96a8,8,0,0,0,8-8V56H72a8,8,0,0,0,0-16H32a8,8,0,0,0-8,8V88A8,8,0,0,0,32,96ZM188,167l-56,32a8,8,0,0,1-7.94,0L68,167A8,8,0,0,1,64,160V96a8,8,0,0,1,4-7l56-32a8,8,0,0,1,7.94,0l56,32a8,8,0,0,1,4,7v64A8,8,0,0,1,188,167ZM88.12,96,128,118.79,167.88,96,128,73.21ZM80,155.36l40,22.85V132.64L80,109.79Zm96,0V109.79l-40,22.85v45.57Z"/>`,
            'book-open-text': `<path d="M232,56V200H160a32,32,0,0,0-32,32V88a32,32,0,0,1,32-32Z" opacity="0.2"/><path d="M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64ZM160,88h40a8,8,0,0,1,0,16H160a8,8,0,0,1,0-16Zm48,40a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h40A8,8,0,0,1,208,128Zm0,32a8,8,0,0,1-8,8H160a8,8,0,0,1,0-16h40A8,8,0,0,1,208,160Z"/>`,
            'x-square': `<path d="M216,48V208a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V48a8,8,0,0,1,8-8H208A8,8,0,0,1,216,48Z" opacity="0.2"/><path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H208V208ZM165.66,101.66,139.31,128l26.35,26.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32Z"/>`,
            'trash': `<path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56Z" opacity="0.2"/><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/>`
        };
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 256 256');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');
        icon.classList.add('phosphor-duotone');
        icon.innerHTML = icons[name] || '';
        return icon;
    }

    function updatePaneIndexes() {
        paneElements.forEach((pane, index) => {
            pane.dataset.paneIndex = String(index + 1);
            pane.setAttribute('aria-label', `${pane.dataset.provider === 'wikipedia' ? 'Wikipedia article' : 'Wiki page'} ${pane.dataset.pageId || ''}, pane ${index + 1}`);
            const spine = pane.querySelector('.infinitepanels-spine')
                || Array.from(minimizedShelf?.querySelectorAll('.infinitepanels-spine') || [])
                    .find((button) => button._infinitePanelsPane === pane);
            if (spine) spine.dataset.paneIndex = String(index + 1);
        });
        if (focusedPaneIndex >= paneElements.length) focusedPaneIndex = Math.max(0, paneElements.length - 1);
        for (const index of focusedPaneIndexes) {
            if (index >= paneElements.length) focusedPaneIndexes.delete(index);
        }
        if (paneElements.length === 1 && document.body.classList.contains('infinitepanels-focused')) {
            focusedPaneIndex = 0;
            focusedPaneIndexes.clear();
            focusedPaneIndexes.add(0);
        }
        if (document.body.classList.contains('infinitepanels-focused')
            && focusedPaneIndexes.size > 0
            && !focusedPaneIndexes.has(focusedPaneIndex)) {
            focusedPaneIndex = focusedPaneIndexes.values().next().value;
        }
        updateFocusedLayout();
    }

    function initializeAdapters(pane, pageId, parsedDocument) {
        if (pane.dataset.provider !== 'wiki' && pane.dataset.provider) return;
        if (pageId && window.InfinitePanelsAdapters?.annotations) {
            window.InfinitePanelsAdapters.annotations.init(pageId, pane, parsedDocument);
        }
        executeInfinitePanelsScripts(pane);
        window.InfinitePanelsAdapters?.katex?.init(pane);
    }

    async function loadPane(pane, url, pageId, expectedVersion) {
        const provider = window.FokusPaneProviders.forId(pageId);
        if (!provider) throw new Error('Unsupported content provider');
        const result = await provider.load(pageId, url);
        if (expectedVersion !== navigationVersion || !pane.isConnected || pane.dataset.pageId !== pageId) return false;
        const { parsedDocument } = result;
        pane.dataset.pageUrl = result.url;
        pane.dataset.provider = result.provider;
        pane.replaceChildren(result.content);
        pane.dataset.pageId = pageId;
        addPaneControls(pane, pageId, parsedDocument);
        updateFocusedLayout();
        initializeAdapters(pane, pageId, parsedDocument);
        refreshOpenPageLinks();
        const hash = new URL(url, location.href).hash.slice(1);
        if (hash) {
            let fragment = hash;
            try { fragment = decodeURIComponent(hash); } catch (_) { /* Preserve malformed fragments. */ }
            const destination = Array.from(pane.querySelectorAll('[id]')).find(node => node.id === fragment || node.dataset.originalId === fragment);
            destination?.scrollIntoView({ block: 'start' });
        }
        updatePaneIndexes();
        return true;
    }

    async function openPaneAfter(parentIndex, url, pageId = null, persistUrl = true, expectedVersion = navigationVersion) {
        const resolvedPageId = pageId || pageIdForUrl(url);
        if (!resolvedPageId) return;
        const existingPageIndex = findOpenPageIndex(resolvedPageId);
        if (existingPageIndex >= 0) {
            focusOpenPage(existingPageIndex, url, parentIndex, persistUrl);
            return;
        }
        // Open or update the slot immediately after parentIndex. Callers pass
        // the last pane when they want to append; panes farther right stay put.
        const targetIndex = parentIndex + 1;
        let pane = paneElements[targetIndex];
        if (pane) {
            window.InfinitePanelsAdapters?.annotations?.destroy(pane);
        } else {
            pane = document.createElement('section');
            pane.className = 'infinitepanels-pane infinitepanels-pane-secondary';
            pane.dataset.pageId = resolvedPageId;
            panes.appendChild(pane);
            paneElements.push(pane);
        }
        pane.dataset.pageId = resolvedPageId;
        pane.classList.remove('infinitepanels-pane-minimized');
        focusedPaneIndex = targetIndex;
        if (document.body.classList.contains('infinitepanels-focused')) {
            if (parentIndex >= 0) focusedPaneIndexes.add(parentIndex);
            focusedPaneIndexes.add(targetIndex);
        }
        updatePaneIndexes();
        refreshOpenPageLinks();
        activatePanelMode();
        viewport.scrollTo({
            left: document.body.classList.contains('infinitepanels-focused')
                ? (paneElements[parentIndex]?.offsetLeft || 0)
                : pane.offsetLeft,
            behavior: 'smooth'
        });
        pane.scrollTop = 0;

        try {
            const loaded = await loadPane(pane, url, resolvedPageId, expectedVersion);
            if (loaded && pane.dataset.provider === 'wiki') window.fokusRegisterRecentPage?.(resolvedPageId);
            if (loaded && persistUrl && expectedVersion === navigationVersion) saveUrlState();
        } catch (error) {
            if (expectedVersion !== navigationVersion || !pane.isConnected) return;
            pane.dataset.provider = window.FokusPaneProviders.forId(resolvedPageId)?.name || 'wiki';
            const fallback = document.implementation.createHTMLDocument();
            const pad = document.createElement('div'); pad.className = 'pad group';
            const header = document.createElement('div'); header.className = 'topBanner';
            const heading = document.createElement('div'); heading.className = 'fokus-page-heading';
            const title = document.createElement('span'); title.className = 'fokus-page-title'; title.textContent = resolvedPageId;
            heading.appendChild(title); header.appendChild(heading);
            const message = document.createElement('p'); message.className = 'infinitepanels-error'; message.textContent = error.message || 'Could not load this page.';
            const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
            retry.addEventListener('click', async () => {
                retry.disabled = true;
                try {
                    const loaded = await loadPane(pane, url, resolvedPageId, navigationVersion);
                    if (loaded) saveUrlState();
                } catch (retryError) { message.textContent = retryError.message; }
                finally { retry.disabled = false; }
            });
            pad.append(header, message, retry); pane.replaceChildren(pad);
            addPaneControls(pane, resolvedPageId, fallback);
            updateFocusedLayout();
            console.error('infinitepanels: failed to load page', error);
        }
    }

    async function openPagePopup(url, pageId, trigger, paneClass = '') {
        if (!pageId) return;

        const pane = document.createElement('section');
        pane.className = 'infinitepanels-pane infinitepanels-pane-secondary infinitepanels-popup-pane';
        if (paneClass) pane.classList.add(paneClass);
        pane.dataset.pageId = pageId;
        pane.innerHTML = '<p class="infinitepanels-loading">Loading…</p>';
        const expectedVersion = ++navigationVersion;
        toggleZoomPane(pane, trigger, true);

        try {
            const loaded = await loadPane(pane, url, pageId, expectedVersion);
            if (loaded && zoomPane === pane) setZoomButtonState(pane, true);
        } catch (error) {
            if (!pane.isConnected) return;
            pane.innerHTML = '<p class="infinitepanels-error">Could not load this page.</p>';
            console.error('infinitepanels: failed to load page popup', error);
        }
    }

    function closeAfter(index, persistUrl = true) {
        if (zoomPane && paneElements.indexOf(zoomPane) > index) closeZoomPane(false);
        while (paneElements.length > index + 1) {
            const removed = paneElements.pop();
            window.InfinitePanelsAdapters?.annotations?.destroy(removed);
            minimizedShelf?.querySelectorAll('.infinitepanels-spine').forEach((button) => {
                if (button._infinitePanelsPane === removed) button.remove();
            });
            removed.remove();
        }
        updatePaneIndexes();
        refreshOpenPageLinks();
        if (persistUrl) saveUrlState();
    }

    function closePane(index, persistUrl = true) {
        if (index <= 0 || index >= paneElements.length) return;
        const [removed] = paneElements.splice(index, 1);
        if (index < focusedPaneIndex) focusedPaneIndex--;
        else if (index === focusedPaneIndex) focusedPaneIndex = Math.max(0, index - 1);
        const adjustedFocusedPaneIndexes = Array.from(focusedPaneIndexes, (focusedIndex) => {
            if (focusedIndex === index) return null;
            return focusedIndex > index ? focusedIndex - 1 : focusedIndex;
        }).filter((focusedIndex) => focusedIndex !== null);
        focusedPaneIndexes.clear();
        adjustedFocusedPaneIndexes.forEach((focusedIndex) => focusedPaneIndexes.add(focusedIndex));
        minimizedShelf?.querySelectorAll('.infinitepanels-spine').forEach((button) => {
            if (button._infinitePanelsPane === removed) button.remove();
        });
        window.InfinitePanelsAdapters?.annotations?.destroy(removed);
        removed.remove();
        updatePaneIndexes();
        refreshOpenPageLinks();
        if (persistUrl) saveUrlState();
    }

    function closeRootPane() {
        if (paneElements.length <= 1) {
            window.location.href = startPageId
                ? infinitePanelsUrlFromId(startPageId)
                : DOKU_BASE;
            return;
        }

        const wasFocused = document.body.classList.contains('infinitepanels-focused');
        const nextFocusedIndex = wasFocused
            ? (focusedPaneIndex === 0 ? 0 : focusedPaneIndex - 1)
            : -1;
        const url = new URL(window.location.href);
        if (paneElements[1].dataset.provider === 'wikipedia') {
            const landing = new URL(infinitePanelsUrlFromId(startPageId || currentPageId), location.origin);
            paneElements.slice(1).forEach(pane => landing.searchParams.append(
                pane.classList.contains('infinitepanels-pane-minimized') ? 'm' : 'p', pane.dataset.pageId));
            window.location.href = landing.href;
            return;
        }
        const rootUrl = new URL(infinitePanelsUrlFromId(paneElements[1].dataset.pageId), window.location.origin);
        url.pathname = rootUrl.pathname;
        url.searchParams.delete('id');
        ['p', 'm', 'f'].forEach((parameter) => url.searchParams.delete(parameter));
        url.hash = '';

        paneElements.slice(1).forEach((pane, oldIndex) => {
            const index = oldIndex;
            const isFocusAnchor = wasFocused && index === nextFocusedIndex;
            const isMinimized = pane.classList.contains('infinitepanels-pane-minimized')
                || (wasFocused && !focusedPaneIndexes.has(oldIndex + 1));
            const state = isFocusAnchor ? 'f' : (isMinimized ? 'm' : (index > 0 ? 'p' : ''));
            if (state) url.searchParams.append(state, pane.dataset.pageId);
        });

        const query = url.searchParams.toString().replace(/(^|&)([pmf])=([^&]*)/g, (_match, prefix, parameter, value) => {
            return `${prefix}${parameter}=${value.replace(/%3A/gi, ':')}`;
        });
        window.location.href = `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
    }

    function paneStateFromUrl() {
        const params = new URL(window.location.href).searchParams;
        const rootId = normalizePageId(currentPageId);
        const paneStates = new Map();
        Array.from(params.entries()).forEach(([state, rawPageId]) => {
            if (!['p', 'm', 'f'].includes(state)) return;
            const pageId = normalizePageId(rawPageId);
            if (!pageId) return;
            paneStates.set(pageId, state);
        });
        const ids = Array.from(paneStates.keys()).filter((pageId) => pageId !== rootId);
        const minimizedIds = new Set(Array.from(paneStates)
            .filter(([, state]) => state === 'm')
            .map(([pageId]) => pageId));
        const focusId = Array.from(paneStates)
            .find(([, state]) => state === 'f')?.[0] || '';
        const knownIds = new Set([normalizePageId(currentPageId), ...ids]);
        return {
            ids,
            minimizedIds: new Set(Array.from(minimizedIds).filter((pageId) => knownIds.has(pageId))),
            focusId: focusId && knownIds.has(focusId) ? focusId : ''
        };
    }

    async function restorePanesFromUrl() {
        const expectedVersion = ++navigationVersion;
        const state = paneStateFromUrl();
        const { ids } = state;

        document.body.classList.remove('infinitepanels-focused');
        focusedPaneIndexes.clear();
        paneElements.forEach((pane) => pane.classList.remove('infinitepanels-pane-minimized'));
        updateFocusedLayout();

        let matching = 0;
        while (matching < ids.length && paneElements[matching + 1]?.dataset.pageId === ids[matching]) {
            matching++;
        }
        closeAfter(matching, false);
        for (let index = matching; index < ids.length; index++) {
            if (expectedVersion !== navigationVersion) return;
            await openPaneAfter(index, infinitePanelsUrlFromId(ids[index]), ids[index], false, expectedVersion);
        }
        if (expectedVersion !== navigationVersion) return;

        const focusIndex = state.focusId
            ? paneElements.findIndex((pane) => normalizePageId(pane.dataset.pageId) === state.focusId)
            : -1;
        paneElements.forEach((pane, index) => {
            const pageId = normalizePageId(pane.dataset.pageId);
            const minimized = state.minimizedIds.has(pageId);
            pane.classList.toggle('infinitepanels-pane-minimized', minimized);
            if (focusIndex >= 0 && !minimized) focusedPaneIndexes.add(index);
        });

        if (focusIndex >= 0) {
            focusedPaneIndex = focusIndex;
            document.body.classList.add('infinitepanels-focused');
        } else {
            focusedPaneIndex = 0;
        }
        updateFocusedLayout();
        if (focusIndex >= 0) ensurePaneVisible(paneElements[focusIndex]);
        else if (viewport) viewport.scrollTo({ left: 0, behavior: 'smooth' });
    }

    function isIncludeSectionLink(anchor) {
        return Boolean(anchor?.closest('.plugin_include_content')
            && anchor.parentElement?.matches('h1, h2, h3, h4, h5, h6'));
    }

    function isEligibleLink(anchor) {
        if (!anchor || anchor.closest('#fokus-search-dialog')) return false;
        if (window.FokusPaneProviders.fromLink(anchor)) return true;
        if (!anchor.classList.contains('wikilink1')
            && !anchor.classList.contains('wikilink2')
            && !isIncludeSectionLink(anchor)) return false;
        if (anchor.classList.contains('media') || anchor.classList.contains('interwiki')) return false;
        if (anchor.target === '_blank') return false;
        try {
            return new URL(anchor.href, window.location.origin).origin === window.location.origin;
        } catch (_error) {
            return false;
        }
    }

    content.addEventListener('click', (event) => {
        const clickedElement = event.target instanceof Element ? event.target : event.target.parentElement;
        const button = clickedElement?.closest('button');
        if (button) {
            const pane = button.closest('.infinitepanels-pane')
                || (button.matches('.infinitepanels-zoom') ? pageContent : null);
            const paneIndex = paneElements.indexOf(pane);
            const index = paneIndex >= 0
                ? paneIndex
                : Number.parseInt(button.dataset.paneIndex || '', 10) - 1;
            if (button.matches('.infinitepanels-focus-toggle')) {
                toggleFocusedView(index);
                return;
            }
            if (button.matches('.infinitepanels-spine')) {
                focusPaneFromSpine(index);
                return;
            }
            if (button.matches('.infinitepanels-open')) {
                if (zoomPane === pane) closeZoomPane(false);
                if (pane.dataset.provider === 'wikipedia') {
                    window.open(pane.dataset.pageUrl, '_blank', 'noopener,noreferrer');
                    return;
                }
                window.location.href = pane.dataset.pageUrl
                    || infinitePanelsUrlFromId(pane.dataset.pageId);
                return;
            }
            if (button.matches('.infinitepanels-zoom')) {
                toggleZoomPane(pane, button);
                return;
            }
            if (button.matches('.infinitepanels-close')) {
                navigationVersion++;
                if (zoomPane === pane) {
                    closeZoomPane(false);
                }
                if (index === 0) closeRootPane();
                else closePane(index);
                return;
            }
        }

        const minimizeHeader = clickedElement?.closest('.infinitepanels-pane-minimize-header');
        const headerPane = minimizeHeader?.closest('.infinitepanels-pane');
        const headerPaneIndex = paneElements.indexOf(headerPane);
        const clickedInteractiveControl = clickedElement?.closest(
            'a, button, input, select, textarea, summary, [role="button"], [contenteditable="true"]'
        );
        if (minimizeHeader && headerPaneIndex >= 0 && !clickedInteractiveControl) {
            togglePaneMinimized(headerPaneIndex);
            return;
        }

        const anchor = event.target.closest('a');
        const isCloudTag = anchor?.closest('.cloud') && anchor.matches('a[class*="_tag"]');
        const isPageTag = anchor?.relList.contains('tag');
        if ((isCloudTag || isPageTag)
            && event.button === 0
            && !event.metaKey
            && !event.ctrlKey
            && !event.altKey
            && !event.shiftKey
            && !anchor.target) {
            try {
                if (new URL(anchor.href, window.location.href).origin === window.location.origin) {
                    const target = new URL(anchor.href, window.location.href);
                    const tag = target.searchParams.get('tag') || anchor.title || '';
                    if (tag && typeof window.fokusSidebarOpenTag === 'function') {
                        event.preventDefault();
                        window.fokusSidebarOpenTag(tag);
                        return;
                    }
                }
            } catch (_error) {
                // Let malformed or non-web tag links follow their normal behavior.
            }
        }
        if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
        const wikipediaPane = anchor.closest('.infinitepanels-pane[data-provider="wikipedia"]');
        if (wikipediaPane && anchor.closest('.mw-ref, sup.reference')) { event.preventDefault(); return; }
        if (wikipediaPane && anchor.getAttribute('href')?.startsWith('#')) {
            const destination = document.getElementById(anchor.getAttribute('href').slice(1));
            if (destination && wikipediaPane.contains(destination)) {
                event.preventDefault();
                destination.scrollIntoView({ block: 'start', behavior: 'smooth' });
                const fragment = destination.dataset.originalId;
                if (fragment) {
                    wikipediaPane.dataset.pageId = wikipediaPane.dataset.pageId.split('#')[0] + '#' + fragment;
                    wikipediaPane.dataset.pageUrl = infinitePanelsUrlFromId(wikipediaPane.dataset.pageId);
                    saveUrlState();
                }
            }
            return;
        }
        if (!isEligibleLink(anchor)) return;
        const sourcePane = anchor.closest('.infinitepanels-pane');
        const isPopupPane = sourcePane?.classList.contains('infinitepanels-popup-pane');
        const sourceIndex = isPopupPane
            ? paneElements.length - 1
            : (sourcePane ? paneElements.indexOf(sourcePane) : -1);
        if (sourceIndex < 0) return;
        if (zoomPane === sourcePane) closeZoomPane(false);
        const provided = window.FokusPaneProviders.fromLink(anchor);
        if (provided) {
            if (event.shiftKey) return;
            event.preventDefault();
            openPaneAfter(paneElements.length - 1, provided.url, provided.id, true, ++navigationVersion);
            return;
        }

        // The configured start page is a landing page, not a persistent pane.
        // Let its first navigation load normally so the selected page replaces it.
        if (startPageId
            && paneElements.length === 1
            && normalizePageId(currentPageId) === normalizePageId(startPageId)) {
            return;
        }

        const targetPageId = pageIdForLink(anchor);
        const existingPageIndex = findOpenPageIndex(targetPageId);
        if (existingPageIndex >= 0) {
            event.preventDefault();
            focusOpenPage(existingPageIndex, anchor.href, sourceIndex, true);
            return;
        }
        if (isPopupPane) {
            event.preventDefault();
            const expectedVersion = ++navigationVersion;
            openPaneAfter(
                paneElements.length - 1,
                anchor.href,
                targetPageId || null,
                true,
                expectedVersion
            );
            return;
        }
        if (paneElements.length > 1) {
            event.preventDefault();
            const expectedVersion = ++navigationVersion;
            openPaneAfter(
                paneElements.length - 1,
                anchor.href,
                targetPageId || null,
                true,
                expectedVersion
            );
            return;
        }
        if (event.shiftKey) {
            event.preventDefault();
            window.location.href = anchor.href;
            return;
        }
        event.preventDefault();
        const expectedVersion = ++navigationVersion;
        openPaneAfter(sourceIndex, anchor.href, targetPageId || null, true, expectedVersion);
    });

    async function openInInfinitePanels(url, persistUrl = true, pageId = null) {
        const resolvedPageId = normalizePageId(pageId || pageIdForUrl(url));
        if (!resolvedPageId) return;
        const expectedVersion = persistUrl ? ++navigationVersion : navigationVersion;
        return openPaneAfter(paneElements.length - 1, url, resolvedPageId, persistUrl, expectedVersion);
    }
    window.infinitePanelsCloseAllAdditionalPanes = function () {
        if (paneElements.length < 2) return;
        navigationVersion++;
        closeAfter(0);
    };
    window.infinitepanelsOpenInRightPanel = openInInfinitePanels;
    window.infinitepanelsOpenPage = openInInfinitePanels;
    window.fokusCreatePage = (pageId, trigger, onComplete) => openNativeEdit(null, pageId, trigger, onComplete);
    window.addEventListener('resize', updatePaneHeight, { passive: true });
    window.addEventListener('popstate', restorePanesFromUrl);
    createPanelLayout();
    document.body.classList.add('infinitepanels-ready');
    refreshOpenPageLinks();
    restorePanesFromUrl();
});
