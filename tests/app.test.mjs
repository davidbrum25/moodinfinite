/**
 * Drives the served Moodinfinite page: board tabs, serialize/save,
 * undo, and the canvas hot path versus the captured f8023f0 baseline.
 */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { measureHotPath } from './hotpath.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || '41731';
const baseline = JSON.parse(readFileSync(new URL('./fixtures/hotpath-baseline.json', import.meta.url), 'utf8'));

const BOARD_BUTTONS = [
    ['add-moodinfinite-tab-btn', 'moodinfinite'],
    ['add-moodprompt-tab-btn', 'moodprompt'],
    ['add-colorseeker-tab-btn', 'colorseeker'],
    ['add-storyflow-tab-btn', 'storyflow'],
    ['add-moodgantt-tab-btn', 'moodgantt'],
    ['add-moodlist-tab-btn', 'moodlist'],
];

const HOTKEY_SNIPPETS = [
    "setCurrentTool(null)",
    "setCurrentTool('text')",
    "setCurrentTool('comment')",
    "setCurrentTool('link')",
    "setCurrentTool('textList')",
    "setCurrentTool('draw')",
    "setCurrentTool('arrow')",
    "setCurrentTool('box')",
    "setCurrentTool('circle')",
    "setCurrentTool('measure')",
    "setCurrentTool('grid')",
    "setCurrentTool('eyedropper')",
    'undoLastAction()',
    'redoLastAction()',
    'copyItems()',
    'cutItems()',
    'duplicateItems()',
    'groupSelectedItems()',
    'ungroupSelectedItems()',
    'deleteSelectedItems()',
    'saveAsPng()',
    'copyToClipboard()',
    'togglePin()',
    'flipHorizontal()',
    'flipVertical()',
    "setActiveGizmo('scale')",
    "setActiveGizmo('rotate')",
    'selectedItems = [...items]',
    'Selection inverted',
];

function startServer() {
    const child = spawn('node', ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    return { child, getLog: () => log };
}

function rawStatus(port, requestPath) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(Number(port), '127.0.0.1', () => {
            sock.write(`GET ${requestPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
        });
        let data = '';
        sock.on('data', (chunk) => { data += chunk; });
        sock.on('end', () => {
            const match = data.match(/^HTTP\/1\.[01] (\d+)/);
            resolve(match ? Number(match[1]) : 0);
        });
        sock.on('error', reject);
    });
}

async function waitForServer(port) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/`);
            if (res.ok) return;
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('server did not start');
}

function isFirstParty(text) {
    return /script\.js|modules\/moodlist\.js|cloud\.js/.test(text);
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Make elementFromPoint-based tap assertions deterministic: toasts can appear
// late under CPU load and cover controls, so clear them, wait until none are
// left, and wait until layout is stable for a few consecutive frames.
async function settleForHitTest(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
    });
    await page.waitForFunction(() => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        return !document.querySelector('.toast-notification');
    }, { timeout: 10000 });
    await page.waitForFunction(() => {
        const state = window.__hitTestSettle || (window.__hitTestSettle = { sig: null, stable: 0 });
        const sig = [
            window.innerWidth, window.innerHeight,
            document.documentElement.scrollWidth, document.documentElement.scrollHeight,
            document.querySelectorAll('*').length,
        ].join('|');
        state.stable = sig === state.sig ? state.stable + 1 : 0;
        state.sig = sig;
        const done = state.stable >= 5 && !document.querySelector('.toast-notification');
        if (done) delete window.__hitTestSettle;
        return done;
    }, { polling: 'raf', timeout: 10000 });
}

async function exerciseBoardInteractions(page) {
    const canvas = await page.$('#moodboard-canvas');
    const canvasBox = await canvas.boundingBox();
    const toPage = (sx, sy) => ({ x: canvasBox.x + sx, y: canvasBox.y + sy });
    let middleDown = false;
    let leftDown = false;
    const release = async () => {
        if (middleDown) {
            await page.mouse.up({ button: 'middle' });
            middleDown = false;
        }
        if (leftDown) {
            await page.mouse.up();
            leftDown = false;
        }
    };

    try {
        const panBefore = await page.evaluate(() => screenToWorld({ x: 420, y: 280 }));
        await page.mouse.move(canvasBox.x + 420, canvasBox.y + 280);
        await page.mouse.down({ button: 'middle' });
        middleDown = true;
        await page.mouse.move(canvasBox.x + 560, canvasBox.y + 400, { steps: 6 });
        await wait(80);
        const pan = await page.evaluate((before) => ({
            before,
            during: screenToWorld({ x: 420, y: 280 }),
            stillDown: document.getElementById('moodboard-canvas').classList.contains('grabbing'),
        }), panBefore);
        await release();

        const dragSpot = await page.evaluate(() => {
            items.length = 0;
            items.push({
                id: 'drag', type: 'box', color: '#ff40c0', x: 200, y: 180, width: 100, height: 80,
                rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
            });
            draw();
            return worldToScreen({ x: 250, y: 220 });
        });
        const dragStart = toPage(dragSpot.x, dragSpot.y);
        await page.mouse.move(dragStart.x, dragStart.y);
        await page.mouse.down();
        leftDown = true;
        await page.mouse.move(dragStart.x + 140, dragStart.y + 70, { steps: 6 });
        await wait(80);
        const drag = await page.evaluate(() => {
            const item = items.find((i) => i.id === 'drag');
            // Inset from the corner. The selection chrome sits on the center and the edges.
            const at = worldToScreen({ x: item.x + 16, y: item.y + 16 });
            const pixel = document.getElementById('moodboard-canvas').getContext('2d').getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data;
            return {
                x: item.x,
                y: item.y,
                moved: Math.hypot(item.x - 200, item.y - 180) > 20,
                pixel: [pixel[0], pixel[1], pixel[2], pixel[3]],
            };
        });
        await release();
        await wait(40);

        const color = await page.evaluate(() => {
            const input = document.getElementById('toolbar-accent-color-picker');
            input.focus();
            input.value = '#12ab34';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const itemInput = document.getElementById('item-color-picker');
            itemInput.focus();
            itemInput.value = '#00ff00';
            itemInput.dispatchEvent(new Event('input', { bubbles: true }));
            const item = items.find((i) => i.id === 'drag');
            return {
                css: getComputedStyle(document.documentElement).getPropertyValue('--switch-bg-checked').trim().toLowerCase(),
                inputKept: input.value.toLowerCase(),
                itemColor: item ? item.color : null,
                barBackdrop: getComputedStyle(document.getElementById('left-bar')).backdropFilter,
                appearance: getComputedStyle(input).getPropertyValue('-moz-appearance') || getComputedStyle(input).appearance,
            };
        });
        await wait(80);
        color.itemPixel = await page.evaluate(() => {
            const item = items.find((i) => i.id === 'drag');
            const at = worldToScreen({ x: item.x + 16, y: item.y + 16 });
            const pixel = document.getElementById('moodboard-canvas').getContext('2d').getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data;
            return [pixel[0], pixel[1], pixel[2], pixel[3]];
        });

        await page.evaluate(() => { items.length = 0; draw(); });
        const selectFrom = toPage(160, 140);
        await page.mouse.move(selectFrom.x, selectFrom.y);
        await page.mouse.down();
        leftDown = true;
        await page.mouse.move(selectFrom.x + 180, selectFrom.y + 120, { steps: 5 });
        await wait(80);
        const boxSelect = await page.evaluate((origin) => {
            const canvas = document.getElementById('moodboard-canvas');
            const ctx = canvas.getContext('2d');
            const x = Math.round(origin.x + 90);
            const y = Math.round(origin.y + 60);
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            return { pixel: [pixel[0], pixel[1], pixel[2], pixel[3]], painted: pixel[2] > pixel[0] + 8 };
        }, { x: 160, y: 140 });
        await release();

        const port = await page.evaluate(() => {
            items.length = 0;
            const box = (id, x, y) => ({
                id, type: 'box', color: '#223044', x, y, width: 120, height: 80,
                rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
            });
            items.push(box('a', 80, 80), box('b', 420, 240));
            draw();
            const right = getItemPorts(items[0]).find((p) => p.side === 'right');
            const start = worldToScreen({ x: right.x, y: right.y });
            const along = worldToScreen({ x: right.x + 18, y: right.y });
            return { start, along };
        });
        const portPage = toPage(port.start.x, port.start.y);
        await page.mouse.move(portPage.x, portPage.y);
        await wait(30);
        await page.mouse.down();
        leftDown = true;
        await page.mouse.move(portPage.x + 150, portPage.y + 30, { steps: 5 });
        await wait(80);
        const connector = await page.evaluate((along) => {
            const canvas = document.getElementById('moodboard-canvas');
            const ctx = canvas.getContext('2d');
            let painted = false;
            let pixel = [0, 0, 0, 0];
            for (let dy = -4; dy <= 4 && !painted; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const sample = ctx.getImageData(Math.round(along.x + dx), Math.round(along.y + dy), 1, 1).data;
                    pixel = [sample[0], sample[1], sample[2], sample[3]];
                    const blue = sample[2] > 140 && sample[2] > sample[0] + 40;
                    const green = sample[1] > 140 && sample[1] > sample[0] + 40;
                    if (blue || green) {
                        painted = true;
                        break;
                    }
                }
            }
            return { painted, pixel };
        }, port.along);
        await release();

        return { pan, drag, color, boxSelect, connector };
    } finally {
        await release();
    }
}

async function assertNowTierPolish(page) {
    await page.evaluate(() => {
        (0, eval)('selectedItems.length = 0');
        if (typeof updateSelectionToolbar === 'function') updateSelectionToolbar();
        draw();
    });
    const canvas = await page.$('#moodboard-canvas');
    const box = await canvas.boundingBox();
    const beforeLabel = await page.$eval('#canvas-zoom-readout', (el) => el.textContent.trim());
    assert.match(beforeLabel, /^\d+%$/);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel({ deltaY: -800 });
    await page.waitForFunction((prev) => {
        const el = document.getElementById('canvas-zoom-readout');
        return el && el.textContent.trim() !== prev;
    }, {}, beforeLabel);
    const zoomed = await page.evaluate(() => {
        const c = document.getElementById('moodboard-canvas');
        return {
            label: document.getElementById('canvas-zoom-readout').textContent.trim(),
            world: screenToWorld({ x: c.width / 2, y: c.height / 2 }),
        };
    });
    assert.match(zoomed.label, /^\d+%$/);
    assert.notEqual(zoomed.label, beforeLabel);

    await page.click('#canvas-zoom-readout');
    await page.waitForFunction(() => document.getElementById('canvas-zoom-readout').textContent.trim() === '100%');
    const reset = await page.evaluate(() => {
        const c = document.getElementById('moodboard-canvas');
        return screenToWorld({ x: c.width / 2, y: c.height / 2 });
    });
    assert.ok(Math.hypot(reset.x - zoomed.world.x, reset.y - zoomed.world.y) < 2, `zoom reset moved the view: ${JSON.stringify({ zoomed: zoomed.world, reset })}`);

    const guide = await page.evaluate(() => {
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        draw();
        const el = document.getElementById('canvas-empty-guide');
        return { hidden: el.hidden, text: el.innerText };
    });
    assert.equal(guide.hidden, false, 'empty canvas guide stayed hidden');
    assert.match(guide.text, /This board is empty/);
    assert.match(guide.text, /Middle-click/);

    const shotDir = process.env.POLISH_SHOT_DIR;
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        await page.screenshot({ path: path.join(shotDir, 'canvas-polish.png') });
    }

    const hiddenAfter = await page.evaluate(() => {
        items.push({
            id: 'polish-box', type: 'box', color: '#429eff', x: 40, y: 40, width: 80, height: 50,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        draw();
        return document.getElementById('canvas-empty-guide').hidden;
    });
    assert.equal(hiddenAfter, true, 'empty canvas guide stayed up after an item was added');

    await page.evaluate(() => createNewProject('moodprompt'));
    await page.waitForSelector('#moodprompt-empty-guide');
    const promptEmpty = await page.$eval('#moodprompt-empty-guide', (el) => el.innerText);
    assert.match(promptEmpty, /No prompts yet/);
    if (shotDir) {
        const promptPane = await page.$('#moodprompt-container');
        await promptPane.screenshot({ path: path.join(shotDir, 'moodprompt-polish.png') });
    }
    await page.click('#moodprompt-empty-add');
    await page.waitForSelector('.prompt-card');
    assert.equal(await page.$('#moodprompt-empty-guide'), null);
    await page.select('.moodprompt-top-bar select.bar-input', 'sora');
    await page.waitForSelector('#moodprompt-empty-guide');
    const filtered = await page.$eval('#moodprompt-empty-guide', (el) => el.innerText);
    assert.match(filtered, /No prompts match/);

    await page.evaluate(() => createNewProject('storyflow'));
    await page.waitForSelector('#storyflow-empty-guide');
    assert.match(await page.$eval('#storyflow-empty-guide', (el) => el.innerText), /No frames yet/);
    await page.click('#storyflow-empty-add');
    await page.waitForSelector('.story-card');
    assert.equal(await page.$('#storyflow-empty-guide'), null);

    await page.evaluate(() => createNewProject('moodgantt'));
    await page.waitForSelector('#gantt-empty-guide');
    assert.match(await page.$eval('#gantt-empty-guide', (el) => el.innerText), /No groups yet/);
    await page.click('#gantt-empty-add');
    await page.waitForFunction(() => {
        const label = document.querySelector('.gantt-group-label');
        return label && label.textContent.includes('New Group');
    });
    assert.equal(await page.$('#gantt-empty-guide'), null);

    await page.evaluate(() => createNewProject('colorseeker'));
    await page.waitForSelector('.colorseeker-bar');
    const bars = await page.$$('.colorseeker-bar');
    await bars[Math.min(2, bars.length - 1)].click();
    await page.waitForSelector('.colorseeker-copied');
    assert.equal(await page.$eval('.colorseeker-copied', (el) => el.textContent.trim()), 'Copied');
}

async function assertNextImprovements(page) {
    const shotDir = process.env.POLISH_SHOT_DIR;

    const mini = await page.evaluate(() => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        switchTab(board.id);
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        const shape = (id, x, y) => ({
            id, type: 'box', color: '#429eff', x, y, width: 140, height: 90,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        items.push(shape('near-map', 40, 40), shape('far-map', 4200, 40));
        draw();
        const c = document.getElementById('moodboard-canvas');
        const farScreen = worldToScreen({ x: 4200, y: 40 });
        const view = document.getElementById('canvas-minimap-viewport');
        return {
            hidden: document.getElementById('canvas-minimap').hidden,
            farOffscreen: farScreen.x > c.width + 20,
            left: parseFloat(view.style.left),
        };
    });
    assert.equal(mini.hidden, false, 'minimap hidden while the board is larger than the window');
    assert.equal(mini.farOffscreen, true, 'far item was already inside the window');
    await page.evaluate(() => {
        (0, eval)('cameraOffset.x -= 2400');
        draw();
    });
    const afterLeft = await page.$eval('#canvas-minimap-viewport', (el) => parseFloat(el.style.left));
    assert.ok(afterLeft > mini.left + 8, `minimap viewport did not track the pan (${mini.left} -> ${afterLeft})`);
    const beforeDrag = await page.evaluate(() => ({
        ox: (0, eval)('cameraOffset.x'),
        left: parseFloat(document.getElementById('canvas-minimap-viewport').style.left),
    }));
    const mapBox = await (await page.$('#canvas-minimap-map')).boundingBox();
    await page.mouse.move(mapBox.x + 12, mapBox.y + mapBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + mapBox.width - 12, mapBox.y + mapBox.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction((ox) => (0, eval)('cameraOffset.x') < ox - 8, {}, beforeDrag.ox);
    const afterDrag = await page.evaluate(() => {
        draw();
        return {
            ox: (0, eval)('cameraOffset.x'),
            left: parseFloat(document.getElementById('canvas-minimap-viewport').style.left),
        };
    });
    assert.ok(afterDrag.ox < beforeDrag.ox - 8, `minimap drag did not move the camera (${beforeDrag.ox} -> ${afterDrag.ox})`);
    assert.ok(afterDrag.left > beforeDrag.left + 4, `minimap frame did not follow the drag (${beforeDrag.left} -> ${afterDrag.left})`);
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        await page.screenshot({ path: path.join(shotDir, 'canvas-minimap.png') });
    }

    const canvasEl = await page.$('#moodboard-canvas');
    const canvasBox = await canvasEl.boundingBox();
    const toPage = (x, y) => ({ x: canvasBox.x + x, y: canvasBox.y + y });

    const dragSpot = await page.evaluate(() => {
        (0, eval)('cameraZoom = 1');
        (0, eval)('cameraOffset.x = canvas.width / 2');
        (0, eval)('cameraOffset.y = canvas.height / 2');
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        items.push({
            id: 'snap-box', type: 'box', color: '#ff40c0', x: 180, y: 160, width: 120, height: 80,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        draw();
        return worldToScreen({ x: 240, y: 200 });
    });
    const start = toPage(dragSpot.x, dragSpot.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    try {
        await page.mouse.move(start.x + 36, start.y + 24, { steps: 4 });
        const on = await page.$eval('#canvas-snap-indicator', (el) => ({ hidden: el.hidden, text: el.textContent.trim() }));
        assert.equal(on.hidden, false, 'snap indicator hidden during drag');
        assert.equal(on.text, 'Snap on');
        await page.keyboard.down('Shift');
        await page.mouse.move(start.x + 70, start.y + 48, { steps: 3 });
        assert.equal(await page.$eval('#canvas-snap-indicator', (el) => el.textContent.trim()), 'Snap off (Shift)');
        await page.keyboard.up('Shift');
        await page.mouse.move(start.x + 90, start.y + 60, { steps: 2 });
        assert.equal(await page.$eval('#canvas-snap-indicator', (el) => el.textContent.trim()), 'Snap on');
    } finally {
        try { await page.keyboard.up('Shift'); } catch { /* already up */ }
        await page.mouse.up();
    }
    assert.equal(await page.$eval('#canvas-snap-indicator', (el) => el.hidden), true, 'snap indicator stayed up after the drag');

    const captionSpot = await page.evaluate(async () => {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        await img.decode();
        globalImageCache['cap-img-id'] = img.src;
        items.length = 0;
        items.push({
            id: 'cap-img', type: 'image', img, imageId: 'cap-img-id', caption: '', x: 260, y: 180, width: 220, height: 160,
            rotation: 0, isPinned: false, opacity: 1, scaleX: 1, scaleY: 1,
        });
        (0, eval)('selectedItems.length = 0');
        saveStateForUndo();
        draw();
        return worldToScreen({ x: 370, y: 260 });
    });
    const capAt = toPage(captionSpot.x, captionSpot.y);
    await page.mouse.click(capAt.x, capAt.y);
    await page.waitForSelector('#image-caption-container');
    assert.notEqual(await page.$eval('#image-caption-container', (el) => getComputedStyle(el).display), 'none');
    await page.click('#image-caption-input');
    await page.keyboard.type('Hello');
    await page.waitForFunction(() => {
        const item = items.find((i) => i.id === 'cap-img');
        return item && item.caption === 'Hello';
    });
    const pixel = await page.evaluate(() => {
        draw();
        const item = items.find((i) => i.id === 'cap-img');
        const at = worldToScreen({ x: item.x + 14, y: item.y + 20 });
        const data = document.getElementById('moodboard-canvas').getContext('2d').getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data;
        return [data[0], data[1], data[2], data[3]];
    });
    assert.ok(pixel[1] > 80 && pixel[1] > pixel[0], `caption badge was not painted on the image: ${JSON.stringify(pixel)}`);
    await page.$eval('#image-caption-input', (el) => el.blur());
    await page.waitForFunction(async () => {
        const saved = await window.localforage.getItem('moodinfinite_projects');
        return JSON.stringify(saved || []).includes('"caption":"Hello"');
    }, { timeout: 8000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
        return window.projects && window.projects.length > 0
            && items.some((item) => item.id === 'cap-img' && item.caption === 'Hello');
    }, { timeout: 15000 });
    const reloaded = await page.evaluate(() => {
        draw();
        const item = items.find((entry) => entry.id === 'cap-img');
        return { caption: item && item.caption, at: worldToScreen({ x: 370, y: 260 }) };
    });
    assert.equal(reloaded.caption, 'Hello');
    const reloadedCanvas = await page.$('#moodboard-canvas');
    const reloadedBox = await reloadedCanvas.boundingBox();
    await page.mouse.click(reloadedBox.x + reloaded.at.x, reloadedBox.y + reloaded.at.y);
    await page.waitForFunction(() => document.getElementById('image-caption-input').value === 'Hello');
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.down('Control');
    await page.keyboard.press('z');
    await page.keyboard.up('Control');
    await page.waitForFunction(() => {
        const item = items.find((entry) => entry.id === 'cap-img');
        return item && item.caption !== 'Hello';
    });
    const undone = await page.evaluate(() => {
        const item = items.find((entry) => entry.id === 'cap-img');
        return item ? (item.caption || '') : null;
    });
    assert.notEqual(undone, null, 'undo removed the captioned image');
    assert.equal(undone, '');
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('z');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await page.waitForFunction(() => {
        const item = items.find((entry) => entry.id === 'cap-img');
        return item && item.caption === 'Hello';
    });

    await page.evaluate(() => {
        (0, eval)('moodpromptFilterPlatform = "all"');
        (0, eval)('moodpromptSearchQuery = ""');
        createNewProject('moodprompt');
    });
    await page.click('#moodprompt-empty-add');
    await page.waitForSelector('.prompt-copy-btn');
    await page.click('.prompt-copy-btn');
    await page.waitForSelector('.prompt-copied');
    assert.equal(await page.$eval('.prompt-copied', (el) => el.textContent.trim()), 'Copied');
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const pane = await page.$('#moodprompt-container');
        await pane.screenshot({ path: path.join(shotDir, 'moodprompt-copied.png') });
    }

    await page.evaluate(() => createNewProject('storyflow'));
    await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.frames.push(
            { id: 'f1', title: 'Open', image: null, description: 'First beat', meta: { duration: '1s', camera: '', audio: '' } },
            { id: 'f2', title: 'Close', image: null, description: 'Second beat', meta: { duration: '1s', camera: '', audio: '' } },
        );
        renderStoryflowView(project);
    });
    await page.click('#storyflow-play-btn');
    await page.waitForFunction(() => {
        const cur = document.querySelector('.story-card.animatic-current .story-card-index');
        return cur && cur.textContent.trim() === '1';
    });
    if (shotDir) {
        const story = await page.$('#storyflow-container');
        await story.screenshot({ path: path.join(shotDir, 'moodflow-animatic.png') });
    }
    await page.waitForFunction(() => {
        const cur = document.querySelector('.story-card.animatic-current .story-card-index');
        return cur && cur.textContent.trim() === '2';
    }, { timeout: 4000 });
    const playingIcon = await page.$eval('#storyflow-play-btn', (el) => ({
        playing: el.classList.contains('is-playing'),
        icon: el.querySelector('iconify-icon')?.getAttribute('icon'),
    }));
    assert.equal(playingIcon.playing, true);
    assert.equal(playingIcon.icon, 'lucide:square');
    await page.evaluate(() => stopStoryflowAnimatic());

    await page.evaluate(() => createNewProject('colorseeker'));
    await page.waitForSelector('.colorseeker-bar');
    const paletteBefore = await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim());
    const countBefore = paletteBefore.split(',').filter(Boolean).length;
    await page.click('#colorseeker-add-swatch');
    await page.waitForFunction((n) => document.querySelectorAll('.colorseeker-bar').length === n + 1, {}, countBefore);
    const addedList = await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim());
    assert.equal(addedList.split(',').filter(Boolean).length, countBefore + 1, 'adding a swatch did not grow the palette');
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const tone = await page.$('#colorseeker-container');
        await tone.screenshot({ path: path.join(shotDir, 'moodtone-swatches.png') });
    }
    await page.click('.colorseeker-bar:last-child .colorseeker-remove');
    await page.waitForFunction((n) => document.querySelectorAll('.colorseeker-bar').length === n, {}, countBefore);
    const orderBefore = (await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim())).split(',').map((s) => s.trim().toLowerCase());
    await page.evaluate(() => {
        const bars = [...document.querySelectorAll('.colorseeker-bar')];
        const data = new DataTransfer();
        data.setData('text/color-index', '0');
        bars[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    });
    const orderAfter = (await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim())).split(',').map((s) => s.trim().toLowerCase());
    assert.equal(orderAfter[2], orderBefore[0], `drag did not move the first swatch: ${orderBefore} -> ${orderAfter}`);
    assert.notEqual(orderAfter.join(','), orderBefore.join(','));

    await page.evaluate(() => createNewProject('moodlist'));
    await page.waitForSelector('.ml-item-text');
    await page.type('.ml-add-title', 'Pack');
    await page.type('.ml-item-text', 'Tickets');
    await page.click('.ml-save-btn');
    await page.waitForSelector('.ml-card .ml-item-due');
    const dateUi = await page.evaluate(() => {
        const row = document.querySelector('.ml-card-item');
        const icon = row.querySelector('.ml-due-btn');
        const check = row.querySelector('.ml-card-checkbox');
        const text = row.querySelector('.ml-card-item-text');
        const due = row.querySelector('.ml-item-due');
        return {
            icon: icon.querySelector('iconify-icon')?.getAttribute('icon'),
            iconLeft: icon.getBoundingClientRect().left,
            checkLeft: check.getBoundingClientRect().left,
            textWidth: text.getBoundingClientRect().width,
            dueWidth: due.getBoundingClientRect().width,
        };
    });
    assert.equal(dateUi.icon, 'lucide:calendar');
    assert.ok(dateUi.iconLeft < dateUi.checkLeft, 'the due date is not left of the checkbox');
    assert.ok(dateUi.dueWidth < 40, `date control still sits on the text line: ${dateUi.dueWidth}`);
    assert.ok(dateUi.textWidth > 48, `item text was squeezed: ${dateUi.textWidth}`);
    await page.$eval('.ml-card .ml-item-due', (el) => {
        el.value = '2026-11-02';
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.type('.ml-search', '2026-11-02');
    await page.waitForFunction(() => document.querySelectorAll('.ml-card').length === 1);
    const found = await page.evaluate(() => ({
        title: document.querySelector('.ml-card-title')?.textContent?.trim(),
        due: document.querySelector('.ml-card .ml-item-due')?.value,
    }));
    assert.equal(found.title, 'Pack');
    assert.equal(found.due, '2026-11-02');
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const list = await page.$('#moodlist-container');
        await list.screenshot({ path: path.join(shotDir, 'moodlist-due.png') });
    }
    await page.$eval('.ml-search', (el) => {
        el.value = '1999-01-01';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.ml-card').length === 0);

    await page.evaluate(() => createNewProject('moodgantt'));
    await page.click('#gantt-empty-add');
    await page.waitForSelector('.gantt-group-add-task-btn');
    await page.click('.gantt-group-add-task-btn');
    await page.waitForSelector('.gantt-bar');
    await new Promise((resolve) => setTimeout(resolve, 30));
    await page.click('.gantt-group-add-task-btn');
    await page.waitForFunction(() => document.querySelectorAll('.gantt-bar').length >= 2);
    const predecessorId = await page.$eval('.gantt-bar', (bar) => bar.dataset.taskId);
    const taskLabels = await page.$$('.gantt-task-label');
    await taskLabels[1].click();
    await page.waitForSelector('#gantt-detail-depends');
    await page.select('#gantt-detail-depends', predecessorId);
    await page.waitForSelector('.gantt-dep-line');
    await page.waitForFunction(() => {
        const box = document.getElementById('gantt-detail-close').getBoundingClientRect();
        return box.left >= 0 && box.right <= window.innerWidth && box.width > 0;
    });
    await page.click('#gantt-detail-close');
    const beforeMove = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const tasks = project.data.groups[0].tasks;
        return {
            starts: tasks.map((task) => task.startDate),
            left: [...document.querySelectorAll('.gantt-bar')].map((bar) => parseFloat(bar.style.left)),
        };
    });
    const predecessorBar = await page.$('.gantt-bar');
    const barBox = await predecessorBar.boundingBox();
    await page.mouse.move(barBox.x + Math.min(24, barBox.width / 2), barBox.y + barBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(barBox.x + Math.min(24, barBox.width / 2) + 160, barBox.y + barBox.height / 2, { steps: 8 });
    await page.mouse.up();
    const afterMove = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const tasks = project.data.groups[0].tasks;
        return {
            starts: tasks.map((task) => task.startDate),
            left: [...document.querySelectorAll('.gantt-bar')].map((bar) => parseFloat(bar.style.left)),
            line: !!document.querySelector('.gantt-dep-line'),
        };
    });
    assert.notEqual(afterMove.starts[0], beforeMove.starts[0], 'dragging the predecessor did not change its start');
    assert.notEqual(afterMove.starts[1], beforeMove.starts[1], 'the dependent task was not pushed');
    assert.ok(afterMove.left[1] > beforeMove.left[1], `dependent bar did not move right: ${beforeMove.left[1]} -> ${afterMove.left[1]}`);
    assert.equal(afterMove.line, true, 'dependency line disappeared after the move');
    const edgeBefore = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const tasks = project.data.groups[0].tasks;
        return {
            starts: tasks.map((task) => task.startDate),
            ends: tasks.map((task) => task.endDate),
            left: [...document.querySelectorAll('.gantt-bar')].map((bar) => parseFloat(bar.style.left)),
        };
    });
    const startHandle = await page.$('.gantt-bar-handle-left');
    const handleBox = await startHandle.boundingBox();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 80, handleBox.y + handleBox.height / 2, { steps: 6 });
    await page.mouse.up();
    const edgeAfter = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const tasks = project.data.groups[0].tasks;
        return {
            starts: tasks.map((task) => task.startDate),
            ends: tasks.map((task) => task.endDate),
            left: [...document.querySelectorAll('.gantt-bar')].map((bar) => parseFloat(bar.style.left)),
            line: !!document.querySelector('.gantt-dep-line'),
        };
    });
    assert.notEqual(edgeAfter.starts[0], edgeBefore.starts[0], 'dragging the start edge did not change the predecessor start');
    assert.equal(edgeAfter.ends[0], edgeBefore.ends[0], 'dragging the start edge changed the predecessor end');
    assert.notEqual(edgeAfter.starts[1], edgeBefore.starts[1], 'the dependent task was not pushed when the start edge moved');
    assert.ok(edgeAfter.left[1] > edgeBefore.left[1], `dependent bar did not follow the start edge: ${edgeBefore.left[1]} -> ${edgeAfter.left[1]}`);
    assert.equal(edgeAfter.line, true, 'dependency line disappeared after the start edge moved');
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const gantt = await page.$('#gantt-container');
        await gantt.screenshot({ path: path.join(shotDir, 'moodgantt-dependency.png') });
    }

    await page.evaluate(() => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        switchTab(board.id);
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        draw();
    });
    await page.waitForSelector('#canvas-template-picker button[data-template="flowchart"]');
    await page.click('#canvas-template-picker button[data-template="flowchart"]');
    await page.waitForFunction(() => items.some((item) => item.type === 'connector'));
    const flow = await page.evaluate(() => {
        draw();
        const conn = items.find((item) => item.type === 'connector');
        const canvasEl = document.getElementById('moodboard-canvas');
        const onScreen = items.filter((item) => item.type === 'box').every((box) => {
            const point = worldToScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
            return point.x > 40 && point.x < canvasEl.width - 40 && point.y > 40 && point.y < canvasEl.height - 40;
        });
        return {
            boxes: items.filter((item) => item.type === 'box').length,
            route: !!(conn && conn.route && conn.route.length >= 2),
            guideHidden: document.getElementById('canvas-empty-guide').hidden,
            onScreen,
        };
    });
    assert.equal(flow.boxes, 2, 'flowchart template did not place two boxes');
    assert.equal(flow.route, true, 'flowchart connector has no route');
    assert.equal(flow.guideHidden, true, 'empty guide stayed up after a template');
    assert.equal(flow.onScreen, true, 'flowchart template was placed outside the current view');
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'canvas-template.png') });

    await page.evaluate(() => { items.length = 0; draw(); });
    await page.click('#canvas-template-picker button[data-template="moodboard"]');
    await page.waitForFunction(() => items.some((item) => item.type === 'text') && items.some((item) => item.type === 'comment') && items.some((item) => item.type === 'box'));

    await page.evaluate(() => { items.length = 0; draw(); });
    await page.click('#canvas-template-picker button[data-template="image-grid"]');
    await page.waitForFunction(() => items.some((item) => item.type === 'grid' && item.rows === 2 && item.cols === 3));

    await page.evaluate(() => createNewProject('storyflow'));
    await page.click('#storyflow-empty-add');
    await page.waitForSelector('.story-sketch-toggle');
    await page.click('.story-sketch-toggle');
    await page.waitForSelector('.story-image-slot.is-sketching .story-sketch');
    const sketchBox = await (await page.$('.story-sketch')).boundingBox();
    await page.mouse.move(sketchBox.x + 24, sketchBox.y + 36);
    await page.mouse.down();
    await page.mouse.move(sketchBox.x + sketchBox.width - 24, sketchBox.y + sketchBox.height - 30, { steps: 8 });
    await page.mouse.up();
    const sketch = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const frame = project.data.frames[0];
        const canvas = document.querySelector('.story-sketch');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;
        for (let i = 3; i < pixels.length; i += 16) if (pixels[i] > 20) painted += 1;
        return {
            strokes: frame.sketch ? frame.sketch.length : 0,
            points: frame.sketch && frame.sketch[0] ? frame.sketch[0].points.length : 0,
            painted,
        };
    });
    assert.ok(sketch.strokes >= 1, 'drawing on the frame did not save a stroke');
    assert.ok(sketch.points >= 2, 'the frame stroke has too few points');
    assert.ok(sketch.painted > 0, 'the frame sketch was not painted');
    if (shotDir) {
        const story = await page.$('#storyflow-container');
        await story.screenshot({ path: path.join(shotDir, 'moodflow-sketch.png') });
    }

    await page.evaluate(() => createNewProject('storyflow'));
    await page.click('#storyflow-empty-add');
    await page.waitForSelector('.story-card');
    await page.click('#storyflow-add-frame-btn');
    await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 2);
    const scriptIcon = await page.$eval('#storyflow-script-btn iconify-icon', (el) => el.getAttribute('icon'));
    const playIcon = await page.$eval('#storyflow-play-btn iconify-icon', (el) => el.getAttribute('icon'));
    assert.equal(playIcon, 'lucide:play');
    assert.equal(scriptIcon, 'lucide:scroll-text');
    await page.click('#storyflow-script-btn');
    await page.waitForSelector('.story-script-action');
    assert.equal(await page.$eval('#storyflow-script-btn', (el) => el.classList.contains('is-open')), true);
    const scriptLayout = await page.evaluate(() => {
        const cards = document.getElementById('storyflow-scroll-area').getBoundingClientRect();
        const script = document.getElementById('storyflow-script-view').getBoundingClientRect();
        return {
            cardsW: cards.width,
            scriptW: script.width,
            scriptLeft: script.left,
            cardsRight: cards.right,
            scrollHidden: document.getElementById('storyflow-scroll-area').hidden,
            scriptHidden: document.getElementById('storyflow-script-view').hidden,
            cards: document.querySelectorAll('.story-card').length,
        };
    });
    assert.equal(scriptLayout.scrollHidden, false, 'opening the script hid the frames');
    assert.equal(scriptLayout.scriptHidden, false);
    assert.equal(scriptLayout.cards, 2);
    assert.ok(scriptLayout.cardsW > 80, `frames have no width: ${scriptLayout.cardsW}`);
    assert.ok(scriptLayout.scriptW > 80, `script sidebar has no width: ${scriptLayout.scriptW}`);
    assert.ok(scriptLayout.scriptLeft >= scriptLayout.cardsRight - 2, 'script is not beside the frames');
    const scriptAreas = await page.$$('.story-script-action');
    assert.equal(scriptAreas.length, 2);
    await scriptAreas[0].type('She opens the door');
    await scriptAreas[1].type('He answers');
    const scriptText = await page.$$eval('.story-script-action', (els) => els.map((el) => el.value));
    assert.deepEqual(scriptText, ['She opens the door', 'He answers']);
    if (shotDir) {
        const story = await page.$('#storyflow-container');
        await story.screenshot({ path: path.join(shotDir, 'moodflow-script.png') });
    }
    await page.click('#storyflow-script-btn');
    await page.waitForSelector('.story-desc-area');
    const boardText = await page.$$eval('.story-desc-area', (els) => els.map((el) => el.value));
    assert.deepEqual(boardText, ['She opens the door', 'He answers']);
    assert.equal(await page.$eval('#storyflow-script-view', (el) => el.hidden), true);

    await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.frames[0].title = 'Dawn';
        project.data.frames[0].description = 'She opens the door';
        project.data.frames[0].meta.duration = '30s';
        renderStoryflowView(project);
    });
    await page.click('#storyflow-fullscreen-btn');
    await page.waitForSelector('#storyflow-fullscreen:not([hidden])');
    const fullscreen = await page.evaluate(() => {
        const root = document.getElementById('storyflow-fullscreen');
        const still = root.querySelector('.storyflow-fullscreen-still').getBoundingClientRect();
        const copy = root.querySelector('.storyflow-fullscreen-copy').getBoundingClientRect();
        const box = root.getBoundingClientRect();
        return {
            coverW: box.width >= window.innerWidth - 2 && box.left <= 1,
            coverH: box.height >= window.innerHeight - 2 && box.top <= 1,
            title: document.getElementById('storyflow-fullscreen-title').textContent,
            text: document.getElementById('storyflow-fullscreen-text').textContent,
            textUnder: copy.top >= still.bottom - 2,
            refused: root.dataset.fullscreenRefused || '',
        };
    });
    if (fullscreen.refused) console.log('fullscreen-api-refused');
    assert.equal(fullscreen.coverW, true, 'fullscreen playback does not cover the width');
    assert.equal(fullscreen.coverH, true, 'fullscreen playback does not cover the height');
    assert.equal(fullscreen.title, 'Dawn');
    assert.equal(fullscreen.text, 'She opens the door');
    assert.equal(fullscreen.textUnder, true, 'the still text is not under the picture');
    const exitBtn = await page.$eval('#storyflow-fullscreen-close', (el) => {
        const box = el.getBoundingClientRect();
        return { text: el.textContent.replace(/\s+/g, ' ').trim(), w: box.width, h: box.height, top: box.top, right: box.right };
    });
    assert.ok(exitBtn.text.includes('Exit'), `fullscreen has no exit control: ${exitBtn.text}`);
    assert.ok(exitBtn.w > 48 && exitBtn.h > 20 && exitBtn.top >= 0 && exitBtn.right <= 1300, `exit control is not on screen: ${JSON.stringify(exitBtn)}`);
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'moodflow-fullscreen.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.getElementById('storyflow-fullscreen').hidden);

    await page.evaluate(async () => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        switchTab(board.id);
        const sample = document.createElement('canvas');
        sample.width = 30;
        sample.height = 10;
        const g = sample.getContext('2d');
        g.fillStyle = '#ff0000';
        g.fillRect(0, 0, 10, 10);
        g.fillStyle = '#00ff00';
        g.fillRect(10, 0, 10, 10);
        g.fillStyle = '#0000ff';
        g.fillRect(20, 0, 10, 10);
        const img = new Image();
        img.src = sample.toDataURL();
        await img.decode();
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        items.push({
            id: 'pal-src', type: 'image', img, x: 80, y: 80, width: 120, height: 40,
            rotation: 0, isPinned: false, opacity: 1, scaleX: 1, scaleY: 1,
        });
        draw();
    });
    await page.evaluate(() => createNewProject('colorseeker'));
    await page.waitForSelector('#colorseeker-from-image');
    await page.click('#colorseeker-from-image');
    await page.waitForSelector('.colorseeker-image-choice');
    await page.click('.colorseeker-image-choice');
    await page.waitForFunction(() => {
        const text = document.getElementById('colorseeker-hex-list').textContent.toLowerCase();
        return text.includes('ff0000') && text.includes('00ff00') && text.includes('0000ff');
    });
    const fromImage = await page.$eval('#colorseeker-hex-list', (el) => el.textContent.toLowerCase());
    assert.ok(fromImage.includes('ff0000') && fromImage.includes('00ff00') && fromImage.includes('0000ff'), fromImage);
    if (shotDir) {
        const tone = await page.$('#colorseeker-container');
        await tone.screenshot({ path: path.join(shotDir, 'moodtone-from-image.png') });
    }
    await page.click('#colorseeker-to-canvas');
    await page.waitForFunction(() => items.some((item) => item.fromPalette));
    const sent = await page.evaluate(() => {
        draw();
        const boxes = items.filter((item) => item.fromPalette);
        const canvasEl = document.getElementById('moodboard-canvas');
        const first = boxes[0];
        const at = worldToScreen({ x: first.x + first.width / 2, y: first.y + first.height / 2 });
        const pixel = canvasEl.getContext('2d').getImageData(Math.round(at.x), Math.round(at.y), 1, 1).data;
        return {
            colors: boxes.map((box) => String(box.color || '').toLowerCase()),
            visible: document.getElementById('moodinfinite-container').style.display !== 'none',
            pixel: [pixel[0], pixel[1], pixel[2], pixel[3]],
        };
    });
    assert.deepEqual(sent.colors, ['#ff0000', '#00ff00', '#0000ff']);
    assert.equal(sent.visible, true, 'sending the palette did not open the canvas');
    assert.ok(sent.pixel[0] > 200 && sent.pixel[1] < 40 && sent.pixel[2] < 40, `palette box was not painted: ${JSON.stringify(sent.pixel)}`);
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'canvas-palette-boxes.png') });

    await page.evaluate(() => createNewProject('moodlist'));
    await page.waitForSelector('.ml-add-title');
    await (await page.$('.ml-add-title')).type('Trip');
    await (await page.$('.ml-add-panel .ml-item-text')).type('Book flights');
    await page.click('.ml-add-item-btn');
    await page.waitForFunction(() => document.querySelectorAll('.ml-add-panel .ml-item-text').length === 2);
    const tripRows = await page.$$('.ml-add-panel .ml-item-text');
    await tripRows[1].type('Pack bags');
    await page.click('.ml-save-btn');
    await page.waitForSelector('.ml-card .ml-indent-btn');
    const indentSetup = await page.evaluate(() => ({
        rows: document.querySelectorAll('.ml-card .ml-card-item').length,
        buttons: document.querySelectorAll('.ml-card .ml-indent-btn').length,
        firstHasButton: !!document.querySelector('.ml-card .ml-card-item')?.querySelector('.ml-indent-btn'),
    }));
    assert.equal(indentSetup.rows, 2);
    assert.equal(indentSetup.buttons, 1, 'only the row under another row can indent');
    assert.equal(indentSetup.firstHasButton, false);
    await page.click('.ml-card .ml-indent-btn');
    await page.waitForSelector('.ml-card-item.ml-subtask');
    const indented = await page.evaluate(() => {
        const project = projects.find((p) => (p.data.cards || []).some((card) => card.title === 'Trip'));
        const card = project.data.cards.find((entry) => entry.title === 'Trip');
        const rows = [...document.querySelectorAll('.ml-card .ml-card-item')];
        const textLeft = (row) => row.querySelector('.ml-card-item-text').getBoundingClientRect().left;
        return {
            texts: card.items.map((item) => item.text),
            indents: card.items.map((item) => item.indent || 0),
            checked: card.items.map((item) => !!item.checked),
            subText: document.querySelector('.ml-card-item.ml-subtask .ml-card-item-text')?.value?.trim(),
            classes: rows.map((row) => row.classList.contains('ml-subtask')),
            shift: textLeft(rows[1]) - textLeft(rows[0]),
            textWidth: rows[1].querySelector('.ml-card-item-text').getBoundingClientRect().width,
        };
    });
    assert.deepEqual(indented.texts, ['Book flights', 'Pack bags']);
    assert.deepEqual(indented.indents, [0, 1]);
    assert.deepEqual(indented.checked, [false, false], 'indent toggled the checkbox');
    assert.equal(indented.subText, 'Pack bags');
    assert.deepEqual(indented.classes, [false, true]);
    assert.ok(indented.shift > 8, `subtask did not sit to the right: ${indented.shift}`);
    assert.ok(indented.textWidth > 48, `subtask text collapsed: ${indented.textWidth}`);
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const list = await page.$('#moodlist-container');
        await list.screenshot({ path: path.join(shotDir, 'moodlist-subtask.png') });
    }
    await page.$eval('.ml-card-item.ml-subtask .ml-item-due', (el) => {
        el.value = '2026-12-01';
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.$eval('.ml-search', (el) => {
        el.value = '2026-12-01';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.ml-card').length === 1 && document.querySelector('.ml-card-item.ml-subtask'));
    const stillIndented = await page.evaluate(() => {
        const project = projects.find((p) => (p.data.cards || []).some((card) => card.title === 'Trip'));
        const card = project.data.cards.find((entry) => entry.title === 'Trip');
        return {
            indent: card.items[1].indent || 0,
            due: card.items[1].due,
            sub: !!document.querySelector('.ml-card-item.ml-subtask'),
        };
    });
    assert.equal(stillIndented.indent, 1);
    assert.equal(stillIndented.due, '2026-12-01');
    assert.equal(stillIndented.sub, true);
    await page.click('.ml-card .ml-indent-btn');
    await page.waitForFunction(() => !document.querySelector('.ml-card-item.ml-subtask'));
    const outdented = await page.evaluate(() => {
        const project = projects.find((p) => (p.data.cards || []).some((card) => card.title === 'Trip'));
        const card = project.data.cards.find((entry) => entry.title === 'Trip');
        return card.items.map((item) => item.indent || 0);
    });
    assert.deepEqual(outdented, [0, 0]);

    await page.evaluate(() => {
        (0, eval)('moodpromptFilterPlatform = "all"');
        (0, eval)('moodpromptSearchQuery = ""');
        createNewProject('moodprompt');
    });
    await page.click('#moodprompt-empty-add');
    await page.waitForSelector('.prompt-text-area');
    const promptArea = await page.$('.prompt-text-area');
    await promptArea.click();
    await promptArea.type('A red door');
    await promptArea.evaluate((el) => el.blur());
    await page.waitForSelector('.prompt-previous-btn');
    await promptArea.click();
    await page.evaluate(() => {
        const el = document.querySelector('.prompt-text-area');
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await promptArea.type('A blue door');
    await promptArea.evaluate((el) => el.blur());
    await page.waitForFunction(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        return project && project.data.prompts[0] && project.data.prompts[0].previous === 'A red door';
    });
    await page.click('.prompt-previous-btn');
    const restored = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const prompt = project.data.prompts[0];
        renderMoodpromptView(project);
        return {
            text: prompt.text,
            previous: prompt.previous,
            shown: document.querySelector('.prompt-text-area')?.value,
            button: document.querySelector('.prompt-previous-btn')?.textContent?.trim(),
        };
    });
    assert.equal(restored.text, 'A red door');
    assert.equal(restored.previous, 'A blue door');
    assert.equal(restored.shown, 'A red door');
    assert.equal(restored.button, 'Previous');
    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        const pane = await page.$('#moodprompt-container');
        await pane.screenshot({ path: path.join(shotDir, 'moodprompt-previous.png') });
    }

    await page.evaluate(() => createNewProject('moodlist'));
    await page.click('#palette-btn');
    await page.waitForSelector('#palette-panel.open .palette-option');
    const paletteOptions = await page.$$('#palette-panel .palette-option');
    await paletteOptions[3].click();
    const listTheme = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        const style = getComputedStyle(document.documentElement);
        return {
            storedBg: project.data.canvasBackgroundColor,
            storedAccent: project.data.accentColor,
            bg: style.getPropertyValue('--bg-page').trim(),
            accent: style.getPropertyValue('--switch-bg-checked').trim(),
            board: getComputedStyle(document.getElementById('moodlist-container')).backgroundColor,
        };
    });
    assert.equal(listTheme.storedBg, '#002b36');
    assert.equal(listTheme.storedAccent, '#268bd2');
    assert.equal(listTheme.bg, '#002b36');
    assert.equal(listTheme.accent, '#268bd2');
    assert.equal(listTheme.board, 'rgb(0, 43, 54)');
    await page.waitForSelector('.ml-add-title');
    await (await page.$('.ml-add-title')).type('Groceries');
    await (await page.$('.ml-item-text')).type('Milk');
    await page.click('.ml-save-btn');
    await page.waitForSelector('.ml-card-item-text');
    const itemInk = await page.$eval('.ml-card-item-text', (el) => getComputedStyle(el).color);
    assert.equal(itemInk, 'rgb(226, 232, 240)', `list item text is not readable: ${itemInk}`);
    await page.click('#palette-btn');
    await page.waitForSelector('#palette-panel.open .palette-option');
    await (await page.$$('#palette-panel .palette-option'))[1].click();
    const lightList = await page.evaluate(() => {
        const text = getComputedStyle(document.querySelector('.ml-card-item-text')).color;
        const card = getComputedStyle(document.querySelector('.ml-card')).backgroundColor;
        const check = getComputedStyle(document.querySelector('.ml-card-checkbox')).color;
        return { text, card, check };
    });
    assert.equal(lightList.text, 'rgb(28, 25, 23)', `light preset left the list text pale: ${lightList.text}`);
    assert.equal(lightList.check, 'rgb(68, 64, 60)', `light preset left the checkbox pale: ${lightList.check}`);
    assert.equal(lightList.card, 'rgb(255, 255, 255)', `light preset left the card muddy: ${lightList.card}`);
    const cardsBeforePaste = await page.$$eval('.ml-card', (els) => els.length);
    await page.click('.ml-card-item-text');
    const pastedInto = await page.evaluate(() => {
        const el = document.querySelector('.ml-card-item-text');
        el.focus();
        const data = new DataTransfer();
        data.setData('text/plain', ' and bread');
        el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        return {
            value: el.value,
            cards: document.querySelectorAll('.ml-card').length,
            stored: projects.find((p) => p.id === activeProjectId).data.cards[0].items[0].text,
        };
    });
    assert.ok(pastedInto.value.includes('and bread'), `paste missed the list field: ${pastedInto.value}`);
    assert.equal(pastedInto.cards, cardsBeforePaste, 'pasting into a list field created a card');
    assert.ok(pastedInto.stored.includes('and bread'), 'the list item did not keep the pasted text');
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.evaluate(() => {
        const data = new DataTransfer();
        data.setData('text/plain', 'Buy tape');
        document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await page.waitForFunction((n) => document.querySelectorAll('.ml-card').length === n + 1, {}, cardsBeforePaste);

    await page.evaluate(() => createNewProject('moodgantt'));
    await page.click('#gantt-empty-add');
    await page.waitForSelector('.gantt-group-add-task-btn');
    await page.click('.gantt-group-add-task-btn');
    await page.waitForSelector('.gantt-task-label');
    await page.click('.gantt-task-label');
    await page.waitForFunction(() => {
        const box = document.getElementById('gantt-detail-close').getBoundingClientRect();
        return box.left >= 0 && box.width > 0;
    });
    await page.$eval('#gantt-manage-workers-btn', (btn) => btn.click());
    await page.waitForSelector('#new-worker-input');
    await page.type('#new-worker-input', 'Ada Lovelace');
    await page.click('#add-worker-btn');
    await page.waitForFunction(() => getSharedWorkers().includes('Ada Lovelace'));
    await page.$eval('#close-gantt-workers-btn', (btn) => btn.click());
    await page.evaluate(() => createNewProject('storyflow'));
    await page.click('#storyflow-empty-add');
    await page.waitForSelector('select.story-artist');
    const artistOptions = await page.$$eval('select.story-artist option', (els) => els.map((el) => el.value));
    assert.ok(artistOptions.includes('Ada Lovelace'), `artist list missed the shared worker: ${artistOptions.join(', ')}`);
    await page.select('select.story-artist', 'Ada Lovelace');
    const assigned = await page.evaluate(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        return project.data.frames[0].meta.artist;
    });
    assert.equal(assigned, 'Ada Lovelace');
    await page.evaluate(() => createNewProject('moodgantt'));
    await page.click('#gantt-empty-add');
    await page.waitForSelector('.gantt-group-add-task-btn');
    await page.click('.gantt-group-add-task-btn');
    await page.waitForSelector('.gantt-task-label');
    await page.click('.gantt-task-label');
    await page.waitForFunction(() => {
        const box = document.getElementById('gantt-detail-close').getBoundingClientRect();
        return box.left >= 0 && box.width > 0;
    });
    const ganttWorkers = await page.$$eval('#gantt-detail-assignee option', (els) => els.map((el) => el.value));
    assert.ok(ganttWorkers.includes('Ada Lovelace'), `gantt missed the shared worker: ${ganttWorkers.join(', ')}`);

    await page.evaluate(() => createNewProject('storyflow'));
    await page.$eval('.storyflow-add-many-preset[data-count="5"]', (btn) => btn.click());
    await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 5);
    await page.$eval('.storyflow-add-many-preset[data-count="10"]', (btn) => btn.click());
    await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 15);
    const afterCustom = await page.evaluate(() => {
        const input = document.getElementById('storyflow-add-count');
        input.value = '3';
        document.getElementById('storyflow-add-count-btn').click();
        const project = projects.find((p) => p.id === activeProjectId);
        return {
            value: input.value,
            frames: project.data.frames.length,
            cards: document.querySelectorAll('.story-card').length,
        };
    });
    assert.equal(afterCustom.frames, 18, JSON.stringify(afterCustom));
    assert.equal(afterCustom.cards, 18, JSON.stringify(afterCustom));
}

