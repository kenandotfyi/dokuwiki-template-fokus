<?php
/** Shared template settings schema, consumed by Configuration Manager and Fokus Settings. */
if (!defined('DOKU_INC')) die();
function fokus_settings_schema() {
    $fields = [
        'panes_enabled' => ['group'=>'Workspace', 'label'=>'Multi-pane navigation', 'type'=>'bool', 'default'=>1],
        'pane_width' => ['group'=>'Workspace', 'label'=>'Pane width (rem)', 'type'=>'number', 'default'=>45, 'min'=>25, 'max'=>100],
        'dark_mode' => ['group'=>'Workspace', 'label'=>'Allow dark mode', 'type'=>'bool', 'default'=>1],
        'sidebar_enabled' => ['group'=>'Workspace', 'label'=>'Files and Tags sidebar', 'type'=>'bool', 'default'=>1],
        'sidebar_hide_regex' => ['group'=>'Workspace', 'label'=>'Hide pages and namespaces (regex)', 'type'=>'regex', 'default'=>'', 'help'=>'Without delimiters. Example: ^(?:playground|wiki)(?::|$). Matching namespaces hide descendants; Pinned and Tags are unaffected.'],
        'adapter_preview' => ['group'=>'Integrations', 'label'=>'Preview adapter', 'type'=>'bool', 'default'=>0],
        'adapter_annotations' => ['group'=>'Integrations', 'label'=>'Annotations adapter', 'type'=>'bool', 'default'=>0],
        'adapter_katex' => ['group'=>'Integrations', 'label'=>'KaTeX adapter', 'type'=>'bool', 'default'=>0],
    ];
    $colors = [
        'text' => ['Text', '#222222', '#dfdfdf', '--fokus-text'],
        'muted' => ['Muted text', '#6b6b6b', '#a0a0a0', '--fokus-muted'],
        'canvas' => ['Workspace background', '#f4f4f4', '#171717', '--fokus-canvas'],
        'surface' => ['Page background', '#ffffff', '#262626', '--fokus-surface'],
        'accent_soft' => ['Accent backgrounds', '#d8d8d8', '#363636', '--fokus-accent-soft'],
        'on_accent' => ['Text on accent backgrounds', '#ffffff', '#171717', '--fokus-on-accent'],
        'vault_accent' => ['Wiki menu background', '#272727', '#262626', '--fokus-vault-accent'],
        'control_background' => ['Input background', '#ffffff', '#282828', '--fokus-control-background'],
        'control_text' => ['Input text', '#333333', '#e7e7e7', '--fokus-control-text'],
        'interwiki' => ['Interwiki links', '#4a4a4a', '#c1c1c1', '--fokus-interwiki-link'],
        'missing' => ['Missing page links', '#dd3300', '#ff766e', '--fokus-missing-link'],
        'surface_soft' => ['Secondary surfaces', '#ebebeb', '#2b2b2b', '--fokus-surface-soft'],
        'border' => ['Borders', '#d2d2d2', '#464646', '--fokus-border'],
        'accent' => ['Accent', '#4a4a4a', '#d0d0d0', '--fokus-accent'],
        'internal' => ['Internal links', '#4a4a4a', '#c3c3c3', '--fokus-internal-link'],
        'internal_hover' => ['Internal links on hover', '#4a4a4a', '#d0d0d0', '--fokus-internal-hover'],
        'external' => ['External links', '#b45309', '#f08a24', '--fokus-external'],
        'external_hover' => ['External links on hover', '#b45309', '#f08a24', '--fokus-external-hover'],
    ];
    foreach (['light', 'dark'] as $theme) foreach ($colors as $name => $color) {
        $fields['color_' . $theme . '_' . $name] = ['group'=>'Appearance', 'section'=>ucfirst($theme) . ' colors', 'label'=>$color[0], 'type'=>'color', 'default'=>$color[$theme === 'light' ? 1 : 2], 'placeholder'=>$color[$theme === 'light' ? 1 : 2], 'variable'=>$color[3], 'theme'=>$theme];
    }
    foreach ([
        'tag_light_color' => ['Light text', '#4a4a4a', '--fokus-tag-link', 'light'],
        'tag_light_hover' => ['Light hover text', '#4a4a4a', '--fokus-tag-hover', 'light'],
        'tag_dark_color' => ['Dark text', '#c3c3c3', '--fokus-tag-link', 'dark'],
        'tag_dark_hover' => ['Dark hover text', '#d0d0d0', '--fokus-tag-hover', 'dark'],
    ] as $name => [$label, $default, $variable, $theme]) {
        $fields[$name] = ['group'=>'Appearance', 'section'=>'Tag links', 'label'=>$label, 'type'=>'color', 'default'=>$default, 'placeholder'=>$default, 'variable'=>$variable, 'theme'=>$theme];
    }
    $fonts = ['fira'=>'FiraGO (bundled)', 'system'=>'System sans-serif', 'serif'=>'System serif', 'mono'=>'JetBrains Mono (bundled)'];
    $fields += [
        'font_family'=>['group'=>'Appearance', 'section'=>'Typography', 'label'=>'Text font', 'type'=>'choice', 'default'=>'fira', 'choices'=>$fonts],
        'code_font'=>['group'=>'Appearance', 'section'=>'Typography', 'label'=>'Code and page ID font', 'type'=>'choice', 'default'=>'mono', 'choices'=>$fonts],
        'heading_font'=>['group'=>'Appearance', 'section'=>'Typography', 'label'=>'Heading font', 'type'=>'choice', 'default'=>'inherit', 'choices'=>['inherit'=>'Same as text'] + $fonts],
        'sidebar_font_size'=>['group'=>'Appearance', 'section'=>'Typography', 'label'=>'Sidebar text size (px)', 'type'=>'number', 'default'=>13, 'min'=>12, 'max'=>20],
        'font_size'=>['group'=>'Appearance', 'section'=>'Typography', 'label'=>'Text size (px)', 'type'=>'number', 'default'=>14, 'min'=>12, 'max'=>24],
        'line_height'=>['group'=>'Appearance', 'section'=>'Typography', 'label'=>'Text line height', 'type'=>'number', 'default'=>1.4, 'min'=>1.1, 'max'=>2.4, 'step'=>0.05],
        'page_padding'=>['group'=>'Appearance', 'section'=>'Spacing and corners', 'label'=>'Pane padding (px)', 'type'=>'number', 'default'=>24, 'min'=>0, 'max'=>64],
        'page_gutter'=>['group'=>'Appearance', 'section'=>'Spacing and corners', 'label'=>'Workspace side padding (px)', 'type'=>'number', 'default'=>20, 'min'=>0, 'max'=>64],
        'pane_gap'=>['group'=>'Appearance', 'section'=>'Spacing and corners', 'label'=>'Gap between panes (px)', 'type'=>'number', 'default'=>4, 'min'=>0, 'max'=>32],
        'paragraph_gap'=>['group'=>'Appearance', 'section'=>'Spacing and corners', 'label'=>'Paragraph spacing (em)', 'type'=>'number', 'default'=>1.4, 'min'=>0, 'max'=>3, 'step'=>0.1],
        'border_radius'=>['group'=>'Appearance', 'section'=>'Spacing and corners', 'label'=>'Page and dialog corners (px)', 'type'=>'number', 'default'=>4, 'min'=>0, 'max'=>24],
        'control_radius'=>['group'=>'Appearance', 'section'=>'Spacing and corners', 'label'=>'Button and file row corners (px)', 'type'=>'number', 'default'=>4, 'min'=>0, 'max'=>16],
        'search_popup_width'=>['group'=>'Appearance', 'section'=>'Search popup', 'label'=>'Popup width (px)', 'type'=>'number', 'default'=>720, 'min'=>480, 'max'=>1200],
        'search_popup_results_height'=>['group'=>'Appearance', 'section'=>'Search popup', 'label'=>'Results area height (px)', 'type'=>'number', 'default'=>480, 'min'=>200, 'max'=>900],
        'internal_decoration'=>['group'=>'Appearance', 'section'=>'Link styling', 'label'=>'Internal link decoration', 'type'=>'choice', 'default'=>'underline', 'choices'=>['none'=>'None', 'underline'=>'Underline', 'overline'=>'Overline', 'line-through'=>'Strikethrough']],
        'tag_decoration'=>['group'=>'Appearance', 'section'=>'Tag links', 'label'=>'Decoration', 'type'=>'choice', 'default'=>'underline', 'choices'=>['none'=>'None', 'underline'=>'Underline', 'overline'=>'Overline', 'line-through'=>'Strikethrough']],
        'tag_decoration_style'=>['group'=>'Appearance', 'section'=>'Tag links', 'label'=>'Decoration style', 'type'=>'choice', 'default'=>'solid', 'choices'=>['solid'=>'Solid', 'dotted'=>'Dotted', 'dashed'=>'Dashed', 'wavy'=>'Wavy']],
        'tag_weight'=>['group'=>'Appearance', 'section'=>'Tag links', 'label'=>'Font weight', 'type'=>'choice', 'default'=>'500', 'choices'=>['400'=>'Regular', '500'=>'Medium', '600'=>'Semibold', '700'=>'Bold']],
        'missing_decoration_style'=>['group'=>'Appearance', 'section'=>'Missing page links', 'label'=>'Underline style', 'type'=>'choice', 'default'=>'dotted', 'choices'=>['solid'=>'Solid', 'dotted'=>'Dotted', 'dashed'=>'Dashed', 'wavy'=>'Wavy']],
        'external_decoration'=>['group'=>'Appearance', 'section'=>'Link styling', 'label'=>'External link decoration', 'type'=>'choice', 'default'=>'underline', 'choices'=>['none'=>'None', 'underline'=>'Underline', 'overline'=>'Overline', 'line-through'=>'Strikethrough']],
        'link_decoration_style'=>['group'=>'Appearance', 'section'=>'Link styling', 'label'=>'Link decoration style', 'type'=>'choice', 'default'=>'solid', 'choices'=>['solid'=>'Solid', 'dotted'=>'Dotted', 'dashed'=>'Dashed', 'wavy'=>'Wavy']],
        'internal_weight'=>['group'=>'Appearance', 'section'=>'Link styling', 'label'=>'Internal link weight', 'type'=>'choice', 'default'=>'500', 'choices'=>['400'=>'Regular', '500'=>'Medium', '600'=>'Semibold', '700'=>'Bold']],
        'external_weight'=>['group'=>'Appearance', 'section'=>'Link styling', 'label'=>'External link weight', 'type'=>'choice', 'default'=>'400', 'choices'=>['400'=>'Regular', '500'=>'Medium', '600'=>'Semibold', '700'=>'Bold']],
    ];
    $fields['interwiki_styles'] = ['group'=>'Appearance', 'section'=>'Interwiki links', 'label'=>'Interwiki appearance rules (JSON)', 'type'=>'interwiki', 'default'=>json_encode(fokus_interwiki_defaults())];
    return $fields;
}
function fokus_settings_valid($field, $value) {
    if (!is_scalar($value)) return false;
    $value = (string)$value;
    switch ($field['type']) {
        case 'interwiki': return fokus_interwiki_styles_valid($value);
        case 'bool': return $value === '0' || $value === '1';
        case 'color': return $value === '' || preg_match('/^#[a-fA-F0-9]{6}$/D', $value) === 1;
        case 'number': return is_numeric($value) && is_finite((float)$value) && (float)$value >= $field['min'] && (float)$value <= $field['max'] && (isset($field['step']) || floor((float)$value) == (float)$value);
        case 'choice': return array_key_exists($value, $field['choices']);
        case 'regex': @preg_match('/' . $value . '/ui', 'test'); return preg_last_error() === PREG_NO_ERROR;
    }
    return false;
}

