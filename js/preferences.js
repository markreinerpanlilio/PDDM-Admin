
(function () {
    const size = localStorage.getItem("ppdm_text_size") || "medium";
    const theme = localStorage.getItem("ppdm_theme") || "light";

    const scales = {
        small: 0.9,
        medium: 1,
        large: 1.15
    };

    document.documentElement.dataset.ppdmTheme = theme;

    document.documentElement.style.setProperty(
        "--ppdm-font-scale",
        scales[size] || 1
    );
})();