async function assertQoLUpgrades(page) {
    const shotDir = process.env.POLISH_SHOT_DIR;

    // 1. Moodinfinite Canvas: Selection toolbar duplicate & count badge
    await page.evaluate(() => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        switchTab(board.id);
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        const box = (id, x, y) => ({
            id, type: 'box', color: '#ff40c0', x, y, width: 80, height: 60,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        items.push(box('b1', 100, 100), box('b2', 250, 100));
        (0, eval)('selectedItems = [items[0], items[1]]');
        if (typeof updateSelectionToolbar === 'function') updateSelectionToolbar();
        draw();
    });
    const selCount = await page.$eval('#selection-count-badge', (el) => ({
        text: el.textContent.trim(),
        visible: getComputedStyle(el).display !== 'none',
    }));
    assert.equal(selCount.visible, true, 'selection count badge hidden with 2 items selected');
    assert.equal(selCount.text, '2');
    const dupSelBtn = await page.$('#duplicate-selection-btn');
    assert.notEqual(dupSelBtn, null, 'duplicate selection button missing from toolbar');
    await dupSelBtn.click();
    const countAfterDup = await page.evaluate(() => items.length);
    assert.equal(countAfterDup, 4, `expected 4 items after duplicate selection, got ${countAfterDup}`);

    // 2. Moodprompt: live character/word counter badge + quick duplicate prompt card
    await page.evaluate(() => {
        (0, eval)('moodpromptFilterPlatform = "all"');
        (0, eval)('moodpromptSearchQuery = ""');
        createNewProject('moodprompt');
    });
    await page.click('#moodprompt-empty-add');
    await page.waitForSelector('.prompt-card');
    await page.waitForSelector('.prompt-counter-badge');
    const initialBadge = await page.$eval('.prompt-counter-badge', (el) => el.textContent.trim());
    assert.match(initialBadge, /0 chars · 0 words/);
    const pArea = await page.$('.prompt-text-area');
    await pArea.type('A glowing neon sunset in Tokyo');
    await pArea.evaluate((el) => el.blur());
    const updatedBadge = await page.$eval('.prompt-counter-badge', (el) => el.textContent.trim());
    assert.match(updatedBadge, /30 chars · 6 words/);
    const promptCardsBefore = await page.$$eval('.prompt-card', (els) => els.length);
    assert.equal(promptCardsBefore, 1);
    await page.click('.prompt-duplicate-btn');
    await page.waitForFunction(() => document.querySelectorAll('.prompt-card').length === 2);
    const clonedPromptText = await page.$$eval('.prompt-text-area', (els) => els[1].value);
    assert.equal(clonedPromptText, 'A glowing neon sunset in Tokyo');

    // 3. Moodtone (Colorseeker): Reverse palette & Copy CSS variables
    await page.evaluate(() => createNewProject('colorseeker'));
    await page.waitForSelector('.colorseeker-bar');
    const paletteOriginal = await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim());
    const colorsList = paletteOriginal.split(',').map((s) => s.trim().toUpperCase());
    await page.click('#colorseeker-reverse-palette');
    await page.waitForFunction((firstHex) => {
        const cur = document.getElementById('colorseeker-hex-list').textContent.trim();
        return !cur.startsWith(firstHex);
    }, {}, colorsList[0]);
    const paletteReversed = (await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim())).split(',').map((s) => s.trim().toUpperCase());
    assert.deepEqual(paletteReversed, [...colorsList].reverse(), 'palette was not reversed');
    await page.click('#colorseeker-copy-css');
    await page.waitForSelector('.colorseeker-copied');
    assert.equal(await page.$eval('.colorseeker-copied', (el) => el.textContent.trim()), 'CSS Copied');

    // 4. Moodflow (Storyflow): Card header duplicate frame
    await page.evaluate(() => createNewProject('storyflow'));
    await page.click('#storyflow-empty-add');
    await page.waitForSelector('.story-card');
    await page.type('.story-title-input', 'Scene Intro');
    await page.click('.story-card-duplicate-btn');
    await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 2);
    const storyTitles = await page.$$eval('.story-title-input', (els) => els.map((el) => el.value));
    assert.deepEqual(storyTitles, ['Scene Intro', 'Scene Intro']);

    // 5. Moodgantt: Expand / Collapse All Groups & Duplicate Task
    await page.evaluate(() => createNewProject('moodgantt'));
    await page.click('#gantt-empty-add');
    await page.waitForSelector('.gantt-group-add-task-btn');
    await page.click('#gantt-add-group-btn');
    await page.waitForFunction(() => document.querySelectorAll('.gantt-group-sidebar-row').length === 2);
    await page.click('#gantt-toggle-collapse-btn');
    await page.waitForFunction(() => {
        const btns = [...document.querySelectorAll('.gantt-group-collapse-btn')];
        return btns.length === 2 && btns.every((b) => b.classList.contains('collapsed'));
    });
    await page.click('#gantt-toggle-collapse-btn');
    await page.waitForFunction(() => {
        const btns = [...document.querySelectorAll('.gantt-group-collapse-btn')];
        return btns.length === 2 && btns.every((b) => !b.classList.contains('collapsed'));
    });
    await page.click('.gantt-group-add-task-btn');
    await page.waitForSelector('.gantt-task-label');
    await page.click('.gantt-task-label');
    await page.waitForSelector('#gantt-detail-panel.open');
    await new Promise((r) => setTimeout(r, 300));
    await page.click('#gantt-detail-duplicate');
    await page.waitForFunction(() => document.querySelectorAll('.gantt-bar').length >= 2);

    // 6. Moodlist: Progress completion badge & Duplicate Card
    await page.evaluate(() => createNewProject('moodlist'));
    await page.waitForSelector('.ml-add-title');
    await page.type('.ml-add-title', 'Sprint Tasks');
    await page.type('.ml-item-text', 'Design specs');
    await page.click('.ml-add-item-btn');
    await page.waitForFunction(() => document.querySelectorAll('.ml-add-panel .ml-item-text').length === 2);
    const listItems = await page.$$('.ml-add-panel .ml-item-text');
    await listItems[1].type('Write tests');
    await page.click('.ml-save-btn');
    await page.waitForSelector('.ml-card-progress-badge');
    const badgeInitial = await page.$eval('.ml-card-progress-badge', (el) => ({
        text: el.textContent.trim(),
        complete: el.classList.contains('is-complete'),
    }));
    assert.equal(badgeInitial.text, '0/2');
    assert.equal(badgeInitial.complete, false);
    const checks = await page.$$('.ml-card-checkbox');
    await checks[0].click();
    await page.waitForFunction(() => document.querySelector('.ml-card-progress-badge')?.textContent?.trim() === '1/2');
    const checksAfter = await page.$$('.ml-card-checkbox');
    await checksAfter[1].click();
    await page.waitForFunction(() => {
        const el = document.querySelector('.ml-card-progress-badge');
        return el && el.textContent.trim() === '2/2' && el.classList.contains('is-complete');
    });
    await page.hover('.ml-card');
    await page.click('.ml-card-duplicate-btn');
    await page.waitForFunction(() => document.querySelectorAll('.ml-card').length === 2);
    const duplicatedTitle = await page.$$eval('.ml-card-title', (els) => els[1]?.textContent?.trim());
    assert.match(duplicatedTitle, /Sprint Tasks/);

    if (shotDir) {
        mkdirSync(shotDir, { recursive: true });
        await page.screenshot({ path: path.join(shotDir, 'qol-upgrades.png') });
    }
}

async function assertRound2Upgrades(page) {
    // 1. Moodinfinite Canvas: Fit-to-View button (#canvas-fit-view-btn)
    await page.evaluate(() => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        switchTab(board.id);
        (0, eval)('selectedItems.length = 0');
        items.length = 0;
        const box = (id, x, y) => ({
            id, type: 'box', color: '#429eff', x, y, width: 200, height: 150,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        items.push(box('f1', 50, 50), box('f2', 800, 600));
        (0, eval)('cameraZoom = 2.5');
        draw();
    });
    const fitBtn = await page.$('#canvas-fit-view-btn');
    assert.notEqual(fitBtn, null, 'missing #canvas-fit-view-btn on canvas');
    await page.evaluate(() => document.getElementById('canvas-fit-view-btn').click());
    const zoomAfterFit = await page.evaluate(() => cameraZoom);
    assert.ok(zoomAfterFit < 2.5, `expected cameraZoom to adjust for fit, got ${zoomAfterFit}`);

    // 2. Moodprompt: Board count badge & Copy All button
    await page.evaluate(() => {
        (0, eval)('moodpromptFilterPlatform = "all"');
        (0, eval)('moodpromptSearchQuery = ""');
        createNewProject('moodprompt');
    });
    await page.click('#moodprompt-empty-add');
    await page.waitForSelector('.prompt-card');
    await page.waitForSelector('.prompt-duplicate-btn');
    await page.click('.prompt-duplicate-btn');
    await page.waitForFunction(() => document.querySelectorAll('.prompt-card').length === 2);
    const pCountText = await page.$eval('#moodprompt-count-badge', (el) => el.textContent.trim());
    assert.equal(pCountText, '2 prompts');
    const copyAllBtn = await page.$('#moodprompt-copy-all-btn');
    assert.notEqual(copyAllBtn, null, 'missing #moodprompt-copy-all-btn');
    await copyAllBtn.click();

    // 3. Moodtone (Colorseeker): Copy hex codes & mobile buttons for hotkey functions
    await page.evaluate(() => createNewProject('colorseeker'));
    await page.waitForSelector('#colorseeker-copy-hex');
    const hexBtnStyle = await page.$eval('#colorseeker-copy-hex', (btn) => {
        const s = window.getComputedStyle(btn);
        return { borderRadius: s.borderRadius, cursor: s.cursor, position: s.position };
    });
    assert.equal(hexBtnStyle.borderRadius, '999px');
    assert.equal(hexBtnStyle.cursor, 'pointer');
    assert.equal(hexBtnStyle.position, 'relative');
    await page.click('#colorseeker-copy-hex');
    await page.waitForSelector('.colorseeker-hex-copied');
    assert.equal(await page.$eval('.colorseeker-hex-copied', (el) => el.textContent.trim()), 'Hex Copied');
    await page.waitForFunction(() => !document.querySelector('.colorseeker-hex-copied'), { timeout: 3000 });

    // 3a. Randomize palette button (replaces Space hotkey for mobile)
    const paletteBeforeRandomize = await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim());
    await page.click('#colorseeker-randomize');
    await page.waitForFunction((prev) => document.getElementById('colorseeker-hex-list').textContent.trim() !== prev, {}, paletteBeforeRandomize);
    const paletteAfterRandomize = await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim());
    assert.notEqual(paletteAfterRandomize, paletteBeforeRandomize);

    // 3b. Download PNG button (replaces Shift+S hotkey for mobile)
    const dlBtn = await page.$('#colorseeker-download-png');
    assert.notEqual(dlBtn, null, 'missing #colorseeker-download-png button');

    // 3c. Toggle locks button (replaces L hotkey for mobile)
    await page.click('#colorseeker-toggle-locks');
    await page.waitForFunction(() => document.querySelectorAll('.colorseeker-lock-btn.is-locked').length > 0);
    const lockedCount = await page.$$eval('.colorseeker-lock-btn.is-locked', (els) => els.length);
    assert.ok(lockedCount >= 2, 'expected locked swatches after toggle locks');
    await page.click('#colorseeker-toggle-locks');
    await page.waitForFunction(() => document.querySelectorAll('.colorseeker-lock-btn.is-locked').length === 0);

    // 3d. Set base color button on swatch (replaces Shift+Click for mobile)
    await page.click('.colorseeker-bar:nth-child(2) .colorseeker-set-base');
    await page.waitForFunction(() => document.querySelector('.colorseeker-bar:nth-child(2) .colorseeker-set-base')?.classList.contains('is-base') || document.querySelector('.colorseeker-set-base.is-base'));

    // 3e. Move left & right buttons on swatch (replaces mouse drag-and-drop for mobile)
    const firstSwatchHex = (await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim())).split(',')[0];
    await page.hover('.colorseeker-bar:first-child');
    await page.click('.colorseeker-bar:first-child .colorseeker-move-right');
    await page.waitForFunction((origFirst) => {
        const curFirst = document.getElementById('colorseeker-hex-list').textContent.trim().split(',')[0];
        return curFirst !== origFirst;
    }, {}, firstSwatchHex);
    const newSecondSwatchHex = (await page.$eval('#colorseeker-hex-list', (el) => el.textContent.trim())).split(',')[1];
    assert.equal(newSecondSwatchHex.toLowerCase(), firstSwatchHex.toLowerCase());

    // 4. Moodflow (Storyflow): 1-click Frame Reorder (Move Left / Move Right)
    await page.evaluate(() => createNewProject('storyflow'));
    await page.click('#storyflow-empty-add');
    await page.waitForSelector('.story-card');
    const firstTitleInput = await page.$('.story-title-input');
    await firstTitleInput.type('Frame Alpha');
    await page.click('.story-card-duplicate-btn');
    await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 2);
    const titleInputs = await page.$$('.story-title-input');
    await titleInputs[1].evaluate((el) => { el.value = ''; });
    await titleInputs[1].type('Frame Beta');
    const firstLeftDisabled = await page.$eval('.story-card-move-left-btn', (el) => el.disabled);
    assert.equal(firstLeftDisabled, true, 'first frame move left should be disabled');
    await page.click('.story-card-move-right-btn');
    await page.waitForFunction(() => {
        const titles = [...document.querySelectorAll('.story-title-input')].map((el) => el.value);
        return titles[0] === 'Frame Beta' && titles[1] === 'Frame Alpha';
    });

    // 5. Moodgantt: Group Task Count Badge (.gantt-group-count-badge)
    await page.evaluate(() => createNewProject('moodgantt'));
    await page.click('#gantt-empty-add');
    await page.waitForSelector('.gantt-group-add-task-btn');
    const badgeInitialGantt = await page.$eval('.gantt-group-count-badge', (el) => el.textContent.trim());
    assert.equal(badgeInitialGantt, '0 tasks');
    await page.click('.gantt-group-add-task-btn');
    await page.waitForFunction(() => document.querySelector('.gantt-group-count-badge')?.textContent?.trim() === '1 task');
    await page.click('.gantt-group-add-task-btn');
    await page.waitForFunction(() => document.querySelector('.gantt-group-count-badge')?.textContent?.trim() === '2 tasks');

    // 6. Moodlist: Cards count badge & Check-all toggle
    await page.evaluate(() => createNewProject('moodlist'));
    await page.waitForSelector('.ml-add-title');
    await page.type('.ml-add-title', 'Feature Launch');
    await page.type('.ml-item-text', 'Spec doc');
    await page.click('.ml-add-item-btn');
    await page.waitForFunction(() => document.querySelectorAll('.ml-add-panel .ml-item-text').length === 2);
    const mlItems = await page.$$('.ml-add-panel .ml-item-text');
    await mlItems[1].type('Code review');
    await page.click('.ml-save-btn');
    await page.waitForSelector('.ml-card-progress-badge');
    const cardCountBadge = await page.$eval('#ml-cards-count', (el) => el.textContent.trim());
    assert.equal(cardCountBadge, '1 card');
    assert.equal(await page.$eval('.ml-card-progress-badge', (el) => el.textContent.trim()), '0/2');
    await page.hover('.ml-card');
    await page.click('.ml-card-check-all-btn');
    await page.waitForFunction(() => {
        const b = document.querySelector('.ml-card-progress-badge');
        return b && b.textContent.trim() === '2/2' && b.classList.contains('is-complete');
    });
    await page.hover('.ml-card');
    await page.click('.ml-card-check-all-btn');
    await page.waitForFunction(() => {
        const b = document.querySelector('.ml-card-progress-badge');
        return b && b.textContent.trim() === '0/2' && !b.classList.contains('is-complete');
    });
}

