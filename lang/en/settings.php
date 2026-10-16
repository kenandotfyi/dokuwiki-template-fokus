<?php
require_once dirname(__DIR__, 2) . '/settings-schema.php';
foreach (fokus_settings_schema() as $name => $field) {
    $lang[$name] = $field['label'] . (!empty($field['theme']) ? ' (' . $field['theme'] . ' theme; blank keeps default)' : '') . (!empty($field['help']) ? '. ' . $field['help'] : '');
}
