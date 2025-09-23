import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';
import path from 'path'; // Import the path module

export default defineConfig({
    plugins: [
        vue(),
        electron([
            {
                // Main process entry file
                entry: 'src/index.js',
                // Optional: Add custom vite config for the main process
                // See https://vite-plugin-electron.netlify.app/config/#options
                vite: {
                    build: {
                        //rollupOptions: {
                        //  external: ['electron', ...], // Add other externals if needed
                        //},
                    },
                },
            },
            {
                entry: 'src/preload.js',
                onstart(options) {
                    // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
                    // instead of restarting the entire Electron App.
                    options.reload();
                },
                // Optional: Add custom vite config for the preload script
                vite: {
                    build: {
                        //rollupOptions: {
                        //  external: ['electron', ...],
                        //},
                    },
                },
            },
        ]),
        electronRenderer({
            // Disable nodeIntegration for security
            nodeIntegration: false,
            // Enable contextIsolation for security
            contextIsolation: true,
            // secure: true, // Default: true.
        }),
    ],
    // Configure the build output directory
    build: {
      outDir: 'dist/electron'
    },
    resolve: {
        alias: {
            '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
        }
    },
    // Configure the development server
    server: {
      port: 5173,
      strictPort: true,
    }
});