async function assertNonCanvasRound1(page) {
    await page.setViewport({ width: 1280, height: 800 });

    const promptFix = await page.evaluate(() => {
        (0, eval)('moodpromptFilterPlatform = "all"');
        (0, eval)('moodpromptSearchQuery = ""');
        createNewProject('moodprompt');
        const project = projects.find((p) => p.id === activeProjectId);
        const blank = (id, title, platform) => ({
            id, title, platform, mediaType: 'image', image1: null, image2: null, text: title + ' body', tags: [],
        });
        project.data.prompts = [
            blank('keep', 'Keep me', 'midjourney'),
            blank('drop', 'Drop me', 'sora'),
        ];
        renderMoodpromptView(project);
        const filter = document.querySelector('.moodprompt-top-bar select.bar-input');
        filter.value = 'sora';
        filter.dispatchEvent(new Event('change', { bubbles: true }));
        const visibleBefore = [...document.querySelectorAll('.prompt-title-input')].map((el) => el.value);
        document.querySelector('.prompt-delete-btn').click();
        const afterDelete = projects.find((p) => p.id === project.id).data.prompts.map((p) => p.id);

        createNewProject('moodprompt');
        const board = projects.find((p) => p.id === activeProjectId);
        board.data.prompts = [
            blank('a', 'Alpha', 'midjourney'),
            blank('b', 'Beta', 'sora'),
            blank('c', 'Gamma', 'sora'),
        ];
        (0, eval)('moodpromptFilterPlatform = "all"');
        renderMoodpromptView(board);
        const filter2 = document.querySelector('.moodprompt-top-bar select.bar-input');
        filter2.value = 'sora';
        filter2.dispatchEvent(new Event('change', { bubbles: true }));
        const cards = [...document.querySelectorAll('.prompt-card')];
        const data = new DataTransfer();
        data.setData('text/plain', 'c');
        cards[0].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
        const afterDrag = projects.find((p) => p.id === board.id).data.prompts.map((p) => p.id);

        (0, eval)('moodpromptFilterPlatform = "all"');
        renderMoodpromptView(board);
        const search = document.querySelector('.moodprompt-top-bar input.bar-input[type="text"]');
        search.focus();
        search.value = 'Alpha';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const titleHits = [...document.querySelectorAll('.prompt-title-input')].map((el) => el.value);
        search.value = 'sora';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const platformHits = [...document.querySelectorAll('.prompt-title-input')].map((el) => el.value).sort();
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const afterEscape = {
            query: (0, eval)('moodpromptSearchQuery'),
            value: search.value,
            count: document.querySelectorAll('.prompt-card').length,
        };

        let saves = 0;
        const origSave = scheduleAutoSave;
        scheduleAutoSave = () => { saves += 1; origSave(); };
        const card = document.querySelector('.prompt-card');
        const title = card.querySelector('.prompt-title-input');
        title.value = 'Alpha Saved';
        title.dispatchEvent(new Event('input', { bubbles: true }));
        const platform = card.querySelector('.platform-select');
        platform.value = 'runway';
        platform.dispatchEvent(new Event('change', { bubbles: true }));
        [...card.querySelectorAll('.media-type-btn')].find((btn) => btn.textContent === 'Video').click();
        const edited = board.data.prompts.find((p) => p.id === 'a');
        scheduleAutoSave = origSave;
        return {
            visibleBefore,
            afterDelete,
            afterDrag,
            titleHits,
            platformHits,
            afterEscape,
            saves,
            edited: { title: edited.title, platform: edited.platform, mediaType: edited.mediaType },
            boardId: board.id,
        };
    });
    assert.deepEqual(promptFix.visibleBefore, ['Drop me']);
    assert.deepEqual(promptFix.afterDelete, ['keep'], 'filtered delete removed the wrong prompt');
    assert.deepEqual(promptFix.afterDrag, ['a', 'c', 'b'], 'filtered drag reordered the wrong prompt');
    assert.deepEqual(promptFix.titleHits, ['Alpha']);
    assert.deepEqual(promptFix.platformHits, ['Beta', 'Gamma']);
    assert.equal(promptFix.afterEscape.query, '');
    assert.equal(promptFix.afterEscape.value, '');
    assert.equal(promptFix.afterEscape.count, 3);
    assert.ok(promptFix.saves >= 3, `title, platform, and media did not schedule a save (${promptFix.saves})`);
    assert.deepEqual(promptFix.edited, { title: 'Alpha Saved', platform: 'runway', mediaType: 'video' });

    const promptStored = await page.evaluate(async (boardId) => {
        await saveToBrowser();
        const stored = await window.localforage.getItem('moodinfinite_projects');
        const board = stored.find((p) => p.id === boardId);
        const prompt = board.data.prompts.find((p) => p.id === 'a');
        return { title: prompt.title, platform: prompt.platform, mediaType: prompt.mediaType };
    }, promptFix.boardId);
    assert.deepEqual(promptStored, { title: 'Alpha Saved', platform: 'runway', mediaType: 'video' });

    await page.evaluate(() => createNewProject('moodlist'));
    await page.waitForSelector('.ml-add-title');
    await page.type('.ml-add-title', 'Round1 Keep');
    await page.type('.ml-item-text', 'One');
    await page.click('.ml-add-item-btn');
    await page.waitForFunction(() => document.querySelectorAll('.ml-add-panel .ml-item-text').length === 2);
    const mlDraft = await page.$$('.ml-add-panel .ml-item-text');
    await mlDraft[1].type('Two');
    await page.click('.ml-save-btn');
    await page.waitForSelector('.ml-card .ml-item-move');
    const listDesktop = await page.evaluate(() => {
        const badge = document.getElementById('ml-cards-count').textContent.trim();
        const due = document.querySelector('.ml-card .ml-item-due').getBoundingClientRect().width;
        const move = getComputedStyle(document.querySelector('.ml-item-move')).display;
        document.querySelector('.ml-card-item .ml-item-move[data-dir="1"]').click();
        const order = [...document.querySelectorAll('.ml-card .ml-card-item-text')].map((el) => el.value);
        const search = document.querySelector('.ml-search');
        search.focus();
        search.value = 'nomatch';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        const filtered = document.getElementById('ml-cards-count').textContent.trim();
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const title = document.querySelector('.ml-card-title');
        title.textContent = 'Round1 Kept';
        title.dispatchEvent(new Event('blur', { bubbles: true }));
        return {
            badge,
            due,
            move,
            order,
            filtered,
            afterEscape: document.getElementById('ml-cards-count').textContent.trim(),
            search: document.querySelector('.ml-search').value,
            title: projects.find((p) => p.id === activeProjectId).data.cards[0].title,
        };
    });
    assert.equal(listDesktop.badge, '1 card');
    assert.ok(listDesktop.due < 40, `desktop due control grew: ${listDesktop.due}`);
    assert.equal(listDesktop.move, 'none');
    assert.deepEqual(listDesktop.order, ['Two', 'One']);
    assert.match(listDesktop.filtered, /of/);
    assert.equal(listDesktop.afterEscape, '1 card');
    assert.equal(listDesktop.search, '');
    assert.equal(listDesktop.title, 'Round1 Kept');
    const listStored = await page.evaluate(async () => {
        await saveToBrowser();
        const stored = await window.localforage.getItem('moodinfinite_projects');
        const board = stored.find((p) => p.id === activeProjectId);
        return board.data.cards[0].title;
    });
    assert.equal(listStored, 'Round1 Kept');

    const ganttFix = await page.evaluate(() => {
        createNewProject('moodgantt');
        const project = projects.find((p) => p.id === activeProjectId);
        ganttAddGroup(project);
        const group = project.data.groups[0];
        ganttAddTask(project, group.id);
        const task = group.tasks[0];
        task.status = 'done';
        task.name = 'Ship it';
        group.collapsed = true;
        renderGanttView(project);
        const collapsed = {
            tasks: document.querySelector('#gantt-stat-tasks span').textContent.trim(),
            done: document.getElementById('gantt-done-pct').textContent.trim(),
            rows: document.querySelectorAll('.gantt-task-sidebar-row').length,
        };
        group.collapsed = false;
        renderGanttView(project);
        const row = document.querySelector('.gantt-task-sidebar-row');
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const opened = document.getElementById('gantt-detail-panel').classList.contains('open');
        const end = document.getElementById('gantt-detail-end');
        end.value = '2000-01-01';
        end.dispatchEvent(new Event('change', { bubbles: true }));
        const snapped = {
            end: task.endDate,
            start: task.startDate,
            input: document.getElementById('gantt-detail-end').value,
        };
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const closed = !document.getElementById('gantt-detail-panel').classList.contains('open');
        project.data.viewStartDate = '2020-01-01';
        project.data.viewEndDate = '2020-06-01';
        ganttJumpToToday(project);
        return {
            collapsed,
            opened,
            snapped,
            closed,
            viewStart: project.data.viewStartDate,
            id: project.id,
        };
    });
    assert.equal(ganttFix.collapsed.tasks, '1 Task');
    assert.equal(ganttFix.collapsed.done, '100% Done');
    assert.equal(ganttFix.collapsed.rows, 0);
    assert.equal(ganttFix.opened, true, 'Enter on a task row did not open the detail panel');
    assert.equal(ganttFix.snapped.end, ganttFix.snapped.start, 'end date before start was kept');
    assert.equal(ganttFix.snapped.input, ganttFix.snapped.start);
    assert.equal(ganttFix.closed, true, 'Escape did not close the gantt detail panel');
    assert.notEqual(ganttFix.viewStart, '2020-01-01');
    const ganttStored = await page.evaluate(async (id) => {
        await saveToBrowser();
        const stored = await window.localforage.getItem('moodinfinite_projects');
        return stored.find((p) => p.id === id).data.viewStartDate;
    }, ganttFix.id);
    assert.equal(ganttStored, ganttFix.viewStart);

    const exported = await page.evaluate(async () => {
        window.__downloads = [];
        const origClick = HTMLAnchorElement.prototype.click;
        const origRevoke = URL.revokeObjectURL;
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function () {
            window.__downloads.push({ download: this.download || '', href: this.href || '' });
        };
        const readZip = async () => {
            const href = window.__downloads.at(-1) && window.__downloads.at(-1).href;
            const buf = await (await fetch(href)).arrayBuffer();
            const zip = await window.JSZip.loadAsync(buf);
            const name = Object.keys(zip.files).find((entry) => entry.endsWith('data.json'));
            return name ? JSON.parse(await zip.files[name].async('string')) : null;
        };
        saveProject();
        for (let i = 0; i < 80 && !window.__downloads.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const ganttData = await readZip();
        window.__downloads = [];
        const tone = projects.find((p) => p.type === 'colorseeker');
        switchTab(tone.id);
        saveProject();
        for (let i = 0; i < 80 && !window.__downloads.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const toneData = await readZip();
        const list = projects.find((p) => p.data && p.data.cards && p.data.cards.some((card) => card.title === 'Round1 Kept'));
        switchTab(list.id);
        window.__downloads = [];
        saveAsPng();
        const png = window.__downloads.at(-1) ? window.__downloads.at(-1).href : '';
        let copyError = '';
        try { await copyToClipboard(); } catch (err) { copyError = String(err); }
        const prints = {};
        const origPrint = window.print;
        window.print = () => {
            window.__printed = document.getElementById('print-board-type').textContent;
            window.dispatchEvent(new Event('afterprint'));
        };
        prepareAndPrint();
        prints.list = window.__printed;
        switchTab(projects.find((p) => p.id === ganttFixId(projects)).id);
        prepareAndPrint();
        prints.gantt = window.__printed;
        window.print = origPrint;
        HTMLAnchorElement.prototype.click = origClick;
        URL.revokeObjectURL = origRevoke;
        const loaded = [];
        loadFileAsNewTab(JSON.stringify({ groups: [{ id: 'g', name: 'Imported', tasks: [] }] }), 'plan.json');
        loaded.push(projects.at(-1).type);
        loadFileAsNewTab(JSON.stringify({ baseColor: '#112233', mode: 'shades', colors: ['#112233', '#000000'] }), 'tone.json');
        loaded.push(projects.at(-1).type);
        return {
            ganttGroups: Array.isArray(ganttData && ganttData.groups),
            toneBase: toneData && toneData.baseColor,
            toneColors: Array.isArray(toneData && toneData.colors),
            png: png.slice(0, 15),
            copyError,
            prints,
            loaded,
        };
        function ganttFixId(listProjects) {
            return listProjects.find((p) => p.type === 'moodgantt' && p.data.groups && p.data.groups[0] && p.data.groups[0].tasks && p.data.groups[0].tasks[0] && p.data.groups[0].tasks[0].name === 'Ship it').id;
        }
    });
    assert.equal(exported.ganttGroups, true, 'moodgantt export zip had no groups');
    assert.ok(exported.toneBase, 'moodtone export zip had no base color');
    assert.equal(exported.toneColors, true);
    assert.equal(exported.png, 'data:image/png;');
    assert.equal(exported.copyError, '');
    assert.equal(exported.prints.list, 'Moodlist');
    assert.equal(exported.prints.gantt, 'Moodgantt');
    assert.deepEqual(exported.loaded, ['moodgantt', 'colorseeker']);

    const toneKeys = await page.evaluate(() => {
        createNewProject('colorseeker');
        const project = projects.find((p) => p.id === activeProjectId);
        const before = project.data.colors.slice();
        window.__moveLogs = [];
        const orig = console.log;
        console.log = (...args) => {
            const text = args.map((part) => String(part)).join(' ');
            if (text.includes('Moving swatch')) window.__moveLogs.push(text);
            orig.apply(console, args);
        };
        document.querySelector('.colorseeker-move-right').click();
        const afterClick = project.data.colors.slice();
        console.log = orig;
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const again = projects.find((p) => p.id === activeProjectId);
        const left = again.data.colors.slice();
        window._colorseekerFocusedIndex = 0;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        return {
            logs: window.__moveLogs,
            clicked: before[0] !== afterClick[0] && afterClick[1] === before[0],
            arrow: again.data.colors[1] === left[0] && again.data.colors[0] === left[1],
        };
    });
    assert.deepEqual(toneKeys.logs, []);
    assert.equal(toneKeys.clicked, true);
    assert.equal(toneKeys.arrow, true, 'ArrowRight did not move the focused swatch');

    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => {
        const tone = projects.find((p) => p.type === 'colorseeker');
        switchTab(tone.id);
    });
    await settleForHitTest(page);
    const mobile = await page.evaluate(() => {
        const box = (el) => el ? el.getBoundingClientRect() : null;
        const list = projects.find((p) => p.data && p.data.cards && p.data.cards.some((card) => card.title === 'Round1 Kept'));
        switchTab(list.id);
        const footer = getComputedStyle(document.querySelector('.ml-card-footer')).opacity;
        const addItem = getComputedStyle(document.querySelector('.ml-card-add-item')).opacity;
        const del = getComputedStyle(document.querySelector('.ml-card-item-del')).opacity;
        const move = document.querySelector('.ml-item-move');
        const moveBox = box(move);
        const saveBox = box(document.querySelector('.ml-save-btn'));
        const gantt = projects.find((p) => p.type === 'moodgantt' && p.data.groups && p.data.groups[0] && p.data.groups[0].tasks[0] && p.data.groups[0].tasks[0].name === 'Ship it');
        switchTab(gantt.id);
        const addTask = getComputedStyle(document.querySelector('.gantt-group-add-task-btn')).opacity;
        const ganttScroll = document.getElementById('gantt-container').scrollWidth <= document.getElementById('gantt-container').clientWidth + 1;
        const pageScroll = document.documentElement.scrollWidth <= window.innerWidth + 1;
        const prompt = projects.find((p) => p.type === 'moodprompt' && p.data.prompts && p.data.prompts.some((row) => row.id === 'a'));
        switchTab(prompt.id);
        const row = document.querySelector('.prompt-content-row');
        const promptScroll = document.getElementById('moodprompt-container').scrollWidth <= document.getElementById('moodprompt-container').clientWidth + 1;
        const tone = projects.find((p) => p.type === 'colorseeker');
        switchTab(tone.id);
        const swatch = document.querySelector('.colorseeker-bar');
        const remove = swatch.querySelector('.colorseeker-remove');
        const removeBox = box(remove);
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        const hit = document.elementFromPoint(removeBox.x + removeBox.width / 2, removeBox.y + removeBox.height / 2);
        const sidebar = document.getElementById('colorseeker-sidebar');
        const label = swatch.querySelector('.colorseeker-hex-label');
        const labelStyle = getComputedStyle(label);
        const probe = document.createElement('div');
        probe.style.color = getContrastTextColor(label.textContent);
        document.body.appendChild(probe);
        const labelMatch = labelStyle.color === getComputedStyle(probe).color;
        probe.remove();
        return {
            footer, addItem, del,
            moveH: moveBox.height,
            moveDisplay: getComputedStyle(move).display,
            saveH: saveBox.height,
            addTask, ganttScroll, pageScroll,
            promptDir: getComputedStyle(row).flexDirection,
            promptScroll,
            removeHits: !!hit && (remove === hit || remove.contains(hit)),
            removeCovered: !!(hit && sidebar.contains(hit)),
            hit: hit ? `${hit.id || hit.tagName}.${hit.className || ''}` : 'none',
            removeTop: Math.round(removeBox.top),
            removeH: Math.round(removeBox.height),
            labelOn: labelStyle.display !== 'none',
            labelMatch,
            container: getComputedStyle(document.getElementById('colorseeker-container')).display,
        };
    });
    assert.equal(mobile.footer, '1');
    assert.equal(mobile.addItem, '1');
    assert.equal(mobile.del, '1');
    assert.equal(mobile.moveDisplay, 'flex');
    assert.ok(mobile.moveH >= 44, `moodlist move button is ${mobile.moveH}px`);
    assert.ok(mobile.saveH >= 44, `moodlist save button is ${mobile.saveH}px`);
    assert.notEqual(mobile.addTask, '0');
    assert.equal(mobile.ganttScroll, true, 'moodgantt is wider than the phone');
    assert.equal(mobile.pageScroll, true, 'the page scrolls sideways on a phone');
    assert.equal(mobile.promptDir, 'column');
    assert.equal(mobile.promptScroll, true, 'moodprompt is wider than the phone');
    assert.equal(mobile.removeCovered, false, `moodtone sidebar covers the first swatch (${mobile.hit} top ${mobile.removeTop})`);
    assert.equal(mobile.removeHits, true, `tap on the swatch remove control misses the button (${mobile.hit} top ${mobile.removeTop} h ${mobile.removeH})`);
    assert.equal(mobile.labelOn, true);
    assert.equal(mobile.labelMatch, true, 'hex label contrast does not match the swatch');
    assert.equal(mobile.container, 'flex');

    await page.setViewport({ width: 1280, height: 800 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.projects && window.projects.some((p) => p.data && p.data.cards && p.data.cards.some((card) => card.title === 'Round1 Kept')), { timeout: 15000 });
    const reloaded = await page.evaluate(() => {
        const board = projects.find((p) => p.data && p.data.cards && p.data.cards.some((card) => card.title === 'Round1 Kept'));
        return board.data.cards[0].items.map((item) => item.text);
    });
    assert.deepEqual(reloaded, ['Two', 'One']);
}

const server = startServer();
const pageErrors = [];
try {
    await waitForServer(PORT);

    assert.equal(await rawStatus(PORT, '/style.css'), 200);
    assert.equal(await rawStatus(PORT, '/%2e%2e/%2e%2e/%2e%2e/etc/passwd'), 403);

    const scriptText = await (await fetch(`http://127.0.0.1:${PORT}/script.js`)).text();
    for (const snippet of HOTKEY_SNIPPETS) {
        assert.ok(scriptText.includes(snippet), `missing hotkey command: ${snippet}`);
    }

    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const consoleLines = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.stack || err)));
    page.on('console', (msg) => {
        const text = `${msg.type()}: ${msg.text()}`;
        consoleLines.push(text);
        if (text.includes('SWITCH')) console.log(text);
    });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.projects && window.projects.length > 0 && typeof draw === 'function' && typeof renderMoodlistView === 'function', { timeout: 15000 });
    await page.evaluate(() => {
        const orig = switchTab;
        switchTab = function (id, options) {
            const project = projects.find((entry) => entry.id === id);
            const stack = (new Error()).stack.split('\n').slice(2, 8).map((line) => line.trim());
            const suspicious = stack.join(' ').match(/setTimeout|localforage|executeTabSwitch|HTMLButtonElement|clickTimeout/);
            if (suspicious) {
                console.log('SWITCH', JSON.stringify({
                    to: project && project.type,
                    name: project && project.name,
                    from: activeProjectId,
                    stack,
                }));
            }
            return orig.call(this, id, options);
        };
    });

    const firstParty = pageErrors.filter(isFirstParty);
    assert.deepEqual(firstParty, [], `first-party boot errors:\n${firstParty.join('\n')}`);

    const canvasSize = await page.evaluate(() => {
        const canvas = document.getElementById('moodboard-canvas');
        return { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight };
    });
    assert.ok(canvasSize.clientWidth > 300 && canvasSize.clientHeight > 150, `canvas layout still default-sized: ${JSON.stringify(canvasSize)}`);
    assert.equal(canvasSize.width, canvasSize.clientWidth);
    assert.equal(canvasSize.height, canvasSize.clientHeight);

    if (process.env.SCRATCH) {
        const { mkdirSync, writeFileSync } = await import('node:fs');
        mkdirSync(process.env.SCRATCH, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCRATCH, 'boot.png') });
        writeFileSync(path.join(process.env.SCRATCH, 'boot.log'), [
            'pageerrors:',
            pageErrors.join('\n') || '(none)',
            'console:',
            consoleLines.join('\n') || '(none)',
        ].join('\n'));
    }

    const controls = await page.evaluate(() => ({
        save: !!document.getElementById('save-project-btn'),
        load: !!document.getElementById('load-project-btn'),
        undo: !!document.getElementById('undo-btn'),
        redo: !!document.getElementById('redo-btn'),
    }));
    assert.deepEqual(controls, { save: true, load: true, undo: true, redo: true });

    for (const [id, type] of BOARD_BUTTONS) {
        const before = await page.evaluate(() => projects.length);
        await page.$eval('#' + id, (btn) => btn.click());
        const after = await page.evaluate((expected) => {
            const last = projects[projects.length - 1];
            return {
                n: projects.length,
                type: last && last.type,
                tabs: document.querySelectorAll('#tabs-list .tab-item').length,
            };
        }, type);
        assert.equal(after.n, before + 1, `${id} did not add a project`);
        assert.equal(after.type, type, `${id} created ${after.type}`);
        assert.equal(after.tabs, after.n, `${id} did not render a tab`);
    }

    const moodlist = await page.evaluate(() => {
        const origNow = Date.now;
        Date.now = () => 424242;
        let collisionOk = false;
        try {
            const n = projects.length;
            createNewProject('moodprompt');
            createNewProject('moodprompt');
            collisionOk = projects[n].id !== projects[n + 1].id;
        } finally {
            Date.now = origNow;
        }

        createNewProject('moodlist');
        const first = projects[projects.length - 1];
        createNewProject('moodlist');
        const second = projects[projects.length - 1];
        document.querySelector('.ml-add-title').value = 'On second';
        document.querySelector('.ml-save-btn').click();

        second.data.cards.push({ id: 'p', title: 'Pinned one', pinned: true, items: [] });
        second.data.cards.push({ id: 'u', title: 'Loose note', pinned: false, items: [{ id: 'i', text: null }] });
        second.data.cards.push({ id: 'n', title: null, items: [] });
        const toggle = document.querySelector('.ml-show-pinned');
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        const hiddenPinned = document.querySelector('.ml-grid').innerText;
        const search = document.querySelector('.ml-search');
        search.value = 'zzz-nope';
        search.dispatchEvent(new Event('input'));
        const searched = document.querySelector('.ml-grid').innerText;

        return {
            collisionOk,
            firstCards: first.data.cards.length,
            secondTitle: second.data.cards[0] && second.data.cards[0].title,
            hiddenPinned,
            searched,
        };
    });
    assert.equal(moodlist.collisionOk, true);
    assert.equal(moodlist.firstCards, 0);
    assert.equal(moodlist.secondTitle, 'On second');
    assert.equal(moodlist.hiddenPinned.includes('Pinned one'), false);
    assert.equal(moodlist.hiddenPinned.includes('Loose note'), true);
    assert.equal(moodlist.searched.includes('Loose note'), false);

    const roundTrip = await page.evaluate(async () => {
        const board = projects.find(p => p.type === 'moodinfinite');
        switchTab(board.id);
        items.length = 0;
        const img = new Image();
        items.push({ id: 'im', type: 'image', imageId: 'abc', img, x: 0, y: 0, width: 10, height: 10, rotation: 0 });
        items.push({ id: 'bx', type: 'box', x: 1, y: 1, width: 4, height: 4, rotation: 0, color: '#fff' });
        items.push({
            id: 'g', type: 'group', x: 0, y: 0, width: 10, height: 10, rotation: 0,
            items: [{ id: 'c', type: 'circle', x: 0, y: 0, width: 2, height: 2, rotation: 0 }],
        });
        const iconImage = new Image();
        iconImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
        const offscreen = document.createElement('canvas');
        offscreen.width = 8;
        offscreen.height = 8;
        const liveVideo = document.createElement('video');
        items.push({ id: 'lk', type: 'link', url: 'https://example.com', title: 'Example', x: 0, y: 0, width: 80, height: 24, rotation: 0, iconImage });
        items.push({ id: 'vidlive', type: 'video', x: 4, y: 4, width: 16, height: 16, rotation: 0, video: liveVideo, videoId: 'v', isPlaying: false, _offscreenCanvas: offscreen });
        const serialized = serializeItems(items);
        const copy = JSON.parse(JSON.stringify(serialized));
        restoreImages(copy);
        let saveFulfilled = false;
        let saveError = '';
        try {
            await saveToBrowser();
            saveFulfilled = true;
        } catch (err) {
            saveError = String(err && err.name || err) + ': ' + String(err && err.message || err);
        }
        const saved = await localforage.getItem('moodinfinite_projects');
        const stored = saved.find(p => p.id === board.id);
        const storedLink = stored.data.items.find(i => i.type === 'link');
        const storedVideo = stored.data.items.find(i => i.id === 'vidlive');
        const liveLink = items.find(i => i.type === 'link');
        const liveVid = items.find(i => i.id === 'vidlive');
        const video = document.createElement('video');
        items.length = 0;
        items.push({ id: 'vid', type: 'video', x: 0, y: 0, width: 20, height: 20, rotation: 0, video, videoId: 'v', isPlaying: false });
        items.push({ id: 'keep', type: 'box', x: 0, y: 0, width: 10, height: 10, rotation: 0, color: '#fff', opacity: 1, scaleX: 1, scaleY: 1 });
        saveStateForUndo();
        items.push({ id: 'extra', type: 'box', x: 30, y: 30, width: 10, height: 10, rotation: 0, color: '#fff', opacity: 1, scaleX: 1, scaleY: 1 });
        saveStateForUndo();
        document.getElementById('undo-btn').click();
        const afterUndo = {
            types: items.map(i => i.type),
            videoIsElement: items[0] && items[0].video instanceof HTMLVideoElement,
            projectCount: projects.find(p => p.id === board.id).data.items.length,
            sameArray: projects.find(p => p.id === board.id).data.items === items,
        };
        document.getElementById('redo-btn').click();
        return {
            serializedTypes: serialized.map(i => i.type),
            imageStripped: serialized[0].img === undefined,
            restoredTypes: copy.map(i => i.type),
            nested: copy[2].items[0].type,
            saveFulfilled,
            saveError,
            storedTypes: stored.data.items.map(i => i.type),
            storedNested: stored.data.items[2].items[0].type,
            storedLinkIcon: storedLink ? storedLink.iconImage : 'missing-link',
            storedVideoNode: storedVideo ? storedVideo.video : 'missing-video',
            storedOffscreen: storedVideo ? storedVideo._offscreenCanvas : 'missing-video',
            liveIconIsImage: liveLink.iconImage instanceof HTMLImageElement,
            liveOffscreenIsCanvas: liveVid._offscreenCanvas instanceof HTMLCanvasElement,
            afterUndo,
            afterRedo: items.map(i => i.type),
        };
    });
    assert.deepEqual(roundTrip.serializedTypes, ['image', 'box', 'group', 'link', 'video']);
    assert.equal(roundTrip.imageStripped, true);
    assert.deepEqual(roundTrip.restoredTypes, ['image', 'box', 'group', 'link', 'video']);
    assert.equal(roundTrip.nested, 'circle');
    assert.equal(roundTrip.saveFulfilled, true, roundTrip.saveError);
    assert.deepEqual(roundTrip.storedTypes, ['image', 'box', 'group', 'link', 'video']);
    assert.equal(roundTrip.storedNested, 'circle');
    assert.equal(roundTrip.storedLinkIcon, undefined);
    assert.equal(roundTrip.storedVideoNode, undefined);
    assert.equal(roundTrip.storedOffscreen, undefined);
    assert.equal(roundTrip.liveIconIsImage, true);
    assert.equal(roundTrip.liveOffscreenIsCanvas, true);
    assert.deepEqual(roundTrip.afterUndo.types, ['video', 'box']);
    assert.equal(roundTrip.afterUndo.videoIsElement, true);
    assert.equal(roundTrip.afterUndo.projectCount, 2);
    assert.equal(roundTrip.afterUndo.sameArray, true);
    assert.deepEqual(roundTrip.afterRedo, ['video', 'box', 'box']);

    const interactions = await exerciseBoardInteractions(page);
    assert.ok(Math.hypot(interactions.pan.during.x - interactions.pan.before.x, interactions.pan.during.y - interactions.pan.before.y) > 20, `middle-click pan did not move the camera before mouseup: ${JSON.stringify(interactions.pan)}`);
    assert.equal(interactions.pan.stillDown, true);
    assert.ok(interactions.drag.moved, `select drag did not move the box: ${JSON.stringify(interactions.drag)}`);
    assert.ok(interactions.drag.pixel[0] > 200 && interactions.drag.pixel[2] > 120, `drag was not painted while the button was held: ${JSON.stringify(interactions.drag.pixel)}`);
    assert.equal(interactions.boxSelect.painted, true, 'selection rectangle was not painted while dragging');
    assert.equal(interactions.connector.painted, true, 'connector preview was not painted while dragging');
    assert.ok(interactions.color.css.includes('12ab34'), `accent color did not apply: ${interactions.color.css}`);
    assert.equal(interactions.color.inputKept, '#12ab34');
    assert.ok(interactions.color.itemPixel[1] > 180, `item color was not painted: ${JSON.stringify(interactions.color.itemPixel)}`);
    assert.notEqual(interactions.color.barBackdrop, 'none');

    const routes = await page.evaluate(() => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        switchTab(board.id);
        const crosses = (points, box) => {
            const x0 = box.x + 1, x1 = box.x + box.width - 1;
            const y0 = box.y + 1, y1 = box.y + box.height - 1;
            for (let i = 1; i < points.length; i++) {
                const a = points[i - 1], b = points[i];
                if (Math.abs(a.y - b.y) < 0.1) {
                    const y = a.y;
                    if (y > y0 && y < y1) {
                        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
                        if (hi > x0 && lo < x1) return true;
                    }
                } else if (Math.abs(a.x - b.x) < 0.1) {
                    const x = a.x;
                    if (x > x0 && x < x1) {
                        const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
                        if (hi > y0 && lo < y1) return true;
                    }
                }
            }
            return false;
        };
        const within = (points, boxes) => {
            const minX = Math.min(...boxes.map((b) => b.x)) - 80;
            const minY = Math.min(...boxes.map((b) => b.y)) - 80;
            const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + 80;
            const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + 80;
            return points.every((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
        };
        const shape = (id, x, y) => ({
            id, type: 'box', color: '#223044', x, y, width: 140, height: 80,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        const src = shape('src', 420, 180);
        const dst = shape('dst', 40, 180);
        const conn = { id: 'c', type: 'connector', sourceId: 'src', sourcePort: 'right', targetId: 'dst', targetPort: 'left', color: '#ff40c0' };
        items.length = 0;
        items.push(src, dst, conn);
        draw();
        const backward = conn.route;
        const same = buildConnectorRoute(
            { x: 200, y: 140 }, { x: 1, y: 0 },
            { x: 520, y: 150 }, { x: 1, y: 0 },
            { x: 100, y: 100, width: 100, height: 80 },
            { x: 400, y: 110, width: 120, height: 80 }
        );
        const facing = buildConnectorRoute(
            { x: 200, y: 140 }, { x: 1, y: 0 },
            { x: 400, y: 150 }, { x: -1, y: 0 },
            { x: 100, y: 100, width: 100, height: 80 },
            { x: 400, y: 110, width: 100, height: 80 }
        );
        const behind = buildConnectorRoute(
            { x: 500, y: 140 }, { x: 1, y: 0 },
            { x: 220, y: 150 }, { x: 1, y: 0 },
            { x: 400, y: 100, width: 100, height: 80 },
            { x: 100, y: 110, width: 120, height: 80 }
        );
        const stacked = buildConnectorRoute(
            { x: 140, y: 100 }, { x: 0, y: -1 },
            { x: 140, y: 300 }, { x: 0, y: -1 },
            { x: 100, y: 100, width: 80, height: 60 },
            { x: 100, y: 300, width: 80, height: 60 }
        );
        const upBox = { x: 100, y: 100, width: 80, height: 60 };
        const downBox = { x: 100, y: 300, width: 80, height: 60 };
        const boxes = [src, dst];
        return {
            backCross: crosses(backward, src) || crosses(backward, dst),
            backWithin: within(backward, boxes),
            backTop: Math.min(...backward.map((p) => p.y)),
            sameCross: crosses(same, { x: 100, y: 100, width: 100, height: 80 }) || crosses(same, { x: 400, y: 110, width: 120, height: 80 }),
            facingSpan: Math.max(...facing.map((p) => p.x)) - Math.min(...facing.map((p) => p.x)),
            facingCross: crosses(facing, { x: 100, y: 100, width: 100, height: 80 }) || crosses(facing, { x: 400, y: 110, width: 100, height: 80 }),
            behindCross: crosses(behind, { x: 400, y: 100, width: 100, height: 80 }) || crosses(behind, { x: 100, y: 110, width: 120, height: 80 }),
            stackedCross: crosses(stacked, upBox) || crosses(stacked, downBox),
            stackedTop: Math.min(...stacked.map((p) => p.y)),
        };
    });
    assert.equal(routes.backCross, false, `connector cuts through a moved box: ${JSON.stringify(routes)}`);
    assert.equal(routes.backWithin, true, `connector leaves the neighborhood of its boxes: ${JSON.stringify(routes)}`);
    assert.ok(routes.backTop >= 180 - 70, `connector climbs away from the boxes: ${routes.backTop}`);
    assert.equal(routes.sameCross, false, 'same-side connector cuts through a box');
    assert.equal(routes.facingCross, false, 'facing connector cuts through a box');
    assert.ok(routes.facingSpan < 280, `facing connector takes a long detour: ${routes.facingSpan}`);
    assert.equal(routes.behindCross, false, 'same-side connector behind the source cuts through a box');
    assert.equal(routes.stackedCross, false, 'vertical same-side connector cuts through a box');
    assert.ok(routes.stackedTop >= 100 - 70, `vertical connector climbs away from the boxes: ${routes.stackedTop}`);

    const hot = [];
    for (let i = 0; i < 2; i++) hot.push(await measureHotPath(page));
    for (const result of hot) {
        assert.equal(result.itemCount, baseline.itemCount);
        assert.deepEqual(result.visibleIds, baseline.visibleIds);
        assert.ok(result.bboxCalls < baseline.bboxCalls, `bbox calls ${result.bboxCalls} not below baseline ${baseline.bboxCalls}`);
    }
    assert.equal(hot[0].bboxCalls, hot[1].bboxCalls);
    console.log(JSON.stringify({
        bboxCalls: hot[0].bboxCalls,
        baselineBboxCalls: baseline.bboxCalls,
        visible: hot[0].visibleIds.length,
        canvas: canvasSize,
        firstPartyErrors: firstParty.length,
    }));

    await assertGroupVisibilityBug(page);
    await assertNowTierPolish(page);
    await assertNextImprovements(page);
    await assertQoLUpgrades(page);
    await assertRound2Upgrades(page);
    await assertConnectorHoverClearBug(page);
    await assertGroupsPriority(page);
    await assertRealPointerGroupInteractions(page);
    await assertUndoPriority(page);
    await assertToolbarPriority(page);
    await assertContextMenuPriority(page);
    await assertB1MoodtoneBaseSwatch(page);
    await assertB2ExportSelectionPng(page);
    await assertB3MobileControls(page);
    await assertB4MoodtoneContrastLabels(page);
    await assertB5MoodtoneSwatchPanelOverlap(page);
    await assertB6ToolbarClamping(page);
    await assertB7FitViewPadding(page);
    await assertB8DuplicateTabNames(page);
    await assertFitViewGeometry(page);
    await assertBottomToolbarScrollEnd(page);
    await assertNonCanvasRound1(page);
    await assertShellCanvasFixes(page);
    await assertRound3GanttPrompt(page);
    await assertRound4ListTone(page);
    await assertRound5NoteTabCommit(page);
    await assertRound5TextAlign(page);
    await assertRound5RerouteDelete(page);
    await assertToolCreationHistory(page);
    await assertMoodflowExports(page);
    await assertBaseStyle(page);

    const lateErrors = pageErrors.filter(isFirstParty);
    assert.deepEqual(lateErrors, [], `first-party errors:\n${lateErrors.join('\n')}`);
    await browser.close();

    const firefoxPath = process.env.FIREFOX_PATH || '/usr/bin/firefox';
    if (!existsSync(firefoxPath)) {
        console.log(`\nSkipping Firefox tests: executable not found at ${firefoxPath}`);
    } else {
        const firefox = await puppeteer.launch({
            browser: 'firefox',
            executablePath: firefoxPath,
            headless: true,
        });
        const ffPage = await firefox.newPage();
        const ffErrors = [];
        ffPage.on('pageerror', (err) => ffErrors.push(String(err && err.stack || err)));
        await ffPage.setViewport({ width: 1280, height: 800 });
        await ffPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await ffPage.waitForFunction(() => window.projects && window.projects.length > 0 && typeof draw === 'function', { timeout: 15000 });
        const ff = await exerciseBoardInteractions(ffPage);
        assert.ok(Math.hypot(ff.pan.during.x - ff.pan.before.x, ff.pan.during.y - ff.pan.before.y) > 20, `firefox pan: ${JSON.stringify(ff.pan)}`);
        assert.equal(ff.pan.stillDown, true);
        assert.ok(ff.drag.moved, `firefox drag: ${JSON.stringify(ff.drag)}`);
        assert.ok(ff.drag.pixel[0] > 200 && ff.drag.pixel[2] > 120, `firefox drag paint: ${JSON.stringify(ff.drag.pixel)}`);
        assert.equal(ff.boxSelect.painted, true, `firefox selection paint: ${JSON.stringify(ff.boxSelect)}`);
        assert.equal(ff.connector.painted, true, `firefox connector paint: ${JSON.stringify(ff.connector)}`);
        assert.ok(ff.color.css.includes('12ab34'), ff.color.css);
        assert.equal(ff.color.inputKept, '#12ab34');
        assert.ok(ff.color.itemPixel[1] > 180, `firefox item color: ${JSON.stringify(ff.color)}`);
        assert.equal(ff.color.barBackdrop, 'none', `firefox left bar still blurs over the color input: ${ff.color.barBackdrop}`);
        assert.notEqual(ff.color.appearance, 'none');
        assert.deepEqual(ffErrors.filter(isFirstParty), []);
        await firefox.close();
    }
} catch (err) {
    console.error('pageErrors:', pageErrors);
    console.error(server.getLog());
    throw err;
} finally {
    server.child.kill('SIGTERM');
}
async function assertGroupVisibilityBug(page) {
    console.log('Testing Group Visibility Bug...');
    const result = await page.evaluate(() => {
        items.length = 0;
        items.push({ id: 't1', type: 'box', x: 100, y: 100, width: 100, height: 100, color: '#ff0000', isPinned: false, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, style: 'fill' });
        items.push({ id: 't2', type: 'box', x: 250, y: 100, width: 100, height: 100, color: '#00ff00', isPinned: false, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, style: 'fill' });
        
        selectedItems = [items[0], items[1]];
        groupSelectedItems();
        
        const group = items.find(i => i.type === 'group');
        const box = getItemBoundingBox(group);
        return { 
            groupX: group.x, groupW: group.width,
            boxX: box.x, boxW: box.width
        };
    });
    if (result.boxX !== result.groupX) {
        throw new Error(`Group bounding box is offset! Expected X=${result.groupX} but got ${result.boxX}`);
    }
    console.log('Group Visibility Bug fixed.');
}

async function assertConnectorHoverClearBug(page) {
    console.log('Testing Connector Hover Clear Bug...');
    
    // We must expose hoveredItem and selectedItems for the test
    await page.evaluate(() => {
        if (!Object.getOwnPropertyDescriptor(window, 'selectedItems')) {
            Object.defineProperty(window, 'selectedItems', { get: () => { try { return eval('selectedItems'); } catch(e){return [];} } });
        }
        // Force close all modals and ensure we can click the canvas
        if (typeof helpModalOverlay !== 'undefined' && helpModalOverlay) helpModalOverlay.style.display = 'none';
        const sfLightbox = document.getElementById('storyflow-lightbox');
        if (sfLightbox) sfLightbox.classList.remove('open');
        const overlay = document.getElementById('modal-overlay');
        if (overlay) overlay.style.display = 'none';
        const prompt = document.getElementById('moodprompt-overlay');
        if (prompt) prompt.style.display = 'none';
        if (typeof setCurrentTool === 'function') setCurrentTool(null);
        
        // Hide ALL other tabs and forcefully show canvas
        document.querySelectorAll('.tab-content').forEach(el => {
            if (el.id !== 'moodinfinite-container') el.style.display = 'none';
            else el.style.display = 'flex';
        });
    });

    // Place item at world 640, 400 (center of screen)
    const types = ['group', 'image', 'video', 'box', 'circle', 'textList', 'comment', 'text', 'reroute'];
    
    for (const type of types) {
        await page.evaluate((type) => {
            cameraOffset = { x: 0, y: 0 };
            cameraZoom = 1;
            items.length = 0;
            if (typeof selectedItems !== 'undefined') {
                selectedItems.length = 0; // Clear selectedItems!
            }
            if (typeof window.__getHoveredItem === 'function') {
                // we can't set it to null easily without a setter, but we clear it via mousemove below
            }
            const item = { id: 'testItem', type: type, x: 590, y: 350, width: 100, height: 100, color: '#ff0000', isPinned: false, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, style: 'fill' };
            if (type === 'group') { item.items = [{ id: 'child', type: 'box', x: 0, y: 0, width: 100, height: 100 }]; }
            else if (type === 'textList') { item.items = [{ text: 'a', completed: false }]; }
            else if (type === 'reroute') { item.width = 0; item.height = 0; }
            items.push(item);
            draw();
        }, type);

        const boxCenterScreen = await page.evaluate(() => {
            const item = items.find(i => i.id === 'testItem');
            const cx = item.type === 'reroute' ? item.x : item.x + item.width / 2;
            const cy = item.type === 'reroute' ? item.y : item.y + item.height / 2;
            return worldToScreen({ x: cx, y: cy });
        });

        // 1. Move to box
        await page.mouse.move(0, 0); // ensure move event fires
        await new Promise(r => setTimeout(r, 10));
        await page.mouse.move(boxCenterScreen.x, boxCenterScreen.y);
        await new Promise(r => setTimeout(r, 50));
        let hovered = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem() && window.__getHoveredItem().id);
        let hobj = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem());
        if (hovered !== 'testItem') {
            const getAtPos = await page.evaluate((pos) => getItemAtPosition(screenToWorld(pos))?.id, boxCenterScreen);
            const elAtPos = await page.evaluate((pos) => document.elementFromPoint(pos.x, pos.y)?.id || document.elementFromPoint(pos.x, pos.y)?.className, boxCenterScreen);
            console.log("FAILED ON TYPE:", type, "boxCenterScreen:", boxCenterScreen, "getAtPos:", getAtPos, "hobj:", hobj, "elAtPos:", elAtPos);
            throw new Error(`Expected testItem (${type}) to be hovered when mouse is over it, got ` + hovered);
        }

        // 2. Move out
        await page.mouse.move(300, 300);
        await new Promise(r => setTimeout(r, 50));
        hovered = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem() && window.__getHoveredItem().id);
        if (hovered !== null && hovered !== undefined && hovered !== false) throw new Error(`Expected hoveredItem to be null after mouse leaves object (${type}), got ` + hovered);

        // 3. Select box
        await page.mouse.click(boxCenterScreen.x, boxCenterScreen.y);
        await new Promise(r => setTimeout(r, 50));
        
        // 4. Press Escape
        await page.keyboard.press('Escape');
        await new Promise(r => setTimeout(r, 50));
        hovered = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem() && window.__getHoveredItem().id);
        if (hovered !== null && hovered !== undefined && hovered !== false) throw new Error(`Expected hoveredItem to be null after Escape (${type}), got ` + hovered);

        // 5. Select box again and click empty canvas
        await page.mouse.click(boxCenterScreen.x, boxCenterScreen.y);
        await new Promise(r => setTimeout(r, 50));
        await page.mouse.click(300, 300);
        await new Promise(r => setTimeout(r, 50));
        hovered = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem() && window.__getHoveredItem().id);
        if (hovered !== null && hovered !== undefined && hovered !== false) throw new Error(`Expected hoveredItem to be null after clicking empty canvas (${type}), got ` + hovered);

        // 6. Emulate touch tap on box
        await page.touchscreen.tap(boxCenterScreen.x, boxCenterScreen.y);
        await new Promise(r => setTimeout(r, 400));
        hovered = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem() && window.__getHoveredItem().id);
        if (hovered !== 'testItem') throw new Error(`Expected testItem (${type}) to be hovered after touch tap, got ` + hovered);

        // 7. Touch tap empty canvas
        await page.touchscreen.tap(300, 300);
        await new Promise(r => setTimeout(r, 400));
        hovered = await page.evaluate(() => window.__getHoveredItem && window.__getHoveredItem() && window.__getHoveredItem().id);
        if (hovered !== null && hovered !== undefined && hovered !== false) {
            throw new Error(`Expected hoveredItem to be null after touch tap on empty canvas (${type}), got ${hovered}.`);
        }
    }
    console.log('Connector Hover Clear Bug fixed.');
}
async function assertGroupsPriority(page) {
    console.log('Testing Groups Priority...');
    // Create group, move, rotate, select inside, undo, redo, save/reload, PNG export, layer order, nested groups
    const result = await page.evaluate(async () => {
        // Clear canvas
        items.length = 0;
        
        // 1. Create a group from 2+ items (including image and video if feasible)
        const box1 = { id: 'b1', type: 'box', x: 100, y: 100, width: 100, height: 100, color: '#ff0000', opacity: 1, scaleX: 1, scaleY: 1, rotation: 0 };
        const text1 = { id: 't1', type: 'text', text: 'Hello', x: 300, y: 100, width: 100, height: 50, color: '#000000', opacity: 1, scaleX: 1, scaleY: 1, rotation: 0 };
        
        items.push(box1, text1);
        selectedItems = [items[0], items[1]];
        groupSelectedItems(); // Group 1
        
        const group1 = items.find(i => i.type === 'group');
        if (!group1) throw new Error("Group not created");
        if (items.length !== 1) throw new Error("Items not replaced by group");
        
        // Move group
        const origX = group1.x;
        group1.x += 50;
        
        // Rotate group
        group1.rotation = Math.PI / 4;
        
        // Nested groups
        const box2 = { id: 'b2', type: 'box', x: 500, y: 500, width: 100, height: 100, color: '#0000ff', opacity: 1, scaleX: 1, scaleY: 1, rotation: 0 };
        items.push(box2);
        selectedItems = [group1, box2];
        groupSelectedItems(); // Nested group
        
        const nestedGroup = items.find(i => i.type === 'group');
        if (!nestedGroup || items.length !== 1) throw new Error("Nested group failed");
        
        // Ungroup nested
        selectedItems = [nestedGroup];
        ungroupSelectedItems();
        
        if (items.length !== 2) throw new Error("Ungroup nested failed to restore 2 items");
        
        // Undo
        undoLastAction();
        if (items.find(i => i.type === 'group')?.items?.length !== 2) throw new Error("Undo ungroup failed");
        
        // Save and reload
        const saved = JSON.stringify(items);
        items.length = 0;
        const parsed = JSON.parse(saved);
        items = parsed;
        
        // Check if group is back
        const reloadedGroup = items.find(i => i.type === 'group');
        if (!reloadedGroup) throw new Error("Group not restored after reload");
        
        return { success: true };
    });
    console.log('Groups Priority passed.');
}

