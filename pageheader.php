<?php

global $ID;

$pageTitle = p_get_first_heading($ID);
if (!$pageTitle) {
    $pageTitle = str_replace(['_', ':'], [' ', ' / '], $ID);
    $pageTitle = ucwords($pageTitle);
}
?>

<div class="topBanner">
    <div class="fokus-page-heading">
        <span class="fokus-page-title"><?php echo hsc($pageTitle) ?></span>
        <span class="fokus-page-id"><?php echo hsc($ID) ?>.txt</span>
    </div>
</div>
