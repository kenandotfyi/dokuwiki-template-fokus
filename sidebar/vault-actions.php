<?php
/** Shared action list for the sidebar menu and the no-sidebar header fallback. */
if (!defined('DOKU_INC')) die();
?>
<ul>
    <?php if (auth_isadmin() && plugin_load('admin', 'fokusbutler')) : ?>
    <li class="action"><a href="<?php echo hsc(wl('', ['do'=>'admin', 'page'=>'fokusbutler', 'module'=>'settings'], true, '&')); ?>">Fokus Butler</a></li>
    <?php endif; ?>
    <?php if (($mediaButler = plugin_load('helper', 'fokusbutler')) && $mediaButler->moduleEnabled('media') && actionOK('media')) : ?>
    <li class="action"><a data-fokus-media-open aria-label="Media Library" title="Media Library" href="<?php echo hsc(wl('', ['do' => 'media'], true, '&')); ?>">Media Library</a></li>
    <?php endif; ?>
    <?php echo (new \dokuwiki\Menu\UserMenu())->getListItems('action ', false); ?>
    <?php echo (new \dokuwiki\Menu\SiteMenu())->getListItems('action ', false); ?>
</ul>
