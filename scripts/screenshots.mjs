// Regenerates docs/screenshots/*.png from the built app: npm run build && node scripts/screenshots.mjs
import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sample } from '../src/sample.js';

const out = 'docs/screenshots';
await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'mardar-shots-'));
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env: { ...process.env, MARDAR_UPDATE_FEED: 'http://127.0.0.1:9/' } });
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${name}.png` }); };
const view = name => page.locator(`button[data-view=${name}]`).click();

await view('split');
await page.locator('#editor').fill(sample);
await page.locator('#preview .mermaid svg').waitFor();
await view('live');
await page.locator('#live .mermaid svg').waitFor();
await page.locator('#live p', { hasText: '把零散的灵感' }).click();
await shot('live');
await page.keyboard.press('Escape');
await view('split');
await shot('split');
await page.locator('#theme').click();
await view('read');
await shot('dark');
await page.locator('#theme').click();
await page.locator('#about').click();
await shot('about');
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy()));
await app.close();
