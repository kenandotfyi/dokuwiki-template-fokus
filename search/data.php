<?php
if (!defined('DOKU_INC')) die();
require_once __DIR__ . '/provider.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
http_response_code(200);
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
try {
    echo json_encode(fokus_search_wiki($INPUT->get->str('q'), $INPUT->get->int('offset'), $INPUT->get->int('limit', 20), $INPUT->get->str('match', 'words')), JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['error' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['error' => 'Wiki search is unavailable. Try the full search page.']);
}
exit;