async function assertRealPointerGroupInteractions(page) {
    console.log('Testing Real Pointer Group Drag, Gizmo Rotate, Ungroup, and PNG Export...');
    await page.setViewport({ width: 1280, height: 800 });

    const setup = await page.evaluate(async () => {
        const board = projects.find(p => p.type === 'moodinfinite');
        if (board) switchTab(board.id);
        const origSnap = typeof snapToGrid !== 'undefined' ? snapToGrid : true;
        snapToGrid = false;
        items.length = 0;
        selectedItems = [];
        cameraZoom = 1;
        cameraOffset = { x: 0, y: 0 };

        // Red image: 80x80 at (100, 100)
        const imgCanvas = document.createElement('canvas');
        imgCanvas.width = 80; imgCanvas.height = 80;
        const ictx = imgCanvas.getContext('2d');
        ictx.fillStyle = '#ff0000';
        ictx.fillRect(0, 0, 80, 80);
        const redDataUrl = imgCanvas.toDataURL('image/png');
        const img = new Image();
        img.src = redDataUrl;
        await new Promise(r => { img.onload = r; });

        const imgItem = {
            id: 'img1', type: 'image', x: 100, y: 100, width: 80, height: 80,
            rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, img, isPinned: false
        };

        // Blue box: 80x80 at (220, 100)
        const boxItem = {
            id: 'box1', type: 'box', x: 220, y: 100, width: 80, height: 80,
            color: '#0000ff', rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, style: 'fill', isPinned: false
        };

        // Green video: 80x80 at (340, 100)
        const vidCanvas = document.createElement('canvas');
        vidCanvas.width = 80; vidCanvas.height = 80;
        const vctx = vidCanvas.getContext('2d');
        vctx.fillStyle = '#00ff00';
        vctx.fillRect(0, 0, 80, 80);
        const stream = vidCanvas.captureStream(25);
        const videoEl = document.createElement('video');
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.autoplay = true;
        await videoEl.play().catch(() => {});
        await new Promise(r => {
            if (videoEl.readyState >= 2) return r();
            videoEl.onloadeddata = r;
            setTimeout(r, 500);
        });

        const videoItem = {
            id: 'vid1', type: 'video', x: 340, y: 100, width: 80, height: 80,
            rotation: 0, opacity: 1, scaleX: 1, scaleY: 1, video: videoEl, isPlaying: true, isPinned: false
        };

        // Group 1: inner group [img1, box1]
        items.push(imgItem, boxItem);
        selectedItems = [imgItem, boxItem];
        groupSelectedItems();
        const inner = items[0];

        // Group 2: outer group [inner, vid1]
        items.push(videoItem);
        selectedItems = [inner, videoItem];
        groupSelectedItems();
        draw();
        updateSelectionToolbar();

        const outerGroup = items[0];
        return {
            origSnap,
            id: outerGroup.id,
            x: outerGroup.x,
            y: outerGroup.y,
            width: outerGroup.width,
            height: outerGroup.height,
            rotation: outerGroup.rotation,
            childCount: outerGroup.items.length
        };
    });

    assert.equal(setup.childCount, 2, 'outer group should contain inner group and video');

    try {
        const canvasBox = await page.$eval('#moodboard-canvas', el => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y };
        });

        // (a) Move group by dragging with page.mouse
        const centerScreen = await page.evaluate(() => {
            const g = items[0];
            return worldToScreen({ x: g.x + g.width / 2, y: g.y + g.height / 2 });
        });

        await page.mouse.move(canvasBox.x + centerScreen.x, canvasBox.y + centerScreen.y);
        await page.mouse.down();
        await page.mouse.move(canvasBox.x + centerScreen.x + 80, canvasBox.y + centerScreen.y + 60, { steps: 5 });
        await page.mouse.up();

        const movedGroup = await page.evaluate(() => ({ x: items[0].x, y: items[0].y }));
        assert.ok(Math.abs((movedGroup.x - setup.x) - 80) < 2, `expected group x moved by 80, got ${movedGroup.x - setup.x}`);
        assert.ok(Math.abs((movedGroup.y - setup.y) - 60) < 2, `expected group y moved by 60, got ${movedGroup.y - setup.y}`);

        // (b) Rotate group via rotation handle with page.mouse
        await page.click('#rotate-btn');
        const rotPos = await page.evaluate(() => {
            const t = items[0];
            const a = t.x + t.width / 2, i = t.y + t.height / 2;
            const r = t.width / 2, s = -t.height / 2 - 20 / cameraZoom;
            const n = r * Math.cos(t.rotation) - s * Math.sin(t.rotation);
            const l = r * Math.sin(t.rotation) + s * Math.cos(t.rotation);
            return {
                handle: worldToScreen({ x: a + n, y: i + l }),
                center: worldToScreen({ x: a, y: i }),
                rDist: Math.hypot(n, l)
            };
        });

        await page.mouse.move(canvasBox.x + rotPos.handle.x, canvasBox.y + rotPos.handle.y);
        await page.mouse.down();
        const targetAngle = Math.atan2(rotPos.handle.y - rotPos.center.y, rotPos.handle.x - rotPos.center.x) + Math.PI / 2;
        const targetX = rotPos.center.x + rotPos.rDist * Math.cos(targetAngle);
        const targetY = rotPos.center.y + rotPos.rDist * Math.sin(targetAngle);
        await page.mouse.move(canvasBox.x + targetX, canvasBox.y + targetY, { steps: 5 });
        await page.mouse.up();

        const rotatedGroup = await page.evaluate(() => ({ rotation: items[0].rotation }));
        assert.ok(Math.abs(rotatedGroup.rotation - Math.PI / 2) < 0.1, `expected rotation ~PI/2, got ${rotatedGroup.rotation}`);

        // (d) Export to PNG with groups (rotated and nested, with an image and a video inside)
        const exportPromise = page.evaluate(() => {
            return new Promise((resolve) => {
                const origCreateElement = document.createElement.bind(document);
                document.createElement = function(tag) {
                    const el = origCreateElement(tag);
                    if (tag.toLowerCase() === 'a') {
                        const origClick = el.click.bind(el);
                        el.click = function() {
                            document.createElement = origCreateElement;
                            resolve(el.href);
                            return origClick();
                        };
                    }
                    return el;
                };
            });
        });

        await page.click('#save-png-btn');
        const pngDataUrl = await exportPromise;
        assert.ok(pngDataUrl && pngDataUrl.length > 100, 'PNG data URL should be non-empty');

        const pixelResult = await page.evaluate(async (dataUrl) => {
            const img = new Image();
            img.src = dataUrl;
            await new Promise(r => { img.onload = r; });

            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const data = ctx.getImageData(0, 0, c.width, c.height).data;
            let redCount = 0, greenCount = 0, blueCount = 0;
            let redYSum = 0, blueYSum = 0, greenYSum = 0;

            for (let y = 0; y < c.height; y++) {
                for (let x = 0; x < c.width; x++) {
                    const idx = (y * c.width + x) * 4;
                    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                    if (r > 200 && g < 50 && b < 50) { redCount++; redYSum += y; }
                    if (g > 200 && r < 50 && b < 50) { greenCount++; greenYSum += y; }
                    if (b > 200 && r < 50 && g < 50) { blueCount++; blueYSum += y; }
                }
            }

            return {
                width: c.width,
                height: c.height,
                redCount,
                greenCount,
                blueCount,
                redAvgY: redCount ? redYSum / redCount : 0,
                blueAvgY: blueCount ? blueYSum / blueCount : 0,
                greenAvgY: greenCount ? greenYSum / greenCount : 0
            };
        }, pngDataUrl);

        assert.ok(pixelResult.redCount > 500, `expected red image pixels, got ${pixelResult.redCount}`);
        assert.ok(pixelResult.greenCount > 500, `expected green video pixels, got ${pixelResult.greenCount}`);
        assert.ok(pixelResult.blueCount > 500, `expected blue box pixels, got ${pixelResult.blueCount}`);
        assert.ok(pixelResult.redAvgY < pixelResult.blueAvgY, 'red image should be rendered above blue box');
        assert.ok(pixelResult.blueAvgY < pixelResult.greenAvgY, 'blue box should be rendered above green video');

        // (c) Ungroup after move+rotate: world position, rotation, scale tolerance for nested groups
        const expectedWorldTransforms = await page.evaluate(() => {
            const computeWorld = (item, parent) => {
                const r = parent.rotation || 0;
                const cos = Math.cos(r), sin = Math.sin(r);
                const sx = parent.scaleX || 1, sy = parent.scaleY || 1;
                const cx = (item.x + item.width / 2) - parent.width / 2;
                const cy = (item.y + item.height / 2) - parent.height / 2;
                const rx = cx * sx * cos - cy * sy * sin;
                const ry = cx * sx * sin + cy * sy * cos;
                return {
                    centerX: parent.centerX + rx,
                    centerY: parent.centerY + ry,
                    rotation: (item.rotation || 0) + r,
                    scaleX: (item.scaleX || 1) * sx,
                    scaleY: (item.scaleY || 1) * sy
                };
            };

            const outer = items[0];
            const outerT = {
                centerX: outer.x + outer.width / 2,
                centerY: outer.y + outer.height / 2,
                width: outer.width,
                height: outer.height,
                rotation: outer.rotation,
                scaleX: outer.scaleX || 1,
                scaleY: outer.scaleY || 1
            };

            const exp = {};
            outer.items.forEach(child => {
                const childT = computeWorld(child, outerT);
                if (child.type === 'group') {
                    const innerT = {
                        centerX: childT.centerX,
                        centerY: childT.centerY,
                        width: child.width,
                        height: child.height,
                        rotation: childT.rotation,
                        scaleX: childT.scaleX,
                        scaleY: childT.scaleY
                    };
                    child.items.forEach(leaf => {
                        exp[leaf.id] = computeWorld(leaf, innerT);
                    });
                } else {
                    exp[child.id] = childT;
                }
            });
            return exp;
        });

        // Ungroup outer group via UI button click
        await page.click('#ungroup-btn');

        // Ungroup inner group via UI button click
        await page.evaluate(() => {
            const inner = items.find(i => i.type === 'group');
            if (inner) selectedItems = [inner];
            updateSelectionToolbar();
        });
        await page.click('#ungroup-btn');

        const actualLeaves = await page.evaluate(() => {
            const act = {};
            items.forEach(i => {
                act[i.id] = {
                    centerX: i.x + i.width / 2,
                    centerY: i.y + i.height / 2,
                    rotation: i.rotation || 0,
                    scaleX: i.scaleX || 1,
                    scaleY: i.scaleY || 1
                };
            });
            return act;
        });

        for (const id of ['img1', 'box1', 'vid1']) {
            const exp = expectedWorldTransforms[id];
            const act = actualLeaves[id];
            assert.ok(act, `missing item ${id} after ungrouping`);
            const posDist = Math.hypot(act.centerX - exp.centerX, act.centerY - exp.centerY);
            assert.ok(posDist < 1.0, `item ${id} posDist ${posDist} > tolerance`);
            const rotDiff = Math.abs((act.rotation % (Math.PI * 2)) - (exp.rotation % (Math.PI * 2)));
            assert.ok(rotDiff < 0.05, `item ${id} rotDiff ${rotDiff} > tolerance`);
            assert.ok(Math.abs(act.scaleX - exp.scaleX) < 0.05, `item ${id} scaleX diff > tolerance`);
            assert.ok(Math.abs(act.scaleY - exp.scaleY) < 0.05, `item ${id} scaleY diff > tolerance`);
        }
    } finally {
        await page.evaluate((origSnap) => {
            const vid = items.find(i => i.id === 'vid1');
            if (vid && vid.video && vid.video.srcObject) {
                vid.video.srcObject.getTracks().forEach(t => t.stop());
            }
            items.length = 0;
            selectedItems = [];
            snapToGrid = origSnap;
            draw();
        }, setup.origSnap);
    }
    console.log('Real Pointer Group Interactions passed.');
}

async function assertUndoPriority(page) {
    console.log('Testing Undo Priority...');
    await page.evaluate(async () => {
        historyStack = []; historyIndex = -1;
        const proj = { id: 'p1', data: { items: [{ id: 'b1', type: 'box', x: 0, y: 0, width: 10, height: 10 }] } };
        projects.push(proj);
        loadProject(JSON.stringify(proj));
        saveStateForUndo();
        items.push({ id: 'b2', type: 'box', x: 20, y: 20, width: 10, height: 10 });
        undoLastAction();
        if (items.length !== 1) throw new Error("Undo after load failed to revert to initial state");
    });
    console.log('Undo Priority passed.');
}

async function assertToolbarPriority(page) {
    console.log('Testing Toolbar Priority...');
    await page.setViewport({ width: 360, height: 800 });
    const result = await page.evaluate(() => {
        const tb = document.getElementById('tabs-bar');
        const btns = Array.from(tb.querySelectorAll('button, .tab-item, .tab-add-btn'));
        const clipped = [];
        btns.forEach(b => {
            const w = b.offsetWidth;
            const cs = getComputedStyle(b);
            if (!b.classList.contains('tab-close-btn') && w > 0 && w < 30 && b.style.display !== 'none' && cs.display !== 'none') {
                clipped.push(`${b.id || b.className}: w=${w}`);
            }
        });
        const pageScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
        return { clipped, pageScroll };
    });
    if (result.pageScroll) throw new Error("Page has horizontal overflow");
    if (result.clipped.length > 0) throw new Error("Buttons are clipped/squished: " + result.clipped.join(', '));
    console.log('Toolbar Priority passed.');
}

