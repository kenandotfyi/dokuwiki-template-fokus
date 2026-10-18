<?php
/** Structured wiki search owned by the template; core handles indexing and ACLs. */
if (!defined('DOKU_INC')) die();

function fokus_search_wiki($query, $offset = 0, $limit = 20, $matchMode = 'words')
{
    $query = trim((string)$query);
    if (strlen($query) > 512) throw new InvalidArgumentException('Search is limited to 512 bytes.');
    if (!in_array($matchMode, ['words', 'phrase'], true)) throw new InvalidArgumentException('Invalid search mode.');
    $limit = max(1, min(50, (int)$limit));
    $offset = max(0, min(1000, (int)$offset));
    if ($query === '') return ['results' => [], 'total' => 0, 'hasMore' => false];
    $highlight = [];
    if (class_exists('dokuwiki\\Search\\MetadataSearch')) {
        $titles = (new \dokuwiki\Search\MetadataSearch())->pageLookup($query, true, true);
        $search = new \dokuwiki\Search\FulltextSearch();
        $fulltext = $search->pageSearch(fokus_search_wiki_query($query, $matchMode), $highlight);
    } else {
        require_once DOKU_INC . 'inc/fulltext.php';
        $titles = ft_pageLookup($query, true, true);
        $fulltext = ft_pageSearch(fokus_search_wiki_query($query, $matchMode), $highlight);
        $search = null;
    }
    $ids = array_unique(array_merge(array_keys($titles), array_keys($fulltext)));
    // Explicitly guard all metadata, snippets, totals and URLs even if a core
    // search hook supplies extra candidates. Never reveal hidden page IDs.
    $ids = array_values(array_filter($ids, static function ($id) {
        return !isHiddenPage($id) && auth_quickaclcheck($id) >= AUTH_READ && page_exists($id);
    }));
    $total = count($ids);
    $rows = [];
    foreach (array_slice($ids, $offset, $limit) as $id) {
        $snippet = $highlight ? ($search ? $search->snippet($id, $highlight) : ft_snippet($id, $highlight)) : '';
        $snippet = html_entity_decode(strip_tags((string)$snippet), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        // Core snippets contain wiki source. Keep the excerpt readable without
        // rendering plugins or making API-provided text executable markup.
        $snippet = preg_replace('~\[\[(?:[^\]|]+\|)?([^\]]+)\]\]~u', '$1', $snippet);
        $snippet = preg_replace('@\{\{[^}]*\}\}|<\/?[a-zA-Z][^>]*>|~~[^~]+~~@u', '', $snippet);
        $snippet = str_replace(['**', '__'], '', $snippet);
        $rows[] = [
            'provider' => 'wiki', 'kind' => 'wiki', 'key' => $id,
            'title' => trim((string)p_get_first_heading($id)) ?: str_replace('_', ' ', noNS($id)),
            'path' => $id, 'text' => trim(preg_replace('/\s+/u', ' ', $snippet)),
            'openUrl' => wl($id, '', true, '&'),
        ];
    }
    return ['results' => $rows, 'total' => $total, 'hasMore' => $offset + $limit < $total];
}

/** Quote the complete query for DokuWiki's native exact-phrase parser. */
function fokus_search_wiki_query($query, $matchMode)
{
    if ($matchMode !== 'phrase') return $query;
    // DokuWiki has no escaped-quote syntax; dropping embedded quotes ensures
    // the generated phrase remains a single, well-formed query term.
    $phrase = trim(str_replace('"', ' ', (string)$query));
    return $phrase === '' ? '' : '"' . $phrase . '"';
}
