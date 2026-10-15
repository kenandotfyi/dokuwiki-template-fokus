<?php
/** Shared action list for the sidebar menu and the no-sidebar header fallback. */
if (!defined('DOKU_INC')) die();
?>
<ul>
    <?php echo (new \dokuwiki\Menu\UserMenu())->getListItems('action ', false); ?>
    <?php echo (new \dokuwiki\Menu\SiteMenu())->getListItems('action ', false); ?>
</ul>
