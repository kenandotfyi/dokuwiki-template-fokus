/* Give links in References sections a compact, scan-friendly presentation. */
(function () {
    'use strict';

    const headingSelector = 'h1, h2, h3, h4, h5, h6';
    const contentSelector = '.dokuwiki .page, .plugin_include_content';

    function faviconUrl(anchor) {
        if (!anchor.classList.contains('urlextern') || anchor.classList.contains('interwiki') || anchor.dataset.provider || anchor.closest('[data-provider]')) return '';
        let url;
        try { url = new URL(anchor.href, document.baseURI); } catch (_) { return ''; }
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.origin === location.origin) return '';
        const candidates = [
            new URL('favicon.ico', url).href,
            new URL('/favicon.ico', url).href,
            new URL('/favicon.png', url).href,
            new URL('/apple-touch-icon.png', url).href,
        ];
        return [...new Set(candidates)];
    }

    function addFavicon(anchor) {
        const sources = faviconUrl(anchor);
        if (!sources.length || anchor.querySelector('.fokus-reference-favicon')) return;
        const image = document.createElement('img');
        image.className = 'fokus-reference-favicon';
        image.alt = '';
        image.width = 16;
        image.height = 16;
        image.loading = 'eager';
        image.referrerPolicy = 'no-referrer';
        image.hidden = true;
        image.setAttribute('aria-hidden', 'true');
        let sourceIndex = 0;
        image.addEventListener('load', () => { image.hidden = false; }, { once: true });
        image.addEventListener('error', () => {
            if (sourceIndex < sources.length) image.src = sources[sourceIndex++];
            else image.remove();
        });
        anchor.prepend(image);
        image.src = sources[sourceIndex++];
    }

    function addPageIcon(anchor) {
        if (!anchor.classList.contains('wikilink1') || anchor.querySelector('.fokus-reference-page-icon')) return;
        const icon = document.createElement('span');
        icon.className = 'fokus-reference-page-icon';
        icon.setAttribute('aria-hidden', 'true');
        anchor.prepend(icon);
    }

    function wrapLabel(anchor) {
        if (anchor.querySelector(':scope > .fokus-reference-label')) return;
        const label = document.createElement('span');
        label.className = 'fokus-reference-label';
        const icon = anchor.querySelector(':scope > .fokus-reference-favicon, :scope > .fokus-reference-page-icon');
        while (anchor.lastChild && anchor.lastChild !== icon) {
            label.prepend(anchor.lastChild);
        }
        anchor.append(label);
    }

    function wrapPlainRows(section) {
        section.querySelectorAll(':scope > p').forEach((paragraph) => {
            paragraph.classList.add('fokus-reference-paragraph');
            let row = null;
            [...paragraph.childNodes].forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches('a.fokus-reference-pill, .fokus-reference-plain-row')) {
                    row = null;
                    return;
                }
                if (!row && node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
                if (!row) {
                    row = document.createElement('span');
                    row.className = 'fokus-reference-plain-row';
                    node.before(row);
                }
                row.append(node);
            });
        });
    }

    function decorate(root) {
        if (!root?.querySelectorAll) return;
        const pages = new Set(root.querySelectorAll(contentSelector));
        if (root.matches?.(contentSelector)) pages.add(root);
        const parentPage = root.closest?.(contentSelector);
        if (parentPage) pages.add(parentPage);
        pages.forEach((page) => {
            page.querySelectorAll(headingSelector).forEach((heading) => {
                if (heading.textContent.trim().replace(/\s+/g, ' ').toLocaleLowerCase() !== 'references') return;
                const section = heading.nextElementSibling;
                if (!section || !/^level[1-6]$/.test(section.className)) return;
                heading.classList.add('fokus-references-heading');
                section.classList.add('fokus-references-content');
                section.querySelectorAll('a:not(.media):not(.footnote)').forEach((anchor) => {
                    anchor.classList.add('fokus-reference-pill');
                    addFavicon(anchor);
                    addPageIcon(anchor);
                    wrapLabel(anchor);
                });
                wrapPlainRows(section);
            });
        });
    }

    function start() {
        decorate(document);
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                record.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) decorate(node);
                });
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
