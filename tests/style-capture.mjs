// Captures the palette popup open and closed for glass and flat, on two presets and two viewports.
// Usage: node tests/style-capture.mjs <outDir>   (CHROME_PATH=/usr/bin/google-chrome)
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'style-out');
mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || '41779';
const sample = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/moodflow-sample.json'), 'utf8'));
const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-sandbox'],
});

async function openPalette(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        const btn = document.getElementById('palette-btn');
        if (btn) btn.scrollIntoView({ inline: 'end', block: 'nearest' });
    });
    const open = await page.$eval('#palette-panel', (el) => el.classList.contains('open'));
    if (!open) {
        await page.evaluate(() => document.getElementById('palette-btn').click());
        await page.waitForSelector('#palette-panel.open [role="radio"]');
    }
}

async function applyLook(page, style, preset) {
    const open = await page.$eval('#palette-panel', (el) => el.classList.contains('open'));
    if (open) {
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
    }
    await openPalette(page);
    await page.click(`#palette-panel [data-style-option="${style}"]`);
    await page.waitForFunction((expected) => document.body.dataset.style === expected, {}, style);
    const options = await page.$$('#palette-panel .palette-option');
    await options[preset].click();
    await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
    await page.mouse.move(2, 2);
    await page.evaluate(() => {
        if (typeof draw === 'function') draw();
    });
}

async function shootPair(page, style, preset, width, prefix) {
    await openPalette(page);
    await page.waitForFunction(() => {
        const panel = document.getElementById('palette-panel');
        return panel.classList.contains('open') && getComputedStyle(panel).opacity === '1';
    });
    await page.screenshot({ path: path.join(out, `${prefix}${style}-preset${preset}-${width}-popup.png`) });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
        const panel = document.getElementById('palette-panel');
        return !panel.classList.contains('open') && getComputedStyle(panel).opacity === '0';
    });
    await page.screenshot({ path: path.join(out, `${prefix}${style}-preset${preset}-${width}.png`) });
}

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.projects && window.projects.length > 0 && typeof createNewProject === 'function' && typeof selectBaseStyle === 'function', { timeout: 20000 });

    await page.evaluate((sample) => {
        createNewProject('storyflow');
        const proj = projects.find((p) => p.id === activeProjectId);
        const mk = (i) => {
            const c = document.createElement('canvas');
            c.width = 640;
            c.height = 360;
            const g = c.getContext('2d');
            const grd = g.createLinearGradient(0, 0, 640, 360);
            grd.addColorStop(0, i ? '#2a4d69' : '#c97b3a');
            grd.addColorStop(1, '#101820');
            g.fillStyle = grd;
            g.fillRect(0, 0, 640, 360);
            return c.toDataURL('image/jpeg', 0.8);
        };
        proj.name = sample.name;
        proj.data.workers = sample.workers;
        proj.data.frames = sample.frames.map((f) => ({
            ...f,
            image: f.image ? mk(Number(f.image.split(':')[1])) : null,
        }));
        renderStoryflowView(proj);
    }, sample);
    await new Promise((r) => setTimeout(r, 400));

    const viewports = [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
    ];
    for (const style of ['glass', 'flat']) {
        for (const preset of [1, 4]) {
            for (const viewport of viewports) {
                await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
                await page.waitForFunction((w) => window.innerWidth === w, {}, viewport.width);
                await applyLook(page, style, preset);
                await shootPair(page, style, preset, viewport.width, '');
            }
        }
    }

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluate(() => {
        createNewProject('moodinfinite');
        const mid = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 });
        const accent = accentColor || '#429eff';
        const base = { rotation: 0, isPinned: false, opacity: 1, scaleX: 1, scaleY: 1 };
        items.push(
            { ...base, id: 'cap-note', type: 'text', text: 'Collect references here', title: 'Mood', x: mid.x - 220, y: mid.y - 80, width: 200, height: 130, fontSize: 16, fontFamily: 'Nunito', color: accent },
            { ...base, id: 'cap-a', type: 'box', color: accent, x: mid.x + 10, y: mid.y - 60, width: 120, height: 120, style: 'fill' },
            { ...base, id: 'cap-b', type: 'box', color: '#f5d76e', x: mid.x + 150, y: mid.y - 10, width: 90, height: 70, style: 'fill' },
        );
        syncActiveMoodboard();
        selectedItems = [];
        draw();
    });

    for (const style of ['glass', 'flat']) {
        for (const preset of [1, 4]) {
            for (const viewport of viewports) {
                await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
                await page.waitForFunction((w) => window.innerWidth === w, {}, viewport.width);
                await page.evaluate(() => {
                    selectedItems = [];
                    focusOnSelection();
                    draw();
                });
                await applyLook(page, style, preset);
                await page.evaluate(() => { focusOnSelection(); draw(); });
                await shootPair(page, style, preset, viewport.width, 'board-');
            }
        }
    }
    console.log('captured', out);
} finally {
    await browser.close();
    server.kill();
}
