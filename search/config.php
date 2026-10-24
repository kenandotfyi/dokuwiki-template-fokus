<?php
if (!defined('DOKU_INC')) die();
$zoteroSearchAvailable = false;
$searchButler = plugin_load('helper', 'fokusbutler');
$wikipediaSearchAvailable = $searchButler && $searchButler->moduleEnabled('content');
if (is_dir(DOKU_PLUGIN . 'zoterobridge') && !plugin_isdisabled('zoterobridge')) {
    $zoteroSearchHelper = plugin_load('helper', 'zoterobridge');
    $zoteroSearchAvailable = $zoteroSearchHelper && $zoteroSearchHelper->canRead()
        && \ZoteroBridge\Credentials::valid($zoteroSearchHelper->credentials()['key']);
}

$jotsSearchAction = $searchButler && $searchButler->moduleEnabled('memos') ? plugin_load('action', 'fokusbutler_memos') : null;
$jotsSearchAvailable = $jotsSearchAction && method_exists($jotsSearchAction, 'searchAvailable') && $jotsSearchAction->searchAvailable();
