/**
 * Captures PNG screenshots of the given pages at three widths, in both light
 * and dark, and writes them under <output-dir>.
 *
 * Usage: node scripts/screenshot.js <output-dir> <name>=<url> [<name>=<url> ...]
 *
 * Clean-up is `browser.close()` alone. #120 records what went wrong the one
 * time clean-up instead looked for browser processes by name: it ended every
 * chrome.exe with no window title, not only the one this script started.
 * Playwright's Chromium is a separate binary from the machine's own browser,
 * so `close()` is enough.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { parseTargets } from './screenshot-targets.js';

const WIDTHS = [390, 768, 1280];
const COLOR_SCHEMES = ['light', 'dark'];
const VIEWPORT_HEIGHT = 1024;

const [outputDir, ...targetArgs] = process.argv.slice(2);

if (outputDir === undefined || targetArgs.length === 0) {
  console.error('usage: node scripts/screenshot.js <output-dir> <name>=<url> [<name>=<url> ...]');
  process.exit(2);
}

try {
  const targets = parseTargets(targetArgs);

  mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const { name, url } of targets) {
      for (const colorScheme of COLOR_SCHEMES) {
        for (const width of WIDTHS) {
          const page = await browser.newPage({
            viewport: { width, height: VIEWPORT_HEIGHT },
            colorScheme,
          });
          await page.goto(url, { waitUntil: 'networkidle' });
          const file = `${outputDir}/${name}-${colorScheme}-${width}.png`;
          await page.screenshot({ path: file, fullPage: true });
          console.log(file);
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
