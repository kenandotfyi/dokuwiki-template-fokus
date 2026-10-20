import { strict as assert } from 'node:assert';
import vm from 'node:vm';

const source = await Deno.readTextFile(new URL('./panels.js', import.meta.url));

function loadFunctions(context, names) {
    for (const name of names) {
        const start = source.search(new RegExp(`    (?:async )?function ${name}\\(`));
        assert.notEqual(start, -1, `Missing function ${name}`);
        const end = source.indexOf('\n    }', start) + '\n    }'.length;
        vm.runInContext(source.slice(start, end), context);
    }
}

// Exercise the real popup and loader together without booting the wiki layout.
function harness() {
    const requests = [];
    const rendered = [];
    const pane = () => ({
        dataset: {}, isConnected: true,
        classList: { add() {} },
        removeAttribute() {},
        querySelectorAll: () => [],
        replaceChildren(content) { this.innerHTML = content; }
    });
    const context = vm.createContext({
        console, URL,
        location: new URL('https://wiki.example/'),
        document: { createElement: pane },
        window: { FokusPaneProviders: { forId: () => ({ load: () => new Promise(resolve => requests.push(resolve)) }) } },
        navigationVersion: 17,
        zoomPane: null,
        toggleZoomPane(value) { context.zoomPane = value; },
        setZoomButtonState() {},
        registerRecentContent() {},
        addPaneControls(value) { rendered.push(value); },
        updateFocusedLayout() {},
        initializeAdapters() {},
        refreshOpenPageLinks() {},
        updatePaneIndexes() {}
    });
    loadFunctions(context, ['nextPaneLoadToken', 'loadPane', 'openPagePopup', 'closeNativeEdit']);
    const respond = index => requests[index]({
        content: 'Revision history', provider: 'wiki', url: 'https://wiki.example/article',
        parsedDocument: { title: 'Article' }
    });
    return { context, requests, rendered, pane, respond };
}

Deno.test('Revisions popup renders even when the navigation counter has advanced', async () => {
    const { context, respond, rendered } = harness();
    const loading = context.openPagePopup('https://wiki.example/?do=revisions&id=article', 'article', null);
    const popup = context.zoomPane;
    assert.match(popup.innerHTML, /Loading/);
    respond(0);
    await loading;
    assert.equal(popup.innerHTML, 'Revision history');
    assert.equal(rendered.length, 1);
});

Deno.test('Closing a revisions popup while loading discards its response', async () => {
    const { context, respond, rendered } = harness();
    const loading = context.openPagePopup('https://wiki.example/?do=revisions&id=article', 'article', null);
    context.zoomPane.isConnected = false;
    respond(0);
    await loading;
    assert.equal(rendered.length, 0);
});

Deno.test('An older response cannot replace a newer load of the same pane', async () => {
    const { context, pane, respond, rendered } = harness();
    const target = pane();
    target.dataset.pageId = 'article';
    const first = context.loadPane(target, 'https://wiki.example/article', 'article');
    const second = context.loadPane(target, 'https://wiki.example/article', 'article');
    respond(1);
    assert.equal(await second, true);
    respond(0);
    assert.equal(await first, false);
    assert.equal(rendered.length, 1);
});

