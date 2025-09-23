<script setup>
    import {d} from "../lib/helpers.js";
    import {ref} from "vue";

    const currentTheme = ref(getPreferredTheme());

    function toggleMode() {
        let theme = getPreferredTheme();
        switch (theme) {
            case 'dark':
                theme = 'light';
                break;

            default:
            case 'light':
                theme = 'dark';
                break;
        }

        setTheme(theme);
    }

    /*!
     * Color mode toggler for Bootstrap's docs (https://getbootstrap.com/)
     * Copyright 2011-2025 The Bootstrap Authors
     * Licensed under the Creative Commons Attribution 3.0 Unported License.
     */
    /**
     * @returns {string}
     */
    function getStoredTheme() {
        return localStorage.getItem('theme');
    }

    /**
     * @param {strings} theme
     */
    function saveStoredTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    /**
     * @returns {string}
     */
    function getPreferredTheme() {
        const storedTheme = getStoredTheme();
        if (storedTheme) {
            return storedTheme;
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * @param {string} theme
     */
    function setTheme(theme) {
        if (theme === 'auto') {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        currentTheme.value = theme;
        document.documentElement.setAttribute('data-bs-theme', theme);
        saveStoredTheme(theme);
    }

    setTheme(getPreferredTheme());
</script>

<template>
    <button class="btn btn-link nav-link px-0 py-2 d-flex align-items-center ms-3" type="button" aria-expanded="false" @click="toggleMode">
        <i class="bi bi-circle-half"></i>
        <span class="ms-2">{{ currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode' }}</span>
    </button>
</template>