/** No definition lookup here: this schema is also loaded during core startup. */
function fokus_interwiki_style_fields() {
    $fields = [];
    foreach (['light'=>'Light', 'dark'=>'Dark'] as $theme => $label) {
        foreach (['color'=>'text', 'hover'=>'hover text', 'background'=>'background', 'hover_background'=>'hover background'] as $name => $description) {
            $fields[$theme . '_' . $name] = ['label'=>$label . ' ' . $description, 'section'=>'Interwiki links', 'type'=>'color', 'default'=>'', 'placeholder'=>$name === 'background' || $name === 'hover_background' ? ($theme === 'light' ? '#ffffff' : '#262626') : ($theme === 'light' ? '#4a4a4a' : '#c3c3c3')];
        }
    }
    $fields += [
        'decoration'=>['label'=>'Decoration', 'type'=>'choice', 'default'=>'', 'choices'=>[''=>'Use existing style', 'none'=>'None', 'underline'=>'Underline', 'overline'=>'Overline', 'line-through'=>'Strikethrough']],
        'decoration_style'=>['label'=>'Decoration style', 'type'=>'choice', 'default'=>'', 'choices'=>[''=>'Use existing style', 'solid'=>'Solid', 'dotted'=>'Dotted', 'dashed'=>'Dashed', 'wavy'=>'Wavy']],
        'weight'=>['label'=>'Font weight', 'type'=>'choice', 'default'=>'', 'choices'=>[''=>'Use existing style', '400'=>'Regular', '500'=>'Medium', '600'=>'Semibold', '700'=>'Bold']],
        'font_style'=>['label'=>'Font style', 'type'=>'choice', 'default'=>'', 'choices'=>[''=>'Use existing style', 'normal'=>'Normal', 'italic'=>'Italic']],
        'icon'=>['label'=>'Favicon', 'type'=>'choice', 'default'=>'', 'choices'=>[''=>'Use DokuWiki favicon', 'hide'=>'Hide favicon']],
    ];
    return $fields;
}
function fokus_interwiki_styles_valid($value) {
    if (!is_string($value) || strlen($value) > 65536) return false;
    $styles = json_decode($value, true);
    if (!is_array($styles)) return false;
    $fields = fokus_interwiki_style_fields();
    foreach ($styles as $prefix => $rules) {
        if (!is_string($prefix) || !preg_match('/^[a-z0-9_.:-]{1,100}$/iD', $prefix) || !is_array($rules)) return false;
        foreach ($rules as $name => $rule) {
            if (!isset($fields[$name]) || !is_string($rule) || !fokus_settings_valid($fields[$name], $rule)) return false;
        }
    }
    return true;
}

