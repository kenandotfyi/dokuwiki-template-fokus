<?php
/** Per-user recent page history in the configured DokuWiki cache directory. */
if (!defined('DOKU_INC')) die();

function fokus_recents_directory($create = false) {
    global $conf;
    $directory = rtrim($conf['cachedir'], '/') . '/recents';
    if (is_link($directory)) throw new RuntimeException('The recents storage directory must not be a symbolic link.');
    if ($create && !is_dir($directory) && !@mkdir($directory, $conf['dmode'] ?? 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('Could not create the recents storage directory.');
    }
    return $directory;
}

function fokus_recents_filename() {
    $user = $_SERVER['REMOTE_USER'] ?? '';
    return fokus_recents_directory() . '/' . ($user === '' ? 'shared' : 'user-' . hash('sha256', $user)) . '.json';
}

function fokus_recents_read($file, $content = false) {
    if (is_link($file)) throw new RuntimeException('The recents storage file must not be a symbolic link.');
    if (!is_file($file)) return [];
    $contents = @file_get_contents($file);
    $data = $contents === false ? null : json_decode($contents, true);
    if (!is_array($data) || ($data['version'] ?? null) !== 1 || !isset($data['pages']) || !is_array($data['pages']) || !array_is_list($data['pages'])) {
        throw new RuntimeException('Could not read recent pages. Check the recents storage file.');
    }
    foreach ($data['pages'] as $id) {
        if ($content) {
            if (!fokus_recents_valid_content($id)) throw new RuntimeException('Recent content contains an invalid entry.');
            continue;
        }
        if (!is_string($id) || $id === '' || cleanID($id) !== $id) throw new RuntimeException('Recent pages contain an invalid page ID.');
    }
    return array_slice($content ? $data['pages'] : array_values(array_unique($data['pages'])), 0, 10);
}

function fokus_recents_update($file, callable $update, $content = false) {
    global $conf;
    $directory = fokus_recents_directory(true);
    $lockFile = $file . '.lock';
    if (is_link($lockFile) || is_link($file)) throw new RuntimeException('Recents storage must not use symbolic links.');
    $lock = @fopen($lockFile, 'c');
    if (!$lock) throw new RuntimeException('Could not open recents storage for writing.');
    $temporary = null;
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock recents storage.');
        $previous = fokus_recents_read($file, $content);
        $updated = $update($previous);
        $next = array_slice($content ? array_values($updated) : array_values(array_unique($updated)), 0, 10);
        if ($next === $previous) return $previous;
        $temporary = @tempnam($directory, '.recents-');
        if ($temporary === false || realpath(dirname($temporary)) !== realpath($directory)) throw new RuntimeException('Could not create a temporary recents file.');
        $json = json_encode(['version' => 1, 'pages' => $next], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
        if (@file_put_contents($temporary, $json) !== strlen($json)) throw new RuntimeException('Could not save recent pages.');
        if (!@chmod($temporary, $conf['fmode'] ?? 0644) || !@rename($temporary, $file)) throw new RuntimeException('Could not replace recent pages.');
        $temporary = null;
        return $next;
    } finally {
        if (is_string($temporary)) @unlink($temporary);
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function fokus_recents_valid_content($entry) {
    return is_array($entry)
        && is_string($entry['id'] ?? null) && $entry['id'] !== '' && strlen($entry['id']) <= 2048
        && !preg_match('/[\x00-\x1f\x7f]/', $entry['id'])
        && is_string($entry['title'] ?? null) && $entry['title'] !== '' && strlen($entry['title']) <= 2048
        && is_string($entry['provider'] ?? null) && $entry['provider'] !== 'wiki'
        && preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $entry['provider']);
}

function fokus_content_recents_endpoint() {
    global $INPUT;
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) throw new RuntimeException('Use GET or POST for recent content.', 405);
    $file = substr(fokus_recents_filename(), 0, -5) . '.content.json';
    if ($method === 'GET') return ['pages' => fokus_recents_read($file, true)];
    if (!checkSecurityToken($INPUT->post->str('sectok'))) throw new RuntimeException('Your session expired. Reload and try again.', 403);
    $entry = ['id' => $INPUT->post->str('target'), 'title' => $INPUT->post->str('title'), 'provider' => $INPUT->post->str('provider')];
    if (!fokus_recents_valid_content($entry)) throw new RuntimeException('Invalid recent content.', 400);
    $pages = fokus_recents_update($file, static function ($previous) use ($entry) {
        return [$entry, ...array_values(array_filter($previous, static fn($item) => $item['id'] !== $entry['id'] || $item['provider'] !== $entry['provider']))];
    }, true);
    return ['pages' => $pages];
}

function fokus_recents_page_hidden($id) {
    if (isHiddenPage($id)) return true;
    $hideRegex = (string) tpl_getConf('sidebar_hide_regex', '');
    if ($hideRegex === '') return false;
    do {
        if (@preg_match('/' . $hideRegex . '/ui', $id) === 1) return true;
        $id = getNS($id);
    } while ($id !== false && $id !== '');
    return false;
}

function fokus_recents_visible_pages($ids) {
    $pages = [];
    foreach ($ids as $id) {
        if (!page_exists($id) || auth_quickaclcheck($id) < AUTH_READ || fokus_recents_page_hidden($id)) continue;
        $title = trim((string) p_get_first_heading($id));
        $pages[] = [
            'id' => $id,
            'title' => $title !== '' ? $title : str_replace('_', ' ', noNS($id)),
            'url' => wl($id, '', true, '&'),
        ];
    }
    return $pages;
}

function fokus_recents_endpoint() {
    global $INPUT;
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) throw new RuntimeException('Use GET or POST for recent pages.', 405);
    $file = fokus_recents_filename();
    if ($method === 'GET') return ['pages' => fokus_recents_visible_pages(fokus_recents_read($file))];

    if (!checkSecurityToken($INPUT->post->str('sectok'))) throw new RuntimeException('Your session expired. Reload and try again.', 403);
    $id = $INPUT->post->str('target');
    if ($id === '' || cleanID($id) !== $id || !page_exists($id)) throw new RuntimeException('Invalid recent page.', 400);
    if (auth_quickaclcheck($id) < AUTH_READ || fokus_recents_page_hidden($id)) throw new RuntimeException('This page is unavailable.', 403);

    $ids = fokus_recents_update($file, static function ($previous) use ($id) {
        return [$id, ...array_values(array_diff($previous, [$id]))];
    });
    return ['pages' => fokus_recents_visible_pages($ids)];
}
