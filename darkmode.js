(function () {
    const storageKey = 'fokus-theme';

    function preferredTheme() {
        try {
            const savedTheme = localStorage.getItem(storageKey);
            if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
        } catch (error) {
            // Storage can be unavailable in restricted browser contexts.
        }

        return 'light';
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        document.querySelectorAll('.fokus-theme-toggle').forEach(function (button) {
            const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
            button.setAttribute('aria-label', label);
            button.title = label;
            button.setAttribute('aria-pressed', String(theme === 'dark'));
            const lightIcon = button.querySelector('.fokus-theme-icon-light');
            const darkIcon = button.querySelector('.fokus-theme-icon-dark');
            if (lightIcon) lightIcon.hidden = theme === 'dark';
            if (darkIcon) darkIcon.hidden = theme !== 'dark';
        });
    }

    applyTheme(preferredTheme());
    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    });

    document.addEventListener('click', function (event) {
        const button = event.target.closest('.fokus-theme-toggle');
        if (!button) return;

        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        try {
            localStorage.setItem(storageKey, nextTheme);
        } catch (error) {
            // The selected theme remains active for this page even without storage.
        }
    });
})();
