<?php
/** Fokus's dependency manifest and runtime checks, independent of core changes. */
if (!defined('DOKU_INC')) die();

function fokus_dependency_status() {
    static $status;
    if ($status !== null) return $status;
    $manifest = json_decode(file_get_contents(__DIR__ . '/dependencies.json'), true);
    $status = [];
    foreach ($manifest['required'] ?? [] as $id => $dependency) {
        $available = true;
        foreach ($dependency['components'] as $component) {
            [$type, $name] = explode(':', $component, 2);
            if (!plugin_load($type, $name)) $available = false;
        }
        $status[$id] = $dependency + ['available' => $available];
    }
    return $status;
}

function fokus_dependency_available($id) {
    return fokus_dependency_status()[$id]['available'] ?? false;
}

function fokus_dependency_notice() {
    if (!auth_isadmin()) return;
    foreach (fokus_dependency_status() as $id => $dependency) {
        if ($dependency['available']) continue;
        $url = wl('', ['do' => 'admin', 'page' => 'extension', 'tab' => 'search', 'q' => 'ext:' . $id], true, '&');
        msg('Fokus requires the ' . hsc($dependency['name']) . ' plugin for page and namespace renaming. '
            . '<a href="' . hsc($url) . '">Install or enable ' . hsc($dependency['name']) . '</a>.', -1);
    }
}
