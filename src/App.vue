<template>
    <div class="app-container">
        <LeftSidebar></LeftSidebar>
        <Log></Log>
        <RightSidebar></RightSidebar>
    </div>
</template>

<script setup>
    import Log from "./components/Log.vue";
    import LeftSidebar from "./components/LeftSidebar.vue";
    import RightSidebar from "./components/RightSidebar.vue";
</script>

<style>
    .app-container {
        display: flex;
        width: 100%;
        height: 100vh;
        overflow: hidden;
    }
</style>
