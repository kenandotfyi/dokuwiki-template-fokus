<?php
/** Shared action list for the sidebar menu and the no-sidebar header fallback. */
if (!defined('DOKU_INC')) die();
?>
<ul>
    <?php if (auth_isadmin() && plugin_load('admin', 'fokussettings')) : ?>
    <li class="action"><a href="<?php echo hsc(wl('', ['do'=>'admin', 'page'=>'fokussettings'], true, '&')); ?>">Fokus Settings</a></li>
    <?php endif; ?>
    <?php echo (new \dokuwiki\Menu\UserMenu())->getListItems('action ', false); ?>
    <?php echo (new \dokuwiki\Menu\SiteMenu())->getListItems('action ', false); ?>
</ul>
