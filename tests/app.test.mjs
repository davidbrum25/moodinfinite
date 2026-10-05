/**
 * Drives the served Moodinfinite page: board tabs, serialize/save,
 * undo, and the canvas hot path versus the captured f8023f0 baseline.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
        executablePath: '/usr/bin/google-chrome-stable',
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

    const lateErrors = pageErrors.filter(isFirstParty);
    assert.deepEqual(lateErrors, [], `first-party errors:\n${lateErrors.join('\n')}`);
    await browser.close();

    const firefox = await puppeteer.launch({
        browser: 'firefox',
        executablePath: '/usr/bin/firefox',
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
} catch (err) {
    console.error(server.getLog());
    throw err;
} finally {
    server.child.kill('SIGTERM');
}