/** Prefix defaults own the original Zotero palette, for both rendering and UI. */
function fokus_interwiki_defaults() {
    return ['zotero'=>[
        'light_color'=>'#DB2C3A',
        'light_hover'=>'#A51E2B',
        'light_hover_background'=>'#FCE4E6',
        'dark_color'=>'#DB2C3A',
        'dark_hover'=>'#F4A0A8',
        'dark_hover_background'=>'#4A292C',
    ]];
}
function fokus_interwiki_effective_styles($json) {
    $styles = fokus_interwiki_defaults();
    if (!fokus_interwiki_styles_valid($json)) return $styles;
    foreach (json_decode($json, true) as $prefix => $rules) {
        foreach ($rules as $name => $value) {
            if ($value !== '') $styles[$prefix][$name] = $value;
        }
    }
    return $styles;
}

/** Component defaults retain the original shades until their source is customized. */
function fokus_component_colors() {
    return [
        'inverse-hover-text'=>[null, '#ffffff', 'text'],
        'active-border'=>[null, '#585858', 'border'],
        'active-line-background'=>[null, '#323232', 'control_background'],
        'admin-panel-background'=>[null, '#2c2c2c', 'surface'],
        'background-tone-df'=>[null, '#dfdfdf', 'surface_soft'],
        'border-tone-41'=>[null, '#414141', 'border'],
        'border-tone-d5'=>['#d5d5d5', null, 'border'],
        'control-border'=>['#cccccc', null, 'border'],
        'control-hover-background'=>[null, '#393939', 'accent_soft'],
        'control-soft-background'=>['#eeeeee', null, 'surface_soft'],
        'cursor-color'=>[null, '#f1f1f1', 'text'],
        'diff-added-background'=>['#f0f0f0', '#3e3e3e', 'surface_soft'],
        'diff-added-text'=>[null, '#eeeeee', 'text'],
        'diff-context-background'=>[null, '#373737', 'surface_soft'],
        'diff-removed-background'=>['#e4e4e4', '#333333', 'surface_soft'],
        'diff-removed-text'=>[null, '#e6e6e6', 'text'],
        'disabled-text'=>['#999999', null, 'muted'],
        'editor-background'=>[null, '#212121', 'surface'],
        'editor-gutter'=>[null, '#2d2d2d', 'control_background'],
        'editor-muted'=>[null, '#9e9e9e', 'muted'],
        'feedback-text'=>[null, '#b9b9b9', 'muted'],
        'focus-border'=>['#999999', '#767676', 'border'],
        'inset-border'=>['#eeeeee', null, 'border'],
        'media-separator'=>['#888888', null, 'border'],
        'muted-copy'=>['#666666', null, 'muted'],
        'notice-border'=>[null, '#636363', 'border'],
        'notice-text'=>[null, '#e1e1e1', 'text'],
        'open-link-background'=>[null, '#606060', 'accent_soft'],
        'positive-text'=>[null, '#dbdbdb', 'text'],
        'pressed-background'=>['#dddddd', null, 'accent_soft'],
        'pressed-border-background'=>['#bbbbbb', null, 'border'],
        'row-hover-background'=>['#d7d7d7', null, 'accent_soft'],
        'secondary-link'=>[null, '#b8b8b8', 'internal'],
        'secondary-text'=>['#333333', '#cecece', 'text'],
        'selected-background'=>['#cccccc', null, 'accent_soft'],
        'selection-background'=>[null, '#4d4d4d', 'accent_soft'],
        'separator-border'=>[null, '#5f5f5f', 'border'],
        'site-background'=>[null, '#1a1a1a', 'canvas'],
        'stage-active-border'=>[null, '#c3c3c3', 'border'],
        'stage-text'=>[null, '#cbcbcb', 'text'],
        'strong-border'=>[null, '#656565', 'border'],
        'strong-control-background'=>[null, '#5f5f5f', 'accent_soft'],
        'strong-hover-background'=>[null, '#414141', 'accent_soft'],
        'strong-text'=>[null, '#f4f4f4', 'text'],
        'subtle-text'=>[null, '#d9d9d9', 'text'],
        'support-text'=>['#363636', null, 'text'],
        'surface-border'=>[null, '#4f4f4f', 'border'],
        'syntax-comment'=>[null, '#a9a9a9', 'muted'],
        'syntax-heading'=>[null, '#c0c0c0', 'text'],
        'syntax-heading-primary'=>[null, '#b0b0b0', 'text'],
        'syntax-keyword'=>[null, '#b7b7b7', 'text'],
        'syntax-string'=>[null, '#b4b4b4', 'text'],
        'syntax-symbol'=>[null, '#b5b5b5', 'text'],
        'syntax-value'=>[null, '#c8c8c8', 'text'],
        'text-tone-1a'=>[null, '#1a1a1a', 'text'],
        'text-tone-b6'=>[null, '#b6b6b6', 'text'],
        'text-tone-ba'=>[null, '#bababa', 'text'],
        'toolbar-text'=>[null, '#f1f1f1', 'text'],
    ];
}

function fokus_appearance_constants() {
    return [
        'dialog-backdrop'=>'rgb(0 0 0 / 35%)',
        'pane-backdrop'=>'rgb(0 0 0 / 55%)',
        'sidebar-backdrop'=>'rgb(0 0 0 / 25%)',
        'menu-shadow'=>'rgb(0 0 0 / 14%)',
    ];
}
