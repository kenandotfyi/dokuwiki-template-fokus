<?php
if (!defined('DOKU_INC')) die();

function fokus_sidebar_icon($name) {
    // Official Phosphor duotone assets (MIT; see ../PHOSPHOR-LICENSE.txt).
    $duotone = ['home' => 'asterisk', 'files' => 'folder', 'tags' => 'tag', 'new' => 'file-plus', 'pin' => 'push-pin', 'unpin' => 'push-pin-slash', 'file' => 'file-text', 'refresh' => 'arrows-clockwise', 'actions' => 'dots-six', 'filter' => 'binoculars', 'search' => 'magnifying-glass', 'sidebar' => 'sidebar', 'rename' => 'text-strikethrough', 'delete' => 'trash', 'folder' => 'folder', 'folder-open' => 'folder-open', 'expand-all' => 'arrows-out-line-vertical', 'collapse-all' => 'arrows-in-line-vertical', 'theme-light' => 'sun', 'theme-dark' => 'moon'];
    return str_replace('<svg ', '<svg aria-hidden="true" focusable="false" ', file_get_contents(__DIR__ . '/icons/' . $duotone[$name] . '-duotone.svg'));
}
$sidebarConfig = [
    'endpoint' => wl($ID, ['do' => 'show'], true, '&'),
    'pageId' => $ID,
    'startPage' => $conf['start'],
    'homeUrl' => wl($conf['start'], '', true, '&'),
    'securityToken' => getSecurityToken(),
    'trackInitialPage' => $ACT === 'show' && page_exists($ID),
    'moveAvailable' => fokus_dependency_available('move'),
    'pageHealthAvailable' => ($butler = plugin_load('helper', 'fokusbutler')) && $butler->moduleEnabled('pagehealth'),
    'ajaxEndpoint' => DOKU_BASE . 'lib/exe/ajax.php',
    'storageKey' => 'fokus-sidebar:' . DOKU_BASE . ':' . ($_SERVER['REMOTE_USER'] ?? 'anonymous'),
];
?>
<aside id="fokus-sidebar" aria-label="Wiki navigation">
    <div class="fokus-sidebar-top">
        <div class="fokus-sidebar-identity">
            <span class="fokus-sidebar-name" title="<?php echo hsc(strip_tags($conf['title'])); ?>"><?php echo hsc(strip_tags($conf['title'])); ?></span>
            <div class="fokus-sidebar-identity-actions">
            <?php if ($darkModeEnabled) : ?>
                <button type="button" class="fokus-theme-toggle" aria-label="Switch to dark theme" title="Switch to dark theme" aria-pressed="false"><?php echo str_replace('<svg ', '<svg class="fokus-theme-icon-light" ', fokus_sidebar_icon('theme-light')); ?><?php echo str_replace('<svg ', '<svg class="fokus-theme-icon-dark" ', fokus_sidebar_icon('theme-dark')); ?></button>
            <?php endif; ?>
            <?php if ($conf['useacl'] && !empty($_SERVER['REMOTE_USER'])) : ?>
            <details class="fokus-vault-menu fokus-sidebar-actions">
                <summary aria-label="Wiki actions" title="Wiki actions"><?php echo fokus_sidebar_icon('actions'); ?></summary>
                <div class="fokus-vault-dropdown"><?php include __DIR__ . '/vault-actions.php'; ?></div>
            </details>
            <?php endif; ?>
            </div>
        </div>
        <div class="fokus-sidebar-navigation">
            <div class="fokus-sidebar-navigation-left">
            <a class="fokus-sidebar-home" href="<?php echo hsc(wl('start', '', true, '&')); ?>" aria-label="Home" title="Home"><?php echo fokus_sidebar_icon('home'); ?></a>
            <div class="fokus-sidebar-tabs" role="tablist" aria-label="Navigation views">
            <button type="button" id="fokus-files-tab" role="tab" aria-label="Files" title="Files" aria-selected="true" aria-controls="fokus-files-panel" data-view="files"><?php echo fokus_sidebar_icon('files'); ?></button>
            <button type="button" id="fokus-tags-tab" role="tab" aria-label="Tags" title="Tags" aria-selected="false" aria-controls="fokus-tags-panel" data-view="tags" tabindex="-1"><?php echo fokus_sidebar_icon('tags'); ?></button>
            </div>
            </div>
            <label class="fokus-sidebar-filter" id="fokus-sidebar-filter-area" aria-hidden="true" inert>
                <input type="search" id="fokus-sidebar-filter" placeholder="Filter…" aria-label="Filter files" autocomplete="off" spellcheck="false" disabled />
            </label>
            <div class="fokus-sidebar-navigation-actions">
                <button type="button" class="fokus-search-open" aria-label="Search the wiki" title="Search the wiki (Ctrl+Shift+F)"><?php echo fokus_sidebar_icon('search'); ?></button>
                <button type="button" class="fokus-sidebar-filter-toggle" aria-label="Toggle file filter" title="Filter files" aria-controls="fokus-sidebar-filter-area" aria-expanded="false"><?php echo fokus_sidebar_icon('filter'); ?></button>
            </div>
        </div>
    </div>
    <section id="fokus-files-panel" class="fokus-sidebar-panel" role="tabpanel" aria-labelledby="fokus-files-tab">
        <section class="fokus-pinned-section" aria-labelledby="fokus-pinned-heading">
            <div class="fokus-sidebar-heading"><span id="fokus-pinned-heading">Pinned</span><button type="button" class="fokus-sidebar-icon-button" id="fokus-pin-current" aria-label="Pin current page" title="Pin current page" aria-pressed="false" disabled><?php echo fokus_sidebar_icon('pin'); ?></button></div>
            <div id="fokus-pinned-list"></div>
            <p id="fokus-pinned-status" role="status">Loading pinned files…</p>
            <p id="fokus-pinned-empty">Open a file, then pin it here.</p>
        </section>
        <section id="fokus-recents-section" class="fokus-recents-section" aria-labelledby="fokus-recents-heading" hidden>
            <div class="fokus-sidebar-heading"><span id="fokus-recents-heading">Recents</span></div>
            <div id="fokus-recents-list"></div>
        </section>
        <div class="fokus-sidebar-heading"><span>Files</span><div class="fokus-sidebar-heading-actions"><button type="button" class="fokus-sidebar-icon-button" data-refresh="files" aria-label="Refresh files" title="Refresh files"><?php echo fokus_sidebar_icon('refresh'); ?></button><button type="button" id="fokus-toggle-namespaces" class="fokus-sidebar-icon-button" aria-label="Expand all namespaces" title="Expand all namespaces" disabled><?php echo fokus_sidebar_icon('expand-all'); ?></button><button type="button" id="fokus-create-file" class="fokus-sidebar-icon-button" aria-label="Create file" title="Create file"><?php echo fokus_sidebar_icon('new'); ?></button></div></div>
        <p class="fokus-sidebar-status" role="status">Loading pages…</p>
        <div id="fokus-file-tree"></div>
    </section>
    <section id="fokus-tags-panel" class="fokus-sidebar-panel" role="tabpanel" aria-labelledby="fokus-tags-tab" hidden>
        <div class="fokus-sidebar-heading"><span>All tags</span><button type="button" class="fokus-sidebar-icon-button" data-refresh="tags" aria-label="Refresh tags" title="Refresh tags"><?php echo fokus_sidebar_icon('refresh'); ?></button></div>
        <p class="fokus-sidebar-status" role="status"></p>
        <div id="fokus-tag-list"></div>
    </section>
    <div class="fokus-sidebar-footer"><span id="fokus-sidebar-count"></span><span id="fokus-sidebar-health" hidden></span></div>
    <div class="fokus-sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Sidebar width" aria-valuemin="200" aria-valuemax="440" aria-valuenow="260" tabindex="0"></div>
    <template id="fokus-icon-pin"><?php echo fokus_sidebar_icon('pin'); ?></template>
    <template id="fokus-icon-unpin"><?php echo fokus_sidebar_icon('unpin'); ?></template>
    <template id="fokus-icon-file"><?php echo fokus_sidebar_icon('file'); ?></template>
    <template id="fokus-icon-rename"><?php echo fokus_sidebar_icon('rename'); ?></template>
    <template id="fokus-icon-delete"><?php echo fokus_sidebar_icon('delete'); ?></template>
    <template id="fokus-icon-new"><?php echo fokus_sidebar_icon('new'); ?></template>
    <template id="fokus-icon-folder"><?php echo fokus_sidebar_icon('folder'); ?></template>
    <template id="fokus-icon-folder-open"><?php echo fokus_sidebar_icon('folder-open'); ?></template>
    <template id="fokus-icon-expand-all"><?php echo fokus_sidebar_icon('expand-all'); ?></template>
    <template id="fokus-icon-collapse-all"><?php echo fokus_sidebar_icon('collapse-all'); ?></template>
