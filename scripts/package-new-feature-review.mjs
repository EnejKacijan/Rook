import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { chromium } from 'playwright-core';

const root = process.argv[2];
if (!root) throw Error('Pass the fresh screenshot folder.');
const folders = (await readdir(root)).filter(name => /^0[1-5]-/.test(name));
const internal = `${root}-internal`, batches = `${root}-batches`;
await mkdir(internal, { recursive: true });
await mkdir(batches, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
let total = 0;
const all = {};
try {
  for (const folder of folders) {
    const files = (await readdir(path.join(root, folder))).filter(name => name.endsWith('.png')).sort();
    const batch = {};
    for (const file of files) batch[`${folder}/${file}`] = new Uint8Array(await readFile(path.join(root, folder, file)));
    Object.assign(all, batch);
    await writeFile(path.join(batches, `${folder}.zip`), zipSync(batch, { level: 0 }));
    for (let i = 0; i < files.length; i += 8) {
      const cards = files.slice(i, i + 8).map(file => `<figure><figcaption>${file}</figcaption><img src="data:image/png;base64,${Buffer.from(batch[`${folder}/${file}`]).toString('base64')}"></figure>`);
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#bbb;font:12px Arial}main{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px}figure{margin:0}figcaption{height:35px;overflow-wrap:anywhere}img{width:100%;height:670px;object-fit:contain;object-position:top;background:#aaa}</style><main>${cards.join('')}</main>`);
      await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
      await page.screenshot({ path: path.join(internal, `${folder}-${String(i / 8 + 1).padStart(2, '0')}.png`), fullPage: true });
    }
    total += files.length;
    console.log(`${folder}: ${files.length} originals`);
  }
  await writeFile(`${root}.zip`, zipSync(all, { level: 0 }));
  console.log(`TOTAL ${total}. Original PNGs only in review ZIPs; contact sheets are separate internal QA.`);
} finally { await browser.close(); }
