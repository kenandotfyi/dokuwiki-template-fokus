<?php
require_once dirname(__DIR__) . '/settings-schema.php';
foreach (fokus_settings_schema() as $name => $field) $conf[$name] = $field['default'];
