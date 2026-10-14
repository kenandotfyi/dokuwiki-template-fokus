<?php

/**
 * Template header, included in the main and detail files
 */

if (!defined('DOKU_INC')) die();
?>

<header id="dokuwiki__header"><div class="pad group">
    <div class="fokus-workspace-bar">
      <div class="fokus-toolbar">
        <?php if ($conf['useacl'] && !empty($_SERVER['REMOTE_USER'])) : ?>
            <details class="fokus-vault-menu">
                <summary aria-label="Vault menu" title="Vault">VAULT</summary>
                <div class="fokus-vault-dropdown"><ul>
                    <li class="fokus-vault-home"><?php
                    tpl_link(
                        wl(),
                        '<span>' . $conf['title'] . '</span>',
                        'accesskey="h" title="' . tpl_getLang('home') . ' [h]"'
                    );
                    ?></li>
                    <?php echo (new \dokuwiki\Menu\UserMenu())->getListItems('action '); ?>
                    <?php echo (new \dokuwiki\Menu\SiteMenu())->getListItems('action ', false); ?>
                </ul></div>
            </details>
        <?php endif ?>
      </div>
    </div>
</div></header><!-- /header -->
