import { state } from './state.js';
import { DOM } from './dom.js';
import { generateId } from './utils.js';

export function scheduleAutoSave() {
    clearTimeout(state.autoSaveTimeout);
    state.autoSaveTimeout = setTimeout(saveToBrowser, 1500);
}

export function serializeItems(itemArray) {
    return itemArray.map(t => {
        const e = { ...t };
        if (e.type === 'image') delete e.img;
        else if (e.type === 'group' && e.state.items) e.state.items = serializeItems(e.state.items);
        return e;
    });
}

export function restoreImages(itemArray) {
    itemArray.forEach(t => {
        if (t.type === 'image') {
            const img = new Image();
            if (t.imageId && state.globalImageCache[t.imageId]) img.src = state.globalImageCache[t.imageId];
            else if (t.img) img.src = t.img;
            t.img = img;
        } else if (t.type === 'group' && t.state.items) {
            restoreImages(t.state.items);
        }
    });
}

export function saveToBrowser() {
    if (state.activeProjectId) {
        const currentProject = state.projects.find(p => p.id === state.activeProjectId);
        if (currentProject && currentProject.type === 'moodinfinite') {
            currentProject.data.state.items = state.items;
            currentProject.data.state.cameraOffset = state.cameraOffset;
            currentProject.data.state.cameraZoom = state.cameraZoom;
            currentProject.data.state.historyStack = state.historyStack;
            currentProject.data.state.historyIndex = state.historyIndex;
        }
    }
    const projectsToSave = state.projects.map(p => {
        const copy = JSON.parse(JSON.stringify(p));
        if (copy.type === 'moodinfinite' && copy.data && copy.data.state.items) {
            copy.data.state.items = serializeItems(p.data.state.items);
        }
        return copy;
    });
    window.localforage.setItem('moodinfinite_projects', projectsToSave);
    window.localforage.setItem('moodinfinite_cache', state.globalImageCache);
    window.localforage.setItem('moodinfinite_active_tab', state.activeProjectId);
}

export function createNewProject(type) {
    const newId = Date.now();
    let newProject;
    if (type === 'moodinfinite') {
        const projectCount = state.projects.filter(p => p.type === 'moodinfinite').length;
        newProject = {
            id: newId,
            type: 'moodinfinite',
            name: `Board ${projectCount + 1}`,
            data: {
                items: [],
                cameraOffset: { x: window.innerWidth / 2, y: (window.innerHeight - 48) / 2 },
                cameraZoom: 1,
                historyStack: [],
                historyIndex: -1,
                canvasBackgroundColor: defaultCanvasBg,
                accentColor: defaultAccent,
                gridColor: defaultGridColor
            }
        };
    } else if (type === 'colorseeker') {
        const projectCount = state.projects.filter(p => p.type === 'colorseeker').length;
        const randomHex = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        newProject = {
            id: newId,
            type: 'colorseeker',
            name: `Palette ${projectCount + 1}`,
            data: {
                baseColor: randomHex,
                mode: 'shades',
                canvasBackgroundColor: defaultCanvasBg
            }
        };
    } else if (type === 'storyflow') {
        const projectCount = state.projects.filter(p => p.type === 'storyflow').length;
        newProject = {
            id: newId,
            type: 'storyflow',
            name: `Story ${projectCount + 1}`,
            data: {
                frames: [],
                canvasBackgroundColor: defaultCanvasBg
            }
        };
    } else {
        const projectCount = state.projects.filter(p => p.type === 'moodprompt').length;
        newProject = {
            id: newId,
            type: 'moodprompt',
            name: `Prompts ${projectCount + 1}`,
            data: {
                prompts: [],
                canvasBackgroundColor: defaultCanvasBg,
            }
        };
    }
    state.projects.push(newProject);
    renderTabs();
    switchTab(newId);
}

