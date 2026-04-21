import {app, BrowserWindow, net, ipcMain} from 'electron';
import electronSquirrelStartup from 'electron-squirrel-startup';
import { shell } from 'electron';
import {fileURLToPath, pathToFileURL} from 'url';
import {dirname, join} from 'path';
import {
    createMySQLProxyServer,
    setLogCallback,
    setErrorCallback,
    shutdownProxyServers, sendSqlQuery$, fetchTableSchemas$
} from "./lib/mysql/mysqlProxyServer.js";
import {d} from "./lib/helpers.js";
import xxHashAddon from 'xxhash-addon';

// Get the directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (electronSquirrelStartup) {
    app.quit();
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

// Function to check if the Vite dev server is ready
const isViteServerReady = (url) => {
    return new Promise((resolve) => {
        const request = net.request(url);
        // Set a short timeout for the check
        const timeout = setTimeout(() => {
            request.abort();
            resolve(false);
        }, 500);

        request.on('response', () => {
            clearTimeout(timeout);
            resolve(true);
        });
        request.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
        });
        request.end();
    });
};

const createWindow = async () => {
    // Create the browser window.
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const isTest = process.env.NODE_ENV === 'test';

    const preloadPath = isDev || isTest
        ? join(__dirname, 'preload.js')
        : join(app.getAppPath(), 'dist-electron', 'preload.js');

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

    // In development mode, load from Vite dev server with retry mechanism
    if (process.env.NODE_ENV === 'development' && !isTest) {
        // Preference: Forge env var, then Plugin env var, then fallback
        const devServerUrl = process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || process.env.VITE_DEV_SERVER_URL || 'http://localhost:5199/';
        
        // Try to connect to Vite dev server with retries
        let isReady = false;
        let retries = 0;
        const maxRetries = 10;

        while (!isReady && retries < maxRetries) {
            console.log(`Checking if Vite server is ready at ${devServerUrl} (attempt ${retries + 1}/${maxRetries})...`);
            isReady = await isViteServerReady(devServerUrl);

            if (!isReady) {
                retries++;
                // Wait for 1 second before trying again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (isReady) {
            console.log(`Vite server at ${devServerUrl} is ready, loading URL...`);
            await mainWindow.loadURL(devServerUrl);
        } else {
            console.error('Failed to connect to Vite server after multiple attempts');
            // Fallback to loading the file directly
            const indexHtml = join(dirname(__dirname), 'index.html');
            await mainWindow.loadURL(pathToFileURL(indexHtml).toString());
        }

        // Open the DevTools
        mainWindow.webContents.openDevTools();

    } else if (isTest) {
        // In test mode, we usually want to load the file directly or a specific test URL
        const indexHtml = join(dirname(__dirname), 'index.html');
        await mainWindow.loadURL(pathToFileURL(indexHtml).toString());
    } else {
        const indexHtml = join(app.getAppPath(), 'dist', 'electron', 'index.html');
        const indexUrl = pathToFileURL(indexHtml).toString();
        await mainWindow.loadURL(indexUrl);
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
