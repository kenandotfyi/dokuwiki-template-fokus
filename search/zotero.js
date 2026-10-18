(function () {
    'use strict';
    const api = window.FokusSearch;
    if (!api || !window.FokusSearchConfig.zotero) return;
    ['document', 'annotation'].forEach(function (kind) {
        api.registerProvider({
            id: kind,
            label: kind === 'document' ? 'Documents' : 'Annotations',
            search: async function (query, options) {
                const url = new URL(DOKU_BASE + 'lib/exe/ajax.php', location.origin);
                url.search = new URLSearchParams({ call: 'zoterobridge_search', q: query, kind: kind, limit: options.limit, offset: options.offset, match: options.matchMode || 'words' });
                const response = await fetch(url.href, { credentials: 'same-origin', signal: options.signal });
                if (!response.ok) throw new Error(response.status === 403 ? 'Zotero access is restricted.' : 'Zotero search is unavailable.');
                return response.json();
            }
        });
    });
    api.setStatusProvider(async function (signal) {
        const response = await fetch(DOKU_BASE + 'lib/exe/ajax.php?call=zoterobridge_status', { credentials: 'same-origin', signal: signal });
        if (!response.ok) throw new Error('Could not read Zotero status.');
        return response.json();
    });
    api.setAutoSyncProvider(async function () {
        const endpoint = DOKU_BASE + 'lib/exe/ajax.php';
        async function request(operation) {
            const body = new URLSearchParams({ call: 'zoterobridge_sync', operation: operation, sectok: window.FokusSearchConfig.securityToken });
            const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', body: body });
            const status = await response.json();
            if (!response.ok) throw new Error(status.error || 'Automatic synchronization could not continue.');
            return status;
        }
        let status = await request('start');
        while (status.job && !['completed', 'failed', 'paused'].includes(status.job.phase)) {
            await new Promise(resolve => window.setTimeout(resolve, 200));
            status = await request('step');
        }
        return status;
    });
})();
