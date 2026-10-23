const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../palette.js'), 'utf8');
const providers = new Map([['wiki', { id: 'wiki' }]]);
let pending;
let calls = [];
let loaded = [];
let cancelled = 0;
const controller = { signal: {} };
const context = vm.createContext({
    providers, config: { wikipedia: true }, URLSearchParams, DOKU_BASE: '/',
    fetch: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ ok: true, results: [{ title: 'Fermi level', url: 'https://en.wikipedia.org/wiki/Fermi_level', excerpt: 'Electron energy' }] }) };
    },
    filter: 'all', states: new Map(), input: { value: 'Fermi level' }, revision: 1,
    AbortController: function () { return controller; }, URL, location: { origin: 'http://localhost' },
    fulltext: {}, render() {}, cancelSearch: () => cancelled++,
    window: { setTimeout: fn => { pending = fn; } },
    load: provider => loaded.push(provider.id)
});
vm.runInContext(source.slice(source.indexOf('        if (config.wikipedia)'), source.indexOf('        const states =')), context);
vm.runInContext(source.slice(source.indexOf('        function visibleProviders('), source.indexOf('        function rows(')), context);
vm.runInContext(source.slice(source.indexOf('        function search(preserve)'), source.indexOf('        async function load(')), context);
context.search(false);
pending();
assert.deepEqual(loaded, ['wiki'], 'All must not issue Wikipedia requests');
context.filter = 'wikipedia';
context.search(false);
pending();
assert.deepEqual(loaded, ['wiki', 'wikipedia'], 'Wikipedia must search only its own provider');
assert.equal(cancelled, 2, 'Changing sources cancels previous requests');
(async () => {
    const result = await providers.get('wikipedia').search('Fermi level', { signal: controller.signal });
    assert.equal(calls[0].options.body.get('provider'), 'wikipedia-search');
    assert.equal(calls[0].options.body.get('query'), 'Fermi level');
    assert.equal(calls[0].options.signal, controller.signal);
    assert.equal(result.results[0].kind, 'wikipedia');
    assert.equal(result.results[0].text, 'Electron energy');
    console.log('PASS: Wikipedia source isolation, cancellation, request mapping and result normalization.');
})().catch(error => { console.error(error); process.exitCode = 1; });