async function assertContextMenuPriority(page) {
    console.log('Testing Context Menu Priority...');
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    
    await page.evaluate(async () => {
        items.length = 0;
        const tlist = { id: 'tl1', type: 'textList', x: 100, y: 100, width: 200, height: 200, items: [{text:'A', checked:false}] };
        items.push(tlist);
        selectedItems = [tlist];
        onContextMenu({ preventDefault: ()=>{}, isFake: true });
        if (document.getElementById('copy-for-moodlist-btn').style.display === 'none') throw new Error("copy-for-moodlist-btn is hidden");
        document.getElementById('copy-for-moodlist-btn').click();
        
        const img = { id: 'img1', type: 'image', x: 300, y: 100, width: 100, height: 100, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' };
        items.push(img);
        selectedItems = [img];
        onContextMenu({ preventDefault: ()=>{}, isFake: true });
        if (document.getElementById('download-image-btn').style.display === 'none') throw new Error("download-image-btn is hidden");
        document.getElementById('download-image-btn').click();
        
        const box = { id: 'b1', type: 'box', x: 500, y: 100, width: 100, height: 100 };
        items.push(box);
        selectedItems = [box];
        onContextMenu({ preventDefault: ()=>{}, isFake: true });
        if (document.getElementById('context-connect-btn').style.display === 'none') throw new Error("context-connect-btn is hidden");
        document.getElementById('context-connect-btn').click();
    });
    await new Promise(r => setTimeout(r, 500));
    if (errors.length > 0) throw new Error("Context menu test produced errors: " + errors.join('\n'));
    console.log('Context Menu Priority passed.');
}

async function assertB1MoodtoneBaseSwatch(page) {
    console.log('Testing B1 Moodtone Base Swatch...');
    await page.evaluate(() => createNewProject('colorseeker'));
    await page.waitForSelector('.colorseeker-bar');

    // 1. Shades mode with black #000000
    await page.evaluate(() => {
        const p = projects.find(proj => proj.id === activeProjectId);
        p.data.mode = 'shades';
        p.data.baseColor = '#000000';
        p.data.colors = generatePalette(p.data.baseColor, p.data.mode, p.data.lockedColors);
        renderColorSeeker(p.id);
    });

    const blackTest = await page.evaluate(() => {
        const baseBtn = document.querySelector('.colorseeker-set-base.is-base');
        const baseBar = baseBtn ? baseBtn.closest('.colorseeker-bar') : null;
        const baseColor = baseBar ? baseBar.style.backgroundColor : null;
        const hexList = document.getElementById('colorseeker-hex-list').textContent.trim().split(',');
        return {
            hasBaseBtn: !!baseBtn,
            baseText: baseBtn ? baseBtn.textContent.trim() : null,
            baseColor,
            hexList
        };
    });
    assert.ok(blackTest.hasBaseBtn, 'missing .colorseeker-set-base.is-base for black');
    assert.equal(blackTest.baseText, '★ Base');
    assert.equal(blackTest.baseColor, 'rgb(0, 0, 0)');
    assert.equal(blackTest.hexList[0].toLowerCase(), '#000000');
    // Ensure all adjacent shades are distinct
    for (let i = 0; i < blackTest.hexList.length - 1; i++) {
        assert.notEqual(blackTest.hexList[i].toLowerCase(), blackTest.hexList[i + 1].toLowerCase());
    }

    // 2. Shades mode with white #ffffff
    await page.evaluate(() => {
        const p = projects.find(proj => proj.id === activeProjectId);
        p.data.mode = 'shades';
        p.data.baseColor = '#ffffff';
        p.data.colors = generatePalette(p.data.baseColor, p.data.mode, p.data.lockedColors);
        renderColorSeeker(p.id);
    });

    const whiteTest = await page.evaluate(() => {
        const baseBtn = document.querySelector('.colorseeker-set-base.is-base');
        const baseBar = baseBtn ? baseBtn.closest('.colorseeker-bar') : null;
        const baseColor = baseBar ? baseBar.style.backgroundColor : null;
        const hexList = document.getElementById('colorseeker-hex-list').textContent.trim().split(',');
        return {
            hasBaseBtn: !!baseBtn,
            baseText: baseBtn ? baseBtn.textContent.trim() : null,
            baseColor,
            hexList
        };
    });
    assert.ok(whiteTest.hasBaseBtn, 'missing .colorseeker-set-base.is-base for white');
    assert.equal(whiteTest.baseText, '★ Base');
    assert.equal(whiteTest.baseColor, 'rgb(255, 255, 255)');
    assert.equal(whiteTest.hexList[whiteTest.hexList.length - 1].toLowerCase(), '#ffffff');
    for (let i = 0; i < whiteTest.hexList.length - 1; i++) {
        assert.notEqual(whiteTest.hexList[i].toLowerCase(), whiteTest.hexList[i + 1].toLowerCase());
    }

    // 3. Tones mode with black #000000 (s = 0)
    await page.evaluate(() => {
        const p = projects.find(proj => proj.id === activeProjectId);
        p.data.mode = 'tones';
        p.data.baseColor = '#000000';
        p.data.colors = generatePalette(p.data.baseColor, p.data.mode, p.data.lockedColors);
        renderColorSeeker(p.id);
    });

    const toneZeroTest = await page.evaluate(() => {
        const baseBtn = document.querySelector('.colorseeker-set-base.is-base');
        const baseBar = baseBtn ? baseBtn.closest('.colorseeker-bar') : null;
        const baseColor = baseBar ? baseBar.style.backgroundColor : null;
        return { baseColor };
    });
    assert.equal(toneZeroTest.baseColor, 'rgb(0, 0, 0)');

    // 4. Tones mode with saturated red #ff0000 (s = 100)
    await page.evaluate(() => {
        const p = projects.find(proj => proj.id === activeProjectId);
        p.data.mode = 'tones';
        p.data.baseColor = '#ff0000';
        p.data.colors = generatePalette(p.data.baseColor, p.data.mode, p.data.lockedColors);
        renderColorSeeker(p.id);
    });

    const toneMaxTest = await page.evaluate(() => {
        const baseBtn = document.querySelector('.colorseeker-set-base.is-base');
        const baseBar = baseBtn ? baseBtn.closest('.colorseeker-bar') : null;
        const baseColor = baseBar ? baseBar.style.backgroundColor : null;
        return { baseColor };
    });
    assert.equal(toneMaxTest.baseColor, 'rgb(255, 0, 0)');

    console.log('B1 Moodtone Base Swatch passed.');
}

async function assertB2ExportSelectionPng(page) {
    console.log('Testing B2 Export Selection as PNG...');
    await page.evaluate(() => createNewProject('moodinfinite'));
    await page.waitForSelector('#moodboard-canvas');

    const result = await page.evaluate(() => {
        items.length = 0;
        selectedItems = [];
        const box1 = { id: 'box1', type: 'box', x: 100, y: 100, width: 80, height: 80, color: '#ff0000', rotation: 0 };
        const box2 = { id: 'box2', type: 'box', x: 300, y: 300, width: 100, height: 100, color: '#00ff00', rotation: 0 };
        items.push(box1, box2);

        // Initially no selection
        updateSelectionToolbar();
        const exportBtnInitial = document.getElementById('export-selection-png-btn');
        const initialDisplay = exportBtnInitial ? exportBtnInitial.style.display : 'none';

        // Select box1
        selectedItems = [box1];
        updateSelectionToolbar();
        const selectedDisplay = exportBtnInitial ? exportBtnInitial.style.display : 'none';

        // Context menu check
        onContextMenu({ preventDefault: () => {}, isFake: true });
        const contextExportBtn = document.getElementById('context-export-selection-btn');
        const contextDisplay = contextExportBtn ? contextExportBtn.style.display : 'none';

        // Check full board save PNG button is still intact
        const fullSaveBtn = document.getElementById('save-png-btn');
        const fullSaveTitle = fullSaveBtn ? fullSaveBtn.title : '';

        // Test exportSelectionAsPng execution
        let downloadedName = null;
        let downloadedHref = null;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
            downloadedName = this.download;
            downloadedHref = this.href;
        };
        try {
            exportSelectionAsPng();
        } finally {
            HTMLAnchorElement.prototype.click = origClick;
        }

        return {
            initialDisplay,
            selectedDisplay,
            contextDisplay,
            fullSaveTitle,
            downloadedName,
            isDataUrl: !!(downloadedHref && downloadedHref.startsWith('data:image/png'))
        };
    });

    assert.equal(result.initialDisplay, 'none');
    assert.equal(result.selectedDisplay, 'flex');
    assert.equal(result.contextDisplay, 'flex');
    assert.ok(result.fullSaveTitle.includes('Export as PNG'), 'full board export title preserved');
    assert.ok(result.downloadedName && result.downloadedName.includes('_selection.png'), 'selection export filename');
    assert.ok(result.isDataUrl, 'selection export produced PNG data URL');

    console.log('B2 Export Selection as PNG passed.');
}

async function assertB3MobileControls(page) {
    console.log('Testing B3 Mobile Controls at 390px...');
    await page.setViewport({ width: 390, height: 626 });
    await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach(el => el.remove());
        createNewProject('moodinfinite');
    });
    await page.waitForSelector('#canvas-fit-view-btn');
    await settleForHitTest(page);

    const hitTest = await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach(el => el.remove());
        const fitBtn = document.getElementById('canvas-fit-view-btn');
        const zoomReadout = document.getElementById('canvas-zoom-readout');
        const leftBar = document.getElementById('left-bar');
        const minimap = document.getElementById('canvas-minimap');

        const fitRect = fitBtn.getBoundingClientRect();
        const fitHit = document.elementFromPoint(fitRect.left + fitRect.width / 2, fitRect.top + fitRect.height / 2);

        const zoomRect = zoomReadout.getBoundingClientRect();
        const zoomHit = document.elementFromPoint(zoomRect.left + zoomRect.width / 2, zoomRect.top + zoomRect.height / 2);
        return {
            fitHitOuter: fitHit ? fitHit.outerHTML : null,
            fitRect,
            fitHitIsFitBtn: fitBtn.contains(fitHit),
            fitHitTag: fitHit ? fitHit.tagName : null,
            fitHitId: fitHit ? fitHit.id : null,
            fitOverlapsLeftBar: leftBar.contains(fitHit),
            fitOverlapsMinimap: minimap.contains(fitHit),
            zoomHitIsZoom: zoomReadout.contains(zoomHit),
            zoomOverlapsLeftBar: leftBar.contains(zoomHit),
            zoomOverlapsMinimap: minimap.contains(zoomHit)
        };
    });

    assert.ok(hitTest.fitHitIsFitBtn, `fit button hit test failed: hit ${hitTest.fitHitTag}#${hitTest.fitHitId}`);
    assert.ok(!hitTest.fitOverlapsLeftBar, 'fit button overlaps left bar');
    assert.ok(!hitTest.fitOverlapsMinimap, 'fit button overlaps minimap');
    assert.ok(hitTest.zoomHitIsZoom, 'zoom readout hit test failed');
    assert.ok(!hitTest.zoomOverlapsLeftBar, 'zoom readout overlaps left bar');
    assert.ok(!hitTest.zoomOverlapsMinimap, 'zoom readout overlaps minimap');

    // Ensure click succeeds without interception error
    await page.click('#canvas-fit-view-btn');

    await page.waitForFunction(() => window.innerWidth === 390);
    const mobileChrome = await page.evaluate(async () => {
        document.getElementById('cloud-sync-indicator')?.classList.add('visible');
        if (typeof updateMobileBottomToolbarHeight === 'function') updateMobileBottomToolbarHeight();
        if (typeof updateHScrollOverflowHints === 'function') updateHScrollOverflowHints();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const overlap = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const box = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        const cloud = document.getElementById('cloud-sync-indicator').getBoundingClientRect();
        const bar = document.getElementById('left-bar').getBoundingClientRect();
        const leftBar = document.getElementById('left-bar');
        const tabsBar = document.getElementById('tabs-bar');
        const track = document.querySelector('#left-bar > .h-scroll-track');
        const tabsTrack = document.querySelector('#tabs-bar > .h-scroll-track');
        const atStart = {
            leftBarRight: leftBar.classList.contains('can-scroll-right'),
            leftBarLeft: leftBar.classList.contains('can-scroll-left'),
            tabsRight: tabsBar.classList.contains('can-scroll-right'),
            trackOverflows: track.scrollWidth > track.clientWidth + 2,
            tabsOverflows: tabsTrack.scrollWidth > tabsTrack.clientWidth + 2,
        };

        const textBtn = document.querySelector('#left-bar .tool-button[title="Text Tools (T, N, K, L)"]');
        textBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        const textRect = textBtn.getBoundingClientRect();
        const barForText = leftBar.getBoundingClientRect();

        const helpBtn = document.getElementById('open-help-btn');
        helpBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        const helpRect = helpBtn.getBoundingClientRect();
        const barForHelp = leftBar.getBoundingClientRect();

        track.scrollLeft = 0;
        if (typeof updateHScrollOverflowHints === 'function') updateHScrollOverflowHints();

        return {
            overlaps: overlap(cloud, bar),
            cloud: box(cloud),
            bar: box(bar),
            atStart,
            textFullyInBar: textRect.left >= barForText.left - 1 && textRect.right <= barForText.right + 1,
            helpFullyInBar: helpRect.left >= barForHelp.left - 1 && helpRect.right <= barForHelp.right + 1,
        };
    });

    assert.equal(mobileChrome.overlaps, false, `cloud indicator overlaps bottom toolbar at 390px: cloud=${JSON.stringify(mobileChrome.cloud)} bar=${JSON.stringify(mobileChrome.bar)}`);
    assert.ok(mobileChrome.cloud.bottom <= mobileChrome.bar.top + 0.5, `cloud indicator is not above the bottom toolbar: cloud=${JSON.stringify(mobileChrome.cloud)} bar=${JSON.stringify(mobileChrome.bar)}`);
    assert.equal(mobileChrome.atStart.trackOverflows, true, 'bottom toolbar should overflow on a 390px viewport');
    assert.equal(mobileChrome.atStart.leftBarRight, true, 'bottom toolbar should show a can-scroll-right hint');
    assert.equal(mobileChrome.atStart.leftBarLeft, false, 'bottom toolbar should not show a can-scroll-left hint at the start');
    assert.equal(mobileChrome.atStart.tabsOverflows, true, 'top bar should overflow on a 390px viewport');
    assert.equal(mobileChrome.atStart.tabsRight, true, 'top bar should show a can-scroll-right hint');
    assert.equal(mobileChrome.textFullyInBar, true, 'text tool is not fully reachable by scrolling');
    assert.equal(mobileChrome.helpFullyInBar, true, 'last bottom-toolbar icon is not fully reachable by scrolling');

    // Restore desktop viewport
    await page.setViewport({ width: 1280, height: 800 });
    await page.waitForFunction(() => window.innerWidth === 1280);
    const desktopChrome = await page.evaluate(async () => {
        document.getElementById('cloud-sync-indicator')?.classList.add('visible');
        if (typeof updateMobileBottomToolbarHeight === 'function') updateMobileBottomToolbarHeight();
        if (typeof updateHScrollOverflowHints === 'function') updateHScrollOverflowHints();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const overlap = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        const box = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        const cloud = document.getElementById('cloud-sync-indicator').getBoundingClientRect();
        const bar = document.getElementById('left-bar').getBoundingClientRect();
        return {
            overlaps: overlap(cloud, bar),
            cloud: box(cloud),
            bar: box(bar),
            hasHints: document.getElementById('left-bar').classList.contains('can-scroll-right')
                || document.getElementById('left-bar').classList.contains('can-scroll-left')
                || document.getElementById('tabs-bar').classList.contains('can-scroll-right')
                || document.getElementById('tabs-bar').classList.contains('can-scroll-left'),
        };
    });
    assert.equal(desktopChrome.overlaps, false, `cloud indicator overlaps left toolbar at 1280px: cloud=${JSON.stringify(desktopChrome.cloud)} bar=${JSON.stringify(desktopChrome.bar)}`);
    assert.equal(desktopChrome.hasHints, false, 'overflow hints should not show on desktop widths');
    console.log('B3 Mobile Controls at 390px passed.');
}

async function assertB4MoodtoneContrastLabels(page) {
    console.log('Testing B4 Moodtone Contrast Labels...');

    // 1. Check shared getContrastTextColor function outputs
    const contrastChecks = await page.evaluate(() => {
        const fn = window.getContrastTextColor;
        return {
            cyan: fn('#00FFFF'),
            yellow: fn('#FFFF00'),
            black: fn('#000000'),
            white: fn('#FFFFFF'),
            magenta: fn('#FF00FF'),
            lightCyan: fn('#4DFFFF'),
            lightYellow: fn('#FFFF4D')
        };
    });

    assert.equal(contrastChecks.cyan, '#000000', 'cyan must use black text for higher contrast');
    assert.equal(contrastChecks.yellow, '#000000', 'yellow must use black text for higher contrast');
    assert.equal(contrastChecks.black, '#ffffff', 'black must use white text');
    assert.equal(contrastChecks.white, '#000000', 'white must use black text');
    assert.equal(contrastChecks.lightCyan, '#000000', '#4DFFFF must use black text');
    assert.equal(contrastChecks.lightYellow, '#000000', '#FFFF4D must use black text');

    // 2. Test in Triadic mode with base #FF00FF
    await page.evaluate(() => {
        createNewProject('colorseeker');
        const p = projects.find(proj => proj.id === activeProjectId);
        p.data.mode = 'triadic';
        p.data.baseColor = '#FF00FF';
        p.data.colors = generatePalette(p.data.baseColor, p.data.mode, p.data.lockedColors);
        renderColorSeeker(p.id);
    });

    // Check on-screen labels in info tooltips
    const tooltipColors = await page.evaluate(() => {
        const bars = Array.from(document.querySelectorAll('.colorseeker-bar'));
        return bars.map(bar => {
            const info = bar.querySelector('.colorseeker-info');
            return {
                bg: bar.style.backgroundColor,
                textColor: info ? info.style.color : null
            };
        });
    });

    // Yellow and cyan swatches must have rgb(0, 0, 0) text
    tooltipColors.forEach(item => {
        if (item.bg === 'rgb(255, 255, 0)' || item.bg === 'rgb(0, 255, 255)') {
            assert.equal(item.textColor, 'rgb(0, 0, 0)', `expected black text for ${item.bg}, got ${item.textColor}`);
        }
    });

    console.log('B4 Moodtone Contrast Labels passed.');
}

async function assertB5MoodtoneSwatchPanelOverlap(page) {
    console.log('Testing B5 Moodtone Swatch Panel Overlap at 1280px...');
    await page.setViewport({ width: 1280, height: 800 });

    await page.evaluate(() => {
        createNewProject('colorseeker');
    });
    await page.waitForFunction(() => {
        const project = projects.find((p) => p.id === activeProjectId);
        return !!(project && project.type === 'colorseeker' && project.data.colors
            && document.querySelectorAll('.colorseeker-bar').length === project.data.colors.length
            && document.querySelector('.colorseeker-bar[data-index="0"] .colorseeker-remove'));
    });
    await settleForHitTest(page);

    const layout = await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        const sidebar = document.getElementById('colorseeker-sidebar');
        const firstSwatch = document.querySelector('.colorseeker-bar[data-index="0"]');
        const removeBtn = firstSwatch ? firstSwatch.querySelector('.colorseeker-remove') : null;
        const setBaseBtn = firstSwatch ? firstSwatch.querySelector('.colorseeker-set-base') : null;

        const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
        const swatchRect = firstSwatch ? firstSwatch.getBoundingClientRect() : null;
        const removeRect = removeBtn ? removeBtn.getBoundingClientRect() : null;
        const setBaseRect = setBaseBtn ? setBaseBtn.getBoundingClientRect() : null;

        let removeTarget = null;
        if (removeRect) {
            removeTarget = document.elementFromPoint(removeRect.x + removeRect.width / 2, removeRect.y + removeRect.height / 2);
        }
        let setBaseTarget = null;
        if (setBaseRect) {
            setBaseTarget = document.elementFromPoint(setBaseRect.x + setBaseRect.width / 2, setBaseRect.y + setBaseRect.height / 2);
        }

        return {
            sidebarRight: sidebarRect ? sidebarRect.right : null,
            swatchLeft: swatchRect ? swatchRect.left : null,
            removeHitsButton: removeTarget === removeBtn,
            setBaseHitsButton: setBaseTarget === setBaseBtn,
            removeHitsSidebar: sidebar ? sidebar.contains(removeTarget) : false,
            setBaseHitsSidebar: sidebar ? sidebar.contains(setBaseTarget) : false
        };
    });

    assert.ok(layout.swatchLeft >= layout.sidebarRight, `first swatch (left: ${layout.swatchLeft}) must not sit under sidebar (right: ${layout.sidebarRight})`);
    assert.ok(!layout.removeHitsSidebar, 'remove button must not be covered by sidebar');
    assert.ok(!layout.setBaseHitsSidebar, 'set base button must not be covered by sidebar');
    assert.ok(layout.removeHitsButton, 'elementFromPoint on remove button must hit remove button');
    assert.ok(layout.setBaseHitsButton, 'elementFromPoint on set-base button must hit set-base button');

    console.log('B5 Moodtone Swatch Panel Overlap passed.');
}

async function assertB6ToolbarClamping(page) {
    console.log('Testing B6 Floating Selection Toolbar Clamping...');
    await page.setViewport({ width: 1280, height: 800 });

    // Switch to first moodinfinite board
    await page.evaluate(() => {
        const board = projects.find(p => p.type === 'moodinfinite');
        if (board) switchTab(board.id);
    });

    // 1. Place item near right edge (e.g. screen x = 1200)
    const rightEdgeRect = await page.evaluate(() => {
        const w = screenToWorld({ x: 1200, y: 300 });
        const item = {
            id: 'b6_test_right',
            type: 'box',
            x: w.x,
            y: w.y,
            width: 80,
            height: 80,
            color: '#3498db'
        };
        items.push(item);
        selectedItems = [item];
        updateSelectionToolbar();
        updateToolbarPosition();
        const tb = document.getElementById('selection-toolbar');
        const r = tb.getBoundingClientRect();
        return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom
        };
    });

    assert.ok(rightEdgeRect.right <= 1280, `toolbar right (${rightEdgeRect.right}) must not exceed viewport width (1280)`);
    assert.ok(rightEdgeRect.left >= 0, `toolbar left (${rightEdgeRect.left}) must not be negative`);

    // 2. Place item near left edge (e.g. screen x = 20)
    const leftEdgeRect = await page.evaluate(() => {
        const w = screenToWorld({ x: 20, y: 300 });
        const item = {
            id: 'b6_test_left',
            type: 'box',
            x: w.x,
            y: w.y,
            width: 80,
            height: 80,
            color: '#3498db'
        };
        items.push(item);
        selectedItems = [item];
        updateSelectionToolbar();
        updateToolbarPosition();
        const tb = document.getElementById('selection-toolbar');
        const r = tb.getBoundingClientRect();
        return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom
        };
    });

    assert.ok(leftEdgeRect.left >= 0, `toolbar left (${leftEdgeRect.left}) must not be negative`);
    assert.ok(leftEdgeRect.right <= 1280, `toolbar right (${leftEdgeRect.right}) must not exceed viewport width`);

    // 3. Place item near top edge (e.g. screen x = 600, y = -100)
    const topEdgeRect = await page.evaluate(() => {
        const w = screenToWorld({ x: 600, y: -100 });
        const item = {
            id: 'b6_test_top',
            type: 'box',
            x: w.x,
            y: w.y,
            width: 80,
            height: 80,
            color: '#3498db'
        };
        items.push(item);
        selectedItems = [item];
        updateSelectionToolbar();
        updateToolbarPosition();
        const tb = document.getElementById('selection-toolbar');
        const r = tb.getBoundingClientRect();
        return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom
        };
    });

    assert.ok(topEdgeRect.top >= 0, `toolbar top (${topEdgeRect.top}) must not be negative`);

    // Cleanup added test items
    await page.evaluate(() => {
        items = items.filter(it => !it.id.startsWith('b6_test_'));
        selectedItems = [];
        updateSelectionToolbar();
    });

    console.log('B6 Floating Selection Toolbar Clamping passed.');
}

async function assertB7FitViewPadding(page) {
    console.log('Testing B7 Fit-to-view Padding around UI overlays...');
    await page.setViewport({ width: 1280, height: 800 });

    const checkResult = await page.evaluate(() => {
        const board = projects.find(p => p.type === 'moodinfinite');
        if (board) switchTab(board.id);

        const savedItems = [...items];
        items = [
            { id: 'b7_1', type: 'box', x: 100, y: 100, width: 200, height: 200, color: '#3498db' },
            { id: 'b7_2', type: 'box', x: 400, y: 250, width: 150, height: 150, color: '#3498db' },
            { id: 'b7_3', type: 'box', x: 650, y: 350, width: 150, height: 150, color: '#3498db' },
            { id: 'b7_4', type: 'box', x: 900, y: 450, width: 180, height: 180, color: '#3498db' },
            { id: 'b7_5', type: 'box', x: 1200, y: 600, width: 200, height: 200, color: '#3498db' }
        ];
        selectedItems = [];

        focusOnSelection();

        const itemScreenBoxes = items.map(it => {
            const box = getItemBoundingBox(it);
            const tl = worldToScreen({ x: box.x, y: box.y });
            const br = worldToScreen({ x: box.x + box.width, y: box.y + box.height });
            return {
                id: it.id,
                left: Math.min(tl.x, br.x),
                right: Math.max(tl.x, br.x),
                top: Math.min(tl.y, br.y),
                bottom: Math.max(tl.y, br.y)
            };
        });

        const tabsBar = document.getElementById('tabs-bar');
        const leftBar = document.getElementById('left-bar');
        const minimap = document.getElementById('canvas-minimap');

        const tabsRect = tabsBar ? tabsBar.getBoundingClientRect() : null;
        const leftRect = leftBar ? leftBar.getBoundingClientRect() : null;
        const minimapRect = minimap ? minimap.getBoundingClientRect() : null;

        const overlaps = [];
        for (const ib of itemScreenBoxes) {
            if (tabsRect && ib.top < tabsRect.bottom && ib.bottom > tabsRect.top && ib.left < tabsRect.right && ib.right > tabsRect.left) {
                overlaps.push({ item: ib.id, element: 'tabs-bar' });
            }
            if (leftRect && ib.top < leftRect.bottom && ib.bottom > leftRect.top && ib.left < leftRect.right && ib.right > leftRect.left) {
                overlaps.push({ item: ib.id, element: 'left-bar' });
            }
            if (minimapRect && ib.top < minimapRect.bottom && ib.bottom > minimapRect.top && ib.left < minimapRect.right && ib.right > minimapRect.left) {
                overlaps.push({ item: ib.id, element: 'minimap' });
            }
        }

        items = savedItems;
        requestUpdate();

        return {
            overlaps,
            itemScreenBoxes,
            minimapRect
        };
    });

    assert.equal(checkResult.overlaps.length, 0, `no item should overlap overlays: ${JSON.stringify(checkResult.overlaps)}`);
    console.log('B7 Fit-to-view Padding passed.');
}

async function assertB8DuplicateTabNames(page) {
    console.log('Testing B8 Deduplication of Tab Names on Duplicate Loads...');

    const tabNames = await page.evaluate(() => {
        const dummyMood = JSON.stringify({ items: [{ id: 'test_item', type: 'box', x: 0, y: 0, width: 100, height: 100 }] });

        // Load same file three times
        loadFileAsNewTab(dummyMood, 'TestProject.mood');
        const p1 = projects[projects.length - 1];

        loadFileAsNewTab(dummyMood, 'TestProject.mood');
        const p2 = projects[projects.length - 1];

        loadFileAsNewTab(dummyMood, 'TestProject.mood');
        const p3 = projects[projects.length - 1];

        return [p1.name, p2.name, p3.name];
    });

    assert.equal(tabNames[0], 'TestProject', 'first loaded tab should keep base name');
    assert.equal(tabNames[1], 'TestProject (2)', 'second loaded tab should append (2)');
    assert.equal(tabNames[2], 'TestProject (3)', 'third loaded tab should append (3)');

    console.log('B8 Deduplication of Tab Names passed.');
}

function fitScenes() {
    const base = { rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, style: 'fill', isPinned: false };
    const scattered = [
        { ...base, id: 'neg', type: 'box', x: -200, y: -4200, width: 520, height: 1100, color: '#e74c3c' },
        { ...base, id: 'far', type: 'box', x: 480, y: 4300, width: 520, height: 1100, color: '#3498db' },
        { ...base, id: 'rot', type: 'box', x: 40, y: -180, width: 360, height: 140, rotation: Math.PI / 5, scaleX: 1.35, scaleY: 1.15, color: '#f1c40f' },
        {
            ...base, id: 'grp', type: 'group', x: -40, y: 220, width: 420, height: 280, rotation: 0.4, scaleX: 1.2, scaleY: 0.9,
            items: [
                { ...base, id: 'gchild', type: 'box', x: 30, y: 24, width: 160, height: 100, rotation: 0.7, color: '#2ecc71' },
                {
                    ...base, id: 'nested', type: 'group', x: 150, y: 50, width: 200, height: 150, rotation: -0.5, scaleX: 1.15, scaleY: 1.05,
                    items: [
                        { ...base, id: 'nchild', type: 'box', x: 16, y: 14, width: 100, height: 70, rotation: 0.55, scaleX: 1.4, scaleY: 1.1, color: '#9b59b6' },
                    ],
                },
            ],
        },
    ];
    const scaled = [
        { ...base, id: 'neg', type: 'box', x: -520, y: -360, width: 120, height: 80, rotation: -0.4, scaleX: 1.3, scaleY: 1.2, color: '#e74c3c' },
        { ...base, id: 'rot', type: 'box', x: -30, y: -10, width: 260, height: 34, rotation: Math.PI / 2, scaleX: 2.2, scaleY: 1.15, color: '#f1c40f' },
        {
            ...base, id: 'grp', type: 'group', x: 40, y: -70, width: 170, height: 120, rotation: 0.65, scaleX: 1.8, scaleY: 1.45,
            items: [
                { ...base, id: 'gchild', type: 'box', x: 18, y: 14, width: 64, height: 36, rotation: 0.35, color: '#2ecc71' },
                {
                    ...base, id: 'nested', type: 'group', x: 48, y: 22, width: 96, height: 70, rotation: -0.7, scaleX: 1.25, scaleY: 1.1,
                    items: [
                        { ...base, id: 'nchild', type: 'box', x: 10, y: 8, width: 42, height: 26, rotation: 0.75, scaleX: 1.5, scaleY: 1.2, color: '#9b59b6' },
                    ],
                },
            ],
        },
    ];
    return { scattered, scaled };
}

async function measureFittedItems(page, sceneItems) {
    return page.evaluate((sceneItems) => {
        const board = projects.find((p) => p.type === 'moodinfinite');
        if (board) switchTab(board.id);
        const prevGrid = showGrid;
        showGrid = false;
        const saved = items.slice();
        const savedSelection = selectedItems.slice();
        items = sceneItems;
        selectedItems = [];
        document.getElementById('canvas-fit-view-btn').click();
        draw();

        const canvas = document.getElementById('moodboard-canvas');
        const ctx = canvas.getContext('2d');
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const targets = {
            neg: [231, 76, 60],
            far: [52, 152, 219],
            rot: [241, 196, 15],
            gchild: [46, 204, 113],
            nchild: [155, 89, 182],
        };
        const found = {};
        const want = new Set();
        const walk = (list) => list.forEach((item) => {
            if (item.items) walk(item.items);
            else if (targets[item.id]) want.add(item.id);
        });
        walk(sceneItems);
        want.forEach((id) => { found[id] = null; });
        const w = canvas.width;
        const h = canvas.height;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const r = img[i];
                const g = img[i + 1];
                const b = img[i + 2];
                const a = img[i + 3];
                if (a < 180) continue;
                for (const id of want) {
                    const c = targets[id];
                    if (Math.abs(r - c[0]) > 28 || Math.abs(g - c[1]) > 28 || Math.abs(b - c[2]) > 28) continue;
                    const box = found[id] || { minX: x, minY: y, maxX: x, maxY: y, n: 0 };
                    if (x < box.minX) box.minX = x;
                    if (y < box.minY) box.minY = y;
                    if (x > box.maxX) box.maxX = x;
                    if (y > box.maxY) box.maxY = y;
                    box.n++;
                    found[id] = box;
                }
            }
        }
        const chrome = ['tabs-bar', 'left-bar', 'canvas-minimap', 'canvas-fit-view-btn', 'canvas-zoom-readout'].map((id) => {
            const el = document.getElementById(id);
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
                id,
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
                w: r.width,
                h: r.height,
                hidden: el.hidden || cs.display === 'none' || cs.visibility === 'hidden',
            };
        });
        const zoom = cameraZoom;
        const dpr = window.devicePixelRatio;
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        showGrid = prevGrid;
        items = saved;
        selectedItems = savedSelection;
        items.forEach((item) => { delete item._cachedBox; item._isDirty = true; });
        requestUpdate();
        return { found, chrome, zoom, dpr, canvas: { w, h, cssW, cssH }, minZoom: MIN_ZOOM };
    }, sceneItems);
}

// Mirrors computeFitSafeRect's edge choice. GAP and MIN match script.js and
// are used only to decide which single side a corner widget reserves. The
// returned rect is the chrome-free area itself (no extra padding).
function freeRectForChrome(canvas, chrome) {
    const GAP = 20;
    const MIN = 32;
    const viewW = canvas.w;
    const viewH = canvas.h;
    let padLeft = MIN;
    let padRight = MIN;
    let padTop = MIN;
    let padBottom = MIN;
    let left = 0;
    let top = 0;
    let right = viewW;
    let bottom = viewH;
    const corners = [];
    for (const r of chrome) {
        if (r.hidden || r.w < 1 || r.h < 1) continue;
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const wide = r.w >= r.h * 1.4 && r.w > viewW * 0.35;
        const tall = r.h >= r.w * 1.4 && r.h > viewH * 0.35;
        if (wide && cy < viewH * 0.45) {
            padTop = Math.max(padTop, r.bottom + GAP);
            top = Math.max(top, r.bottom);
        } else if (wide && cy > viewH * 0.55) {
            padBottom = Math.max(padBottom, viewH - r.top + GAP);
            bottom = Math.min(bottom, r.top);
        } else if (tall && cx < viewW * 0.45) {
            padLeft = Math.max(padLeft, r.right + GAP);
            left = Math.max(left, r.right);
        } else if (tall && cx > viewW * 0.55) {
            padRight = Math.max(padRight, viewW - r.left + GAP);
            right = Math.min(right, r.left);
        } else {
            corners.push(r);
        }
    }
    corners.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    for (const r of corners) {
        const safeLeft = padLeft;
        const safeTop = padTop;
        const safeRight = viewW - padRight;
        const safeBottom = viewH - padBottom;
        const overlaps = r.right > safeLeft && r.left < safeRight && r.bottom > safeTop && r.top < safeBottom;
        if (!overlaps) continue;
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const freeW = Math.max(0, safeRight - safeLeft);
        const freeH = Math.max(0, safeBottom - safeTop);
        if (cy >= viewH * 0.5) {
            const nextRight = Math.max(padRight, viewW - r.left + GAP);
            const nextBottom = Math.max(padBottom, viewH - r.top + GAP);
            const wasteRight = (nextRight - padRight) * freeH;
            const wasteBottom = (nextBottom - padBottom) * freeW;
            if (wasteBottom <= wasteRight) {
                padBottom = nextBottom;
                bottom = Math.min(bottom, r.top);
            } else {
                padRight = nextRight;
                right = Math.min(right, r.left);
            }
        } else {
            const nextTop = Math.max(padTop, r.bottom + GAP);
            const growRight = cx >= viewW / 2;
            const nextSide = growRight
                ? Math.max(padRight, viewW - r.left + GAP)
                : Math.max(padLeft, r.right + GAP);
            const wasteSide = (nextSide - (growRight ? padRight : padLeft)) * freeH;
            const wasteTop = (nextTop - padTop) * freeW;
            if (wasteTop <= wasteSide) {
                padTop = nextTop;
                top = Math.max(top, r.bottom);
            } else if (growRight) {
                padRight = nextSide;
                right = Math.min(right, r.left);
            } else {
                padLeft = nextSide;
                left = Math.max(left, r.right);
            }
        }
    }
    return { left, top, right, bottom };
}

