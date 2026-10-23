<?php if (!defined('DOKU_INC')) die(); ?>
<dialog id="fokus-search-dialog" aria-label="Search your knowledge">
    <form class="fokus-search-form" role="search">
        <img src="<?php echo tpl_basedir(); ?>sidebar/icons/magnifying-glass-duotone.svg" alt="" class="fokus-search-loupe">
        <label class="a11y" for="fokus-search-input">Search wiki pages, documents, and annotations</label>
        <input id="fokus-search-input" type="search" autocomplete="off" maxlength="512" placeholder="Search pages, documents, annotations…" role="combobox" aria-autocomplete="list" aria-controls="fokus-search-results" aria-expanded="false">
        <div class="fokus-search-match-mode" role="group" aria-label="Search matching mode">
            <button type="button" data-search-mode="words" aria-pressed="true">All words</button>
            <button type="button" data-search-mode="phrase" aria-pressed="false">Exact phrase</button>
        </div>
    </form>
    <div class="fokus-search-filters" role="group" aria-label="Search sources">
        <button type="button" data-search-filter="all" aria-pressed="true">All <span></span></button>
        <button type="button" data-search-filter="wiki" aria-pressed="false">Wiki <span></span></button>
        <?php if ($zoteroSearchAvailable) : ?>
        <button type="button" data-search-filter="document" aria-pressed="false">Documents <span></span></button>
        <button type="button" data-search-filter="annotation" aria-pressed="false">Annotations <span></span></button>
        <?php endif; ?>
        <?php if ($wikipediaSearchAvailable) : ?>
        <button type="button" data-search-filter="wikipedia" aria-pressed="false">Wikipedia <span></span></button>
        <?php endif; ?>
        <button type="button" class="fokus-search-preview-toggle" aria-pressed="false">Details</button>
        <span class="fokus-search-status" role="status"></span>
    </div>
    <div class="fokus-search-workspace">
        <div id="fokus-search-results" role="listbox" aria-label="Search results"></div>
        <aside class="fokus-search-preview" aria-label="Selected result details">
            <div class="fokus-search-actions" aria-label="Actions for selected result"></div>
        </aside>
    </div>
    <div class="fokus-search-footer"><span class="fokus-search-feedback" role="status"></span><a class="fokus-search-fulltext" href="<?php echo hsc(wl('', ['do'=>'search'], true, '&')); ?>">Full wiki search ↗</a></div>
</dialog>
