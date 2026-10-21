const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../palette.js'), 'utf8');
let visible = true;
const textarea = { value: 'old textarea', isConnected: true, selectionStart: 1, selectionEnd: 3, scrollTop: 7, getClientRects: () => visible ? [{}] : [], dispatchEvent() {} };
let value = 'current editor';
let readOnly = false;
let selection;
let inserted;
let saved = false;
let warning;
const cm = {
    getTextArea: () => textarea,
    getWrapperElement: () => ({ getClientRects: () => [{}] }),
    getOption: () => readOnly,
    getValue: () => value,
    getCursor: which => ({ ch: which === 'from' ? 2 : 5 }),
    indexFromPos: pos => pos.ch,
    posFromIndex: ch => ({ ch }),
    getScrollInfo: () => ({ left: 0, top: 12 }),
    focus() {}, setSelection: (from, to) => { selection = [from.ch, to.ch]; },
    replaceSelection: text => { inserted = text; },
    save: () => { saved = true; }, scrollTo() {}
};
const context = vm.createContext({
    document: { getElementById: () => textarea }, window: {},
    format: { reference: () => '[[reference]]' }, chosenPDF: null,
    hint: text => { warning = text; }, closeSearch() {}, Event: class {}
});
vm.runInContext(source.slice(source.indexOf('        function captureEditor('), source.indexOf('        function openSearch(')), context);
vm.runInContext(source.slice(source.indexOf('        function insertResult('), source.indexOf('        function activate(')), context);
assert.equal(context.captureEditor().value, 'old textarea');
visible = false;
assert.equal(context.captureEditor(), null, 'A hidden plain textarea is not an editor');
context.window.plugin_codemirror = { cm };
context.editor = context.captureEditor();
assert.equal(context.editor.value, value, 'Read the live CodeMirror document, not the stale textarea');
context.insertResult({}, false);
assert.deepEqual(selection, [2, 5], 'Preserve the CodeMirror selection');
assert.equal(inserted, '[[reference]]');
assert.equal(saved, true, 'Synchronize the backing textarea');
value = 'edited while searching';
inserted = undefined;
context.insertResult({}, false);
assert.equal(inserted, undefined);
assert.match(warning, /editor changed/);
readOnly = true;
assert.equal(context.captureEditor(), null, 'Read-only CodeMirror must not allow insertion');
console.log('PASS: native and CodeMirror detection, selection insertion, synchronization, stale document and read-only guards.');
