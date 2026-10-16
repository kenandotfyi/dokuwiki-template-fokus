<?php
require_once dirname(__DIR__) . '/settings-schema.php';
foreach (fokus_settings_schema() as $name => $field) {
    switch ($field['type']) {
        case 'bool': $meta[$name] = ['onoff']; break;
        case 'number':
            // Core numeric settings accept integer expressions only. Use bounded
            // decimal patterns for fractional spacing and line-height values.
            if ($name === 'line_height') $meta[$name] = ['string', '_pattern'=>'/^(?:1\.[1-9][0-9]*|2(?:\.[0-3][0-9]*|\.40*)?)$/D'];
            elseif ($name === 'paragraph_gap') $meta[$name] = ['string', '_pattern'=>'/^(?:[0-2](?:\.[0-9]+)?|3(?:\.0+)?)$/D'];
            else $meta[$name] = ['numeric', '_min'=>$field['min'], '_max'=>$field['max']];
            break;
        case 'choice': $meta[$name] = ['multichoice', '_choices'=>array_keys($field['choices'])]; break;
        case 'interwiki': $meta[$name] = ['string']; break;
        case 'regex': $meta[$name] = ['regex']; break;
        default: $meta[$name] = ['string', '_pattern'=>'/^(?:#[a-fA-F0-9]{6})?$/D'];
    }
}
