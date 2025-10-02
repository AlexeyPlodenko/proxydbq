import {app, BrowserWindow, net, ipcMain} from 'electron';
import electronSquirrelStartup from 'electron-squirrel-startup';
import { shell } from 'electron';
import {fileURLToPath, pathToFileURL} from 'url';
import {dirname, join} from 'path';
import {
    createMySQLProxyServer,
    setLogCallback,
    setErrorCallback,
    shutdownProxyServers, sendSqlQuery$
} from "./lib/mysql/mysqlProxyServer.js";
import {d} from "./lib/helpers.js";

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
const isViteServerReady = () => {
    return new Promise((resolve) => {
        const request = net.request('http://localhost:5173/');
        request.on('response', () => {
            resolve(true);
        });
        request.on('error', () => {
            resolve(false);
        });
        request.end();
    });
};

const createWindow = async () => {
    // Create the browser window.
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    const preloadPath = isDev
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

    // and load the index.html of the app.
    // In development mode, load from Vite dev server with retry mechanism
    if (process.env.NODE_ENV === 'development') {
        // Try to connect to Vite dev server with retries
        let isReady = false;
        let retries = 0;
        const maxRetries = 10;

        while (!isReady && retries < maxRetries) {
            console.log(`Checking if Vite server is ready (attempt ${retries + 1}/${maxRetries})...`);
            isReady = await isViteServerReady();

            if (!isReady) {
                retries++;
                // Wait for 1 second before trying again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        if (isReady) {
            console.log('Vite server is ready, loading URL...');
            await mainWindow.loadURL('http://localhost:5173/');
        } else {
            console.error('Failed to connect to Vite server after multiple attempts');
            // Fallback to loading the file directly
            await mainWindow.loadURL(`file://${join(dirname(__dirname), '/src/index.html')}`);
        }

        if (process.env.NODE_ENV === 'development') {
            // Open the DevTools
            mainWindow.webContents.openDevTools();
        }

    } else {
        const indexHtml = join(app.getAppPath(), 'dist', 'electron', 'index.html');
        const indexUrl = pathToFileURL(indexHtml).toString();
        await mainWindow.loadURL(indexUrl);
    }

    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
    // Set up the log callback to send messages to the renderer process
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
        // createPostgreSQLProxyServer('127.0.0.1', 5432, 5433);
    });

    ipcMain.on('stopProxyServers', () => {
        shutdownProxyServers();
    });

    ipcMain.on('fetchFromDb', async (event, sqlQuery, host, port, login, password, database) => {
        try {
            const result = await sendSqlQuery$(sqlQuery, host, port, login, password, database);
            // Reply directly to the sender renderer process with the result
            event.reply('fetchFromDbResult', { ok: true, result });
        } catch (err) {
            // Send an error response back to the renderer
            event.reply('fetchFromDbResult', { ok: false, error: err && err.message ? err.message : String(err) });
        }
    });

    // Handle the async createWindow function
    createWindow().catch(err => {
        console.error('Error creating window:', err);
    });

    // app.on('activate', () => {
    //   if (BrowserWindow.getAllWindows().length === 0) {
    //     createWindow();
    //   }
    // });
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow().catch(err => {
            console.error('Error creating window on activate:', err);
        });
    }
});

process.on('SIGINT', shutdownProxyServers);
process.on('SIGTERM', shutdownProxyServers);
