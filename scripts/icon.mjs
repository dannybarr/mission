import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('src-tauri/icons', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
  await page.setContent('<style>html,body{margin:0;background:transparent}</style><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="14" fill="#2b2d31"/><path d="M15 43V25h6v2c4-4 9-3 12 1 4-5 14-5 14 4v11h-6V33c0-4-6-4-6 0v10h-6V33c0-4-6-4-6 0v10z" fill="#fff"/><circle cx="51" cy="42" r="3" fill="#75a7cc"/></svg>');
  await page.screenshot({ path: 'src-tauri/icons/icon.png', omitBackground: true });
} finally { await browser.close(); }
