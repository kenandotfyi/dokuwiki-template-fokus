<?php
if (!defined('DOKU_INC')) die();
require_once DOKU_INC . 'inc/search.php';
require_once __DIR__ . '/summary.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
try {
    http_response_code(200);
    echo json_encode(fokus_statusbar_summary(), JSON_HEX_TAG | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Wiki status is temporarily unavailable.']);
}
exit;
