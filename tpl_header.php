<?php

/**
 * Template header, included in the main and detail files
 */

if (!defined('DOKU_INC')) die();
?>

<header id="dokuwiki__header"><div class="pad group">
    <div class="fokus-workspace-bar">
      <?php if (empty($sidebarEnabled) && $conf['useacl'] && !empty($_SERVER['REMOTE_USER'])) : ?>
      <div class="fokus-toolbar">
            <details class="fokus-vault-menu">
                <summary aria-label="Vault menu" title="Vault">VAULT</summary>
                <div class="fokus-vault-dropdown"><?php include __DIR__ . '/sidebar/vault-actions.php'; ?></div>
            </details>
      </div>
      <?php endif; ?>
    </div>
</div></header><!-- /header -->
