(function () {
    'use strict';

    function init() {

    const dialog = document.getElementById('fokus-search-dialog');
    if (!dialog) return;
    const input = dialog.querySelector('#fokus-search-input');
    const results = dialog.querySelector('#fokus-search-results');
    const form = dialog.querySelector('.fokus-search-form');
    const closeButton = dialog.querySelector('.fokus-search-close');
    let timer = null;
    let controller = null;
    let requestId = 0;
    let mode = 'suggestions';

    function cancelRequest() {
        requestId += 1;
        if (timer) window.clearTimeout(timer);
        timer = null;
        if (controller) controller.abort();
        controller = null;
        return requestId;
    }

    function setMessage(message) {
        results.replaceChildren();
        const state = document.createElement('p');
        state.className = 'fokus-search-state';
        state.textContent = message;
        results.appendChild(state);
    }

    function openSearch() {
        if (!dialog.open) dialog.showModal();
        input.focus({ preventScroll: true });
        input.select();
        if (input.value.trim()) search(input.value.trim());
    }

    function closeSearch() {
        cancelRequest();
        dialog.close();
        input.value = '';
        input.setAttribute('aria-expanded', 'false');
        results.replaceChildren();
        mode = 'suggestions';
    }

    async function search(query) {
        const id = cancelRequest();
        const q = query.trim();
        input.setAttribute('aria-expanded', q ? 'true' : 'false');
        if (!q) {
            results.replaceChildren();
            return;
        }
        results.setAttribute('aria-busy', 'true');
        setMessage(mode === 'fulltext' ? 'Searching the wiki…' : 'Finding pages…');
        timer = window.setTimeout(async function () {
            timer = null;
            const requestController = new AbortController();
            controller = requestController;
            try {
                let url;
                if (mode === 'fulltext') {
                    url = new URL(DOKU_BASE + 'doku.php', window.location.origin);
                    url.searchParams.set('do', 'search');
                    url.searchParams.set('q', q);
                } else {
                    url = new URL(DOKU_BASE + 'lib/exe/ajax.php', window.location.origin);
                    url.searchParams.set('call', 'qsearch');
                    url.searchParams.set('q', q);
                }
                const response = await fetch(url.href, { credentials: 'same-origin', signal: requestController.signal });
                if (!response.ok) throw new Error('Search request failed (' + response.status + ')');
                const html = await response.text();
                if (id !== requestId || input.value.trim() !== q) return;
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                results.replaceChildren();
                if (mode === 'fulltext') {
                    const source = parsed.querySelector('.search_fulltextresult');
                    if (source) {
                        const content = document.importNode(source, true);
                        content.querySelectorAll('script, form').forEach((node) => node.remove());
                        content.querySelectorAll('[href]').forEach((link) => {
                            try { link.href = new URL(link.getAttribute('href'), response.url || url.href).href; } catch (_) {}
                        });
                        results.appendChild(content);
                    } else {
                        setMessage(parsed.querySelector('.nothing')?.textContent.trim() || 'No search results were returned.');
                    }
                } else {
                    const fragment = document.createElement('div');
                    fragment.innerHTML = html;
                    fragment.querySelectorAll('script, form').forEach((node) => node.remove());
                    results.append(...Array.from(fragment.childNodes));
                    if (!results.childElementCount) setMessage('No matching pages. Press Enter to search the full text.');
                }
            } catch (error) {
                if (error.name !== 'AbortError' && id === requestId) setMessage('Search could not be loaded. Try again.');
            } finally {
                if (id === requestId) results.removeAttribute('aria-busy');
                if (controller === requestController) controller = null;
            }
        }, mode === 'fulltext' ? 0 : 180);
    }

    document.addEventListener('click', function (event) {
        if (event.target.closest('.fokus-search-open')) openSearch();
        if (event.target.closest('.fokus-search-close')) closeSearch();
        const anchor = event.target.closest('#fokus-search-results a');
        if (!anchor) return;
        if (event.shiftKey) {
            closeSearch();
            return;
        }
        const target = new URL(anchor.href, window.location.href);
        if (target.searchParams.get('do') === 'search') {
            event.preventDefault();
            mode = 'fulltext';
            search(target.searchParams.get('q') || input.value);
            return;
        }
        if (typeof window.infinitepanelsOpenPage === 'function') {
            event.preventDefault();
            const href = anchor.href;
            closeSearch();
            window.infinitepanelsOpenPage(href);
        }
    });

    document.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            openSearch();
            return;
        }
        if (!dialog.open) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSearch();
            return;
        }
        if (event.key === 'Enter' && document.activeElement === input && input.value.trim()) {
            event.preventDefault();
            mode = 'fulltext';
            search(input.value);
        }
        if (event.key === 'ArrowDown' && document.activeElement === input) {
            const first = results.querySelector('a[href]');
            if (first) { event.preventDefault(); first.focus(); }
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const links = Array.from(results.querySelectorAll('a[href]'));
            const index = links.indexOf(document.activeElement);
            if (index >= 0) {
                const next = Math.max(0, Math.min(links.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
                event.preventDefault();
                links[next].focus();
            }
        }
    });

    input.addEventListener('input', function () {
        mode = 'suggestions';
        search(input.value);
    });
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!input.value.trim()) return;
        mode = 'fulltext';
        search(input.value);
    });
    dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeSearch();
    });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
