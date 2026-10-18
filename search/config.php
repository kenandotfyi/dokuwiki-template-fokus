<?php
if (!defined('DOKU_INC')) die();
$zoteroSearchAvailable = false;
if (is_dir(DOKU_PLUGIN . 'zoterobridge') && !plugin_isdisabled('zoterobridge')) {
    $zoteroSearchHelper = plugin_load('helper', 'zoterobridge');
    $zoteroSearchAvailable = $zoteroSearchHelper && $zoteroSearchHelper->canRead()
        && \ZoteroBridge\Credentials::valid($zoteroSearchHelper->credentials()['key']);
}
