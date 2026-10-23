(function () {
    'use strict';
    const key = value => /^[A-Z0-9]{8}$/.test(String(value || ''));
    const label = value => String(value || '').replace(/[\r\n\[\]{}<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    // Split literal closing tags between nowiki blocks, preserving their text
    // without allowing a retrieved annotation to inject wiki instructions.
    function literal(value) {
        return '<nowiki>' + String(value).replace(/<\/nowiki>/gi, match => '</nowiki><nowiki><</nowiki><nowiki>' + match.slice(1) + '</nowiki><nowiki>') + '</nowiki>';
    }
    function reference(row, attachment) {
        if (row.kind === 'wikipedia') {
            const url = new URL(row.openUrl);
            if (url.origin !== 'https://en.wikipedia.org' || !url.pathname.startsWith('/wiki/') || url.search || url.hash) throw new Error('Invalid Wikipedia reference.');
            const title = decodeURIComponent(url.pathname.slice(6));
            if (!title || /[\x00-\x20\x7f\[\]{}|<>?#]/u.test(title)) throw new Error('Invalid Wikipedia reference.');
            return '[[wp>' + title + '|' + label(row.title) + ']]';
        }
        if (row.kind === 'wiki') {
            if (!row.key || /[\s\[\]{}|<>?#]/u.test(row.key)) throw new Error('Invalid wiki page reference.');
            return '[[' + row.key + '|' + label(row.title) + ']]';
        }
        const pdf = row.kind === 'annotation' ? row.attachmentKey : attachment || (row.attachments && row.attachments.length === 1 ? row.attachments[0].key : null);
        if (!key(pdf)) throw new Error('Choose a PDF attachment to create its wiki link.');
        let suffix = '';
        if (row.kind === 'annotation') {
            if (!key(row.key)) throw new Error('Invalid annotation reference.');
            suffix = '?' + (Number.isInteger(row.page) && row.page > 0 ? 'page=' + row.page + '&' : '') + 'annotation=' + row.key;
        }
        return '[[zotero>' + pdf + suffix + '|' + label(row.title + (row.kind === 'annotation' && row.pageLabel ? ', p. ' + row.pageLabel : '')) + ']]';
    }
    function annotation(row, includeComment) {
        const color = /^#[a-f\d]{6}$/i.test(String(row.color || '')) ? String(row.color) : '';
        const quote = String(row.text || '').split(/\r?\n/).filter(line => line.trim()).map(line => {
            const text = literal(line);
            return '> ' + (color ? '<color black/' + color + '> ' + text + '</color>' : text);
        }).join('\n');
        const comment = includeComment && row.comment ? '\n\nComment:\n' + String(row.comment).split(/\r?\n/).map(literal).join('\n') : '';
        return (quote ? quote + ' -> ' : '') + reference(row) + comment;
    }
    function blockAtSelection(text, value, start, end) {
        const before = value.slice(0, start), after = value.slice(end);
        return (before ? '\n'.repeat(Math.max(0, 2 - (before.match(/\n*$/)[0].length))) : '') + text +
            (after ? '\n'.repeat(Math.max(0, 2 - (after.match(/^\n*/)[0].length))) : '\n');
    }
    window.FokusSearchFormat = Object.freeze({ reference: reference, annotation: annotation, literal: literal, blockAtSelection: blockAtSelection });
})();

(function () {
    'use strict';
    const providers = new Map();
    let statusProvider = null;
    let autoSyncProvider = null;
    let opener = null;
    let matchMode = 'words';
    window.FokusSearch = {
        registerProvider: provider => providers.set(provider.id, provider),
        setStatusProvider: provider => { statusProvider = provider; },
        setAutoSyncProvider: provider => { autoSyncProvider = provider; },
        open: (query, options) => { if (opener) opener(query, options); }
    };
    providers.set('wiki', {
        id: 'wiki', label: 'Wiki pages',
        search: async function (query, options) {
            const url = new URL(DOKU_BASE + 'doku.php', location.origin);
            url.search = new URLSearchParams({ fokus_search: '1', q: query, offset: options.offset, limit: options.limit, match: options.matchMode || 'words' });
            const response = await fetch(url.href, { credentials: 'same-origin', signal: options.signal });
            if (!response.ok) throw new Error('Wiki search is unavailable.');
            return response.json();
        }
    });

    function init() {
        const dialog = document.getElementById('fokus-search-dialog');
        if (!dialog) return;
        const input = dialog.querySelector('#fokus-search-input');
        const results = dialog.querySelector('#fokus-search-results');
        const preview = dialog.querySelector('.fokus-search-preview');
        const actions = dialog.querySelector('.fokus-search-actions');
        const feedback = dialog.querySelector('.fokus-search-feedback');
        const status = dialog.querySelector('.fokus-search-status');
        const fulltext = dialog.querySelector('.fokus-search-fulltext');
        const syncBadge = node('span', 'fokus-search-sync');
        fulltext.before(syncBadge);
        const config = window.FokusSearchConfig;
        const format = window.FokusSearchFormat;
        if (config.wikipedia) providers.set('wikipedia', {
            id: 'wikipedia', label: 'Wikipedia', includeInAll: false,
            async search(query, options) {
                const response = await fetch(DOKU_BASE + 'lib/exe/ajax.php?call=fokusbutler_content', {
                    method: 'POST', credentials: 'same-origin', signal: options.signal,
                    body: new URLSearchParams({ provider: 'wikipedia-search', language: 'en', query })
                });
                const data = await response.json();
                if (!response.ok || !data.ok) throw new Error(data.error || 'Wikipedia search is unavailable.');
                return { results: data.results.map(row => ({ kind: 'wikipedia', key: row.url, title: row.title, text: row.excerpt || row.description, openUrl: row.url })), hasMore: false };
            }
        });
        const states = new Map();
        let selected = null;
        let previewRow;
        let filter = 'all';
        let timer = null;
        let controller = null;
        let revision = 0;
        let statusTimer = null;
        let statusController = null;
        let generation = null;
        let autoSyncAttempted = false;
        let editor = null;
        let returnFocus = null;
        let chosenPDF = null;
        let includeComment = false;

        function node(tag, className, text) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (text !== undefined) element.textContent = text;
            return element;
        }
        function highlighted(element, text) {
            const value = String(text || '');
            const words = (input.value.match(/[\p{L}\p{N}_]+/gu) || []).filter(word => word.length >= 2).slice(0, 12);
            if (!words.length) { element.textContent = value; return; }
            const escaped = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = new RegExp(escaped.join('|'), 'giu');
            let cursor = 0;
            for (const match of value.matchAll(regex)) {
                element.append(document.createTextNode(value.slice(cursor, match.index)), node('mark', '', match[0]));
                cursor = match.index + match[0].length;
            }
            element.append(document.createTextNode(value.slice(cursor)));
        }
        function uid(row) { return row.kind + ':' + row.key; }
        function visibleProviders() { return Array.from(providers.values()).filter(provider => filter === 'all' ? provider.includeInAll !== false : provider.id === filter); }
        function rows() { return visibleProviders().flatMap(provider => (states.get(provider.id) || {}).rows || []); }
        function current() { return rows().find(row => uid(row) === selected) || null; }
        function icon(kind, row) {
            const image = node('img', 'fokus-search-result-icon');
            const isImageAnnotation = kind === 'annotation' && row && row.annotationType === 'image';
            image.alt = isImageAnnotation ? 'Image annotation' : '';
            image.src = kind === 'wikipedia' ? DOKU_BASE + 'lib/images/interwiki/wp.svg' : config.templateBase + (kind === 'wiki' ? 'sidebar/icons/file-text-duotone.svg' : 'search/icons/' + (kind === 'document' ? 'books' : isImageAnnotation ? 'image' : 'quotes') + '-duotone.svg');
            return image;
        }
        function hint(message) {
            if (message) { feedback.textContent = message; return; }
            feedback.replaceChildren();
        }
        function captureEditor() {
            const textarea = document.getElementById('wiki__text');
            if (!textarea || textarea.disabled || textarea.readOnly) return null;
            const cm = window.plugin_codemirror?.cm;
            if (cm && cm.getTextArea() === textarea && cm.getWrapperElement().getClientRects().length) {
                if (cm.getOption('readOnly')) return null;
                return { textarea, cm, value: cm.getValue(), start: cm.indexFromPos(cm.getCursor('from')), end: cm.indexFromPos(cm.getCursor('to')), scroll: cm.getScrollInfo() };
            }
            if (!textarea.getClientRects().length) return null;
            return { textarea: textarea, value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd, scroll: textarea.scrollTop };
        }
        function openSearch(query, options = {}) {
            if (typeof query === 'string') input.value = query;
            if (options.provider && providers.has(options.provider)) filter = options.provider;
            if (dialog.open) {
                input.focus();
                if (typeof query === 'string') search(false);
                return;
            }
            returnFocus = document.activeElement;
            editor = captureEditor();
            previewRow = undefined;
            dialog.showModal();
            input.setAttribute('aria-expanded', 'true');
            input.focus({ preventScroll: true });
            input.select();
            hint();
            search(false);
            if (statusProvider) pollStatus();
        }
        opener = openSearch;
        function cancelSearch() {
            revision += 1;
            if (timer) window.clearTimeout(timer);
            if (controller) controller.abort();
            timer = null;
            controller = null;
        }
        function closed() {
            cancelSearch();
            if (statusTimer) window.clearTimeout(statusTimer);
            if (statusController) statusController.abort();
            statusTimer = null;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
        }
        function closeSearch() { if (dialog.open) dialog.close(); }
        dialog.addEventListener('close', closed);
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeSearch(); });
        dialog.addEventListener('click', event => { if (event.target === dialog) closeSearch(); });

        function search(preserve) {
            cancelSearch();
            const query = input.value.trim();
            const id = revision;
            controller = new AbortController();
            if (!preserve) {
                states.clear();
                selected = null;
                chosenPDF = null;
                previewRow = undefined;
            }
            const target = new URL(DOKU_BASE + 'doku.php', location.origin);
            target.search = new URLSearchParams({ do: 'search', q: query });
            fulltext.href = target.href;
            if (!query) { render(); return; }
            visibleProviders().forEach(provider => {
                const previous = states.get(provider.id);
                states.set(provider.id, { rows: preserve && previous ? previous.rows : [], loading: true, total: preserve && previous ? previous.total : null, hasMore: false, error: null });
            });
            render();
            timer = window.setTimeout(function () {
                timer = null;
                visibleProviders().forEach(provider => load(provider, id, query, false));
            }, preserve ? 0 : filter === 'wikipedia' ? 450 : 180);
        }
        async function load(provider, id, query, append) {
            const state = states.get(provider.id);
            if (!state || id !== revision) return;
            state.loading = true;
            state.error = null;
            render();
            try {
                const data = await provider.search(query, { offset: append ? state.rows.length : 0, limit: append || filter !== 'all' ? 20 : 2, matchMode, signal: controller.signal });
                if (id !== revision || !dialog.open) return;
                if (!Array.isArray(data.results)) throw new Error('Unexpected search response.');
                const incoming = data.results.filter(row => row && row.kind === provider.id && typeof row.key === 'string' && typeof row.title === 'string');
                state.rows = append ? state.rows.concat(incoming.filter(row => !state.rows.some(old => uid(old) === uid(row)))) : incoming;
                state.total = Number.isFinite(data.total) ? data.total : state.rows.length;
                state.hasMore = Boolean(data.hasMore) && incoming.length > 0 && state.rows.length < 1000;
            } catch (error) {
                if (id !== revision || error.name === 'AbortError') return;
                state.error = error.message || 'Search could not be loaded.';
            } finally {
                if (id === revision && dialog.open) { state.loading = false; render(); }
            }
        }
        function render() {
            dialog.querySelector('.fokus-search-match-mode').hidden = filter === 'wikipedia';
            const scroll = results.scrollTop;
            const all = rows();
            if (!all.some(row => uid(row) === selected)) selected = all.length ? uid(all[0]) : null;
            results.replaceChildren();
            const query = input.value.trim();
            if (!query) {
                const welcome = node('div', 'fokus-search-welcome');
                welcome.append(icon('wiki'), node('h3', '', 'Find a page or a passage'), node('p', '', config.zotero ? 'Search wiki content, document details, highlights, and your annotation comments.' : 'Search page titles, paths, and full wiki content.'));
                results.append(welcome);
            } else {
                visibleProviders().forEach(provider => {
                    const state = states.get(provider.id);
                    if (!state) return;
                    const heading = node('div', 'fokus-search-group-heading');
                    heading.setAttribute('role', 'presentation');
                    heading.append(node('span', 'fokus-search-group-label', provider.label));
                    const countLabel = node('span', 'fokus-search-group-count', state.loading ? 'Searching…' : state.total === null ? '' : state.rows.length + ' / ' + state.total);
                    heading.append(countLabel);
                    if (state.hasMore) {
                        const more = node('button', 'fokus-search-more', 'More…');
                        more.type = 'button';
                        more.disabled = state.loading;
                        more.setAttribute('aria-label', 'Load more ' + provider.label.toLowerCase());
                        more.addEventListener('click', () => load(provider, revision, input.value.trim(), true));
                        heading.append(more);
                    }
                    results.append(heading);
                    if (state.error) results.append(node('p', 'fokus-search-state fokus-search-error', state.error));
                    if (!state.loading && !state.error && !state.rows.length) results.append(node('p', 'fokus-search-state', 'No matches in ' + provider.label.toLowerCase() + '.'));
                    state.rows.forEach((row, index) => {
                        const element = node('div', 'fokus-search-result');
                        element.id = 'fokus-result-' + provider.id + '-' + index;
                        element.dataset.result = uid(row);
                        element.dataset.provider = provider.id;
                        element.setAttribute('role', 'option');
                        element.setAttribute('aria-selected', String(uid(row) === selected));
                        element.append(icon(row.kind, row));
                        if (row.kind === 'annotation' && row.annotationType === 'image') element.classList.add('fokus-search-result-image-annotation');
                        const body = node('div', 'fokus-search-result-body');
                        const title = node(row.kind === 'wiki' ? 'span' : 'div', 'fokus-search-result-title');
                        highlighted(title, row.kind === 'annotation' ? row.text || row.comment || 'Image or textless annotation' : row.title);
                        if (row.kind === 'wiki') {
                            const titleLine = node('div', 'fokus-search-result-title-line');
                            titleLine.append(title);
                            if (row.path) { const pageId = node('span', 'fokus-search-result-pageid'); highlighted(pageId, row.path); titleLine.append(pageId); }
                            body.append(titleLine);
                        } else {
                            body.append(title);
                            const documentType = (row.itemType || '').replace(/([a-z])([A-Z])/g, '$1 $2');
                            const metadata = row.kind === 'annotation'
                                ? row.title + (row.pageLabel ? ' · p. ' + row.pageLabel : '')
                                : [row.collections && row.collections.join(', '), documentType].filter(Boolean).join(' · ');
                            const meta = node('div', 'fokus-search-result-meta');
                            highlighted(meta, metadata);
                            body.append(meta);
                        }
                        if (['wiki', 'wikipedia'].includes(row.kind) && row.text) { const excerpt = node('div', 'fokus-search-result-excerpt'); highlighted(excerpt, row.text); body.append(excerpt); }
                        if (row.kind === 'annotation' && row.text && row.comment) { const comment = node('div', 'fokus-search-result-comment'); highlighted(comment, 'Comment: ' + row.comment); body.append(comment); }
                        element.append(body);
                        if (row.kind === 'annotation' && /^#[a-f0-9]{6}$/i.test(row.color || '')) { element.style.setProperty('--annotation-color', row.color); element.classList.add('has-annotation-color'); }
                        results.append(element);
                    });
                });
            }
            results.scrollTop = scroll;
            const busy = visibleProviders().some(provider => (states.get(provider.id) || {}).loading);
            results.setAttribute('aria-busy', String(busy));
            const count = Array.from(providers.values()).filter(provider => provider.includeInAll !== false).reduce((total, provider) => total + (states.get(provider.id)?.total || 0), 0);
            const visibleCount = visibleProviders().reduce((total, provider) => total + ((states.get(provider.id) || {}).total || 0), 0);
            status.textContent = !query ? '' : busy ? 'Searching…' : visibleCount + (visibleCount === 1 ? ' match' : ' matches');
            dialog.querySelectorAll('[data-search-filter]').forEach(button => {
                const id = button.dataset.searchFilter;
                const state = states.get(id);
                button.setAttribute('aria-pressed', String(id === filter));
                button.querySelector('span').textContent = !query ? '' : id === 'all' ? count || '' : state && state.total !== null ? state.total : '';
            });
            updateSelection(false);
        }
        function updateSelection(scroll) {
            results.querySelectorAll('[data-result]').forEach(element => {
                const active = element.dataset.result === selected;
                element.setAttribute('aria-selected', String(active));
                if (active) { input.setAttribute('aria-activedescendant', element.id); if (scroll) element.scrollIntoView({ block: 'nearest' }); }
            });
            if (!selected) input.removeAttribute('aria-activedescendant');
            const row = current();
            if (row === previewRow) return;
            previewRow = row;
            chosenPDF = row && row.attachments && row.attachments.length === 1 ? row.attachments[0].key : null;
            includeComment = Boolean(row && row.kind === 'annotation' && !row.text && row.comment);
            renderPreview(row);
        }
        function select(value, scroll) { selected = value; updateSelection(scroll); }
        function safeURL(value, wiki) {
            try {
                const url = new URL(value, location.origin);
                if (wiki) return url.origin === location.origin && url.pathname.startsWith(new URL(DOKU_BASE, location.origin).pathname) ? url.href : null;
                return /^zotero:\/\/(open-pdf|select)\/library\/items\/[A-Z0-9]{8}(\?[^#\s]*)?$/.test(url.href) ? url.href : null;
            } catch (_) { return null; }
        }
        function openURL(row) {
            if (row.kind === 'wikipedia') {
                try { format.reference(row); return row.openUrl; } catch (_) { return null; }
            }
            if (row.kind !== 'document' || !chosenPDF) return safeURL(row.openUrl || row.selectUrl, row.kind === 'wiki');
            const pdf = row.attachments.find(item => item.key === chosenPDF);
            return pdf ? safeURL(pdf.openUrl, false) : null;
        }
        function renderPreview(row) {
            preview.replaceChildren();
            actions.replaceChildren();
            if (!row) { preview.append(node('p', 'fokus-search-preview-empty', 'Select a result to see its details and actions.')); return; }
            const eyebrow = node('div', 'fokus-search-preview-kind', row.kind === 'wikipedia' ? 'WIKIPEDIA' : row.kind === 'wiki' ? 'WIKI PAGE' : row.kind === 'document' ? 'ZOTERO DOCUMENT' : 'ZOTERO ANNOTATION');
            preview.append(eyebrow, node('h3', 'fokus-search-preview-title', row.title));
            if (row.kind === 'wiki') preview.append(node('p', 'fokus-search-path', row.path));
            else {
                const info = [row.creators && row.creators.join(', '), row.date, (row.itemType || '').replace(/([a-z])([A-Z])/g, '$1 $2')].filter(Boolean).join(' · ');
                if (info) preview.append(node('p', 'fokus-search-path', info));
            }
            if (row.text) {
                const excerpt = node(row.kind === 'annotation' ? 'blockquote' : 'p', 'fokus-search-preview-text');
                if (row.kind === 'annotation' && /^#[a-f0-9]{6}$/i.test(row.color || '')) excerpt.style.setProperty('--annotation-color', row.color);
                highlighted(excerpt, row.text); preview.append(excerpt);
            }
            if (row.kind === 'annotation') {
                preview.append(node('p', 'fokus-search-path', [row.annotationType, row.pageLabel ? 'Page ' + row.pageLabel : ''].filter(Boolean).join(' · ')));
                const addedAt = Date.parse(row.dateAdded || '');
                if (Number.isFinite(addedAt)) {
                    const addedLabel = new Date(addedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                    preview.append(node('p', 'fokus-search-path', 'Added ' + addedLabel));
                }
                if (!row.text) preview.append(node('p', 'fokus-search-path', 'This annotation has no extracted text. Its link opens the original in Zotero.'));
                if (row.comment) {
                    const comment = node('div', 'fokus-search-preview-comment');
                    comment.append(node('strong', '', 'Your comment'), node('p', '', row.comment));
                    preview.append(comment);
                    const label = node('label', 'fokus-search-include-comment');
                    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = includeComment;
                    checkbox.addEventListener('change', () => { includeComment = checkbox.checked; });
                    label.append(checkbox, document.createTextNode('Include comment when copying or inserting'));
                    preview.append(label);
                }
            }
            if (row.collections && row.collections.length) {
                preview.append(node('h4', '', 'Collections'));
                row.collections.forEach(path => preview.append(node('p', 'fokus-search-collection', path)));
            }
            if (row.tags && row.tags.length) {
                const tags = node('div', 'fokus-search-tags');
                row.tags.forEach(tag => { if (tag) tags.append(node('span', '', tag)); });
                preview.append(tags);
            }
            if (row.kind === 'document' && row.attachments.length > 1) {
                const label = node('label', 'fokus-search-pdf-choice', 'PDF attachment');
                const picker = node('select'); picker.setAttribute('aria-label', 'PDF attachment');
                picker.append(node('option', '', 'Choose a PDF…')); picker.firstChild.value = '';
                row.attachments.forEach(pdf => { const option = node('option', '', pdf.title || pdf.key); option.value = pdf.key; picker.append(option); });
                picker.value = chosenPDF || '';
                picker.addEventListener('change', () => { chosenPDF = picker.value || null; renderActions(row); });
                label.append(picker); preview.append(label);
            } else if (row.kind === 'document' && !row.attachments.length) preview.append(node('p', 'fokus-search-path', 'No PDF attachment. Open the library item in Zotero.'));
            renderActions(row);
        }
        function button(text, handler, primary) {
            const element = node('button', primary ? 'fokus-search-primary' : '', text);
            element.type = 'button'; element.addEventListener('click', handler); return element;
        }
        function renderActions(row) {
            actions.replaceChildren();
            const url = openURL(row);
            let canReference = true;
            try { format.reference(row, chosenPDF); } catch (_) { canReference = false; }
            if (editor) {
                const insert = button(row.kind === 'annotation' ? 'Insert annotation' : 'Insert link', () => insertResult(row, row.kind === 'annotation'), true);
                insert.disabled = !canReference; actions.append(insert);
                if (row.kind === 'annotation') actions.append(button('Insert link only', () => insertResult(row, false)));
            }
            if (url) {
                const open = node('a', !editor ? 'fokus-search-primary' : '', ['wiki', 'wikipedia'].includes(row.kind) ? 'Open page' : row.kind === 'document' && !row.openUrl && !chosenPDF ? 'Open item in Zotero' : 'Open in Zotero');
                open.href = url;
                if (['wiki', 'wikipedia'].includes(row.kind)) open.addEventListener('click', event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); activate(row, false); } });
                actions.append(open);
            }
            const copyLink = button('Copy wiki link', () => copyText(format.reference(row, chosenPDF), 'Wiki link copied.'));
            copyLink.disabled = !canReference; actions.append(copyLink);
            if (row.kind === 'annotation') actions.append(button('Copy annotation', () => copyText(format.annotation(row, includeComment), 'Annotation copied with its source link.')));
            preview.append(actions);
        }
        async function copyText(text, message) {
            try {
                if (!navigator.clipboard) throw new Error('Clipboard unavailable');
                await navigator.clipboard.writeText(text);
                hint(message);
            } catch (_) {
                const field = node('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
                dialog.append(field); field.select();
                const copied = document.execCommand('copy'); field.remove(); input.focus();
                hint(copied ? message : 'Copy could not be completed. Try selecting the preview text.');
            }
        }
        function insertResult(row, quote) {
            const currentEditor = captureEditor();
            if (!editor || !editor.textarea.isConnected || !currentEditor || currentEditor.textarea !== editor.textarea || currentEditor.cm !== editor.cm || currentEditor.value !== editor.value) { hint('The editor changed. Close and reopen search from the editor before inserting.'); return; }
            let text;
            try { text = quote ? format.annotation(row, includeComment) : format.reference(row, chosenPDF); }
            catch (error) { hint(error.message); return; }
            const target = editor.textarea;
            const saved = editor;
            if (quote) text = format.blockAtSelection(text, saved.value, saved.start, saved.end);
            returnFocus = target;
            closeSearch();
            if (saved.cm) {
                saved.cm.focus();
                saved.cm.setSelection(saved.cm.posFromIndex(saved.start), saved.cm.posFromIndex(saved.end));
                saved.cm.replaceSelection(text, 'end', '+input');
                saved.cm.save();
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                saved.cm.scrollTo(saved.scroll.left, saved.scroll.top);
                return;
            }
            target.focus({ preventScroll: true });
            target.setSelectionRange(saved.start, saved.end);
            // Native insertion preserves the browser's undo history. The fallback
            // supports hosts without insertText and still notifies both editors.
            const inserted = document.execCommand('insertText', false, text);
            if (!inserted) target.setRangeText(text, saved.start, saved.end, 'end');
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            target.scrollTop = saved.scroll;
        }
        function activate(row, insert) {
            if (!row) return;
            if (insert && editor) { insertResult(row, row.kind === 'annotation'); return; }
            const url = openURL(row);
            if (!url) { hint('Choose a PDF attachment first.'); preview.querySelector('select')?.focus(); return; }
            if (row.kind === 'wiki' || row.kind === 'wikipedia') {
                closeSearch();
                if (typeof window.infinitepanelsOpenPage === 'function') window.infinitepanelsOpenPage(url, true, row.kind === 'wiki' ? row.key : undefined);
                else location.assign(url);
            } else {
                const link = document.createElement('a'); link.href = url; link.click();
            }
        }
        async function pollStatus() {
            if (!dialog.open || !statusProvider) return;
            statusController = new AbortController();
            let delay = 15000;
            try {
                const data = await statusProvider(statusController.signal);
                if (!dialog.open) return;
                const active = data.job && !['completed', 'failed', 'paused'].includes(data.job.phase);
                delay = active ? 3000 : 15000;
                syncBadge.textContent = active ? 'Zotero syncing…' : data.lastError ? 'Sync needs attention' : data.lastChecked ? 'Zotero indexed locally' : 'Zotero not indexed';
                syncBadge.title = data.lastChecked ? 'Last successful check: ' + new Date(data.lastChecked * 1000).toLocaleString() : 'Open Zotero Bridge administration to synchronize.';
                const stale = !data.lastChecked || Date.now() / 1000 - data.lastChecked >= (data.freshnessHours || 2) * 3600;
                const resumable = !data.job || ['completed', 'failed', 'paused'].includes(data.job.phase);
                if (!autoSyncAttempted && data.automaticSync && stale && resumable && (data.retryAt || 0) <= Date.now() / 1000 && autoSyncProvider) {
                    autoSyncAttempted = true;
                    syncBadge.textContent = 'Checking Zotero in the background…';
                    autoSyncProvider().catch(function () { syncBadge.textContent = 'Automatic sync paused; the current index is still available.'; });
                }
                if (generation !== null && generation !== data.generation && input.value.trim()) search(true);
                generation = data.generation;
            } catch (error) { if (error.name !== 'AbortError') syncBadge.textContent = 'Zotero status unavailable'; }
            finally { if (dialog.open) statusTimer = window.setTimeout(pollStatus, delay); }
        }
        input.addEventListener('input', () => { hint(); search(false); });
        dialog.querySelector('.fokus-search-preview-toggle').addEventListener('click', function () {
            this.setAttribute('aria-pressed', String(dialog.classList.toggle('fokus-search-details')));
        });
        dialog.querySelector('.fokus-search-form').addEventListener('submit', event => { event.preventDefault(); activate(current(), true); });
        dialog.querySelectorAll('[data-search-filter]').forEach(button => button.addEventListener('click', () => {
            filter = button.dataset.searchFilter;
            results.scrollTop = 0;
            search(false); input.focus();
        }));
        dialog.querySelectorAll('[data-search-mode]').forEach(button => button.addEventListener('click', () => {
            if (matchMode === button.dataset.searchMode) return;
            matchMode = button.dataset.searchMode;
            dialog.querySelectorAll('[data-search-mode]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
            results.scrollTop = 0;
            search(false);
            input.focus();
        }));
        results.addEventListener('pointermove', event => { const row = event.target.closest('[data-result]'); if (row && event.pointerType !== 'touch') select(row.dataset.result, false); });
        results.addEventListener('click', event => { const element = event.target.closest('[data-result]'); if (element) { select(element.dataset.result, false); activate(current(), true); } });
        fulltext.addEventListener('click', closeSearch);
        document.addEventListener('click', event => { if (event.target.closest('.fokus-search-open, .fokus-search-editor-launch')) openSearch(); });
        document.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); return; }
            if (!dialog.open) return;
            if (event.altKey && /^[1-5]$/.test(event.key)) { const filters = Array.from(dialog.querySelectorAll('[data-search-filter]')); const button = filters[Number(event.key) - 1]; if (button) { event.preventDefault(); button.click(); } return; }
            if (document.activeElement !== input) return;
            if (event.key === 'Tab' && !event.shiftKey) { const action = actions.querySelector('button:not(:disabled), a[href]'); if (action) { event.preventDefault(); action.focus(); } return; }
            if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); fulltext.click(); return; }
            if (event.key === 'Enter') { event.preventDefault(); activate(current(), true); return; }
            const list = rows();
            if (!list.length || !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(event.key)) return;
            event.preventDefault();
            const index = list.findIndex(row => uid(row) === selected);
            const change = event.key === 'PageDown' ? 6 : event.key === 'PageUp' ? -6 : event.key === 'ArrowDown' ? 1 : -1;
            select(uid(list[(Math.max(0, index) + change + list.length) % list.length]), true);
        });
        function editorTrigger() {
            if (!document.getElementById('wiki__text')) return;
            const host = document.getElementById('moaied__buttons') || document.getElementById('tool__bar');
            if (!host) return;
            const launches = Array.from(document.querySelectorAll('.fokus-search-editor-launch'));
            let launch = launches.shift();
            launches.forEach(duplicate => duplicate.remove());
            if (!launch) {
                launch = button('Search & insert', openSearch);
                launch.className = 'fokus-search-editor-launch';
                launch.title = 'Search and insert a reference (Ctrl/Cmd+Shift+F)';
                launch.prepend(icon('wiki'));
            }
            // Moai creates its toolbar asynchronously after DokuWiki's toolbar.
            if (launch.parentElement !== host) host.append(launch);
        }
        editorTrigger();
        if (document.getElementById('wiki__text')) new MutationObserver(editorTrigger).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();

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

