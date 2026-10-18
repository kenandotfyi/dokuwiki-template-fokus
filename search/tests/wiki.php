<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = getenv('DOKUWIKI_TEST_ROOT');
if (!$root || !is_file($root . '/inc/init.php') || !str_contains(realpath($root), 'zoterobridge-runtime')) {
    fwrite(STDERR, "Use an isolated zoterobridge-runtime DokuWiki installation.\n"); exit(2);
}
define('DOKU_INC', rtrim($root, '/') . '/');
define('NOSESSION', 1);
require DOKU_INC . 'inc/init.php';
set_exception_handler(static function (Throwable $error) { fwrite(STDERR, $error->getMessage() . "\n"); exit(1); });
require dirname(__DIR__) . '/provider.php';
$checks = 0;
function verify($value, $message) { global $checks; if (!$value) throw new RuntimeException($message); $checks++; }
$auth = plugin_load('auth', 'authplain');
$conf['useacl'] = 1;
$conf['hidepages'] = '(^|:)search_hidden';
$AUTH_ACL = ['* @ALL 1', '* @admin 255', 'search_private @ALL 0', 'search_private @admin 255'];
$INPUT->server->set('REMOTE_USER', 'admin');
$USERINFO = ['grps' => ['admin', 'user']];
foreach (['search_public' => 'Public fixture', 'search_private' => 'Private fixture', 'search_hidden' => 'Hidden fixture'] as $id => $title) {
    $phraseText = $id === 'search_public'
        ? 'The phrase is between the ohmic region in this page.'
        : 'The words between them are separated from the ohmic region in this page.';
    file_put_contents(wikiFN($id), '====== Searchprobe ' . $title . " ======\n\nLiteral bodyuniqueterm content for search fixtures. " . $phraseText . "\n");
    p_get_metadata($id, '', METADATA_RENDER_UNLIMITED);
    (new dokuwiki\Search\Indexer())->addPage($id, true);
}
$all = fokus_search_wiki('searchprobe');
verify($all['total'] === 2, 'Admin search lost readable pages or exposed hidden pages: ' . json_encode($all));
verify(count(fokus_search_wiki('bodyuniqueterm')['results']) === 2, 'Fulltext body search did not run');
$wordResults = fokus_search_wiki('between the ohmic region');
verify($wordResults['total'] === 2, 'All-words wiki search did not retain separated-word matches');
$phraseResults = fokus_search_wiki('between the ohmic region', 0, 20, 'phrase');
verify($phraseResults['total'] === 1 && $phraseResults['results'][0]['key'] === 'search_public', 'Exact-phrase wiki search did not require the adjacent ordered phrase');
$INPUT->server->set('REMOTE_USER', 'reader');
$USERINFO = ['grps' => ['user']];
$readable = fokus_search_wiki('searchprobe');
verify($readable['total'] === 1 && $readable['results'][0]['key'] === 'search_public', 'Reader search exposed private or hidden IDs');
verify(!str_contains(json_encode($readable), 'Private fixture'), 'Search metadata leaked a private title');
$INPUT->server->set('REMOTE_USER', '');
$USERINFO = ['grps' => []];
verify(fokus_search_wiki('searchprobe')['total'] === 1, 'Anonymous search ignored wiki ACLs');
verify(fokus_search_wiki('between the ohmic region', 0, 20, 'phrase')['total'] === 1, 'Exact-phrase search did not respect reader ACLs');
verify(fokus_search_wiki('')['results'] === [], 'Empty search returned data');
verify(fokus_search_wiki('searchprobe', 0, 1)['hasMore'] === false, 'Pagination leaked private hit counts');
try { fokus_search_wiki(str_repeat('x', 513)); throw new RuntimeException('Oversized query accepted'); }
catch (InvalidArgumentException $expected) { $checks++; }
try { fokus_search_wiki('searchprobe', 0, 20, 'unsupported'); throw new RuntimeException('Invalid search mode accepted'); }
catch (InvalidArgumentException $expected) { $checks++; }
$fixtures = json_decode(file_get_contents('/private/tmp/fokus-search-format-fixtures.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($fixtures as $name => $wiki) {
    $info = [];
    $html = p_render('xhtml', p_get_instructions($wiki), $info);
    verify(!str_contains($html, 'todoistcompanion-task') && !str_contains($html, 'todoistcompanion-todos'), 'Retrieved text executed Todoist syntax: ' . $name);
    verify(!str_contains($html, '<script>'), 'Retrieved text injected HTML: ' . $name);
    if ($name === 'normal') verify(str_contains(strip_tags($html), 'VGS&lt;6V; VDS&gt;400V'), 'Engineering comparison text was altered');
    if ($name === 'attack') verify(str_contains(html_entity_decode(strip_tags($html)), '</nowiki>**literal**'), 'Literal closing nowiki text was lost');
}
echo "Passed $checks wiki search, ACL, and insertion-rendering checks.\n";
