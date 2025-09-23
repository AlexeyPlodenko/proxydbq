import { createApp } from 'vue';
import App from './App.vue';
import './styles.scss';
import { Tooltip } from 'bootstrap';
import {d} from "./lib/helpers.js";
import {createPinia} from "pinia";

(function() {
    const app = createApp(App);
    app.use(createPinia());
    app.mount('#app');

    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new Tooltip(tooltipTriggerEl));
})();