</aside>
<style>
/* Keep the sidebar's new controls usable even while DokuWiki serves a cached css.php bundle. */
#fokus-sidebar .fokus-sidebar-identity-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 4px; }
#fokus-sidebar .fokus-theme-toggle { display: inline-flex; flex: 0 0 24px; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--fokus-control-radius); color: var(--fokus-muted); }
#fokus-sidebar .fokus-theme-toggle svg { width: 17px; height: 17px; }
#fokus-sidebar .fokus-theme-icon-dark { display: none; }
html[data-theme="dark"] #fokus-sidebar .fokus-theme-icon-light { display: none; }
html[data-theme="dark"] #fokus-sidebar .fokus-theme-icon-dark { display: block; }
#fokus-recents-list { display: flex; flex-direction: column; max-height: 150px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 0 8px; }
#fokus-recents-list::-webkit-scrollbar { display: none; }
#fokus-sidebar .fokus-recent-row { display: flex; flex: 0 0 30px; align-items: center; min-height: 30px; padding: 5px 8px; gap: 8px; color: var(--fokus-text); text-decoration: none; }
#fokus-sidebar .fokus-recent-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
<script>
(function () {
    var button = document.querySelector('#fokus-sidebar .fokus-theme-toggle');
    if (!button) return;
    function sync(theme) {
        var dark = theme === 'dark';
        var label = dark ? 'Switch to light theme' : 'Switch to dark theme';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', String(dark));
        button.querySelector('.fokus-theme-icon-light').hidden = dark;
        button.querySelector('.fokus-theme-icon-dark').hidden = !dark;
    }
    sync(document.documentElement.dataset.theme);
    button.addEventListener('click', function (event) {
        event.stopPropagation();
        var theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = theme;
        sync(theme);
        try { localStorage.setItem('fokus-theme', theme); } catch (error) { /* Theme still applies for this page. */ }
    });
    new MutationObserver(function () {
        sync(document.documentElement.dataset.theme);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
</script>
<div id="fokus-file-menu" role="menu" aria-label="File actions" data-file-tree-context-menu-root="true" hidden></div>
<dialog id="fokus-file-action-dialog" class="fokus-sidebar-dialog" aria-labelledby="fokus-file-action-title">
    <form id="fokus-file-action-form">
        <h2 id="fokus-file-action-title"></h2>
        <p id="fokus-file-action-description"></p>
        <div id="fokus-file-action-name-field"><label for="fokus-file-action-name">New name</label><input id="fokus-file-action-name" type="text" autocomplete="off" spellcheck="false" aria-describedby="fokus-file-action-description fokus-file-action-error" /></div>
        <p id="fokus-file-action-error" class="fokus-dialog-error" role="status" hidden></p>
        <div class="fokus-new-page-actions"><button type="button" id="fokus-file-action-cancel">Cancel</button><button type="submit" id="fokus-file-action-submit"></button></div>
    </form>
</dialog>
<dialog id="fokus-new-page-dialog" class="fokus-sidebar-dialog" aria-labelledby="fokus-new-page-title">
    <form id="fokus-new-page-form">
        <h2 id="fokus-new-page-title">Create page</h2>
        <label for="fokus-new-page-name">Page name</label>
        <input id="fokus-new-page-name" type="text" required autocomplete="off" spellcheck="false" aria-describedby="fokus-new-page-help fokus-new-page-error" />
        <p id="fokus-new-page-help">Use namespace:page to create a page inside a folder.</p>
        <p id="fokus-new-page-error" role="status" hidden></p>
        <div class="fokus-new-page-actions"><button type="button" id="fokus-new-page-cancel">Cancel</button><button type="submit">Create page</button></div>
    </form>
</dialog>
<script>window.FokusSidebarConfig = <?php echo json_encode($sidebarConfig, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;</script>
<script type="module" src="<?php echo tpl_basedir(); ?>sidebar/sidebar.bundle.js?v=<?php echo filemtime(__DIR__ . '/sidebar.bundle.js'); ?>"></script>
