/**
 * Tests CloudSync Drive API optimizations, bug fixes, and smart tab-suspension/idle behavior.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.CLOUD_TEST_PORT || '41733';

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

async function runTests() {
    const server = startServer();
    let browser;
    try {
        await waitForServer(PORT);
        browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));

        await page.evaluateOnNewDocument(() => {
            // Deterministic clock & timer harness (activated after page boot)
            let fakeNow = 1_700_000_000_000;
            let nextTimerId = 100000;
            let fakeTimersActive = false;
            const timers = new Map();
            const realDateNow = Date.now.bind(Date);
            const nativeSetTimeout = window.setTimeout.bind(window);
            const nativeClearTimeout = window.clearTimeout.bind(window);
            const nativeSetInterval = window.setInterval.bind(window);
            const nativeClearInterval = window.clearInterval.bind(window);

            Date.now = () => (fakeTimersActive ? fakeNow : realDateNow());

            window.setTimeout = (fn, delay = 0, ...args) => {
                if (!fakeTimersActive) {
                    return nativeSetTimeout(fn, delay, ...args);
                }
                const id = nextTimerId++;
                timers.set(id, {
                    id,
                    fn,
                    args,
                    runAt: fakeNow + Math.max(0, Number(delay) || 0),
                    interval: null,
                });
                return id;
            };

            window.clearTimeout = (id) => {
                if (timers.has(id)) {
                    timers.delete(id);
                } else {
                    nativeClearTimeout(id);
                }
            };

            window.setInterval = (fn, delay = 0, ...args) => {
                if (!fakeTimersActive) {
                    return nativeSetInterval(fn, delay, ...args);
                }
                const ms = Math.max(1, Number(delay) || 1);
                const id = nextTimerId++;
                timers.set(id, {
                    id,
                    fn,
                    args,
                    runAt: fakeNow + ms,
                    interval: ms,
                });
                return id;
            };

            window.clearInterval = (id) => {
                if (timers.has(id)) {
                    timers.delete(id);
                } else {
                    nativeClearInterval(id);
                }
            };

            window.__activateFakeClock = () => {
                fakeTimersActive = true;
            };

            window.__flushMicrotasks = async (rounds = 8) => {
                for (let i = 0; i < rounds; i++) {
                    await Promise.resolve();
                }
                await new Promise((r) => nativeSetTimeout(r, 0));
            };

            window.__advanceTime = async (ms) => {
                const target = fakeNow + ms;
                while (true) {
                    let next = null;
                    for (const entry of timers.values()) {
                        if (entry.runAt <= target && (!next || entry.runAt < next.runAt)) {
                            next = entry;
                        }
                    }
                    if (!next) break;
                    fakeNow = next.runAt;
                    if (next.interval != null) {
                        next.runAt = fakeNow + next.interval;
                    } else {
                        timers.delete(next.id);
                    }
                    if (typeof next.fn === 'function') {
                        next.fn(...next.args);
                    }
                    await window.__flushMicrotasks(4);
                }
                fakeNow = target;
                await window.__flushMicrotasks(6);
            };

            window.__nativeSleep = (ms) => new Promise((r) => nativeSetTimeout(r, ms));
            window.__clearNativeTimeout = nativeClearTimeout;

            // Controllable document.hidden & navigator.onLine
            let hiddenState = false;
            Object.defineProperty(document, 'hidden', {
                configurable: true,
                get: () => hiddenState,
            });
            window.__setHidden = (val) => {
                hiddenState = Boolean(val);
                document.dispatchEvent(new Event('visibilitychange'));
            };

            let onlineState = true;
            Object.defineProperty(navigator, 'onLine', {
                configurable: true,
                get: () => onlineState,
            });
            window.__setOnline = (val) => {
                onlineState = Boolean(val);
                window.dispatchEvent(new Event(onlineState ? 'online' : 'offline'));
            };

            // Mock Google Identity Services
            let tokenCallback = null;
            window.google = {
                accounts: {
                    oauth2: {
                        initTokenClient(cfg) {
                            tokenCallback = cfg.callback;
                            return {
                                requestAccessToken() {
                                    tokenCallback({
                                        access_token: 'mock-access-token',
                                        expires_in: 3600,
                                    });
                                },
                            };
                        },
                        revoke(_token, cb) {
                            if (typeof cb === 'function') cb();
                        },
                    },
                },
            };

            // Mock Drive API + UserInfo fetch calls
            window.__driveRequests = [];
            window.__driveMock = {
                remoteModifiedTime: '2026-11-25T10:00:00.000Z',
                remoteVersion: '1',
                nextPollStatus: 200,
                nextPollRetryAfter: null,
                remoteBlob: null,
                filesList: [
                    {
                        id: 'file-linked-1',
                        name: 'Board_1.mood',
                        modifiedTime: '2026-11-25T10:00:00.000Z',
                        createdTime: '2026-11-25T09:00:00.000Z',
                        size: '1024',
                        appProperties: { boardType: 'moodinfinite' },
                    },
                    {
                        id: 'file-2',
                        name: 'Board_2.mood',
                        modifiedTime: '2026-11-25T09:30:00.000Z',
                        createdTime: '2026-11-25T09:00:00.000Z',
                        size: '2048',
                        appProperties: { boardType: 'moodinfinite' },
                    },
                ],
            };

            const origFetch = window.fetch.bind(window);
            window.fetch = async (url, opts = {}) => {
                const u = String(url);
                if (u.startsWith('https://www.googleapis.com/')) {
                    window.__driveRequests.push({
                        url: u,
                        method: opts.method || 'GET',
                        time: Date.now(),
                    });

                    if (u.includes('/oauth2/v3/userinfo')) {
                        return new Response(JSON.stringify({
                            name: 'David Test',
                            email: 'david@example.com',
                            picture: '',
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    if (u.includes('/drive/v3/about')) {
                        return new Response(JSON.stringify({
                            storageQuota: { limit: '16106127360', usage: '1048576' },
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    if (u.includes('/upload/drive/v3/files/')) {
                        const id = u.split('/files/')[1].split('?')[0];
                        window.__driveMock.remoteVersion = String(Number(window.__driveMock.remoteVersion) + 1);
                        window.__driveMock.remoteModifiedTime = new Date(Date.now()).toISOString();
                        return new Response(JSON.stringify({
                            id,
                            modifiedTime: window.__driveMock.remoteModifiedTime,
                            version: window.__driveMock.remoteVersion,
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    if (u.includes('/drive/v3/files?q=')) {
                        return new Response(JSON.stringify({
                            files: window.__driveMock.filesList,
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }

                    if (u.includes('alt=media')) {
                        const blob = window.__driveMock.remoteBlob || new Blob(['mock'], { type: 'application/zip' });
                        return new Response(blob, { status: 200 });
                    }

                    if ((opts.method || 'GET') === 'DELETE') {
                        return new Response(null, { status: 204 });
                    }

                    if (u.includes('/drive/v3/files/')) {
                        const status = window.__driveMock.nextPollStatus;
                        if (status !== 200) {
                            const headers = {};
                            if (window.__driveMock.nextPollRetryAfter != null) {
                                headers['Retry-After'] = String(window.__driveMock.nextPollRetryAfter);
                            }
                            window.__driveMock.nextPollStatus = 200;
                            window.__driveMock.nextPollRetryAfter = null;
                            return new Response('Rate limited', { status, headers });
                        }
                        const id = u.split('/files/')[1].split('?')[0];
                        return new Response(JSON.stringify({
                            id,
                            modifiedTime: window.__driveMock.remoteModifiedTime,
                            version: window.__driveMock.remoteVersion,
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }
                }
                return origFetch(url, opts);
            };
        });

        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => Boolean(window.CloudSync && window.projects && window.projects.length > 0), { timeout: 15000 });

        // 1. Activate fake clock, sign in and prepare a linked board + a local-only board
        const setupInfo = await page.evaluate(async () => {
            window.__activateFakeClock();
            window.dispatchEvent(new Event('pointerdown'));
            await CloudSync.signIn();
            await window.__flushMicrotasks();

            const linked = window.projects[0];
            linked.name = 'Board_1';
            linked.data._cloudFileId = 'file-linked-1';
            linked.data._cloudModifiedTime = window.__driveMock.remoteModifiedTime;
            linked.data._cloudVersion = '1';
            linked.data._cloudSaved = Date.now();
            linked.data._isDirty = false;
            linked.data._needsMergeOrReload = false;

            const localOnly = {
                id: 'local-board-id',
                name: 'LocalOnlyBoard',
                type: 'moodlist',
                data: {
                    items: [],
                    _localModified: Date.now() + 5000,
                    _isDirty: true,
                },
            };
            window.projects.push(localOnly);
            window.activeProjectId = linked.id;
            CloudSync.updateIndicator();
            window.__driveRequests.length = 0;

            return {
                isLoggedIn: CloudSync.isLoggedIn,
                isSuspended: CloudSync.isSuspended,
            };
        });
        assert.equal(setupInfo.isLoggedIn, true);
        assert.equal(setupInfo.isSuspended, false);

        // 2. Linked save uses 1 single PATCH request & updates metadata
        const saveRes = await page.evaluate(async () => {
            window.__driveRequests.length = 0;
            await CloudSync.saveCurrentProject(false);
            await window.__flushMicrotasks();
            const active = window.projects[0];
            return {
                reqs: [...window.__driveRequests],
                isDirty: active.data._isDirty,
                cloudVersion: active.data._cloudVersion,
                cloudModifiedTime: active.data._cloudModifiedTime,
            };
        });
        assert.equal(saveRes.reqs.length, 1, `Expected 1 Drive request on linked save, got ${saveRes.reqs.length}`);
        assert.equal(saveRes.reqs[0].method, 'PATCH');
        assert.ok(saveRes.reqs[0].url.includes('uploadType=media&fields=id,modifiedTime,version'));
        assert.equal(saveRes.isDirty, false);
        assert.equal(saveRes.cloudVersion, '2');

        // 3. Adaptive polling: 2m -> 3m -> 5m when user remains active, then idle at 3m without activity
        const pollIntervals = await page.evaluate(async () => {
            window.__driveRequests.length = 0;
            // First poll fires at 120s
            await window.__advanceTime(120_000);
            const after120 = window.__driveRequests.length;

            // Keep user active so idle timer doesn't fire before 180s poll
            window.dispatchEvent(new Event('pointerdown'));
            await window.__advanceTime(120_000);
            const before300 = window.__driveRequests.length;

            window.dispatchEvent(new Event('pointerdown'));
            await window.__advanceTime(60_000);
            const after300 = window.__driveRequests.length;

            // Third poll should wait 300s (step 2); keep active at +150s
            window.dispatchEvent(new Event('pointerdown'));
            await window.__advanceTime(150_000);
            const before600 = window.__driveRequests.length;

            window.dispatchEvent(new Event('pointerdown'));
            await window.__advanceTime(150_000);
            const after600 = window.__driveRequests.length;

            // Now stop activity and advance 180s -> should suspend for idle
            await window.__advanceTime(180_000);
            return {
                after120,
                before300,
                after300,
                before600,
                after600,
                isSuspended: CloudSync.isSuspended,
                suspendReason: CloudSync.suspendReason,
            };
        });
        assert.equal(pollIntervals.after120, 1, 'First adaptive poll should run at 120s');
        assert.equal(pollIntervals.before300, 1, 'Second adaptive poll should wait 180s, not 120s');
        assert.equal(pollIntervals.after300, 2, 'Second adaptive poll should run at +180s');
        assert.equal(pollIntervals.before600, 2, 'Third adaptive poll should wait 300s');
        assert.equal(pollIntervals.after600, 3, 'Third adaptive poll should run at +300s');
        assert.equal(pollIntervals.isSuspended, true, 'Should suspend after 3m (180s) of user inactivity');
        assert.equal(pollIntervals.suspendReason, 'idle');

        // 4. While idle-suspended, advancing 10 more minutes makes 0 requests; pointerdown wakes sync
        const idleWake = await page.evaluate(async () => {
            window.__driveRequests.length = 0;
            await window.__advanceTime(600_000);
            const requestsWhileIdle = window.__driveRequests.length;
            const indicatorPaused = document.getElementById('cloud-sync-indicator').classList.contains('paused');

            window.dispatchEvent(new Event('pointerdown'));
            await window.__flushMicrotasks();
            return {
                requestsWhileIdle,
                indicatorPaused,
                isSuspendedAfterWake: CloudSync.isSuspended,
                requestsAfterWake: window.__driveRequests.length,
            };
        });
        assert.equal(idleWake.requestsWhileIdle, 0, 'Must make 0 Drive calls while idle-suspended');
        assert.equal(idleWake.indicatorPaused, true, 'Indicator should show .paused class while suspended');
        assert.equal(idleWake.isSuspendedAfterWake, false, 'pointerdown should wake idle suspension');
        assert.equal(idleWake.requestsAfterWake, 1, 'Wake after >60s cooldown should perform 1 check');

        // 5. Hidden tab suspension after 60s grace period + 60s wake cooldown
        const hiddenTest = await page.evaluate(async () => {
            window.__driveRequests.length = 0;
            window.__setHidden(true);
            await window.__advanceTime(30_000);
            const suspendedAt30s = CloudSync.isSuspended;
            await window.__advanceTime(30_000);
            const suspendedAt60s = CloudSync.isSuspended;
            const reasonAt60s = CloudSync.suspendReason;

            // Stay hidden for 10 minutes -> 0 requests
            await window.__advanceTime(600_000);
            const reqsWhileHidden = window.__driveRequests.length;

            // Wake up -> triggers 1 check because >60s elapsed
            window.__setHidden(false);
            await window.__flushMicrotasks();
            const reqsOnFirstWake = window.__driveRequests.length;

            // Hide for 60s, wake within 60s cooldown? Wait: hiding 60s makes 60s elapse,
            // so test rapid wake after offline/re-hide:
            window.__setOnline(false);
            await window.__flushMicrotasks();
            const offlineReason = CloudSync.suspendReason;
            window.__setOnline(true);
            await window.__flushMicrotasks();
            const reqsOnRapidWake = window.__driveRequests.length;

            return {
                suspendedAt30s,
                suspendedAt60s,
                reasonAt60s,
                reqsWhileHidden,
                reqsOnFirstWake,
                offlineReason,
                reqsOnRapidWake,
            };
        });
        assert.equal(hiddenTest.suspendedAt30s, false, 'Should not suspend before 60s hidden');
        assert.equal(hiddenTest.suspendedAt60s, true, 'Should suspend after 60s hidden');
        assert.equal(hiddenTest.reasonAt60s, 'hidden');
        assert.equal(hiddenTest.reqsWhileHidden, 0, 'Must make 0 Drive calls while hidden');
        assert.equal(hiddenTest.reqsOnFirstWake, 1, 'Waking from hidden should run 1 check');
        assert.equal(hiddenTest.offlineReason, 'offline');
        assert.equal(hiddenTest.reqsOnRapidWake, 1, 'Rapid wake within 60s cooldown should NOT issue duplicate check');

        // 6. runAutoSave: only linked boards, updates metadata, defers when suspended
        const autosaveTest = await page.evaluate(async () => {
            window.dispatchEvent(new Event('pointerdown'));
            await window.__flushMicrotasks();
            window.__driveRequests.length = 0;

            const linked = window.projects[0];
            linked.data._isDirty = true;
            linked.data._localModified = Date.now() + 1000;

            // Test deferral while suspended
            window.__setOnline(false);
            await CloudSync.runAutoSave();
            const reqsWhileOffline = window.__driveRequests.length;

            // Enable autosave toggle so wake flushes pending autosave, OR call runAutoSave online
            window.__setOnline(true);
            await window.__flushMicrotasks();
            await CloudSync.runAutoSave();
            await window.__flushMicrotasks();

            return {
                reqsWhileOffline,
                reqs: [...window.__driveRequests],
                linkedDirty: linked.data._isDirty,
                linkedModifiedTime: linked.data._cloudModifiedTime,
                remoteModifiedTime: window.__driveMock.remoteModifiedTime,
                localOnlyFileId: window.projects[1].data._cloudFileId || null,
            };
        });
        assert.equal(autosaveTest.reqsWhileOffline, 0);
        assert.equal(autosaveTest.reqs.length, 1, 'runAutoSave should upload only the linked dirty board in 1 PATCH');
        assert.equal(autosaveTest.reqs[0].method, 'PATCH');
        assert.equal(autosaveTest.linkedDirty, false);
        assert.equal(autosaveTest.linkedModifiedTime, autosaveTest.remoteModifiedTime);
        assert.equal(autosaveTest.localOnlyFileId, null, 'Local-only board must NOT be uploaded by runAutoSave');

        // 7. _reloadActiveProject handles real .mood ZIP blob cleanly via reloadCurrentProjectFromBlob
        const reloadTest = await page.evaluate(async () => {
            window.dispatchEvent(new Event('pointerdown'));
            await window.__flushMicrotasks();

            const zip = new window.JSZip();
            const folder = zip.folder('board_1');
            folder.file('data.json', JSON.stringify({
                items: [{ id: 999, type: 'text', text: 'Synced from Drive', x: 10, y: 10, width: 100, height: 40 }],
                globalImageCache: {},
                globalVideoCache: {},
            }));
            window.__driveMock.remoteBlob = await zip.generateAsync({ type: 'blob' });
            window.__driveMock.remoteModifiedTime = '2026-11-25T11:30:00.000Z';
            window.__driveMock.remoteVersion = '99';

            let reloadCalls = 0;
            const origReload = window.reloadCurrentProjectFromBlob;
            window.reloadCurrentProjectFromBlob = async (blob) => {
                reloadCalls++;
                return origReload(blob);
            };

            window.__driveRequests.length = 0;
            // Advance 120s to trigger next poll
            await window.__advanceTime(120_000);
            await window.__flushMicrotasks(12);

            const linked = window.projects[0];
            return {
                reloadCalls,
                cloudVersion: linked.data._cloudVersion,
                cloudModifiedTime: linked.data._cloudModifiedTime,
                itemCount: linked.data.items?.length || 0,
            };
        });
        assert.equal(reloadTest.reloadCalls, 1, 'Remote change should invoke reloadCurrentProjectFromBlob without ZIP JSON.parse error');
        assert.equal(reloadTest.cloudVersion, '99');
        assert.equal(reloadTest.itemCount, 1);

        // 8. 429 backoff stops hammering
        const backoffTest = await page.evaluate(async () => {
            window.dispatchEvent(new Event('pointerdown'));
            await window.__flushMicrotasks();
            window.__driveRequests.length = 0;
            window.__driveMock.nextPollStatus = 429;
            window.__driveMock.nextPollRetryAfter = 240;

            await window.__advanceTime(120_000);
            const reqsAfter429 = window.__driveRequests.length;
            // Next check must respect Retry-After (240s), so advancing 120s more should do 0 calls
            await window.__advanceTime(120_000);
            const reqsBefore240 = window.__driveRequests.length;
            return { reqsAfter429, reqsBefore240 };
        });
        assert.equal(backoffTest.reqsAfter429, 1);
        assert.equal(backoffTest.reqsBefore240, 1, '429 Retry-After must delay next poll');

        // 9. Storage meter 5-min cache & picker delete without re-listing
        const cacheAndPickerTest = await page.evaluate(async () => {
            window.dispatchEvent(new Event('pointerdown'));
            await window.__flushMicrotasks();
            window.__driveRequests.length = 0;

            const btn = document.getElementById('cloud-login-btn');
            const storageEl = document.getElementById('cloud-menu-storage');
            btn.click(); // open menu 1
            for (let i = 0; i < 20 && storageEl.textContent.includes('Loading'); i++) {
                await window.__nativeSleep(5);
            }
            const reqsFirstOpen = window.__driveRequests.length;

            btn.click(); // close
            btn.click(); // open menu 2 within 5m
            await window.__nativeSleep(10);
            const reqsSecondOpen = window.__driveRequests.length;
            btn.click(); // close

            // Open picker and delete second item
            window.__driveRequests.length = 0;
            const openPromise = CloudSync.openFromDrive();
            await window.__flushMicrotasks();
            const reqsAfterList = window.__driveRequests.length;

            const delBtns = document.querySelectorAll('.cloud-picker-delete-btn');
            delBtns[1].click();
            await window.__flushMicrotasks();
            document.getElementById('cloud-delete-confirm-btn').click();
            await window.__flushMicrotasks();
            const reqsAfterDelete = window.__driveRequests.length;
            const remainingItems = document.querySelectorAll('.cloud-picker-item').length;

            document.getElementById('cloud-picker-cancel').click();
            await openPromise;

            return {
                reqsFirstOpen,
                reqsSecondOpen,
                reqsAfterList,
                reqsAfterDelete,
                remainingItems,
            };
        });
        assert.equal(cacheAndPickerTest.reqsFirstOpen, 2, 'First menu open fetches about + files');
        assert.equal(cacheAndPickerTest.reqsSecondOpen, 2, 'Second menu open within 5 min uses cache (0 extra requests)');
        assert.equal(cacheAndPickerTest.reqsAfterList, 1, 'openFromDrive lists files without redundant _ensureFolder');
        assert.equal(cacheAndPickerTest.reqsAfterDelete, 2, 'Deleting in picker makes only DELETE request, no re-list');
        assert.equal(cacheAndPickerTest.remainingItems, 1, 'Picker UI updates remaining items in memory');

        assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join('; ')}`);
        console.log('All CloudSync optimization & smart suspension tests passed.');
    } finally {
        if (browser) await browser.close();
        server.child.kill('SIGTERM');
    }
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
