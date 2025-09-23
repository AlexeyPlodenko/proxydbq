<script setup>
    import Sidebar from "./Sidebar.vue";
    import {useLogStore} from "../stores.js";
    import {ref} from "vue";

    const logStore = useLogStore();

    function clearLog() {
        logStore.triggerClear();
    }
</script>

<template>
    <Sidebar :is-left="false" :is-sidebar-visible="false">
        <template v-slot:content>
            <button class="btn btn-outline-secondary text-nowrap ms-1" @click.prevent="clearLog">Clear log</button>

            <div class="mt-3 form-check">
                <input type="checkbox" class="form-check-input" id="check-query-index-usages" v-model="logStore.checkQueryIndexesUsage">
                <label class="form-check-label" for="check-query-index-usages">Check query index usage</label>
                <i class="bi bi-info-circle small ms-1 text-primary" data-bs-toggle="tooltip" data-bs-placement="top" data-bs-title="Analyze used indexes for SELECT queries. Only for new queries."></i>
            </div>
        </template>
    </Sidebar>
</template>
