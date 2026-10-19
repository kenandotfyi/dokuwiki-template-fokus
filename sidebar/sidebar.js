import { FileTree } from '@pierre/trees';

const config = window.FokusSidebarConfig;
const sidebar = document.getElementById('fokus-sidebar');

if (config && sidebar) initializeSidebar();

function initializeSidebar() {
    const panels = Object.fromEntries(['files', 'tags'].map(view => [view, document.getElementById(`fokus-${view}-panel`)]));
    const tabs = [...sidebar.querySelectorAll('[data-view]')];
    const host = document.getElementById('fokus-file-tree');
    const tagList = document.getElementById('fokus-tag-list');
    const filter = document.getElementById('fokus-sidebar-filter');
    const filterArea = document.getElementById('fokus-sidebar-filter-area');
    const filterToggle = sidebar.querySelector('.fokus-sidebar-filter-toggle');
    const navigation = sidebar.querySelector('.fokus-sidebar-navigation');
    const navigationLeft = sidebar.querySelector('.fokus-sidebar-navigation-left');
    const wikiActions = sidebar.querySelector('.fokus-sidebar-actions');
    const pinnedList = document.getElementById('fokus-pinned-list');
    const pinnedEmpty = document.getElementById('fokus-pinned-empty');
    const pinnedStatus = document.getElementById('fokus-pinned-status');
    const pinCurrent = document.getElementById('fokus-pin-current');
    const recentsSection = document.getElementById('fokus-recents-section');
    const recentsList = document.getElementById('fokus-recents-list');
    const contentRecentsSection = document.getElementById('fokus-content-recents-section');
    const contentRecentsList = document.getElementById('fokus-content-recents-list');
    const createFile = document.getElementById('fokus-create-file');
    const toggleNamespaces = document.getElementById('fokus-toggle-namespaces');
    const createDialog = document.getElementById('fokus-new-page-dialog');
    const createForm = document.getElementById('fokus-new-page-form');
    const createName = document.getElementById('fokus-new-page-name');
    const createError = document.getElementById('fokus-new-page-error');
    const createSubmit = createForm.querySelector('[type="submit"]');
    let creating = false;
    let createVersion = 0;
    const fileMenu = document.getElementById('fokus-file-menu');
    const actionDialog = document.getElementById('fokus-file-action-dialog');
    const actionForm = document.getElementById('fokus-file-action-form');
    const actionTitle = document.getElementById('fokus-file-action-title');
    const actionDescription = document.getElementById('fokus-file-action-description');
    const actionName = document.getElementById('fokus-file-action-name');
    const actionNameField = document.getElementById('fokus-file-action-name-field');
    const actionError = document.getElementById('fokus-file-action-error');
    const actionSubmit = document.getElementById('fokus-file-action-submit');
    const actionCancel = document.getElementById('fokus-file-action-cancel');
    let menuContext = null;
    let actionTarget = null;
    let actionRunning = false;
    let actionVersion = 0;
    let actionResult = null;
    let actionOrigin = null;
    const count = document.getElementById('fokus-sidebar-count');
    const healthCount = document.getElementById('fokus-sidebar-health');
    let pageHealth = new Map();
    let recentPages = [];
    let recentWriteVersion = 0;
    let recentWriteQueue = Promise.resolve();
    let matchingPages = [];
    const toggle = document.querySelector('.fokus-sidebar-toggle');
    const resizer = sidebar.querySelector('.fokus-sidebar-resizer');
    const narrow = window.matchMedia('(max-width: 800px)');
    let state;
    try { state = JSON.parse(localStorage.getItem(config.storageKey)) || {}; } catch { state = {}; }
    if (!state || typeof state !== 'object' || Array.isArray(state)) state = {};
    let pinnedIds = [];
    let pinsLoaded = false;
    let pinsCanWrite = false;
    let pinsBusy = false;
    let view = state.view === 'tags' ? 'tags' : 'files';
    let activePageId = config.pageId;
    let tree;
    let pagesByPath = new Map();
    let pagesById = new Map();
    let directories = new Set();
    let labelsByPath = new Map();
    let treePages = [];
    let allTreePaths = [];
    let namespacePages = new Map();
    let mergedPaths = new Map();
    let saveTimer;
    let tagsLoaded = false;
    let tagsLoading = null;
    let fileRequest = 0;
    let tagRequest = 0;
    let fileCount = 0;
    let tagCount = 0;
    let matchingCount = 0;
    let filesLoaded = false;
    let filterExpansion = null;
    let filtering = false;

    function saveState() {
        try { localStorage.setItem(config.storageKey, JSON.stringify(state)); } catch { /* Private browsing may disallow storage. */ }
    }
    function setWidth(value) {
        const width = Math.max(200, Math.min(440, Number(value) || 260));
        state.width = width;
        document.body.style.setProperty('--fokus-sidebar-width', `${width}px`);
        resizer.setAttribute('aria-valuenow', String(Math.round(width)));
        window.dispatchEvent(new Event('resize'));
    }
    function setCollapsed(collapsed, persist = true) {
        document.body.classList.toggle('fokus-sidebar-collapsed', collapsed);
        sidebar.inert = collapsed;
        if (collapsed && wikiActions) wikiActions.open = false;
        toggle?.setAttribute('aria-expanded', String(!collapsed));
        if (persist) { state.collapsed = collapsed; saveState(); }
        window.dispatchEvent(new Event('resize'));
    }
    function status(panel, message) {
        const element = panel.querySelector('.fokus-sidebar-status');
        element.textContent = message;
        element.hidden = !message;
    }
    async function request(kind, extra = {}, signal, method = 'GET') {
        const url = new URL(config.endpoint, location.href);
        url.searchParams.set('fokus_nav', kind);
        if (method === 'GET') Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value));
        const body = method === 'POST' ? new URLSearchParams({ ...extra, sectok: config.securityToken }) : undefined;
        const response = await fetch(url, { method, body, credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'application/json' } });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Navigation request failed (${response.status}).`);
        }
        return response.json();
    }
    function showCount() {
        count.textContent = view === 'files' ? filter.value.trim() ? `${matchingCount} of ${fileCount} pages` : `${fileCount} pages` : `${tagCount} tags`;
        healthCount.hidden = view !== 'files' || !config.pageHealthAvailable || !filesLoaded;
        if (healthCount.hidden) return;
        let healthy = 0;
        let empty = 0;
        for (const page of matchingPages) {
            if (pageHealth.get(page.id) === true) empty++;
            else if (pageHealth.get(page.id) === false) healthy++;
        }
        const unknown = matchingPages.length - healthy - empty;
        healthCount.textContent = `${healthy} healthy · ${empty} no content${unknown ? ` · ${unknown} unchecked` : ''}`;
        healthCount.title = 'Page Health for the explorer’s visible page set and current filter, including pages represented by namespace rows.';
    }
    async function loadPageHealth(pages) {
        const states = new Map();
        if (!config.pageHealthAvailable) return states;
        // Reuse Page Health's ACL-checked API and its bounded batch size.
        for (let start = 0; start < pages.length; start += 500) {
            const ids = pages.slice(start, start + 500).map(page => page.id);
            try {
                const response = await fetch(config.ajaxEndpoint, {
                    method: 'POST', credentials: 'same-origin',
                    body: new URLSearchParams({ call: 'fokusbutler_pagehealth', ids: JSON.stringify(ids) }),
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new Error(`Page Health request failed (${response.status}).`);
                const result = await response.json();
                for (const id of ids) if (typeof result[id] === 'boolean') states.set(id, result[id]);
            } catch (error) { console.warn('Fokus sidebar:', error); }
        }
        return states;
    }
    function icon(name) { return document.getElementById(`fokus-icon-${name}`).content.firstElementChild.cloneNode(true); }
    function showCreate(namespace = '') {
        createName.value = namespace ? `${namespace}:` : '';
        createError.hidden = true;
        createDialog.showModal();
        createName.focus();
        createName.setSelectionRange(createName.value.length, createName.value.length);
    }
    function closeFileMenu(restoreFocus = true) {
        const context = menuContext;
        menuContext = null;
        fileMenu.hidden = true;
        context?.close({ restoreFocus });
    }
    function openFileMenu(item, context) {
        const namespace = item.kind === 'directory';
        const page = pagesByPath.get(item.path);
        if (!namespace && !page) return;
        menuContext = context;
        const target = { id: namespace ? item.path.replace(/\/$/, '').replaceAll('/', ':') : page.id, scope: namespace ? 'namespace' : 'page' };
        fileMenu.replaceChildren();
        const add = (label, symbol, activate, disabled = false, reason = '') => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('role', 'menuitem');
            button.disabled = disabled;
            if (disabled) button.title = reason;
            button.append(icon(symbol), document.createTextNode(label));
            button.addEventListener('click', () => { closeFileMenu(false); activate(); });
            fileMenu.append(button);
        };
        let createNamespace = namespace ? target.id : null;
        if (!namespace && directories.has(`${item.path.replace(/\.txt$/, '')}/`)) createNamespace = page.id;
        else if (!namespace && page.id.split(':').pop() === config.startPage) createNamespace = page.id.split(':').slice(0, -1).join(':');
        if (createNamespace !== null) add('New page here', 'new', () => showCreate(createNamespace));
        add('Rename', 'rename', () => showFileAction('rename', target, context.anchorElement), !config.moveAvailable, 'Install and enable the Move plugin to rename pages.');
        add('Delete', 'delete', () => showFileAction('delete', target, context.anchorElement));
        if (!namespace) {
            const pinned = pinnedIds.includes(page.id);
            add(pinned ? 'Unpin' : 'Pin', pinned ? 'unpin' : 'pin', () => togglePinned(page.id, !pinned), !pinsLoaded || pinsBusy || !pinsCanWrite,
                !pinsLoaded || pinsBusy ? 'Loading or saving pinned files…' : 'Sign in to pin files.');
        }
        fileMenu.hidden = false;
        const bounds = fileMenu.getBoundingClientRect();
        fileMenu.style.left = `${Math.max(8, Math.min(context.anchorRect.left, innerWidth - bounds.width - 8))}px`;
        fileMenu.style.top = `${Math.max(8, Math.min(context.anchorRect.bottom, innerHeight - bounds.height - 8))}px`;
        fileMenu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    function handleFileContext(event) {
        const keyboard = event.type === 'keydown';
        if (keyboard && event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
        const path = event.composedPath();
        let source = path.find(element => element instanceof HTMLElement && element.getAttribute('role') === 'treeitem' && element.dataset.itemPath);
        if (!source && keyboard && path.includes(tree?.getFileTreeContainer())) {
            source = [...(tree.getFileTreeContainer().shadowRoot?.querySelectorAll('[role="treeitem"]') || [])]
                .find(element => element.dataset.itemPath === tree.getFocusedPath());
        }
        let item;
        if (source) {
            const rowPath = source.dataset.itemPath;
            const page = namespacePages.get(rowPath);
            const namespaceIcon = path.some(element => element instanceof HTMLElement && element.dataset.itemSection === 'icon');
            item = page && !namespaceIcon
                ? { kind: 'file', path: page.path }
                : { kind: directories.has(rowPath) ? 'directory' : 'file', path: rowPath };
        } else {
            source = path.find(element => element instanceof HTMLAnchorElement && element.dataset.pageId);
            const page = source && pagesById.get(source.dataset.pageId);
            if (page) item = { kind: 'file', path: page.path };
        }
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        closeFileMenu(false);
        // Read the actual row under the pointer. Focusing the library's model
        // here would scroll its virtual tree and can dismiss a newly opened menu.
        source.setAttribute('aria-haspopup', 'menu');
        const anchorRect = keyboard ? source.getBoundingClientRect() : { left: event.clientX, bottom: event.clientY };
        openFileMenu(item, { anchorElement: source, anchorRect, close: ({ restoreFocus = true } = {}) => {
            fileMenu.hidden = true;
            menuContext = null;
            if (restoreFocus && source.isConnected) source.focus({ preventScroll: true });
        } });
    }
    async function showFileAction(action, target, origin) {
        const version = ++actionVersion;
        actionTarget = null;
        actionResult = null;
        actionOrigin = origin;
        actionError.hidden = true;
        actionTitle.textContent = `${action === 'rename' ? 'Rename' : 'Delete'} ${target.scope === 'namespace' ? 'namespace' : 'page'}`;
        actionDescription.textContent = 'Checking pages and permissions…';
        actionNameField.hidden = action !== 'rename';
        actionName.required = action === 'rename';
        actionName.value = target.id;
        actionSubmit.textContent = action === 'rename' ? 'Rename' : 'Delete';
        actionSubmit.disabled = true;
        actionDialog.showModal();
        try {
            const info = await request('target', { target: target.id, scope: target.scope });
            if (!actionDialog.open || version !== actionVersion) return;
            actionTarget = { ...target, action, fingerprint: info.fingerprint };
            const countLabel = `${info.count} ${info.count === 1 ? 'page' : 'pages'}`;
            actionDescription.textContent = action === 'delete'
                ? target.scope === 'namespace'
                    ? `Delete ${countLabel} in “${target.id}”, including subnamespaces? Page history remains available. Media files are kept.`
                    : `Delete “${target.id}”? Page history remains available.`
                : target.scope === 'namespace'
                    ? `Rename “${target.id}” and its ${countLabel}, including subnamespaces. Wiki links are updated; media files keep their current namespace.`
                    : `Choose a new page ID for “${target.id}”. Wiki links are updated.`;
            if (!info.allowed[action]) throw new Error('This action is unavailable. Check your permissions and close any editors for these pages.');
            actionSubmit.disabled = false;
            (action === 'rename' ? actionName : actionCancel).focus();
            if (action === 'rename') actionName.select();
        } catch (error) {
            if (!actionDialog.open || version !== actionVersion) return;
            actionError.textContent = error.message;
            actionError.hidden = false;
        }
    }
    function rememberFileChanges(result) {
        const changes = new Map(result.changes.map(change => [change.from, change.to]));
        pinnedIds = [...new Set(pinnedIds.map(id => changes.has(id) ? changes.get(id) : id).filter(Boolean))];
        if (result.namespace) {
            const from = result.namespace.from.replaceAll(':', '/') + '/';
            const to = result.namespace.to ? result.namespace.to.replaceAll(':', '/') + '/' : null;
            state.expanded = (state.expanded || []).flatMap(path => path.startsWith(from) ? to ? [to + path.slice(from.length)] : [] : [path]);
        }
        saveState();
    }
    function reloadChangedWorkspace(result) {
        const changes = new Map(result.changes.map(change => [change.from, change]));
        const previous = new URL(location.href);
        const root = changes.get(config.pageId);
        const next = root ? new URL(root.to ? root.url : config.homeUrl, location.href) : new URL(previous);
        const rootId = root ? root.to || config.startPage : config.pageId;
        for (const parameter of ['p', 'm', 'f']) {
            next.searchParams.delete(parameter);
            for (const oldId of previous.searchParams.getAll(parameter)) {
                const id = changes.has(oldId) ? changes.get(oldId).to : oldId;
                if (id && id !== rootId) next.searchParams.append(parameter, id);
            }
        }
        const destination = next.href.replace(/([?&][pmf]=)([^&]*)/g, (_match, prefix, value) => prefix + value.replace(/%3A/gi, ':'));
        if (destination === location.href) location.reload();
        else location.href = destination;
    }
    function pinStatus(message) {
        pinnedStatus.textContent = message;
        pinnedStatus.hidden = !message;
    }
    async function loadPins() {
        if (pinsBusy) return;
        pinsBusy = true;
        updatePinCurrent();
        if (!pinsLoaded) pinStatus('Loading pinned files…');
        try {
            const data = await request('pins');
            pinnedIds = data.ids;
            pinsCanWrite = data.canWrite;
            pinsLoaded = true;
            pinStatus('');
        } catch (error) {
            pinStatus(error.message || 'Could not load pinned files. Use refresh to retry.');
        } finally {
            pinsBusy = false;
            renderPinned();
        }
    }
    async function togglePinned(id, pin = !pinnedIds.includes(id)) {
        if (!pinsLoaded || pinsBusy || !pinsCanWrite || !pagesById.has(id)) return false;
        pinsBusy = true;
        updatePinCurrent();
        pinnedList.querySelectorAll('.fokus-unpin').forEach(button => { button.disabled = true; });
        pinStatus('');
        try {
            const data = await request('pins', { action: pin ? 'pin' : 'unpin', target: id }, undefined, 'POST');
            pinnedIds = data.ids;
            return true;
        } catch (error) {
            pinStatus(error.message || 'Could not save pinned files. Try again.');
            return false;
        } finally {
            pinsBusy = false;
            renderPinned();
        }
    }
    function renderPinned() {
        pinnedList.replaceChildren();
        for (const id of pinnedIds) {
            // Resolve against the current permission-filtered list, never saved URLs.
            const page = pagesById.get(id);
            if (!page) continue;
            const row = document.createElement('div');
            const link = document.createElement('a');
            const name = document.createElement('span');
            const unpin = document.createElement('button');
            row.className = 'fokus-pinned-row';
            link.href = page.url;
            link.title = page.id;
            link.dataset.pageId = page.id;
            name.textContent = page.title;
            name.classList.toggle('fokus-pagehealth-empty', pageHealth.get(page.id) === true);
            link.append(icon('file'), name);
            link.addEventListener('click', event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                openPage(page);
            });
            unpin.type = 'button';
            unpin.className = 'fokus-sidebar-icon-button fokus-unpin';
            unpin.title = `Unpin ${name.textContent}`;
            unpin.setAttribute('aria-label', unpin.title);
            unpin.append(icon('unpin'));
            unpin.disabled = pinsBusy || !pinsCanWrite;
            unpin.addEventListener('click', async () => {
                const nextRow = row.nextElementSibling || row.previousElementSibling;
                const nextId = nextRow?.querySelector('a')?.dataset.pageId;
                if (!await togglePinned(id, false)) return;
                const nextLink = [...pinnedList.querySelectorAll('a')].find(link => link.dataset.pageId === nextId);
                (nextLink || pinCurrent).focus();
            });
            row.append(link, unpin);
            pinnedList.append(row);
        }
        pinnedEmpty.hidden = !pinsLoaded || pinnedList.childElementCount > 0;
        updatePinCurrent();
    }
    function updatePinCurrent() {
        const pinned = pinnedIds.includes(activePageId);
        pinCurrent.disabled = !pinsLoaded || pinsBusy || !pinsCanWrite || !pagesById.has(activePageId);
        pinCurrent.title = pinned ? 'Unpin current page' : 'Pin current page';
        pinCurrent.setAttribute('aria-label', pinCurrent.title);
        pinCurrent.setAttribute('aria-pressed', String(pinned));
    }
    function renderRecents() {
        recentsList.replaceChildren();
        for (const recent of recentPages) {
            const link = document.createElement('a');
            const name = document.createElement('span');
            link.className = 'fokus-recent-row';
            link.href = recent.url;
            link.title = recent.id;
            link.dataset.pageId = recent.id;
            name.textContent = recent.title;
            name.classList.toggle('fokus-pagehealth-empty', pageHealth.get(recent.id) === true);
            link.append(icon('file'), name);
            link.addEventListener('click', event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                const page = pagesById.get(recent.id);
                if (page) openPage(page);
                else location.href = recent.url;
            });
            recentsList.append(link);
        }
        recentsSection.hidden = recentsList.childElementCount === 0;
    }
    async function loadRecents() {
        const version = recentWriteVersion;
        try {
            const data = await request('recents');
            if (version !== recentWriteVersion) return;
            recentPages = Array.isArray(data.pages) ? data.pages : [];
            renderRecents();
        } catch (error) {
            if (version !== recentWriteVersion) return;
            recentPages = [];
            renderRecents();
            console.warn('Fokus sidebar: could not load recent pages.', error);
        }
    }
    async function registerRecentPage(id) {
        if (typeof id !== 'string' || !id) return;
        const version = ++recentWriteVersion;
        recentWriteQueue = recentWriteQueue.catch(() => {}).then(async () => {
            const data = await request('recents', { target: id }, undefined, 'POST');
            if (version !== recentWriteVersion) return;
            recentPages = Array.isArray(data.pages) ? data.pages : [];
            renderRecents();
        }).catch(error => console.warn('Fokus sidebar: could not save recent page.', error));
        return recentWriteQueue;
    }
    window.fokusRegisterRecentPage = registerRecentPage;
    let recentContent = [];
    let contentWriteVersion = 0;
    let contentWriteQueue = Promise.resolve();
    function renderContentRecents() {
        contentRecentsList.replaceChildren();
        for (const recent of recentContent) {
            const provider = window.FokusPaneProviders?.forId(recent.id);
            if (!provider || provider.name === 'wiki' || provider.name !== recent.provider) continue;
            const url = provider.urlForId(recent.id);
            if (!url) continue;
            const link = document.createElement('a');
            link.className = 'fokus-recent-row';
            link.href = url;
            link.dataset.pageId = recent.id;
            link.dataset.provider = provider.name;
            link.title = `${recent.title} · ${provider.label || provider.name}`;
            const name = document.createElement('span');
            name.textContent = recent.title;
            let providerIcon = icon('file');
            if (provider.name === 'wikipedia') {
                providerIcon = document.createElement('img');
                providerIcon.src = DOKU_BASE + 'lib/images/interwiki/wp.svg';
                providerIcon.alt = '';
                providerIcon.setAttribute('aria-hidden', 'true');
                providerIcon.className = 'fokus-recent-provider-icon';
                providerIcon.width = 16;
                providerIcon.height = 16;
            }
            link.append(providerIcon, name);
            link.addEventListener('click', event => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                openPage({ id: recent.id, url });
            });
            contentRecentsList.append(link);
        }
        contentRecentsSection.hidden = contentRecentsList.childElementCount === 0;
    }
    async function loadContentRecents() {
        const version = contentWriteVersion;
        try {
            const data = await request('content-recents');
            if (version !== contentWriteVersion) return;
            recentContent = Array.isArray(data.pages) ? data.pages : [];
            renderContentRecents();
        } catch (error) { console.warn('Fokus sidebar: could not load recent content.', error); }
    }
    window.fokusRegisterRecentContent = function (entry) {
        if (!entry?.id || !entry.title || !entry.provider || entry.provider === 'wiki') return;
        const version = ++contentWriteVersion;
        contentWriteQueue = contentWriteQueue.catch(() => {}).then(async () => {
            const data = await request('content-recents', { target: entry.id, title: entry.title, provider: entry.provider }, undefined, 'POST');
            if (version !== contentWriteVersion) return;
            recentContent = Array.isArray(data.pages) ? data.pages : [];
            renderContentRecents();
        }).catch(error => console.warn('Fokus sidebar: could not save recent content.', error));
        return contentWriteQueue;
    };
    for (const list of [recentsList, contentRecentsList]) {
        const previewRecent = event => {
            if (event.pointerType === 'touch') return;
            const link = event.target.closest?.('a.fokus-recent-row');
            const previews = window.FokusButlerPreviews;
            if (!link || !list.contains(link) || link.contains(event.relatedTarget) || !previews?.hover) return;
            const provider = link.dataset.provider || 'wiki';
            const id = link.dataset.pageId;
            const target = { provider, id, url: link.href, title: link.textContent.trim(), key: `${provider}:${id}` };
            link.removeAttribute('title');
            previews.hover(link, target, event.type === 'pointerover' || event.type === 'focusin', event.type === 'focusin', event.relatedTarget);
        };
        for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout']) list.addEventListener(type, previewRecent);
    }
    function applyFilter() {
        if (!tree) return;
        const query = filter.value.trim().toLocaleLowerCase();
        if (query && filterExpansion === null) filterExpansion = [...directories].filter(path => tree.getItem(path)?.isExpanded());
        const matches = treePages.filter(page => !query ||
            [page.path, page.title, ...ancestors(page.path).map(parent => labelsByPath.get(parent))]
                .join(' ').toLocaleLowerCase().includes(query));
        const paths = [...new Set(matches.map(page => mergedPaths.get(page.path) || page.path))];
        matchingPages = matches;
        const expanded = query ? [...new Set(paths.flatMap(ancestors))] : filterExpansion ?? [...directories].filter(path => tree.getItem(path)?.isExpanded());
        // Use the public data API so this external filter leaves the library's
        // separate search-field keyboard and click behavior inactive.
        filtering = true;
        try { tree.resetPaths(paths, { initialExpandedPaths: expanded }); }
        finally { filtering = false; }
        matchingCount = matches.length;
        host.hidden = !matchingCount;
        if (!query) filterExpansion = null;
        if (filesLoaded) status(panels.files, !fileCount ? 'No pages to display.' : query && !matchingCount ? 'No matching files.' : '');
        syncNamespaceToggle();
        showCount();
    }
    function syncNamespaceToggle() {
        const filtering = Boolean(filter.value.trim());
        const anyExpanded = Boolean(tree && directories.size) &&
            [...directories].some(path => tree.getItem(path)?.isExpanded());
        const action = anyExpanded ? 'collapse-all' : 'expand-all';
        const label = anyExpanded ? 'Collapse all namespaces' : 'Expand all namespaces';
        toggleNamespaces.replaceChildren(icon(action));
        toggleNamespaces.setAttribute('aria-label', label);
        toggleNamespaces.title = filtering ? 'Clear the file filter to manage all namespaces' : label;
        toggleNamespaces.disabled = !filesLoaded || !tree || directories.size === 0 || filtering;
    }
    function toggleAllNamespaces() {
        if (!tree || !filesLoaded || !directories.size || filter.value.trim()) return;
        const collapseAll = [...directories].some(path => tree.getItem(path)?.isExpanded());
        const expandedPaths = collapseAll ? [] : [...directories];
        filtering = true;
        try { tree.resetPaths(allTreePaths, { initialExpandedPaths: expandedPaths }); }
        finally { filtering = false; }
        state.expanded = expandedPaths;
        saveState();
        syncNamespaceToggle();
    }
    function setFilterOpen(open) {
        navigation.classList.toggle('fokus-sidebar-filter-open', open);
        filterToggle.setAttribute('aria-expanded', String(open));
        filterArea.setAttribute('aria-hidden', String(!open));
        filterArea.inert = !open;
        filter.disabled = !open;
        navigationLeft.inert = open;
        if (open) {
            if (view !== 'files') selectView('files');
            filter.focus({ preventScroll: true });
        } else {
            filter.value = '';
            applyFilter();
            filterToggle.focus({ preventScroll: true });
        }
    }
    function ancestors(path) {
        const parts = path.split('/');
        return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/') + '/');
    }
    async function openPage(page, newTab = false) {
        if (newTab) { window.open(page.url, '_blank', 'noopener'); return; }
        if (narrow.matches) setCollapsed(true, false);
        if (typeof window.infinitepanelsOpenPage === 'function') {
            try { await window.infinitepanelsOpenPage(page.url, true, page.id); }
            catch (error) { console.error('Fokus sidebar:', error); status(panels[view], 'Could not open page. Try again.'); }
        } else location.href = page.url;
    }
    async function loadFiles() {
        const version = ++fileRequest;
        panels.files.setAttribute('aria-busy', 'true');
        status(panels.files, tree ? '' : 'Loading pages…');
        try {
            const data = await request('files');
            if (version !== fileRequest) return;
            const health = await loadPageHealth(data.pages);
            if (version !== fileRequest) return;
            pageHealth = health;
            pagesByPath = new Map(data.pages.map(page => [page.path, page]));
            pagesById = new Map(data.pages.map(page => [page.id, page]));
            treePages = data.pages.filter(page => !page.hiddenFromTree);
            directories = new Set(treePages.flatMap(page => ancestors(page.path)));
            namespacePages = new Map();
            mergedPaths = new Map();
            for (const path of directories) {
                const id = path.slice(0, -1).replaceAll('/', ':');
                const page = [pagesById.get(id), pagesById.get(`${id}:${config.startPage}`)]
                    .find(candidate => candidate && !candidate.hiddenFromTree);
                if (page) { namespacePages.set(path, page); mergedPaths.set(page.path, path); }
            }
            labelsByPath = new Map([
                ...data.pages.map(page => [page.path, page.title]),
                ...Object.entries(data.namespaces || {}),
                ...[...namespacePages].map(([path, page]) => [path, page.title]),
            ]);
            const paths = [...new Set(treePages.map(page => mergedPaths.get(page.path) || page.path))];
            allTreePaths = paths;
            if (Array.isArray(state.expanded)) {
                state.expanded = state.expanded.filter(path => directories.has(path));
                saveState();
            }
            fileCount = treePages.length;
            filesLoaded = true;
            if (tree) {
                tree.resetPaths(paths, {
                    initialExpandedPaths: Array.isArray(state.expanded) ? state.expanded.filter(path => directories.has(path)) : [],
                });
            } else {
                const fileIcon = icon('file');
                const namespaceIcon = icon('folder');
                const namespaceOpenIcon = icon('folder-open');
                const fileIconRemap = { name: 'fokus-file-text', viewBox: '0 0 256 256', width: 16, height: 16 };
                const namespaceIconRemap = { name: 'fokus-folder', viewBox: '0 0 256 256', width: 16, height: 16 };
                tree = new FileTree({
                    paths,
                    initialExpansion: 'closed',
                    initialExpandedPaths: Array.isArray(state.expanded) ? state.expanded.filter(path => typeof path === 'string' && directories.has(path)) : [],
                    flattenEmptyDirectories: false,
                    icons: {
                        set: 'minimal',
                        colored: false,
                        spriteSheet: `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0"><symbol id="fokus-file-text" viewBox="0 0 256 256" fill="currentColor">${fileIcon.innerHTML}</symbol><symbol id="fokus-folder" viewBox="0 0 256 256" fill="currentColor"><g style="display:var(--fokus-folder-closed,inline)">${namespaceIcon.innerHTML}</g><g style="display:var(--fokus-folder-open,none)">${namespaceOpenIcon.innerHTML}</g></symbol></svg>`,
                        remap: { 'file-tree-icon-file': fileIconRemap, 'file-tree-icon-chevron': namespaceIconRemap, 'file-tree-icon-dot': namespaceIconRemap },
                        byFileExtension: { txt: fileIconRemap },
                    },
                    itemHeight: 30,
                    search: false,
                    renaming: false,
                    dragAndDrop: false,
                    // The public decoration renderer supplies display labels while
                    // canonical paths remain the tree's identity for every action.
                    renderRowDecoration: ({ item }) => ({ text: labelsByPath.get(item.path) || item.name, title: item.path }),
                    unsafeCSS: `
                        [data-type="item"], [data-type="item"]::before { border-radius: var(--trees-border-radius); }
                        [data-item-type="folder"] > [data-item-section="icon"] > [data-icon-name="file-tree-icon-chevron"] { transform: none; transition: none; }
                        [data-item-type="folder"][aria-expanded="false"] { --fokus-folder-closed: inline; --fokus-folder-open: none; }
                        [data-item-type="folder"][aria-expanded="true"] { --fokus-folder-closed: none; --fokus-folder-open: inline; }
                        [data-item-type="folder"] > [data-item-section="icon"] { position: relative; }
                        [data-item-type="folder"] > [data-item-section="icon"]::before { content: ''; position: absolute; inset: -5px -4px; }
                        [data-item-section="content"] { display: none; }
                        [data-item-section="decoration"] { flex: 1; min-width: 0; width: auto; max-width: none; color: inherit; font: inherit; text-align: left; justify-content: flex-start; overflow: hidden; }
                        [data-item-section="decoration"] > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                        [data-pagehealth-empty] [data-item-section="decoration"] > span {
                            color: var(--pagehealth-empty-color, #89919b);
                            opacity: var(--pagehealth-empty-opacity, 1);
                            font-style: var(--pagehealth-empty-font-style, normal);
                            text-decoration-line: var(--pagehealth-empty-decoration, none);
                            text-decoration-style: var(--pagehealth-empty-decoration-style, solid);
                        }
                        [data-pagehealth-empty]:hover [data-item-section="decoration"] > span { color: var(--pagehealth-empty-hover-color, #626b76); }
                    `,
                });
                tree.render({ containerWrapper: host });
                const treeHost = tree.getFileTreeContainer();
                treeHost.setAttribute('aria-label', 'Wiki pages');
                // The library uses its own shadow host; inherit the surrounding theme.
                treeHost.style.height = '100%';
                treeHost.style.width = '100%';
                // Keep the tree's outer inset aligned with the 8px-padded pinned and recent rows.
                treeHost.style.setProperty('--trees-padding-inline-override', '8px');
                const treeRoot = treeHost.shadowRoot;
                if (treeRoot) {
                    const previewTreeRow = event => {
                        const row = event.target instanceof Element ? event.target.closest('[role="treeitem"][data-item-path]') : null;
                        const previews = window.FokusButlerPreviews;
                        if (!row || !previews?.hover) return;
                        const page = namespacePages.get(row.dataset.itemPath) || pagesByPath.get(row.dataset.itemPath);
                        if (!page) return;
                        const target = { provider: 'wiki', id: page.id, url: page.url, title: page.title, key: 'wiki:' + page.id };
                        previews.hover(row, target, event.type === 'pointerover' || event.type === 'focusin', event.type === 'focusin', event.relatedTarget);
                    };
                    treeRoot.addEventListener('pointerover', previewTreeRow);
                    treeRoot.addEventListener('pointerout', previewTreeRow);
                    treeRoot.addEventListener('focusin', previewTreeRow);
                    treeRoot.addEventListener('focusout', previewTreeRow);
                }
                // Trees derives accessible names from paths. Keep virtualized and
                // recycled rows in sync with their visible heading labels as well.
                const syncRowLabels = () => {
                    treeHost.shadowRoot?.querySelectorAll('[role="treeitem"][data-item-path]').forEach(row => {
                        const label = labelsByPath.get(row.dataset.itemPath);
                        if (label && row.getAttribute('aria-label') !== label) row.setAttribute('aria-label', label);
                        const page = namespacePages.get(row.dataset.itemPath) || pagesByPath.get(row.dataset.itemPath);
                        row.toggleAttribute('data-pagehealth-empty', pageHealth.get(page?.id) === true);
                        if (directories.has(row.dataset.itemPath)) {
                            const control = row.querySelector('[data-item-section="icon"]');
                            if (control) control.title = 'Expand or collapse namespace; right-click for namespace actions';
                            const description = namespacePages.has(row.dataset.itemPath)
                                ? 'Enter opens the page. Left and Right arrows collapse and expand the namespace. Right-click the name for page actions or the folder icon for namespace actions.'
                                : 'Click to expand or collapse the namespace.';
                            if (row.getAttribute('aria-description') !== description) row.setAttribute('aria-description', description);
                        } else {
                            row.removeAttribute('aria-description');
                            row.querySelector('[data-item-section="icon"]')?.removeAttribute('title');
                        }
                    });
                };
                new MutationObserver(syncRowLabels).observe(treeHost.shadowRoot, {
                    childList: true, subtree: true, attributes: true, attributeFilter: ['data-item-path', 'aria-label'],
                });
                syncRowLabels();
                const activateTreeRow = event => {
                    const path = event.composedPath();
                    const row = path.find(element => element instanceof HTMLElement && element.getAttribute('role') === 'treeitem') ||
                        (event.type === 'keydown' ? [...treeHost.shadowRoot.querySelectorAll('[role="treeitem"]')]
                            .find(element => element.dataset.itemPath === tree.getFocusedPath()) : null);
                    if (!row) return;
                    const page = namespacePages.get(row.dataset.itemPath) || pagesByPath.get(row.dataset.itemPath);
                    const namespaceIcon = path.some(element => element instanceof HTMLElement && element.dataset.itemSection === 'icon');
                    if (namespacePages.has(row.dataset.itemPath) && namespaceIcon) return;
                    if (!page) return;
                    // Capture before Trees toggles folders on whole-row clicks.
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    for (const selected of tree.getSelectedPaths()) tree.getItem(selected)?.deselect();
                    tree.focusPath(row.dataset.itemPath);
                    tree.getItem(row.dataset.itemPath)?.select();
                    row.focus({ preventScroll: true });
                    if (page) openPage(page, event.ctrlKey || event.metaKey);
                };
                treeHost.addEventListener('click', activateTreeRow, true);
                treeHost.addEventListener('keydown', event => {
                    if (event.key === 'Enter') activateTreeRow(event);
                }, true);
                tree.subscribe(() => {
                    syncNamespaceToggle();
                    if (filter.value.trim() || filtering) return;
                    clearTimeout(saveTimer);
                    saveTimer = setTimeout(() => {
                        if (filter.value.trim()) return;
                        state.expanded = [...directories].filter(path => tree.getItem(path)?.isExpanded());
                        saveState();
                    }, 120);
                });
            }
            status(panels.files, fileCount ? '' : 'No pages to display.');
            renderPinned();
            renderRecents();
            applyFilter();
            syncNamespaceToggle();
            showCount();
        } catch (error) {
            if (version !== fileRequest) return;
            status(panels.files, 'Could not load pages. Use refresh to try again.');
            console.error('Fokus sidebar:', error);
        } finally {
            if (version === fileRequest) panels.files.removeAttribute('aria-busy');
        }
    }
    function loadTags(force = false) {
        if (tagsLoaded && !force) return Promise.resolve();
        if (tagsLoading) return tagsLoading;
        tagsLoading = fetchTags().finally(() => { tagsLoading = null; });
        return tagsLoading;
    }
    async function fetchTags() {
        const version = ++tagRequest;
        panels.tags.setAttribute('aria-busy', 'true');
        status(panels.tags, 'Loading tags…');
        try {
            const data = await request('tags');
            if (version !== tagRequest) return;
            tagList.replaceChildren();
            tagCount = data.tags.length;
            tagsLoaded = true;
            for (const tag of data.tags) {
                const group = document.createElement('div');
                const button = document.createElement('button');
                const name = document.createElement('span');
                const badge = document.createElement('span');
                const pages = document.createElement('div');
                button.type = 'button';
                button.className = 'fokus-tag-button';
                button.dataset.tagId = tag.id;
                button.setAttribute('aria-expanded', 'false');
                pages.id = `fokus-tag-pages-${tagList.childElementCount}`;
                button.setAttribute('aria-controls', pages.id);
                button.append(sidebar.querySelector('[data-view="tags"] svg').cloneNode(true));
                name.className = 'fokus-tag-name';
                name.textContent = tag.id.replaceAll('_', ' ');
                badge.className = 'fokus-tag-count';
                badge.textContent = tag.count;
                button.title = `${tag.id} · ${tag.count} ${tag.count === 1 ? 'page' : 'pages'}`;
                button.append(name, badge);
                pages.className = 'fokus-tag-pages';
                pages.hidden = true;
                let loaded = false;
                let loading = false;
                button.addEventListener('click', async () => {
                    pages.hidden = !pages.hidden;
                    button.setAttribute('aria-expanded', String(!pages.hidden));
                    if (pages.hidden || loaded || loading) return;
                    loading = true;
                    const message = document.createElement('p');
                    message.textContent = 'Loading pages…';
                    pages.replaceChildren(message);
                    try {
                        const result = await request('tag', { tag: tag.id });
                        pages.replaceChildren();
                        result.pages.forEach(page => {
                            const link = document.createElement('a');
                            link.href = page.url;
                            link.textContent = page.title;
                            link.title = page.id;
                            link.dataset.pageId = page.id;
                            link.addEventListener('click', event => {
                                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                                event.preventDefault();
                                openPage(page);
                            });
                            pages.append(link);
                        });
                        if (!result.pages.length) { message.textContent = 'No pages to display.'; pages.append(message); }
                        loaded = true;
                    } catch (error) {
                        message.textContent = 'Could not load pages. Close and reopen this tag to retry.';
                        pages.replaceChildren(message);
                        console.error('Fokus sidebar:', error);
                    } finally { loading = false; }
                });
                group.append(button, pages);
                tagList.append(group);
            }
            status(panels.tags, !data.available ? 'Enable the Tag plugin to browse tags.' : tagCount ? '' : 'No tags found.');
            showCount();
        } catch (error) {
            if (version !== tagRequest) return;
            status(panels.tags, 'Could not load tags. Use refresh to try again.');
            console.error('Fokus sidebar:', error);
        } finally {
            if (version === tagRequest) panels.tags.removeAttribute('aria-busy');
        }
    }
    async function openTag(tagId) {
        if (typeof tagId !== 'string' || !tagId) return;
        setCollapsed(false);
        selectView('tags');
        await loadTags();
        const button = [...tagList.querySelectorAll('.fokus-tag-button')]
            .find(item => item.dataset.tagId === tagId);
        if (!button) return;
        if (button.getAttribute('aria-expanded') !== 'true') button.click();
        button.scrollIntoView({ block: 'nearest' });
        button.focus({ preventScroll: true });
    }
    window.fokusSidebarOpenTag = tagId => { void openTag(tagId); };
    function selectView(next, focus = false) {
        view = next;
        state.view = view;
        tabs.forEach(tab => {
            const selected = tab.dataset.view === view;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
            if (selected && focus) tab.focus();
        });
        Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== view; });
        if (view === 'tags' && !tagsLoaded) loadTags();
        showCount();
        saveState();
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => selectView(tab.dataset.view));
        tab.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            selectView(event.key === 'Home' ? 'files' : event.key === 'End' ? 'tags' : view === 'files' ? 'tags' : 'files', true);
        });
    });
    sidebar.querySelectorAll('[data-refresh]').forEach(button => button.addEventListener('click', () => {
        if (button.dataset.refresh === 'files') { loadFiles(); loadPins(); }
        else loadTags(true);
    }));
    toggleNamespaces.addEventListener('click', toggleAllNamespaces);
    pinCurrent.addEventListener('click', () => togglePinned(activePageId));
    createFile.addEventListener('click', () => showCreate());
    sidebar.addEventListener('contextmenu', handleFileContext, true);
    sidebar.addEventListener('keydown', handleFileContext, true);
    fileMenu.addEventListener('keydown', event => {
        const items = [...fileMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        } else if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            event.stopPropagation();
            closeFileMenu(event.key === 'Escape');
        }
    });
    document.addEventListener('pointerdown', event => {
        if (!fileMenu.hidden && !event.composedPath().includes(fileMenu)) closeFileMenu(false);
    });
    window.addEventListener('resize', () => closeFileMenu(false));
    document.addEventListener('scroll', () => closeFileMenu(false), true);
    actionCancel.addEventListener('click', () => actionDialog.close());
    actionDialog.addEventListener('cancel', event => { if (actionRunning) event.preventDefault(); });
    actionDialog.addEventListener('close', () => {
        actionVersion++;
        if (actionResult?.changes.length) reloadChangedWorkspace(actionResult);
        else if (actionOrigin?.isConnected) actionOrigin.focus({ preventScroll: true });
    });
    actionForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!actionTarget || actionRunning || actionSubmit.disabled) return;
        actionRunning = true;
        actionSubmit.disabled = true;
        actionCancel.disabled = true;
        actionError.hidden = true;
        try {
            const url = new URL(config.endpoint, location.href);
            url.searchParams.set('fokus_nav', 'action');
            const body = new URLSearchParams({ ...actionTarget, target: actionTarget.id, name: actionName.value, sectok: config.securityToken });
            const response = await fetch(url, { method: 'POST', body, credentials: 'same-origin', headers: { Accept: 'application/json' } });
            const result = await response.json();
            if (result.changes?.length) {
                actionResult = result;
                rememberFileChanges(result);
            }
            if (!response.ok || result.error) throw new Error(result.error || 'The file action failed.');
            actionDialog.close();
        } catch (error) {
            actionError.textContent = error.message;
            actionError.hidden = false;
            await loadFiles();
        } finally {
            actionRunning = false;
            actionSubmit.disabled = !!actionResult?.changes.length;
            actionCancel.disabled = false;
        }
    });
    document.getElementById('fokus-new-page-cancel').addEventListener('click', () => createDialog.close());
    createDialog.addEventListener('close', () => { createVersion++; });
    createForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (creating) return;
        const name = createName.value.trim();
        if (!name || name.endsWith(':') || name.endsWith('/')) {
            createError.textContent = 'Enter a page name after the namespace.';
            createError.hidden = false;
            createName.focus();
            return;
        }
        creating = true;
        const version = createVersion;
        createSubmit.disabled = true;
        createError.hidden = true;
        try {
            const page = await request('newpage', { page: name });
            if (!createDialog.open || version !== createVersion) return;
            if (page.exists) {
                createError.textContent = `The page “${page.id}” already exists. Choose another name.`;
                createError.hidden = false;
                createName.focus();
                return;
            }
            createDialog.close();
            if (typeof window.fokusCreatePage === 'function') {
                window.fokusCreatePage(page.id, createFile, async () => {
                    await loadFiles();
                    // Core returns to show mode on both Save and Cancel.
                    // Only open a pane if the page was actually saved.
                    const saved = pagesById.get(page.id);
                    if (saved) {
                        tagsLoaded = false;
                        if (filter.value) { filter.value = ''; applyFilter(); }
                        await openPage(saved);
                    } else createFile.focus({ preventScroll: true });
                });
            } else location.href = page.editUrl;
        } catch (error) {
            if (createDialog.open) {
                createError.textContent = error.message;
                createError.hidden = false;
            }
        } finally {
            creating = false;
            createSubmit.disabled = false;
        }
    });
    filterToggle.addEventListener('click', () => setFilterOpen(filterToggle.getAttribute('aria-expanded') !== 'true'));
    filter.addEventListener('input', () => {
        if (view !== 'files') selectView('files');
        applyFilter();
    });
    filter.addEventListener('keydown', event => {
        if (event.key === 'Escape' && filter.value) {
            event.preventDefault();
            event.stopPropagation();
            filter.value = '';
            applyFilter();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setFilterOpen(false);
        } else if (event.key === 'ArrowDown' && tree && view === 'files' && tree.getVisibleCount()) {
            event.preventDefault();
            tree.focusFirstItem();
            tree.getFileTreeContainer().shadowRoot?.querySelector('[role="treeitem"][tabindex="0"]')?.focus();
        }
    });
    toggle?.addEventListener('click', () => setCollapsed(!document.body.classList.contains('fokus-sidebar-collapsed')));
    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'fokus-sidebar-backdrop';
    backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-label', 'Close sidebar');
    document.body.append(backdrop);
    backdrop.addEventListener('click', () => setCollapsed(true, false));
    document.addEventListener('pointerdown', event => {
        if (wikiActions?.open && !wikiActions.contains(event.target)) wikiActions.open = false;
    });
    document.addEventListener('keydown', event => {
        if (event.defaultPrevented) return;
        if (event.key === 'Escape' && wikiActions?.open) {
            event.preventDefault();
            wikiActions.open = false;
            wikiActions.querySelector('summary').focus();
            return;
        }
        if (event.key === 'Escape' && narrow.matches && !document.body.classList.contains('fokus-sidebar-collapsed')) {
            setCollapsed(true, false);
            toggle?.focus();
        }
    });
    resizer.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        resizer.setPointerCapture(event.pointerId);
    });
    resizer.addEventListener('pointermove', event => {
        if (resizer.hasPointerCapture(event.pointerId)) setWidth(event.clientX);
    });
    resizer.addEventListener('pointerup', event => {
        if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
        saveState();
    });
    resizer.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setWidth(event.key === 'Home' ? 200 : event.key === 'End' ? 440 : state.width + (event.key === 'ArrowRight' ? 10 : -10));
        saveState();
    });
    // Pane focus is relevant only to the "Pin current page" action. It must
    // never select files, expand folders, or scroll the independent navigator.
    document.addEventListener('fokus:pagechange', event => {
        activePageId = event.detail.pageId;
        updatePinCurrent();
    });
    narrow.addEventListener('change', () => setCollapsed(narrow.matches || state.collapsed === true, false));
    window.addEventListener('focus', () => loadPins());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadPins(); });
    setWidth(state.width);
    setCollapsed(narrow.matches || state.collapsed === true, false);
    selectView(view);
    loadFiles();
    loadPins();
    loadRecents();
    loadContentRecents();
    if (config.trackInitialPage) registerRecentPage(config.pageId);
}
