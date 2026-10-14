# Fokus

Fokus is a DokuWiki template built around an exploration-focused, multi-pane reading experience. It is derived from Simpl and the DokuWiki default template.

## Features

- Open linked wiki pages in side-by-side panes and scroll each pane independently.
- Minimize panes to a shelf in the header, restore them, or focus one pane.
- Keep pane state in the URL so the workspace can be refreshed or shared.
- Switch between light and dark themes.
- Use the DokuWiki edit popup, page revisions, and other page actions from pane headers.
- Optionally initialize Preview, annotations, and KaTeX integrations in panes.

## Installation

Place this directory at `lib/tpl/fokus` in a DokuWiki installation, then select **Fokus** as the template in DokuWiki’s Configuration Manager.

## Configuration

Settings are available in the Configuration Manager under the Fokus template settings:

| Setting | Default | Description |
| --- | --- | --- |
| `panes_enabled` | `1` | Enable multi-pane exploration on wiki pages. |
| `pane_width` | `45` | Pane width in rem; allowed range is 25–100. |
| `dark_mode` | `1` | Enable the light/dark theme switch. |
| `adapter_preview` | `0` | Enable the Preview plugin adapter for panes. |
| `adapter_annotations` | `0` | Enable the annotations plugin adapter for panes. |
| `adapter_katex` | `0` | Enable KaTeX rendering in panes. |

Each adapter also requires its corresponding plugin or rendering library to be installed and available.

## Licenses

Fokus is licensed under the MIT License; see [LICENSE](LICENSE). Phosphor icon assets are covered by [PHOSPHOR-LICENSE.txt](PHOSPHOR-LICENSE.txt).
