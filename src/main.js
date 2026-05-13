import {app, BrowserWindow, ipcMain} from 'electron';
import electronSquirrelStartup from 'electron-squirrel-startup';
import { shell } from 'electron';
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {
    createMySQLProxyServer,
    setLogCallback,
    setErrorCallback,
    shutdownProxyServers, sendSqlQuery$, fetchTableSchemas$
} from "./lib/mysql/mysqlProxyServer.js";
import {d} from "./lib/helpers.js";
import xxHashAddon from 'xxhash-addon';
import path from 'path';
import 'source-map-support/register';

// Get the directory path in ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (electronSquirrelStartup) {
    app.quit();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const createWindow = async () => {
    const isPackaged = app.isPackaged;
    const preloadPath = isPackaged
        ? path.join(__dirname, '..', 'renderer', 'main_window', 'preload.js')
        : MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY;

    console.log('Preload path:', preloadPath);
    console.log('isPackaged:', isPackaged);

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: preloadPath,
        }
    });
    mainWindow.setBackgroundColor('#212529');

    // Intercept new window requests (e.g., from target="_blank" links)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http:') || url.startsWith('https:')) {
            shell.openExternal(url);
            return { action: 'deny' }; // Prevent the Electron app from opening the URL
        }
        return { action: 'allow' }; // Allow other types of new windows (if applicable)
    });

    await mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

    // Open the DevTools
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', () => {
    setLogCallback((messages) => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('logProxyMessages', messages);
        }
    });

    setErrorCallback((messages) => {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('logProxyMessages', messages);
        }
    });

    ipcMain.on('startProxyServers', (event, dbHost, dbPort, proxyHost, proxyPort) => {
        createMySQLProxyServer(dbHost, dbPort, proxyHost, proxyPort);
    });

    ipcMain.on('stopProxyServers', () => {
        shutdownProxyServers();
    });

    ipcMain.on('fetchFromDb', async (event, sqlQuery, host, port, login, password, database) => {
        try {
            const result = await sendSqlQuery$(sqlQuery, host, port, login, password, database);
            event.reply('fetchFromDbResult', { ok: true, result });
        } catch (err) {
            event.reply('fetchFromDbResult', { ok: false, error: err && err.message ? err.message : String(err) });
        }
    });

    ipcMain.on('fetchTableSchemas', async (event, host, port, login, password, database) => {
        try {
            const schemas = await fetchTableSchemas$(host, port, login, password, database);
            event.reply('fetchTableSchemasResult', { ok: true, schemas });
        } catch (err) {
            event.reply('fetchTableSchemasResult', { ok: false, error: err && err.message ? err.message : String(err) });
        }
    });

    // Added ipcMain.handle for hash-query
    ipcMain.handle('hash-query', (event, query) => {
        const buffer = Buffer.from(query);
        return xxHashAddon.XXHash3.hash(buffer).toString('hex');
    });

    createWindow().catch(err => {
        console.error('Error creating window:', err);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow().catch(err => {
            console.error('Error creating window on activate:', err);
        });
    }
});

process.on('SIGINT', shutdownProxyServers);
process.on('SIGTERM', shutdownProxyServers);