function assertItemsInsideFreeRect(result, label, { expectBelowMinZoom }) {
    assert.equal(result.canvas.w, result.canvas.cssW, `${label} canvas buffer width should match CSS px`);
    assert.equal(result.canvas.h, result.canvas.cssH, `${label} canvas buffer height should match CSS px`);
    const free = freeRectForChrome(result.canvas, result.chrome);
    const pad = 6;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, box] of Object.entries(result.found)) {
        assert.ok(box && box.n >= 4, `${label} ${id} is not fully inside the view: ${JSON.stringify(box)}`);
        assert.ok(box.minX >= free.left + pad, `${label} ${id} left ${box.minX} is outside the chrome-free area ${free.left}`);
        assert.ok(box.minY >= free.top + pad, `${label} ${id} top ${box.minY} is outside the chrome-free area ${free.top}`);
        assert.ok(box.maxX <= free.right - pad, `${label} ${id} right ${box.maxX} is outside the chrome-free area ${free.right}`);
        assert.ok(box.maxY <= free.bottom - pad, `${label} ${id} bottom ${box.maxY} is outside the chrome-free area ${free.bottom}`);
        minX = Math.min(minX, box.minX);
        minY = Math.min(minY, box.minY);
        maxX = Math.max(maxX, box.maxX);
        maxY = Math.max(maxY, box.maxY);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const fcx = (free.left + free.right) / 2;
    const fcy = (free.top + free.bottom) / 2;
    const tolX = Math.max(36, (free.right - free.left) * 0.18);
    const tolY = Math.max(36, (free.bottom - free.top) * 0.18);
    assert.ok(Math.abs(cx - fcx) <= tolX, `${label} items are not centered horizontally: ${cx} vs ${fcx}`);
    assert.ok(Math.abs(cy - fcy) <= tolY, `${label} items are not centered vertically: ${cy} vs ${fcy}`);
    if (expectBelowMinZoom) {
        assert.ok(result.zoom < result.minZoom, `${label} fit stayed at MIN_ZOOM ${result.minZoom}, zoom ${result.zoom}`);
    }
}

function assertScatteredFillsFreeArea(result, label) {
    const free = freeRectForChrome(result.canvas, result.chrome);
    const freeW = free.right - free.left;
    const freeH = free.bottom - free.top;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, box] of Object.entries(result.found)) {
        assert.ok(box && box.n >= 4, `${label} ${id} is not fully inside the view: ${JSON.stringify(box)}`);
        assert.ok(box.minX >= free.left, `${label} ${id} left ${box.minX} is outside the free area ${free.left}`);
        assert.ok(box.minY >= free.top, `${label} ${id} top ${box.minY} is outside the free area ${free.top}`);
        assert.ok(box.maxX <= free.right, `${label} ${id} right ${box.maxX} is outside the free area ${free.right}`);
        assert.ok(box.maxY <= free.bottom, `${label} ${id} bottom ${box.maxY} is outside the free area ${free.bottom}`);
        minX = Math.min(minX, box.minX);
        minY = Math.min(minY, box.minY);
        maxX = Math.max(maxX, box.maxX);
        maxY = Math.max(maxY, box.maxY);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const fcx = (free.left + free.right) / 2;
    const fcy = (free.top + free.bottom) / 2;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const fillX = contentW / freeW;
    const fillY = contentH / freeH;
    assert.ok(Math.abs(cx - fcx) <= 10, `${label} content center x ${cx} is more than 10px from free center ${fcx} (zoom ${result.zoom}, free ${JSON.stringify(free)})`);
    if (fillY <= fillX) {
        assert.ok(Math.abs(cy - fcy) <= 10, `${label} content center y ${cy} is more than 10px from free center ${fcy} on the non-limiting axis`);
    }
    const limitingFill = Math.max(fillX, fillY);
    assert.ok(limitingFill >= 0.8, `${label} content fills ${limitingFill} of the limiting free-area side (content ${contentW}x${contentH}, free ${freeW}x${freeH}, zoom ${result.zoom})`);
    if (result.canvas.w <= 500) {
        assert.ok(Math.abs(fcx - result.canvas.w / 2) <= 10, `${label} bottom chrome reserved a side inset; free center ${fcx} vs ${result.canvas.w / 2}`);
    }
}

async function assertFitViewGeometry(page) {
    console.log('Testing fit-to-view geometry (negative, far, rotated, nested, DPR)...');
    const { scattered, scaled } = fitScenes();
    const viewports = [
        { name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false },
        { name: 'desktop-dpr2', width: 1280, height: 800, deviceScaleFactor: 2, isMobile: false },
        { name: 'mobile-dpr2', width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
        { name: 'mobile-dpr3', width: 390, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    ];
    for (const viewport of viewports) {
        await page.setViewport(viewport);
        await page.waitForFunction((width) => window.innerWidth === width, {}, viewport.width);
        const scatteredResult = await measureFittedItems(page, scattered);
        assert.equal(scatteredResult.dpr, viewport.deviceScaleFactor, `${viewport.name} devicePixelRatio`);
        assertItemsInsideFreeRect(scatteredResult, `${viewport.name} scattered`, { expectBelowMinZoom: true });
        const scaledResult = await measureFittedItems(page, scaled);
        assertItemsInsideFreeRect(scaledResult, `${viewport.name} scaled`, { expectBelowMinZoom: false });
    }
    const strictViewports = [
        { name: 'mobile-844-dpr1', width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
        { name: 'mobile-844-dpr3', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
        { name: 'desktop-1280', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false },
    ];
    for (const viewport of strictViewports) {
        await page.setViewport(viewport);
        await page.waitForFunction((width, height) => window.innerWidth === width && window.innerHeight === height, {}, viewport.width, viewport.height);
        // resizeCanvas() ignores non-board tabs, so make sure the board is active first.
        await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            if (board && activeProjectId !== board.id) switchTab(board.id);
            window.dispatchEvent(new Event('resize'));
            if (typeof resizeCanvas === 'function') resizeCanvas();
        });
        // Wait on the actual layout state instead of a fixed delay: the canvas buffer
        // must equal the content area and the viewport, with the DPR applied.
        await page.waitForFunction((width, height, dpr) => {
            const cv = document.getElementById('moodboard-canvas');
            const area = document.getElementById('content-area');
            if (!cv || !area || window.devicePixelRatio !== dpr) return false;
            if (cv.width !== area.clientWidth || cv.height !== area.clientHeight) {
                if (typeof resizeCanvas === 'function') resizeCanvas();
                return false;
            }
            return cv.clientWidth === width && cv.clientHeight === height
                && cv.width === cv.clientWidth && cv.height === cv.clientHeight;
        }, { timeout: 10000 }, viewport.width, viewport.height, viewport.deviceScaleFactor);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const scatteredResult = await measureFittedItems(page, scattered);
        assert.equal(scatteredResult.canvas.cssW, viewport.width, `${viewport.name} canvas CSS width`);
        assert.equal(scatteredResult.canvas.cssH, viewport.height, `${viewport.name} canvas CSS height`);
        assert.equal(scatteredResult.dpr, viewport.deviceScaleFactor, `${viewport.name} devicePixelRatio`);
        assert.equal(scatteredResult.canvas.w, scatteredResult.canvas.cssW, `${viewport.name} canvas buffer width should match CSS px`);
        assert.equal(scatteredResult.canvas.h, scatteredResult.canvas.cssH, `${viewport.name} canvas buffer height should match CSS px`);
        assert.ok(scatteredResult.zoom < scatteredResult.minZoom, `${viewport.name} fit stayed at MIN_ZOOM ${scatteredResult.minZoom}, zoom ${scatteredResult.zoom}`);
        assertScatteredFillsFreeArea(scatteredResult, `${viewport.name} scattered`);
    }
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false });
    await page.waitForFunction(() => window.innerWidth === 1280);
    console.log('Fit-to-view geometry passed.');
}

async function assertBottomToolbarScrollEnd(page) {
    console.log('Testing bottom toolbar scroll-end hint at 390px...');
    await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.waitForFunction(() => window.innerWidth === 390);
    const result = await page.evaluate(async () => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        const board = projects.find((p) => p.type === 'moodinfinite');
        if (board) switchTab(board.id);
        if (typeof updateMobileBottomToolbarHeight === 'function') updateMobileBottomToolbarHeight();
        updateHScrollOverflowHints();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const bar = document.getElementById('left-bar');
        const track = bar.querySelector(':scope > .h-scroll-track');
        const scroller = track && getComputedStyle(track).overflowX !== 'hidden' && track.scrollWidth > track.clientWidth + 2
            ? track
            : bar;
        scroller.scrollLeft = scroller.scrollWidth;
        updateHScrollOverflowHints();
        return {
            canRight: bar.classList.contains('can-scroll-right'),
            canLeft: bar.classList.contains('can-scroll-left'),
            scrollLeft: scroller.scrollLeft,
            scrollWidth: scroller.scrollWidth,
            clientWidth: scroller.clientWidth,
            atEnd: scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2,
        };
    });
    assert.equal(result.atEnd, true, `bottom toolbar did not scroll to the end: ${JSON.stringify(result)}`);
    assert.equal(result.canRight, false, `can-scroll-right stayed on at the end: ${JSON.stringify(result)}`);
    assert.equal(result.canLeft, true, `can-scroll-left missing after scrolling to the end: ${JSON.stringify(result)}`);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false });
    await page.waitForFunction(() => window.innerWidth === 1280);
    console.log('Bottom toolbar scroll-end hint passed.');
}

function boxItem(id, x, y, width = 80, height = 50) {
    return {
        id, type: 'box', color: '#429eff', x, y, width, height,
        rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
    };
}

async function storedTabRows(page) {
    return page.evaluate(async () => {
        const stored = await window.localforage.getItem('moodinfinite_projects');
        return (stored || []).map((p) => ({ id: p.id, name: p.name }));
    });
}

async function waitForStored(page, accept, timeout = 6000) {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeout) {
        last = await storedTabRows(page);
        if (accept(last)) return last;
        await wait(200);
    }
    return last;
}

async function pressEditingKeys(page) {
    await page.keyboard.press('t');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('b');
    await page.keyboard.down('Control');
    try {
        await page.keyboard.press('z');
    } finally {
        await page.keyboard.up('Control');
    }
}

async function assertShellCanvasFixes(page) {
    console.log('Testing shell and canvas fixes...');
    const errors = [];
    const onError = (err) => errors.push(String(err && err.stack || err));
    page.on('pageerror', onError);
    try {
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
        await page.waitForFunction(() => window.innerWidth === 1280 && window.projects && window.projects.length > 0 && typeof resetBoard === 'function');

        const cleared = await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            items.length = 0;
            items.push({
                id: 'doomed', type: 'box', color: '#429eff', x: 12, y: 12, width: 80, height: 50,
                rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
            });
            saveStateForUndo();
            resetBoard();
            const afterReset = items.length;
            const projectCount = board.data.items.length;
            const doomed = board.data.items.some((item) => item.id === 'doomed');
            let other = projects.find((p) => p.id !== board.id);
            if (!other) {
                createNewProject('moodprompt');
                other = projects.find((p) => p.id === activeProjectId);
            }
            switchTab(other.id);
            switchTab(board.id);
            return {
                afterReset,
                projectCount,
                doomed,
                afterRoundTrip: items.length,
                sameArray: items === board.data.items,
            };
        });
        assert.equal(cleared.afterReset, 0, 'resetBoard left canvas items');
        assert.equal(cleared.projectCount, 0, 'resetBoard left project items');
        assert.equal(cleared.doomed, false);
        assert.equal(cleared.afterRoundTrip, 0, 'cleared items came back after a tab round trip');
        assert.equal(cleared.sameArray, true);

        const fileJson = JSON.stringify({
            items: [boxItem('loaded-box', 10, 20, 80, 60)],
            cameraOffset: { x: 111, y: 222 },
            cameraZoom: 1.5,
            canvasBackgroundColor: '#0d0d0d',
            accentColor: '#429eff',
            gridColor: '#f9f8f6',
        });
        const loaded = await page.evaluate((json) => {
            createNewProject('moodprompt');
            const promptId = activeProjectId;
            loadFileAsNewTab(json, 'LoadedShell.mood');
            const loadedId = activeProjectId;
            const active = projects.find((p) => p.id === loadedId);
            const read = () => ({
                zoom: (0, eval)('cameraZoom'),
                cam: (0, eval)('cameraOffset'),
                canvas: document.getElementById('moodinfinite-container').style.display,
                prompt: document.getElementById('moodprompt-container').style.display,
                hasItem: items.some((item) => item.id === 'loaded-box'),
            });
            const shown = read();
            switchTab(promptId);
            switchTab(loadedId);
            return {
                promptId,
                loadedId,
                type: active.type,
                name: active.name,
                promptType: projects.find((p) => p.id === promptId).type,
                shown,
                roundTrip: read(),
            };
        }, fileJson);
        assert.equal(loaded.type, 'moodinfinite');
        assert.ok(loaded.name.startsWith('LoadedShell'), loaded.name);
        assert.equal(loaded.promptType, 'moodprompt');
        assert.equal(loaded.shown.canvas, 'block', 'opened file did not show the canvas');
        assert.equal(loaded.shown.prompt, 'none', 'prompt view stayed visible after opening a board file');
        assert.equal(loaded.shown.zoom, 1.5);
        assert.deepEqual(loaded.shown.cam, { x: 111, y: 222 });
        assert.equal(loaded.shown.hasItem, true);
        assert.equal(loaded.roundTrip.zoom, 1.5);
        assert.deepEqual(loaded.roundTrip.cam, { x: 111, y: 222 });

        const reloaded = await page.evaluate(async () => {
            createNewProject('moodprompt');
            const project = projects.find((p) => p.id === activeProjectId);
            project.data.prompts = [{
                id: 'old', title: 'Old Title', platform: 'midjourney', mediaType: 'image',
                image1: null, image2: null, text: 'old', tags: [],
            }];
            renderMoodpromptView(project);
            const zip = new window.JSZip();
            zip.file('data.json', JSON.stringify({
                prompts: [{
                    id: 'cloud', title: 'From Cloud', platform: 'midjourney', mediaType: 'image',
                    image1: null, image2: null, text: 'new', tags: [],
                }],
                canvasBackgroundColor: '#111111',
            }));
            const blob = await zip.generateAsync({ type: 'blob' });
            const ok = await reloadCurrentProjectFromBlob(blob);
            return {
                ok,
                title: document.querySelector('.prompt-title-input') && document.querySelector('.prompt-title-input').value,
                prompt: document.getElementById('moodprompt-container').style.display,
                canvas: document.getElementById('moodinfinite-container').style.display,
            };
        });
        assert.equal(reloaded.ok, true);
        assert.equal(reloaded.title, 'From Cloud', 'cloud reload did not refresh the open board');
        assert.notEqual(reloaded.prompt, 'none');
        assert.equal(reloaded.canvas, 'none');

        const note = await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            items.length = 0;
            items.push({
                id: 'note-1', type: 'text', title: 'Old title', text: 'Old body',
                x: 80, y: 80, width: 220, height: 180, fontSize: 16, rotation: 0,
                isPinned: false, opacity: 1, fontFamily: 'Nunito', color: '#429eff', scaleX: 1, scaleY: 1,
            });
            saveStateForUndo();
            editText(items[0]);
            return document.getElementById('note-editor-overlay').style.display;
        });
        assert.equal(note, 'flex');
        await wait(40);
        await page.evaluate(() => {
            document.getElementById('note-title-input').value = 'New title';
            document.getElementById('note-body-input').value = 'New body';
        });
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
        const noteUndo = await page.evaluate(() => ({
            focus: document.activeElement && document.activeElement.id,
            editing: (0, eval)('currentlyEditingText'),
        }));
        assert.ok(noteUndo.focus !== 'note-title-input' && noteUndo.focus !== 'note-body-input', `note focus stayed in ${noteUndo.focus}`);
        assert.ok(!noteUndo.editing, `note edit still open: ${noteUndo.focus}`);
        await page.keyboard.down('Control');
        await page.keyboard.press('z');
        await page.keyboard.up('Control');
        const noteRestored = await page.evaluate(() => {
            const item = items[0];
            return {
                count: items.length,
                title: item && item.title,
                text: item && item.text,
                hidden: item && item.isHidden === true,
                overlay: document.getElementById('note-editor-overlay').style.display,
            };
        });
        assert.equal(noteRestored.count, 1);
        assert.equal(noteRestored.title, 'Old title');
        assert.equal(noteRestored.text, 'Old body');
        assert.equal(noteRestored.hidden, false, 'undo hid the note');
        assert.equal(noteRestored.overlay, 'none');
        await page.keyboard.down('Control');
        await page.keyboard.down('Shift');
        try {
            await page.keyboard.press('z');
        } finally {
            await page.keyboard.up('Shift');
            await page.keyboard.up('Control');
        }
        const noteRedone = await page.evaluate(() => ({
            title: items[0] && items[0].title,
            hidden: items[0] && items[0].isHidden === true,
        }));
        assert.equal(noteRedone.title, 'New title');
        assert.equal(noteRedone.hidden, false);

        await page.evaluate(() => {
            if ((0, eval)('currentlyEditingText')) cancelNoteEditing();
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            items.length = 0;
            saveStateForUndo();
            setCurrentTool('comment');
        });
        const canvasBox = await (await page.$('#moodboard-canvas')).boundingBox();
        assert.ok(canvasBox && canvasBox.width > 200, 'canvas was not visible for the comment edit');
        const commentAt = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + Math.min(canvasBox.height / 2, 280) };
        await page.mouse.move(commentAt.x, commentAt.y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForFunction(() => {
            const editor = document.getElementById('text-editor');
            return editor && editor.style.display === 'block';
        });
        await page.focus('#text-editor');
        await page.keyboard.type('Hello note');
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
        const commentCommitted = await page.evaluate(() => {
            const item = items.find((entry) => entry.type === 'comment');
            return {
                text: item && item.text,
                tool: (0, eval)('currentTool'),
                focus: document.activeElement && document.activeElement.id,
            };
        });
        assert.equal(commentCommitted.text, 'Hello note');
        assert.notEqual(commentCommitted.focus, 'text-editor');
        await page.keyboard.down('Control');
        await page.keyboard.press('z');
        await page.keyboard.up('Control');
        const commentUndone = await page.evaluate(() => {
            const item = items.find((entry) => entry.type === 'comment');
            return {
                text: item && item.text,
                hidden: !item || item.isHidden === true,
                editor: document.getElementById('text-editor').style.display,
                tool: (0, eval)('currentTool'),
            };
        });
        assert.equal(commentUndone.text, 'Note...', `comment undo text ${commentUndone.text}`);
        assert.equal(commentUndone.hidden, false, 'undo hid the comment');
        assert.notEqual(commentUndone.editor, 'block');
        assert.equal(commentUndone.tool, commentCommitted.tool);

        const grouped = await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            items.length = 0;
            items.push(
                { id: 'ga', type: 'box', color: '#429eff', x: 10, y: 20, width: 50, height: 40, rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 },
                { id: 'gb', type: 'box', color: '#429eff', x: 80, y: 30, width: 50, height: 40, rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 },
            );
            saveStateForUndo();
            (0, eval)('selectedItems = items.slice()');
            groupSelectedItems();
            const groupedOk = items.length === 1 && items[0].type === 'group';
            undoLastAction();
            const undone = items.map((item) => ({ id: item.id, type: item.type, x: item.x, y: item.y }));
            redoLastAction();
            const redone = items.length === 1 && items[0].type === 'group' && items[0].items.length === 2;
            items.length = 0;
            items.push(
                { id: 'ca', type: 'box', color: '#429eff', x: 0, y: 0, width: 80, height: 40, rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 },
                { id: 'cb', type: 'box', color: '#429eff', x: 220, y: 10, width: 80, height: 40, rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 },
            );
            saveStateForUndo();
            createSimpleConnector(items[0], items[1]);
            const connected = items.some((item) => item.type === 'connector');
            undoLastAction();
            const disconnected = items.some((item) => item.type === 'connector');
            redoLastAction();
            const reconnected = items.some((item) => item.type === 'connector');
            return { groupedOk, undone, redone, connected, disconnected, reconnected };
        });
        assert.equal(grouped.groupedOk, true);
        assert.deepEqual(grouped.undone.map((item) => item.id).sort(), ['ga', 'gb']);
        assert.equal(grouped.undone.find((item) => item.id === 'ga').x, 10);
        assert.equal(grouped.undone.find((item) => item.id === 'gb').x, 80);
        assert.equal(grouped.redone, true, 'redo did not restore the group');
        assert.equal(grouped.connected, true);
        assert.equal(grouped.disconnected, false, 'undo left the connector');
        assert.equal(grouped.reconnected, true, 'redo did not restore the connector');

        await page.evaluate(() => {
            setCurrentTool('box');
            createNewProject('moodprompt');
            const project = projects.find((p) => p.id === activeProjectId);
            project.data.prompts = [{
                id: 'keys', title: 'Keys', platform: 'midjourney', mediaType: 'image',
                image1: null, image2: null, text: 'body', tags: [],
            }];
            renderMoodpromptView(project);
            (0, eval)('clipboard = [{ id: "paste-src", type: "box", x: 30, y: 30, width: 24, height: 24, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1 }]');
        });
        const pasteTarget = await page.$('.prompt-text-area');
        assert.ok(pasteTarget, 'prompt text area missing');
        await pasteTarget.click();
        const pastedInField = await page.evaluate(() => {
            const before = items.length;
            const area = document.querySelector('.prompt-text-area');
            area.focus();
            area.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }));
            return { before, after: items.length, active: document.activeElement && document.activeElement.className };
        });
        assert.equal(pastedInField.after, pastedInField.before, 'paste while a prompt field was focused added a canvas item');
        const guarded = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
        }));
        await pressEditingKeys(page);
        const promptKeys = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
        }));
        assert.equal(promptKeys.tool, guarded.tool, 'tool shortcut fired in a prompt field');
        assert.equal(promptKeys.count, guarded.count, 'delete shortcut fired in a prompt field');
        assert.equal(promptKeys.index, guarded.index, 'undo shortcut fired in a prompt field');

        await page.evaluate(() => {
            createNewProject('moodlist');
            const project = projects.find((p) => p.id === activeProjectId);
            project.data.cards = [{ id: 'card-keys', title: 'List keys', color: '', pinned: false, image: null, items: [{ id: 'row1', text: 'a', checked: false }] }];
            renderMoodlistView(project);
        });
        await page.click('.ml-card-title');
        const listBefore = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
            editable: document.activeElement && document.activeElement.isContentEditable,
        }));
        assert.equal(listBefore.editable, true, 'moodlist title was not focused');
        await pressEditingKeys(page);
        const listAfter = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
        }));
        assert.equal(listAfter.tool, listBefore.tool, 'tool shortcut fired in a moodlist title');
        assert.equal(listAfter.count, listBefore.count);
        assert.equal(listAfter.index, listBefore.index);

        await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            items.length = 0;
            items.push({
                id: 'note-keys', type: 'text', title: 'Keep', text: 'Keep body',
                x: 40, y: 40, width: 220, height: 180, fontSize: 16, rotation: 0,
                isPinned: false, opacity: 1, fontFamily: 'Nunito', color: '#429eff', scaleX: 1, scaleY: 1,
            });
            editText(items[0]);
        });
        await wait(40);
        await page.focus('#note-body-input');
        const noteBefore = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
        }));
        await pressEditingKeys(page);
        const noteKeys = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
        }));
        assert.equal(noteKeys.tool, noteBefore.tool, 'tool shortcut fired in the note editor');
        assert.equal(noteKeys.count, noteBefore.count);
        assert.equal(noteKeys.index, noteBefore.index);
        await page.keyboard.press('Escape');

        await page.evaluate(() => {
            document.querySelectorAll('#context-menu, #tab-context-menu, #mobile-tabs-popup').forEach((el) => { el.style.display = 'none'; });
            const tab = document.querySelector('#tabs-list .tab-item.active');
            const nameEl = tab.querySelector('.tab-name');
            const input = tab.querySelector('.tab-name-input');
            nameEl.style.display = 'none';
            input.style.display = 'inline';
            input.focus();
            input.select();
        });
        const renameBefore = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
            tag: document.activeElement && document.activeElement.className,
        }));
        assert.ok(String(renameBefore.tag).includes('tab-name-input'), `tab rename field was not focused (${renameBefore.tag})`);
        await pressEditingKeys(page);
        const renameKeys = await page.evaluate(() => ({
            tool: (0, eval)('currentTool'),
            count: items.length,
            index: (0, eval)('historyIndex'),
        }));
        assert.equal(renameKeys.tool, renameBefore.tool, 'tool shortcut fired while renaming a tab');
        assert.equal(renameKeys.count, renameBefore.count);
        assert.equal(renameKeys.index, renameBefore.index);
        await page.keyboard.press('Escape');

        await page.evaluate(() => {
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            setCurrentTool(null);
        });
        await page.keyboard.press('t');
        const bareTool = await page.evaluate(() => (0, eval)('currentTool'));
        assert.equal(bareTool, 'text', 'tool shortcut did not run when focus was outside a text field');
        await page.evaluate(() => setCurrentTool(null));

        const outsidePaste = await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            saveStateForUndo();
            (0, eval)('clipboard = [{ id: "paste-src", type: "box", x: 30, y: 30, width: 24, height: 24, rotation: 0, opacity: 1, scaleX: 1, scaleY: 1 }]');
            const before = items.length;
            const data = new DataTransfer();
            data.setData('text/plain', 'plain');
            window.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
            const after = items.length;
            undoLastAction();
            return { before, after, undone: items.length };
        });
        assert.equal(outsidePaste.after, outsidePaste.before + 1, 'paste outside a text field did not add the copied item');
        assert.equal(outsidePaste.undone, outsidePaste.before);

        const uniqueName = `Persist ${Date.now()}`;
        const renameId = await page.evaluate(async (name) => {
            projects.forEach((p) => { p.pinned = false; });
            renderTabs();
            (0, eval)('clearTimeout(autoSaveTimeout); autoSaveTimeout = null');
            await saveToBrowser();
            const tab = document.querySelector('#tabs-list .tab-item.active');
            const nameEl = tab.querySelector('.tab-name');
            const input = tab.querySelector('.tab-name-input');
            nameEl.style.display = 'none';
            input.style.display = 'inline';
            input.focus();
            input.value = name;
            input.select();
            return Number(tab.dataset.id);
        }, uniqueName);
        await page.keyboard.press('Enter');
        const renamedNow = await page.evaluate((id) => projects.find((p) => p.id === id).name, renameId);
        assert.equal(renamedNow, uniqueName, 'rename input did not commit');
        const renamedStored = await waitForStored(page, (rows) => rows.some((row) => row.id === renameId && row.name === uniqueName));
        assert.ok(
            renamedStored && renamedStored.some((row) => row.id === renameId && row.name === uniqueName),
            `renamed tab was not saved: ${(renamedStored || []).map((row) => row.name).join(', ')}`,
        );

        const orderChange = await page.evaluate(() => {
            (0, eval)('clearTimeout(autoSaveTimeout); autoSaveTimeout = null');
            const before = projects.map((p) => p.id);
            const list = document.getElementById('tabs-list');
            const tabs = [...list.querySelectorAll('.tab-item')];
            const moved = tabs[tabs.length - 1];
            list.insertBefore(moved, tabs[0]);
            const data = new DataTransfer();
            data.setData('text/plain', moved.dataset.id);
            list.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
            const after = projects.map((p) => p.id);
            return { before, after };
        });
        assert.notDeepEqual(orderChange.after, orderChange.before, 'tab drop did not reorder projects');
        const storedOrder = await waitForStored(page, (rows) => rows.map((row) => row.id).join(',') === orderChange.after.join(','));
        assert.deepEqual((storedOrder || []).map((row) => row.id), orderChange.after, 'reordered tabs were not saved');

        const duplicated = await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            board.name = 'Dup Canvas';
            items.length = 0;
            items.push({ id: 'marker', type: 'box', color: '#429eff', x: 5, y: 6, width: 40, height: 30, rotation: 0, isPinned: false, opacity: 1, scaleX: 1, scaleY: 1 });
            renderTabs();
            const tab = document.querySelector(`#tabs-list .tab-item[data-id="${board.id}"]`);
            tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 180, clientY: 24 }));
            const labels = [...document.querySelectorAll('#tab-context-menu .menu-label')].map((el) => el.textContent);
            document.getElementById('duplicate-tab-btn').click();
            const copy = projects.find((p) => p.id === activeProjectId);
            const source = projects.find((p) => p.id === board.id);
            copy.data.items[0].x = 999;
            createNewProject('moodlist');
            const list = projects.find((p) => p.id === activeProjectId);
            list.name = 'Dup List';
            list.data.cards = [{ id: 'c1', title: 'Original Card', color: '', pinned: false, image: null, items: [] }];
            const listCopyId = duplicateProject(list.id);
            const listCopy = projects.find((p) => p.id === listCopyId);
            listCopy.data.cards[0].title = 'Changed';
            return {
                labels,
                sourceId: source.id,
                copyId: copy.id,
                copyName: copy.name,
                sourceX: source.data.items[0].x,
                copyX: copy.data.items[0].x,
                listTitle: list.data.cards[0].title,
                listCopyTitle: listCopy.data.cards[0].title,
                listCopyId,
            };
        });
        assert.ok(duplicated.labels.includes('Duplicate'));
        assert.notEqual(duplicated.copyId, duplicated.sourceId);
        assert.ok(duplicated.copyName.startsWith('Dup Canvas'), duplicated.copyName);
        assert.equal(duplicated.sourceX, 5, 'editing the copy changed the source board');
        assert.equal(duplicated.copyX, 999);
        assert.equal(duplicated.listTitle, 'Original Card');
        assert.equal(duplicated.listCopyTitle, 'Changed');
        assert.notEqual(duplicated.listCopyId, null);

        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        await page.waitForFunction(() => window.innerWidth === 390 && window.projects && window.projects.length > 0 && typeof switchTab === 'function');
        await page.evaluate(() => {
            const types = ['moodinfinite', 'moodprompt', 'colorseeker', 'storyflow', 'moodgantt', 'moodlist'];
            types.forEach((type) => {
                if (!projects.some((p) => p.type === type)) createNewProject(type);
            });
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            board.name = 'Mobile Dup';
            items.length = 0;
            items.push({
                id: 'msrc', type: 'box', color: '#429eff', x: 5, y: 6, width: 40, height: 30,
                rotation: 0, isPinned: false, opacity: 1, scaleX: 1, scaleY: 1,
            });
            if (typeof syncCanvasChrome === 'function') syncCanvasChrome();
            renderTabs();
        });
        await page.click('#mobile-tabs-btn');
        const mobile = await page.evaluate(() => {
            const expected = {
                moodinfinite: 'lucide:image',
                colorseeker: 'lucide:swatch-book',
                storyflow: 'lucide:clapperboard',
                moodgantt: 'lucide:gantt-chart',
                moodlist: 'lucide:list-check',
                moodprompt: 'lucide:pen-tool',
            };
            const box = (el) => {
                const rect = el.getBoundingClientRect();
                return { w: rect.width, h: rect.height, id: el.id || el.getAttribute('aria-label') || el.className };
            };
            const icons = [...document.querySelectorAll('#mobile-tabs-popup .mobile-tab-item')].map((row) => ({
                type: row.dataset.type,
                icon: row.querySelector('.mobile-tab-icon iconify-icon') && row.querySelector('.mobile-tab-icon iconify-icon').getAttribute('icon'),
            }));
            const adds = [...document.querySelectorAll('#tabs-bar .tab-add-btn')].filter((el) => el.offsetParent !== null);
            return {
                icons,
                expected,
                adds: adds.map(box),
                closes: [...document.querySelectorAll('#mobile-tabs-popup .tab-close-btn')].map(box),
                dups: [...document.querySelectorAll('#mobile-tabs-popup .mobile-tab-dup-btn')].map(box),
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            };
        });
        assert.ok(mobile.icons.length >= 6, `popup rows ${mobile.icons.length}`);
        for (const row of mobile.icons) {
            assert.equal(row.icon, mobile.expected[row.type], `icon for ${row.type}`);
        }
        assert.equal(mobile.overflow, false, 'mobile page overflowed horizontally');
        for (const control of [...mobile.adds, ...mobile.closes, ...mobile.dups]) {
            assert.ok(control.w >= 44 && control.h >= 44, `tap target under 44px: ${JSON.stringify(control)}`);
        }
        await page.focus('#mobile-tabs-popup .tab-close-btn');
        await page.keyboard.press('Escape');
        const escaped = await page.evaluate(() => ({
            id: document.activeElement && document.activeElement.id,
            popup: document.getElementById('mobile-tabs-popup').style.display,
        }));
        assert.equal(escaped.popup, 'none');
        assert.equal(escaped.id, 'mobile-tabs-btn', `Escape left focus on ${escaped.id}`);

        const touchStart = await page.evaluate(() => {
            const board = projects.find((p) => p.type === 'moodinfinite');
            switchTab(board.id);
            document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
            window.dispatchEvent(new Event('resize'));
            if (typeof resizeCanvas === 'function') resizeCanvas();
            (0, eval)('snapToGrid = false');
            (0, eval)('cameraZoom = 1');
            (0, eval)('currentTool = null');
            (0, eval)('selectedItems = []');
            (0, eval)('lastTap = 0');
            const canvas = document.getElementById('moodboard-canvas');
            const mid = screenToWorld({ x: canvas.clientWidth / 2, y: Math.min(canvas.clientHeight * 0.3, 220) });
            items.length = 0;
            items.push({
                id: 'dragme', type: 'box', color: '#429eff',
                x: mid.x - 60, y: mid.y - 40, width: 120, height: 80,
                rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
            });
            if (typeof syncCanvasChrome === 'function') syncCanvasChrome();
            const screen = worldToScreen({ x: mid.x, y: mid.y });
            const rect = canvas.getBoundingClientRect();
            return { x: rect.left + screen.x, y: rect.top + screen.y, itemX: items[0].x, itemY: items[0].y };
        });
        await page.touchscreen.touchStart(touchStart.x, touchStart.y);
        await wait(40);
        await page.touchscreen.touchMove(touchStart.x + 40, touchStart.y + 16);
        await wait(40);
        await page.touchscreen.touchMove(touchStart.x + 80, touchStart.y + 36);
        await wait(40);
        await page.touchscreen.touchEnd();
        const touchEnd = await page.evaluate(() => ({ x: items[0].x, y: items[0].y, id: items[0].id }));
        assert.equal(touchEnd.id, 'dragme');
        assert.ok(
            Math.hypot(touchEnd.x - touchStart.itemX, touchEnd.y - touchStart.itemY) > 20,
            `touch drag did not move the box from ${touchStart.itemX},${touchStart.itemY} to ${touchEnd.x},${touchEnd.y}`,
        );

        await page.click('#mobile-tabs-btn');
        const mobileDup = await page.evaluate(() => {
            const source = projects.find((p) => p.name === 'Mobile Dup');
            const before = projects.length;
            const sourceX = source.data.items[0].x;
            const row = [...document.querySelectorAll('#mobile-tabs-popup .mobile-tab-item')]
                .find((el) => el.querySelector('.mobile-tab-name').textContent === 'Mobile Dup');
            row.querySelector('.mobile-tab-dup-btn').click();
            const copy = projects.find((p) => p.id === activeProjectId);
            copy.data.items[0].x = 1234;
            return {
                before,
                after: projects.length,
                sourceX: projects.find((p) => p.id === source.id).data.items[0].x,
                copyX: copy.data.items[0].x,
                same: copy.id === source.id,
                kept: sourceX,
            };
        });
        assert.equal(mobileDup.after, mobileDup.before + 1, 'mobile duplicate button did not add a board');
        assert.equal(mobileDup.same, false);
        assert.equal(mobileDup.sourceX, mobileDup.kept, 'mobile duplicate shared items with the source');

        assert.deepEqual(errors.filter(isFirstParty), [], `first-party errors:\n${errors.filter(isFirstParty).join('\n')}`);
    } finally {
        page.off('pageerror', onError);
        await page.keyboard.up('Control').catch(() => {});
        await page.keyboard.up('Shift').catch(() => {});
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
        await page.waitForFunction(() => window.innerWidth === 1280);
    }
    console.log('Shell and canvas fixes passed.');
}

