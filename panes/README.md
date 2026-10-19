# Pane content providers

`content-providers.js` registers providers with `window.FokusPaneProviders`. Each provider supplies `name`, `matches(id)`, `urlForId(id)`, and `load(id, url)`. Loading returns `{content, parsedDocument, url, provider}`. Optional `fromUrl(url)` and `fromLink(anchor)` methods resolve external navigation. The wiki provider is the fallback; additional providers take precedence. A provider is responsible for validating its links and safely rendering its content. Do not fetch arbitrary third-party HTML directly into panes.

The wiki provider retains the existing full DokuWiki page loader, tools, adapters, and ACL behavior. The Wikipedia provider uses Fokus Butler's always-available **Content providers** service for its validated server-side fetch, sanitized article content, shared renderer, and reference tooltips. Page previews is a separate consumer; disabling hover previews does not disable Wikipedia panes.

Wikipedia pane IDs use `wp.<language>.<article>`, for example `wp.en.Pauli_exclusion_principle` and `wp.de.Pauli-Prinzip`. Only the provider and language separators are parsed; dots in article titles are preserved. The `wp.` prefix is reserved. Case, language edition, and optional `#section` are retained. Existing `p` (open), `m` (minimized), and `f` (focused) URL parameters store these IDs alongside normal wiki IDs; fragments inside values are URL-encoded.

Clicking a Wikipedia article link appends its pane after the last open pane, preserving every existing pane, just like internal links. An already-open article is focused instead of duplicated. Wikipedia links inside article previews use the same append behavior. Modified clicks, image/file links, unsupported namespaces, and the original-article action retain normal browser behavior. Citation numbers remain hover-only reference tooltips. Section links scroll within their pane and persist the section in URL state.

Wikipedia panes share minimize, focus, zoom, close, browser history, and reload restoration with wiki panes. Their title links and external action open the original article in a browser tab. They have no wiki editing, revision, rename, annotation, or connections-graph tools and do not enter wiki recents. Closing the root wiki pane when Wikipedia is next returns to the wiki landing page with the remaining external panes preserved.

Run identifier, routing, validation, and extensibility checks with:

```sh
deno test content-providers.test.js
```
