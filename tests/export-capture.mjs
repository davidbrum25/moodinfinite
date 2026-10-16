// Captures the Moodflow HTML sheet, jsPDF export and print view for tests/fixtures/moodflow-sample.json.
// Usage: node tests/export-capture.mjs <outDir>   (CHROME_PATH=/usr/bin/google-chrome)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'export-out');
mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || '41777';
const sample = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/moodflow-sample.json'), 'utf8'));
const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.evaluate((sample) => {
        createNewProject('storyflow');
        const proj = projects.find((p) => p.id === activeProjectId);
        const mk = (i) => { const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
            const grd = g.createLinearGradient(0, 0, 640, 360); grd.addColorStop(0, i ? '#2a4d69' : '#c97b3a'); grd.addColorStop(1, '#101820');
            g.fillStyle = grd; g.fillRect(0, 0, 640, 360); return c.toDataURL('image/jpeg', 0.8); };
        proj.name = sample.name;
        proj.data.workers = sample.workers;
        proj.data.frames = sample.frames.map((f) => ({ ...f, image: f.image ? mk(Number(f.image.split(':')[1])) : null }));
        window.__sheetBlobs = [];
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            if (this.href && this.href.startsWith('blob:')) {
                fetch(this.href).then((r) => r.blob()).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }))
                    .then((d) => window.__sheetBlobs.push({ name: this.download, data: d }));
                return;
            }
            return origClick.apply(this, arguments);
        };
        URL.revokeObjectURL = () => {};
        window.jspdf.jsPDF.API.save = function (n) { window.__sheetBlobs.push({ name: n, data: this.output('datauristring') }); return this; };
        renderStoryflowView(proj);
        window.print = () => {};
    }, sample);
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(out, '00-app-board.png') });
    await page.evaluate(() => exportMoodflowAsSheet(projects.find((p) => p.id === activeProjectId)));
    await page.evaluate(() => saveStoryflowAsPdf(projects.find((p) => p.id === activeProjectId)));
    await page.waitForFunction(() => window.__sheetBlobs.length >= 2, { timeout: 15000 }).catch(async () => { console.log("blobs", await page.evaluate(() => [window.__sheetBlobs.map(b=>b.name), typeof window.jspdf])); });
    const blobs = await page.evaluate(() => window.__sheetBlobs);
    for (const b of blobs) {
        const buf = Buffer.from(b.data.split(',').pop(), 'base64');
        writeFileSync(path.join(out, b.name.endsWith('.pdf') ? 'export-pdf-jspdf.pdf' : 'export-sheet.html'), buf);
    }
    // print view
    await page.evaluate(() => prepareAndPrint());
    await page.emulateMediaType('print');
    await page.pdf({ path: path.join(out, 'print-view.pdf'), format: 'A4', printBackground: true });
    await page.emulateMediaType('screen');
    // sheet screenshots (screen + print)
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 900 });
    await sp.goto('file://' + path.join(out, 'export-sheet.html'));
    await sp.screenshot({ path: path.join(out, 'sheet-screen.png'), fullPage: true });
    await sp.emulateMediaType('print');
    await sp.pdf({ path: path.join(out, 'sheet-print.pdf'), format: 'A4', printBackground: true });
    await sp.setViewport({ width: 390, height: 800 });
    await sp.emulateMediaType('screen');
    await sp.screenshot({ path: path.join(out, 'sheet-mobile390.png'), fullPage: true });
    console.log('captured', out);
} finally { await browser.close(); server.kill(); }
