<?php
/** Server-side pin lists in the configured DokuWiki cache directory. */
if (!defined('DOKU_INC')) die();

function fokus_pins_directory($create = false) {
    global $conf;
    $directory = rtrim($conf['cachedir'], '/') . '/pinned';
    if (is_link($directory)) throw new RuntimeException('The pinned storage directory must not be a symbolic link.');
    if ($create && !is_dir($directory) && !@mkdir($directory, $conf['dmode'] ?? 0755, true) && !is_dir($directory)) {
        throw new RuntimeException('Could not create the pinned storage directory.');
    }
    return $directory;
}

function fokus_pins_filename() {
    global $conf;
    $user = $_SERVER['REMOTE_USER'] ?? '';
    if ($user === '' && $conf['useacl']) return null;
    return fokus_pins_directory() . '/' . ($user === '' ? 'shared' : 'user-' . hash('sha256', $user)) . '.json';
}

function fokus_pins_read($file) {
    if (is_link($file)) throw new RuntimeException('The pinned storage file must not be a symbolic link.');
    if (!is_file($file)) return ['ids' => []];
    $contents = @file_get_contents($file);
    $data = $contents === false ? null : json_decode($contents, true);
    if (!is_array($data) || ($data['version'] ?? null) !== 1 || !isset($data['pages']) || !is_array($data['pages']) || !array_is_list($data['pages'])) {
        throw new RuntimeException('Could not read the saved pins. Check the pinned storage file.');
    }
    foreach ($data['pages'] as $id) {
        if (!is_string($id) || $id === '' || cleanID($id) !== $id) throw new RuntimeException('The saved pins contain an invalid page ID.');
    }
    return ['ids' => array_values(array_unique($data['pages']))];
}

function fokus_pins_update($file, callable $update) {
    global $conf;
    $directory = fokus_pins_directory(true);
    $lockFile = $file . '.lock';
    if (is_link($lockFile) || is_link($file)) throw new RuntimeException('Pinned storage must not use symbolic links.');
    $lock = @fopen($lockFile, 'c');
    if (!$lock) throw new RuntimeException('Could not open pinned storage for writing.');
    $temporary = null;
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock pinned storage.');
        $previous = fokus_pins_read($file);
        $next = $update($previous);
        if ($next === $previous) return $previous;
        $temporary = @tempnam($directory, '.pins-');
        if ($temporary === false || realpath(dirname($temporary)) !== realpath($directory)) throw new RuntimeException('Could not create a temporary pin file.');
        $json = json_encode(['version' => 1, 'pages' => array_values(array_unique($next['ids']))], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
        if ($temporary === false || @file_put_contents($temporary, $json) !== strlen($json)) throw new RuntimeException('Could not save pinned files.');
        if (!@chmod($temporary, $conf['fmode'] ?? 0644) || !@rename($temporary, $file)) throw new RuntimeException('Could not replace the saved pin list.');
        $temporary = null;
        return ['ids' => array_values(array_unique($next['ids']))];
    } finally {
        if (is_string($temporary)) @unlink($temporary);
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function fokus_pins_visible($ids) {
    return array_values(array_filter($ids, static function ($id) {
        return auth_quickaclcheck($id) >= AUTH_READ && !isHiddenPage($id) && page_exists($id);
    }));
}

function fokus_pins_endpoint() {
    global $INPUT, $conf;
    $file = fokus_pins_filename();
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) throw new RuntimeException('Use GET or POST for pinned files.', 405);
    $operationLock = null;
    try {
        if ($method === 'GET') {
            $state = $file ? fokus_pins_read($file) : ['ids' => []];
        } else {
            if (!$file) throw new RuntimeException('Sign in to pin files.', 403);
            if (!checkSecurityToken($INPUT->post->str('sectok'))) throw new RuntimeException('Your session expired. Reload and try again.', 403);
            // Serialize with file renames/deletions as well as other pin writes.
            $operationLock = @fopen($conf['metadir'] . '/.fokus-sidebar-actions.lock', 'c');
            if (!$operationLock || !flock($operationLock, LOCK_EX)) throw new RuntimeException('Could not lock file actions. Try again shortly.');
            $action = $INPUT->post->str('action');
            if (!in_array($action, ['pin', 'unpin'], true)) throw new RuntimeException('Unknown pin action.', 400);
            $id = $INPUT->post->str('target');
            if ($id === '' || cleanID($id) !== $id) throw new RuntimeException('Invalid pinned page ID.', 400);
            if (!fokus_pins_visible([$id])) throw new RuntimeException('This page is unavailable or cannot be pinned with your permissions.', 403);
            $state = fokus_pins_update($file, static function ($state) use ($action, $id) {
                $next = $action === 'pin' ? array_values(array_unique([...$state['ids'], $id])) : array_values(array_diff($state['ids'], [$id]));
                return ['ids' => $next];
            });
        }
        return ['ids' => fokus_pins_visible($state['ids']), 'canWrite' => $file !== null];
    } finally {
        if (is_resource($operationLock)) { flock($operationLock, LOCK_UN); fclose($operationLock); }
    }
}

function fokus_pins_remap($changes) {
    if (!$changes) return;
    $mapping = [];
    foreach ($changes as $change) $mapping[$change['from']] = $change['to'];
    foreach (glob(fokus_pins_directory() . '/*.json') ?: [] as $file) {
        if (!preg_match('/^(?:user-[a-f0-9]{64}|shared)\.json$/D', basename($file))) continue;
        fokus_pins_update($file, static function ($state) use ($mapping) {
            $ids = [];
            foreach ($state['ids'] as $id) {
                $next = array_key_exists($id, $mapping) ? $mapping[$id] : $id;
                if ($next !== null) $ids[] = $next;
            }
            return ['ids' => array_values(array_unique($ids))];
        });
    }
}
