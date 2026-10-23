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
    $result = ['pages' => count($ids), 'health' => null, 'tasks' => null];
    $butler = plugin_load('helper', 'fokusbutler');
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
            $project = ['tasks' => [], 'error' => ''];
            foreach (array_merge(['fokusbutler:admin'], array_keys($ids)) as $page) {
                if (!$todoist->canReadImportedTasks($page)) continue;
                $project = $todoist->getProjectTasks($page);
                break;
            }
            $byId = [];
            // Read wiki state after the project refresh has updated completion records.
            foreach ($todoist->getAllWikiTasks() as $task) {
                if (!isset($ids[$task['page']])) continue;
                $id = (string)($task['todoist_id'] ?? '');
                $key = $id !== '' ? 'todoist:' . $id : 'wiki:' . $task['page'] . ':' . $task['key'];
                $byId[$key] = ['completed' => !empty($task['completed'])];
            }
            foreach ($project['tasks'] as $task) {
                $id = (string)($task['id'] ?? '');
                if ($id !== '') $byId['todoist:' . $id] = ['completed' => !empty($task['is_completed'])];
            }
            $tasks = array_values($byId);
            $open = count(array_filter($tasks, static function ($task) { return empty($task['completed']); }));
            $result['tasks'] = ['total' => count($tasks), 'open' => $open, 'completed' => count($tasks) - $open];
            if (!empty($project['error'])) $result['tasks']['stale'] = true;
        }
    }
    return $result;
}
