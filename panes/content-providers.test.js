import { strict as assert } from 'node:assert';

globalThis.window = { FokusButlerContentConfig: { enabled: true } };
globalThis.location = new URL('https://wiki.example/notes/doku.php?id=fermi_level');
globalThis.DOKU_BASE = '/notes/';
await import('./content-providers.js');
const providers = window.FokusPaneProviders;
const wikipedia = providers.forId('wp.en.Pauli_exclusion_principle');

Deno.test('Wikipedia identifiers preserve edition, case, dots, and section fragments', () => {
    for (const [url, id] of [
        ['https://en.wikipedia.org/wiki/Pauli_exclusion_principle', 'wp.en.Pauli_exclusion_principle'],
        ['https://de.m.wikipedia.org/wiki/Pauli-Prinzip#Geschichte', 'wp.de.Pauli-Prinzip#Geschichte'],
        ['https://en.wikipedia.org/wiki/Dr._No', 'wp.en.Dr._No'],
        ['https://de.wikipedia.org/w/index.php?title=Schr%C3%B6dinger-Gleichung', 'wp.de.Schrödinger-Gleichung'],
        ['https://en.wikipedia.org/wiki/A%25B', 'wp.en.A%B']
    ]) {
        assert.equal(providers.fromUrl(url).id, id);
        assert.equal(providers.fromUrl(providers.urlForId(id)).id, id);
    }
});

Deno.test('External providers reject unrelated hosts, credentials, and non-article namespaces', () => {
    for (const url of ['https://en.wikipedia.org.evil.test/wiki/Earth', 'https://user@en.wikipedia.org/wiki/Earth',
        'https://en.wikipedia.org:8443/wiki/Earth', 'ftp://en.wikipedia.org/wiki/Earth',
        'https://en.wikipedia.org/wiki/File:Example.jpg', 'https://en.wikipedia.org/wiki/Special:Random']) {
        assert.equal(providers.fromUrl(url), undefined);
    }
});

function link(href, options = {}) {
    return { href, matches: () => Boolean(options.original),
        closest: selector => selector.includes('.mw-ref') ? Boolean(options.citation) : Boolean(options.wikipedia),
        querySelector: () => options.image || null,
        getAttribute: () => options.fragment || href,
        classList: { contains: () => Boolean(options.interwiki) } };
}

Deno.test('Only article navigation is captured; citations, original links, and images are excluded', () => {
    const url = 'https://en.wikipedia.org/wiki/Quantum_mechanics';
    assert.equal(providers.fromLink(link(url, { interwiki: true })).provider, wikipedia);
    assert.equal(providers.fromLink(link(url, { wikipedia: true })).id, 'wp.en.Quantum_mechanics');
    for (const options of [{ original: true }, { citation: true }, { image: {} }, { fragment: '#section' }]) {
        assert.equal(providers.fromLink(link(url, { interwiki: true, ...options })), null);
    }
    window.FokusButlerContentConfig.enabled = false;
    assert.equal(providers.fromLink(link(url, { interwiki: true })), null);
    window.FokusButlerContentConfig.enabled = true;
});

Deno.test('Wikipedia routing remains active when page previews are disabled', () => {
    window.FokusButlerPreviewConfig = { enabled: false };
    const target = providers.fromLink(link('https://en.wikipedia.org/wiki/Capacitor', { interwiki: true }));
    assert.equal(target.id, 'wp.en.Capacitor');
    assert.equal(target.provider.name, 'wikipedia');
});

Deno.test('Wiki identifiers use the wiki provider and retain namespace separators', () => {
    assert.equal(providers.forId('component:capacitor').name, 'wiki');
    assert.equal(providers.urlForId('component:capacitor'), 'https://wiki.example/notes/component:capacitor');
    assert.equal(providers.forId('wp.bad'), undefined);
    assert.equal(providers.forId('wpsearch.bad'), undefined);
});

Deno.test('Wikipedia search IDs stay distinct from articles and round-trip the exact query', () => {
    for (const query of ['Fermi level', 'A_B', 'A%20B', 'R&D #1', 'Dr. No', 'Schrödinger equation']) {
        const target = wikipedia.searchTarget(query, 'de');
        assert.ok(target.id.startsWith('wpsearch.de.'));
        assert.equal(providers.forId(target.id), wikipedia);
        const url = providers.urlForId(target.id);
        assert.equal(new URL(url).searchParams.get('search'), query);
        assert.equal(providers.fromUrl(url).id, target.id);
    }
    assert.equal(wikipedia.searchTarget('Fermi level').id, 'wpsearch.en.Fermi_level');
    assert.notEqual(wikipedia.searchTarget('Fermi level').id, providers.fromUrl('https://en.wikipedia.org/wiki/Fermi_level').id);
});

Deno.test('Wikipedia searches reject invalid editions, blank queries, and unrelated URLs', () => {
    assert.equal(wikipedia.searchTarget('   '), null);
    assert.equal(wikipedia.searchTarget('bad\nquery'), null);
    assert.equal(wikipedia.searchTarget('test', 'en.evil.test'), null);
    assert.equal(providers.fromUrl('https://en.wikipedia.org.evil.test/w/index.php?search=Earth'), undefined);
});

Deno.test('Registry can accept another provider without modifying pane navigation', () => {
    providers.register({ name: 'example', matches: id => id.startsWith('example.'), urlForId: id => 'https://example.org/' + id.slice(8) });
    assert.equal(providers.forId('example.article').name, 'example');
    assert.equal(providers.urlForId('example.article'), 'https://example.org/article');
});
