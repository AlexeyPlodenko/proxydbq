import { _electron as electron } from '@playwright/test';
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('launch app', async () => {
  const electronApp = await electron.launch({
    args: [join(__dirname, '../src/index.js')],
    env: {
        ...process.env,
        NODE_ENV: 'test'
    }
  });

  const window = await electronApp.firstWindow();
  
  // Increase timeout for the window to be ready
  await window.waitForLoadState('domcontentloaded');
  
  // Update expectation to match the actual title including version
  expect(await window.title()).toBe('Proxy DBQ v0.0.1');

  // Check if main content is visible
  // Wait for the #app element which is where Vue mounts
  await window.waitForSelector('#app', { timeout: 10000 });

  const content = await window.textContent('body');
  expect(content).toBeTruthy();

  await electronApp.close();
});