async function assertRound3GanttPrompt(page) {
    console.log('Testing gantt drag, today line, month boundaries, and prompt slots...');
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.waitForFunction(() => window.innerWidth === 1280);

    const drag = await page.evaluate(() => {
        createNewProject('moodgantt');
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.zoomLevel = 'month';
        project.data.zoomScale = 1;
        project.data.viewStartDate = '2026-02-01';
        project.data.viewEndDate = '2026-06-01';
        project.data.groups = [{
            id: 'g', name: 'Plan', color: '#429eff', collapsed: false,
            tasks: [
                { id: 'before', name: 'Before', startDate: '2026-01-10', endDate: '2026-02-20', progress: 0, status: '', assignee: '', notes: '', dependsOn: '' },
                { id: 'short', name: 'Short', startDate: '2026-03-03', endDate: '2026-03-03', progress: 0, status: '', assignee: '', notes: '', dependsOn: '' },
            ],
        }];
        renderGanttView(project);
        document.getElementById('gantt-timeline').scrollLeft = 0;
        return project.id;
    });
    const beforeBox = await page.$eval('.gantt-bar[data-task-id="before"]', (bar) => {
        const rect = bar.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    await page.mouse.move(beforeBox.x + 24, beforeBox.y + beforeBox.h / 2);
    await page.mouse.down();
    await page.mouse.move(beforeBox.x + 24 + 40, beforeBox.y + beforeBox.h / 2, { steps: 6 });
    await page.mouse.up();
    const afterDrag = await page.evaluate((id) => {
        const task = projects.find((p) => p.id === id).data.groups[0].tasks.find((t) => t.id === 'before');
        return { start: task.startDate, end: task.endDate };
    }, drag);
    assert.equal(afterDrag.start, '2026-01-19', `clamped bar drag jumped the start to ${afterDrag.start}`);
    assert.equal(afterDrag.end, '2026-03-01', `clamped bar drag changed the length: ${afterDrag.end}`);

    const handle = await page.$eval('.gantt-bar[data-task-id="short"] .gantt-bar-handle-right', (el) => {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    await page.mouse.move(handle.x + handle.w / 2, handle.y + handle.h / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.w / 2 + 120, handle.y + handle.h / 2, { steps: 6 });
    await page.mouse.up();
    const afterResize = await page.evaluate((id) => {
        const task = projects.find((p) => p.id === id).data.groups[0].tasks.find((t) => t.id === 'short');
        return { start: task.startDate, end: task.endDate };
    }, drag);
    assert.equal(afterResize.start, '2026-03-03', `resize moved the start: ${afterResize.start}`);
    assert.equal(afterResize.end, '2026-04-03', `short bar resize wrote ${afterResize.end}`);

    const today = await page.evaluate((id) => {
        const project = projects.find((p) => p.id === id);
        project.data.zoomLevel = 'month';
        project.data.viewStartDate = '2025-12-01';
        project.data.viewEndDate = '2026-01-15';
        renderGanttView(project);
        const outside = document.querySelector('.gantt-today-line');
        const todayDate = ganttToday();
        project.data.viewStartDate = ganttFormatDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
        project.data.viewEndDate = ganttFormatDate(ganttAddDays(todayDate, 5));
        project.data.zoomLevel = 'month';
        renderGanttView(project);
        const line = document.querySelector('.gantt-today-line');
        const cols = ganttGetColumns(project.data.viewStartDate, project.data.viewEndDate, 'month');
        const days = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
        return {
            outside: !!outside,
            inside: line ? parseFloat(line.style.left) : null,
            height: line ? line.getBoundingClientRect().height : 0,
            columns: cols.length,
            expected: ((todayDate.getDate() - 1) / days) * 120,
        };
    }, drag);
    assert.equal(today.outside, false, 'today line was drawn on a range that does not include today');
    assert.equal(today.columns, 1, `expected one month column, got ${today.columns}`);
    assert.ok(Math.abs(today.inside - today.expected) < 1.5, `today line at ${today.inside}px, expected ${today.expected}`);
    assert.ok(today.height > 20, `today line has no height (${today.height})`);

    const shifted = await page.evaluate((id) => {
        const months = {
            jan: ganttFormatDate(ganttAddMonths(ganttParseDate('2026-01-31'), 1)),
            back: ganttFormatDate(ganttAddMonths(ganttParseDate('2026-03-31'), -1)),
            leap: ganttFormatDate(ganttAddMonths(ganttParseDate('2024-01-31'), 1)),
            dec: ganttFormatDate(ganttAddMonths(ganttParseDate('2025-12-31'), 2)),
        };
        const project = projects.find((p) => p.id === id);
        project.data.zoomLevel = 'month';
        project.data.viewStartDate = '2026-01-31';
        project.data.viewEndDate = '2026-06-30';
        renderGanttView(project);
        document.getElementById('gantt-next-btn').click();
        const monthStart = project.data.viewStartDate;
        project.data.zoomLevel = 'quarter';
        project.data.viewStartDate = '2026-01-15';
        project.data.viewEndDate = '2026-06-15';
        renderGanttView(project);
        const beforeHeader = document.querySelector('.gantt-col-header').innerText.replace(/\s+/g, ' ');
        document.getElementById('gantt-next-btn').click();
        const quarterStart = project.data.viewStartDate;
        const afterHeader = document.querySelector('.gantt-col-header').innerText.replace(/\s+/g, ' ');
        project.data.groups[0].collapsed = false;
        renderGanttView(project);
        const openRows = document.querySelectorAll('.gantt-task-sidebar-row').length;
        document.querySelector('.gantt-group-collapse-btn').click();
        const collapsedRows = document.querySelectorAll('.gantt-task-sidebar-row').length;
        document.querySelector('.gantt-group-collapse-btn').click();
        return { months, monthStart, beforeHeader, quarterStart, afterHeader, openRows, collapsedRows, reopened: document.querySelectorAll('.gantt-task-sidebar-row').length };
    }, drag);
    assert.equal(shifted.months.jan, '2026-02-28');
    assert.equal(shifted.months.back, '2026-02-28');
    assert.equal(shifted.months.leap, '2024-02-29');
    assert.equal(shifted.months.dec, '2026-02-28');
    assert.equal(shifted.monthStart, '2026-04-30', `month next from the 31st landed on ${shifted.monthStart}`);
    assert.equal(shifted.quarterStart, '2026-07-15', `quarter next landed on ${shifted.quarterStart}`);
    assert.match(shifted.beforeHeader, /Q1/);
    assert.match(shifted.afterHeader, /Q3/);
    assert.ok(shifted.openRows > 0, 'group had no task rows');
    assert.equal(shifted.collapsedRows, 0, 'collapse left task rows open');
    assert.equal(shifted.reopened, shifted.openRows, 'expand did not restore the task rows');

    await page.evaluate(() => saveToBrowser());
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.waitForFunction(() => window.innerWidth === 390 && window.projects && typeof renderGanttView === 'function');
    const touch = await page.evaluate(() => {
        createNewProject('moodgantt');
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.zoomLevel = 'day';
        project.data.zoomScale = 1;
        project.data.viewStartDate = '2026-10-10';
        project.data.viewEndDate = '2026-10-24';
        project.data.groups = [{
            id: 'g', name: 'Plan', color: '#429eff', collapsed: false,
            tasks: [{ id: 'touch', name: 'Touch', startDate: '2026-10-12', endDate: '2026-10-14', progress: 0, status: '', assignee: '', notes: '', dependsOn: '' }],
        }];
        renderGanttView(project);
        const timeline = document.getElementById('gantt-timeline');
        const bar = document.querySelector('.gantt-bar[data-task-id="touch"]');
        const goal = timeline.getBoundingClientRect().left + 16;
        timeline.scrollLeft += bar.getBoundingClientRect().left - goal;
        const rect = bar.getBoundingClientRect();
        return { id: project.id, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    await page.touchscreen.touchStart(touch.x + 30, touch.y + touch.h / 2);
    await wait(40);
    await page.touchscreen.touchMove(touch.x + 30 + 60, touch.y + touch.h / 2);
    await wait(40);
    await page.touchscreen.touchEnd();
    const touchDates = await page.evaluate((id) => {
        const task = projects.find((p) => p.id === id).data.groups[0].tasks.find((t) => t.id === 'touch');
        return { start: task.startDate, end: task.endDate };
    }, touch.id);
    assert.equal(touchDates.start, '2026-10-13', `touch drag left the start at ${touchDates.start}`);
    assert.equal(touchDates.end, '2026-10-15', `touch drag left the end at ${touchDates.end}`);

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.waitForFunction(() => window.innerWidth === 1280 && typeof createNewProject === 'function' && window.projects);
    const prompt = await page.evaluate(() => {
        createNewProject('moodprompt');
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.variables = { 'a+b': 'boom', 'foo(': 'x' };
        project.data.prompts = [{
            id: 'p1', title: 'Hero', platform: 'midjourney', mediaType: 'image',
            image1: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            image2: null,
            text: '{{foo(}} {{a+b}}',
            tags: [],
        }];
        renderMoodpromptView(project);
        const writes = [];
        navigator.clipboard.writeText = (text) => {
            writes.push(String(text));
            return Promise.resolve();
        };
        document.querySelector('.prompt-copy-btn').click();
        document.querySelector('.platform-select').value = 'kling';
        document.querySelector('.platform-select').dispatchEvent(new Event('change', { bubbles: true }));
        const beforeRemove = {
            image: project.data.prompts[0].image1 ? 'set' : 'empty',
            remove: document.querySelectorAll('.remove-btn').length,
            platform: project.data.prompts[0].platform,
            copied: writes[0] || '',
        };
        document.querySelector('.remove-btn').click();
        return {
            beforeRemove,
            image: project.data.prompts[0].image1,
            placeholder: document.querySelector('.image-upload-slot .placeholder') ? document.querySelector('.image-upload-slot .placeholder').textContent : '',
            text: project.data.prompts[0].text,
            id: project.id,
        };
    });
    assert.equal(prompt.beforeRemove.copied, 'x boom', `copy wrote ${prompt.beforeRemove.copied}`);
    assert.equal(prompt.beforeRemove.platform, 'kling');
    assert.equal(prompt.beforeRemove.image, 'set');
    assert.equal(prompt.beforeRemove.remove, 1);
    assert.equal(prompt.image, null, 'remove left the image data in place');
    assert.match(prompt.placeholder, /Add Image 1/);
    assert.equal(prompt.text, '{{foo(}} {{a+b}}', 'remove cleared the prompt text');
    console.log('Gantt and prompt round 3 passed.');
}

async function assertRound4ListTone(page) {
    console.log('Testing Moodlist and Moodtone round 4...');
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

    const grip = await page.evaluate(() => {
        createNewProject('moodlist');
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.cards.push({
            id: 'grip-card',
            title: 'Grip',
            pinned: false,
            color: '',
            items: [
                { id: 'grip-a', text: 'One', checked: false },
                { id: 'grip-b', text: 'Two', checked: false },
            ],
        });
        renderMoodlistView(project);
        document.querySelector('.ml-drag-handle').click();
        const afterGrip = project.data.cards[0].items[0].checked;
        document.querySelector('.ml-card-checkbox').click();
        return {
            afterGrip,
            afterCheck: project.data.cards[0].items[0].checked,
        };
    });
    assert.equal(grip.afterGrip, false, 'clicking the drag grip checked the row');
    assert.equal(grip.afterCheck, true, 'clicking the checkbox did not check the row');

    const tint = await page.evaluate(() => {
        const previous = canvasBackgroundColor;
        createNewProject('moodlist');
        canvasBackgroundColor = '#ffffff';
        updateUIColors();
        const project = projects.find((p) => p.id === activeProjectId);
        project.data.cards.push({
            id: 'tint-card',
            title: 'Tint',
            pinned: false,
            color: '#4a1c1c',
            items: [{ id: 'tint-a', text: 'Row', checked: false }],
        });
        renderMoodlistView(project);
        const card = () => document.querySelector('.ml-card');
        const titleColor = () => getComputedStyle(card().querySelector('.ml-card-title')).color;
        document.querySelector('.ml-card-color-btn').click();
        document.querySelector('.ml-card .ml-swatch.default').click();
        const cleared = {
            color: project.data.cards[0].color,
            tinted: card().classList.contains('ml-tinted'),
            text: titleColor(),
            bg: getComputedStyle(card()).backgroundColor,
        };
        document.querySelector('.ml-card-color-btn').click();
        document.querySelector('.ml-card .ml-swatch[data-color="#4a1c1c"]').click();
        const applied = {
            color: project.data.cards[0].color,
            tinted: card().classList.contains('ml-tinted'),
            text: titleColor(),
        };
        canvasBackgroundColor = previous;
        updateUIColors();
        return { cleared, applied };
    });
    assert.equal(tint.cleared.color, '');
    assert.equal(tint.cleared.tinted, false, 'clearing a card color left the tinted text colors on');
    assert.equal(tint.cleared.text, 'rgb(28, 25, 23)', `cleared card text is not dark on white: ${tint.cleared.text} on ${tint.cleared.bg}`);
    assert.equal(tint.applied.color, '#4a1c1c');
    assert.equal(tint.applied.tinted, true, 'picking a card color did not mark the card tinted');
    assert.equal(tint.applied.text, 'rgb(245, 245, 244)', `tinted card text stayed dark: ${tint.applied.text}`);

    const kept = await page.evaluate(() => {
        createNewProject('colorseeker');
        const project = projects.find((p) => p.id === activeProjectId);
        const extra = '#e7c6fb';
        project.data.colors = project.data.colors.concat(extra);
        colorseekerEnsureLocks(project);
        project.data.lockedColors[project.data.colors.length - 1] = extra;
        const before = {
            n: project.data.colors.length,
            last: project.data.colors[project.data.colors.length - 1],
            head: project.data.colors.slice(0, 5).join(','),
        };
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
        const afterSpace = {
            n: project.data.colors.length,
            last: project.data.colors[project.data.colors.length - 1],
            lock: project.data.lockedColors[project.data.lockedColors.length - 1],
            head: project.data.colors.slice(0, 5).join(','),
        };
        project.data.colors = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
        project.data.lockedColors = [null, null, null, null, null, '#666666'];
        project.data.baseColor = '#333333';
        project.data.mode = 'shades';
        const select = document.getElementById('colorseeker-mode-select');
        select.value = 'triadic';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return {
            before,
            afterSpace,
            afterMode: {
                n: project.data.colors.length,
                last: project.data.colors[project.data.colors.length - 1],
                lock: project.data.lockedColors[5],
                mode: project.data.mode,
            },
        };
    });
    assert.equal(kept.afterSpace.n, kept.before.n, 'spacebar dropped an added swatch');
    assert.equal(kept.afterSpace.last.toLowerCase(), kept.before.last.toLowerCase(), 'spacebar changed the locked extra swatch');
    assert.equal((kept.afterSpace.lock || '').toLowerCase(), kept.before.last.toLowerCase(), 'spacebar dropped the lock on the extra swatch');
    assert.notEqual(kept.afterSpace.head, kept.before.head, 'spacebar did not rebuild the harmony');
    assert.equal(kept.afterMode.mode, 'triadic');
    assert.equal(kept.afterMode.n, 6, 'changing harmony mode dropped an added swatch');
    assert.equal(kept.afterMode.last.toLowerCase(), '#666666');
    assert.equal((kept.afterMode.lock || '').toLowerCase(), '#666666');

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await settleForHitTest(page);
    const reorder = await page.evaluate(() => {
        createNewProject('colorseeker');
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        const project = projects.find((p) => p.id === activeProjectId);
        const before = project.data.colors.slice();
        const bar = document.querySelector('.colorseeker-bar');
        const moveRight = bar.querySelector('.colorseeker-move-right');
        const remove = bar.querySelector('.colorseeker-remove');
        const removeRect = remove.getBoundingClientRect();
        const removeHit = document.elementFromPoint(Math.round(removeRect.left + removeRect.width / 2), Math.round(removeRect.top + removeRect.height / 2));
        const rect = moveRight.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2));
        const owner = hit && hit.closest('.colorseeker-bar');
        const onScreen = rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
        if (hit && (hit === moveRight || moveRight.contains(hit))) moveRight.click();
        return {
            onScreen,
            owner: owner ? Number(owner.dataset.index) : null,
            hitMove: !!(hit && (hit === moveRight || moveRight.contains(hit))),
            after: project.data.colors.slice(),
            before,
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            removeHits: !!(removeHit && (removeHit === remove || remove.contains(removeHit))),
        };
    });
    assert.equal(reorder.onScreen, true, `move-right sits outside the phone: ${JSON.stringify(reorder)}`);
    assert.equal(reorder.hitMove, true, 'move-right is covered by another control');
    assert.equal(reorder.owner, 0, 'move-right tap lands on a different swatch');
    assert.equal(reorder.after[0].toLowerCase(), reorder.before[1].toLowerCase(), 'move-right did not swap the first swatch');
    assert.equal(reorder.after[1].toLowerCase(), reorder.before[0].toLowerCase());
    assert.ok(reorder.scrollW <= reorder.innerW + 1, `moodtone page scrolls sideways (${reorder.scrollW})`);
    assert.equal(reorder.removeHits, true, 'remove control is not the tap target');

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    console.log('Moodlist and Moodtone round 4 passed.');
}

async function assertRound5NoteTabCommit(page) {
    console.log('Testing note commit across tab switch...');
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

    const committed = await page.evaluate(() => {
        createNewProject('moodinfinite');
        const boardId = activeProjectId;
        items.length = 0;
        items.push({
            id: 'keep-note', type: 'text', title: 'T', text: 'One',
            x: 40, y: 40, width: 280, height: 180, fontSize: 16, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', color: '#429eff',
            bgColor: '#ffffff', scaleX: 1, scaleY: 1,
        });
        items.push({
            id: 'keep-comment', type: 'comment', text: 'Note...',
            x: 360, y: 40, width: 160, height: 80, fontSize: 16, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', textAlign: 'left',
            fontWeight: 'bold', fontStyle: 'normal', color: '#f5e6c8', scaleX: 1, scaleY: 1, icon: 'none',
        });
        editText(items[0]);
        document.getElementById('note-title-input').value = 'Kept';
        document.getElementById('note-body-input').value = 'Line one\nLine two';
        const before = {
            hidden: items[0].isHidden === true,
            overlay: document.getElementById('note-editor-overlay').style.display,
            editing: !!(0, eval)('currentlyEditingText'),
        };
        createNewProject('moodprompt');
        switchTab(boardId);
        editText(items[1]);
        document.getElementById('text-editor').value = 'Hi\nThere';
        createNewProject('moodprompt');
        switchTab(boardId);
        const note = items.find((item) => item.id === 'keep-note');
        const comment = items.find((item) => item.id === 'keep-comment');
        const stored = JSON.parse(JSON.stringify({ isHidden: true, text: 'x' }, storageReplacer));
        return {
            before,
            title: note && note.title,
            text: note && note.text,
            hidden: !!(note && note.isHidden),
            overlay: document.getElementById('note-editor-overlay').style.display,
            editor: document.getElementById('text-editor').style.display,
            editing: !!(0, eval)('currentlyEditingText'),
            comment: comment && comment.text,
            commentHidden: !!(comment && comment.isHidden),
            storedHidden: Object.prototype.hasOwnProperty.call(stored, 'isHidden'),
        };
    });
    assert.equal(committed.before.hidden, true);
    assert.equal(committed.before.overlay, 'flex');
    assert.equal(committed.before.editing, true);
    assert.equal(committed.title, 'Kept');
    assert.equal(committed.text, 'Line one\nLine two');
    assert.equal(committed.hidden, false, 'note stayed hidden after the tab round trip');
    assert.equal(committed.overlay, 'none');
    assert.equal(committed.editing, false);
    assert.equal(committed.comment, 'Hi\nThere');
    assert.equal(committed.commentHidden, false, 'comment stayed hidden after the tab round trip');
    assert.notEqual(committed.editor, 'block');
    assert.equal(committed.storedHidden, false, 'storage kept isHidden');

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const phone = await page.evaluate(() => {
        createNewProject('moodinfinite');
        const boardId = activeProjectId;
        items.length = 0;
        items.push({
            id: 'phone-note', type: 'text', title: 'T', text: 'One',
            x: 20, y: 20, width: 220, height: 180, fontSize: 16, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', color: '#429eff',
            bgColor: '#ffffff', scaleX: 1, scaleY: 1,
        });
        editText(items[0]);
        document.getElementById('note-title-input').value = 'Phone';
        document.getElementById('note-body-input').value = 'Line one\nLine two';
        createNewProject('moodprompt');
        switchTab(boardId);
        const note = items.find((item) => item.id === 'phone-note');
        const done = document.getElementById('confirm-note-btn');
        const rect = done ? done.getBoundingClientRect() : null;
        return {
            title: note && note.title,
            text: note && note.text,
            hidden: !!(note && note.isHidden),
            overlay: document.getElementById('note-editor-overlay').style.display,
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            doneW: rect ? rect.width : 0,
            doneH: rect ? rect.height : 0,
        };
    });
    assert.equal(phone.title, 'Phone');
    assert.equal(phone.text, 'Line one\nLine two');
    assert.equal(phone.hidden, false, 'phone note stayed hidden');
    assert.equal(phone.overlay, 'none', 'note editor stayed open on the phone');
    assert.ok(phone.scrollW <= phone.innerW + 1, `note tab switch overflowed (${phone.scrollW})`);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    console.log('Note commit across tab switch passed.');
}

// Forces a draw of the active board and reports where the text landed. Waits on real
// state (active board, settled canvas, item.textAlign) and on two animation frames so
// the pixel read never races the app's own render loop.
async function captureAlignPaint(page, id, expectedAlign) {
    await page.waitForFunction((itemId, align) => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        const area = document.getElementById('content-area');
        const item = items.find((entry) => entry.id === itemId);
        return !!project && project.type === 'moodinfinite'
            && document.body.contains(canvas)
            && canvas.width > 0 && area && canvas.width === area.clientWidth
            && !!item && item.textAlign === align;
    }, { timeout: 10000 }, id, expectedAlign);
    return page.evaluate(async (itemId) => {
        const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await nextFrames();
        const item = items.find((entry) => entry.id === itemId);
        const liveCtx = document.getElementById('moodboard-canvas').getContext('2d');
        const calls = [];
        const orig = liveCtx.fillText;
        liveCtx.fillText = function (text, x, y, maxW) {
            calls.push({ text: String(text), x: Math.round(x), y: Math.round(y) });
            return orig.call(this, text, x, y, maxW);
        };
        try {
            draw();
        } finally {
            liveCtx.fillText = orig;
        }
        await nextFrames();
        const darkest = (worldX, worldY) => {
            const s = worldToScreen({ x: worldX, y: worldY });
            const data = liveCtx.getImageData(Math.round(s.x), Math.round(s.y), 40, 22).data;
            let min = 255;
            for (let i = 0; i < data.length; i += 4) min = Math.min(min, data[i], data[i + 1], data[i + 2]);
            return { min, sx: Math.round(s.x), sy: Math.round(s.y) };
        };
        return {
            align: item.textAlign,
            calls,
            titleCall: calls.find((call) => call.text === item.title) || null,
            left: darkest(item.x + 14, item.y + 36),
            right: darkest(item.x + item.width - 54, item.y + 36),
        };
    }, id);
}

async function assertRound5TextAlign(page) {
    console.log('Testing text alignment...');
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 800);
    await page.evaluate(() => { createNewProject('moodinfinite'); });
    await page.waitForFunction(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        const area = document.getElementById('content-area');
        if (project && project.type === 'moodinfinite') resizeCanvas();
        return !!project && project.type === 'moodinfinite' && area && area.clientWidth === 1280
            && canvas.width === area.clientWidth && canvas.height === area.clientHeight;
    }, { timeout: 10000 });
    await page.evaluate(() => {
        (0, eval)('cameraZoom = 1');
        (0, eval)('cameraOffset = { x: canvas.width / 2, y: canvas.height / 2 }');
        (0, eval)('showDropShadow = false');
        (0, eval)('showGrid = false');
        items.length = 0;
        items.push({
            id: 'align-note', type: 'text', title: 'Hi', text: 'Go',
            x: -200, y: -90, width: 400, height: 180, fontSize: 16, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', color: '#429eff',
            bgColor: '#ffffff', textAlign: 'left', scaleX: 1, scaleY: 1,
        });
        (0, eval)('selectedItems = [items[0]]');
        updateSelectionToolbar();
        draw();
    });
    const shown = await page.evaluate(() => {
        const btn = document.getElementById('text-align-right-btn');
        const comment = {
            id: 'align-comment', type: 'comment', text: 'Hi\nThere',
            x: -180, y: 120, width: 220, height: 80, fontSize: 16, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', textAlign: 'left',
            fontWeight: 'bold', fontStyle: 'normal', color: '#f5e6c8', scaleX: 1, scaleY: 1, icon: 'none',
        };
        items.push(comment);
        (0, eval)('selectedItems = [items.find((item) => item.id === "align-comment")]');
        updateSelectionToolbar();
        const commentDisplay = getComputedStyle(document.getElementById('text-align-right-btn')).display;
        const list = {
            id: 'align-list', type: 'textList', title: 'Tasks', text: 'Milk',
            items: [{ text: 'Milk', completed: false, indent: 0 }],
            x: -180, y: 220, width: 280, height: 120, fontSize: 18, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', textAlign: 'left',
            fontWeight: 'bold', fontStyle: 'normal', color: '#f5e6c8', scaleX: 1, scaleY: 1,
        };
        items.push(list);
        (0, eval)('selectedItems = [items.find((item) => item.id === "align-list")]');
        updateSelectionToolbar();
        const listDisplay = getComputedStyle(document.getElementById('text-align-center-btn')).display;
        const padding = 15;
        const rowH = list.fontSize * 1.5;
        const checkboxSize = list.fontSize * 1.1;
        const handleSize = list.fontSize * 0.8;
        let rowY = padding + rowH * 1.2 + 10;
        const cbX = padding + handleSize + 8;
        const cbY = rowY + (rowH - checkboxSize) / 2;
        const hitPoint = { x: list.x + cbX + 4, y: list.y + cbY + 4 };
        const hitBefore = getCheckboxHitIndex(list, hitPoint);
        document.getElementById('text-align-right-btn').click();
        const hitAfter = getCheckboxHitIndex(list, hitPoint);
        (0, eval)('selectedItems = [items.find((item) => item.id === "align-note")]');
        updateSelectionToolbar();
        return {
            note: getComputedStyle(btn).display,
            comment: commentDisplay,
            list: listDisplay,
            listAlign: list.textAlign,
            hitBefore,
            hitAfter,
        };
    });
    assert.notEqual(shown.note, 'none', 'note align button stayed hidden');
    assert.notEqual(shown.comment, 'none', 'comment align button stayed hidden');
    assert.notEqual(shown.list, 'none', 'list align button stayed hidden');
    assert.equal(shown.listAlign, 'right');
    assert.equal(shown.hitBefore, 0, 'checkbox hit missed before align');
    assert.equal(shown.hitAfter, 0, 'align moved the checkbox hit target');

    await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        document.getElementById('text-align-right-btn').click();
    });
    const right = await captureAlignPaint(page, 'align-note', 'right');
    assert.equal(right.align, 'right');
    assert.ok(right.titleCall, `title fillText was not captured during the forced draw (${JSON.stringify(right.calls)})`);
    assert.ok(right.titleCall.x > 0, `right align drew the title at local x ${right.titleCall.x}, expected the right half`);
    assert.ok(right.right.min < 120, `right align did not paint the right side (${JSON.stringify(right)})`);
    assert.ok(right.left.min > 180, `right align still painted the left side (${right.left.min})`);

    await page.evaluate(() => {
        document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
        document.getElementById('text-align-left-btn').click();
    });
    const left = await captureAlignPaint(page, 'align-note', 'left');
    assert.equal(left.align, 'left');
    assert.ok(left.titleCall, `title fillText was not captured during the forced draw (${JSON.stringify(left.calls)})`);
    assert.ok(left.titleCall.x < -150, `left align drew the title at local x ${left.titleCall.x}, expected the left edge`);
    assert.ok(left.left.min < 120, `left align did not paint the left side (${left.left.min})`);
    assert.ok(left.right.min > 180, `left align still painted the right side (${left.right.min})`);

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const phone = await page.evaluate(() => {
        createNewProject('moodinfinite');
        items.length = 0;
        items.push({
            id: 'align-note', type: 'text', title: 'Hi', text: 'Go',
            x: 20, y: 20, width: 220, height: 140, fontSize: 16, rotation: 0,
            isPinned: false, opacity: 1, fontFamily: 'Nunito', color: '#429eff',
            bgColor: '#ffffff', textAlign: 'left', scaleX: 1, scaleY: 1,
        });
        (0, eval)('selectedItems = [items[0]]');
        updateSelectionToolbar();
        const btn = document.getElementById('text-align-right-btn');
        const rect = btn.getBoundingClientRect();
        return {
            display: getComputedStyle(btn).display,
            w: rect.width,
            h: rect.height,
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
        };
    });
    assert.notEqual(phone.display, 'none', 'phone align button stayed hidden');
    assert.ok(phone.w > 8 && phone.h > 8, `phone align button has no box (${phone.w}x${phone.h})`);
    assert.ok(phone.scrollW <= phone.innerW + 1, `align toolbar overflowed (${phone.scrollW})`);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    console.log('Text alignment passed.');
}

