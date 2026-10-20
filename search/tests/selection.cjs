const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const selectionSource = fs.readFileSync(path.join(__dirname, '../../selection-search.js'), 'utf8');
const selectionFunctions = selectionSource.slice(selectionSource.indexOf('    function elementFor('), selectionSource.indexOf('    function dismiss('));
let current;
let excluded = false;
let inside = true;
const provider = { dataset: { pageUrl: 'https://de.wikipedia.org/wiki/Elektron' } };
const root = { contains: () => inside, closest: () => inside };
const node = {
    nodeType: 1,
    closest(selector) {
        if (selector === '.page, .fokus-preview-body') return root;
        if (selector === '[data-provider="wikipedia"]') return provider;
        return excluded;
    }
};
const range = { startContainer: node, endContainer: node, commonAncestorContainer: node, getBoundingClientRect: () => ({ bottom: 100 }) };
const capture = vm.createContext({ Node: { ELEMENT_NODE: 1 }, URL, excluded: 'editable', window: { getSelection: () => current } });
vm.runInContext(selectionFunctions, capture);
current = { isCollapsed: false, rangeCount: 1, getRangeAt: () => range, toString: () => '  Fermi\n  level & electrons  ' };
assert.equal(capture.captureSelection().text, 'Fermi level & electrons');
assert.equal(capture.captureSelection().language, 'de');
provider.dataset.pageUrl = 'https://en.wikipedia.org.evil.test/wiki/Example';
assert.equal(capture.captureSelection().language, 'en');
excluded = true;
assert.equal(capture.captureSelection(), null, 'Editable fields must not trigger the toolbar');
excluded = false;
inside = false;
assert.equal(capture.captureSelection(), null, 'Selections across content roots must not trigger the toolbar');
inside = true;
current.isCollapsed = true;
assert.equal(capture.captureSelection(), null);

const palette = fs.readFileSync(path.join(__dirname, '../palette.js'), 'utf8');
const openFunction = palette.slice(palette.indexOf('        function openSearch('), palette.indexOf('        opener = openSearch;'));
let searches = 0;
let shown = 0;
const input = { value: 'previous query', focus() {}, select() {}, setAttribute() {} };
const dialog = { open: false, showModal() { this.open = true; shown++; } };
const context = vm.createContext({
    input, dialog, filter: 'all', providers: new Map([['wiki', {}]]),
    document: { activeElement: null },
    captureEditor: () => null,
    search: () => searches++, hint() {}, statusProvider: null
});
vm.runInContext(openFunction, context);
context.openSearch('Fermi level & electrons', { provider: 'wiki' });
assert.equal(input.value, 'Fermi level & electrons');
assert.equal(context.filter, 'wiki');
assert.equal(shown, 1);
assert.equal(searches, 1);
context.openSearch('Pauli principle', { provider: 'wiki' });
assert.equal(input.value, 'Pauli principle');
assert.equal(shown, 1, 'An already-open modal must not be opened again');
assert.equal(searches, 2, 'An updated selection must trigger a fresh search');
context.openSearch({ type: 'click' });
assert.equal(input.value, 'Pauli principle', 'Normal toolbar events must preserve the previous query');
assert.equal(searches, 2);
console.log('PASS: selected-text normalization, content boundaries, editable-field exclusion, Wikipedia edition, wiki filter, and search-modal reuse.');
