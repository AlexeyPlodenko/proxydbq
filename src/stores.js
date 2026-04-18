import { defineStore } from 'pinia';
import {ref} from "vue";

export const useLogStore = defineStore('logStore', () => {
    const clearSignal = ref(0);
    const checkQueryIndexesUsage = ref(false);
    const systemMessage = ref(null);

    function triggerClear() {
        clearSignal.value++
    }

    function logSystemMessage(text) {
        systemMessage.value = {
            text,
            timestamp: Date.now()
        };
    }

    return {
        clearSignal,
        triggerClear,
        checkQueryIndexesUsage,
        systemMessage,
        logSystemMessage,
    };
});

export const useConnectionsStore = defineStore('connectionsStore', () => {
    const mysqlServerIp = ref('127.0.0.1');
    const mysqlServerPort = ref('3306');
    const mysqlProxyLocalhost = ref(true);
    const mysqlProxyPort = ref('3307');
    const mysqlServerLogin = ref('');
    const mysqlServerPassword = ref('');
    const mysqlServerDatabase = ref('');

    return {
        mysqlServerIp,
        mysqlServerPort,
        mysqlProxyLocalhost,
        mysqlProxyPort,
        mysqlServerLogin,
        mysqlServerPassword,
        mysqlServerDatabase,
    };
});
