<?php
/** Emit validated appearance values; all rendering stays template-owned. */
if (!defined('DOKU_INC')) die();
require_once __DIR__ . '/settings-schema.php';
function fokus_appearance_styles() {
    $schema = fokus_settings_schema();
    $values = [];
    foreach ($schema as $key => $field) {
        $value = tpl_getConf($key, $field['default']);
        $values[$key] = fokus_settings_valid($field, $value) && $value !== '' ? $value : $field['default'];
    }
    $css = '';
    foreach (['light', 'dark'] as $theme) {
        $selector = $theme === 'dark' ? 'html[data-theme="dark"]' : 'html:not([data-theme="dark"])';
        $declarations = '';
        foreach ($schema as $key => $field) {
            if ($field['type'] === 'color' && $field['theme'] === $theme) $declarations .= $field['variable'] . ':' . $values[$key] . ';';
        }
        foreach (fokus_component_colors() as $name => $role) {
            $key = 'color_' . $theme . '_' . $role[2];
            $source = $schema[$key]['variable'];
            $customized = strcasecmp($values[$key], $schema[$key]['default']) !== 0;
            $default = $role[$theme === 'light' ? 0 : 1];
            $declarations .= '--fokus-' . $name . ':' . ($customized || $default === null ? 'var(' . $source . ')' : $default) . ';';
        }
        $declarations .= '--fokus-base:var(--fokus-accent);';
        $declarations .= $theme === 'dark'
            ? '--fokus-banner:var(--fokus-surface-soft);--fokus-banner-border:var(--fokus-border);'
            : '--fokus-banner:color-mix(in srgb,var(--fokus-accent) 16%,white);--fokus-banner-border:color-mix(in srgb,var(--fokus-accent) 18%,var(--fokus-border));';
        $css .= $selector . '{' . $declarations . '}';
    }
    $fonts = ['fira'=>"'FiraGO',sans-serif", 'system'=>'system-ui,sans-serif', 'serif'=>'Georgia,serif', 'mono'=>"'JetBrains Mono Variable',monospace", 'inherit'=>'inherit'];
    $variables = [
        'body-font'=>$fonts[$values['font_family']], 'heading-font'=>$fonts[$values['heading_font']], 'code-font'=>$fonts[$values['code_font']],
        'font-size'=>$values['font_size'] . 'px', 'sidebar-font-size'=>$values['sidebar_font_size'] . 'px', 'line-height'=>$values['line_height'],
        'radius'=>$values['border_radius'] . 'px', 'control-radius'=>$values['control_radius'] . 'px',
        'search-popup-width'=>$values['search_popup_width'] . 'px', 'search-popup-results-height'=>$values['search_popup_results_height'] . 'px',
        'page-gutter'=>$values['page_gutter'] . 'px', 'pane-gap'=>$values['pane_gap'] . 'px',
        'pane-padding'=>$values['page_padding'] . 'px', 'paragraph-gap'=>$values['paragraph_gap'] . 'em',
        'internal-decoration'=>$values['internal_decoration'], 'external-decoration'=>$values['external_decoration'],
        'missing-decoration-style'=>$values['missing_decoration_style'],
        'link-decoration-style'=>$values['link_decoration_style'], 'internal-weight'=>$values['internal_weight'], 'external-weight'=>$values['external_weight'],
        'tag-decoration'=>$values['tag_decoration'], 'tag-decoration-style'=>$values['tag_decoration_style'], 'tag-weight'=>$values['tag_weight'],
    ];
    $variables += fokus_appearance_constants();
    $css .= ':root{';
    foreach ($variables as $name => $value) $css .= '--fokus-' . $name . ':' . $value . ';';
    $css .= '}';
    $css .= fokus_interwiki_css($values['interwiki_styles']);
    $css .= 'html .dokuwiki .search_hit{color:var(--fokus-text)!important;background-color:var(--fokus-search-highlight)!important;}';
    $css .= '.fokus-last30{display:block;margin:12px 0 24px;}';
    $css .= '.fokus-last30-item{box-sizing:border-box;display:flex;align-items:center;gap:7px;min-width:0;margin:0;padding:2px 4px;font-size:.92em;}';
    $css .= '.fokus-last30-type{box-sizing:border-box;flex:0 0 auto;padding:1px 5px;border:1px solid transparent;border-radius:4px;font-family:var(--fokus-code-font);font-size:10px;line-height:1.35;font-weight:600;white-space:nowrap;}';
    $css .= '.fokus-last30-type--deleted{color:#a82d25;background:#fff0ee;border-color:#f0cbc6;}';
    $css .= '.fokus-last30-type--minor{color:#4d7d42;background:#edf6e9;border-color:#d2e5ca;}';
    $css .= '.fokus-last30-type--edited,.fokus-last30-type--created{color:#25643b;background:#e2f0e5;border-color:#c5ddca;}';
    $css .= '.fokus-last30-type--reverted{color:#76519a;background:#f1eafa;border-color:#dfd0ef;}';
    $css .= 'html[data-theme="dark"] .fokus-last30-type--deleted{color:#ffaaa1;background:#482522;border-color:#70403b;}';
    $css .= 'html[data-theme="dark"] .fokus-last30-type--minor{color:#c1e7ae;background:#293b27;border-color:#435b3d;}';
    $css .= 'html[data-theme="dark"] .fokus-last30-type--edited,html[data-theme="dark"] .fokus-last30-type--created{color:#a9dfb4;background:#243a2a;border-color:#3e5d45;}';
    $css .= 'html[data-theme="dark"] .fokus-last30-type--reverted{color:#d3b8f0;background:#382c47;border-color:#58436e;}';
    $css .= '.fokus-last30-title{flex:0 0 auto;font-weight:600;white-space:nowrap;}';
    $css .= '.fokus-last30-title a{text-decoration:none;}';
    $css .= '.fokus-last30-summary{flex:1 1 0%;min-width:0;overflow:hidden;color:var(--fokus-muted);font-size:.88em;font-style:italic;text-overflow:ellipsis;white-space:nowrap;}';
    $css .= '.fokus-last30-item time{flex:0 0 auto;margin-left:auto;color:var(--fokus-muted);font-size:.8em;white-space:nowrap;}';
    $css .= '.fokus-last30-actions{display:flex;flex:0 0 auto;align-items:center;gap:2px;}';
    $css .= '.fokus-last30-actions a{display:grid;width:20px;height:20px;place-items:center;border-radius:4px;color:var(--fokus-muted);text-decoration:none;}';
    $css .= '.fokus-last30-actions a:hover{background:var(--fokus-row-hover-background);color:var(--fokus-text);}';
    $css .= '.fokus-last30-actions svg{display:block;width:14px;height:14px;}';
    $css .= '.fokus-last30-empty{display:block;color:var(--fokus-muted);}';
    echo '<style id="fokus-appearance">' . $css . '</style>';
}

