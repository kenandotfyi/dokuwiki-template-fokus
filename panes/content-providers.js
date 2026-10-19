(function () {
    'use strict';
    const providers = new Map();
    const registry = {
        register(provider) { providers.set(provider.name, provider); },
        forId(id) {
            return Array.from(providers.values()).find(provider => provider.name !== 'wiki' && provider.matches(id))
                || (providers.get('wiki')?.matches(id) ? providers.get('wiki') : undefined);
        },
        fromUrl(url) { return Array.from(providers.values()).map(provider => provider.fromUrl?.(url)).find(Boolean); },
        fromLink(link) {
            for (const provider of providers.values()) {
                const target = provider.fromLink?.(link);
                if (target) return { ...target, provider };
            }
            return null;
        },
        urlForId(id) { return registry.forId(id)?.urlForId(id); }
    };
    window.FokusPaneProviders = registry;

    function wikipediaTarget(value) {
        let url;
        try { url = new URL(value, location.href); } catch (_) { return null; }
        const language = /^([a-z][a-z0-9-]{0,30})(?:\.m)?\.wikipedia\.org$/.exec(url.hostname)?.[1];
        if (!language || !/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
        let title;
        try { title = url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6))
            : (url.pathname === '/w/index.php' ? url.searchParams.get('title') : ''); } catch (_) { return null; }
        if (!title || /^(?:File|Special|Category|Template|Help|Wikipedia|Talk|User|Portal|MediaWiki)(?:_talk)?:/i.test(title)) return null;
        title = title.replaceAll(' ', '_');
        return { id: `wp.${language}.${title}${url.hash}`, url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}${url.hash}` };
    }

    registry.register({
        name: 'wikipedia',
        label: 'Wikipedia',
        fromUrl: wikipediaTarget,
        matches: id => /^wp\.[a-z][a-z0-9-]{0,30}\..+/.test(id),
        fromLink(link) {
            if (!window.FokusButlerContentConfig?.enabled || link.matches('[data-pane-original]')
                || link.closest('.mw-ref, sup.reference') || link.querySelector('img')
                || link.getAttribute('href')?.startsWith('#')) return null;
            if (!link.classList.contains('interwiki') && !link.closest('[data-provider="wikipedia"]')) return null;
            return wikipediaTarget(link.href);
        },
        urlForId(id) {
            const match = /^wp\.([a-z][a-z0-9-]{0,30})\.(.+)$/.exec(id);
            if (!match) return null;
            const hashIndex = match[2].indexOf('#');
            const title = hashIndex < 0 ? match[2] : match[2].slice(0, hashIndex);
            const hash = hashIndex < 0 ? '' : match[2].slice(hashIndex);
            return `https://${match[1]}.wikipedia.org/wiki/${encodeURIComponent(title)}${hash}`;
        },
        async load(id) {
            if (!window.FokusButlerContent) throw new Error('The content provider service is unavailable.');
            const url = this.urlForId(id);
            const result = await window.FokusButlerContent.wikipedia(url);
            const parsedDocument = document.implementation.createHTMLDocument(result.title);
            const content = parsedDocument.createElement('div');
            content.className = 'pad group fokus-external-content';
            const header = parsedDocument.createElement('div');
            header.className = 'topBanner';
            const heading = parsedDocument.createElement('div');
            heading.className = 'fokus-page-heading';
            const title = parsedDocument.createElement('a');
            title.className = 'fokus-page-title interwiki iw_wp';
            title.href = result.url; title.target = '_blank'; title.rel = 'noopener noreferrer';
            title.dataset.paneOriginal = 'true'; title.textContent = result.title;
            title.title = 'Open original Wikipedia article';
            heading.appendChild(title); header.appendChild(heading);
            const body = parsedDocument.createElement('div');
            body.className = 'page group fokus-content-body fokus-wikipedia-content';
            body.dataset.provider = 'wikipedia';
            window.FokusButlerContent.render(body, result, 'wikipedia');
            content.append(header, body);
            return { content, parsedDocument, url, provider: 'wikipedia', title: result.title };
        }
    });

    registry.register({
        name: 'wiki',
        matches: id => Boolean(id) && !id.startsWith('wp.'),
        urlForId(id) {
            const base = new URL(DOKU_BASE, location.origin);
            return new URL(base.pathname.replace(/\/?$/, '/') + encodeURIComponent(id).replace(/%3A/gi, ':'), base.origin).href;
        },
        async load(id, url) {
            const request = new URL(url, location.href);
            ['p', 'm', 'f'].forEach(parameter => request.searchParams.delete(parameter));
            if (request.origin !== location.origin) throw new Error('Wiki pages must use the local wiki.');
            const response = await fetch(request, { credentials: 'same-origin' });
            if (!response.ok) throw new Error(`Page request failed (${response.status})`);
            const parsedDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
            const source = parsedDocument.querySelector('#dokuwiki__content > .pad.group')
                || parsedDocument.querySelector('#dokuwiki__content .pad.group')
                || parsedDocument.querySelector('#dokuwiki__content');
            if (!source) throw new Error('Could not find the rendered page content');
            const canonical = parsedDocument.querySelector('link[rel="canonical"]')?.getAttribute('href');
            const canonicalUrl = canonical ? new URL(canonical, request) : null;
            return { content: source.cloneNode(true), parsedDocument,
                url: canonicalUrl?.origin === location.origin ? canonicalUrl.href : this.urlForId(id), provider: 'wiki' };
        }
    });
})();
