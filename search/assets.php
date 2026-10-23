<?php
if (!defined('DOKU_INC')) die();
$searchAssets = require __DIR__ . '/manifest.php';
?>
<link rel="stylesheet" href="<?php echo tpl_basedir(); ?>search/dist/<?php echo hsc($searchAssets['style']); ?>">
<script>window.FokusSearchConfig = <?php echo json_encode(['templateBase'=>tpl_basedir(), 'zotero'=>$zoteroSearchAvailable, 'wikipedia'=>$wikipediaSearchAvailable, 'securityToken'=>getSecurityToken()], JSON_HEX_TAG | JSON_HEX_AMP); ?>;</script>
<script src="<?php echo tpl_basedir(); ?>search/dist/<?php echo hsc($searchAssets['script']); ?>"></script>
