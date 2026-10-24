const assert = require('node:assert/strict');
(async () => {
    const {sidebarDropPlan: plan} = await import('../moves.js');
    const pages = new Map([['scope.txt', {id:'scope'}], ['electronics/probe.txt', {id:'electronics:probe'}], ['archive/probe.txt',{id:'archive:probe'}]]);
    const ids = new Map([...pages.values()].map(page => [page.id, page]));
    const directories = new Set(['electronics/', 'electronics/parts/', 'archive/']);
    const drop = (source, parent = '') => ({draggedPaths:[source], target:{kind:parent ? 'directory':'root', directoryPath:parent || null}});
    assert.deepEqual(plan(drop('scope.txt','electronics/'),pages,ids,directories), {id:'scope',scope:'page',destination:'electronics:scope'});
    assert.deepEqual(plan(drop('electronics/probe.txt'),pages,ids,directories), {id:'electronics:probe',scope:'page',destination:'probe'});
    assert.deepEqual(plan(drop('electronics/','archive/'),pages,ids,directories), {id:'electronics',scope:'namespace',destination:'archive:electronics'});
    for (const context of [drop('scope.txt'),drop('electronics/probe.txt','electronics/'),drop('electronics/','electronics/parts/'),drop('electronics/','electronics/'),drop('electronics/probe.txt','archive/'),drop('unknown.txt','archive/'),drop('scope.txt','unknown/'),{...drop('scope.txt','archive/'),draggedPaths:['scope.txt','electronics/probe.txt']}]) {
        assert.equal(plan(context,pages,ids,directories),null);
    }
    directories.add('archive/electronics/');
    assert.equal(plan(drop('electronics/','archive/'),pages,ids,directories),null,'Existing namespaces cannot be overwritten');
    assert.deepEqual(plan(drop('electronics/parts/'),pages,ids,directories),{id:'electronics:parts',scope:'namespace',destination:'parts'});
    assert.equal(pages.has('scope.txt'),true,'Planning leaves the source untouched');
    console.log('PASS: page/namespace moves, root drops, same-parent rejection, descendant guards, collisions, unknown targets, and single-item scope.');
})().catch(error => { console.error(error); process.exitCode = 1; });
