const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('versions', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('env', {
    isDevelopment: () => process.env.NODE_ENV === 'development',
});

contextBridge.exposeInMainWorld('electronAPI', {
    // sendMessage: (message) => ipcRenderer.send('message-from-renderer', message),
    // onReply: (callback) => ipcRenderer.on('reply-to-renderer', (event, arg) => callback(arg)),

    startProxyServers: (dbHost, dbPort, proxyHost, proxyPort) => {
        return ipcRenderer.send('startProxyServers', dbHost, dbPort, proxyHost, proxyPort);
    },
    stopProxyServers: () => ipcRenderer.send('stopProxyServers'),

    fetchFromDb: (sqlQuery, dbHost, dbPort, dbLogin, dbPassword, dbName) => {
        return ipcRenderer.send('fetchFromDb', sqlQuery, dbHost, dbPort, dbLogin, dbPassword, dbName);
    },

    onFetchFromDbResult: (callback) => ipcRenderer.once('fetchFromDbResult', (ev, value) => {
        return callback(value);
    }),

    onProxyMessage: (callback) => ipcRenderer.on('logProxyMessages', (ev, value) => {
        return callback(value);
    })
});
