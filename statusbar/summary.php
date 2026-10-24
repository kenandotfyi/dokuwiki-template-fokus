<?php
if (!defined('DOKU_INC')) die();

/** Reuse module APIs, including Todoist's cached project refresh, with their access checks. */
function fokus_statusbar_summary() {
    global $conf;
    $pages = [];
    search($pages, $conf['datadir'], 'search_allpages', []);
    $ids = [];
    foreach ($pages as $page) {
        $id = $page['id'];
        if (auth_quickaclcheck($id) >= AUTH_READ && !isHiddenPage($id)) $ids[$id] = true;
    }
    $result = ['pages' => count($ids), 'health' => null, 'tasks' => null, 'media' => null, 'jots' => null];
    $butler = plugin_load('helper', 'fokusbutler');
    foreach (['media' => 'media', 'jots' => 'memos'] as $key => $module) {
        if (!$butler || !$butler->moduleEnabled($module)) continue;
        try {
            $service = plugin_load('action', 'fokusbutler_' . $module);
            if ($service && method_exists($service, 'getSummaryStats')) $result[$key] = $service->getSummaryStats();
        } catch (Throwable $error) {
            $result[$key] = ['unavailable' => true];
        }
    }
    if ($butler && $butler->moduleEnabled('pagehealth')) {
        $health = plugin_load('action', 'fokusbutler_pagehealth');
        if ($health) {
            $stats = $health->getSummaryStats(array_keys($ids));
            $result['health'] = ['healthy' => $stats['healthy'], 'noContent' => $stats['noContent'],
                'unknown' => max(0, count($ids) - $stats['classified'])];
        }
    }
    if ($butler && $butler->moduleEnabled('todoist')) {
        $todoist = plugin_load('action', 'fokusbutler_todoist');
        if ($todoist) {
            $project = null;
            foreach (array_merge(['fokusbutler:admin'], array_keys($ids)) as $page) {
                if (!$todoist->canReadImportedTasks($page)) continue;
                $project = $todoist->getProjectTasks($page);
                break;
            }
            if ($project === null) return $result;
            if (empty($project['available'])) {
                $result['tasks'] = ['unavailable' => true];
                return $result;
            }
            $byId = [];
            // Count the same confirmed project snapshot displayed by ~~TODOS~~.
            foreach ($project['tasks'] as $task) {
                $id = (string)($task['id'] ?? '');
                if ($id !== '') $byId['todoist:' . $id] = ['completed' => !empty($task['is_completed'])];
            }
            $tasks = array_values($byId);
            $open = count(array_filter($tasks, static function ($task) { return empty($task['completed']); }));
            $result['tasks'] = ['total' => count($tasks), 'open' => $open, 'completed' => count($tasks) - $open];
            if (!empty($project['stale'])) $result['tasks']['stale'] = true;
            if (!empty($project['error'])) $result['tasks']['error'] = $project['error'];
        }
    }
    return $result;
}
