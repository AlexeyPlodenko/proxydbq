<script setup>
    import {d} from "../lib/helpers.js";
    import {ref} from "vue";

    const isLeft = defineModel('isLeft', { type: Boolean, default: true });
    const isSidebarVisible = defineModel('isSidebarVisible', { type: Boolean, default: true });

    function toggleSidebar() {
        isSidebarVisible.value = !isSidebarVisible.value;
    }
</script>

<template>
    <div class="sidebar-container" :class="{ 'sidebar-hidden': !isSidebarVisible, 'sidebar-container-left': isLeft, 'sidebar-container-right': !isLeft }">
        <div class="sidebar h-100 d-flex flex-column flex-shrink-0 p-3">
            <slot name="content"></slot>
        </div>
        <button class="sidebar-toggle-btn" @click="toggleSidebar">
            <i class="bi" :class="isLeft ? (isSidebarVisible ? 'bi-chevron-left' : 'bi-chevron-right') : (isSidebarVisible ? 'bi-chevron-right' : 'bi-chevron-left')"></i>
        </button>
    </div>
</template>

<style scoped>
    .sidebar-container {
        position: relative;
        transition: all 0.3s ease;
    }

    .sidebar {
        width: 280px;
        transition: all 0.3s ease;
    }

    .sidebar-toggle-btn {
        position: absolute;
        top: 16px;
        z-index: 100;
        width: 30px;
        height: 30px;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        opacity: .8;
        color: #000;
        font-weight: bold;
    }

    .sidebar-toggle-btn:hover {
        opacity: 1;
    }

    .sidebar-container-left.sidebar-hidden .sidebar {
        margin-left: -280px;
    }

    .sidebar-container-left .sidebar-hidden .sidebar-toggle-btn {
        margin-right: -0px;
    }

    .sidebar-container-left .sidebar-toggle-btn {
        right: -30px;
        transition: right 0.3s ease, opacity 0.3s ease;
        border-radius: 0 4px 4px 0;
    }

    .sidebar-container-right.sidebar-hidden .sidebar {
        margin-right: -280px;
    }

    .sidebar-container-right .sidebar-hidden .sidebar-toggle-btn {
        margin-left: -0px;
    }

    .sidebar-container-right .sidebar-toggle-btn {
        left: -30px;
        transition: left 0.3s ease, opacity 0.3s ease;
        border-radius: 4px 0 0 4px;
    }
</style>
