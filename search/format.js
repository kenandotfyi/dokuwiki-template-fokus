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
        if (row.kind === 'jots') {
            if (!/^memos\/[a-zA-Z0-9][a-zA-Z0-9-]{0,35}$/.test(row.key || '')) throw new Error('Invalid jot reference.');
            const url = new URL(row.openUrl, location.href);
            if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || url.username || url.password || url.hash || url.searchParams.get('p') !== 'jots.memo.' + row.key.slice(6)) throw new Error('Invalid jot reference.');
            return '[[' + url.href + '|' + label(row.title) + ']]';
        }
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