Deno.test('Saving an edit refreshes the pane with its own load token', async () => {
    const { context, pane, respond, rendered } = harness();
    const target = pane();
    target.dataset.pageId = 'article';
    target.classList.contains = () => true;
    Object.assign(context, {
        editBackdrop: { remove() {} }, editPane: target, editTrigger: null,
        editComplete: null, editDirty: false
    });
    context.infinitePanelsUrlFromId = () => 'https://wiki.example/article';
    assert.equal(context.closeNativeEdit(true), true);
    respond(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(target.innerHTML, 'Revision history');
    assert.equal(rendered.length, 1);
});

function navigationHarness(ids = ['start']) {
    const appended = [];
    const context = vm.createContext({
        URL, startPageId: 'start',
        paneElements: ids.map(id => ({ dataset: { pageId: id } })),
        navigationVersion: 0,
        window: {
            location: { href: 'https://wiki.example/start', origin: 'https://wiki.example' },
            FokusPaneProviders: { forId: id => ({ name: id.startsWith('wp.') ? 'wikipedia'
                : id.startsWith('example.') ? 'example' : 'wiki' }) }
        },
        pageIdForUrl: url => new URL(url).pathname.slice(1),
        infinitePanelsUrlFromId: id => `https://wiki.example/${id}`,
        openPaneAfter: (...args) => appended.push(args)
    });
    loadFunctions(context, ['normalizePageId', 'navigateFromStartPage', 'openInInfinitePanels']);
    return { context, appended };
}

Deno.test('Sidebar navigation replaces the lone start page with a wiki page', async () => {
    const { context, appended } = navigationHarness();
    await context.openInInfinitePanels('https://wiki.example/article#section', true, 'article');
    assert.equal(context.window.location.href, 'https://wiki.example/article#section');
    assert.equal(appended.length, 0);
});

Deno.test('Sidebar navigation hosts external providers as the sole visible page', async () => {
    for (const id of ['wp.en.Capacitor#History', 'example.article']) {
        const { context, appended } = navigationHarness();
        await context.openInInfinitePanels('https://external.example/article', true, id);
        const destination = new URL(context.window.location.href);
        assert.equal(destination.origin, 'https://wiki.example');
        assert.equal(destination.searchParams.get('p'), id);
        assert.equal(destination.searchParams.has('fokus-wikipedia-only'), false);
        assert.equal([...destination.searchParams].length, 1);
        assert.equal(appended.length, 0);
    }
});

Deno.test('Normal workspaces continue appending sidebar pages', async () => {
    for (const ids of [['article'], ['start', 'article']]) {
        const { context, appended } = navigationHarness(ids);
        await context.openInInfinitePanels('https://wiki.example/next', true, 'next');
        assert.equal(context.window.location.href, 'https://wiki.example/start');
        assert.equal(appended.length, 1);
        assert.equal(appended[0][0], ids.length - 1);
    }
});

Deno.test('Workspace restoration does not redirect away from the start-page host', async () => {
    const { context, appended } = navigationHarness();
    await context.openInInfinitePanels('https://wiki.example/article', false, 'article');
    assert.equal(appended.length, 1);
    assert.equal(context.window.location.href, 'https://wiki.example/start');
});

function restorationHarness(rootId, query) {
    const { context } = navigationHarness([rootId]);
    const classes = () => {
        const values = new Set();
        return {
            contains: name => values.has(name),
            remove: name => values.delete(name),
            add: name => values.add(name),
            toggle(name, on) { if (on) values.add(name); else values.delete(name); }
        };
    };
    context.window.location.href = `https://wiki.example/${rootId}${query}`;
    context.window.history = {
        state: null,
        replaceState(_state, _title, url) { context.window.location.href = url; }
    };
    context.paneElements[0].classList = classes();
    Object.assign(context, {
        currentPageId: rootId,
        document: { body: { classList: classes() } },
        focusedPaneIndexes: new Set(), focusedPaneIndex: 0,
        viewport: null,
        updateFocusedLayout() {}, ensurePaneVisible() {},
        closeAfter(index) { context.paneElements.splice(index + 1); },
        async openPaneAfter(_index, _url, id) {
            context.paneElements.push({ dataset: { pageId: id }, classList: classes() });
        }
    });
    loadFunctions(context, ['paneStateFromUrl', 'restorePanesFromUrl']);
    return context;
}

Deno.test('Reload and Back infer the hidden start-page host from the first provider', async () => {
    const context = restorationHarness('start', '?p=wp.en.Capacitor');
    await context.restorePanesFromUrl();
    assert.equal(context.paneElements[0].classList.contains('infinitepanels-wikipedia-only-host'), true);
    assert.equal(context.paneElements[1].dataset.pageId, 'wp.en.Capacitor');
    context.window.location.href = 'https://wiki.example/start';
    await context.restorePanesFromUrl();
    assert.equal(context.paneElements.length, 1);
    assert.equal(context.paneElements[0].classList.contains('infinitepanels-wikipedia-only-host'), false);
});

Deno.test('Inference preserves ordinary wiki roots and supports other external providers', async () => {
    for (const [root, query, hidden] of [
        ['article', '?p=wp.en.Capacitor', false],
        ['start', '?p=article&p=wp.en.Capacitor', false],
        ['start', '?p=example.article', true],
        ['start', '?f=wp.en.Capacitor', true],
        ['start', '?m=wp.en.Capacitor', true]
    ]) {
        const context = restorationHarness(root, query);
        await context.restorePanesFromUrl();
        assert.equal(context.paneElements[0].classList.contains('infinitepanels-wikipedia-only-host'), hidden);
    }
});

Deno.test('Older workspace URLs still restore and lose the redundant flag', async () => {
    const context = restorationHarness('start', '?fokus-wikipedia-only=1&p=wp.en.Capacitor');
    await context.restorePanesFromUrl();
    assert.equal(context.window.location.href, 'https://wiki.example/start?p=wp.en.Capacitor');
    assert.equal(context.paneElements[0].classList.contains('infinitepanels-wikipedia-only-host'), true);
});

Deno.test('Promoting an external pane to the first pane produces a URL without a flag', () => {
    const { context } = navigationHarness(['article', 'wp.en.Capacitor']);
    context.paneElements[1].dataset.provider = 'wikipedia';
    context.paneElements[1].classList = { contains: () => false };
    context.document = { body: { classList: { contains: () => false } } };
    context.location = context.window.location;
    loadFunctions(context, ['closeRootPane']);
    context.closeRootPane();
    assert.equal(context.window.location.href, 'https://wiki.example/start?p=wp.en.Capacitor');
});
