# Pane content providers

`content-providers.js` registers providers with `window.FokusPaneProviders`. Each provider supplies `name`, `matches(id)`, `urlForId(id)`, and `load(id, url)`. Loading returns `{content, parsedDocument, url, provider}`. Optional `fromUrl(url)` and `fromLink(anchor)` methods resolve external navigation. The wiki provider is the fallback; additional providers take precedence. A provider is responsible for validating its links and safely rendering its content. Do not fetch arbitrary third-party HTML directly into panes.

The wiki provider retains the existing full DokuWiki page loader, tools, adapters, and ACL behavior. The Wikipedia provider uses Fokus Butler's always-available **Content providers** service for its validated server-side fetch, sanitized article content, shared renderer, and reference tooltips. Page previews is a separate consumer; disabling hover previews does not disable Wikipedia panes.

Wikipedia pane IDs use `wp.<language>.<article>`, for example `wp.en.Pauli_exclusion_principle` and `wp.de.Pauli-Prinzip`. Only the provider and language separators are parsed; dots in article titles are preserved. The `wp.` prefix is reserved. Case, language edition, and optional `#section` are retained. Existing `p` (open), `m` (minimized), and `f` (focused) URL parameters store these IDs alongside normal wiki IDs; fragments inside values are URL-encoded.

Wikipedia search panes use the reserved `wpsearch.<language>.<query>` format, for example `wpsearch.en.Fermi_level`. Spaces become underscores; literal underscores, percent signs, and fragment characters are escaped so the original query round-trips. Searches show up to 20 article results with excerpts and a refinement form. Result links open normal article panes. Search panes support the same workspace state and reload restoration, but do not enter recent articles.

Normal clicks on wiki and Wikipedia links inside a pane replace that pane while preserving its neighbors. Replacing the first visible pane also updates the base wiki URL or local Wikipedia host URL. Shift-click appends a new pane on the right. For either action, an already-open destination is focused instead of duplicated; Wikipedia section links reuse the article pane and scroll to the section. Sidebar links and normal clicks inside hover previews keep their existing append behavior. Ctrl/Cmd/Alt clicks, image/file links, unsupported namespaces, and the original-article action retain normal browser behavior. Citation numbers remain hover-only reference tooltips. Older workspace URLs containing repeated panes remain readable.

Wikipedia panes share minimize, focus, zoom, close, browser history, and reload restoration with wiki panes. Their title links and external action open the original article in a browser tab. They have no wiki editing, revision, rename, annotation, or connections-graph tools and do not enter wiki recents. Closing the root wiki pane when Wikipedia is next returns to the wiki landing page with the remaining external panes preserved.

Pane and horizontal workspace scrollbars remain hidden; wheel, touch, and keyboard scrolling continue to work.

Run identifier, routing, validation, and extensibility checks with:

```sh
deno test content-providers.test.js
```