export function saveProject() {
    const t = state.projects.find(e => e.id === state.activeProjectId);
    if (!t) { showToast("No active project to save.", "error"); return; }
    const o = `${t.name}.mood`;

    const zip = new window.JSZip();
    const folderName = t.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'moodboard';
    const rootDir = zip.folder(folderName);
    const imgFolder = rootDir.folder("images");
    let eJSON;

    if (t.type === 'moodinfinite') {
        t.data.state.items = state.items;
        t.data.state.cameraOffset = state.cameraOffset;
        t.data.state.cameraZoom = state.cameraZoom;
        t.data.state.historyStack = state.historyStack;
        t.data.state.historyIndex = state.historyIndex;

        eJSON = {
            items: serializeItems(state.items),
            cameraOffset: state.cameraOffset,
            cameraZoom: state.cameraZoom,
            canvasBackgroundColor: state.canvasBackgroundColor,
            accentColor: state.accentColor,
            gridColor: state.gridColor,
            showGrid: state.showGrid,
            snapToGrid: state.snapToGrid,
            showDropShadow: state.showDropShadow,
            gridSize: state.gridSize,
            gridOpacity: state.gridOpacity
        };

        const localCache = {};
        const usedImageIds = new Set();
        const extractUsedIds = (arr) => {
            arr.forEach(item => {
                if (item.type === 'image' && item.imageId) usedImageIds.add(item.imageId);
                if (item.type === 'group' && item.state.items) extractUsedIds(item.state.items);
            });
        };
        extractUsedIds(state.items);

        showToast("Generating project export...", "info");

        const promises = Array.from(usedImageIds).map(id => {
            return new Promise((resolve) => {
                const base64Str = state.globalImageCache[id];
                if (!base64Str || !base64Str.startsWith('data:image')) {
                    // Legacy URL or broken ref
                    localCache[id] = base64Str;
                    return resolve();
                }

                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(blob => {
                        if (blob) {
                            imgFolder.file(`${id}.webp`, blob);
                            localCache[id] = `images/${id}.webp`;
                        } else {
                            localCache[id] = base64Str; // fallback on fail
                        }
                        resolve();
                    }, 'image/webp', 0.9);
                };
                img.onerror = resolve; // Skip failures quietly
                img.src = base64Str;
            });
        });

        Promise.all(promises).then(() => {
            eJSON.state.globalImageCache = localCache;
            rootDir.file("data.json", JSON.stringify(eJSON, null, 2));
            zip.generateAsync({ type: "blob" }).then(function (content) {
                const n = document.createElement('a');
                n.href = URL.createObjectURL(content);
                n.download = o;
                document.body.appendChild(n);
                n.click();
                document.body.removeChild(n);
                URL.revokeObjectURL(n.href);
                showToast("Project exported successfully.");
            });
        });
    } else if (t.type === 'moodprompt' || t.type === 'storyflow') {
        eJSON = t.data;
        rootDir.file("data.json", JSON.stringify(eJSON, null, 2));
        zip.generateAsync({ type: "blob" }).then(function (content) {
            const n = document.createElement('a');
            n.href = URL.createObjectURL(content);
            n.download = o;
            document.body.appendChild(n);
            n.click();
            document.body.removeChild(n);
            URL.revokeObjectURL(n.href);
            showToast("Project exported successfully.");
        });
    }
}

export function loadFileAsNewTab(fileContent, fileName) {
    try {
        const data = JSON.parse(fileContent);
        const name = fileName.split('.').slice(0, -1).join('.') || 'Loaded Project';
        if (data.prompts && Array.isArray(data.prompts)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'moodprompt', name: name, data: { prompts: data.prompts, canvasBackgroundColor: data.state.canvasBackgroundColor || '#0d0d0d' } };
            state.projects.push(newProject);
            renderTabs();
            switchTab(newId);
            showToast("Prompt file loaded successfully.");
            return;
        }
        if (data.frames && Array.isArray(data.frames)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'storyflow', name: name, data: { frames: data.frames, canvasBackgroundColor: data.state.canvasBackgroundColor || '#0d0d0d' } };
            state.projects.push(newProject);
            renderTabs();
            switchTab(newId);
            showToast("StoryFlow file loaded successfully.");
            return;
        }
        if (data.state.items && Array.isArray(data.state.items)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'moodinfinite', name: name, data: { items: [], cameraOffset: {}, cameraZoom: 1, historyStack: [], historyIndex: -1 } };
            state.projects.push(newProject);
            state.activeProjectId = newId;
            renderTabs();
            loadProject(fileContent);
            return;
        }
        showToast("Failed to load project. Unknown format.", "error");
    } catch (err) {
        console.error("Failed to load project:", err);
        showToast("Failed to load project. Invalid JSON.", "error");
    }
}

export function loadProject(e) {
    try {
        const t = JSON.parse(e); const o = state.projects.find(e => e.id === state.activeProjectId); if (!o || o.type !== 'moodinfinite') return; o.data.state.cameraOffset = t.state.cameraOffset || { x: window.innerWidth / 2, y: window.innerHeight / 2 }; o.data.state.cameraZoom = t.state.cameraZoom || 1; state.canvasBackgroundColor = t.state.canvasBackgroundColor || '#0d0d0d'; state.accentColor = t.state.accentColor || '#429eff'; state.gridColor = t.state.gridColor || '#f9f8f6'; o.data.state.canvasBackgroundColor = state.canvasBackgroundColor; o.data.state.accentColor = state.accentColor; o.data.state.gridColor = state.gridColor; state.showGrid = t.state.showGrid ?? true; state.snapToGrid = t.state.snapToGrid ?? true; state.showDropShadow = t.state.showDropShadow ?? true; state.gridSize = t.state.gridSize || 50; state.gridOpacity = t.state.gridOpacity || .05; if (t.state.globalImageCache) { state.globalImageCache = { ...state.globalImageCache, ...t.state.globalImageCache }; }
        const processedItems = t.state.items || [];
        restoreImages(processedItems);
        o.data.state.items = [
            ...processedItems.filter(i => i.type !== 'comment'),
            ...processedItems.filter(i => i.type === 'comment')
        ];
        state.items = o.data.state.items;
        o.data.state.historyStack = []; o.data.state.historyIndex = -1; switchTab(state.activeProjectId); updateUIColors(); saveStateForUndo(); showToast("Project loaded successfully.");
    } catch (e) { console.error("Failed to load project:", e); showToast("Failed to load project. Invalid file.", "error") }
}

export function loadFileFromObject(t) {
    if (t.name.endsWith('.zip') || t.name.endsWith('.mood')) {
        window.JSZip.loadAsync(t).then(zip => {
            const rootKey = Object.keys(zip.files).find(k => k.endsWith('data.json'));
            if (!rootKey) { showToast("Invalid project format", "error"); return; }
            const rootDirName = rootKey.split('data.json')[0];
            zip.file(rootKey).async("string").then(jsonStr => {
                const data = JSON.parse(jsonStr);
                const promises = Object.keys(data.state.globalImageCache || {}).map(id => {
                    const relativePath = data.state.globalImageCache[id];
                    if (relativePath.startsWith('images/')) {
                        const file = zip.file(rootDirName + relativePath);
                        if (file) {
                            return file.async("base64").then(b64 => {
                                state.globalImageCache[id] = "data:image/webp;base64," + b64;
                            });
                        }
                    } else {
                        state.globalImageCache[id] = relativePath;
                    }
                    return Promise.resolve();
                });
                Promise.all(promises).then(() => {
                    data.state.globalImageCache = state.globalImageCache;
                    loadFileAsNewTab(JSON.stringify(data), t.name);
                    scheduleAutoSave();
                });
            });
        }).catch(() => showToast("Failed to unpack project", "error"));
    } else {
        const o = new FileReader;
        o.onload = e => { loadFileAsNewTab(e.target.result, t.name); scheduleAutoSave(); };
        o.readAsText(t);
    }
}

export async function loadFromBrowser() {
    try {
        const cache = await window.localforage.getItem('moodinfinite_cache');
        if (cache) window.state.globalImageCache = cache; // Or update state if moved
        
        const savedProjects = await window.localforage.getItem('moodinfinite_projects');
        if (savedProjects && savedProjects.length > 0) {
            savedProjects.forEach(p => {
                if (p.type === 'moodinfinite' && p.data && p.data.state.items) {
                    restoreImages(p.data.state.items);
                }
            });
            // We should assign this to state.state.projects, but for backward compat if state.projects is still global, we'll return it
            return savedProjects; 
        }
        return null;
    } catch (e) {
        console.error("Failed to load from browser", e);
        return null;
    }
}