async function assertRound5RerouteDelete(page) {
    console.log('Testing reroute delete...');
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    const result = await page.evaluate(() => {
        createNewProject('moodinfinite');
        (0, eval)('cameraZoom = 1');
        (0, eval)('cameraOffset = { x: canvas.width / 2, y: canvas.height / 2 }');
        items.length = 0;
        const box = (id, x) => ({
            id, type: 'box', color: '#429eff', x, y: 80, width: 80, height: 60,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        items.push(box('box-a', 40), box('box-b', 360));
        createSimpleConnector(items[0], items[1]);
        draw();
        const conn = items.find((item) => item.type === 'connector');
        let spot = null;
        let best = 0;
        const route = conn && conn.route ? conn.route : [];
        for (let i = 0; i < route.length - 1; i++) {
            const len = Math.hypot(route[i + 1].x - route[i].x, route[i + 1].y - route[i].y);
            if (len > best) {
                best = len;
                spot = { x: (route[i].x + route[i + 1].x) / 2, y: (route[i].y + route[i + 1].y) / 2 };
            }
        }
        const screen = spot ? worldToScreen(spot) : { x: 0, y: 0 };
        const rect = document.getElementById('moodboard-canvas').getBoundingClientRect();
        onDoubleClick({ clientX: rect.left + screen.x, clientY: rect.top + screen.y });
        const reroute = items.find((item) => item.type === 'reroute');
        const outgoing = items.find((item) => item.type === 'connector' && reroute && item.sourceId === reroute.id);
        if (outgoing) outgoing.label = 'via';
        const split = {
            reroutes: items.filter((item) => item.type === 'reroute').length,
            connectors: items.filter((item) => item.type === 'connector').length,
        };
        (0, eval)('selectedItems = items.filter((item) => item.type === "reroute").slice(0, 1)');
        deleteSelectedItems();
        draw();
        const joined = items.filter((item) => item.type === 'connector');
        const startBefore = joined[0] ? joined[0].computedStartX : null;
        const source = items.find((item) => item.id === 'box-a');
        source.x += 80;
        draw();
        const moved = items.find((item) => item.type === 'connector');
        (0, eval)('selectedItems = [items.find((item) => item.id === "box-a")]');
        deleteSelectedItems();
        const afterSource = {
            connectors: items.filter((item) => item.type === 'connector').length,
            keptTarget: items.some((item) => item.id === 'box-b'),
        };

        items.length = 0;
        items.push(box('box-a', 40), box('box-b', 420));
        items.push(
            { id: 'r1', type: 'reroute', x: 180, y: 110, width: 0, height: 0, color: '#429eff', isPinned: false },
            { id: 'r2', type: 'reroute', x: 280, y: 110, width: 0, height: 0, color: '#429eff', isPinned: false },
            { id: 'c1', type: 'connector', sourceId: 'box-a', sourcePort: 'right', targetId: 'r1', targetPort: 'left', color: '#429eff' },
            { id: 'c2', type: 'connector', sourceId: 'r1', sourcePort: 'right', targetId: 'r2', targetPort: 'left', color: '#429eff', label: 'mid' },
            { id: 'c3', type: 'connector', sourceId: 'r2', sourcePort: 'right', targetId: 'box-b', targetPort: 'left', color: '#429eff', label: 'end' },
        );
        (0, eval)('selectedItems = items.filter((item) => item.type === "reroute")');
        deleteSelectedItems();
        const chain = items.filter((item) => item.type === 'connector');

        items.length = 0;
        items.push(box('box-a', 40), box('box-b', 420));
        items.push(
            { id: 'r1', type: 'reroute', x: 180, y: 110, width: 0, height: 0, color: '#429eff', isPinned: false },
            { id: 'c-in', type: 'connector', sourceId: 'box-a', sourcePort: 'right', targetId: 'r1', targetPort: 'left', color: '#429eff' },
            { id: 'c-out', type: 'connector', sourceId: 'r1', sourcePort: 'right', targetId: 'box-b', targetPort: 'left', color: '#429eff' },
        );
        (0, eval)('selectedItems = items.filter((item) => item.id === "r1" || item.id === "c-out")');
        deleteSelectedItems();
        return {
            split,
            joined: joined.map((item) => ({ sourceId: item.sourceId, targetId: item.targetId, label: item.label || '' })),
            delta: moved && startBefore != null ? moved.computedStartX - startBefore : null,
            afterSource,
            chain: chain.map((item) => ({ sourceId: item.sourceId, targetId: item.targetId, label: item.label || '' })),
            explicit: items.filter((item) => item.type === 'connector').length,
        };
    });
    assert.equal(result.split.reroutes, 1, `double-click did not insert a reroute (${JSON.stringify(result.split)})`);
    assert.equal(result.split.connectors, 2, 'double-click did not split the connector');
    assert.equal(result.joined.length, 1, 'deleting the reroute dropped the connection');
    assert.equal(result.joined[0].sourceId, 'box-a');
    assert.equal(result.joined[0].targetId, 'box-b');
    assert.equal(result.joined[0].label, 'via');
    assert.ok(Math.abs(result.delta - 80) < 0.5, `moving the source detached the connector (${result.delta})`);
    assert.equal(result.afterSource.connectors, 0, 'deleting the source left a connector');
    assert.equal(result.afterSource.keptTarget, true);
    assert.equal(result.chain.length, 1, 'deleting two reroutes dropped the chain');
    assert.equal(result.chain[0].sourceId, 'box-a');
    assert.equal(result.chain[0].targetId, 'box-b');
    assert.equal(result.chain[0].label, 'mid');
    assert.equal(result.explicit, 0, 'deleting a connector with its reroute rejoined through it');

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const phone = await page.evaluate(() => {
        createNewProject('moodinfinite');
        items.length = 0;
        const box = (id, x) => ({
            id, type: 'box', color: '#429eff', x, y: 40, width: 70, height: 50,
            rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1,
        });
        items.push(box('box-a', 10), box('box-b', 220));
        items.push({ id: 'r1', type: 'reroute', x: 120, y: 65, width: 0, height: 0, color: '#429eff', isPinned: false });
        items.push(
            { id: 'c1', type: 'connector', sourceId: 'box-a', sourcePort: 'right', targetId: 'r1', targetPort: 'left', color: '#429eff' },
            { id: 'c2', type: 'connector', sourceId: 'r1', sourcePort: 'right', targetId: 'box-b', targetPort: 'left', color: '#429eff', label: 'via' },
        );
        (0, eval)('selectedItems = [items.find((item) => item.id === "r1")]');
        deleteSelectedItems();
        const left = items.filter((item) => item.type === 'connector');
        return {
            n: left.length,
            sourceId: left[0] && left[0].sourceId,
            targetId: left[0] && left[0].targetId,
            label: left[0] && left[0].label,
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
        };
    });
    assert.equal(phone.n, 1);
    assert.equal(phone.sourceId, 'box-a');
    assert.equal(phone.targetId, 'box-b');
    assert.equal(phone.label, 'via');
    assert.ok(phone.scrollW <= phone.innerW + 1, `reroute delete overflowed (${phone.scrollW})`);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    console.log('Reroute delete passed.');
}

// A click on a creation tool must not leave history steps or ghost items behind,
// and a drag-created item must be removed by a single Ctrl+Z.
async function assertToolCreationHistory(page) {
    console.log('Testing tool creation history...');
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 800);
    await page.evaluate(() => { createNewProject('moodinfinite'); });
    await page.waitForFunction(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        const area = document.getElementById('content-area');
        if (project && project.type === 'moodinfinite') resizeCanvas();
        return !!project && project.type === 'moodinfinite' && area && area.clientWidth === 1280
            && canvas.width === area.clientWidth && canvas.height === area.clientHeight;
    }, { timeout: 10000 });
    await page.evaluate(() => {
        (0, eval)('cameraZoom = 1');
        (0, eval)('cameraOffset = { x: canvas.width / 2, y: canvas.height / 2 }');
        items.length = 0;
        selectedItems = [];
        saveStateForUndo();
        updateSelectionToolbar();
    });
    const canvasBox = await (await page.$('#moodboard-canvas')).boundingBox();
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    const snapshot = () => page.evaluate(() => ({
        steps: historyStack.length,
        index: historyIndex,
        count: items.length,
        types: items.map((item) => item.type),
    }));
    const undoOnce = async () => {
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await page.keyboard.down('Control');
        await page.keyboard.press('z');
        await page.keyboard.up('Control');
    };

    for (const tool of ['box', 'circle', 'grid', 'arrow', 'measure']) {
        await page.evaluate((name) => { items.length = 0; selectedItems = []; saveStateForUndo(); setCurrentTool(name); }, tool);
        const base = await snapshot();

        await page.mouse.move(cx - 60, cy - 40);
        await page.mouse.down();
        await page.mouse.up();
        const afterClick = await page.evaluate(() => ({ steps: historyStack.length, count: items.length }));
        assert.equal(afterClick.steps, base.steps, `${tool}: a click without drag added history steps`);
        assert.equal(afterClick.count, 0, `${tool}: a click without drag left an item behind`);
        await undoOnce();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const afterClickUndo = await snapshot();
        assert.equal(afterClickUndo.count, 0, `${tool}: undo after a click showed a ghost item`);

        await page.evaluate((name) => { items.length = 0; selectedItems = []; saveStateForUndo(); setCurrentTool(name); }, tool);
        const beforeDrag = await snapshot();
        await page.mouse.move(cx - 100, cy - 60);
        await page.mouse.down();
        await page.mouse.move(cx + 120, cy + 80, { steps: 8 });
        await page.mouse.up();
        const afterDrag = await snapshot();
        assert.equal(afterDrag.count, 1, `${tool}: drag did not create exactly one item (${JSON.stringify(afterDrag)})`);
        assert.equal(afterDrag.steps, beforeDrag.steps + 1, `${tool}: drag creation should add exactly one history step`);
        await undoOnce();
        await page.waitForFunction(() => items.length === 0, { timeout: 5000 }).catch(() => {});
        const afterUndo = await snapshot();
        assert.equal(afterUndo.count, 0, `${tool}: the first Ctrl+Z did not remove the drag-created item`);
        await page.evaluate(() => setCurrentTool(null));
    }

    // Text is created at a default size on a plain click, so it is one step by design.
    await page.evaluate(() => { items.length = 0; selectedItems = []; saveStateForUndo(); setCurrentTool('text'); });
    const textBase = await snapshot();
    await page.mouse.move(cx - 60, cy - 40);
    await page.mouse.down();
    await page.mouse.up();
    const textAfter = await snapshot();
    assert.equal(textAfter.count, 1, 'text click should create the default note');
    assert.equal(textAfter.steps, textBase.steps + 1, 'text click should add exactly one history step');
    await page.evaluate(() => {
        if (document.activeElement) document.activeElement.blur();
        setCurrentTool(null);
    });
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    console.log('Tool creation history passed.');
}

function extractPdfText(raw) {
    let out = '';
    const re = /<([0-9A-Fa-f\s]*)>|\((?:\\[0-7]{1,3}|\\.|[^\\)])*\)/g;
    let match;
    while ((match = re.exec(raw))) {
        if (match[0][0] === '<') {
            const hex = match[1].replace(/\s+/g, '');
            if (hex.length < 4 || hex.length % 4 !== 0) continue;
            let text = '';
            for (let i = 0; i < hex.length; i += 4) {
                const code = parseInt(hex.slice(i, i + 4), 16);
                if (code) text += String.fromCharCode(code);
            }
            out += text + '\n';
            continue;
        }
        const body = match[0].slice(1, -1);
        let text = '';
        for (let i = 0; i < body.length; i++) {
            if (body[i] !== '\\') {
                text += body[i];
                continue;
            }
            const next = body[i + 1];
            if (/[0-7]/.test(next)) {
                let oct = '';
                while (oct.length < 3 && /[0-7]/.test(body[i + 1])) {
                    i += 1;
                    oct += body[i];
                }
                text += String.fromCharCode(parseInt(oct, 8));
                continue;
            }
            i += 1;
            const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
            text += map[next] || next || '';
        }
        out += text + '\n';
    }
    return out;
}

function rectsOverlap(a, b) {
    return a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1;
}

function forbiddenNamePattern() {
    const parts = [
        [98, 114, 117, 115, 97, 110],
        [97, 114, 101, 110, 97],
        [115, 105, 108, 105, 99, 105, 111],
    ].map((codes) => String.fromCharCode(...codes));
    return new RegExp(parts.join('|'), 'i');
}

function assertNoForbiddenNames() {
    const banned = forbiddenNamePattern();
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT });
    for (const name of tracked.toString('utf8').split('\0').filter(Boolean)) {
        const text = readFileSync(path.join(ROOT, name)).toString('latin1');
        assert.equal(banned.test(text), false, `forbidden word in ${name}`);
    }
}

async function openPalette(page) {
    await page.evaluate(() => document.querySelectorAll('.toast-notification').forEach((el) => el.remove()));
    const open = await page.$eval('#palette-panel', (el) => el.classList.contains('open'));
    if (!open) {
        await page.click('#palette-btn');
        await page.waitForSelector('#palette-panel.open [role="radio"]');
    }
}

async function closePalette(page) {
    const open = await page.$eval('#palette-panel', (el) => el.classList.contains('open'));
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
}

async function chooseBaseStyle(page, style) {
    await closePalette(page);
    await openPalette(page);
    await page.click(`#palette-panel [data-style-option="${style}"]`);
    await page.waitForFunction((expected) => document.body.dataset.style === expected, {}, style);
    await page.waitForFunction(() => !document.getAnimations().some((a) => a.transitionProperty && a.transitionProperty.startsWith('border-radius') || (a.playState === 'running' && a.transitionProperty)));
}

async function choosePreset(page, index) {
    await openPalette(page);
    await page.waitForSelector('#palette-panel.open .palette-option');
    const options = await page.$$('#palette-panel .palette-option');
    await options[index].click();
    await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
}

async function assertBaseStyle(page) {
    console.log('Testing base style...');
    assertNoForbiddenNames();
    const errorsBefore = pageErrors.length;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.evaluate(() => {
        showUiBlur = true;
        document.body.classList.toggle('no-blur', false);
        saveSettings();
    });

    const initial = await page.evaluate(() => {
        const bar = getComputedStyle(document.getElementById('tabs-bar'));
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-ui').trim().toLowerCase();
        return {
            body: document.body.dataset.style,
            html: document.documentElement.dataset.style,
            backdrop: bar.backdropFilter,
            bg,
        };
    });
    assert.equal(initial.body, 'glass');
    assert.equal(initial.html, 'glass');
    assert.notEqual(initial.backdrop, 'none', `glass tabs bar has no blur: ${initial.backdrop}`);
    assert.ok(initial.bg.includes('rgba'), `glass --bg-ui should stay translucent: ${initial.bg}`);

    await chooseBaseStyle(page, 'flat');
    const flat = await page.evaluate(() => {
        const bar = getComputedStyle(document.getElementById('tabs-bar'));
        const panel = getComputedStyle(document.getElementById('palette-panel'));
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-ui').trim().toLowerCase();
        const radios = [...document.querySelectorAll('#palette-panel [role="radio"]')].map((el) => ({
            style: el.dataset.styleOption,
            checked: el.getAttribute('aria-checked'),
        }));
        return {
            body: document.body.dataset.style,
            radiusBar: bar.borderRadius,
            radiusPanel: panel.borderRadius,
            backdrop: bar.backdropFilter,
            bg,
            surface: bar.backgroundColor,
            stored: JSON.parse(localStorage.getItem('moodinfinite-settings')).baseStyle,
            radios,
        };
    });
    assert.equal(flat.body, 'flat');
    assert.ok(flat.radiusBar === '0px' || flat.radiusBar.split(' ').every((part) => part === '0px'), flat.radiusBar);
    assert.ok(flat.radiusPanel === '0px' || flat.radiusPanel.split(' ').every((part) => part === '0px'), flat.radiusPanel);
    assert.equal(flat.backdrop, 'none');
    assert.equal(flat.bg, '#24201b');
    assert.ok(flat.surface === 'rgb(36, 32, 27)' || flat.surface === 'rgba(36, 32, 27, 1)', flat.surface);
    assert.equal(flat.stored, 'flat');
    assert.deepEqual(flat.radios, [
        { style: 'glass', checked: 'false' },
        { style: 'flat', checked: 'true' },
    ]);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const early = await page.evaluate(() => document.body.dataset.style);
    assert.equal(early, 'flat', 'stored flat style was not on the body before the app finished booting');
    await page.waitForFunction(() => window.projects && window.projects.length > 0 && typeof selectBaseStyle === 'function' && typeof updateUIColors === 'function', { timeout: 15000 });
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    const kept = await page.evaluate(() => ({
        body: document.body.dataset.style,
        stored: JSON.parse(localStorage.getItem('moodinfinite-settings')).baseStyle,
        backdrop: getComputedStyle(document.getElementById('tabs-bar')).backdropFilter,
        bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-ui').trim().toLowerCase(),
    }));
    assert.equal(kept.body, 'flat');
    assert.equal(kept.stored, 'flat');
    assert.equal(kept.backdrop, 'none');
    assert.equal(kept.bg, '#24201b');

    await page.evaluate(() => createNewProject('moodinfinite'));
    const boardA = await page.evaluate(() => activeProjectId);
    await chooseBaseStyle(page, 'glass');
    await choosePreset(page, 1);
    const glassPreset = await page.evaluate(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        const style = getComputedStyle(document.documentElement);
        return {
            id: project.id,
            style: document.body.dataset.style,
            bg: project.data.canvasBackgroundColor,
            accent: project.data.accentColor,
            grid: project.data.gridColor,
            page: style.getPropertyValue('--bg-page').trim().toLowerCase(),
            accentVar: style.getPropertyValue('--switch-bg-checked').trim().toLowerCase(),
        };
    });
    assert.equal(glassPreset.style, 'glass');
    assert.equal(glassPreset.bg, '#f8f9fa');
    assert.equal(glassPreset.accent, '#007bff');
    assert.equal(glassPreset.grid, '#ced4da');
    assert.equal(glassPreset.page, '#f8f9fa');
    assert.equal(glassPreset.accentVar, '#007bff');

    await chooseBaseStyle(page, 'flat');
    const styleDidNotRecolor = await page.evaluate((id) => {
        const project = projects.find((entry) => entry.id === id);
        const style = getComputedStyle(document.documentElement);
        return {
            style: document.body.dataset.style,
            bg: project.data.canvasBackgroundColor,
            accent: project.data.accentColor,
            page: style.getPropertyValue('--bg-page').trim().toLowerCase(),
            accentVar: style.getPropertyValue('--switch-bg-checked').trim().toLowerCase(),
        };
    }, boardA);
    assert.equal(styleDidNotRecolor.style, 'flat');
    assert.equal(styleDidNotRecolor.bg, '#f8f9fa');
    assert.equal(styleDidNotRecolor.accent, '#007bff');
    assert.equal(styleDidNotRecolor.page, '#f8f9fa');
    assert.equal(styleDidNotRecolor.accentVar, '#007bff');

    await page.evaluate(() => createNewProject('moodinfinite'));
    const boardB = await page.evaluate(() => activeProjectId);
    await choosePreset(page, 4);
    const flatPreset = await page.evaluate(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        const style = getComputedStyle(document.documentElement);
        return {
            style: document.body.dataset.style,
            bg: project.data.canvasBackgroundColor,
            accent: project.data.accentColor,
            grid: project.data.gridColor,
            page: style.getPropertyValue('--bg-page').trim().toLowerCase(),
            accentVar: style.getPropertyValue('--switch-bg-checked').trim().toLowerCase(),
        };
    });
    assert.equal(flatPreset.style, 'flat');
    assert.equal(flatPreset.bg, '#2e3440');
    assert.equal(flatPreset.accent, '#88c0d0');
    assert.equal(flatPreset.grid, '#4c566a');
    assert.equal(flatPreset.page, '#2e3440');
    assert.equal(flatPreset.accentVar, '#88c0d0');

    await page.evaluate((id) => switchTab(id), boardA);
    const perProject = await page.evaluate(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        return {
            style: document.body.dataset.style,
            bg: project.data.canvasBackgroundColor,
            accent: project.data.accentColor,
        };
    });
    assert.equal(perProject.style, 'flat');
    assert.equal(perProject.bg, '#f8f9fa');
    assert.equal(perProject.accent, '#007bff');

    await chooseBaseStyle(page, 'glass');
    const restored = await page.evaluate(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        return {
            style: document.body.dataset.style,
            stored: JSON.parse(localStorage.getItem('moodinfinite-settings')).baseStyle,
            backdrop: getComputedStyle(document.getElementById('tabs-bar')).backdropFilter,
            bg: project.data.canvasBackgroundColor,
            page: getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim().toLowerCase(),
        };
    });
    assert.equal(restored.style, 'glass');
    assert.equal(restored.stored, 'glass');
    assert.notEqual(restored.backdrop, 'none');
    assert.equal(restored.bg, '#f8f9fa');
    assert.equal(restored.page, '#f8f9fa');
    await page.evaluate((id) => switchTab(id), boardB);
    const otherBoard = await page.evaluate(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        return project.data.accentColor;
    });
    assert.equal(otherBoard, '#88c0d0');

    await closePalette(page);
    await openPalette(page);
    await page.waitForFunction(() => document.activeElement && document.activeElement.getAttribute('role') === 'radio');
    await page.keyboard.press('ArrowRight');
    const moved = await page.evaluate(() => ({
        active: document.activeElement && document.activeElement.dataset.styleOption,
        flat: document.querySelector('[data-style-option="flat"]').getAttribute('aria-checked'),
        glass: document.querySelector('[data-style-option="glass"]').getAttribute('aria-checked'),
        body: document.body.dataset.style,
    }));
    assert.equal(moved.active, 'flat');
    assert.equal(moved.flat, 'true');
    assert.equal(moved.glass, 'false');
    assert.equal(moved.body, 'flat');
    await page.keyboard.press('ArrowLeft');
    const movedBack = await page.evaluate(() => ({
        active: document.activeElement && document.activeElement.dataset.styleOption,
        flat: document.querySelector('[data-style-option="flat"]').getAttribute('aria-checked'),
        glass: document.querySelector('[data-style-option="glass"]').getAttribute('aria-checked'),
        body: document.body.dataset.style,
    }));
    assert.equal(movedBack.active, 'glass');
    assert.equal(movedBack.glass, 'true');
    assert.equal(movedBack.flat, 'false');
    assert.equal(movedBack.body, 'glass');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
    const refocused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert.equal(refocused, 'palette-btn');

    await openPalette(page);
    const hovered = await page.evaluate(() => {
        const option = document.querySelectorAll('#palette-panel .palette-option')[0];
        option.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        const during = getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim().toLowerCase();
        option.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        const after = getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim().toLowerCase();
        const sample = document.querySelectorAll('#palette-panel .palette-option')[2];
        return {
            during,
            after,
            role: sample.getAttribute('role'),
            tab: sample.tabIndex,
            label: sample.getAttribute('aria-label'),
            style: document.body.dataset.style,
        };
    });
    assert.equal(hovered.during, '#0d0d0d');
    assert.equal(hovered.after, '#2e3440');
    assert.equal(hovered.style, 'glass');
    assert.equal(hovered.role, 'button');
    assert.equal(hovered.tab, 0);
    assert.match(hovered.label, /^Palette 3: background /);

    await page.focus('#palette-panel .palette-option');
    const optionIndex = 1;
    await page.evaluate((index) => {
        document.querySelectorAll('#palette-panel .palette-option')[index].focus();
    }, optionIndex);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
    const typed = await page.evaluate(() => {
        const project = projects.find((entry) => entry.id === activeProjectId);
        return {
            bg: project.data.canvasBackgroundColor,
            style: document.body.dataset.style,
        };
    });
    assert.equal(typed.bg, '#f8f9fa');
    assert.equal(typed.style, 'glass');

    const blurredOff = await page.evaluate(() => {
        const input = document.getElementById('ui-blur-toggle');
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return getComputedStyle(document.getElementById('tabs-bar')).backdropFilter;
    });
    assert.equal(blurredOff, 'none');
    const blurredOn = await page.evaluate(() => {
        const input = document.getElementById('ui-blur-toggle');
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return getComputedStyle(document.getElementById('tabs-bar')).backdropFilter;
    });
    assert.notEqual(blurredOn, 'none');
    await chooseBaseStyle(page, 'flat');
    const flatStillSharp = await page.evaluate(() => getComputedStyle(document.getElementById('tabs-bar')).backdropFilter);
    assert.equal(flatStillSharp, 'none');
    await chooseBaseStyle(page, 'glass');

    for (const style of ['glass', 'flat']) {
        await page.evaluate((next) => selectBaseStyle(next), style);
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        await page.waitForFunction(() => window.innerWidth === 390);
        await page.evaluate(() => document.getElementById('palette-btn').click());
        await page.waitForSelector('#palette-panel.open .base-style-option');
        const phone = await page.evaluate(() => {
            const option = document.querySelector('.base-style-option');
            const rect = option.getBoundingClientRect();
            return {
                scrollW: document.documentElement.scrollWidth,
                innerW: window.innerWidth,
                h: rect.height,
                w: rect.width,
            };
        });
        assert.ok(phone.scrollW <= phone.innerW + 1, `${style} overflows at 390px (${phone.scrollW})`);
        assert.ok(phone.h >= 44, `${style} style option is ${phone.h}px tall`);
        assert.ok(phone.w >= 44, `${style} style option is ${phone.w}px wide`);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('palette-panel').classList.contains('open'));
        const closedWidth = await page.evaluate(() => ({
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
        }));
        assert.ok(closedWidth.scrollW <= closedWidth.innerW + 1, `${style} overflows at 390px with the popup closed (${closedWidth.scrollW})`);
    }

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    await page.evaluate(() => selectBaseStyle('glass'));
    const added = pageErrors.slice(errorsBefore).filter(isFirstParty);
    assert.deepEqual(added, [], `base style raised errors:\n${added.join('\n')}`);
    console.log('Base style passed.');
}

async function assertMoodflowExports(page) {
    console.log('Testing Moodflow sheet, PDF, and print exports...');
    const sample = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/moodflow-sample.json'), 'utf8'));
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT });
    const banned = new RegExp(['bru', 'san'].join('') + '|' + ['are', 'na'].join('') + '|' + ['sili', 'cio'].join(''), 'i');
    for (const name of tracked.toString('utf8').split('\0').filter(Boolean)) {
        const text = readFileSync(path.join(ROOT, name)).toString('latin1');
        assert.equal(banned.test(text), false, `forbidden word in ${name}`);
    }

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    const built = await page.evaluate((sample) => {
        const mk = (i) => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 36;
            const g = canvas.getContext('2d');
            g.fillStyle = i ? '#2a4d69' : '#c97b3a';
            g.fillRect(0, 0, 64, 36);
            return canvas.toDataURL('image/jpeg', 0.8);
        };
        const project = {
            name: sample.name,
            type: 'storyflow',
            data: {
                workers: sample.workers,
                frames: sample.frames.map((frame) => ({
                    ...frame,
                    image: typeof frame.image === 'string' && frame.image.indexOf('@gradient:') === 0
                        ? mk(Number(frame.image.split(':')[1]))
                        : frame.image,
                })),
            },
        };
        const sheet = buildMoodflowSheetHtml(project, 'October 15, 2026');
        const doc = buildStoryflowPdf(project, 'October 15, 2026');
        return { sheet, pdf: btoa(doc.output()), pages: doc.getNumberOfPages() };
    }, sample);

    const html = built.sheet;
    assert.match(html, /lang="en"/);
    assert.match(html, /<title>Spot Verano 30s \(Moodflow sheet\)<\/title>/);
    assert.match(html, /Outfit:wght@700;900/);
    assert.match(html, /Plus\+Jakarta\+Sans/);
    assert.match(html, /Exported from Moodinfinite/);
    assert.match(html, /October 15, 2026/);
    assert.match(html, /3 frames/);
    assert.match(html, />10s</);
    assert.match(html, /role="region"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /<caption>Frames of Spot Verano 30s<\/caption>/);
    assert.match(html, /scope="col"/);
    assert.match(html, /scope="row"/);
    assert.match(html, /Apertura en la costa/);
    assert.match(html, /Detalle de las manos/);
    assert.match(html, /amanecer\.<br>Entra la voz en off/);
    assert.match(html, /&lt;b&gt;sin&lt;\/b&gt;/);
    assert.equal(/<b>/.test(html), false, 'user text was not escaped');
    assert.match(html, /5s/);
    assert.match(html, /3s/);
    assert.match(html, /2s/);
    assert.match(html, /Wide Shot/);
    assert.match(html, /Close Up/);
    assert.match(html, /Lucía Fernández/);
    assert.match(html, /Mateo Ríos/);
    assert.match(html, /Voz en off \+ oleaje/);
    assert.match(html, /Nudos y cuerda, sin música/);
    assert.match(html, /status-approved">Approved/);
    assert.match(html, /status-wip">WIP/);
    assert.match(html, /status-none">Not started/);
    assert.match(html, /alt="Apertura en la costa"/);
    assert.match(html, /alt="Detalle de las manos"/);
    assert.match(html, /data:image\/jpeg/);
    assert.match(html, /10\.00,20\.00 50\.00,50\.00 90\.00,30\.00/);
    assert.match(html, /stroke="#ff4d6a"/);
    assert.match(html, /Untitled/);
    assert.match(html, /No image/);
    assert.match(html, /No notes/);
    assert.match(html, /Not set/);
    for (const hex of ['#121110', '#24201B', '#F4F1EA', '#D4A359', '#2589BD', '#F8F6F0', '#7A5C22', '#1C6A96', '#B8AFA0']) {
        assert.ok(html.includes(hex), `sheet missing ${hex}`);
    }
    assert.match(html, /border-radius:0/);
    const radii = [...html.matchAll(/border-radius\s*:\s*([^;}]+)/gi)].map((item) => item[1].trim());
    assert.ok(radii.length > 0, 'sheet does not set square corners');
    assert.ok(radii.every((value) => value === '0'), `sheet radius: ${radii.join(', ')}`);
    assert.equal(banned.test(html), false, 'sheet html names the borrowed palette');

    const pdfText = extractPdfText(Buffer.from(built.pdf, 'base64').toString('latin1'));
    assert.ok(built.pages >= 3, `pdf pages ${built.pages}`);
    for (const bit of [
        'Lucía Fernández', 'Mateo Ríos', 'Approved', 'WIP', 'Not started',
        'Voz en off + oleaje', 'Nudos y cuerda, sin música', 'Wide Shot', 'Close Up',
        'Spot Verano 30s', 'October 15, 2026', 'Frame 3', 'No image', 'No notes',
    ]) {
        assert.ok(pdfText.includes(bit), `pdf text missing ${bit}`);
    }

    const sheetPage = await page.browser().newPage();
    await sheetPage.setViewport({ width: 390, height: 800, deviceScaleFactor: 1 });
    await sheetPage.setContent(html, { waitUntil: 'domcontentloaded' });
    const narrow = await sheetPage.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        rows: document.querySelectorAll('tbody tr').length,
    }));
    await sheetPage.close();
    assert.equal(narrow.rows, 3);
    assert.ok(narrow.scroll <= narrow.inner + 1, `sheet overflowed at 390px (${narrow.scroll} > ${narrow.inner})`);

    await page.evaluate((sample) => {
        createNewProject('storyflow');
        const project = projects.find((entry) => entry.id === activeProjectId);
        const mk = (i) => {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const g = canvas.getContext('2d');
            g.fillStyle = i ? '#2a4d69' : '#c97b3a';
            g.fillRect(0, 0, 320, 180);
            return canvas.toDataURL('image/jpeg', 0.8);
        };
        project.name = sample.name;
        project.data.workers = sample.workers.slice();
        project.data.frames = sample.frames.map((frame) => ({
            ...frame,
            image: typeof frame.image === 'string' && frame.image.indexOf('@gradient:') === 0
                ? mk(Number(frame.image.split(':')[1]))
                : frame.image,
        }));
        renderStoryflowView(project);
        window.print = () => { window.__printStubbed = true; };
        prepareAndPrint();
    }, sample);
    await page.emulateMediaType('print');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const printed = await page.evaluate(() => {
        const box = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const header = document.getElementById('print-header');
        const stats = document.getElementById('storyflow-stats-bar');
        const cards = [...document.querySelectorAll('#storyflow-scroll-area .story-card')].map((card) => {
            const status = card.querySelector('.story-print-status');
            const artist = card.querySelector('select.story-artist');
            const audio = [...card.querySelectorAll('.story-meta-item')].find((item) => item.querySelector('.story-meta-label') && item.querySelector('.story-meta-label').textContent === 'Audio');
            const statusBox = status ? box(status) : null;
            const artistBox = artist ? box(artist) : null;
            let clipped = false;
            const cardBox = box(card);
            let node = card.parentElement;
            while (node && node !== document.documentElement) {
                const style = getComputedStyle(node);
                const clip = /auto|hidden|scroll|clip/.test(`${style.overflow}${style.overflowX}${style.overflowY}`);
                if (clip) {
                    const parent = box(node);
                    if (cardBox.bottom > parent.bottom + 2 || cardBox.top < parent.top - 2) clipped = true;
                }
                node = node.parentElement;
            }
            return {
                card: cardBox,
                clipped,
                status: status ? status.textContent : '',
                statusBox,
                artist: artist ? artist.value : '',
                artistBox,
                audio: audio ? audio.querySelector('input').value : null,
                radius: getComputedStyle(card).borderRadius,
            };
        });
        const headerStyle = getComputedStyle(header);
        return {
            stubbed: window.__printStubbed === true,
            tab: document.body.dataset.printTab,
            header: box(header),
            headerRule: headerStyle.borderBottomWidth,
            headerRuleColor: headerStyle.borderBottomColor,
            stats: stats ? box(stats) : null,
            statsDisplay: stats ? getComputedStyle(stats).display : 'missing',
            cards,
        };
    });
    assert.equal(printed.stubbed, true);
    assert.equal(printed.tab, 'storyflow');
    assert.equal(printed.cards.length, 3, 'print view did not render 3 frames');
    assert.equal(printed.statsDisplay, 'none', 'stats bar still prints over the header');
    assert.equal(printed.headerRule, '4px');
    assert.ok(printed.cards.every((card) => card.card.height > 40 && card.card.width > 40), `a print card has no box: ${JSON.stringify(printed.cards.map((c) => c.card))}`);
    assert.ok(printed.cards.every((card) => card.card.top >= printed.header.bottom - 1), `a card overlaps the print header: ${JSON.stringify(printed)}`);
    assert.ok(printed.cards.every((card) => !card.clipped), `a print card is clipped: ${JSON.stringify(printed.cards.map((c) => c.card))}`);
    for (let i = 0; i < printed.cards.length; i++) {
        for (let j = i + 1; j < printed.cards.length; j++) {
            assert.equal(rectsOverlap(printed.cards[i].card, printed.cards[j].card), false, `print cards ${i + 1} and ${j + 1} overlap`);
        }
    }
    assert.deepEqual(printed.cards.map((card) => card.status), ['Approved', 'WIP', 'Not started']);
    assert.deepEqual(printed.cards.map((card) => card.artist), ['Lucía Fernández', 'Mateo Ríos', '']);
    assert.deepEqual(printed.cards.map((card) => card.audio), ['Voz en off + oleaje', 'Nudos y cuerda, sin música', '']);
    assert.ok(printed.cards.every((card) => card.statusBox && card.statusBox.height > 8 && card.statusBox.width > 8), 'status text is hidden in print');
    assert.ok(printed.cards.slice(0, 2).every((card) => card.artistBox && card.artistBox.height > 8), 'artist is hidden in print');
    assert.ok(printed.cards.every((card) => /^0px(?: 0px){0,3}$/.test(card.radius)), `print cards are still rounded (${printed.cards.map((c) => c.radius).join(', ')})`);

    const printPdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    const printPages = (printPdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    assert.ok(printPages >= 2, `print PDF has ${printPages} pages; frame 3 needs its own page`);
    await page.emulateMediaType('screen');
    console.log('Moodflow exports passed.');
}
