(function () {
    'use strict';
    const bar = document.getElementById('fokus-statusbar');
    if (!bar) return;
    let timer;
    let busy = false;
    let syncRunning = false;
    let lastZotero = null;
    const syncButton = document.getElementById('fokus-status-sync');
    function set(id, text, title, state = '') {
        const item = document.getElementById('fokus-status-' + id);
        item.hidden = text === null;
        item.querySelector('span').textContent = text || '';
        item.title = title || '';
        item.dataset.state = state;
    }
    function memos(data) {
        if (!data) { set('memos-sync', null, ''); return; }
        if (data.unavailable) { set('memos-sync', 'Memos unavailable', 'Could not read local Memos sync status.', 'error'); return; }
        const active = !!data.syncing && !data.stale;
        const failed = !active && !!data.stale;
        const syncTime = data.syncedAt ? new Date(data.syncedAt * 1000).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'}) : '';
        const checked = data.syncedAt ? new Date(data.syncedAt * 1000).toLocaleString() : 'Never';
        const text = active ? 'Memos syncing…' : failed ? 'Memos sync failed' : data.syncedAt ? 'Memos synced' : 'Memos not synced';
        const timestamp = syncTime ? (active || failed ? ` · last synced ${syncTime}` : ` ${syncTime}`) : '';
        set('memos-sync', text + timestamp, `Last successful Memos sync: ${checked}.` + (failed ? ' Showing the last saved local mirror.' : ''),
            active ? 'syncing' : failed ? 'error' : data.syncedAt ? 'synced' : '');
    }
    function jots(data) {
        memos(data);
        if (!data) { set('jots', null, ''); return; }
        if (data.unavailable) { set('jots', 'Jots unavailable', 'Could not read the local Jots mirror.', 'error'); return; }
        const text = data.total === null ? 'Jots not synced' : `${data.total} ${data.total === 1 ? 'jot' : 'jots'}`;
        const synced = data.syncedAt ? ` Last synced ${new Date(data.syncedAt * 1000).toLocaleString()}.` : '';
        set('jots', text, 'Total saved jots, including archived notes, in your local Memos mirror.' + synced +
            (data.syncing ? ' Sync in progress.' : '') + (data.stale ? ' Last sync failed; showing cached totals.' : ''));
    }
    function wiki(data) {
        set('pages', `${data.pages} ${data.pages === 1 ? 'page' : 'pages'}`, 'Pages you can read in this wiki, independent of sidebar filters.');
        if (data.media !== undefined) {
            const m = data.media;
            if (!m) set('media', null, '');
            else if (m.unavailable) set('media', 'Media unavailable', 'Could not count readable media files.', 'error');
            else {
                const parts = [`${m.images} ${m.images === 1 ? 'image' : 'images'}`, `${m.pdfs} ${m.pdfs === 1 ? 'PDF' : 'PDFs'}`];
                for (const [key, label] of [['audio', 'audio'], ['video', 'video'], ['other', 'other']]) {
                    if (m[key]) parts.push(`${m[key]} ${label} ${m[key] === 1 ? 'file' : 'files'}`);
                }
                set('media', parts.join(' · '), `${m.total} media ${m.total === 1 ? 'file' : 'files'} you can read. All image formats are grouped together; PDFs are counted separately.`);
            }
        }
        if (data.jots !== undefined) jots(data.jots);
        const h = data.health;
        set('health', h ? `${h.healthy} healthy · ${h.noContent} no content${h.unknown ? ` · ${h.unknown} unchecked` : ''}` : null, 'Page Health across readable wiki pages. Unchecked pages await classification.');
        if (data.tasks !== undefined) {
            const t = data.tasks;
            set('tasks', t ? (t.unavailable ? 'Todoist unavailable' : `${t.open} open ${t.open === 1 ? 'task' : 'tasks'}${t.stale ? ' · cached' : ''}`) : null,
                t ? (t.unavailable ? 'No confirmed Todoist project snapshot is available.' : `${t.total} total · ${t.completed} completed in the Todoist project.${t.error ? ' ' + t.error : ''}${t.stale ? ' Showing cached counts.' : ''}`) : '', t?.unavailable || t?.stale ? 'error' : '');
        }
    }
    async function json(url, timeout = 15000) {
        const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Status unavailable');
        return response.json();
    }
    function syncActive(data) {
        return data.job && !['completed', 'failed', 'paused'].includes(data.job.phase);
    }
    function zotero(data) {
        lastZotero = data;
        const job = data.job;
        const active = syncRunning || syncActive(data);
        const checked = data.lastChecked ? new Date(data.lastChecked * 1000).toLocaleString() : 'Never';
        const syncTime = data.lastChecked ? new Date(data.lastChecked * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
        const detail = `Last successful check: ${checked}. ${data.counts?.document || 0} documents · ${data.counts?.annotation || 0} annotations indexed locally.`;
        const failed = !active && (!!data.lastError || ['failed', 'paused'].includes(job?.phase));
        const text = active ? `Zotero syncing…${job?.totalItems ? ` ${job.processedItems}/${job.totalItems}` : ''}` : failed ? 'Zotero sync failed' : data.lastChecked ? 'Zotero synced' : 'Zotero not synced';
        const timestamp = syncTime ? (active || failed ? ` · last synced ${syncTime}` : ` ${syncTime}`) : '';
        set('zotero', text + timestamp, detail, active ? 'syncing' : failed ? 'error' : data.lastChecked ? 'synced' : '');
        if (syncButton) {
            syncButton.disabled = syncRunning;
            syncButton.setAttribute('aria-busy', String(!!active));
        }
        return active;
    }
    async function requestSync(operation) {
        const response = await fetch(bar.dataset.ajax, {
            method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(90000),
            body: new URLSearchParams({ call: 'zoterobridge_sync', operation, sectok: bar.dataset.token }),
            headers: { Accept: 'application/json' }
        });
        const data = await response.json();
        if (response.status === 409 && data.busy) return data;
        if (!response.ok) throw new Error(data.error || 'Zotero sync failed.');
        return data;
    }
    async function syncNow() {
        if (syncRunning) return;
        syncRunning = true;
        window.clearTimeout(timer);
        zotero(lastZotero || {});
        try {
            let data = await requestSync('start');
            while (data.busy || syncActive(data)) {
                zotero(data);
                await new Promise(resolve => window.setTimeout(resolve, 200));
                data = await requestSync('step');
            }
            syncRunning = false;
            zotero(data);
        } catch (error) {
            syncRunning = false;
            zotero({ ...lastZotero, job: null, lastError: error.message });
        } finally {
            timer = window.setTimeout(refresh, 60000);
        }
    }
    async function refresh() {
        if (busy || document.hidden) return;
        window.clearTimeout(timer);
        busy = true;
        let syncing = false;
        const jobs = [json(bar.dataset.endpoint, 90000).then(wiki).catch(() => set('pages', 'Wiki status unavailable', 'Could not refresh wiki status.', 'error'))];
        if (bar.dataset.zotero === '1' && !syncRunning) jobs.push(json(bar.dataset.ajax + '?call=zoterobridge_status').then(data => { if (!syncRunning) syncing = zotero(data); }).catch(() => { if (!syncRunning) set('zotero', 'Zotero unavailable', 'Could not read local Zotero sync status.', 'error'); }));
        await Promise.all(jobs);
        busy = false;
        timer = window.setTimeout(refresh, syncing ? 5000 : 60000);
    }
    document.addEventListener('fokus:explorer-status', event => wiki(event.detail));
    document.addEventListener('fokus:statuschange', refresh);
    document.addEventListener('fokus:jots-status', event => jots(event.detail));
    document.addEventListener('visibilitychange', () => { if (document.hidden) window.clearTimeout(timer); else refresh(); });
    window.addEventListener('pageshow', refresh);
    if (syncButton) syncButton.addEventListener('click', syncNow);
    refresh();
})();
