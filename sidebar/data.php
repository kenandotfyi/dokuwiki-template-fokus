<?php
/** Navigation data and guarded mutations served through DokuWiki's initialized template. */
if (!defined('DOKU_INC')) die();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
// A missing current wiki page must not make a valid navigation response a 404.
http_response_code(200);

$kind = $INPUT->get->str('fokus_nav');
$result = [];
if ($kind === 'target' || $kind === 'action') require __DIR__ . '/actions.php';
if ($kind === 'pins') {
    require_once __DIR__ . '/pins.php';
    try {
        $result = fokus_pins_endpoint();
    } catch (Throwable $error) {
        $code = (int) $error->getCode();
        http_response_code(in_array($code, [400, 403, 405], true) ? $code : 500);
        $result = ['error' => $error instanceof RuntimeException ? $error->getMessage() : 'Could not load or save pinned files.'];
    }
} elseif ($kind === 'recents' || $kind === 'content-recents') {
    require_once __DIR__ . '/recents.php';
    try {
        $result = $kind === 'content-recents' ? fokus_content_recents_endpoint() : fokus_recents_endpoint();
    } catch (Throwable $error) {
        $code = (int) $error->getCode();
        http_response_code(in_array($code, [400, 403, 405], true) ? $code : 500);
        $result = ['error' => $error instanceof RuntimeException ? $error->getMessage() : 'Could not load or save recent pages.'];
    }
} elseif ($kind === 'files') {
    require_once DOKU_INC . 'inc/search.php';
    $pages = [];
    search($pages, $conf['datadir'], 'search_allpages', []);
    $result['pages'] = [];
    $headings = [];
    $namespaces = [];
    $hideRegex = (string) tpl_getConf('sidebar_hide_regex', '');
    $hiddenFromTree = static function ($id) use ($hideRegex) {
        if ($hideRegex === '') return false;
        // Use the same delimiters and modifiers as Configuration Manager's
        // regex validator. Check ancestors so a namespace match hides its tree.
        do {
            if (@preg_match('/' . $hideRegex . '/ui', $id) === 1) return true;
            $id = getNS($id);
        } while ($id !== false && $id !== '');
        return false;
    };
    foreach ($pages as $page) {
        $id = $page['id'];
        if (isHiddenPage($id)) continue;
        $heading = trim((string) p_get_first_heading($id));
        $hidden = $hiddenFromTree($id);
        if (!$hidden) $headings[$id] = $heading;
        $result['pages'][] = [
            'id' => $id,
            'path' => str_replace(':', '/', $id) . '.txt',
            'title' => $heading !== '' ? $heading : str_replace('_', ' ', noNS($id)),
            'hiddenFromTree' => $hidden,
            'url' => wl($id, '', true, '&'),
        ];
        if ($hidden) continue;
        $namespace = getNS($id);
        while ($namespace !== false && $namespace !== '') {
            $namespaces[$namespace] = true;
            $namespace = getNS($namespace);
        }
    }
    $result['namespaces'] = [];
    foreach ($namespaces as $namespace => $_) {
        // Only use headings from the readable, non-hidden page list above.
        $heading = $headings[$namespace] ?? '';
        if ($heading === '') $heading = $headings[$namespace . ':' . $conf['start']] ?? '';
        $result['namespaces'][str_replace(':', '/', $namespace) . '/'] =
            $heading !== '' ? $heading : str_replace('_', ' ', noNS($namespace));
    }
} elseif ($kind === 'newpage') {
    // Resolve names with core rules. Creation and saving stay in do=edit.
    $id = cleanID($INPUT->get->str('page'));
    $permission = $id !== '' ? auth_quickaclcheck($id) : 0;
    if ($id === '') {
        http_response_code(400);
        $result['error'] = 'Enter a valid page name.';
    } elseif ($permission < AUTH_READ || (!page_exists($id) && $permission < AUTH_CREATE)) {
        http_response_code(403);
        $result['error'] = 'You do not have permission to create a page here.';
    } else {
        $result = ['id' => $id, 'exists' => page_exists($id), 'url' => wl($id, '', true, '&'),
            'editUrl' => wl($id, ['do' => 'edit'], true, '&')];
    }
} elseif ($kind === 'tags' || $kind === 'tag') {
    $tagHelper = plugin_load('helper', 'tag');
    $result['available'] = (bool) $tagHelper;
    if ($kind === 'tags') {
        $result['tags'] = [];
        $counts = $tagHelper ? $tagHelper->tagOccurrences([], null, true) : [];
        uksort($counts, 'strnatcasecmp');
        foreach ($counts as $tag => $count) {
            $result['tags'][] = ['id' => (string) $tag, 'count' => $count];
        }
    } else {
        $tag = $INPUT->get->str('tag');
        // Only accept an indexed tag visible to this user, not a tag query.
        $visibleTags = $tagHelper ? $tagHelper->tagOccurrences([], null, true) : [];
        $result['pages'] = [];
        if (isset($visibleTags[$tag])) {
            foreach ($tagHelper->getTopic('', null, $tag) as $page) {
                $result['pages'][] = [
                    'id' => $page['id'],
                    'title' => $page['title'] ?: str_replace('_', ' ', noNS($page['id'])),
                    'url' => wl($page['id'], '', true, '&'),
                ];
            }
        }
    }
} else {
    http_response_code(400);
    $result['error'] = 'Unknown navigation view.';
}
echo json_encode($result, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE);
exit;