function fokus_interwiki_css($json) {
    if (!fokus_interwiki_styles_valid($json)) return '';
    $css = '';
    foreach (fokus_interwiki_effective_styles($json) as $prefix => $rules) {
        // Identical prefix-to-class conversion to DokuWiki's XHTML renderer.
        $class = preg_replace('/[^_\-a-z0-9]+/i', '_', $prefix);
        $base = '.dokuwiki a.interwiki.iw_' . $class;
        foreach (['light', 'dark'] as $theme) {
            $selector = ($theme === 'dark' ? 'html[data-theme="dark"] ' : 'html:not([data-theme="dark"]) ') . $base;
            foreach (['color'=>['color', ':not(:hover)'], 'hover'=>['color', ':hover'], 'background'=>['background-color', ':not(:hover)'], 'hover_background'=>['background-color', ':hover']] as $key => $property) {
                $value = $rules[$theme . '_' . $key] ?? '';
                if ($value !== '') $css .= $selector . $property[1] . '{' . $property[0] . ':' . $value . '!important;}';
            }
        }
        $declarations = '';
        foreach (['decoration'=>'text-decoration-line', 'decoration_style'=>'text-decoration-style', 'weight'=>'font-weight', 'font_style'=>'font-style'] as $key => $property) {
            if (($rules[$key] ?? '') !== '') $declarations .= $property . ':' . $rules[$key] . '!important;';
        }
        if (($rules['icon'] ?? '') === 'hide') $declarations .= 'background-image:none!important;padding-inline-start:0!important;';
        if ($declarations !== '') $css .= 'html ' . $base . '{' . $declarations . '}';
    }
    return $css;
}
