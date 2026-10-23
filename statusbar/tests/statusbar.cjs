const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../statusbar.js'), 'utf8');
const items = new Map(['pages', 'health', 'tasks', 'zotero'].map(id => [id, { dataset: {}, querySelector: () => items.get(id).label, label: {} }]));
const context = vm.createContext({
    document: { getElementById: id => items.get(id.replace('fokus-status-', '')) },
    syncRunning: false, lastZotero: null,
    syncButton: { disabled: false, setAttribute() {} }
});
vm.runInContext(source.slice(source.indexOf('    function set('), source.indexOf('    async function json(')), context);
vm.runInContext(source.slice(source.indexOf('    function syncActive('), source.indexOf('    async function refresh(')), context);
context.wiki({ pages: 12, health: { healthy: 8, noContent: 3, unknown: 1 }, tasks: { total: 5, open: 2, completed: 3 } });
assert.equal(items.get('pages').label.textContent, '12 pages');
assert.match(items.get('health').label.textContent, /1 unchecked/);
assert.equal(items.get('tasks').label.textContent, '2 open tasks');
assert.match(items.get('tasks').title, /5 total · 3 completed/);
context.wiki({ pages: 12, health: null });
assert.equal(items.get('health').hidden, true);
assert.equal(items.get('tasks').label.textContent, '2 open tasks', 'Explorer updates must preserve task totals');
context.wiki({ pages: 12, health: null, tasks: { total: 1, open: 0, completed: 1 } });
assert.equal(items.get('tasks').label.textContent, '0 open tasks', 'Only open tasks belong in the visible label');
assert.match(items.get('tasks').title, /1 total · 1 completed/);
assert.equal(context.zotero({ job: { phase: 'items', processedItems: 2, totalItems: 9 } }), true);
assert.equal(items.get('zotero').label.textContent, 'Zotero syncing… 2/9');
context.zotero({ lastChecked: 1, job: { phase: 'completed' } });
const syncTime = new Date(1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
assert.equal(items.get('zotero').label.textContent, 'Zotero synced ' + syncTime);
context.zotero({ lastChecked: 1, lastError: 'Remote failure' });
assert.equal(items.get('zotero').label.textContent, 'Zotero sync failed · last synced ' + syncTime);
context.zotero({ lastError: 'Remote failure' });
assert.equal(items.get('zotero').dataset.state, 'error');
assert.equal(items.get('zotero').label.textContent, 'Zotero sync failed');

(async () => {
    const operations = [];
    context.window = { clearTimeout() {}, setTimeout(fn, delay) { if (delay === 200) fn(); return 1; } };
    context.refresh = () => {};
    context.timer = null;
    context.requestSync = async operation => {
        operations.push(operation);
        return operation === 'start' ? { job: { phase: 'items', processedItems: 0, totalItems: 1 } } : { lastChecked: 1, job: { phase: 'completed' } };
    };
    const running = context.syncNow();
    assert.equal(context.syncButton.disabled, true);
    assert.equal(items.get('zotero').dataset.state, 'syncing');
    await context.syncNow();
    await running;
    assert.deepEqual(operations, ['start', 'step'], 'Repeated clicks must not start duplicate jobs');
    assert.equal(context.syncButton.disabled, false);
    assert.equal(items.get('zotero').dataset.state, 'synced');
    context.requestSync = async () => { throw new Error('Network failure'); };
    await context.syncNow();
    assert.equal(context.syncButton.disabled, false);
    assert.equal(items.get('zotero').dataset.state, 'error');
    console.log('PASS: status labels, optional modules, sync lifecycle, duplicate-click guard, and failure recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });
