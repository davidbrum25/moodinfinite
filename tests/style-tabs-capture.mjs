// Screenshots of each board and its notable panels, in flat and glass, on two presets and two viewports.
// Usage: node tests/style-tabs-capture.mjs <outDir>   (CHROME_PATH=/usr/bin/google-chrome)
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'style-tabs-out');
mkdirSync(out, { recursive: true });
const PORT = process.env.PORT || '41781';
const sample = JSON.parse(readFileSync(path.join(ROOT, 'tests/fixtures/moodflow-sample.json'), 'utf8'));
const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function shot(page, name) {
    await page.evaluate(() => {
        document.fonts && document.fonts.ready;
        let style = document.getElementById('cap-no-motion');
        if (!style) {
            style = document.createElement('style');
            style.id = 'cap-no-motion';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.head.appendChild(style);
        }
        const light = document.getElementById('storyflow-lightbox');
        if (light && light.classList.contains('open')) light.style.opacity = '1';
    });
    await new Promise((r) => setTimeout(r, 80));
    await page.screenshot({ path: path.join(out, name) });
}

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.projects && typeof createNewProject === 'function' && typeof selectBaseStyle === 'function' && typeof renderStoryflowView === 'function', { timeout: 20000 });

    const ids = await page.evaluate((sample) => {
        const mk = (hex) => {
            const c = document.createElement('canvas');
            c.width = 640; c.height = 360;
            const g = c.getContext('2d');
            g.fillStyle = hex;
            g.fillRect(0, 0, 640, 360);
            return c.toDataURL('image/jpeg', 0.8);
        };
        createNewProject('moodinfinite');
        const boardId = activeProjectId;
        const mid = screenToWorld({ x: 640, y: 420 });
        const accent = accentColor || '#429eff';
        const base = { rotation: 0, isPinned: false, opacity: 1, scaleX: 1, scaleY: 1 };
        items.push(
            { ...base, id: 'cap-note', type: 'text', text: 'Collect the coastal references here.', title: 'Mood', x: mid.x - 280, y: mid.y - 80, width: 220, height: 140, fontSize: 16, fontFamily: 'Nunito', color: accent },
            { ...base, id: 'cap-box', type: 'box', color: accent, x: mid.x - 20, y: mid.y - 60, width: 120, height: 100, style: 'fill' },
            { ...base, id: 'cap-comment', type: 'comment', text: 'Check the tide.', x: mid.x + 140, y: mid.y - 40, width: 180, height: 70, fontSize: 16, fontFamily: 'Nunito', color: '#f5d76e', icon: 'star' },
            { ...base, id: 'cap-link', type: 'link', url: 'https://example.com', title: 'Reference', x: mid.x - 280, y: mid.y + 90, width: 180, height: 48, color: accent },
            { ...base, id: 'cap-measure', type: 'measure', startX: mid.x + 20, startY: mid.y + 120, endX: mid.x + 220, endY: mid.y + 120, color: accent, unit: 'px' },
        );
        syncActiveMoodboard();
        selectedItems = [items[0]];
        updateSelectionToolbar();
        draw();

        createNewProject('moodprompt');
        const promptId = activeProjectId;
        const promptProject = projects.find((p) => p.id === promptId);
        promptProject.data.prompts = [{
            id: 'cap-prompt', title: 'Amanecer en el muelle', platform: 'midjourney', mediaType: 'image',
            image1: mk('#c97b3a'), image2: null, text: 'Wide shot of a wooden pier at dawn, voice over, no people.', tags: ['costa'],
        }];
        renderMoodpromptView(promptProject);

        createNewProject('colorseeker');
        const toneId = activeProjectId;

        createNewProject('storyflow');
        const flowId = activeProjectId;
        const flow = projects.find((p) => p.id === flowId);
        flow.name = sample.name;
        flow.data.workers = sample.workers;
        flow.data.frames = sample.frames.map((frame) => ({
            ...frame,
            image: frame.image ? mk(frame.image.endsWith(':0') ? '#c97b3a' : '#2a4d69') : null,
        }));
        renderStoryflowView(flow);

        createNewProject('moodgantt');
        const ganttId = activeProjectId;
        const gantt = projects.find((p) => p.id === ganttId);
        const today = ganttFormatDate(ganttToday());
        const next = ganttFormatDate(ganttAddDays(ganttToday(), 10));
        gantt.data.workers = ['Lucía Fernández', 'Mateo Ríos'];
        gantt.data.groups = [{
            id: 'cap-group', name: 'Preproducción', color: '#d4a359', collapsed: false,
            tasks: [
                { id: 'cap-task', name: 'Guion y locaciones', startDate: today, endDate: next, progress: 40, status: 'wip', assignee: 'Lucía Fernández', notes: 'Confirmar el muelle.' },
                { id: 'cap-task-2', name: 'Elenco', startDate: today, endDate: today, progress: 0, status: 'todo', assignee: 'Mateo Ríos', notes: '' },
            ],
        }];
        renderGanttView(gantt);

        createNewProject('moodlist');
        const listId = activeProjectId;
        const list = projects.find((p) => p.id === listId);
        list.data.cards = [
            { id: 'cap-card', title: 'Rodaje costa', color: '', pinned: true, image: mk('#2a4d69'), items: [{ id: 'a', text: 'Llamar al muelle', checked: false, due: '2026-11-02' }, { id: 'b', text: 'Cerrar el llamado', checked: true }] },
            { id: 'cap-card-2', title: 'Pendientes', color: '#163d20', pinned: false, image: null, items: [{ id: 'c', text: 'Revisar el audio', checked: false }] },
        ];
        renderMoodlistView(list);

        return { boardId, promptId, toneId, flowId, ganttId, listId };
    }, sample);

    async function closeFloating() {
        await page.evaluate(() => {
            if (typeof cancelNoteEditing === 'function') cancelNoteEditing();
            document.querySelectorAll('.toast-notification').forEach((el) => el.remove());
            ['context-menu', 'tab-context-menu', 'storyflow-context-menu', 'gantt-context-menu', 'icon-picker-panel'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            document.querySelectorAll('.modal-overlay, #input-modal-overlay, #note-editor-overlay, #help-modal-overlay, #asset-library-overlay').forEach((el) => {
                el.style.display = 'none';
            });
            const light = document.getElementById('storyflow-lightbox');
            if (light) light.classList.remove('open');
            const menu = document.getElementById('cloud-user-menu');
            if (menu) menu.classList.remove('open');
            const sync = document.getElementById('cloud-sync-indicator');
            if (sync) sync.classList.remove('visible');
            const popup = document.getElementById('mobile-tabs-popup');
            if (popup) popup.style.display = 'none';
            const palette = document.getElementById('palette-panel');
            if (palette) palette.classList.remove('open');
            const detail = document.getElementById('gantt-detail-panel');
            if (detail) detail.classList.remove('open');
            const script = document.getElementById('storyflow-script-view');
            if (script && !script.hidden) {
                const project = projects.find((p) => p.id === activeProjectId);
                if (project && project.type === 'storyflow' && typeof toggleStoryflowScript === 'function') toggleStoryflowScript(project);
            }
        });
    }

    async function applyLook(style, preset) {
        await page.evaluate((style, preset) => {
            selectBaseStyle(style);
            const palette = colorPalettes[preset];
            projects.forEach((project) => {
                if (!project.data) project.data = {};
                project.data.canvasBackgroundColor = palette.bg;
                project.data.accentColor = palette.accent;
                project.data.gridColor = palette.grid;
            });
            canvasBackgroundColor = palette.bg;
            accentColor = palette.accent;
            gridColor = palette.grid;
            updateUIColors();
            if (typeof draw === 'function') draw();
        }, style, preset);
    }

    const scenes = [
        ['board', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const note = items.find((item) => item.id === 'cap-note');
                selectedItems = note ? [note] : [];
                updateSelectionToolbar();
                if (typeof focusOnSelection === 'function') focusOnSelection();
                draw();
            }, ids.boardId);
        }],
        ['board-menu', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const comment = items.find((item) => item.id === 'cap-comment');
                selectedItems = comment ? [comment] : [];
                updateSelectionToolbar();
                onContextMenu({ preventDefault() {}, isFake: true, clientX: 280, clientY: 160 });
            }, ids.boardId);
        }],
        ['board-note', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const note = items.find((item) => item.id === 'cap-note');
                selectedItems = [note];
                editText(note);
            }, ids.boardId);
        }],
        ['board-link', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const link = items.find((item) => item.id === 'cap-link');
                showLinkInputModal(0, 0, link);
            }, ids.boardId);
        }],
        ['board-icon', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const comment = items.find((item) => item.id === 'cap-comment');
                selectedItems = [comment];
                updateSelectionToolbar();
                document.getElementById('comment-icon-btn').click();
            }, ids.boardId);
        }],
        ['board-assets', async () => {
            await page.evaluate(() => { openAssetLibrary(() => {}); });
        }],
        ['board-help', async () => {
            await page.evaluate(() => { document.getElementById('help-modal-overlay').style.display = 'flex'; });
        }],
        ['board-settings', async () => {
            await page.evaluate(() => { document.getElementById('palette-btn').click(); });
        }],
        ['board-tab-menu', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                showAndPositionMenu(document.getElementById('tab-context-menu'), { clientX: 220, clientY: 72 });
            }, ids.boardId);
        }],
        ['board-minimap', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const map = document.getElementById('canvas-minimap');
                if (map) map.hidden = false;
                draw();
            }, ids.boardId);
        }],
        ['prompt', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const project = projects.find((p) => p.id === id);
                renderMoodpromptView(project);
            }, ids.promptId);
        }],
        ['tone', async () => {
            await page.evaluate((id) => { switchTab(id); }, ids.toneId);
        }],
        ['flow', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                renderStoryflowView(projects.find((p) => p.id === id));
            }, ids.flowId);
        }],
        ['flow-menu', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                showAndPositionMenu(document.getElementById('storyflow-context-menu'), { clientX: 260, clientY: 180 });
            }, ids.flowId);
        }],
        ['flow-script', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const project = projects.find((p) => p.id === id);
                const view = document.getElementById('storyflow-script-view');
                if (view && view.hidden) toggleStoryflowScript(project);
            }, ids.flowId);
        }],
        ['flow-lightbox', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const project = projects.find((p) => p.id === id);
                const src = project.data.frames.map((frame) => frame.image).find(Boolean);
                if (src && typeof openStoryLightbox === 'function') openStoryLightbox(src);
            }, ids.flowId);
        }],
        ['gantt', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                renderGanttView(projects.find((p) => p.id === id));
            }, ids.ganttId);
        }],
        ['gantt-detail', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                const project = projects.find((p) => p.id === id);
                renderGanttView(project);
                ganttOpenDetail(project, 'cap-group', 'cap-task');
            }, ids.ganttId);
        }],
        ['gantt-workers', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                document.getElementById('gantt-workers-modal-overlay').style.display = 'flex';
                if (typeof renderSharedWorkersList === 'function') renderSharedWorkersList();
            }, ids.ganttId);
        }],
        ['gantt-menu', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                showAndPositionMenu(document.getElementById('gantt-context-menu'), { clientX: 240, clientY: 160 });
            }, ids.ganttId);
        }],
        ['list', async () => {
            await page.evaluate((id) => {
                switchTab(id);
                renderMoodlistView(projects.find((p) => p.id === id));
            }, ids.listId);
        }],
        ['toast', async () => {
            await page.evaluate(() => {
                showNotifications = true;
                showToast('Guardado en este navegador.');
                const el = document.querySelector('.toast-notification');
                if (el) {
                    el.style.animation = 'none';
                    el.style.opacity = '1';
                    el.style.transform = 'none';
                }
            });
        }],
        ['cloud-menu', async () => {
            await page.evaluate(() => {
                const menu = document.getElementById('cloud-user-menu');
                menu.classList.add('open');
                const sync = document.getElementById('cloud-sync-indicator');
                sync.classList.add('visible');
                sync.style.maxWidth = '240px';
                sync.querySelector('.cloud-sync-text').textContent = 'Synced';
            });
        }],
    ];

    const viewports = [
        { width: 1280, height: 800 },
        { width: 390, height: 844 },
    ];
    for (const style of ['flat', 'glass']) {
        for (const preset of [1, 4]) {
            for (const viewport of viewports) {
                await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
                await page.waitForFunction((w) => window.innerWidth === w, {}, viewport.width);
                await applyLook(style, preset);
                for (const [name, prepare] of scenes) {
                    if (name === 'board-minimap' && viewport.width < 800) continue;
                    await closeFloating();
                    await prepare();
                    await shot(page, `${style}-p${preset}-${viewport.width}-${name}.png`);
                }
                if (viewport.width < 800) {
                    await closeFloating();
                    await page.evaluate(() => {
                        const popup = document.getElementById('mobile-tabs-popup');
                        const btn = document.getElementById('mobile-tabs-btn');
                        if (btn) btn.click();
                        if (popup && popup.style.display === 'none') popup.style.display = 'block';
                    });
                    await shot(page, `${style}-p${preset}-${viewport.width}-mobile-tabs.png`);
                }
            }
        }
    }
    console.log('captured', out);
} finally {
    await browser.close();
    server.kill();
}
