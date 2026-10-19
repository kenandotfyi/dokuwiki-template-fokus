import { strict as assert } from 'node:assert';

const listeners = new Map();
const wikipedia = {};
let selection = null;
let removed = [];
globalThis.window = { getSelection: () => selection };
globalThis.document = {
    addEventListener: (type, handler, capture) => listeners.set(type, { handler, capture }),
    querySelectorAll: () => [wikipedia],
    getElementById: id => ({ remove: () => removed.push(id) })
};
await import('./annotations.js');

Deno.test('Wikipedia selections do not reach global wiki annotation listeners', () => {
    for (const type of ['mouseup', 'touchend']) {
        removed = [];
        selection = { isCollapsed: false, rangeCount: 1, getRangeAt: () => ({ intersectsNode: root => root === wikipedia }) };
        let stopped = false;
        assert.equal(listeners.get(type).capture, true);
        listeners.get(type).handler({ stopPropagation: () => { stopped = true; } });
        assert.equal(stopped, true);
        assert.deepEqual(removed, ['ann-tooltip', 'infinitepanels-ann-tooltip']);
    }
});

Deno.test('Wiki text selections and ordinary clicks remain available to annotations', () => {
    for (const current of [null, { isCollapsed: true, rangeCount: 0 },
        { isCollapsed: false, rangeCount: 1, getRangeAt: () => ({ intersectsNode: () => false }) }]) {
        selection = current;
        listeners.get('mouseup').handler({ stopPropagation: () => assert.fail('Wiki selection was blocked') });
    }
});

Deno.test('Wikipedia IDs and external containers cannot initialize annotations', () => {
    const source = { get scripts() { assert.fail('External content reached annotation initialization'); } };
    window.InfinitePanelsAdapters.annotations.init('wp.en.Capacitor', { dataset: {} }, source);
    window.InfinitePanelsAdapters.annotations.init('article', { dataset: { provider: 'wikipedia' } }, source);
});
