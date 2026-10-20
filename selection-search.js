(function () {
    'use strict';
    const annotationTips = '#ann-tooltip, #infinitepanels-ann-tooltip';
    const toolbarSelector = annotationTips + ', #fokus-selection-search';
    const excluded = 'input, textarea, select, button, [contenteditable="true"], .ann-panel, .ann-new-form, .infinitepanels-ann-ui, .toc, .docInfo';
    let pending = null;
    let timer = null;

    function elementFor(node) {
        return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    }

    function captureSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
        const range = selection.getRangeAt(0);
        const start = elementFor(range.startContainer);
        const end = elementFor(range.endContainer);
        if (!start || !end || start.closest(excluded) || end.closest(excluded)) return null;
        const root = start.closest('.page, .fokus-preview-body');
        if (!root || !root.contains(range.commonAncestorContainer)
            || !root.closest('#dokuwiki__content, .fokus-preview-window')) return null;
        const text = selection.toString().replace(/\s+/g, ' ').trim();
        if (!text) return null;
        const provider = start.closest('[data-provider="wikipedia"]');
        const articleUrl = provider?.dataset.pageUrl || provider?.querySelector('.fokus-page-title, .fokus-preview-title')?.href;
        let language = 'en';
        if (articleUrl) {
            try { language = /^([a-z][a-z0-9-]*)\.(?:m\.)?wikipedia\.org$/.exec(new URL(articleUrl).hostname)?.[1] || language; }
            catch (_) { /* Keep the default Wikipedia edition. */ }
        }
        return { text, language, rect: range.getBoundingClientRect() };
    }

    function dismiss() {
        document.querySelectorAll(toolbarSelector).forEach(tip => tip.remove());
        pending = null;
    }

    function searchIcon(kind) {
        const image = document.createElement('img');
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.draggable = false;
        image.src = kind === 'wiki'
            ? window.FokusSearchConfig.templateBase + 'sidebar/icons/magnifying-glass-duotone.svg'
            : DOKU_BASE + 'lib/images/interwiki/wp.svg';
        return image;
    }

    function decorate(tip) {
        if (!pending) return;
        if (tip.dataset.fokusSelectionQuery === pending.text && tip.dataset.fokusSelectionLanguage === pending.language) return;
        tip.querySelectorAll('.fokus-selection-search-action').forEach(button => button.remove());
        tip.dataset.fokusSelectionQuery = pending.text;
        tip.dataset.fokusSelectionLanguage = pending.language;
        tip.dataset.fokusSelectionToolbar = 'true';
        // Capture the query now; clicking the toolbar can collapse the selection.
        const selection = pending;
        for (const kind of ['wiki', 'wikipedia']) {
            const button = document.createElement(kind === 'wiki' ? 'button' : 'a');
            if (kind === 'wiki') button.type = 'button';
            else {
                const url = new URL('https://' + selection.language + '.wikipedia.org/w/index.php');
                url.searchParams.set('search', selection.text);
                button.href = url.href;
                button.target = '_blank';
                button.rel = 'noopener noreferrer';
            }
            button.className = 'fokus-selection-search-action';
            button.dataset.searchTarget = kind;
            button.title = kind === 'wiki' ? 'Search in wiki' : 'Search in Wikipedia';
            button.setAttribute('aria-label', button.title);
            button.appendChild(searchIcon(kind));
            button.addEventListener('mousedown', event => event.preventDefault());
            button.addEventListener('click', event => {
                const wikipedia = kind === 'wikipedia' ? window.FokusPaneProviders?.forId('wp.en.search') : null;
                const target = wikipedia?.searchTarget?.(selection.text, selection.language);
                const usePane = target && typeof window.infinitepanelsOpenPage === 'function';
                if (kind === 'wiki' || usePane) event.preventDefault();
                event.stopPropagation();
                dismiss();
                if (kind === 'wiki') {
                    if (window.FokusSearch?.open) window.FokusSearch.open(selection.text, { provider: 'wiki' });
                    else {
                        const url = new URL(DOKU_BASE + 'doku.php', location.origin);
                        url.search = new URLSearchParams({ do: 'search', q: selection.text });
                        location.href = url.href;
                    }
                } else if (usePane) {
                    window.infinitepanelsOpenPage(target.url, true, target.id);
                }
            });
            tip.appendChild(button);
        }
    }

    function show() {
        if (!pending) return;
        let tip = document.querySelector(annotationTips);
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'fokus-selection-search';
            document.body.appendChild(tip);
        }
        decorate(tip);
        const { rect } = pending;
        const margin = 8;
        const left = Math.max(margin, Math.min(rect.left, innerWidth - tip.offsetWidth - margin));
        let top = rect.bottom + 6;
        if (top + tip.offsetHeight > innerHeight - margin) top = rect.top - tip.offsetHeight - 6;
        tip.style.left = (left + scrollX) + 'px';
        tip.style.top = (Math.max(margin, top) + scrollY) + 'px';
    }

    function selectionEnded(event) {
        if (elementFor(event.target)?.closest(toolbarSelector)) return;
        clearTimeout(timer);
        document.getElementById('fokus-selection-search')?.remove();
        // Read after the annotation handlers so their button remains intact.
        timer = setTimeout(() => {
            pending = captureSelection();
            if (pending) show();
        }, event.type === 'touchend' ? 60 : 0);
    }

    document.addEventListener('mouseup', selectionEnded, true);
    document.addEventListener('touchend', selectionEnded, true);
    document.addEventListener('keyup', event => {
        if (event.key === 'Shift' || (event.shiftKey && event.key.startsWith('Arrow'))) selectionEnded(event);
    });
    document.addEventListener('mousedown', event => {
        if (!elementFor(event.target)?.closest(toolbarSelector)) {
            clearTimeout(timer);
            document.getElementById('fokus-selection-search')?.remove();
            pending = null;
        }
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { clearTimeout(timer); dismiss(); }
    });
    // Annotation tooltips are created by either the plugin or its pane adapter.
    new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
            if (node instanceof Element && node.matches(annotationTips)) decorate(node);
        }
    }).observe(document.body, { childList: true });
})();
