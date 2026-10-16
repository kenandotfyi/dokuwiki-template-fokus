# Fokus

Fokus is a DokuWiki template built around an exploration-focused, multi-pane reading experience. It is derived from Simpl and the DokuWiki default template.

## Features

- Open linked wiki pages in side-by-side panes and scroll each pane independently.
- Minimize panes to a shelf in the header, restore them, or focus one pane.
- Keep pane state in the URL so the workspace can be refreshed or shared.
- Switch between light and dark themes.
- Browse pages in a resizable Files sidebar powered by Pierre Trees, or switch to Tags to browse the Tag plugin's indexed tags and their pages.
- Filter the file tree and keep frequently used pages in a Pinned section.
- Use the DokuWiki edit popup, page revisions, and other page actions from pane headers.
- Optionally initialize Preview, annotations, and KaTeX integrations in panes.

## Installation

Place this directory at `lib/tpl/fokus` in a DokuWiki installation, then select **Fokus** as the template in DokuWiki’s Configuration Manager.

### Required dependency

Install and enable the [Move plugin](https://www.dokuwiki.org/plugin:move) through DokuWiki's Extension Manager. Fokus declares Move in `dependencies.json` and checks its required components at runtime. If Move is missing, disabled, or incomplete, Rename is disabled and administrators see an Extension Manager link. Page creation and deletion remain available through core DokuWiki.

For automatic dependency installation, Fokus's official DokuWiki catalog entry must declare `depends: move` in its repository metadata. The Extension Manager installs catalog dependencies before installing the template. This catalog entry is maintained separately from this repository; `dependencies.json` is Fokus's own runtime manifest and is not read by Extension Manager. Manual ZIP or Git installations require installing Move separately.

Do not add `depends move` to `template.info.txt`: the currently supported Extension Manager reads local info values as strings, while its dependency installer and dependant checks expect arrays. The catalog supplies the correct array type. Verify a fresh catalog installation before publishing a release.

## Configuration

Settings are available in the Configuration Manager under the Fokus template settings:

| Setting | Default | Description |
| --- | --- | --- |
| `panes_enabled` | `1` | Enable multi-pane exploration on wiki pages. |
| `pane_width` | `45` | Pane width in rem; allowed range is 25–100. |
| `dark_mode` | `1` | Enable the light/dark theme switch. |
| `sidebar_enabled` | `1` | Enable the Files and Tags sidebar. |
| `sidebar_hide_regex` | empty | Hide matching page IDs and namespace trees from the file explorer. |
| `adapter_preview` | `0` | Enable the Preview plugin adapter for panes. |
| `adapter_annotations` | `0` | Enable the annotations plugin adapter for panes. |
| `adapter_katex` | `0` | Enable KaTeX rendering in panes. |

Each adapter also requires its corresponding plugin or rendering library to be installed and available.

## Sidebar

The file explorer lists readable, non-hidden wiki pages using their first heading as the display name, with a readable page basename as fallback. Pinned shortcuts use the same labels. Namespace folders use their matching namespace page (for example `component:capacitor` for `component:capacitor:*`), with a namespace start page as fallback. The associated page supplies the heading and is merged into the namespace row. Clicking its name or pressing Enter opens that page without changing expansion; clicking the folder icon or using Left/Right arrows controls expansion. Namespaces without an associated page expand or collapse on a name click. Namespace basenames are used when no heading is available. Page IDs and file paths remain unchanged; hovering a tree label shows its path. It does not depend on Indexmenu. File activation opens or focuses a Fokus pane; Ctrl/Cmd-click opens a new browser tab. File selection, folder expansion, and tree scroll stay independent of the active pane. Arrow keys navigate the tree and Enter opens a file. The Tags view uses the Tag plugin's index, excludes tags without visible pages, and loads each tag's pages on expansion. Clicking a tag in a pane opens and expands that tag in the sidebar, opening the sidebar first if it was collapsed. Refresh buttons reload the current index data. The asterisk Home link beside the Files icon navigates to the `start` page.

The Configuration Manager option `sidebar_hide_regex` hides matching page IDs and namespaces from the file explorer, including descendants of matching namespaces. Enter a case-insensitive regex without delimiters; for example `^(?:playground|wiki)(?::|$)` hides both root namespaces and their pages. Use `|` to combine rules, or leave the option blank to show all readable pages. Configuration Manager rejects invalid expressions. This is a display preference; Pinned, Tags, page access, and permissions are unaffected.

The sidebar's top row shows the wiki name and a dots-six menu with user and site actions. The dropdown omits the redundant wiki home link and DokuWiki's built-in action icons. Sidebar icon controls use 24px boxes with 4px corners. The header retains the sidebar toggle using Phosphor's sidebar duotone icon; the bottom row only shows the page count. Pages without the sidebar keep the header's VAULT menu as a fallback.

The binoculars button at the right of the navigation row opens a filter field that expands to its left. It switches to Files and focuses the field. Filtering ignores case and matches page headings, namespace headings, and original paths, revealing matching files inside namespaces. Closing the filter clears it and restores the navigation buttons and previous folder expansion. Escape clears a nonempty filter, then closes an empty one. Pinned shortcuts remain visible during filtering. Wiki search opens with Ctrl+Shift+F or the magnifying-glass button in the sidebar; it searches live and shows DokuWiki's full-text results in a Fokus-styled popup.

Use the pin icon in the Pinned heading to pin or unpin the active page, or choose Pin/Unpin from a file's right-click menu. Each pinned row also has an unpin button, visible on hover or keyboard focus. Pins resolve against the current user's readable page list. The Files heading includes a Phosphor duotone file-plus button. It asks for a page name (including an optional namespace), then opens the existing editor popup through DokuWiki's core `do=edit` action. Core normalizes names, checks creation permissions, applies namespace templates, and saves the page. Existing names are rejected. After saving, the file list refreshes and the created page opens in a pane; closing without saving creates no file. Without pane support, creation opens the normal editor page. Files and Tags use accessible, compact icon-only Phosphor duotone tabs with 4px corner radii. File rows and pinned shortcuts use file-text duotone icons; refresh actions use arrows-clockwise duotone. Namespace expand controls use Phosphor folder duotone when collapsed and folder-open duotone when expanded. Tree row hover and selection backgrounds have 4px corners; selected backgrounds and focus borders use the page header colors. Without the Tag plugin the Tags view explains how to enable it.

Right-click a file or namespace for Rename and Delete. On a merged namespace row, right-click the name for its associated page actions (including Pin/Unpin), or the folder icon for namespace actions. Keyboard Shift+F10 uses page actions when an associated page exists. Namespace rows and their matching landing pages offer New page here as the first menu item, which reuses the creation dialog with the namespace prefilled. File links in Pinned and Tags support the same menu. Shift+F10 opens it from the keyboard; arrows navigate and Escape dismisses it. Rename uses the installed Move plugin to preserve page history and rewrite links. A namespace rename includes its descendant pages; media files retain their current namespace. Delete uses core page saving, retains revision history, and confirms the affected page count before acting. Namespace deletion includes descendant pages and keeps media files. All affected pages must pass permissions and lock checks; changed pages require a fresh confirmation. Pinned IDs and open-pane URLs follow renames, while deleted pages are removed from pins and the workspace. The workspace reloads after successful mutations to refresh links and content.

Pins are stored on the server in `<DokuWiki cachedir>/pinned/user-<SHA-256 of username>.json` (normally `data/cache/pinned`). Each signed-in user has their own list, shared across browsers and devices. Wikis with ACLs disabled use `shared.json` for unsigned visitors; with ACLs enabled, visitors must sign in to pin. Lists contain only page IDs, and every response filters missing, hidden, or unreadable pages. Incremental pin/unpin writes are locked and atomic. Pins reload on focus, visibility changes, and file refresh. Fokus renames and deletions update all users' stored references. Include this folder in backups and preserve it when clearing caches: these JSON files are saved preferences, not disposable generated cache.

When Page Health is enabled, the file explorer footer adds healthy and no-content counts for the pages included in the explorer, respecting sidebar exclusions and the current filter. Counts include associated namespace pages once, even though their duplicate file rows are merged. File and associated namespace labels, plus pinned shortcuts, use Page Health's configured color, hover color, opacity, italics, and decoration. Fokus calls the plugin's existing ACL-checked classification endpoint in batches of up to 500 and inherits its CSS variables into the tree's shadow DOM; no plugin changes or full scan are required. Refresh files reloads classifications. Failed or missing classifications are counted as unchecked, never healthy; without Page Health the footer keeps the regular page count.

The sidebar remembers only its width, selected view, and expanded folders in browser-local storage scoped to the wiki and signed-in user. It starts collapsed on small screens. Use the header toggle to restore it. The resize separator also supports Left/Right arrows and Home/End. The sidebar is omitted from the pane editor popup and from printed output.

Sidebar source and its pinned dependencies live in `sidebar/`. The committed `sidebar.bundle.js` is self-contained and served locally; Node.js and external CDNs are not required on the wiki server. To rebuild after changing `sidebar/sidebar.js`, run `pnpm install --frozen-lockfile` and `pnpm run build` in that directory. PHP and CSS changes do not need a JavaScript rebuild. Navigation JSON is served through the initialized template with `fokus_nav=files`, `tags`, `tag`, `pins` (GET/POST pin storage), `newpage` (name resolution), or `target` (action preflight); responses are private and are not cached. File mutations use `fokus_nav=action` with POST, a core session token, and a preflight fingerprint.

## Licenses

Fokus is licensed under the MIT License; see [LICENSE](LICENSE). Phosphor icon assets are covered by [PHOSPHOR-LICENSE.txt](PHOSPHOR-LICENSE.txt).

The sidebar bundles `@pierre/trees` 1.0.0-beta.6 (Apache-2.0), Preact, `preact-render-to-string`, and Pierre's theming utilities. Their licenses and the Trees attribution notice are preserved in `sidebar/licenses/`.

## Fokus Settings companion

The optional `fokussettings` plugin adds **Admin → Fokus Settings**, also linked from the wiki actions menu for administrators. It provides Appearance, Workspace, and Integrations sections. Install it under `lib/plugins/fokussettings` alongside the Fokus template. No live theme preview is included.

Appearance includes separate optional light/dark color overrides (text, muted text, backgrounds, borders, accent, internal/external links and hover colors, missing page links, and search-match highlights), bundled/system font choices, heading font, text size and line height, pane padding, workspace gutter, pane gap, paragraph spacing, page/dialog corners, control/tree corners, search popup width and result height, and link decoration and weight. The search popup inherits the shared theme colors, typography, and corner radius. Search-match highlight colors apply in the popup and opened panes. Missing page links default to red with a dotted underline and can be styled independently of existing internal links. Tag plugin links (`rel="tag"`) have their own light/dark colors, hover colors, decoration, and weight. Blank colors retain template defaults. Page Health retains its semantic no-content styling for actual wiki pages. Restore defaults applies only to the selected section, preserving protected values.

The template owns all settings in `$conf['tpl']['fokus']`, defined by `settings-schema.php`; the standard Configuration Manager remains usable. The companion validates every submitted field before saving through DokuWiki's Configuration API, requires administrator access and a core security token, and respects protected settings. Settings continue to render through `appearance.php` when the companion is disabled. Reload existing wiki tabs after saving.

### Interwiki appearance

Appearance → Interwiki links discovers prefixes through DokuWiki's merged built-in/local interwiki definitions, including entries such as `zotero` and `wp`. Select a prefix to set separate light/dark text, hover text, background, and hover background colors, plus decoration, decoration style, font weight/style, and favicon visibility. Blank values use prefix defaults before falling back to existing stylesheet rules. Zotero's former stylesheet palette is now defined in the shared settings defaults: red text in both themes, with separate light/dark hover text and backgrounds. The controls display these defaults. Clear a value to restore its default; DokuWiki continues to supply favicons. Prefix destinations remain managed by DokuWiki.

Overrides are stored as the template's `interwiki_styles` JSON setting and work without the companion plugin. One serialized value preserves changes across multiple prefixes without hitting PHP's form-variable limit. The server validates prefixes, field names, hex colors, and allowed style values before saving or generating CSS. CSS class names use DokuWiki's renderer normalization (for example `amazon.de` becomes `iw_amazon_de`). Both existing and dynamically loaded pane links receive the styles. This discovers configured prefixes rather than performing a full wiki content scan.

### Shared appearance values

Fokus's active screen styles use CSS variables supplied by the shared `settings-schema.php` defaults and saved template configuration. Palette fields show their real defaults. Empty color values resolve to those defaults. Accent backgrounds, text on accents, input colors, and generic interwiki links have dedicated controls; code/page-ID fonts and sidebar text size are configurable too.

Component color roles preserve existing neutral light/dark shades by default and inherit their source setting when that setting is customized. This covers pages, panes, sidebar, dialogs, editors, admin views, tables, media views, and links. Page Health and semantic integration-status colors retain their own styling. Print keeps its paper-oriented styles. Standard `style.ini` color replacements remain for DokuWiki/plugin compatibility; use Fokus Settings for Fokus appearance.

The template bundles pane/sidebar styles through DokuWiki's CSS pipeline. `appearance.php` emits validated variables and interwiki rules, rather than selector-specific color overrides. The generated `css/theme-defaults.css` supplies the same default variables for exports and before runtime overrides load. After changing schema defaults, regenerate it with `php lib/tpl/fokus/bin/build-appearance.php` from the wiki root. Configuration changes need no rebuild.
