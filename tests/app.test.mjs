/**
 * Drives the served Moodinfinite page: board tabs, serialize/save,
 * undo, and the canvas hot path versus the captured f8023f0 baseline.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
    page.on('console', (msg) => consoleLines.push(`${msg.type()}: ${msg.text()}`));
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.projects && window.projects.length > 0 && typeof draw === 'function' && typeof renderMoodlistView === 'function', { timeout: 15000 });

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
