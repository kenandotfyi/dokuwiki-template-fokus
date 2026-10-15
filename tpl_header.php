<?php

/**
 * Template header, included in the main and detail files
 */

if (!defined('DOKU_INC')) die();
?>

<header id="dokuwiki__header"><div class="pad group">
    <div class="fokus-workspace-bar">
      <div class="fokus-toolbar">
        <?php if (!empty($sidebarEnabled)) : ?>
        <button type="button" class="fokus-sidebar-toggle" aria-label="Toggle sidebar" aria-controls="fokus-sidebar" aria-expanded="true" title="Toggle sidebar"><?php echo fokus_sidebar_icon('sidebar'); ?></button>
        <?php endif; ?>
        <?php if (empty($sidebarEnabled) && $conf['useacl'] && !empty($_SERVER['REMOTE_USER'])) : ?>
            <details class="fokus-vault-menu">
                <summary aria-label="Vault menu" title="Vault">VAULT</summary>
                <div class="fokus-vault-dropdown"><?php include __DIR__ . '/sidebar/vault-actions.php'; ?></div>
            </details>
        <?php endif ?>
      </div>
    </div>
</div></header><!-- /header -->
