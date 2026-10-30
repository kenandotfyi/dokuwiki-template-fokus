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
let failures = [];
const controller = { signal: {} };
const context = vm.createContext({
    providers, config: { wikipedia: true }, URLSearchParams, DOKU_BASE: '/',
    fetch: async (url, options) => {
        calls.push({ url, options });
        const language = options.body.get('language');
        if (failures.includes(language)) throw new Error(language + ' unavailable');
        return { ok: true, json: async () => ({ ok: true, results: [1, 2].map(rank => ({ title: language + ' result ' + rank, url: 'https://' + language + '.wikipedia.org/wiki/Result_' + rank, excerpt: 'Electron energy' })) }) };
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
    assert.deepEqual(calls.map(call => call.options.body.get('language')), ['en', 'de']);
    assert.ok(calls.every(call => call.options.signal === controller.signal));
    assert.equal(Array.from(result.results, row => row.language).join(','), 'en,de,en,de');
    assert.equal(result.results[1].openUrl, 'https://de.wikipedia.org/wiki/Result_1');
    assert.equal(result.warning, null);
    failures = ['de'];
    const partial = await providers.get('wikipedia').search('Fermi level', { signal: controller.signal });
    assert.equal(partial.results.length, 2);
    assert.ok(partial.results.every(row => row.language === 'en'));
    assert.match(partial.warning, /DE.*unavailable/);
    failures = ['en'];
    const german = await providers.get('wikipedia').search('Fermi level', { signal: controller.signal });
    assert.ok(german.results.every(row => row.language === 'de'));
    failures = ['en', 'de'];
    await assert.rejects(() => providers.get('wikipedia').search('Fermi level', { signal: controller.signal }), /unavailable/);
    console.log('PASS: Wikipedia source isolation, two editions, alternating ranks, cancellation signals and partial/full failures.');
})().catch(error => { console.error(error); process.exitCode = 1; });
