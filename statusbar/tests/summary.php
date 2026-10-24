<?php
define('DOKU_INC', __DIR__ . '/');
define('AUTH_READ', 1);
$conf = ['datadir' => 'unused'];
$enabled = true;
$projectAccess = true;
$projectTasks = [['id'=>'linked','is_completed'=>true], ['id'=>'remote-open','is_completed'=>false], ['id'=>'remote-completed','is_completed'=>true]];
$projectAvailable = true;
$projectStale = false;
$mediaAccess = true;
$jotsAccess = true;
$mediaFailure = false;
function search(&$pages, $dir, $callback, $options) {
    $pages = [['id' => 'visible'], ['id' => 'empty'], ['id' => 'hidden'], ['id' => 'restricted']];
}
function auth_quickaclcheck($id) { return $id === 'restricted' ? 0 : AUTH_READ; }
function isHiddenPage($id) { return $id === 'hidden'; }
function plugin_load($type, $name) {
    if ($name === 'fokusbutler') return new class {
        function moduleEnabled($module) { global $enabled; return $enabled; }
    };
    if ($name === 'fokusbutler_media') return new class {
        function getSummaryStats() { global $mediaAccess, $mediaFailure; if ($mediaFailure) throw new RuntimeException('Fixture failure'); return $mediaAccess ? ['total'=>7,'images'=>5,'pdfs'=>2,'audio'=>0,'video'=>0,'other'=>0] : null; }
    };
    if ($name === 'fokusbutler_memos') return new class {
        function getSummaryStats() { global $jotsAccess; return $jotsAccess ? ['total'=>3,'syncedAt'=>1,'syncing'=>false,'stale'=>false] : null; }
    };
    if ($name === 'fokusbutler_pagehealth') return new class {
        function getSummaryStats($ids) {
            if ($ids !== ['visible', 'empty']) throw new RuntimeException('Health must only receive readable, non-hidden page IDs');
            return ['healthy' => 1, 'noContent' => 0, 'classified' => 1];
        }
    };
    if ($name === 'fokusbutler_todoist') return new class {
        function canReadImportedTasks($page) { global $projectAccess; return $projectAccess; }
        function getProjectTasks($page) {
            global $projectTasks, $projectAvailable, $projectStale;
            return ['tasks'=>$projectTasks, 'available'=>$projectAvailable, 'stale'=>$projectStale, 'error'=>$projectStale ? 'Fixture failure' : ''];
        }
        function getAllWikiTasks() { throw new RuntimeException('Statusbar must never count unconfirmed wiki records'); }
    };
    return null;
}
require dirname(__DIR__) . '/summary.php';
$data = fokus_statusbar_summary();
if ($data['pages'] !== 2 || $data['health'] !== ['healthy' => 1, 'noContent' => 0, 'unknown' => 1]
    || $data['tasks'] !== ['total' => 3, 'open' => 1, 'completed' => 2]) throw new RuntimeException('Wrong authoritative/deduplicated project summary');
if ($data['media']['images'] !== 5 || $data['media']['pdfs'] !== 2 || $data['jots']['total'] !== 3) throw new RuntimeException('Media or Jots totals were not included');
$mediaAccess = false; $jotsAccess = false;
$data = fokus_statusbar_summary();
if ($data['media'] !== null || $data['jots'] !== null) throw new RuntimeException('Optional counts must preserve module access checks');
$mediaFailure = true;
$data = fokus_statusbar_summary();
if ($data['media'] !== ['unavailable'=>true] || $data['pages'] !== 2) throw new RuntimeException('A failed optional counter must not hide page totals');
$projectAccess = false;
$data = fokus_statusbar_summary();
if ($data['tasks'] !== null) throw new RuntimeException('Project totals must respect Todoist access');
$projectAccess = true;
$projectTasks = [];
$data = fokus_statusbar_summary();
if ($data['tasks'] !== ['total'=>0,'open'=>0,'completed'=>0]) throw new RuntimeException('Empty remote project kept a phantom wiki task count');
$projectStale = true;
$data = fokus_statusbar_summary();
if (empty($data['tasks']['stale']) || empty($data['tasks']['error'])) throw new RuntimeException('Stale project counts were not flagged');
$projectAvailable = false;
$data = fokus_statusbar_summary();
if ($data['tasks'] !== ['unavailable'=>true]) throw new RuntimeException('Missing first snapshot invented a zero count');
$enabled = false;
$data = fokus_statusbar_summary();
if ($data['health'] !== null || $data['tasks'] !== null || $data['media'] !== null || $data['jots'] !== null) throw new RuntimeException('Disabled modules must not appear');
echo "PASS: confirmed project tasks, deletion/empty-project counts, freshness, access boundaries, health coverage, media/Jots access boundaries, optional-counter failures and disabled modules.\n";
