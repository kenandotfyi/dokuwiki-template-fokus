<?php
/** Sidebar adapters for core deletion and the installed Move plugin. */
if (!defined('DOKU_INC')) die();

function fokus_action_pages($id, $namespace) {
    global $conf;
    if ($id === '' || $id !== cleanID($id)) throw new RuntimeException('Invalid page or namespace.', 400);
    if (auth_quickaclcheck($namespace ? $id . ':*' : $id) < AUTH_READ) {
        throw new RuntimeException('You do not have permission to manage this page or namespace.', 403);
    }
    if ($namespace) {
        require_once DOKU_INC . 'inc/search.php';
        $pages = [];
        search($pages, $conf['datadir'], 'search_allpages', ['skipacl' => true], utf8_encodeFN(str_replace(':', '/', $id)));
        $ids = array_column($pages, 'id');
    } else {
        $ids = page_exists($id) ? [$id] : [];
    }
    if (!$ids) throw new RuntimeException('This page or namespace no longer exists.', 404);
    sort($ids, SORT_STRING);
    // Include every descendant, including hidden pages; never silently act on
    // just the subset visible in the explorer or skip unreadable descendants.
    foreach ($ids as $page) {
        if (auth_quickaclcheck($page) < AUTH_READ) throw new RuntimeException('You cannot manage all pages in this namespace.', 403);
    }
    return $ids;
}

function fokus_action_fingerprint($ids) {
    $versions = [];
    foreach ($ids as $id) $versions[] = [$id, @filemtime(wikiFN($id)), @hash_file('sha256', wikiFN($id))];
    return hash('sha256', json_encode($versions));
}

function fokus_action_locked($id) {
    checklock($id); // Expired core locks are cleared here.
    return file_exists(wikiLockFN($id));
}

function fokus_action_permissions($ids) {
    $rename = plugin_load('action', 'move_rename');
    $canRename = (bool) $rename;
    $canDelete = actionOK('edit') && actionOK('save');
    foreach ($ids as $id) {
        $canRename = $canRename && $rename->renameOkay($id);
        $canDelete = $canDelete && auth_quickaclcheck($id) >= AUTH_DELETE && !fokus_action_locked($id);
    }
    return ['rename' => $canRename, 'delete' => $canDelete];
}

$changes = [];
$operationLock = null;
$lockedPages = [];
try {
    $mutating = $kind === 'action';
    if ($mutating) {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') throw new RuntimeException('Use POST for file actions.', 405);
        if (!checkSecurityToken()) throw new RuntimeException('Your session expired. Reload and try again.', 403);
        $operationLock = @fopen($conf['metadir'] . '/.fokus-sidebar-actions.lock', 'c');
        if (!$operationLock || !flock($operationLock, LOCK_EX | LOCK_NB)) throw new RuntimeException('Another file action is running. Try again shortly.', 409);
    }
    $input = $mutating ? $INPUT->post : $INPUT->get;
    $id = $input->str('target');
    $scope = $input->str('scope');
    if (!in_array($scope, ['page', 'namespace'], true)) throw new RuntimeException('Invalid target type.', 400);
    $namespace = $scope === 'namespace';
    $ids = fokus_action_pages($id, $namespace);
    $fingerprint = fokus_action_fingerprint($ids);
    $permissions = fokus_action_permissions($ids);
    if (!$mutating) {
        $result = ['id' => $id, 'count' => count($ids), 'fingerprint' => $fingerprint, 'allowed' => $permissions];
    } else {
        $action = $input->str('action');
        if (!in_array($action, ['rename', 'delete'], true)) throw new RuntimeException('Unknown file action.', 400);
        if (!$permissions[$action]) throw new RuntimeException('This action is unavailable. Check your permissions and close any editors for these pages.', 403);
        if (!hash_equals($fingerprint, $input->str('fingerprint'))) throw new RuntimeException('The pages changed. Close this dialog and try again.', 409);
        if ($action === 'rename') {
            $dst = cleanID($input->str('name'));
            if (!$dst || $dst === $id || ($namespace && str_starts_with($dst, $id . ':'))) {
                throw new RuntimeException('Choose a different name outside the source namespace.', 400);
            }
            if (auth_quickaclcheck($namespace ? $dst . ':*' : $dst) < AUTH_CREATE) {
                throw new RuntimeException('You do not have permission to create pages at that destination.', 403);
            }
            if ($namespace && is_dir(dirname(wikiFN($dst . ':__fokus_probe')))) {
                throw new RuntimeException('That namespace already exists. Choose another name.', 409);
            }
            $operator = plugin_load('helper', 'move_op');
            $plan = plugin_load('helper', 'move_plan');
            if (!$operator || !$plan || $plan->isCommited()) throw new RuntimeException('The Move plugin is unavailable or another move is in progress.', 409);
            $mapping = [];
            foreach ($ids as $src) {
                $to = $namespace ? $dst . substr($src, strlen($id)) : $dst;
                if (!$operator->checkPage($src, $to)) throw new RuntimeException('The destination exists, is locked, or cannot be created with your permissions.', 409);
                $mapping[] = ['from' => $src, 'to' => $to, 'url' => wl($to, '', true, '&')];
            }
            $plan->setOption('autorewrite', true);
            $plan->setOption('autoskip', false);
            if ($namespace) $plan->addPageNamespaceMove($id, $dst);
            else $plan->addPageMove($id, $dst);
            if (!$plan->commit()) throw new RuntimeException('Could not prepare the rename.', 409);
            try {
                do {
                    $remaining = $plan->nextStep();
                    if ($remaining === false) throw new RuntimeException('The Move plugin could not finish. Check its move manager before retrying.', 409);
                } while ($remaining > 0);
            } finally {
                foreach ($mapping as $move) {
                    if (!page_exists($move['from']) && page_exists($move['to'])) $changes[] = $move;
                }
            }
        } else {
            foreach ($ids as $page) {
                lock($page);
                $lockedPages[] = $page;
            }
            if (!hash_equals($fingerprint, fokus_action_fingerprint($ids))) throw new RuntimeException('The pages changed. Close this dialog and try again.', 409);
            foreach ($ids as $page) {
                // Core saving preserves history, logs changes, and runs plugin hooks.
                saveWikiText($page, '', 'Deleted from Fokus sidebar');
                clearstatcache(true, wikiFN($page));
                if (page_exists($page)) throw new RuntimeException('DokuWiki could not delete every page. The file list has been refreshed.', 409);
                $changes[] = ['from' => $page, 'to' => null];
            }
        }
        $result = ['changes' => $changes, 'namespace' => $namespace ? ['from' => $id, 'to' => $action === 'rename' ? $dst : null] : null];
    }
} catch (Throwable $error) {
    $code = (int) $error->getCode();
    $publicError = in_array($code, [400, 403, 404, 405, 409], true);
    http_response_code($publicError ? $code : 500);
    $result = ['error' => $publicError ? $error->getMessage() : 'The file action failed. Reload and try again.', 'changes' => $changes];
} finally {
    foreach ($lockedPages as $page) unlock($page);
    if ($changes) {
        require_once __DIR__ . '/pins.php';
        try {
            fokus_pins_remap($changes);
        } catch (Throwable $error) {
            http_response_code(500);
            $result['error'] = 'The files changed, but their saved pins could not be updated. Check pinned storage permissions.';
        }
    }
    if (is_resource($operationLock)) { flock($operationLock, LOCK_UN); fclose($operationLock); }
}
echo json_encode($result, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE);
exit;
