import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [
        vue(),
        electron([
            {
                // Main-process entry file of the Electron App.
                entry: 'src/index.js',
                onstart(options) {
                    options.startup();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron/main',
                    },
                },
            },
            {
                entry: 'src/preload.js',
                onstart(options) {
                    options.reload();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron/preload',
                    },
                },
            },
        ]),
        renderer(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
        }
    },
    server: {
        port: 5199, // Use a unique port to avoid conflicts
        strictPort: true,
    }
});
