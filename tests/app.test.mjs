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
        await page.click('#' + id);
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
} catch (err) {
    console.error(server.getLog());
    throw err;
} finally {
    server.child.kill('SIGTERM');
}
