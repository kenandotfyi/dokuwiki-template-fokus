<?php if (!defined('DOKU_INC')) die(); ?>
<footer id="fokus-statusbar" aria-label="Wiki status"
    data-endpoint="<?php echo hsc(wl($ID, ['do' => 'show', 'fokus_status' => '1'], true, '&')); ?>"
    data-ajax="<?php echo hsc(DOKU_BASE . 'lib/exe/ajax.php'); ?>"
    data-zotero="<?php echo $zoteroSearchAvailable ? '1' : '0'; ?>"
    data-token="<?php echo hsc(getSecurityToken()); ?>">
    <?php if (!empty($sidebarEnabled)) : ?>
    <button type="button" class="fokus-sidebar-toggle" aria-label="Toggle sidebar" aria-controls="fokus-sidebar" aria-expanded="true" title="Toggle sidebar"><?php echo fokus_sidebar_icon('sidebar'); ?></button>
    <?php endif; ?>
    <span class="fokus-status-item" id="fokus-status-pages" title="Pages you can read in this wiki"><img src="<?php echo tpl_basedir(); ?>sidebar/icons/file-text-duotone.svg" alt=""><span>Loading wiki status…</span></span>
    <span class="fokus-status-item" id="fokus-status-media" hidden><img src="<?php echo DOKU_BASE; ?>lib/plugins/fokusbutler/core/icons/image-duotone.svg" alt=""><span></span></span>
    <span class="fokus-status-item" id="fokus-status-jots" hidden><img src="<?php echo tpl_basedir(); ?>statusbar/icons/memos.webp" alt=""><span></span></span>
    <span class="fokus-status-item" id="fokus-status-health" hidden><img src="<?php echo tpl_basedir(); ?>sidebar/icons/dot-duotone.svg" alt=""><span></span></span>
    <span class="fokus-status-item" id="fokus-status-tasks" hidden><img src="<?php echo DOKU_BASE; ?>lib/plugins/fokusbutler/modules/todoist/icons/todoist.svg" alt=""><span></span></span>
    <div class="fokus-status-syncs">
    <span class="fokus-status-item fokus-status-sync-state" id="fokus-status-memos-sync" hidden>
        <?php foreach (['synced' => 'cloud-check', 'error' => 'cloud-slash'] as $state => $name) {
            echo str_replace('<svg ', '<svg data-sync-icon="' . $state . '" aria-hidden="true" focusable="false" ', file_get_contents(__DIR__ . '/icons/' . $name . '-duotone.svg'));
        } ?>
        <?php echo str_replace('<svg ', '<svg data-sync-icon="syncing" aria-hidden="true" focusable="false" ', file_get_contents(dirname(__DIR__) . '/sidebar/icons/arrows-clockwise-duotone.svg')); ?>
        <span aria-live="polite"></span>
    </span>
    <span class="fokus-status-item fokus-status-sync-state" id="fokus-status-zotero" hidden>
        <?php foreach (['synced' => 'cloud-check', 'error' => 'cloud-slash'] as $state => $name) {
            echo str_replace('<svg ', '<svg data-sync-icon="' . $state . '" aria-hidden="true" focusable="false" ', file_get_contents(__DIR__ . '/icons/' . $name . '-duotone.svg'));
        } ?>
        <?php echo str_replace('<svg ', '<svg data-sync-icon="syncing" aria-hidden="true" focusable="false" ', file_get_contents(dirname(__DIR__) . '/sidebar/icons/arrows-clockwise-duotone.svg')); ?>
        <span aria-live="polite"></span>
        <?php if ($zoteroSearchAvailable) : ?>
        <button type="button" id="fokus-status-sync" aria-label="Sync Zotero now" title="Sync Zotero now"><?php echo str_replace('<svg ', '<svg aria-hidden="true" focusable="false" ', file_get_contents(dirname(__DIR__) . '/sidebar/icons/arrows-clockwise-duotone.svg')); ?></button>
        <?php endif; ?>
    </span>
    </div>
</footer>
