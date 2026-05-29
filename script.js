// --- TABS & PROJECT MANAGEMENT ---
let projects = [];
let activeProjectId = null;

const tabsBar = document.getElementById('tabs-bar');
const tabsList = document.getElementById('tabs-list');
const addMoodinfiniteTabBtn = document.getElementById('add-moodinfinite-tab-btn');
const addMoodpromptTabBtn = document.getElementById('add-moodprompt-tab-btn');
const addColorseekerTabBtn = document.getElementById('add-colorseeker-tab-btn');
const addStoryflowTabBtn = document.getElementById('add-storyflow-tab-btn');
const moodinfiniteContainer = document.getElementById('moodinfinite-container');
const moodpromptContainer = document.getElementById('moodprompt-container');
const colorseekerContainer = document.getElementById('colorseeker-container');
const storyflowContainer = document.getElementById('storyflow-container');
const promptImageInput = document.getElementById('prompt-image-input');
const mobileTabsBtn = document.getElementById('mobile-tabs-btn');
const mobileTabsPopup = document.getElementById('mobile-tabs-popup');
const assetLibraryOverlay = document.getElementById('asset-library-overlay');
const assetLibraryGrid = document.getElementById('asset-library-grid');
const assetLibraryEmpty = document.getElementById('asset-library-empty');
const closeAssetLibraryBtn = document.getElementById('close-asset-library-btn');
const assetLibraryFilter = document.getElementById('asset-library-filter');

const closeBoardModalOverlay = document.getElementById('close-board-modal-overlay');
const cancelCloseBtn = document.getElementById('cancel-close-btn');
const confirmCloseBtn = document.getElementById('confirm-close-btn');
let projectPendingClose = null;

const leftScrollIndicator = document.querySelector('.tabs-list-container .scroll-indicator.left');
const rightScrollIndicator = document.querySelector('.tabs-list-container .scroll-indicator.right');

// Performance: Lazy loading observer for board images
const imageLazyObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
            img.classList.remove('lazy-load');
            observer.unobserve(img);
        }
    });
}, { rootMargin: '200px' });

let autoSaveTimeout = null;
function scheduleAutoSave() {
    clearTimeout(autoSaveTimeout);
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject && activeProject.data) {
        activeProject.data._isDirty = true;
    }
    autoSaveTimeout = setTimeout(saveToBrowser, 1500);
}

function serializeItems(itemArray) {
    return itemArray.map(t => {
        const e = { ...t };
        if (e.type === 'image') delete e.img;
        else if (e.type === 'video') delete e.video;
        else if (e.type === 'group' && e.items) e.items = serializeItems(e.items);
        return e;
    });
}

function restoreImages(itemArray) {
    itemArray.forEach(t => {
        if (t.type === 'image') {
            const img = new Image();
            if (t.imageId && globalImageCache[t.imageId]) img.src = globalImageCache[t.imageId];
            else if (t.img) img.src = t.img;
            t.img = img;
        } else if (t.type === 'video') {
            const video = document.createElement('video');
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            
            if (t.videoId && globalVideoCache[t.videoId]) {
                const videoData = globalVideoCache[t.videoId];
                video.src = videoData instanceof Blob ? URL.createObjectURL(videoData) : videoData;
            } else if (t.videoSrc) {
                video.src = t.videoSrc;
            }
            
            video.play().catch(e => console.log("Autoplay prevented:", e));
            t.video = video;
        } else if (t.type === 'group' && t.items) {
            restoreImages(t.items);
        }
    });
}

function saveToBrowser() {
    if (activeProjectId) {
        const currentProject = projects.find(p => p.id === activeProjectId);
        if (currentProject) {
            if (!currentProject.data) currentProject.data = {};
            currentProject.data._localModified = Date.now();
            if (currentProject.type === 'moodinfinite') {
                currentProject.data.items = items;
                currentProject.data.cameraOffset = cameraOffset;
                currentProject.data.cameraZoom = cameraZoom;
                currentProject.data.historyStack = historyStack;
                currentProject.data.historyIndex = historyIndex;
            }
        }
    }
    const projectsToSave = projects.map(p => {
        const copy = JSON.parse(JSON.stringify(p));
        if (copy.type === 'moodinfinite' && copy.data && copy.data.items) {
            copy.data.items = serializeItems(p.data.items);
        }
        return copy;
    });
    window.localforage.setItem('moodinfinite_projects', projectsToSave);
    window.localforage.setItem('moodinfinite_cache', globalImageCache);
    window.localforage.setItem('moodinfinite_video_cache', globalVideoCache);
    window.localforage.setItem('moodinfinite_active_tab', activeProjectId);
}


const genericIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`;
const platformData = {
    midjourney: { name: 'Midjourney', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m8 3l4 8l5-5l5 15H2z"/></svg>` },
    dalle3: { name: 'DALL-E 3', icon: genericIcon },
    chatgpt: { name: 'ChatGPT', icon: genericIcon },
    sd3: { name: 'Stable Diffusion 3', icon: genericIcon },
    flux: { name: 'Flux', icon: genericIcon },
    runway: { name: 'Runway Gen-3', icon: genericIcon },
    luma: { name: 'Luma Dream Machine', icon: genericIcon },
    kling: { name: 'Kling AI', icon: genericIcon },
    sora: { name: 'OpenAI Sora', icon: genericIcon },
    minimax: { name: 'Hailuo Minimax', icon: genericIcon },
    pika: { name: 'Pika', icon: genericIcon },
    veo: { name: 'Google Veo', icon: genericIcon },
    leonardo: { name: 'Leonardo AI', icon: genericIcon },
    hunyuan: { name: 'Hunyuan Video', icon: genericIcon },
    wanvideo: { name: 'Wan Video', icon: genericIcon },
    ltk: { name: 'LTK', icon: genericIcon },
    mochi: { name: 'Mochi', icon: genericIcon },
    nanobanana2: { name: 'Nano banana 2', icon: genericIcon },
    seedream: { name: 'Seedream', icon: genericIcon },
    haiper: { name: 'Haiper', icon: genericIcon },
    genmo: { name: 'Genmo', icon: genericIcon },
    others: { name: '- Others', icon: genericIcon }
};

function updateScrollIndicators() {
    if (!tabsList) return;
    const hasOverflow = tabsList.scrollWidth > tabsList.clientWidth;
    const scrollBuffer = 1;
    if (hasOverflow && tabsList.scrollLeft > scrollBuffer) {
        leftScrollIndicator.classList.add('visible');
    } else {
        leftScrollIndicator.classList.remove('visible');
    }
    if (hasOverflow && tabsList.scrollLeft < (tabsList.scrollWidth - tabsList.clientWidth - scrollBuffer)) {
        rightScrollIndicator.classList.add('visible');
    } else {
        rightScrollIndicator.classList.remove('visible');
    }
}

// ── TAB SWITCHER ──
let isTabSwitcherOpen = false;
let tabSwitcherSelectedIndex = -1;

function showTabSwitcher() {
    isTabSwitcherOpen = true;
    const overlay = document.getElementById('tab-switcher-overlay');
    const modal = document.getElementById('tab-switcher-modal');
    if (!overlay || !modal) return;
    modal.innerHTML = '';
    
    if (projects.length === 0) return;
    
    const currentIdx = projects.findIndex(p => p.id === activeProjectId);
    tabSwitcherSelectedIndex = (currentIdx + 1) % projects.length;
    
    projects.forEach((proj, idx) => {
        const item = document.createElement('div');
        item.className = 'tab-switcher-item' + (idx === tabSwitcherSelectedIndex ? ' active' : '');
        item.dataset.index = idx;
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'tab-switcher-icon';
        
        let iconStr = 'lucide:layout-template';
        if (proj.type === 'moodgantt') iconStr = 'lucide:bar-chart-horizontal';
        else if (proj.type === 'colorseeker') iconStr = 'lucide:palette';
        else if (proj.type === 'storyflow') iconStr = 'lucide:layout-dashboard';
        else if (proj.type === 'moodlist') iconStr = 'lucide:list-check';
        else if (proj.type === 'doc') iconStr = 'lucide:file-text';
        
        iconDiv.innerHTML = `<iconify-icon icon="${iconStr}" width="18" height="18"></iconify-icon>`;
        
        const details = document.createElement('div');
        details.className = 'tab-switcher-details';
        
        const name = document.createElement('span');
        name.className = 'tab-switcher-name';
        name.textContent = proj.name;
        
        const type = document.createElement('span');
        type.className = 'tab-switcher-type';
        type.textContent = proj.type === 'storyflow' ? 'Moodflow'
            : proj.type === 'moodgantt' ? 'Moodgantt'
            : proj.type === 'moodlist' ? 'Moodlist'
            : proj.type;
        
        details.append(name, type);
        item.append(iconDiv, details);
        
        item.addEventListener('mouseenter', () => {
            tabSwitcherSelectedIndex = idx;
            updateTabSwitcherSelection();
        });
        item.addEventListener('click', () => {
            tabSwitcherSelectedIndex = idx;
            executeTabSwitch();
        });
        
        modal.appendChild(item);
    });
    
    overlay.style.display = 'flex';
}

function updateTabSwitcherSelection() {
    const modal = document.getElementById('tab-switcher-modal');
    if (!modal) return;
    const items = modal.querySelectorAll('.tab-switcher-item');
    items.forEach((item, idx) => {
        if (idx === tabSwitcherSelectedIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('active');
        }
    });
}

function cycleTabSwitcher() {
    if (!isTabSwitcherOpen || projects.length === 0) return;
    tabSwitcherSelectedIndex = (tabSwitcherSelectedIndex + 1) % projects.length;
    updateTabSwitcherSelection();
}

function cycleTabSwitcherReverse() {
    if (!isTabSwitcherOpen || projects.length === 0) return;
    tabSwitcherSelectedIndex = (tabSwitcherSelectedIndex - 1 + projects.length) % projects.length;
    updateTabSwitcherSelection();
}

function executeTabSwitch() {
    if (!isTabSwitcherOpen) return;
    const proj = projects[tabSwitcherSelectedIndex];
    if (proj) {
        switchTab(proj.id);
    }
    closeTabSwitcher();
}

function closeTabSwitcher() {
    isTabSwitcherOpen = false;
    const overlay = document.getElementById('tab-switcher-overlay');
    if (overlay) overlay.style.display = 'none';
}

function createNewProject(type) {
    const newId = Date.now();
    let newProject;
    if (type === 'moodinfinite') {
        const projectCount = projects.filter(p => p.type === 'moodinfinite').length;
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
        const projectCount = projects.filter(p => p.type === 'colorseeker').length;
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
        const projectCount = projects.filter(p => p.type === 'storyflow').length;
        newProject = {
            id: newId,
            type: 'storyflow',
            name: `Story ${projectCount + 1}`,
            data: {
                frames: [],
                canvasBackgroundColor: defaultCanvasBg
            }
        };
    } else if (type === 'moodgantt') {
        const gcnt = projects.filter(p => p.type === 'moodgantt').length;
        const gToday = ganttFormatDate(ganttToday());
        const gEnd   = ganttFormatDate(ganttAddMonths(ganttToday(), 6));
        newProject = { id: newId, type: 'moodgantt', name: `Plan ${gcnt + 1}`,
            data: { zoomLevel: 'week', viewStartDate: gToday, viewEndDate: gEnd, groups: [], canvasBackgroundColor: defaultCanvasBg, accentColor: defaultAccent, gridColor: defaultGridColor } };
    } else if (type === 'moodlist') {
        const lcnt = projects.filter(p => p.type === 'moodlist').length;
        newProject = {
            id: newId,
            type: 'moodlist',
            name: `List ${lcnt + 1}`,
            data: { cards: [] }
        };
    } else {
        const projectCount = projects.filter(p => p.type === 'moodprompt').length;
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
    projects.push(newProject);
    renderTabs();
    switchTab(newId);
}

function switchTab(projectId) {
    if (activeProjectId === projectId) return;

    if (activeProjectId) {
        const currentProject = projects.find(p => p.id === activeProjectId);
        if (currentProject && currentProject.type === 'moodinfinite') {
            currentProject.data.items = items;
            currentProject.data.cameraOffset = cameraOffset;
            currentProject.data.cameraZoom = cameraZoom;
            currentProject.data.historyStack = historyStack;
            currentProject.data.historyIndex = historyIndex;
        }
    }

    activeProjectId = projectId;
    const newActiveProject = projects.find(p => p.id === projectId);

    if (!newActiveProject) return;

    canvasBackgroundColor = newActiveProject.data.canvasBackgroundColor || '#0d0d0d';
    accentColor = newActiveProject.data.accentColor || '#429eff';
    gridColor = newActiveProject.data.gridColor || '#f9f8f6';

    if (newActiveProject.type === 'moodinfinite') {
        items = newActiveProject.data.items;
        cameraOffset = newActiveProject.data.cameraOffset;
        cameraZoom = newActiveProject.data.cameraZoom;
        historyStack = newActiveProject.data.historyStack;
        historyIndex = newActiveProject.data.historyIndex;
        currentProjectName = newActiveProject.name;
        moodinfiniteContainer.style.display = 'block';
        moodpromptContainer.style.display = 'none';
        if (colorseekerContainer) colorseekerContainer.style.display = 'none';
        if (storyflowContainer) storyflowContainer.style.display = 'none';
        const storyflowMinimap = document.getElementById('storyflow-minimap');
        if (storyflowMinimap) storyflowMinimap.style.display = 'none';
        const ganttCont = document.getElementById('gantt-container');
        if (ganttCont) ganttCont.style.display = 'none';
        const moodlistContMI = document.getElementById('moodlist-container');
        if (moodlistContMI) moodlistContMI.style.display = 'none';
        resizeCanvas();
    } else if (newActiveProject.type === 'colorseeker') {
        moodinfiniteContainer.style.display = 'none';
        moodpromptContainer.style.display = 'none';
        if (colorseekerContainer) colorseekerContainer.style.display = 'block';
        if (storyflowContainer) storyflowContainer.style.display = 'none';
        const storyflowMinimap = document.getElementById('storyflow-minimap');
        if (storyflowMinimap) storyflowMinimap.style.display = 'none';
        const ganttCont = document.getElementById('gantt-container');
        if (ganttCont) ganttCont.style.display = 'none';
        const moodlistContCS = document.getElementById('moodlist-container');
        if (moodlistContCS) moodlistContCS.style.display = 'none';
        renderColorSeeker(projectId);
    } else if (newActiveProject.type === 'storyflow') {
        moodinfiniteContainer.style.display = 'none';
        moodpromptContainer.style.display = 'none';
        if (colorseekerContainer) colorseekerContainer.style.display = 'none';
        if (storyflowContainer) storyflowContainer.style.display = 'block';
        const storyflowMinimap = document.getElementById('storyflow-minimap');
        if (storyflowMinimap) storyflowMinimap.style.display = 'flex';
        const ganttCont = document.getElementById('gantt-container');
        if (ganttCont) ganttCont.style.display = 'none';
        const moodlistContSF = document.getElementById('moodlist-container');
        if (moodlistContSF) moodlistContSF.style.display = 'none';
        renderStoryflowView(newActiveProject);
    } else if (newActiveProject.type === 'moodgantt') {
        moodinfiniteContainer.style.display = 'none';
        if (colorseekerContainer) colorseekerContainer.style.display = 'none';
        if (storyflowContainer) storyflowContainer.style.display = 'none';
        const sfm2 = document.getElementById('storyflow-minimap');
        if (sfm2) sfm2.style.display = 'none';
        moodpromptContainer.style.display = 'none';
        const ganttCont = document.getElementById('gantt-container');
        if (ganttCont) ganttCont.style.display = 'flex';
        const moodlistCont = document.getElementById('moodlist-container');
        if (moodlistCont) moodlistCont.style.display = 'none';
        ganttCloseDetail();
        renderGanttView(newActiveProject);
    } else if (newActiveProject.type === 'moodlist') {
        moodinfiniteContainer.style.display = 'none';
        moodpromptContainer.style.display = 'none';
        if (colorseekerContainer) colorseekerContainer.style.display = 'none';
        if (storyflowContainer) storyflowContainer.style.display = 'none';
        const sfm3 = document.getElementById('storyflow-minimap');
        if (sfm3) sfm3.style.display = 'none';
        const ganttCont2 = document.getElementById('gantt-container');
        if (ganttCont2) ganttCont2.style.display = 'none';
        const moodlistCont = document.getElementById('moodlist-container');
        if (moodlistCont) moodlistCont.style.display = 'flex';
        if (typeof renderMoodlistView === 'function') renderMoodlistView(newActiveProject);
    } else {
        moodinfiniteContainer.style.display = 'none';
        if (colorseekerContainer) colorseekerContainer.style.display = 'none';
        if (storyflowContainer) storyflowContainer.style.display = 'none';
        const storyflowMinimap = document.getElementById('storyflow-minimap');
        if (storyflowMinimap) storyflowMinimap.style.display = 'none';
        const ganttCont2 = document.getElementById('gantt-container');
        if (ganttCont2) ganttCont2.style.display = 'none';
        const moodlistCont2 = document.getElementById('moodlist-container');
        if (moodlistCont2) moodlistCont2.style.display = 'none';
        moodpromptContainer.style.display = 'flex';
        renderMoodpromptView(newActiveProject);
    }

    if (savePngBtn) {
        if (newActiveProject.type === 'storyflow') {
            savePngBtn.title = "Export as PDF";
        } else {
            savePngBtn.title = "Export as PNG (Shift+S)";
        }
    }

    const exportSheetBtnEl = document.getElementById('export-sheet-btn');
    if (exportSheetBtnEl) {
        exportSheetBtnEl.style.display = newActiveProject.type === 'storyflow' ? '' : 'none';
    }

    const copyToClipboardBtnEl = document.getElementById('copy-to-clipboard-btn');
    if (copyToClipboardBtnEl) {
        copyToClipboardBtnEl.style.display = newActiveProject.type === 'storyflow' ? 'none' : '';
    }

    // Reset all interaction states to prevent cross-tab contamination
    selectedItems = [];
    isDragging = false;
    isMovingItems = false;
    isSelectingBox = false;
    activeGizmo = null;
    isTransforming = false;
    isTransformingArrow = false;
    hoveredItem = null;
    hoveredGizmo = null;
    hoveredArrowHandle = null;
    hoveredPort = null;
    hoveredConnector = null;
    isDrawing = false;
    isConnectionMode = false;
    connectionSourceItem = null;
    currentlyEditingText = false;
    ctx.setLineDash([]); // Prevent any dashed line leakage

    applySettingsToUI();
    mobileTabsPopup.style.display = 'none'; // Hide popup on tab switch

    document.querySelectorAll('.tab-item').forEach(t => {
        t.classList.toggle('active', t.dataset.id == projectId);
    });
    scheduleAutoSave();
    requestUpdate();
    
    if (window.CloudSync && typeof window.CloudSync.updateIndicator === 'function') {
        window.CloudSync.updateIndicator();
    }
}

function closeTab(projectId, event) {
    if (event) event.stopPropagation();
    projectPendingClose = projectId;
    if (event && event.shiftKey) {
        actuallyCloseTab();
    } else {
        if (closeBoardModalOverlay) closeBoardModalOverlay.style.display = 'flex';
    }
}

function actuallyCloseTab() {
    if (projectPendingClose === null) return;
    const projectId = projectPendingClose;
    const index = projects.findIndex(p => p.id === projectId);
    if (index > -1) {
        const wasActive = activeProjectId === projectId;
        projects.splice(index, 1);
        if (wasActive) {
            if (projects.length > 0) {
                const newActiveIndex = Math.max(0, index - 1);
                activeProjectId = null;
                switchTab(projects[newActiveIndex].id);
            } else {
                createNewProject('moodinfinite');
                projectPendingClose = null;
                if (closeBoardModalOverlay) closeBoardModalOverlay.style.display = 'none';
                scheduleAutoSave();
                return;
            }
        }
        renderTabs();
    }
    projectPendingClose = null;
    if (closeBoardModalOverlay) closeBoardModalOverlay.style.display = 'none';
    scheduleAutoSave();
}

function hideCloseBoardModal() {
    projectPendingClose = null;
    if (closeBoardModalOverlay) closeBoardModalOverlay.style.display = 'none';
}

function updateTabName(projectId, newName) {
    const project = projects.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        if (project.type === 'moodinfinite' && project.id === activeProjectId) {
            currentProjectName = newName;
        }
    }
}

function renderTabs() {
    const currentActive = activeProjectId;
    tabsList.innerHTML = '';
    projects.forEach(project => {
        const tab = document.createElement('div');
        tab.className = 'tab-item';
        tab.classList.toggle('active', project.id === currentActive);
        tab.classList.toggle('pinned', !!project.pinned);
        tab.dataset.id = project.id;
        tab.draggable = true;

        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.innerHTML = project.type === 'moodinfinite'
            ? `<iconify-icon icon="lucide:image" width="16" height="16"></iconify-icon>`
            : project.type === 'colorseeker'
                ? `<iconify-icon icon="lucide:swatch-book" width="16" height="16"></iconify-icon>`
                : project.type === 'storyflow'
                    ? `<iconify-icon icon="lucide:clapperboard" width="16" height="16"></iconify-icon>`
                    : project.type === 'moodgantt'
                        ? `<iconify-icon icon="lucide:gantt-chart" width="16" height="16"></iconify-icon>`
                        : project.type === 'moodlist'
                            ? `<iconify-icon icon="lucide:list-check" width="16" height="16"></iconify-icon>`
                            : `<iconify-icon icon="lucide:pen-tool" width="16" height="16"></iconify-icon>`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tab-name';
        nameSpan.textContent = project.name;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'tab-name-input';
        nameInput.value = project.name;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = (e) => closeTab(project.id, e);

        tab.appendChild(icon);
        tab.appendChild(nameSpan);
        tab.appendChild(nameInput);
        tab.appendChild(closeBtn);

        let clickTimeout = null;
        const startEditing = () => {
            clearTimeout(clickTimeout);
            nameSpan.style.display = 'none';
            nameInput.style.display = 'inline';
            nameInput.focus();
            nameInput.select();
        };

        const finishEditing = () => {
            const newName = nameInput.value.trim();
            if (newName && newName !== project.name) {
                updateTabName(project.id, newName);
                nameSpan.textContent = newName;
            } else {
                nameInput.value = project.name;
                nameSpan.textContent = project.name;
            }
            nameInput.style.display = 'none';
            nameSpan.style.display = 'inline';
        };

        tab.addEventListener('click', (e) => {
            if (e.target === nameInput) return;
            clearTimeout(clickTimeout);
            clickTimeout = setTimeout(() => { switchTab(project.id); }, 200);
        });

        tab.addEventListener('dblclick', (e) => {
            if (e.target !== nameInput) { clearTimeout(clickTimeout); startEditing(); }
        });

        nameInput.addEventListener('blur', finishEditing);
        nameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') nameInput.blur();
            else if (e.key === 'Escape') { nameInput.value = project.name; nameInput.blur(); }
        });
        nameInput.onclick = e => e.stopPropagation();

        tab.addEventListener('contextmenu', e => {
            e.preventDefault();
            document.querySelectorAll('#context-menu, #tab-context-menu').forEach(m => m.style.display = 'none');
            const menu = document.getElementById('tab-context-menu');
            menu.dataset.tabId = project.id;
            const pinLabel = document.querySelector('#pin-tab-btn .menu-label');
            if (pinLabel) {
                pinLabel.textContent = project.pinned ? 'Unpin' : 'Pin to Start';
            }
            showAndPositionMenu(menu, e);
        });

        tab.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', project.id.toString());
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => { tab.classList.add('dragging'); }, 0);
        });

        tab.addEventListener('dragend', () => {
            const draggingElem = document.querySelector('.tab-item.dragging');
            if (draggingElem) { draggingElem.classList.remove('dragging'); }
        });

        tabsList.appendChild(tab);
    });
    setTimeout(updateScrollIndicators, 0);
}

let moodpromptFilterPlatform = 'all';
let moodpromptSearchQuery = '';

function showToastDeprecated(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<iconify-icon icon="lucide:check-circle" style="color: var(--switch-bg-checked);"></iconify-icon> <span>${message}</span>`;
    container.appendChild(toast);
    
    toast.offsetHeight;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openLightbox(src) {
    let overlay = document.getElementById('image-lightbox-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'image-lightbox-overlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div id="image-lightbox-modal" class="glass-modal" style="width: auto; max-width: 90vw; height: auto; max-height: 90vh; padding: 1rem; position: relative; background: rgba(20,20,20,0.8);">
                <button id="close-lightbox-btn" class="modal-button cancel" style="position: absolute; top: -10px; right: -10px; width: 30px; height: 30px; padding: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10;">&times;</button>
                <img id="lightbox-img" src="" style="max-width: 100%; max-height: calc(90vh - 2rem); object-fit: contain; border-radius: 0.5rem; display: block;">
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#close-lightbox-btn').onclick = () => overlay.style.display = 'none';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };
    }
    overlay.querySelector('#lightbox-img').src = src;
    overlay.style.display = 'flex';
}

function resolveVariables(text, project) {
    if (!text || !project.data.variables) return text;
    let resolved = text;
    Object.entries(project.data.variables).forEach(([key, val]) => {
        if (!key) return;
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        resolved = resolved.replace(regex, val);
    });
    return resolved;
}

function openVariableManager(project) {
    if (!project.data.variables) project.data.variables = {};
    
    let overlay = document.getElementById('variable-manager-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'variable-manager-overlay';
        overlay.className = 'modal-overlay';
        document.body.appendChild(overlay);
    }
    
    const renderContent = () => {
        let html = `
            <div class="glass-modal" style="width: 500px; max-width: 90vw;">
                <h2>Variable Manager</h2>
                <p style="color: var(--text-color-light); font-size: 0.9rem; margin-bottom: 1rem;">Define variables to use across all prompts in this project. Use {{variable_name}} in your text.</p>
                <div id="var-list" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; max-height: 300px; overflow-y: auto;">
        `;
        
        Object.entries(project.data.variables).forEach(([key, val]) => {
            html += `
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" class="form-input var-key" value="${key}" placeholder="Name (e.g. subject)" style="width: 30%;">
                    <input type="text" class="form-input var-val" value="${val}" placeholder="Value" style="flex-grow: 1;">
                    <button class="modal-button cancel delete-var-btn" data-key="${key}" style="padding: 0.5rem;">&times;</button>
                </div>
            `;
        });
        
        html += `
                </div>
                <button id="add-var-btn" class="modal-button" style="width: 100%; margin-bottom: 1rem;"><iconify-icon icon="lucide:plus"></iconify-icon> Add Variable</button>
                <div class="modal-buttons">
                    <button id="close-var-btn" class="modal-button confirm">Done</button>
                </div>
            </div>
        `;
        
        overlay.innerHTML = html;
        
        overlay.querySelectorAll('.delete-var-btn').forEach(btn => {
            btn.onclick = (e) => {
                delete project.data.variables[e.target.dataset.key];
                saveToBrowser();
                renderContent();
            };
        });
        
        const updateVars = () => {
            const newVars = {};
            const keys = overlay.querySelectorAll('.var-key');
            const vals = overlay.querySelectorAll('.var-val');
            keys.forEach((kInput, i) => {
                const k = kInput.value.trim().replace(/[{}]/g, '');
                const v = vals[i].value;
                if (k) newVars[k] = v;
            });
            project.data.variables = newVars;
            saveToBrowser();
        };
        
        overlay.querySelectorAll('.var-key, .var-val').forEach(inp => { inp.onchange = updateVars; });
        
        overlay.querySelector('#add-var-btn').onclick = () => {
            project.data.variables[`var${Object.keys(project.data.variables).length + 1}`] = '';
            saveToBrowser();
            renderContent();
        };
        
        overlay.querySelector('#close-var-btn').onclick = () => overlay.style.display = 'none';
    };
    
    renderContent();
    overlay.style.display = 'flex';
}

function getTagColor(tag) {
    const lowerTag = tag.toLowerCase();
    const styleKeywords = ['style', 'art', 'cinematic', 'anime', 'painting', 'drawing', 'render', 'unreal', 'octane', 'photography'];
    const charKeywords = ['character', 'boy', 'girl', 'man', 'woman', 'concept', 'sheet', 'pose'];
    const lightKeywords = ['light', 'dark', 'sun', 'shadow', 'bright', 'neon', 'glow'];
    
    if (styleKeywords.some(k => lowerTag.includes(k))) return { bg: 'rgba(66, 158, 255, 0.15)', border: 'var(--switch-bg-checked)' }; // Blue
    if (charKeywords.some(k => lowerTag.includes(k))) return { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e' }; // Green
    if (lightKeywords.some(k => lowerTag.includes(k))) return { bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308' }; // Yellow
    return { bg: 'rgba(255, 255, 255, 0.1)', border: 'var(--border-color)' }; // Default
}

function updateTagsDatalist(project) {
    let datalist = document.getElementById('moodprompt-tags-list');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'moodprompt-tags-list';
        document.body.appendChild(datalist);
    }
    const allTags = new Set();
    if (project && project.data && project.data.prompts) {
        project.data.prompts.forEach(p => {
            if (p.tags) p.tags.forEach(t => allTags.add(t));
        });
    }
    datalist.innerHTML = '';
    Array.from(allTags).sort().forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        datalist.appendChild(option);
    });
}

function renderMoodpromptView(project) {
    updateTagsDatalist(project);
    
    let topBar = moodpromptContainer.querySelector('.moodprompt-top-bar');
    let scrollArea = moodpromptContainer.querySelector('.moodprompt-scroll-area');

    if (!topBar || !scrollArea) {
        moodpromptContainer.innerHTML = '';
        
        topBar = document.createElement('div');
        topBar.className = 'moodprompt-top-bar';

        // 1. Add Prompt Item
        const addBtnItem = document.createElement('div');
        addBtnItem.className = 'stats-item';
        addBtnItem.style.cursor = 'pointer';
        addBtnItem.innerHTML = `<iconify-icon icon="lucide:plus-circle" width="16" height="16"></iconify-icon> <span>Add New Prompt</span>`;
        addBtnItem.onclick = () => {
            const currentProject = projects.find(p => p.id === activeProjectId) || project;
            currentProject.data.prompts.push({ id: Date.now(), title: 'New Prompt', platform: 'midjourney', mediaType: 'image', image1: null, image2: null, text: '', tags: [] });
            renderMoodpromptView(currentProject);
            saveToBrowser();
        };

        // 2. Filter Item
        const filterItem = document.createElement('div');
        filterItem.className = 'stats-item';
        filterItem.innerHTML = `<iconify-icon icon="lucide:layers" width="16" height="16"></iconify-icon>`;
        const filterSelect = document.createElement('select');
        filterSelect.className = 'bar-input';
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All Providers';
        filterSelect.appendChild(allOption);
        Object.keys(platformData).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = platformData[key].name;
            filterSelect.appendChild(option);
        });
        filterSelect.value = moodpromptFilterPlatform;
        filterSelect.onchange = (e) => {
            moodpromptFilterPlatform = e.target.value;
            const currentProject = projects.find(p => p.id === activeProjectId) || project;
            renderMoodpromptView(currentProject);
        };
        filterItem.appendChild(filterSelect);

        // 3. Search Item
        const searchItem = document.createElement('div');
        searchItem.className = 'stats-item';
        searchItem.innerHTML = `<iconify-icon icon="lucide:search" width="16" height="16"></iconify-icon>`;
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'bar-input';
        searchInput.placeholder = 'Search tags...';
        searchInput.value = moodpromptSearchQuery;
        searchInput.style.width = '150px';
        searchInput.oninput = (e) => {
            moodpromptSearchQuery = e.target.value.toLowerCase();
            const currentProject = projects.find(p => p.id === activeProjectId) || project;
            renderMoodpromptView(currentProject);
        };
        searchItem.appendChild(searchInput);

        // 4. Variables Item
        const varBtnItem = document.createElement('div');
        varBtnItem.className = 'stats-item';
        varBtnItem.style.cursor = 'pointer';
        varBtnItem.style.marginLeft = 'auto';
        varBtnItem.innerHTML = `<iconify-icon icon="lucide:braces" width="16" height="16"></iconify-icon> <span>Variables</span>`;
        varBtnItem.onclick = () => {
            const currentProject = projects.find(p => p.id === activeProjectId) || project;
            openVariableManager(currentProject);
        };

        topBar.append(addBtnItem, filterItem, searchItem, varBtnItem);
        moodpromptContainer.appendChild(topBar);

        scrollArea = document.createElement('div');
        scrollArea.className = 'moodprompt-scroll-area';
        moodpromptContainer.appendChild(scrollArea);
    }

    let promptList = scrollArea.querySelector('.prompt-list');
    if (!promptList) {
        promptList = document.createElement('div');
        promptList.className = 'prompt-list';
        scrollArea.appendChild(promptList);

        promptList.addEventListener('dragover', (e) => { e.preventDefault(); });
        promptList.addEventListener('drop', (e) => {
            e.preventDefault();
            const currentProject = projects.find(p => p.id === activeProjectId) || project;
            const oldIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const dropTargetCard = e.target.closest('.prompt-card');
            if (!dropTargetCard) return;

            const allCards = Array.from(promptList.querySelectorAll('.prompt-card'));
            const newIndex = allCards.indexOf(dropTargetCard);

            if (oldIndex !== newIndex) {
                const [movedPrompt] = currentProject.data.prompts.splice(oldIndex, 1);
                currentProject.data.prompts.splice(newIndex, 0, movedPrompt);
                renderMoodpromptView(currentProject);
                saveToBrowser();
            }
        });
    }

    promptList.innerHTML = '';
    const filteredPrompts = project.data.prompts.filter(p => {
        const matchesPlatform = moodpromptFilterPlatform === 'all' || p.platform === moodpromptFilterPlatform;
        const matchesSearch = !moodpromptSearchQuery || (p.tags && p.tags.some(t => t.toLowerCase().includes(moodpromptSearchQuery)));
        return matchesPlatform && matchesSearch;
    });

    filteredPrompts.forEach((prompt, index) => {
        promptList.appendChild(createPromptCard(project, prompt, index));
    });
}

function createPromptCard(project, prompt, index) {
    const card = document.createElement('div');
    card.className = 'prompt-card';
    card.draggable = true;

    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', index); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); });

    const header = document.createElement('div');
    header.className = 'prompt-header';
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';
    titleContainer.style.width = '100%';
    const numberSpan = document.createElement('span');
    numberSpan.className = 'prompt-number';
    numberSpan.textContent = `${index + 1}.`;
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'prompt-title-input';
    titleInput.value = prompt.title;
    titleInput.onchange = (e) => prompt.title = e.target.value;
    titleContainer.append(numberSpan, titleInput);
    const controls = document.createElement('div');
    controls.className = 'prompt-controls';
    const platformSelectWrapper = document.createElement('div');
    platformSelectWrapper.className = 'platform-select-wrapper';
    const platformSelect = document.createElement('select');
    platformSelect.className = 'platform-select';
    Object.keys(platformData).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = platformData[key].name;
        if (key === prompt.platform) option.selected = true;
        platformSelect.appendChild(option);
    });
    const updateIcon = () => { if (platformData[platformSelect.value]) { platformSelectWrapper.style.setProperty('--icon-url', `url('data:image/svg+xml;utf8,${encodeURIComponent(platformData[platformSelect.value].icon)}')`); } };
    updateIcon();
    platformSelect.onchange = (e) => { prompt.platform = e.target.value; updateIcon(); };
    platformSelectWrapper.appendChild(platformSelect);
    const mediaToggle = document.createElement('div');
    mediaToggle.className = 'media-type-toggle';
    const imgBtn = document.createElement('button');
    imgBtn.textContent = 'Image';
    imgBtn.className = `media-type-btn ${prompt.mediaType === 'image' ? 'active' : ''}`;
    const vidBtn = document.createElement('button');
    vidBtn.textContent = 'Video';
    vidBtn.className = `media-type-btn ${prompt.mediaType === 'video' ? 'active' : ''}`;
    mediaToggle.append(imgBtn, vidBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tab-add-btn prompt-delete-btn';
    deleteBtn.title = 'Delete Prompt';
    deleteBtn.innerHTML = `<iconify-icon icon="lucide:trash-2" width="18" height="18"></iconify-icon>`;
    deleteBtn.onclick = () => { project.data.prompts.splice(index, 1); renderMoodpromptView(project); };
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'tab-add-btn prompt-copy-btn';
    copyBtn.title = 'Copy Prompt';
    copyBtn.innerHTML = `<iconify-icon icon="lucide:copy" width="18" height="18"></iconify-icon>`;
    copyBtn.onclick = () => {
        const finalPrompt = resolveVariables(prompt.text, project);
        navigator.clipboard.writeText(finalPrompt).then(() => {
            showToast('Copied to clipboard!');
        });
    };
    
    const body = document.createElement('div');
    body.className = 'prompt-body';
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'prompt-images';
    const imgSlot1 = createImageSlot(project, prompt, 1);
    const imgSlot2 = createImageSlot(project, prompt, 2);
    imagesContainer.append(imgSlot1, imgSlot2);
    const promptText = document.createElement('textarea');
    promptText.className = 'prompt-text-area';
    promptText.placeholder = 'Enter your AI prompt here...';
    promptText.value = prompt.text;
    promptText.style.height = '150px';
    
    const textWrapper = document.createElement('div');
    textWrapper.style.position = 'relative';
    textWrapper.style.flexGrow = '1';
    textWrapper.style.display = 'flex';
    textWrapper.style.flexDirection = 'column';
    
    const expandBtn = document.createElement('button');
    expandBtn.className = 'tab-add-btn';
    expandBtn.style.position = 'absolute';
    expandBtn.style.bottom = '10px';
    expandBtn.style.right = '10px';
    expandBtn.style.background = 'rgba(0,0,0,0.6)';
    expandBtn.style.backdropFilter = 'blur(4px)';
    expandBtn.style.WebkitBackdropFilter = 'blur(4px)';
    expandBtn.style.padding = '4px 6px';
    expandBtn.title = 'Expand/Collapse';
    expandBtn.innerHTML = `<iconify-icon icon="lucide:maximize-2" width="16" height="16"></iconify-icon>`;
    
    let isExpanded = false;
    expandBtn.onclick = () => {
        isExpanded = !isExpanded;
        if (isExpanded) {
            promptText.style.height = 'auto';
            promptText.style.height = promptText.scrollHeight + 'px';
            expandBtn.innerHTML = `<iconify-icon icon="lucide:minimize-2" width="16" height="16"></iconify-icon>`;
        } else {
            promptText.style.height = '150px';
            expandBtn.innerHTML = `<iconify-icon icon="lucide:maximize-2" width="16" height="16"></iconify-icon>`;
        }
    };
    
    promptText.oninput = (e) => {
        prompt.text = e.target.value;
        if (isExpanded) {
            promptText.style.height = 'auto';
            promptText.style.height = promptText.scrollHeight + 'px';
        }
    };

    textWrapper.append(promptText, expandBtn);
    const setMediaType = (type) => {
        prompt.mediaType = type;
        imgBtn.classList.toggle('active', type === 'image');
        vidBtn.classList.toggle('active', type === 'video');
        imgSlot2.style.display = type === 'video' ? 'flex' : 'none';
    };
    imgBtn.onclick = () => setMediaType('image');
    vidBtn.onclick = () => setMediaType('video');
    setMediaType(prompt.mediaType);
    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'prompt-tags-wrapper';
    
    const tagsList = document.createElement('div');
    tagsList.className = 'prompt-tags-list';
    
    const renderTags = () => {
        tagsList.innerHTML = '';
        const tags = prompt.tags || [];
        tags.forEach((tag, tIndex) => {
            const tagEl = document.createElement('span');
            tagEl.className = 'prompt-tag';
            tagEl.textContent = tag;
            const colors = getTagColor(tag);
            tagEl.style.background = colors.bg;
            tagEl.style.borderColor = colors.border;
            const removeBtn = document.createElement('iconify-icon');
            removeBtn.setAttribute('icon', 'lucide:x');
            removeBtn.style.cursor = 'pointer';
            removeBtn.onclick = () => {
                prompt.tags.splice(tIndex, 1);
                scheduleAutoSave();
                renderTags();
                updateTagsDatalist(project);
            };
            tagEl.appendChild(removeBtn);
            tagsList.appendChild(tagEl);
        });
    };
    renderTags();
    
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'prompt-tag-input';
    tagInput.placeholder = 'Add tag... (comma separated)';
    tagInput.setAttribute('list', 'moodprompt-tags-list');
    tagInput.oninput = (e) => {
        if (e.target.value.includes(',')) {
            const newTags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
            if (newTags.length > 0) {
                if (!prompt.tags) prompt.tags = [];
                prompt.tags.push(...newTags);
                e.target.value = '';
                scheduleAutoSave();
                renderTags();
                updateTagsDatalist(project);
            } else {
                e.target.value = '';
            }
        }
    };
    tagInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (val) {
                if (!prompt.tags) prompt.tags = [];
                prompt.tags.push(val);
                e.target.value = '';
                scheduleAutoSave();
                renderTags();
                updateTagsDatalist(project);
            }
        }
    };
    
    tagsWrapper.append(tagsList, tagInput);

    controls.append(platformSelectWrapper, mediaToggle, copyBtn, deleteBtn);
    header.append(titleContainer, controls);

    body.style.flexDirection = 'column';
    const contentRow = document.createElement('div');
    contentRow.style.display = 'flex';
    contentRow.style.gap = '1rem';
    contentRow.style.flexDirection = 'row';
    contentRow.style.width = '100%';
    contentRow.append(imagesContainer, textWrapper);
    
    body.append(contentRow, tagsWrapper);
    card.append(header, body);
    return card;
}

function createImageSlot(project, prompt, slotNumber) {
    const slot = document.createElement('div');
    slot.className = 'image-upload-slot';
    const prop = `image${slotNumber}`;
    if (prompt[prop]) {
        const img = document.createElement('img');
        img.dataset.src = prompt[prop];
        img.className = 'lazy-load';
        imageLazyObserver.observe(img);
        slot.appendChild(img);
        
        const zoomBtn = document.createElement('div');
        zoomBtn.className = 'slot-action-btn zoom-btn';
        zoomBtn.title = 'Zoom';
        zoomBtn.innerHTML = '<iconify-icon icon="lucide:zoom-in"></iconify-icon>';
        zoomBtn.onclick = (e) => { e.stopPropagation(); openLightbox(prompt[prop]); };
        
        const replaceBtn = document.createElement('div');
        replaceBtn.className = 'slot-action-btn replace-btn';
        replaceBtn.title = 'Replace Image';
        replaceBtn.innerHTML = '<iconify-icon icon="lucide:refresh-cw"></iconify-icon>';
        replaceBtn.onclick = (e) => {
            e.stopPropagation();
            promptImageInput.onchange = (ev) => {
                const file = ev.target.files[0];
                handleImageFile(file, (dataUrl) => {
                    prompt[prop] = dataUrl;
                    renderMoodpromptView(project);
                    saveToBrowser();
                });
            };
            promptImageInput.click();
        };
        
        slot.appendChild(zoomBtn);
        slot.appendChild(replaceBtn);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        placeholder.textContent = `+ Add Image ${slotNumber}`;
        slot.appendChild(placeholder);
    }
    slot.onclick = () => {
        promptImageInput.onchange = (e) => {
            const file = e.target.files[0];
            handleImageFile(file, (dataUrl) => {
                prompt[prop] = dataUrl;
                renderMoodpromptView(project);
                saveToBrowser();
            });
        };
        promptImageInput.click();
    };

    // Drag & Drop
    slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.add('drag-over');
    });

    slot.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        handleImageFile(file, (dataUrl) => {
            prompt[prop] = dataUrl;
            renderMoodpromptView(project);
            saveToBrowser();
        });
    });

    return slot;
}

function renderMobileTabsPopup() {
    if (!mobileTabsPopup) return;
    mobileTabsPopup.innerHTML = '';
    if (projects.length === 0) {
        mobileTabsPopup.innerHTML = '<div class="mobile-tab-item" style="justify-content: center; color: var(--text-color-light);">No boards open.</div>';
    }

    projects.forEach(project => {
        const item = document.createElement('div');
        item.className = 'mobile-tab-item';
        item.classList.toggle('active', project.id === activeProjectId);

        const icon = project.type === 'moodinfinite'
            ? `<iconify-icon icon="lucide:image" width="16" height="16"></iconify-icon>`
            : `<iconify-icon icon="lucide:pen-tool" width="16" height="16"></iconify-icon>`;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = project.name;

        const iconSpan = document.createElement('span');
        iconSpan.innerHTML = icon;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tab-close-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.style.marginLeft = 'auto';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            closeTab(project.id, e);
            renderMobileTabsPopup();
        };

        item.appendChild(iconSpan);
        item.appendChild(nameSpan);
        item.appendChild(deleteBtn);

        item.onclick = () => {
            switchTab(project.id);
            toggleMobileTabsPopup();
        };
        mobileTabsPopup.appendChild(item);
    });
}

function toggleMobileTabsPopup() {
    if (!mobileTabsPopup) return;
    const isVisible = mobileTabsPopup.style.display === 'block';
    if (isVisible) {
        mobileTabsPopup.style.display = 'none';
    } else {
        renderMobileTabsPopup(); // Re-render every time it opens
        mobileTabsPopup.style.display = 'block';
    }
}

// Initial event listeners moved to setupEventListeners()

const canvas = document.getElementById('moodboard-canvas');
const ctx = canvas.getContext('2d');
const imageInput = document.getElementById('image-input');
const videoInput = document.getElementById('video-input');
const projectInput = document.getElementById('project-input');
const addImageBtn = document.getElementById('add-image-btn');
const addVideoBtn = document.getElementById('add-video-btn');
const videoPlayAllBtn = document.getElementById('video-play-all-btn');
const videoPauseAllBtn = document.getElementById('video-pause-all-btn');
const videoToolsContainer = document.getElementById('video-tools-container');
const videoPlayPauseBtn = document.getElementById('video-play-pause-btn');
const videoMuteBtn = document.getElementById('video-mute-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addCommentBtn = document.getElementById('add-comment-btn');
const addArrowBtn = document.getElementById('add-arrow-btn');
const addBoxBtn = document.getElementById('add-box-btn');
const addCircleBtn = document.getElementById('add-circle-btn');
const addMeasureBtn = document.getElementById('add-measure-btn');
const addGridBtn = document.getElementById('add-grid-btn');
const addTextListBtn = document.getElementById('add-text-list-btn');
const addCounterBtn = document.getElementById('add-counter-btn');
const drawBtn = document.getElementById('draw-btn');
const alignBtn = document.getElementById('align-btn');
const contextMenu = document.getElementById('context-menu');
const tabContextMenu = document.getElementById('tab-context-menu');
const sfContextMenu = document.getElementById('storyflow-context-menu');
const ganttContextMenu = document.getElementById('gantt-context-menu');
const showGridToggle = document.getElementById('show-grid-toggle');
const snapGridToggle = document.getElementById('snap-grid-toggle');
const dropShadowToggle = document.getElementById('drop-shadow-toggle');
const uiBlurToggle = document.getElementById('ui-blur-toggle');
const showNotificationsToggle = document.getElementById('show-notifications-toggle');
const gridSizeSlider = document.getElementById('grid-size-slider');
const gridSizeValue = document.getElementById('grid-size-value');
const gridOpacitySlider = document.getElementById('grid-opacity-slider');
const gridOpacityValue = document.getElementById('grid-opacity-value');
const deleteItemBtn = document.getElementById('delete-item-btn');
const savePngBtn = document.getElementById('save-png-btn');
const printBtn = document.getElementById('print-btn');
const saveProjectBtn = document.getElementById('save-project-btn');
const loadProjectBtn = document.getElementById('load-project-btn');
const bgColorPicker = document.getElementById('bg-color-picker');
const accentColorPicker = document.getElementById('accent-color-picker');
const gridColorPicker = document.getElementById('grid-color-picker');
const toolbarAccentColorPicker = document.getElementById('toolbar-accent-color-picker');
const textEditor = document.getElementById('text-editor');
const itemColorToolContainer = document.getElementById('item-color-tool-container');
const itemColorPicker = document.getElementById('item-color-picker');
const selectionToolbar = document.getElementById('selection-toolbar');
const toggleBoxStyleBtn = document.getElementById('toggle-box-style-btn');
const scaleBtn = document.getElementById('scale-btn');
const rotateBtn = document.getElementById('rotate-btn');
const resetTransformBtn = document.getElementById('reset-transform-btn');
const flipHorizontalBtn = document.getElementById('flip-horizontal-btn');
const flipVerticalBtn = document.getElementById('flip-vertical-btn');
const pinBtn = document.getElementById('pin-btn');
const deleteSelectionBtn = document.getElementById('delete-selection-btn');
const bringFrontBtn = document.getElementById('bring-front-btn');
const sendBackBtn = document.getElementById('send-back-btn');
const confirmationModalOverlay = document.getElementById('confirmation-modal-overlay');
const confirmNewBtn = document.getElementById('confirm-new-btn');
const cancelNewBtn = document.getElementById('cancel-new-btn');
const opacitySliderContainer = document.getElementById('opacity-slider-container');
const opacitySeparator = document.getElementById('opacity-separator');
const itemOpacitySlider = document.getElementById('item-opacity-slider');
const itemOpacityValue = document.getElementById('item-opacity-value');
const paletteBtn = document.getElementById('palette-btn');
const palettePanel = document.getElementById('palette-panel');
const eyedropperBtn = document.getElementById('eyedropper-btn');
const groupBtn = document.getElementById('group-btn');
const groupOrderedBtn = document.getElementById('group-ordered-btn');
const connectBtn = document.getElementById('connect-btn');
const ungroupBtn = document.getElementById('ungroup-btn');
const textToolsContainer = document.getElementById('text-tools-container');
const iconToolsContainer = document.getElementById('icon-tools-container');
const commentIconBtn = document.getElementById('comment-icon-btn');
const iconPickerPanel = document.getElementById('icon-picker-panel');
const gridToolsContainer = document.getElementById('grid-tools-container');
const measureToolsContainer = document.getElementById('measure-tools-container');
const gridRowsInput = document.getElementById('grid-rows-input');
const gridColsInput = document.getElementById('grid-cols-input');
const measureUnitSelect = document.getElementById('measure-unit-select');
const fontFamilySelect = document.getElementById('font-family-select');
const textAlignLeftBtn = document.getElementById('text-align-left-btn');
const textAlignCenterBtn = document.getElementById('text-align-center-btn');
const textAlignRightBtn = document.getElementById('text-align-right-btn');
const textStyleBoldBtn = document.getElementById('text-style-bold-btn');
const textStyleItalicBtn = document.getElementById('text-style-italic-btn');
const openHelpBtn = document.getElementById('open-help-btn');
const helpModalOverlay = document.getElementById('help-modal-overlay');
const closeHelpBtn = document.getElementById('close-help-btn');
const selectToolBtn = document.getElementById('select-tool-btn');
const downloadImageBtn = document.getElementById('download-image-btn');
const contextConnectBtn = document.getElementById('context-connect-btn');
const copyForMoodlistBtn = document.getElementById('copy-for-moodlist-btn');
const downloadSeparator = document.getElementById('download-separator');
const addLinkBtn = document.getElementById('add-link-btn');
const inputModalOverlay = document.getElementById('input-modal-overlay');
const inputModalTitle = document.getElementById('input-modal-title');
const linkUrlInput = document.getElementById('link-url-input');
const linkTitleInput = document.getElementById('link-title-input');
const cancelInputBtn = document.getElementById('cancel-input-btn');
const confirmInputBtn = document.getElementById('confirm-input-btn');
const linkToolsContainer = document.getElementById('link-tools-container');
const editLinkBtn = document.getElementById('edit-link-btn');
const openLinkBtn = document.getElementById('open-link-btn');
const mobileContextBtn = document.getElementById('mobile-context-btn');
const noteEditorOverlay = document.getElementById('note-editor-overlay');
const noteTitleInput = document.getElementById('note-title-input');
const noteBodyInput = document.getElementById('note-body-input');
const cancelNoteBtn = document.getElementById('cancel-note-btn');
const confirmNoteBtn = document.getElementById('confirm-note-btn');
const noteFmtBtns = document.querySelectorAll('.note-fmt-btn');
const noteBgColorInput = document.getElementById('note-bg-color-input');
const noteBgColorWrapper = document.getElementById('note-bg-color-wrapper');
const centerSelectedBtn = document.getElementById('center-selected-btn');

let cameraOffset = { x: 0, y: 0 }, cameraZoom = 1;
let items = [], selectedItems = [];
let globalImageCache = {}; // Cache for image source data
let globalVideoCache = {}; // Cache for video files (Blobs or URLs)
let historyStack, historyIndex;

const MAX_ZOOM = 5, MIN_ZOOM = 0.1, SCROLL_SENSITIVITY = 0.0005;
let isDragging = false, dragStart = { x: 0, y: 0 };
let isRearrangingList = false, rearrangingListObj = null, rearrangingItemIndex = -1;
let clipboard = [];
let internalClipboardTimestamp = 0;
let isMovingItems = false, moveStart = { x: 0, y: 0 };
let currentTool = null, isDrawing = false;
let _pickingForElement = null; // 'color' or 'bgColor'
let defaultCanvasBg = '#0d0d0d', defaultAccent = '#429eff', defaultGridColor = '#f9f8f6';
let canvasBackgroundColor = defaultCanvasBg, accentColor = defaultAccent, gridColor = defaultGridColor;
let isConnectionMode = false;
let connectionSourceItem = null;
let activeGizmo = null, isTransforming = false, isTransformingArrow = false;
let transformingHandle = null, transformStart = { x: 0, y: 0 }, originalItemState = null;
let hoveredGizmo = null, hoveredArrowHandle = null;
let isSelectingBox = false, selectionBox = { startX: 0, startY: 0, endX: 0, endY: 0 };
let currentlyEditingText = null;
let hoveredItem = null;
let isDraggingConnector = false, tempConnector = null, hoveredPort = null, hoveredConnector = null;
let showGrid = true, snapToGrid = true, showDropShadow = true, showNotifications = true, showUiBlur = true;
let gridSize = 50, gridOpacity = 0.05;
let currentProjectName = 'moodinfinite';
const HISTORY_LIMIT = 50;
let needsUpdate = true;
function requestUpdate() { needsUpdate = true; }

function getLuminance(hex) {
    if (!hex) return 0;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.722;
}

const commentIcons = {
    'none': '',
    'star': '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"></path>',
    'eyedropper': '<path d="m12 9l-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"></path><path d="m18 9l.4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4l3.4-3.4a1 1 0 1 1 3 3zM2 22l.414-.414"></path>',
    'sparkles': '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"></path><circle cx="4" cy="20" r="2"></circle>',
    'cursor': '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"></path>',
    'info': '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4m0-4h.01"></path>'
};

let svgCache = {};
function getIconImage(icon, color) {
    const key = icon + color;
    if (svgCache[key]) return svgCache[key];
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${commentIcons[icon]}</svg>`;
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    svgCache[key] = img;
    return img;
}

const colorPalettes = [
    { bg: '#0d0d0d', accent: '#429eff', grid: '#ffffff' }, { bg: '#f8f9fa', accent: '#007bff', grid: '#ced4da' },
    { bg: '#fdf6e3', accent: '#cb4b16', grid: '#93a1a1' }, { bg: '#002b36', accent: '#268bd2', grid: '#586e75' },
    { bg: '#2e3440', accent: '#88c0d0', grid: '#4c566a' }, { bg: '#282a36', accent: '#ff79c6', grid: '#44475a' },
    { bg: '#282828', accent: '#fabd2f', grid: '#504945' }, { bg: '#191724', accent: '#eb6f92', grid: '#555169' },
    { bg: '#2c3d33', accent: '#a7c957', grid: '#6a7d6d' }, { bg: '#bfbfbf', accent: '#fe345c', grid: '#000000' }
];

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.tab-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
function showAndPositionMenu(menu, event) { menu.style.display = 'block'; const menuWidth = menu.offsetWidth, menuHeight = menu.offsetHeight, screenWidth = window.innerWidth, screenHeight = window.innerHeight, padding = 8; let left = event.clientX, top = event.clientY; if (left + menuWidth > screenWidth - padding) { left = screenWidth - menuWidth - padding } if (top + menuHeight > screenHeight - padding) { top = screenHeight - menuHeight - padding } left = Math.max(padding, left); top = Math.max(padding, top); menu.style.left = `${left}px`; menu.style.top = `${top}px` }

function saveSettings() {
    try {
        const settings = { showGrid, snapToGrid, showDropShadow, showNotifications, showUiBlur, gridSize, gridOpacity };
        localStorage.setItem('moodinfinite-settings', JSON.stringify(settings));
    } catch (error) { console.error("Could not save settings to localStorage:", error); }
}

function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('moodinfinite-settings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            showGrid = settings.showGrid ?? showGrid;
            snapToGrid = settings.snapToGrid ?? snapToGrid;
            showDropShadow = settings.showDropShadow ?? showDropShadow;
            showNotifications = settings.showNotifications ?? showNotifications;
            showUiBlur = settings.showUiBlur ?? showUiBlur;
            gridSize = settings.gridSize ?? gridSize;
            gridOpacity = settings.gridOpacity ?? gridOpacity;
            defaultCanvasBg = settings.defaultCanvasBg ?? defaultCanvasBg;
            defaultAccent = settings.defaultAccent ?? defaultAccent;
            defaultGridColor = settings.defaultGridColor ?? defaultGridColor;
            canvasBackgroundColor = defaultCanvasBg;
            accentColor = defaultAccent;
            gridColor = defaultGridColor;
        }
    } catch (error) { console.error("Could not load settings from localStorage:", error); }
}

function saveDefaultTheme() {
    defaultCanvasBg = canvasBackgroundColor;
    defaultAccent = accentColor;
    defaultGridColor = gridColor;
    const savedSettings = localStorage.getItem('moodinfinite-settings');
    let settings = savedSettings ? JSON.parse(savedSettings) : {};
    settings.defaultCanvasBg = defaultCanvasBg;
    settings.defaultAccent = defaultAccent;
    settings.defaultGridColor = defaultGridColor;
    localStorage.setItem('moodinfinite-settings', JSON.stringify(settings));
    showToast("Current theme set as default for new boards.");
}

function applySettingsToUI() {
    showGridToggle.checked = showGrid;
    snapGridToggle.checked = snapToGrid;
    dropShadowToggle.checked = showDropShadow;
    if (uiBlurToggle) uiBlurToggle.checked = showUiBlur;
    document.body.classList.toggle('no-blur', !showUiBlur);
    showNotificationsToggle.checked = showNotifications;
    gridSizeSlider.value = gridSize;
    gridSizeValue.textContent = `${gridSize}px`;
    gridOpacitySlider.value = gridOpacity;
    gridOpacityValue.textContent = `${Math.round(gridOpacity * 100)}%`;
    updateUIColors();
}

function setupEventListeners() {
    tabsList.addEventListener('dragover', e => { e.preventDefault(); const t = document.querySelector('.tab-item.dragging'); if (!t) return; const o = getDragAfterElement(tabsList, e.clientX); if (o == null) { tabsList.appendChild(t) } else { tabsList.insertBefore(t, o) } });
    tabsList.addEventListener('drop', e => { 
        e.preventDefault(); 
        const t = parseInt(e.dataTransfer.getData('text/plain')); 
        if (isNaN(t)) return; 
        const o = Array.from(tabsList.querySelectorAll('.tab-item')).map(e => parseInt(e.dataset.id)); 
        projects.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); 
        projects.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });
        renderTabs(); 
    });
    tabsList.addEventListener('wheel', e => { if (tabsList.scrollWidth <= tabsList.clientWidth || e.deltaY === 0) return; e.preventDefault(); tabsList.scrollLeft += e.deltaY; });
    tabsList.addEventListener('dblclick', e => { if (e.target === tabsList) createNewProject('moodinfinite'); });
    tabsList.addEventListener('scroll', updateScrollIndicators);
    const tabObserver = new ResizeObserver(updateScrollIndicators);
    tabObserver.observe(tabsList);

    if (addMoodinfiniteTabBtn) addMoodinfiniteTabBtn.addEventListener('click', () => createNewProject('moodinfinite'));
    if (addMoodpromptTabBtn) addMoodpromptTabBtn.addEventListener('click', () => createNewProject('moodprompt'));
    if (addColorseekerTabBtn) addColorseekerTabBtn.addEventListener('click', () => createNewProject('colorseeker'));
    if (addStoryflowTabBtn) addStoryflowTabBtn.addEventListener('click', () => createNewProject('storyflow'));

    const copyBtn = document.getElementById('copy-to-clipboard-btn');
    const renameTabBtn = document.getElementById('rename-tab-btn');
    const closeContextTabBtn = document.getElementById('close-context-tab-btn');

    if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
    if (renameTabBtn) renameTabBtn.addEventListener('click', () => {
        const e = tabContextMenu.dataset.tabId;
        if (e) {
            const t = document.querySelector(`.tab-item[data-id='${e}']`);
            if (t) {
                const e = t.querySelector('.tab-name'), o = t.querySelector('.tab-name-input');
                e.style.display = 'none';
                o.style.display = 'inline';
                o.focus();
                o.select()
            }
        }
        tabContextMenu.style.display = 'none'
    });
    if (closeContextTabBtn) closeContextTabBtn.addEventListener('click', () => {
        const e = tabContextMenu.dataset.tabId;
        if (e) { closeTab(parseInt(e)) }
        tabContextMenu.style.display = 'none'
    });

    const sendTabToStartBtn = document.getElementById('send-tab-to-start-btn');
    const sendTabToLastBtn = document.getElementById('send-tab-to-last-btn');
    const pinTabBtn = document.getElementById('pin-tab-btn');

    if (pinTabBtn) pinTabBtn.addEventListener('click', () => {
        const id = tabContextMenu.dataset.tabId;
        if (id) {
            const project = projects.find(p => p.id.toString() === id.toString());
            if (project) {
                project.pinned = !project.pinned;
                projects.sort((a, b) => {
                    if (a.pinned && !b.pinned) return -1;
                    if (!a.pinned && b.pinned) return 1;
                    return 0;
                });
                renderTabs();
                saveToBrowser();
                showToast(project.pinned ? 'Tab pinned to start.' : 'Tab unpinned.');
            }
        }
        tabContextMenu.style.display = 'none';
    });

    if (sendTabToStartBtn) sendTabToStartBtn.addEventListener('click', () => {
        const id = tabContextMenu.dataset.tabId;
        if (id) {
            const idx = projects.findIndex(p => p.id.toString() === id.toString());
            if (idx > 0) {
                const [moved] = projects.splice(idx, 1);
                projects.unshift(moved);
                renderTabs();
                saveToBrowser();
                showToast('Tab moved to start.');
            }
        }
        tabContextMenu.style.display = 'none';
    });

    if (sendTabToLastBtn) sendTabToLastBtn.addEventListener('click', () => {
        const id = tabContextMenu.dataset.tabId;
        if (id) {
            const idx = projects.findIndex(p => p.id.toString() === id.toString());
            if (idx !== -1 && idx < projects.length - 1) {
                const [moved] = projects.splice(idx, 1);
                projects.push(moved);
                renderTabs();
                saveToBrowser();
                showToast('Tab moved to last.');
            }
        }
        tabContextMenu.style.display = 'none';
    });

    const sfAddLeftBtn = document.getElementById('sf-add-left-btn');
    const sfAddRightBtn = document.getElementById('sf-add-right-btn');
    const sfDeleteBtn = document.getElementById('sf-delete-btn');
    const sfDuplicateBtn = document.getElementById('sf-duplicate-btn');
    const sfClearBtn = document.getElementById('sf-clear-btn');
    const sfSendStartBtn = document.getElementById('sf-send-start-btn');
    const sfSendLastBtn = document.getElementById('sf-send-last-btn');
    const sfMoveLeftBtn = document.getElementById('sf-move-left-btn');
    const sfMoveRightBtn = document.getElementById('sf-move-right-btn');
    const sfDownloadImgBtn = document.getElementById('sf-download-img-btn');

    const getSfContext = () => {
        const frameIndex = parseInt(sfContextMenu.dataset.frameIndex);
        const proj = projects.find(p => p.id === activeProjectId);
        return { frameIndex, proj };
    };
    const closeSfMenu = () => { sfContextMenu.style.display = 'none'; };

    if (sfAddLeftBtn) sfAddLeftBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex)) {
            proj.data.frames.splice(frameIndex, 0, { title: '', description: '', image: null, meta: { duration: "5", camera: "" } });
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame added to the left.');
        }
        closeSfMenu();
    });

    if (sfAddRightBtn) sfAddRightBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex)) {
            proj.data.frames.splice(frameIndex + 1, 0, { title: '', description: '', image: null, meta: { duration: "5", camera: "" } });
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame added to the right.');
        }
        closeSfMenu();
    });

    if (sfDuplicateBtn) sfDuplicateBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex)) {
            const original = proj.data.frames[frameIndex];
            const copy = JSON.parse(JSON.stringify(original));
            proj.data.frames.splice(frameIndex + 1, 0, copy);
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame duplicated.');
        }
        closeSfMenu();
    });

    if (sfClearBtn) sfClearBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex)) {
            proj.data.frames[frameIndex] = { title: '', description: '', image: null, meta: { duration: "5", camera: "" } };
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame cleared.');
        }
        closeSfMenu();
    });

    if (sfSendStartBtn) sfSendStartBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex) && frameIndex > 0) {
            const [frame] = proj.data.frames.splice(frameIndex, 1);
            proj.data.frames.unshift(frame);
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame moved to start.');
        }
        closeSfMenu();
    });

    if (sfSendLastBtn) sfSendLastBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex) && frameIndex < proj.data.frames.length - 1) {
            const [frame] = proj.data.frames.splice(frameIndex, 1);
            proj.data.frames.push(frame);
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame moved to last.');
        }
        closeSfMenu();
    });

    if (sfMoveLeftBtn) sfMoveLeftBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex) && frameIndex > 0) {
            const frames = proj.data.frames;
            [frames[frameIndex - 1], frames[frameIndex]] = [frames[frameIndex], frames[frameIndex - 1]];
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame moved left.');
        }
        closeSfMenu();
    });

    if (sfMoveRightBtn) sfMoveRightBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex) && frameIndex < proj.data.frames.length - 1) {
            const frames = proj.data.frames;
            [frames[frameIndex], frames[frameIndex + 1]] = [frames[frameIndex + 1], frames[frameIndex]];
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame moved right.');
        }
        closeSfMenu();
    });

    if (sfDownloadImgBtn) sfDownloadImgBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex)) {
            const frame = proj.data.frames[frameIndex];
            if (frame && frame.image) {
                const a = document.createElement('a');
                a.href = frame.image;
                const frameNum = frameIndex + 1;
                const title = frame.title ? frame.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : `frame_${frameNum}`;
                a.download = `${title}.png`;
                a.click();
                showToast(`Downloading frame ${frameNum} image.`);
            } else {
                showToast('No image on this frame.');
            }
        }
        closeSfMenu();
    });

    if (sfDeleteBtn) sfDeleteBtn.addEventListener('click', () => {
        const { frameIndex, proj } = getSfContext();
        if (proj && !isNaN(frameIndex)) {
            proj.data.frames.splice(frameIndex, 1);
            renderStoryflowView(proj); saveToBrowser(); showToast('Frame deleted.');
        }
        closeSfMenu();
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', e => { e.preventDefault(); adjustZoom(e, -e.deltaY * SCROLL_SENSITIVITY) });
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('touchstart', onTouchStart, { passive: !1 });
    canvas.addEventListener('touchend', onTouchEnd, { passive: !1 });
    canvas.addEventListener('touchmove', onTouchMove, { passive: !1 });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: !1 });

    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    document.addEventListener('click', e => {
        if (contextMenu && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
        if (tabContextMenu && !tabContextMenu.contains(e.target)) tabContextMenu.style.display = 'none';
        if (sfContextMenu && !sfContextMenu.contains(e.target)) sfContextMenu.style.display = 'none';
        if (mobileTabsPopup && mobileTabsPopup.style.display === 'block' && !mobileTabsPopup.contains(e.target) && e.target !== mobileTabsBtn && !mobileTabsBtn.contains(e.target)) {
            mobileTabsPopup.style.display = 'none'
        }
        if (palettePanel && palettePanel.classList.contains('open') && !palettePanel.contains(e.target) && e.target !== paletteBtn && !paletteBtn.contains(e.target)) {
            palettePanel.classList.remove('open');
        }
    });

    if (closeAssetLibraryBtn) closeAssetLibraryBtn.addEventListener('click', () => assetLibraryOverlay.style.display = 'none');
    if (assetLibraryOverlay) assetLibraryOverlay.addEventListener('click', (e) => { if (e.target === assetLibraryOverlay) assetLibraryOverlay.style.display = 'none'; });

    document.addEventListener('touchstart', e => {
        if (contextMenu && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
        if (tabContextMenu && !tabContextMenu.contains(e.target)) tabContextMenu.style.display = 'none';
        if (sfContextMenu && !sfContextMenu.contains(e.target)) sfContextMenu.style.display = 'none';
        if (palettePanel && palettePanel.classList.contains('open') && !palettePanel.contains(e.target) && e.target !== paletteBtn && !paletteBtn.contains(e.target)) {
            palettePanel.classList.remove('open')
        }
        if (iconPickerPanel && iconPickerPanel.style.display === 'flex' && !iconPickerPanel.contains(e.target) && e.target !== commentIconBtn && !commentIconBtn.contains(e.target)) {
            iconPickerPanel.style.display = 'none'
        }
    }, { capture: true, passive: true });

    window.addEventListener('paste', handlePaste);

    // Prevent global middle-click paste/autoscroll behavior (typical on Linux)
    window.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    window.addEventListener('mouseup', e => { if (e.button === 1) e.preventDefault(); });
    window.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });

    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('dragleave', handleDragLeave);
    canvas.addEventListener('drop', handleDrop);

    if (openHelpBtn) openHelpBtn.addEventListener('click', () => helpModalOverlay.style.display = 'flex');
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => helpModalOverlay.style.display = 'none');
    if (helpModalOverlay) helpModalOverlay.addEventListener('click', e => { if (e.target === helpModalOverlay) { helpModalOverlay.style.display = 'none' } });

    if (savePngBtn) savePngBtn.addEventListener('click', saveAsPng);
    if (printBtn) printBtn.addEventListener('click', prepareAndPrint);
    const exportSheetBtn = document.getElementById('export-sheet-btn');
    if (exportSheetBtn) exportSheetBtn.addEventListener('click', () => {
        const activeProject = projects.find(p => p.id === activeProjectId);
        if (!activeProject || activeProject.type !== 'storyflow') {
            showToast('Export as Sheet is only available for Moodflow boards.', 'error');
            return;
        }
        exportMoodflowAsSheet(activeProject);
    });
    if (saveProjectBtn) saveProjectBtn.addEventListener('click', saveProject);
    if (loadProjectBtn) loadProjectBtn.addEventListener('click', () => projectInput.click());

    if (paletteBtn) paletteBtn.addEventListener('click', () => {
        if (palettePanel.classList.contains('open')) {
            palettePanel.classList.remove('open');
        } else {
            const buttonRect = paletteBtn.getBoundingClientRect();
            palettePanel.style.top = `${buttonRect.bottom + 8}px`;
            palettePanel.style.left = `0px`;
            palettePanel.classList.add('open');
            const panelWidth = palettePanel.offsetWidth;
            const screenPadding = 8;
            let newLeft = buttonRect.right - panelWidth;
            newLeft = Math.max(screenPadding, newLeft);
            palettePanel.style.left = `${newLeft}px`;
        }
    });

    if (addImageBtn) addImageBtn.addEventListener('click', () => imageInput.click());
    if (imageInput) imageInput.addEventListener('change', handleImageUpload);
    if (addVideoBtn) addVideoBtn.addEventListener('click', () => videoInput.click());
    if (videoInput) videoInput.addEventListener('change', handleVideoUpload);
    if (videoPlayAllBtn) {
        videoPlayAllBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let changed = false;
            const process = (itemList) => {
                itemList.forEach(item => {
                    if (item.type === 'video' && item.video) {
                        item.video.play().catch(e => console.log("Autoplay prevented:", e));
                        item.isPlaying = true;
                        changed = true;
                    } else if (item.type === 'group' && item.items) {
                        process(item.items);
                    }
                });
            };
            process(items);
            if (changed) {
                updateSelectionToolbar();
                requestUpdate();
                saveStateForUndo();
            }
        });
    }
    if (videoPauseAllBtn) {
        videoPauseAllBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let changed = false;
            const process = (itemList) => {
                itemList.forEach(item => {
                    if (item.type === 'video' && item.video) {
                        item.video.pause();
                        item.isPlaying = false;
                        changed = true;
                    } else if (item.type === 'group' && item.items) {
                        process(item.items);
                    }
                });
            };
            process(items);
            if (changed) {
                updateSelectionToolbar();
                requestUpdate();
                saveStateForUndo();
            }
        });
    }
    if (projectInput) projectInput.addEventListener('change', handleProjectUpload);
    if (mobileTabsBtn) mobileTabsBtn.addEventListener('click', toggleMobileTabsPopup);
    if (connectBtn) {
        connectBtn.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            toggleConnectionMode();
        });
    }
    if (contextConnectBtn) {
        contextConnectBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleConnectionMode();
        });
    }
    if (mobileContextBtn) mobileContextBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const fakeEvent = {
            preventDefault: () => { },
            clientX: window.innerWidth / 2,
            clientY: window.innerHeight / 2,
            isFake: true
        };
        onContextMenu(fakeEvent);
    });

    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('#left-bar .tool-button');
        if (!btn) return;
        if (btn.id === 'add-arrow-btn') setCurrentTool('arrow');
        else if (btn.id === 'add-text-btn') setCurrentTool('text');
        else if (btn.id === 'add-comment-btn') setCurrentTool('comment');
        else if (btn.id === 'add-link-btn') setCurrentTool('link');
        else if (btn.id === 'add-box-btn') setCurrentTool('box');
        else if (btn.id === 'add-circle-btn') setCurrentTool('circle');
        else if (btn.id === 'add-measure-btn') setCurrentTool('measure');
        else if (btn.id === 'add-grid-btn') setCurrentTool('grid');
        else if (btn.id === 'add-textList-btn') setCurrentTool('textList');
        else if (btn.id === 'add-counter-btn') setCurrentTool('counter');
        else if (btn.id === 'draw-btn') setCurrentTool('draw');
        else if (btn.id === 'eyedropper-btn') setCurrentTool('eyedropper');
        else if (btn.id === 'select-tool-btn') setCurrentTool(null);
    });

    if (alignBtn) alignBtn.addEventListener('click', autoAlignSelection);
    const alignGridBtn = document.getElementById('align-grid-btn');
    if (alignGridBtn) alignGridBtn.addEventListener('click', autoAlignSelection);
    const alignRowBtn = document.getElementById('align-row-btn');
    if (alignRowBtn) alignRowBtn.addEventListener('click', alignHorizontalRow);
    const alignColBtn = document.getElementById('align-col-btn');
    if (alignColBtn) alignColBtn.addEventListener('click', alignVerticalColumn);
    const alignLeftBtn = document.getElementById('align-left-btn');
    if (alignLeftBtn) alignLeftBtn.addEventListener('click', alignLeft);
    const alignCenterHBtn = document.getElementById('align-center-h-btn');
    if (alignCenterHBtn) alignCenterHBtn.addEventListener('click', alignCenterH);
    const alignRightBtn = document.getElementById('align-right-btn');
    if (alignRightBtn) alignRightBtn.addEventListener('click', alignRight);
    const alignTopBtn = document.getElementById('align-top-btn');
    if (alignTopBtn) alignTopBtn.addEventListener('click', alignTop);
    const alignMiddleVBtn = document.getElementById('align-middle-v-btn');
    if (alignMiddleVBtn) alignMiddleVBtn.addEventListener('click', alignMiddleV);
    const alignBottomBtn = document.getElementById('align-bottom-btn');
    if (alignBottomBtn) alignBottomBtn.addEventListener('click', alignBottom);
    const distributeHBtn = document.getElementById('distribute-h-btn');
    if (distributeHBtn) distributeHBtn.addEventListener('click', distributeHorizontally);
    const distributeVBtn = document.getElementById('distribute-v-btn');
    if (distributeVBtn) distributeVBtn.addEventListener('click', distributeVertically);

    const centerViewBtn = document.getElementById('center-view-btn');
    if (centerViewBtn) centerViewBtn.addEventListener('click', centerView);
    if (centerSelectedBtn) centerSelectedBtn.addEventListener('click', focusOnSelection);

    if (showGridToggle) showGridToggle.addEventListener('change', e => { showGrid = e.target.checked; saveSettings() });
    if (snapGridToggle) snapGridToggle.addEventListener('change', e => { snapToGrid = e.target.checked; saveSettings() });
    if (dropShadowToggle) dropShadowToggle.addEventListener('change', e => { showDropShadow = e.target.checked; saveSettings() });
    if (uiBlurToggle) uiBlurToggle.addEventListener('change', e => { showUiBlur = e.target.checked; document.body.classList.toggle('no-blur', !showUiBlur); saveSettings() });
    if (showNotificationsToggle) showNotificationsToggle.addEventListener('change', e => { showNotifications = e.target.checked; saveSettings() });

    if (gridSizeSlider) gridSizeSlider.addEventListener('input', e => { gridSize = parseInt(e.target.value); gridSizeValue.textContent = `${gridSize}px`; saveSettings() });
    if (gridOpacitySlider) gridOpacitySlider.addEventListener('input', e => { gridOpacity = parseFloat(e.target.value); gridOpacityValue.textContent = `${Math.round(gridOpacity * 100)}%`; saveSettings() });

    if (deleteItemBtn) deleteItemBtn.addEventListener('click', deleteSelectedItems);

    const updateColor = (key, value) => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (proj) {
            proj.data[key] = value;
            if (key === 'canvasBackgroundColor') canvasBackgroundColor = value;
            else if (key === 'accentColor') accentColor = value;
            else if (key === 'gridColor') gridColor = value;
            updateUIColors()
        }
    };

    if (bgColorPicker) bgColorPicker.addEventListener('input', e => updateColor('canvasBackgroundColor', e.target.value));
    if (accentColorPicker) accentColorPicker.addEventListener('input', e => updateColor('accentColor', e.target.value));
    if (toolbarAccentColorPicker) toolbarAccentColorPicker.addEventListener('input', e => updateColor('accentColor', e.target.value));
    if (gridColorPicker) gridColorPicker.addEventListener('input', e => updateColor('gridColor', e.target.value));

    if (itemOpacitySlider) {
        itemOpacitySlider.addEventListener('input', e => {
            const t = parseFloat(e.target.value);
            selectedItems.forEach(e => { e.opacity = t });
            itemOpacityValue.textContent = `${Math.round(t * 100)}%`
        });
        itemOpacitySlider.addEventListener('change', () => { saveStateForUndo() });
    }

    if (toggleBoxStyleBtn) toggleBoxStyleBtn.addEventListener('click', toggleBoxStyle);
    if (videoPlayPauseBtn) {
        videoPlayPauseBtn.addEventListener('click', () => {
            if (selectedItems.length === 1 && selectedItems[0].type === 'video') {
                const item = selectedItems[0];
                if (item.video) {
                    if (item.video.paused) {
                        item.video.play().catch(e => console.log(e));
                        item.isPlaying = true;
                    } else {
                        item.video.pause();
                        item.isPlaying = false;
                    }
                    updateSelectionToolbar();
                    requestUpdate();
                }
            }
        });
    }
    if (videoMuteBtn) {
        videoMuteBtn.addEventListener('click', () => {
            if (selectedItems.length === 1 && selectedItems[0].type === 'video') {
                const item = selectedItems[0];
                if (item.video) {
                    item.video.muted = !item.video.muted;
                    item.isMuted = item.video.muted;
                    updateSelectionToolbar();
                    requestUpdate();
                }
            }
        });
    }
    if (groupBtn) groupBtn.addEventListener('click', groupSelectedItems);
    if (groupOrderedBtn) groupOrderedBtn.addEventListener('click', groupOrderedItems);
    if (ungroupBtn) ungroupBtn.addEventListener('click', ungroupSelectedItems);

    if (scaleBtn) scaleBtn.addEventListener('click', () => setActiveGizmo('scale'));
    if (rotateBtn) rotateBtn.addEventListener('click', () => setActiveGizmo('rotate'));
    if (flipHorizontalBtn) flipHorizontalBtn.addEventListener('click', flipHorizontal);
    if (flipVerticalBtn) flipVerticalBtn.addEventListener('click', flipVertical);
    if (pinBtn) pinBtn.addEventListener('click', togglePin);
    if (deleteSelectionBtn) deleteSelectionBtn.addEventListener('click', deleteSelectedItems);
    if (bringFrontBtn) bringFrontBtn.addEventListener('click', bringSelectedToFront);
    if (sendBackBtn) sendBackBtn.addEventListener('click', sendSelectedToBack);

    if (fontFamilySelect) fontFamilySelect.addEventListener('change', setTextFontFamily);
    if (textAlignLeftBtn) textAlignLeftBtn.addEventListener('click', () => setTextAlign('left'));
    if (textAlignCenterBtn) textAlignCenterBtn.addEventListener('click', () => setTextAlign('center'));
    if (textAlignRightBtn) textAlignRightBtn.addEventListener('click', () => setTextAlign('right'));
    if (textStyleBoldBtn) textStyleBoldBtn.addEventListener('click', toggleTextStyleBold);
    if (textStyleItalicBtn) textStyleItalicBtn.addEventListener('click', toggleTextStyleItalic);

    if (gridRowsInput) gridRowsInput.addEventListener('change', e => updateGridDimension('rows', e.target.value));
    if (gridColsInput) gridColsInput.addEventListener('change', e => updateGridDimension('cols', e.target.value));

    if (measureUnitSelect) measureUnitSelect.addEventListener('change', updateMeasureUnit);

    if (textEditor) {
        textEditor.addEventListener('blur', finishEditingText);
        textEditor.addEventListener('input', autoResizeTextEditor);
        textEditor.addEventListener('keydown', e => {
            if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
                e.preventDefault();
                finishEditingText()
            }
        });
    }

    if (itemColorPicker) {
        itemColorPicker.addEventListener('input', e => {
            if (selectedItems.length === 1 && (['box', 'circle', 'text', 'measure', 'comment', 'link', 'textList'].includes(selectedItems[0].type))) {
                selectedItems[0].color = e.target.value;
                saveStateForUndo();
            }
        });
    }

    if (noteBgColorInput) {
        noteBgColorInput.addEventListener('input', e => {
            if (selectedItems.length === 1 && selectedItems[0].type === 'text') {
                selectedItems[0].bgColor = e.target.value;
                saveStateForUndo();
            }
        });
    }

    const itemColorEyedropper = document.getElementById('item-color-eyedropper');
    if (itemColorEyedropper) {
        itemColorEyedropper.addEventListener('click', async () => {
            if (window.EyeDropper) {
                const eyeDropper = new EyeDropper();
                try {
                    const result = await eyeDropper.open();
                    const hexColor = result.sRGBHex;
                    if (selectedItems.length === 1 && (['box', 'circle', 'text', 'measure', 'comment', 'link', 'textList'].includes(selectedItems[0].type))) {
                        selectedItems[0].color = hexColor;
                        if (itemColorPicker) itemColorPicker.value = hexColor;
                        saveStateForUndo();
                        requestUpdate();
                    }
                } catch (e) {
                    console.log("EyeDropper closed or cancelled");
                }
            } else {
                _pickingForElement = 'color';
                setCurrentTool('eyedropper');
            }
        });
    }

    const noteBgEyedropper = document.getElementById('note-bg-eyedropper');
    if (noteBgEyedropper) {
        noteBgEyedropper.addEventListener('click', async () => {
            if (window.EyeDropper) {
                const eyeDropper = new EyeDropper();
                try {
                    const result = await eyeDropper.open();
                    const hexColor = result.sRGBHex;
                    if (selectedItems.length === 1 && selectedItems[0].type === 'text') {
                        selectedItems[0].bgColor = hexColor;
                        if (noteBgColorInput) noteBgColorInput.value = hexColor;
                        saveStateForUndo();
                        requestUpdate();
                    }
                } catch (e) {
                    console.log("EyeDropper closed or cancelled");
                }
            } else {
                _pickingForElement = 'bgColor';
                setCurrentTool('eyedropper');
            }
        });
    }

    if (confirmNewBtn) confirmNewBtn.addEventListener('click', () => { resetBoard(); hideConfirmationModal() });
    if (cancelNewBtn) cancelNewBtn.addEventListener('click', hideConfirmationModal);

    if (confirmCloseBtn) confirmCloseBtn.addEventListener('click', actuallyCloseTab);
    if (cancelCloseBtn) cancelCloseBtn.addEventListener('click', hideCloseBoardModal);
    if (closeBoardModalOverlay) {
        closeBoardModalOverlay.addEventListener('click', (e) => {
            if (e.target === closeBoardModalOverlay) hideCloseBoardModal();
        });
    }

    if (downloadImageBtn) downloadImageBtn.addEventListener('click', downloadSourceImage);
    if (copyForMoodlistBtn) {
        copyForMoodlistBtn.addEventListener('click', () => {
            if (selectedItems.length === 1 && selectedItems[0].type === 'textList') {
                copyListForMoodlist(selectedItems[0]);
                contextMenu.style.display = 'none';
            }
        });
    }

    // Modal confirmation is handled at the end of the file

    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            groupOrderedItems();
        }
    });


    const iconOptions = ['none', 'star', 'eyedropper', 'sparkles', 'cursor', 'info'];
    iconOptions.forEach(icon => {
        const btn = document.createElement('button');
        btn.className = 'icon-picker-btn';
        btn.dataset.icon = icon;
        if (icon === 'none') {
            btn.innerHTML = `<iconify-icon icon="lucide:ban" width="18" height="18"></iconify-icon><span>None</span>`;
        } else {
            const lucideMap = {
                'star': 'lucide:star',
                'eyedropper': 'lucide:pipette',
                'sparkles': 'lucide:sparkles',
                'cursor': 'lucide:mouse-pointer-2',
                'info': 'lucide:info'
            };
            btn.innerHTML = `<iconify-icon icon="${lucideMap[icon]}" width="18" height="18"></iconify-icon>`;
        }
        btn.onclick = () => {
            if (selectedItems.length === 1 && selectedItems[0].type === 'comment') {
                selectedItems[0].icon = icon;
                updateCommentDimensions(selectedItems[0]);
                saveStateForUndo();
            }
            iconPickerPanel.style.display = 'none';
        };
        iconPickerPanel.appendChild(btn);
    });

    commentIconBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isVisible = iconPickerPanel.style.display === 'flex';
        if (isVisible) {
            iconPickerPanel.style.display = 'none';
            return;
        }
        const rect = commentIconBtn.getBoundingClientRect();
        iconPickerPanel.style.display = 'flex';
        iconPickerPanel.style.left = `${rect.left}px`;
        iconPickerPanel.style.top = `${rect.bottom + 5}px`;
    });

    document.addEventListener('click', (e) => {
        if (iconPickerPanel.style.display === 'flex' && !iconPickerPanel.contains(e.target) && e.target !== commentIconBtn && !commentIconBtn.contains(e.target)) {
            iconPickerPanel.style.display = 'none';
        }
    });
}
function resizeCanvas() { if (!activeProjectId || projects.find(e => e.id === activeProjectId)?.type !== 'moodinfinite') return; const t = document.getElementById('content-area'), o = canvas.width, a = canvas.height, i = t.clientWidth, r = t.clientHeight; if (o === i && a === r) return; cameraOffset.x -= (i - o) / (2 * cameraZoom); cameraOffset.y -= (r - a) / (2 * cameraZoom); canvas.width = i; canvas.height = r; requestUpdate(); }
function gameLoop() {
    draw();
    requestAnimationFrame(gameLoop);
}

function draw() {
    if (!activeProjectId || projects.find(e => e.id === activeProjectId)?.type !== 'moodinfinite') return;

    // Culling: Calculate visible viewport in world coordinates
    const padding = 50 / cameraZoom; // Extra margin to prevent flickering
    const vStart = screenToWorld({ x: -padding, y: -padding });
    const vEnd = screenToWorld({ x: canvas.width + padding, y: canvas.height + padding });
    const viewport = {
        minX: (vStart && vEnd) ? Math.min(vStart.x, vEnd.x) : -1e9,
        minY: (vStart && vEnd) ? Math.min(vStart.y, vEnd.y) : -1e9,
        maxX: (vStart && vEnd) ? Math.max(vStart.x, vEnd.x) : 1e9,
        maxY: (vStart && vEnd) ? Math.max(vStart.y, vEnd.y) : 1e9
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.setLineDash([]); // Ensure line dash is reset at the start of each frame
    if (cameraZoom === 0 || isNaN(cameraZoom)) cameraZoom = 1;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cameraZoom, cameraZoom);
    ctx.translate(-canvas.width / 2 + cameraOffset.x, -canvas.height / 2 + cameraOffset.y);
    if (showGrid) drawGrid();

    const drawItem = (e) => {
        if (!e || e.isHidden) return;
        try {
            // Culling Check
            if (e.type !== 'connector') {
                const box = getItemBoundingBox(e);
                if (box.x + box.width < viewport.minX || box.x > viewport.maxX ||
                    box.y + box.height < viewport.minY || box.y > viewport.maxY) {
                    if (e.type === 'video' && e.video && !e.video.paused) {
                        e.video.pause();
                    }
                    return;
                } else if (e.type === 'video' && e.video && e.video.paused && e.isPlaying) {
                    e.video.play().catch(err => {});
                }
            }

            ctx.save();
            ctx.globalAlpha = e.opacity ?? 1;

            if (showDropShadow && selectedItems.includes(e)) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 15 / cameraZoom;
                ctx.shadowOffsetX = 4 / cameraZoom;
                ctx.shadowOffsetY = 4 / cameraZoom;
            }

            if (e.type === 'image') drawImageItem(ctx, e);
            else if (e.type === 'video') drawVideoItem(ctx, e);
            else if (e.type === 'arrow') drawArrow(ctx, e);
            else if (e.type === 'text') drawTextItem(ctx, e);
            else if (e.type === 'box') drawBoxItem(ctx, e);
            else if (e.type === 'circle') drawCircleItem(ctx, e);
            else if (e.type === 'measure') drawMeasureItem(ctx, e);
            else if (e.type === 'stroke') drawStrokeItem(ctx, e);
            else if (e.type === 'grid') drawGridItem(ctx, e);
            else if (e.type === 'group') drawGroupItem(ctx, e);
            else if (e.type === 'comment') drawCommentItem(ctx, e);
            else if (e.type === 'link') drawLinkItem(ctx, e);
            else if (e.type === 'textList') drawTextListItem(ctx, e);
            else if (e.type === 'counter') drawCounterItem(ctx, e);
            else if (e.type === 'reroute') drawRerouteItem(ctx, e);
            else if (e.type === 'connector') drawConnectorItem(e);

            ctx.restore();
        } catch (err) {
            console.error("Error drawing item:", e, err);
            ctx.restore();
        }
    };

    // Rendering order
    items.forEach(e => { if (e.type !== 'comment' && e.type !== 'link' && e.type !== 'connector') drawItem(e); });
    items.forEach(e => { if (e.type === 'connector') drawItem(e); });
    items.forEach(e => { if (e.type === 'link') drawItem(e); });
    items.forEach(e => { if (e.type === 'comment') drawItem(e); });

    selectedItems.forEach(e => { drawSelection(e) });

    if (typeof isDraggingConnector !== 'undefined' && isDraggingConnector && typeof tempConnector !== 'undefined' && tempConnector) {
        drawConnectorItem(tempConnector);
    }

    if (hoveredItem && (!isDragging || (typeof isDraggingConnector !== 'undefined' && isDraggingConnector))) {
        const ports = getItemPorts(hoveredItem);
        ports.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 / cameraZoom, 0, Math.PI * 2);
            ctx.fillStyle = canvasBackgroundColor;
            ctx.fill();
            ctx.lineWidth = 2 / cameraZoom;
            ctx.strokeStyle = accentColor;
            ctx.stroke();
        });
    }

    if (typeof hoveredPort !== 'undefined' && hoveredPort) {
        ctx.beginPath();
        ctx.arc(hoveredPort.x, hoveredPort.y, 8 / cameraZoom, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();
    }

    if (isSelectingBox) drawSelectionBox();

    // Update toolbar position every frame to stay in sync with camera and moving items
    if (selectedItems.length > 0 && selectionToolbar.style.display === 'flex') {
        updateToolbarPosition();
    }

    ctx.restore();
}
function drawSelection(e) { if (e.type === 'reroute') { ctx.save(); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.beginPath(); ctx.arc(e.x, e.y, 12 / cameraZoom, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); return } if (selectedItems.length > 1) { drawSelectionOutline(e); return } if ((e.type === 'arrow' || e.type === 'measure') && !e.isPinned) { const t = 8 / cameraZoom, o = invertColor(canvasBackgroundColor); ctx.save(); ctx.fillStyle = o; ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 4 / cameraZoom; ctx.beginPath(); ctx.arc(e.startX, e.startY, t, 0, Math.PI * 2); ctx.fill(); if (hoveredArrowHandle === 'start') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } ctx.beginPath(); ctx.arc(e.endX, e.endY, t, 0, Math.PI * 2); ctx.fill(); if (hoveredArrowHandle === 'end') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } ctx.restore(); return } if (e.type === 'stroke') { if (!isDrawing) drawSelectionOutline(e); return } ctx.save(); const t = e.x + e.width / 2, o = e.y + e.height / 2; ctx.translate(t, o); ctx.rotate(e.rotation); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.strokeRect(-e.width / 2, -e.height / 2, e.width, e.height); if (activeGizmo && !e.isPinned) { const t = invertColor(canvasBackgroundColor), o = 8 / cameraZoom; ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 4 / cameraZoom; ctx.fillStyle = t; ctx.strokeStyle = t; if (activeGizmo === 'scale') { const t = e.width / 2, a = e.height / 2; ctx.beginPath(); ctx.arc(t, a, o, 0, Math.PI * 2); ctx.fill(); if (hoveredGizmo === 'scale') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } } else if (activeGizmo === 'rotate') { const t = e.width / 2, a = -e.height / 2, i = a - 20 / cameraZoom; ctx.beginPath(); ctx.moveTo(t, a); ctx.lineTo(t, i); ctx.stroke(); ctx.beginPath(); ctx.arc(t, i, o, 0, Math.PI * 2); ctx.fill(); if (hoveredGizmo === 'rotate') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } } } ctx.restore() }
function drawSelectionOutline(e) { ctx.save(); const t = getItemBoundingBox(e); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.setLineDash([6 / cameraZoom, 4 / cameraZoom]); ctx.strokeRect(t.x, t.y, t.width, t.height); ctx.restore() }
function drawSelectionBox() {
    ctx.save();
    ctx.fillStyle = hexToRgba(accentColor, .1);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1 / cameraZoom;
    ctx.setLineDash([]);
    const { x: e, y: t, width: o, height: a } = getNormalizedSelectionBox();
    ctx.fillRect(e, t, o, a);
    ctx.strokeRect(e, t, o, a);
    ctx.restore()
}
function drawGrid() { const e = (0 - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, t = (0 - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2, o = (canvas.width - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, a = (canvas.height - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2, i = Math.floor(e / gridSize) * gridSize, r = Math.floor(t / gridSize) * gridSize; ctx.save(); ctx.globalAlpha = gridOpacity; ctx.beginPath(); ctx.strokeStyle = gridColor; ctx.lineWidth = 1 / cameraZoom; ctx.setLineDash([]); for (let s = i; s < o; s += gridSize) { ctx.moveTo(s, t); ctx.lineTo(s, a) } for (let s = r; s < a; s += gridSize) { ctx.moveTo(e, s); ctx.lineTo(o, s) } ctx.stroke(); ctx.restore() }
function drawArrow(ctx, item) {
    const dx = item.endX - item.startX;
    const dy = item.endY - item.startY;
    const angle = Math.atan2(dy, dx);
    const headLength = 20; 
    const lineWidth = 4;
    const innerDist = headLength * 0.6; 
    
    const tipX = item.endX;
    const tipY = item.endY;
    const rightBaseX = tipX - headLength * Math.cos(angle - Math.PI / 6);
    const rightBaseY = tipY - headLength * Math.sin(angle - Math.PI / 6);
    const innerBaseX = tipX - innerDist * Math.cos(angle);
    const innerBaseY = tipY - innerDist * Math.sin(angle);
    const leftBaseX = tipX - headLength * Math.cos(angle + Math.PI / 6);
    const leftBaseY = tipY - headLength * Math.sin(angle + Math.PI / 6);
    
    ctx.save();
    ctx.strokeStyle = item.color || accentColor;
    ctx.fillStyle = item.color || accentColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(item.startX, item.startY);
    ctx.lineTo(innerBaseX, innerBaseY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(rightBaseX, rightBaseY);
    ctx.lineTo(innerBaseX, innerBaseY);
    ctx.lineTo(leftBaseX, leftBaseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
}
function drawTextItem(ctx, item) {
    if (item.ganttLink) {
        const p = projects.find(p => p.id === item.ganttLink.projectId);
        let task;
        if (p && p.type === 'moodgantt') {
            for (const g of p.data.groups) {
                task = g.tasks.find(t => t.id === item.ganttLink.taskId);
                if (task) break;
            }
        }
        if (task) {
            item.title = task.name;
            item.text = `**Status:** ${task.status || 'None'}\n**Progress:** ${task.progress || 0}%\n**Assignee:** ${task.assignee || 'Unassigned'}\n**Dates:** ${task.startDate || 'TBD'} to ${task.endDate || 'TBD'}`;
            if (task.status === 'done') item.color = '#22c55e';
            else if (task.status === 'blocked') item.color = '#ef4444';
            else if (task.status === 'review') item.color = '#f59e0b';
            else item.color = '#429eff';
        } else {
            item.text = "(Gantt Task deleted)";
            item.color = '#94a3b8';
        }
    }

    ctx.save();
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(item.rotation);
    ctx.scale(item.scaleX || 1, item.scaleY || 1);
    ctx.globalAlpha = item.opacity ?? 1;

    const x = -item.width / 2;
    const y = -item.height / 2;

    // Post-it Card Rendering
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;

    // Card Background
    ctx.fillStyle = item.bgColor || '#ffffff';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, item.width, item.height, 8);
    else ctx.rect(x, y, item.width, item.height);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Accent Header Strip
    ctx.fillStyle = item.color || accentColor;
    ctx.beginPath();
    const radius = 8;
    if (ctx.roundRect) ctx.roundRect(x, y, item.width, 12, [radius, radius, 0, 0]);
    else ctx.rect(x, y, item.width, 12);
    ctx.fill();

    // Content Drawing
    // Smart Color Logic
    const isDark = getLuminance(item.bgColor || '#ffffff') < 0.5;
    const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
    const textSecondary = isDark ? '#cbd5e1' : '#475569';
    const accentColorLocal = item.color || accentColor;

    // Content Drawing
    const pX = 15;
    let currY = y + 35; // Increased top padding

    // Title Section
    if (item.title && item.title.trim() !== "") {
        ctx.fillStyle = textPrimary;
        ctx.font = `bold 24px '${item.fontFamily || 'Nunito'}', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const titleLines = wrapText(ctx, item.title, item.width - pX * 2);
        titleLines.forEach(line => {
            ctx.fillText(line, x + pX, currY);
            currY += 32; // Slightly more line height for title
        });
        currY += 10;
    }

    // Body Section (Markdown Lite)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const baseSize = item.fontSize || 14;
    const lines = item.text.replace(/\r/g, '').split('\n');
    lines.forEach(line => {
        const consumedH = renderMarkdownLine(ctx, line, x + pX, currY, item.width - pX * 2, baseSize, item.fontFamily, textPrimary, textSecondary);
        currY += consumedH;
    });

    const necessaryHeight = (currY - y) + 15;
    if (item.height < necessaryHeight) item.height = necessaryHeight;
    if (item.width < 120) item.width = 120; // Enforce minimum width for readability

    ctx.restore();
}

function renderMarkdownLine(ctx, text, x, y, maxWidth, baseSize, fontFamily, primaryColor, secondaryColor) {
    let cleanText = text.trimStart();
    let lineScale = 1.0;
    let isHeadingBold = false;
    let isBullet = false;
    let color = secondaryColor;

    if (cleanText.startsWith('# ')) {
        lineScale = 1.4;
        isHeadingBold = true;
        cleanText = cleanText.substring(2);
        color = primaryColor;
    } else if (cleanText.startsWith('## ')) {
        lineScale = 1.25;
        isHeadingBold = true;
        cleanText = cleanText.substring(3);
        color = primaryColor;
    } else if (cleanText.startsWith('### ')) {
        lineScale = 1.1;
        isHeadingBold = true;
        cleanText = cleanText.substring(4);
        color = primaryColor;
    } else if (cleanText.startsWith('- ')) {
        isBullet = true;
        cleanText = '•  ' + cleanText.substring(2);
    } else if (cleanText.startsWith('* ')) {
        // Also support * for bullets!
        isBullet = true;
        cleanText = '•  ' + cleanText.substring(2);
    }

    const finalSize = baseSize * lineScale;
    const lineHeight = finalSize * 1.5;

    // Indent bullets
    const bulletIndent = isBullet ? 15 : 0;

    // MEASURE CAREFULLY: Set font before wrapping
    const weightStr = isHeadingBold ? 'bold ' : '';
    const safeFont = fontFamily ? fontFamily.replace(/'/g, "") : 'Nunito';
    ctx.font = `${weightStr}${finalSize}px '${safeFont}', sans-serif`;

    const wrappedLines = wrapText(ctx, cleanText, maxWidth - bulletIndent);

    wrappedLines.forEach((lineText, lineIdx) => {
        drawInlineFormattedText(ctx, lineText, x + bulletIndent, y + (lineIdx * lineHeight), finalSize, safeFont, isHeadingBold, color);
    });

    return wrappedLines.length * lineHeight;
}

function drawInlineFormattedText(ctx, text, x, y, size, fontFamily, forceBold, defaultColor) {
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|[^*`]+|[*`])/g;
    const matches = text.match(regex);
    if (!matches) {
        ctx.fillText(text, x, y);
        return;
    }

    let currentX = x;

    matches.forEach(part => {
        let isItalic = false;
        let isBold = forceBold;
        let isCode = false;
        let color = defaultColor;
        let font = fontFamily || 'Nunito';
        let content = part;
        let currentSize = size;

        if (part.length >= 4 && part.startsWith('**') && part.endsWith('**')) {
            isBold = true;
            content = part.slice(2, -2);
        } else if (part.length >= 2 && part.startsWith('*') && part.endsWith('*')) {
            isItalic = true;
            content = part.slice(1, -1);
        } else if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
            isCode = true;
            currentSize = size * 0.85;
            color = accentColor;
            content = part.slice(1, -1);

            ctx.save();
            ctx.font = `${currentSize}px 'Source Code Pro', monospace`;
            const w = ctx.measureText(content).width;
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            const bgH = currentSize * 1.35;
            const bgY = y - (currentSize * 0.15);
            if (ctx.roundRect) ctx.roundRect(currentX - 2, bgY, w + 4, bgH, 4);
            else ctx.fillRect(currentX - 2, bgY, w + 4, bgH);
            ctx.fill();
            ctx.restore();
        }

        // Build a perfectly compliant CSS font string! No 'normal' keyword.
        let fontStr = '';
        if (isItalic) fontStr += 'italic ';
        if (isBold) fontStr += 'bold ';
        fontStr += `${currentSize}px `;
        fontStr += isCode ? "'Source Code Pro', monospace" : `'${font}', sans-serif`;

        ctx.font = fontStr.trim();
        ctx.fillStyle = color;
        ctx.fillText(content, currentX, y);
        currentX += ctx.measureText(content).width;
    });
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function drawBoxItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); if (!t.style || t.style === 'fill') { e.fillStyle = t.color; e.fillRect(-t.width / 2, -t.height / 2, t.width, t.height) } else { e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.strokeRect(-t.width / 2, -t.height / 2, t.width, t.height) } e.restore() }
function drawCircleItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2, i = t.width / 2, r = t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); e.beginPath(); e.ellipse(0, 0, i, r, 0, 0, Math.PI * 2); if (!t.style || t.style === "fill") { e.fillStyle = t.color; e.fill(); } else { e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.stroke(); } e.restore(); }
function drawCommentItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); e.globalAlpha = t.opacity ?? 1; e.fillStyle = t.color; e.beginPath(); if (e.roundRect) { e.roundRect(-t.width / 2, -t.height / 2, t.width, t.height, 12 / cameraZoom); } else { e.rect(-t.width / 2, -t.height / 2, t.width, t.height); } e.fill(); const lum = getLuminance(t.color); const textColor = lum > 0.5 ? '#111111' : '#ffffff'; e.fillStyle = textColor; const i = t.fontStyle || 'normal', r = t.fontWeight || 'bold', s = t.fontFamily || 'Nunito'; e.font = `${i} ${r} ${t.fontSize}px '${s}', sans-serif`; let iconOffset = 0; if (t.icon && t.icon !== 'none') { const img = getIconImage(t.icon, textColor); const iconSize = t.fontSize * 1.2; iconOffset = iconSize + 10; if (img.complete && img.naturalWidth !== 0) { e.drawImage(img, -t.width / 2 + 15, -iconSize / 2, iconSize, iconSize) } } e.textAlign = t.textAlign || 'left'; e.textBaseline = 'top'; const l = t.text.split('\n'); const h = t.fontSize * 1.4; let m = 0; if (e.textAlign === 'left') { m = -t.width / 2 + 15 + iconOffset } else if (e.textAlign === 'right') { m = t.width / 2 - 15 } else { m = iconOffset / 2 } l.forEach((txt, i) => { const yLineStart = -(l.length * h) / 2 + i * h; const yTextTop = yLineStart + (h - t.fontSize) / 2; e.fillText(txt, m, yTextTop); }); e.restore(); }

function drawImageItem(ctx, item) {
    if (!item.img) return;
    ctx.save();
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(item.rotation);
    ctx.scale(item.scaleX || 1, item.scaleY || 1);
    ctx.globalAlpha = item.opacity ?? 1;
    try {
        ctx.drawImage(item.img, -item.width / 2, -item.height / 2, item.width, item.height);
    } catch (e) {
        // Fallback
    }

    if (item.label) {
        const labelText = item.label;
        ctx.font = `bold ${14 / cameraZoom}px Inter, sans-serif`;
        const textMetrics = ctx.measureText(labelText);
        const padding = 6 / cameraZoom;
        const labelWidth = textMetrics.width + padding * 2;
        const labelHeight = 20 / cameraZoom;
        const labelX = -item.width / 2 + 10 / cameraZoom;
        const labelY = -item.height / 2 + 10 / cameraZoom;

        ctx.fillStyle = accentColor;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 4 / cameraZoom);
        } else {
            ctx.rect(labelX, labelY, labelWidth, labelHeight);
        }
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelX + padding, labelY + labelHeight / 2);
    }
    ctx.restore();
}

function drawVideoItem(ctx, item) {
    if (!item.video) return;
    ctx.save();
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(item.rotation);
    ctx.scale(item.scaleX || 1, item.scaleY || 1);
    ctx.globalAlpha = item.opacity ?? 1;
    try {
        ctx.drawImage(item.video, -item.width / 2, -item.height / 2, item.width, item.height);
        
        // Draw overlay if paused
        if (item.video.paused) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
            
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            const size = Math.min(item.width, item.height) * 0.15;
            ctx.moveTo(-size / 2, -size);
            ctx.lineTo(size, 0);
            ctx.lineTo(-size / 2, size);
            ctx.closePath();
            ctx.fill();
        }
    } catch (e) {
        // Fallback
    }

    if (item.label) {
        const labelText = item.label;
        ctx.font = `bold ${14 / cameraZoom}px Inter, sans-serif`;
        const textMetrics = ctx.measureText(labelText);
        const padding = 6 / cameraZoom;
        const labelWidth = textMetrics.width + padding * 2;
        const labelHeight = 20 / cameraZoom;
        const labelX = -item.width / 2 + 10 / cameraZoom;
        const labelY = -item.height / 2 + 10 / cameraZoom;

        ctx.fillStyle = accentColor;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 4 / cameraZoom);
        } else {
            ctx.rect(labelX, labelY, labelWidth, labelHeight);
        }
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelX + padding, labelY + labelHeight / 2);
    }
    ctx.restore();
}

function drawMeasureItem(ctx, item) {
    const PIXELS_PER_INCH = 96, PIXELS_PER_CM = PIXELS_PER_INCH / 2.54;
    ctx.save();
    ctx.strokeStyle = item.color || accentColor;
    ctx.fillStyle = item.color || accentColor;
    ctx.lineWidth = 1.5 / cameraZoom; // Slightly thinner main line
    ctx.lineCap = 'round';

    const x1 = item.startX;
    const y1 = item.startY;
    const x2 = item.endX;
    const y2 = item.endY;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const lengthPx = Math.hypot(dx, dy);
    const tickLength = 10 / cameraZoom; // Length of the diagonal ticks

    // Draw Main Line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw Start Tick (angled)
    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(angle); // Align with the main line
    ctx.rotate(-Math.PI * 3 / 4); // Rotate -135 degrees for the tick angle
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tickLength, 0);
    ctx.lineWidth = 2 / cameraZoom; // Make ticks slightly bolder
    ctx.stroke();
    ctx.restore();

    // Draw End Tick (angled)
    ctx.save();
    ctx.translate(x2, y2);
    ctx.rotate(angle); // Align with the main line
    ctx.rotate(Math.PI * 3 / 4); // Rotate +135 degrees for the tick angle
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tickLength, 0);
    ctx.lineWidth = 2 / cameraZoom; // Make ticks slightly bolder
    ctx.stroke();
    ctx.restore();


    // --- Text Calculation and Drawing ---
    let dist, unitLabel = item.unit || 'px';
    switch (unitLabel) {
        case 'cm': dist = lengthPx / PIXELS_PER_CM; break;
        case 'in': dist = lengthPx / PIXELS_PER_INCH; break;
        default: dist = lengthPx;
    }
    const text = `${dist.toFixed(1)} ${unitLabel}`;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    ctx.font = `${14 / cameraZoom}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom'; // Place text slightly above the line

    ctx.save();
    ctx.translate(midX, midY);
    let textAngle = angle;
    // Adjust angle so text is always readable (mostly horizontal)
    if (textAngle < -Math.PI / 2 || textAngle > Math.PI / 2) {
        textAngle += Math.PI;
    }
    ctx.rotate(textAngle);
    // Add a small background rectangle for readability
    const textWidth = ctx.measureText(text).width;
    const textHeight = 16 / cameraZoom; // Approximate height
    ctx.fillStyle = canvasBackgroundColor; // Use background color
    ctx.globalAlpha = 0.7; // Semi-transparent
    ctx.fillRect(-textWidth / 2 - 4 / cameraZoom, -textHeight - 4 / cameraZoom, textWidth + 8 / cameraZoom, textHeight + 4 / cameraZoom);
    ctx.globalAlpha = 1.0; // Reset alpha
    ctx.fillStyle = item.color || accentColor; // Text color
    ctx.fillText(text, 0, -5 / cameraZoom); // Offset text slightly above the line
    ctx.restore();
    // --- End Text Drawing ---

    ctx.restore(); // Restore initial context state
}

function drawGridItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); e.strokeStyle = t.color; e.lineWidth = 2 / cameraZoom; const i = t.width / t.cols, r = t.height / t.rows; e.beginPath(); for (let o = 0; o <= t.cols; o++) { const a = -t.width / 2 + o * i; e.moveTo(a, -t.height / 2); e.lineTo(a, t.height / 2) } for (let o = 0; o <= t.rows; o++) { const a = -t.height / 2 + o * r; e.moveTo(-t.width / 2, a); e.lineTo(t.width / 2, a) } e.stroke(); e.restore() }

function drawTextListItem(e, t) {
    e.save();
    const o = t.x + t.width / 2, a = t.y + t.height / 2;
    e.translate(o, a);
    e.rotate(t.rotation);
    e.scale(t.scaleX || 1, t.scaleY || 1);
    e.globalAlpha = t.opacity ?? 1;

    // Draw Box
    e.fillStyle = t.color;
    e.beginPath();
    if (e.roundRect) {
        e.roundRect(-t.width / 2, -t.height / 2, t.width, t.height, 12 / cameraZoom);
    } else {
        e.rect(-t.width / 2, -t.height / 2, t.width, t.height);
    }
    e.fill();

    const lum = getLuminance(t.color);
    const textColor = lum > 0.5 ? '#111111' : '#ffffff';
    e.fillStyle = textColor;
    const i = t.fontStyle || 'normal', r = t.fontWeight || 'bold', s = t.fontFamily || 'Nunito';
    e.textAlign = 'left';
    e.textBaseline = 'top';

    const h = t.fontSize * 1.5;
    const padding = 15;
    const checkboxSize = t.fontSize * 1.1;
    const checkboxMargin = 10;
    const handleSize = t.fontSize * 0.8;
    const indentSize = 25;

    let currentY = -t.height / 2 + padding;

    // Draw Title
    if (t.title) {
        e.font = `bold ${t.fontSize * 1.2}px '${s}', sans-serif`;
        e.fillText(t.title, -t.width / 2 + padding, currentY);
        currentY += h * 1.2;
        // Divider
        e.strokeStyle = textColor;
        e.globalAlpha *= 0.2;
        e.beginPath();
        e.moveTo(-t.width / 2 + padding, currentY - 5);
        e.lineTo(t.width / 2 - padding, currentY - 5);
        e.stroke();
        e.globalAlpha = t.opacity ?? 1;
        currentY += 10;
    }

    e.font = `${i} ${r} ${t.fontSize}px '${s}', sans-serif`;

    (t.items || []).forEach((item, idx) => {
        const indentOffset = (item.indent || 0) * indentSize;
        const itemY = currentY;

        // Draw Drag Handle
        const handleX = -t.width / 2 + padding + indentOffset;
        const handleY = itemY + (h - handleSize) / 2;
        e.save();
        e.globalAlpha *= 0.3;
        e.strokeStyle = textColor;
        e.lineWidth = 2 / cameraZoom;
        for (let j = 0; j < 3; j++) {
            const lineY = handleY + (j + 1) * (handleSize / 4);
            e.beginPath();
            e.moveTo(handleX, lineY);
            e.lineTo(handleX + handleSize, lineY);
            e.stroke();
        }
        e.restore();

        // Draw Checkbox
        e.strokeStyle = textColor;
        e.lineWidth = 2 / cameraZoom;
        const cbX = handleX + handleSize + 8;
        const cbY = itemY + (h - checkboxSize) / 2;

        e.strokeRect(cbX, cbY, checkboxSize, checkboxSize);
        if (item.completed) {
            e.beginPath();
            e.moveTo(cbX + checkboxSize * 0.2, cbY + checkboxSize * 0.5);
            e.lineTo(cbX + checkboxSize * 0.45, cbY + checkboxSize * 0.75);
            e.lineTo(cbX + checkboxSize * 0.8, cbY + checkboxSize * 0.25);
            e.stroke();
        }

        // Draw Text
        e.save();
        if (item.completed) e.globalAlpha *= 0.5;
        e.fillText(item.text, cbX + checkboxSize + checkboxMargin, itemY + (h - t.fontSize) / 2);

        if (item.completed) {
            const metrics = e.measureText(item.text);
            e.beginPath();
            e.moveTo(cbX + checkboxSize + checkboxMargin, itemY + h / 2);
            e.lineTo(cbX + checkboxSize + checkboxMargin + metrics.width, itemY + h / 2);
            e.stroke();
        }
        e.restore();
        currentY += h;
    });
    e.restore();
}
function drawStrokeItem(e, t) { if (t.points.length < 2) return; e.save(); e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.lineCap = 'round'; e.lineJoin = 'round'; e.beginPath(); e.moveTo(t.points[0].x, t.points[0].y); for (let o = 1; o < t.points.length; o++) { e.lineTo(t.points[o].x, t.points[o].y) } e.stroke(); e.restore() }
function getItemPorts(e) {
    if (!['group', 'image', 'video', 'box', 'circle', 'textList', 'comment', 'text', 'reroute'].includes(e.type)) return [];
    if (e.type === 'reroute') {
        return [
            { side: 'left', x: e.x, y: e.y, item: e },
            { side: 'right', x: e.x, y: e.y, item: e },
            { side: 'top', x: e.x, y: e.y, item: e },
            { side: 'bottom', x: e.x, y: e.y, item: e }
        ];
    }
    const t = e.width * (e.scaleX || 1), o = e.height * (e.scaleY || 1);
    const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
    const r = e.rotation || 0, s = Math.cos(r), n = Math.sin(r);
    return [
        { side: 'left', x: cx + (-t / 2) * s, y: cy + (-t / 2) * n, item: e },
        { side: 'right', x: cx + (t / 2) * s, y: cy + (t / 2) * n, item: e },
        { side: 'top', x: cx + (o / 2) * n, y: cy + (-o / 2) * s, item: e },
        { side: 'bottom', x: cx + (-o / 2) * n, y: cy + (o / 2) * s, item: e }
    ];
}

function createSimpleConnector(source, target) {
    saveStateForUndo();
    const portsS = getItemPorts(source);
    const portsT = getItemPorts(target);
    if (!portsS.length || !portsT.length) return;

    let minDist = Infinity;
    let bestS = 'right', bestT = 'left';

    portsS.forEach(ps => {
        portsT.forEach(pt => {
            const d = Math.hypot(ps.x - pt.x, ps.y - pt.y);
            if (d < minDist) {
                minDist = d;
                bestS = ps.side;
                bestT = pt.side;
            }
        });
    });

    const newConn = {
        id: Date.now(),
        type: 'connector',
        sourceId: source.id,
        sourcePort: bestS,
        targetId: target.id,
        targetPort: bestT,
        color: accentColor
    };
    addItemToLayeredItems(newConn);
    updateSelectionToolbar();
    updateLeftBarState();
}

function toggleConnectionMode() {
    if (selectedItems.length !== 1) {
        showToast("Select one item to start connecting.", "error");
        return;
    }
    const item = selectedItems[0];
    if (['connector', 'stroke', 'measure'].includes(item.type)) {
        showToast("Cannot start connection from this item type.", "error");
        return;
    }
    isConnectionMode = true;
    connectionSourceItem = item;
    if (connectBtn) connectBtn.classList.add('active');
    showToast("Connection mode: Tap a target item", "success");
}

function findItemAndGroupRecursively(id, arr, currentGroup = null) {
    for (const item of arr) {
        if (item.id === id) return { item, group: currentGroup };
        if (item.type === 'group' && item.items) {
            const found = findItemAndGroupRecursively(id, item.items, item);
            if (found) return found;
        }
    }
    return null;
}

function getGlobalPortPos(item, side, group = null) {
    const ports = getItemPorts(item);
    const port = ports.find(p => p.side === side);
    if (!port) return null;
    if (!group) return port;

    const groupCenterX = group.x + group.width / 2;
    const groupCenterY = group.y + group.height / 2;
    const relX = port.x - group.width / 2;
    const relY = port.y - group.height / 2;
    const cos = Math.cos(group.rotation || 0);
    const sin = Math.sin(group.rotation || 0);
    
    return {
        x: groupCenterX + relX * cos - relY * sin,
        y: groupCenterY + relX * sin + relY * cos,
        side: port.side,
        item: port.item
    };
}

function drawConnectorItem(e, renderCtx) {
    const sourceMatch = findItemAndGroupRecursively(e.sourceId, items);
    if (!sourceMatch) return;
    const sourcePortPos = getGlobalPortPos(sourceMatch.item, e.sourcePort, sourceMatch.group);
    if (!sourcePortPos) return;

    let endX = e.endX, endY = e.endY;
    let targetPortPos = null;
    let targetSide = null;
    let tgtMatch = null;

    if (e.targetId) {
        tgtMatch = findItemAndGroupRecursively(e.targetId, items);
        if (tgtMatch) {
            targetPortPos = getGlobalPortPos(tgtMatch.item, e.targetPort, tgtMatch.group);
            if (targetPortPos) {
                endX = targetPortPos.x;
                endY = targetPortPos.y;
                targetSide = e.targetPort;
            }
        }
    }

    e.computedStartX = sourcePortPos.x;
    e.computedStartY = sourcePortPos.y;
    e.computedEndX = endX;
    e.computedEndY = endY;

    const margin = 30;

    const getOrthoPoint = (portX, portY, side, item, group) => {
        let dx = 0, dy = 0;
        if (side === 'left') dx = -1;
        if (side === 'right') dx = 1;
        if (side === 'top') dy = -1;
        if (side === 'bottom') dy = 1;
        if (item && item.type !== 'reroute') {
            const totalRot = (item.rotation || 0) + (group ? (group.rotation || 0) : 0);
            const s = Math.cos(totalRot);
            const n = Math.sin(totalRot);
            const rotDx = dx * s - dy * n;
            const rotDy = dx * n + dy * s;
            return { x: portX + rotDx * margin, y: portY + rotDy * margin };
        }
        return { x: portX + dx * margin, y: portY + dy * margin };
    };

    const p0 = { x: sourcePortPos.x, y: sourcePortPos.y };
    const p1 = getOrthoPoint(p0.x, p0.y, e.sourcePort, sourceMatch.item, sourceMatch.group);
    const p3 = { x: endX, y: endY };
    const p2 = targetPortPos && tgtMatch ? getOrthoPoint(p3.x, p3.y, targetSide, tgtMatch.item, tgtMatch.group) : p3;

    const route = [p0, p1];
    
    const isHorizontalBreak = Math.abs(p1.x - p2.x) > Math.abs(p1.y - p2.y);
    
    if (isHorizontalBreak) {
        const midX = (p1.x + p2.x) / 2;
        route.push({ x: midX, y: p1.y });
        route.push({ x: midX, y: p2.y });
    } else {
        const midY = (p1.y + p2.y) / 2;
        route.push({ x: p1.x, y: midY });
        route.push({ x: p2.x, y: midY });
    }
    
    if (targetPortPos) {
        route.push(p2);
    }
    route.push(p3);

    const cleanRoute = [route[0]];
    for (let i = 1; i < route.length; i++) {
        const prev = cleanRoute[cleanRoute.length - 1];
        const curr = route[i];
        if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.1) {
            cleanRoute.push(curr);
        }
    }
    e.route = cleanRoute;

    const _ctx = renderCtx || ctx;
    _ctx.save();
    _ctx.beginPath();
    _ctx.moveTo(cleanRoute[0].x, cleanRoute[0].y);

    const cornerRadius = 16 / cameraZoom;
    for (let i = 1; i < cleanRoute.length - 1; i++) {
        const pA = cleanRoute[i - 1];
        const pB = cleanRoute[i];
        const pC = cleanRoute[i + 1];

        const d1 = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        const d2 = Math.hypot(pC.x - pB.x, pC.y - pB.y);
        const currentR = Math.min(cornerRadius, d1 / 2, d2 / 2);

        _ctx.arcTo(pB.x, pB.y, pC.x, pC.y, currentR);
    }
    _ctx.lineTo(cleanRoute[cleanRoute.length - 1].x, cleanRoute[cleanRoute.length - 1].y);

    _ctx.lineWidth = 4 / cameraZoom;
    _ctx.strokeStyle = e.color || accentColor;

    if (selectedItems.includes(e) || (typeof hoveredConnector !== 'undefined' && hoveredConnector === e)) {
        _ctx.save();
        _ctx.strokeStyle = invertColor(canvasBackgroundColor);
        _ctx.lineWidth = 8 / cameraZoom;
        _ctx.stroke();
        _ctx.restore();
    }

    _ctx.stroke();
    _ctx.restore();
}

function drawRerouteItem(e, t) {
    e.save();
    e.translate(t.x, t.y);
    e.beginPath();
    e.arc(0, 0, 8 / cameraZoom, 0, Math.PI * 2);
    e.fillStyle = t.color || accentColor;
    e.fill();
    e.restore();
}

function drawCounterItem(e, t) {
    e.save();
    e.globalAlpha *= (t.opacity ?? 1);
    const o = t.x + t.width / 2, a = t.y + t.height / 2;
    e.translate(o, a);
    e.rotate(t.rotation || 0);
    e.scale(t.scaleX || 1, t.scaleY || 1);

    const halfW = t.width / 2;
    const halfH = t.height / 2;

    e.fillStyle = hexToRgba(invertColor(canvasBackgroundColor), 0.1);
    e.strokeStyle = t.color || accentColor;
    e.lineWidth = 2 / cameraZoom;
    e.beginPath();
    if (e.roundRect) {
        e.roundRect(-halfW, -halfH, t.width, t.height, 8 / cameraZoom);
    } else {
        e.rect(-halfW, -halfH, t.width, t.height);
    }
    e.fill();
    e.stroke();

    e.fillStyle = t.color || accentColor;
    e.font = `bold ${t.fontSize || 24}px sans-serif`;
    e.textAlign = 'center';
    e.textBaseline = 'middle';
    e.fillText((t.value || 0).toString(), 0, 0);

    e.fillText('-', -halfW + 25, 0);
    e.fillText('+', halfW - 25, 0);

    e.restore();
}

function drawGroupItem(e, t) {
    e.save();
    e.globalAlpha *= (t.opacity ?? 1);
    const o = t.x + t.width / 2, a = t.y + t.height / 2;
    e.translate(o, a);
    e.rotate(t.rotation || 0);
    e.scale(t.scaleX || 1, t.scaleY || 1);
    t.items.forEach(o => {
        const a = { ...o, x: o.x - t.width / 2, y: o.y - t.height / 2 };
        if (a.type === "arrow" || a.type === 'measure') {
            a.startX = o.startX - t.width / 2;
            a.startY = o.startY - t.height / 2;
            a.endX = o.endX - t.width / 2;
            a.endY = o.endY - t.height / 2;
        }
        if (a.type === "stroke") {
            a.points = o.points.map(e => ({ x: e.x - t.width / 2, y: e.y - t.height / 2 }));
        }
        if (o.type === "image") { drawImageItem(e, a); }
        else if (o.type === "arrow") drawArrow(e, a);
        else if (o.type === "text") drawTextItem(e, a);
        else if (o.type === "box") drawBoxItem(e, a);
        else if (o.type === 'circle') drawCircleItem(e, a);
        else if (o.type === 'measure') drawMeasureItem(e, a);
        else if (o.type === "stroke") drawStrokeItem(e, a);
        else if (o.type === "grid") drawGridItem(e, a);
        else if (o.type === "reroute") drawRerouteItem(e, a);
        else if (o.type === "comment") drawCommentItem(e, a);
        else if (o.type === "link") drawLinkItem(e, a);
        else if (o.type === "textList") drawTextListItem(e, a);
        else if (o.type === "counter") drawCounterItem(e, a);
        else if (o.type === "group") drawGroupItem(e, a);
    });
    e.restore();
}

function handleKeyDown(e) {
    const activeEl = document.activeElement;
    if (currentlyEditingText || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable))) { return; }

    if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        if (!isTabSwitcherOpen) {
            showTabSwitcher();
        } else {
            cycleTabSwitcher();
        }
        return;
    }

    if (isTabSwitcherOpen) {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeTabSwitch();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeTabSwitcher();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            cycleTabSwitcher();
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            cycleTabSwitcherReverse();
            return;
        }
    }

    if (e.key === 'Control' || e.key === 'Meta') {
        updateCursor(e);
    }

    const key = e.key.toLowerCase();

    // Color Seeker global keys intercept
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject && activeProject.type === 'colorseeker') {
        if (e.code === 'Space') {
            e.preventDefault();
            activeProject.data.baseColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
            activeProject.data.colors = generatePalette(activeProject.data.baseColor, activeProject.data.mode, activeProject.data.lockedColors);
            saveToBrowser();
            renderColorSeeker(activeProjectId);
            return;
        }
        if (e.shiftKey && key === 's') {
            e.preventDefault();
            downloadColorSeekerPalette();
            return;
        }
        if (key === 'l' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            const focusedIdx = window._colorseekerFocusedIndex;
            if (focusedIdx !== null && focusedIdx !== undefined) {
                const bars = colorseekerPalette ? colorseekerPalette.querySelectorAll('.colorseeker-bar') : [];
                const bar = bars[focusedIdx];
                if (bar && bar._toggleLock) bar._toggleLock();
            }
            return;
        }
    }
    // Moodgantt global keys intercept
    if (activeProject && activeProject.type === 'moodgantt') {
        if (key === 'home') {
            e.preventDefault();
            ganttJumpToToday(activeProject);
            return;
        }
        if (key === '+' || key === '=') {
            e.preventDefault();
            document.getElementById('gantt-zoom-in-btn')?.click();
            return;
        }
        if (key === '-' || key === '_') {
            e.preventDefault();
            document.getElementById('gantt-zoom-out-btn')?.click();
            return;
        }
        if (e.shiftKey && key === 'g') {
            e.preventDefault();
            ganttAddGroup(activeProject);
            return;
        }
        if (e.shiftKey && key === 't') {
            e.preventDefault();
            if (activeProject.data.groups.length > 0) {
                ganttAddTask(activeProject, activeProject.data.groups[activeProject.data.groups.length - 1].id);
            } else {
                showToast('Create a group first.');
            }
            return;
        }
        if (key === 'arrowleft') {
            e.preventDefault();
            ganttShiftView(activeProject, -1);
            return;
        }
        if (key === 'arrowright') {
            e.preventDefault();
            ganttShiftView(activeProject, 1);
            return;
        }
    }

    if (key === 'escape') { e.preventDefault(); if (helpModalOverlay.style.display === 'flex') { helpModalOverlay.style.display = 'none'; return; } if (currentTool) { setCurrentTool(null); } else if (selectedItems.length > 0) { selectedItems = []; updateSelectionToolbar(); updateLeftBarState(); } return; }
    if (e.shiftKey && key === 'n') { e.preventDefault(); confirmNewBoard(); return; }
    if (e.shiftKey && key === 'c') { e.preventDefault(); copyToClipboard(); return; }
    if (e.altKey && key === 'g') { e.preventDefault(); setCurrentTool('grid'); return; }
    if (e.ctrlKey) {
        if (e.shiftKey && key === 'a') { e.preventDefault(); autoAlignSelection(); return; }
        if (e.shiftKey && key === 'z') { e.preventDefault(); redoLastAction(); return; }
        if (e.shiftKey && key === 'g') { e.preventDefault(); ungroupSelectedItems(); return; }
        if (e.altKey && key === 's') { e.preventDefault(); if (typeof CloudSync !== 'undefined') CloudSync.saveCurrentProject(true); return; }
        if (e.altKey && key === 'o') { e.preventDefault(); if (typeof CloudSync !== 'undefined') CloudSync.openFromDrive(); return; }
        if (key === 's') { e.preventDefault(); saveProject(); return; }
        if (key === 'o') { e.preventDefault(); projectInput.click(); return; }
        if (key === 'z') { e.preventDefault(); undoLastAction(); return; }
        if (key === 'a' && !e.shiftKey) { e.preventDefault(); selectedItems = [...items]; updateSelectionToolbar(); updateLeftBarState(); return; }
        if (key === 'i') { e.preventDefault(); const selectedIds = new Set(selectedItems.map(item => item.id)); selectedItems = items.filter(item => !selectedIds.has(item.id)); updateSelectionToolbar(); updateLeftBarState(); showToast(`Selection inverted (${selectedItems.length} items selected).`); return; }
        if (key === 'c') { e.preventDefault(); copyItems(); return; }
        if (key === 'x') { e.preventDefault(); cutItems(); return; }
        if (key === 'v') { return; }
        if (key === 'd') { e.preventDefault(); duplicateItems(); return; }
        if (key === 'g') { e.preventDefault(); groupSelectedItems(); return; }
    }
    if (e.shiftKey && key === 's') { e.preventDefault(); saveAsPng(); return; }
    if (e.shiftKey && key.toLowerCase() === 'a') { e.preventDefault(); setCurrentTool('arrow'); return; }
    if (key === 'a' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setCurrentTool(null); return; }
    if (key === 'g' && !e.altKey) { e.preventDefault(); showGrid = !showGrid; showGridToggle.checked = showGrid; return; }
    if (key === 't') { e.preventDefault(); setCurrentTool('text'); return; }
    if (key === 'n') { e.preventDefault(); setCurrentTool('comment'); return; }
    if (key === 'k' && !e.ctrlKey) { e.preventDefault(); setCurrentTool('link'); return; }
    if (key === 'l') { e.preventDefault(); setCurrentTool('textList'); return; }
    if (key === 'i') { e.preventDefault(); imageInput.click(); return; }
    if (key === 'b') { e.preventDefault(); setCurrentTool('box'); return; }
    if (key === 'c') { e.preventDefault(); setCurrentTool('circle'); return; }
    if (key === 'm') { e.preventDefault(); setCurrentTool('measure'); return; }
    if (key === 'd') { e.preventDefault(); setCurrentTool('draw'); return; }
    if (key === 'e') { e.preventDefault(); setCurrentTool('eyedropper'); return; }
    if (key === 'home') { e.preventDefault(); if (selectedItems.length === 0) { centerView(); } else { bringSelectedToFront(); } return; }
    if (key === '.') { e.preventDefault(); focusOnSelection(); return; }
    if (selectedItems.length === 0) return;
    if (key === 'h') { e.preventDefault(); flipHorizontal(); return; }
    if (key === 'v') { e.preventDefault(); flipVertical(); return; }
    if (key === 'end') { e.preventDefault(); sendSelectedToBack(); return; }
    if (key === 'pageup') { e.preventDefault(); moveSelectedUp(); return; }
    if (key === 'pagedown') { e.preventDefault(); moveSelectedDown(); return; }
    if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelectedItems(); return; }
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0];
    e.preventDefault();
    if (key === 'p') { togglePin(); requestUpdate(); return; }
    if (item.isPinned) return;
    switch (key) { case 'r': setActiveGizmo('rotate'); break; case 's': setActiveGizmo('scale'); break; }
    requestUpdate();
}

function handleKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
        updateCursor(e);
    }
    if (e.key === 'Shift' && isTabSwitcherOpen) {
        executeTabSwitch();
    }
}

function onDoubleClick(e) {
    const t = screenToWorld(getEventLocation(e)), o = getItemAtPosition(t);
    if (o && (o.type === 'text' || o.type === 'comment' || o.type === 'textList') && !o.isPinned) {
        editText(o);
        return;
    }
    if (o && o.type === 'video' && !o.isPinned) {
        if (o.video) {
            if (o.video.paused) {
                o.video.play().catch(e => console.log(e));
                o.isPlaying = true;
            } else {
                o.video.pause();
                o.isPlaying = false;
            }
            updateSelectionToolbar();
            requestUpdate();
        }
        return;
    }
    if (o && o.type === 'counter' && !o.isPinned) {
        if (getCounterButtonHit(o, t) === 0) {
            const newVal = prompt("Enter new counter value:", o.value || 0);
            if (newVal !== null && !isNaN(Number(newVal))) {
                o.value = Number(newVal);
                saveStateForUndo();
                requestUpdate();
            }
        }
        return;
    }

    const hoveredConn = getHoveredConnector(t);
    if (hoveredConn) {
        const rerouteNode = {
            id: Date.now(),
            type: 'reroute',
            x: t.x,
            y: t.y,
            width: 0,
            height: 0,
            color: accentColor,
            isPinned: false
        };
        addItemToLayeredItems(rerouteNode);

        const newConn = {
            id: Date.now() + 1,
            type: 'connector',
            sourceId: rerouteNode.id,
            sourcePort: 'right',
            targetId: hoveredConn.targetId,
            targetPort: hoveredConn.targetPort,
            endX: hoveredConn.computedEndX,
            endY: hoveredConn.computedEndY,
            color: hoveredConn.color
        };
        hoveredConn.targetId = rerouteNode.id;
        hoveredConn.targetPort = 'left';

        if (newConn.targetId) {
            addItemToLayeredItems(newConn);
        }

        selectedItems = [rerouteNode];
        saveStateForUndo();
    } else if (e.isTouch) {
        onContextMenu(e);
    }
}
function getEventLocation(e) {
    if (!e) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0)) - rect.left,
        y: (e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0)) - rect.top
    };
}
function onMouseDown(e) {
    requestUpdate();
    if (contextMenu) contextMenu.style.display = 'none';
    if (tabContextMenu) tabContextMenu.style.display = 'none';
    if (iconPickerPanel) iconPickerPanel.style.display = 'none';
    if (palettePanel) palettePanel.classList.remove('open');

    if (isConnectionMode) {
        const t = getEventLocation(e);
        const mouseWorld = screenToWorld(t);
        const target = getItemAtPosition(mouseWorld);

        if (target && target.id !== connectionSourceItem.id) {
            if (e.preventDefault) e.preventDefault();
            createSimpleConnector(connectionSourceItem, target);
        } else {
            showToast(target ? "Cannot connect an item to itself." : "Connection mode cancelled.");
        }

        isConnectionMode = false;
        connectionSourceItem = null;
        if (connectBtn) connectBtn.classList.remove('active');
        return;
    }

    if (currentlyEditingText) {
        finishEditingText();
        return;
    }
    const t = getEventLocation(e);
    if (!t) return;
    const o = screenToWorld(t);

    if (currentTool === 'eyedropper') {
        const pixelData = ctx.getImageData(t.x, t.y, 1, 1).data;
        const hexColor = rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
        
        if (_pickingForElement && selectedItems.length === 1) {
            const item = selectedItems[0];
            if (_pickingForElement === 'bgColor') {
                item.bgColor = hexColor;
                if (noteBgColorInput) noteBgColorInput.value = hexColor;
            } else {
                item.color = hexColor;
                if (itemColorPicker) itemColorPicker.value = hexColor;
            }
            saveStateForUndo();
            requestUpdate();
        } else {
            accentColor = hexColor;
            updateUIColors();
            saveSettings();
        }
        
        _pickingForElement = null;
        setCurrentTool(null);
        return;
    }

    if (e.button === 0) {
        if ((e.ctrlKey || e.metaKey) && hoveredConnector) {
            if (e.preventDefault) e.preventDefault();
            items = items.filter(i => i.id !== hoveredConnector.id);
            selectedItems = selectedItems.filter(i => i.id !== hoveredConnector.id);
            updateSelectionToolbar();
            updateLeftBarState();
            saveStateForUndo();
            return;
        }

        if (hoveredPort) {
            if ((e.ctrlKey || e.metaKey) && hoveredPort.item.type === 'reroute') {
                // Bypass connector creation to allow dragging the reroute node
            } else {
                if (e.preventDefault) e.preventDefault();
                isDraggingConnector = true;
                tempConnector = {
                    id: Date.now(),
                    type: 'connector',
                    sourceId: hoveredPort.item.id,
                    sourcePort: hoveredPort.side,
                    computedStartX: hoveredPort.x,
                    computedStartY: hoveredPort.y,
                    endX: o.x,
                    endY: o.y,
                    color: accentColor
                };
                selectedItems = [];
                return;
            }
        }

        // Handle Gizmos and Handles first
        if (selectedItems.length === 1) {
            const item = selectedItems[0];
            if (!item.isPinned) {
                if (item.type === 'arrow' || item.type === 'measure') {
                    const handle = getArrowHandleAtPosition(o);
                    if (handle) {
                        isTransformingArrow = true;
                        transformingHandle = handle;
                        return;
                    }
                }
                const gizmo = getGizmoAtPosition(o);
                if (gizmo) {
                    isTransforming = true;
                    originalItemState = JSON.parse(JSON.stringify(item));
                    reattachImages(item, originalItemState);
                    originalItemState.centerX = item.x + item.width / 2;
                    originalItemState.centerY = item.y + item.height / 2;
                    originalItemState.startAngle = Math.atan2(o.y - originalItemState.centerY, o.x - originalItemState.centerX);
                    originalItemState.startDist = Math.hypot(o.x - originalItemState.centerX, o.y - originalItemState.centerY);

                    if (gizmo === 'scale') {
                        const pivotOffset = { x: -originalItemState.width / 2, y: -originalItemState.height / 2 };
                        const cos = Math.cos(originalItemState.rotation);
                        const sin = Math.sin(originalItemState.rotation);
                        const pivotX = pivotOffset.x * cos - pivotOffset.y * sin + originalItemState.centerX;
                        const pivotY = pivotOffset.x * sin + pivotOffset.y * cos + originalItemState.centerY;
                        originalItemState.pivot = { x: pivotX, y: pivotY };
                    }
                    return;
                }
            }
        }

        // Handle Tool Actions
        if (currentTool) {
            if (currentTool === 'link') {
                isDrawing = false;
                showLinkInputModal(o.x, o.y);
                return;
            }

            isDrawing = true;
            let newItem;
            if (currentTool === 'arrow') {
                newItem = { id: Date.now(), type: 'arrow', startX: o.x, startY: o.y, endX: o.x, endY: o.y, rotation: 0, isPinned: false, x: o.x, y: o.y, width: 0, height: 0, opacity: 1, scaleX: 1, scaleY: 1, color: accentColor };
            } else if (currentTool === 'text') {
                newItem = { id: Date.now(), type: 'text', text: 'Write your note here...', title: '', x: o.x, y: o.y, width: 220, height: 180, fontSize: 16, rotation: 0, isPinned: false, opacity: 1, fontFamily: 'Nunito', color: accentColor, scaleX: 1, scaleY: 1 };
                updateNoteDimensions(newItem);
            } else if (currentTool === 'comment') {
                newItem = { id: Date.now(), type: 'comment', text: 'Note...', x: o.x, y: o.y, width: 0, height: 0, fontSize: 16, rotation: 0, isPinned: false, opacity: 1, fontFamily: 'Nunito', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal', color: accentColor, scaleX: 1, scaleY: 1, icon: 'none' };
            } else if (currentTool === 'box') {
                newItem = { id: Date.now(), type: 'box', color: accentColor, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 };
            } else if (currentTool === 'circle') {
                newItem = { id: Date.now(), type: 'circle', color: accentColor, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, isPinned: false, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 };
            } else if (currentTool === 'measure') {
                newItem = { id: Date.now(), type: 'measure', startX: o.x, startY: o.y, endX: o.x, endY: o.y, unit: 'px', color: accentColor, isPinned: false, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, opacity: 1 };
            } else if (currentTool === 'grid') {
                newItem = { id: Date.now(), type: 'grid', color: accentColor, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, isPinned: false, opacity: 1, rows: 3, cols: 3, scaleX: 1, scaleY: 1 };
            } else if (currentTool === 'textList') {
                newItem = { id: Date.now(), type: 'textList', items: [{ text: 'Item 1', completed: false }], text: 'Item 1', x: o.x, y: o.y, width: 0, height: 0, fontSize: 18, rotation: 0, isPinned: false, opacity: 1, fontFamily: 'Nunito', textAlign: 'left', fontWeight: 'bold', fontStyle: 'normal', color: accentColor, scaleX: 1, scaleY: 1 };
                updateTextListDimensions(newItem);
            } else if (currentTool === 'counter') {
                newItem = { id: Date.now(), type: 'counter', value: 0, x: o.x, y: o.y, width: 140, height: 60, fontSize: 24, rotation: 0, isPinned: false, opacity: 1, fontFamily: 'Nunito', color: accentColor, scaleX: 1, scaleY: 1 };
            } else if (currentTool === 'draw') {
                newItem = { id: Date.now(), type: 'stroke', points: [{ x: o.x, y: o.y }], color: accentColor, isPinned: false, x: o.x, y: o.y, width: 0, height: 0, opacity: 1, scaleX: 1, scaleY: 1 };
            }

            if (newItem) {
                addItemToLayeredItems(newItem);
                selectedItems = [newItem];
                bringSelectedToFront();
                if (['textList', 'text', 'comment', 'counter'].includes(newItem.type)) {
                    setCurrentTool(null);
                }
            }
        } else {
            // Selection / Moving logic
            const itemUnderMouse = getItemAtPosition(o);
            if (itemUnderMouse && itemUnderMouse.type === 'counter') {
                const hitBtn = getCounterButtonHit(itemUnderMouse, o);
                if (hitBtn !== 0) {
                    itemUnderMouse.value = (itemUnderMouse.value || 0) + hitBtn;
                    saveStateForUndo();
                    return;
                }
            }
            if (itemUnderMouse && itemUnderMouse.type === 'link') {
                if (isLinkButtonHit(itemUnderMouse, o)) {
                    window.open(itemUnderMouse.url, '_blank');
                    return;
                }
            }
            if (itemUnderMouse && itemUnderMouse.type === 'textList') {
                const handleIndex = getHandleHitIndex(itemUnderMouse, o);
                if (handleIndex !== -1) {
                    isRearrangingList = true;
                    rearrangingListObj = itemUnderMouse;
                    rearrangingItemIndex = handleIndex;
                    canvas.style.cursor = 'row-resize';
                    return;
                }

                const hitIndex = getCheckboxHitIndex(itemUnderMouse, o);
                if (hitIndex !== -1) {
                    itemUnderMouse.items[hitIndex].completed = !itemUnderMouse.items[hitIndex].completed;
                    syncTextListProperty(itemUnderMouse);
                    saveStateForUndo();
                    return;
                }
            }
            if (e.shiftKey) {
                if (itemUnderMouse) {
                    const idx = selectedItems.findIndex(si => si.id === itemUnderMouse.id);
                    if (idx > -1) selectedItems.splice(idx, 1);
                    else selectedItems.push(itemUnderMouse);
                }
            } else {
                if (itemUnderMouse) {
                    if (!selectedItems.includes(itemUnderMouse)) {
                        selectedItems = [itemUnderMouse];
                    }
                    isMovingItems = true;
                    moveStart.x = o.x;
                    moveStart.y = o.y;
                    selectedItems.forEach(si => {
                        si.originalX = si.x;
                        si.originalY = si.y;
                        if (si.type === 'arrow' || si.type === 'measure') {
                            si.originalStartX = si.startX;
                            si.originalStartY = si.startY;
                            si.originalEndX = si.endX;
                            si.originalEndY = si.endY;
                        } else if (si.type === 'stroke') {
                            si.originalPoints = JSON.parse(JSON.stringify(si.points));
                        } else if (si.type === 'group') {
                            si.originalItems = JSON.parse(JSON.stringify(si.items));
                            reattachImages(si, { items: si.originalItems });
                        }
                    });
                } else {
                    selectedItems = [];
                    isSelectingBox = true;
                    selectionBox.startX = o.x;
                    selectionBox.startY = o.y;
                    selectionBox.endX = o.x;
                    selectionBox.endY = o.y;
                }
            }
            updateSelectionToolbar();
            updateLeftBarState();
        }
    } else if (e.button === 1) {
        e.preventDefault();
        isDragging = true;
        const loc = getEventLocation(e);
        dragStart.x = loc.x / cameraZoom - cameraOffset.x;
        dragStart.y = loc.y / cameraZoom - cameraOffset.y;
        canvas.classList.add('grabbing');
    }
    requestUpdate();
}
function onMouseUp(e) {
    if (e.button === 0) {
        if (isRearrangingList) {
            isRearrangingList = false;
            rearrangingListObj = null;
            rearrangingItemIndex = -1;
            canvas.style.cursor = 'default';
            return;
        }
        if (isDraggingConnector) {
            isDraggingConnector = false;
            if (tempConnector) {
                if (tempConnector.targetId && tempConnector.targetPort &&
                    (tempConnector.sourceId !== tempConnector.targetId || tempConnector.sourcePort !== tempConnector.targetPort)) {
                    let newConnector = { ...tempConnector };
                    addItemToLayeredItems(newConnector);
                    saveStateForUndo();
                }
                tempConnector = null;
            }
            return;
        }
        if (isDrawing || isMovingItems || isTransforming || isTransformingArrow) {
            if (isDrawing) {
                const e = selectedItems[0];
                if (e && (e.type === 'box' || e.type === 'circle' || e.type === 'grid') && (Math.abs(e.width) < 10 || Math.abs(e.height) < 10)) {
                    items = items.filter(t => t.id !== e.id);
                    selectedItems = [];
                } else if (e && (e.type === 'text' || e.type === 'comment')) {
                    editText(e);
                }
            }
            saveStateForUndo();
            if (isMovingItems || isTransforming || isTransformingArrow) {
                updateSelectionToolbar(); // Re-open toolbar after movement/transform
            }
        }
        if (isSelectingBox) {
            isSelectingBox = false;
            const e = getNormalizedSelectionBox();
            selectedItems = items.filter(t => rectsIntersect(getItemBoundingBox(t), e));
            updateSelectionToolbar();
            updateLeftBarState();
        }
        isDrawing = false;
        isMovingItems = false;
        isTransforming = false;
        isTransformingArrow = false;
        transformingHandle = null;
        originalItemState = null;
    } else if (e.button === 1) {
        e.preventDefault();
        isDragging = !1; canvas.classList.remove('grabbing')
    }
    requestUpdate();
}
function onMouseMove(e) {
    const worldPos = screenToWorld(getEventLocation(e));
    hoveredItem = getItemAtPosition(worldPos);
    hoveredPort = getHoveredPort(worldPos);
    if (hoveredPort) {
        hoveredItem = hoveredPort.item;
    }
    hoveredConnector = getHoveredConnector(worldPos);

    if (isRearrangingList) {
        const overIndex = getHandleHitIndex(rearrangingListObj, worldPos);
        if (overIndex !== -1 && overIndex !== rearrangingItemIndex) {
            const itemsList = rearrangingListObj.items;
            const movedItem = itemsList.splice(rearrangingItemIndex, 1)[0];
            itemsList.splice(overIndex, 0, movedItem);
            rearrangingItemIndex = overIndex;
            syncTextListProperty(rearrangingListObj);
            saveStateForUndo();
        }
        return;
    }

    if (isMovingItems || isTransforming || isTransformingArrow || isDrawing) {
        if (selectionToolbar.style.display !== 'none') selectionToolbar.style.display = 'none';
        items.forEach(item => { item._isDirty = true; });
    }

    if (isDraggingConnector && typeof tempConnector !== 'undefined' && tempConnector) {
        tempConnector.endX = worldPos.x;
        tempConnector.endY = worldPos.y;
        tempConnector.targetId = null;
        tempConnector.targetPort = null;
        if (hoveredPort) {
            tempConnector.targetId = hoveredPort.item.id;
            tempConnector.targetPort = hoveredPort.side;
        }
        return;
    }

    if (isSelectingBox) {
        selectionBox.endX = worldPos.x;
        selectionBox.endY = worldPos.y;
        return;
    }
    if (isTransformingArrow && selectedItems.length === 1) {
        const item = selectedItems[0];
        if (transformingHandle === 'start') {
            item.startX = worldPos.x;
            item.startY = worldPos.y;
        } else if (transformingHandle === 'end') {
            item.endX = worldPos.x;
            item.endY = worldPos.y;
        }
        // Recalculate bounding box for arrow/measure after moving handle
        if (item.type === 'arrow' || item.type === 'measure') {
            const bbox = getItemBoundingBox(item);
            item.x = bbox.x;
            item.y = bbox.y;
            item.width = bbox.width;
            item.height = bbox.height;
        }
        return;
    }
    if (isTransforming && selectedItems.length === 1) {
        const item = selectedItems[0];
        const centerX = originalItemState.centerX;
        const centerY = originalItemState.centerY;

        if (activeGizmo === 'rotate') {
            const currentAngle = Math.atan2(worldPos.y - centerY, worldPos.x - centerX);
            let newRotation = originalItemState.rotation + (currentAngle - originalItemState.startAngle);
            if (e.shiftKey) { // Snap rotation to 15-degree increments
                newRotation = Math.round(newRotation / (Math.PI / 12)) * (Math.PI / 12);
            }
            item.rotation = newRotation;
        } else if (activeGizmo === 'scale') {
            let scaleRatio = 1;
            if (e.shiftKey) { // Free scaling
                const pivot = originalItemState.pivot;
                const rotation = originalItemState.rotation;

                const diagVec = { x: worldPos.x - pivot.x, y: worldPos.y - pivot.y };

                const cos = Math.cos(-rotation);
                const sin = Math.sin(-rotation);

                const newWidth = diagVec.x * cos - diagVec.y * sin;
                const newHeight = diagVec.x * sin + diagVec.y * cos;

                if (newWidth > 5 && newHeight > 5) { // Prevent item from becoming too small
                    item.width = newWidth;
                    item.height = newHeight;

                    const newCenterX = pivot.x + diagVec.x / 2;
                    const newCenterY = pivot.y + diagVec.y / 2;

                    item.x = newCenterX - newWidth / 2;
                    item.y = newCenterY - newHeight / 2;

                    const scaleX = newWidth / originalItemState.width;
                    const scaleY = newHeight / originalItemState.height;
                    scaleRatio = Math.min(scaleX, scaleY);
                }
            } else { // Maintain aspect ratio scaling
                const pivot = originalItemState.pivot;
                const cosR = Math.cos(originalItemState.rotation);
                const sinR = Math.sin(originalItemState.rotation);
                const handleRotatedX = (originalItemState.centerX + originalItemState.width / 2 * cosR - originalItemState.height / 2 * sinR);
                const handleRotatedY = (originalItemState.centerY + originalItemState.width / 2 * sinR + originalItemState.height / 2 * cosR);
                const origDiagVec = { x: handleRotatedX - pivot.x, y: handleRotatedY - pivot.y };
                const currentMouseVec = { x: worldPos.x - pivot.x, y: worldPos.y - pivot.y };
                const origDiagMagSq = origDiagVec.x * origDiagVec.x + origDiagVec.y * origDiagVec.y;
                const dotProduct = currentMouseVec.x * origDiagVec.x + currentMouseVec.y * origDiagVec.y;
                let ratio = 1;
                if (origDiagMagSq > 1e-4) { // Avoid division by zero
                    ratio = dotProduct / origDiagMagSq;
                }
                scaleRatio = Math.max(0.05, ratio); // Prevent zero or negative scale

                const newWidth = originalItemState.width * scaleRatio;
                const newHeight = originalItemState.height * scaleRatio;
                // Adjust position based on pivot
                const newCenterX = pivot.x + origDiagVec.x * scaleRatio / 2;
                const newCenterY = pivot.y + origDiagVec.y * scaleRatio / 2;

                item.width = newWidth;
                item.height = newHeight;
                item.x = newCenterX - newWidth / 2;
                item.y = newCenterY - newHeight / 2;
            }

            // Scale internal elements if it's a group
            if (item.type === 'group') {
                const origW = originalItemState.width;
                const origH = originalItemState.height;
                const scaleX = item.width / origW;
                const scaleY = item.height / origH;
                if (isFinite(scaleX) && isFinite(scaleY)) { // Ensure scale factors are valid numbers
                    item.items.forEach((subItem, idx) => {
                        const origItem = originalItemState.items[idx];
                        // Scale position relative to group top-left
                        subItem.x = origItem.x * scaleX;
                        subItem.y = origItem.y * scaleY;
                        subItem.width = origItem.width * scaleX;
                        subItem.height = origItem.height * scaleY;
                        // Scale specific properties
                        if (subItem.type === 'text') {
                            subItem.fontSize = origItem.fontSize * Math.min(scaleX, scaleY); // Scale font size
                        } else if (subItem.type === 'arrow' || subItem.type === 'measure') {
                            subItem.startX = origItem.startX * scaleX;
                            subItem.startY = origItem.startY * scaleY;
                            subItem.endX = origItem.endX * scaleX;
                            subItem.endY = origItem.endY * scaleY;
                        } else if (subItem.type === 'stroke') {
                            subItem.points = origItem.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
                        }
                    });
                }
            }
        }
    } else if (isMovingItems && selectedItems.length > 0) {
        const deltaX = worldPos.x - moveStart.x;
        const deltaY = worldPos.y - moveStart.y;
        const doSnap = e.shiftKey ? !snapToGrid : snapToGrid; // Toggle snap with Shift

        let currentDeltaX = deltaX;
        let currentDeltaY = deltaY;

        const movableItems = selectedItems.filter(i => !i.isPinned);
        if (doSnap && movableItems.length > 0) {
            const anchor = movableItems[0];
            const snappedX = Math.round((anchor.originalX + deltaX) / gridSize) * gridSize;
            const snappedY = Math.round((anchor.originalY + deltaY) / gridSize) * gridSize;
            currentDeltaX = snappedX - anchor.originalX;
            currentDeltaY = snappedY - anchor.originalY;
        }

        selectedItems.forEach(item => {
            if (item.isPinned) return;

            item.x = item.originalX + currentDeltaX;
            item.y = item.originalY + currentDeltaY;

            if (item.type === 'arrow' || item.type === 'measure') {
                item.startX = item.originalStartX + currentDeltaX;
                item.startY = item.originalStartY + currentDeltaY;
                item.endX = item.originalEndX + currentDeltaX;
                item.endY = item.originalEndY + currentDeltaY;
            } else if (item.type === 'stroke') {
                item.points = item.originalPoints.map(p => ({ x: p.x + currentDeltaX, y: p.y + currentDeltaY }));
            }
        });
    } else if (isDrawing && selectedItems.length === 1) {
        const item = selectedItems[0];
        if (item.type === 'arrow' || item.type === 'measure') {
            if (e.shiftKey) { // Snap angle
                const dx = worldPos.x - item.startX;
                const dy = worldPos.y - item.startY;
                const angle = Math.atan2(dy, dx);
                const dist = Math.hypot(dx, dy);
                const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4); // Snap to 45 degrees
                item.endX = item.startX + dist * Math.cos(snappedAngle);
                item.endY = item.startY + dist * Math.sin(snappedAngle);
            } else {
                item.endX = worldPos.x;
                item.endY = worldPos.y;
            }
            // Update bounding box as it's drawn
            const bbox = getItemBoundingBox(item);
            item.x = bbox.x;
            item.y = bbox.y;
            item.width = bbox.width;
            item.height = bbox.height;
        } else if (item.type === 'text' || item.type === 'box' || item.type === 'circle' || item.type === 'grid') {
            const startX = item.x;
            const startY = item.y;
            const currentX = worldPos.x;
            const currentY = worldPos.y;

            let finalX = Math.min(startX, currentX);
            let finalY = Math.min(startY, currentY);
            let finalWidth = Math.abs(startX - currentX);
            let finalHeight = Math.abs(startY - currentY);

            if (e.shiftKey) { // Draw square/circle
                const size = Math.max(finalWidth, finalHeight);
                finalWidth = size;
                finalHeight = size;
                if (currentX < startX) { finalX = startX - size; }
                if (currentY < startY) { finalY = startY - size; }
            }

            item.x = finalX;
            item.y = finalY;
            item.width = finalWidth;
            item.height = finalHeight;

        } else if (item.type === 'stroke') {
            item.points.push({ x: worldPos.x, y: worldPos.y });
            // Update bounding box for stroke as it's drawn
            const bbox = getItemBoundingBox(item);
            item.x = bbox.x;
            item.y = bbox.y;
            item.width = bbox.width;
            item.height = bbox.height;
        }
    } else if (isDragging) {
        cameraOffset.x = getEventLocation(e).x / cameraZoom - dragStart.x;
        cameraOffset.y = getEventLocation(e).y / cameraZoom - dragStart.y;
    }

    // Update cursor based on hover state if not dragging/drawing etc.
    if (!isDragging && !isMovingItems && !isTransforming && !isTransformingArrow) {
        const currentGizmo = getGizmoAtPosition(worldPos);
        const currentArrowHandle = getArrowHandleAtPosition(worldPos);
        const itemUnderMouse = getItemAtPosition(worldPos);

        // Reset ALL link hover states first
        items.forEach(i => { if (i.type === 'link') i.isHovered = false; });

        hoveredGizmo = currentGizmo;
        hoveredArrowHandle = currentArrowHandle;
        updateCursor(e);
    }
    requestUpdate();
}

function updateCursor(e) {
    if (hoveredConnector && (e.ctrlKey || e.metaKey)) {
        canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>') 10 10, crosshair`;
    } else if (hoveredPort && (e.ctrlKey || e.metaKey) && hoveredPort.item.type === 'reroute') {
        canvas.style.cursor = 'move';
    } else if (hoveredPort) {
        canvas.style.cursor = 'crosshair';
    } else if (hoveredConnector) {
        canvas.style.cursor = 'pointer';
    } else if (hoveredGizmo || hoveredArrowHandle) {
        canvas.style.cursor = 'pointer';
    } else if (hoveredItem) {
        if (hoveredItem.type === 'link' && isLinkButtonHit(hoveredItem, screenToWorld(getEventLocation(e)))) {
            hoveredItem.isHovered = true;
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'move';
        }
    } else if (currentTool) {
        canvas.style.cursor = 'crosshair';
    } else {
        canvas.style.cursor = 'default';
    }
}
function isLinkButtonHit(item, pos) {
    if (!item || item.type !== 'link') return false;
    const btnSize = 24 / cameraZoom;
    const btnPadding = 8 / cameraZoom;
    const btnX_rel = item.width / 2 - btnSize - btnPadding;
    const btnY_rel = -btnSize / 2;
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const cos = Math.cos(-item.rotation);
    const sin = Math.sin(-item.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return rx >= btnX_rel && rx <= btnX_rel + btnSize && ry >= btnY_rel && ry <= btnY_rel + btnSize;
}
function onContextMenu(e) {
    if (e && e.preventDefault) e.preventDefault();
    let t;
    if (e && e.isFake && selectedItems.length > 0) {
        t = selectedItems[0];
    } else {
        t = getItemAtPosition(screenToWorld(getEventLocation(e)));
    }
    if (t && !selectedItems.includes(t)) {
        selectedItems = [t];
        updateSelectionToolbar();
        updateLeftBarState()
    }
    if (selectedItems.length > 0) {
        opacitySliderContainer.style.display = 'flex';
        opacitySeparator.style.display = 'block';
        const op = selectedItems[0].opacity ?? 1;
        itemOpacitySlider.value = op;
        itemOpacityValue.textContent = `${Math.round(op * 100)}%`;
        deleteItemBtn.style.display = 'flex';
        document.getElementById('delete-separator').style.display = 'block'
    } else {
        opacitySliderContainer.style.display = 'none';
        opacitySeparator.style.display = 'none';
        deleteItemBtn.style.display = 'none';
        document.getElementById('delete-separator').style.display = 'none'
    }
    const isImg = selectedItems.length === 1 && selectedItems[0].type === 'image';
    downloadImageBtn.style.display = isImg ? 'flex' : 'none';
    downloadSeparator.style.display = isImg ? 'block' : 'none';

    const canConnect = selectedItems.length === 1 && !['connector', 'stroke', 'measure'].includes(selectedItems[0].type);
    contextConnectBtn.style.display = canConnect ? 'flex' : 'none';

    const isTextList = selectedItems.length === 1 && selectedItems[0].type === 'textList';
    if (copyForMoodlistBtn) {
        copyForMoodlistBtn.style.display = isTextList ? 'flex' : 'none';
    }

    showAndPositionMenu(contextMenu, e)
}
function confirmNewBoard() { if (items.length > 0) { showConfirmationModal() } else { resetBoard() } }
function resetBoard() { const e = projects.find(e => e.id === activeProjectId); if (!e) return; e.data.items = []; e.data.cameraOffset = { x: window.innerWidth / 2, y: (window.innerHeight - 48) / 2 }; e.data.cameraZoom = 1; e.data.historyStack = []; e.data.historyIndex = -1; e.data.canvasBackgroundColor = '#0d0d0d'; e.data.accentColor = '#429eff'; e.data.gridColor = '#f9f8f6'; switchTab(activeProjectId); saveStateForUndo() }
function showConfirmationModal() { confirmationModalOverlay.style.display = 'flex' }
function hideConfirmationModal() { confirmationModalOverlay.style.display = 'none' }
async function copyToClipboard() {
    if (items.length === 0) { showToast("Board is empty, nothing to copy.", "error"); return }
    let e = Infinity, t = Infinity, o = -Infinity, a = -Infinity;
    items.forEach(i => {
        const r = getItemBoundingBox(i);
        e = Math.min(e, r.x); t = Math.min(t, r.y); o = Math.max(o, r.x + r.width); a = Math.max(a, r.y + r.height)
    });
    const i = 50, r = o - e + i * 2, s = a - t + i * 2, n = document.createElement('canvas');
    n.width = r; n.height = s;
    const l = n.getContext('2d');
    l.fillStyle = canvasBackgroundColor;
    l.fillRect(0, 0, r, s);
    l.translate(-e + i, -t + i);

    const drawItemToCtx = (e, ctx) => {
        ctx.save();
        ctx.globalAlpha = e.opacity ?? 1;
        if (showDropShadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4
        }
        if (e.type === 'image') {
            const t = e.x + e.width / 2, o = e.y + e.height / 2;
            ctx.translate(t, o);
            ctx.rotate(e.rotation);
            ctx.scale(e.scaleX || 1, e.scaleY || 1);
            ctx.drawImage(e.img, -e.width / 2, -e.height / 2, e.width, e.height)
        } else if (e.type === 'arrow') { drawArrow(ctx, e) }
        else if (e.type === 'text') { drawTextItem(ctx, e) }
        else if (e.type === 'box') { drawBoxItem(ctx, e) }
        else if (e.type === 'circle') { drawCircleItem(ctx, e) }
        else if (e.type === 'measure') { drawMeasureItem(ctx, e) }
        else if (e.type === 'stroke') { drawStrokeItem(ctx, e) }
        else if (e.type === 'grid') { drawGridItem(ctx, e) }
        else if (e.type === 'group') { drawGroupItem(ctx, e) }
        else if (e.type === 'comment') { drawCommentItem(ctx, e) }
        else if (e.type === 'link') { drawLinkItem(ctx, e) }
        else if (e.type === 'textList') { drawTextListItem(ctx, e) }
        else if (e.type === 'counter') { drawCounterItem(ctx, e) }
        else if (e.type === 'reroute') { drawRerouteItem(ctx, e) }
        else if (e.type === 'connector') { drawConnectorItem(e, ctx) }
        ctx.restore()
    };

    // Draw in layers to match screen
    items.forEach(e => { if (e.type !== 'comment' && e.type !== 'link' && e.type !== 'connector') drawItemToCtx(e, l); });
    items.forEach(e => { if (e.type === 'connector') drawItemToCtx(e, l); });
    items.forEach(e => { if (e.type === 'link') drawItemToCtx(e, l); });
    items.forEach(e => { if (e.type === 'comment') drawItemToCtx(e, l); });

    try {
        const e = await new Promise(e => n.toBlob(e, 'image/png')), t = new ClipboardItem({ 'image/png': e });
        await navigator.clipboard.write([t]);
        showToast("Board copied to clipboard.")
    } catch (e) {
        console.error('Failed to copy image to clipboard:', e);
        showToast('Failed to copy to clipboard.', 'error')
    }
}
function saveAsPng() {
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (!activeProject) return;

    if (activeProject.type === 'storyflow') {
        saveStoryflowAsPdf(activeProject);
        return;
    }

    if (items.length === 0) { showToast("Board is empty, nothing to export.", "error"); return }
    let e = Infinity, t = Infinity, o = -Infinity, a = -Infinity;
    items.forEach(i => {
        const r = getItemBoundingBox(i);
        e = Math.min(e, r.x); t = Math.min(t, r.y); o = Math.max(o, r.x + r.width); a = Math.max(a, r.y + r.height)
    });
    const i = o - e + 100, r = a - t + 100, s = document.createElement('canvas');
    s.width = i; s.height = r;
    const n = s.getContext('2d');
    n.fillStyle = canvasBackgroundColor;
    n.fillRect(0, 0, i, r);
    n.translate(-e + 50, -t + 50);

    const drawItemToCtx = (e, ctx) => {
        ctx.save();
        ctx.globalAlpha = e.opacity ?? 1;
        if (showDropShadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4
        }
        if (e.type === 'image') {
            const t = e.x + e.width / 2, o = e.y + e.height / 2;
            ctx.translate(t, o);
            ctx.rotate(e.rotation);
            ctx.scale(e.scaleX || 1, e.scaleY || 1);
            ctx.drawImage(e.img, -e.width / 2, -e.height / 2, e.width, e.height)
        } else if (e.type === 'arrow') { drawArrow(ctx, e) }
        else if (e.type === 'text') { drawTextItem(ctx, e) }
        else if (e.type === 'box') { drawBoxItem(ctx, e) }
        else if (e.type === 'circle') { drawCircleItem(ctx, e) }
        else if (e.type === 'measure') { drawMeasureItem(ctx, e) }
        else if (e.type === 'stroke') { drawStrokeItem(ctx, e) }
        else if (e.type === 'grid') { drawGridItem(ctx, e) }
        else if (e.type === 'group') { drawGroupItem(ctx, e) }
        else if (e.type === 'comment') { drawCommentItem(ctx, e) }
        else if (e.type === 'link') { drawLinkItem(ctx, e) }
        else if (e.type === 'textList') { drawTextListItem(ctx, e) }
        else if (e.type === 'counter') { drawCounterItem(ctx, e) }
        else if (e.type === 'reroute') { drawRerouteItem(ctx, e) }
        else if (e.type === 'connector') { drawConnectorItem(e, ctx) }
        ctx.restore()
    };

    // Draw in layers to match screen
    items.forEach(e => { if (e.type !== 'comment' && e.type !== 'link' && e.type !== 'connector') drawItemToCtx(e, n); });
    items.forEach(e => { if (e.type === 'connector') drawItemToCtx(e, n); });
    items.forEach(e => { if (e.type === 'link') drawItemToCtx(e, n); });
    items.forEach(e => { if (e.type === 'comment') drawItemToCtx(e, n); });

    const fileName = activeProject && activeProject.name ? `${activeProject.name}.png` : 'moodboard.png';
    const l = document.createElement('a');
    l.download = fileName;
    l.href = s.toDataURL('image/png');
    l.click();
    showToast("Image exported as PNG.")
}
function saveProject() {
    const t = projects.find(e => e.id === activeProjectId);
    if (!t) { showToast("No active project to save.", "error"); return; }
    const o = `${t.name}.mood`;

    const zip = new window.JSZip();
    const folderName = t.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'moodboard';
    const rootDir = zip.folder(folderName);
    const imgFolder = rootDir.folder("images");
    let eJSON;

    if (t.type === 'moodinfinite') {
        t.data.items = items;
        t.data.cameraOffset = cameraOffset;
        t.data.cameraZoom = cameraZoom;
        t.data.historyStack = historyStack;
        t.data.historyIndex = historyIndex;

        eJSON = {
            items: serializeItems(items),
            cameraOffset: cameraOffset,
            cameraZoom: cameraZoom,
            canvasBackgroundColor: canvasBackgroundColor,
            accentColor: accentColor,
            gridColor: gridColor,
            showGrid: showGrid,
            snapToGrid: snapToGrid,
            showDropShadow: showDropShadow,
            gridSize: gridSize,
            gridOpacity: gridOpacity
        };

        const localCache = {};
        const localVideoCache = {};
        const usedImageIds = new Set();
        const usedVideoIds = new Set();
        const extractUsedIds = (arr) => {
            arr.forEach(item => {
                if (item.type === 'image' && item.imageId) usedImageIds.add(item.imageId);
                if (item.type === 'video' && item.videoId) usedVideoIds.add(item.videoId);
                if (item.type === 'group' && item.items) extractUsedIds(item.items);
            });
        };
        extractUsedIds(items);

        showToast("Generating project export...", "info");

        const promises = Array.from(usedImageIds).map(id => {
            return new Promise((resolve) => {
                const base64Str = globalImageCache[id];
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

        const videoFolder = rootDir.folder("videos");
        const videoPromises = Array.from(usedVideoIds).map(id => {
            return new Promise((resolve) => {
                const videoData = globalVideoCache[id];
                if (!videoData) return resolve();
                if (videoData instanceof Blob) {
                    videoFolder.file(`${id}.bin`, videoData);
                    localVideoCache[id] = `videos/${id}.bin`;
                    resolve();
                } else {
                    localVideoCache[id] = videoData;
                    resolve();
                }
            });
        });

        Promise.all([...promises, ...videoPromises]).then(() => {
            eJSON.globalImageCache = localCache;
            eJSON.globalVideoCache = localVideoCache;
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
function loadFileAsNewTab(fileContent, fileName) {
    try {
        const data = JSON.parse(fileContent);
        const name = fileName.split('.').slice(0, -1).join('.') || 'Loaded Project';
        if (data.prompts && Array.isArray(data.prompts)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'moodprompt', name: name, data: { prompts: data.prompts, canvasBackgroundColor: data.canvasBackgroundColor || '#0d0d0d' } };
            projects.push(newProject);
            renderTabs();
            switchTab(newId);
            showToast("Prompt file loaded successfully.");
            return;
        }
        if (data.frames && Array.isArray(data.frames)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'storyflow', name: name, data: { frames: data.frames, canvasBackgroundColor: data.canvasBackgroundColor || '#0d0d0d' } };
            projects.push(newProject);
            renderTabs();
            switchTab(newId);
            showToast("StoryFlow file loaded successfully.");
            return;
        }
        if (data.items && Array.isArray(data.items)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'moodinfinite', name: name, data: { items: [], cameraOffset: {}, cameraZoom: 1, historyStack: [], historyIndex: -1 } };
            projects.push(newProject);
            activeProjectId = newId;
            renderTabs();
            loadProject(fileContent);
            return;
        }
        if (data.cards && Array.isArray(data.cards)) {
            const newId = Date.now();
            const newProject = { id: newId, type: 'moodlist', name: name, data: { cards: data.cards } };
            projects.push(newProject);
            renderTabs();
            switchTab(newId);
            showToast("Moodlist file loaded successfully.");
            return;
        }
        showToast("Failed to load project. Unknown format.", "error");
    } catch (err) {
        console.error("Failed to load project:", err);
        showToast("Failed to load project. Invalid JSON.", "error");
    }
}
function loadProject(e) {
    try {
        const t = JSON.parse(e); const o = projects.find(e => e.id === activeProjectId); if (!o || o.type !== 'moodinfinite') return; o.data.cameraOffset = t.cameraOffset || { x: window.innerWidth / 2, y: window.innerHeight / 2 }; o.data.cameraZoom = t.cameraZoom || 1; canvasBackgroundColor = t.canvasBackgroundColor || '#0d0d0d'; accentColor = t.accentColor || '#429eff'; gridColor = t.gridColor || '#f9f8f6'; o.data.canvasBackgroundColor = canvasBackgroundColor; o.data.accentColor = accentColor; o.data.gridColor = gridColor; showGrid = t.showGrid ?? true; snapToGrid = t.snapToGrid ?? true; showDropShadow = t.showDropShadow ?? true; gridSize = t.gridSize || 50; gridOpacity = t.gridOpacity || .05; if (t.globalImageCache) { globalImageCache = { ...globalImageCache, ...t.globalImageCache }; }
        const processedItems = t.items || [];
        restoreImages(processedItems);
        o.data.items = [
            ...processedItems.filter(i => i.type !== 'comment'),
            ...processedItems.filter(i => i.type === 'comment')
        ];
        items = o.data.items;
        o.data.historyStack = []; o.data.historyIndex = -1; switchTab(activeProjectId); updateUIColors(); saveStateForUndo(); showToast("Project loaded successfully.");
    } catch (e) { console.error("Failed to load project:", e); showToast("Failed to load project. Invalid file.", "error") }
}

function loadFileFromObject(t) {
    if (t.name.endsWith('.zip') || t.name.endsWith('.mood')) {
        window.JSZip.loadAsync(t).then(zip => {
            const rootKey = Object.keys(zip.files).find(k => k.endsWith('data.json'));
            if (!rootKey) { showToast("Invalid project format", "error"); return; }
            const rootDirName = rootKey.split('data.json')[0];
            zip.file(rootKey).async("string").then(jsonStr => {
                const data = JSON.parse(jsonStr);
                const promises = Object.keys(data.globalImageCache || {}).map(id => {
                    const relativePath = data.globalImageCache[id];
                    if (relativePath.startsWith('images/')) {
                        const file = zip.file(rootDirName + relativePath);
                        if (file) {
                            return file.async("base64").then(b64 => {
                                globalImageCache[id] = "data:image/webp;base64," + b64;
                            });
                        }
                    } else {
                        globalImageCache[id] = relativePath;
                    }
                    return Promise.resolve();
                });
                const videoPromises = Object.keys(data.globalVideoCache || {}).map(id => {
                    const relativePath = data.globalVideoCache[id];
                    if (relativePath && relativePath.startsWith('videos/')) {
                        const file = zip.file(rootDirName + relativePath);
                        if (file) {
                            return file.async("blob").then(videoBlob => {
                                globalVideoCache[id] = videoBlob;
                            });
                        }
                    } else {
                        globalVideoCache[id] = relativePath;
                    }
                    return Promise.resolve();
                });
                Promise.all([...promises, ...videoPromises]).then(() => {
                    data.globalImageCache = globalImageCache;
                    data.globalVideoCache = globalVideoCache;
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

/**
 * Reloads the data for the current active project from a .mood (zip) blob.
 * Used for background sync.
 */
window.reloadCurrentProjectFromBlob = async function(blob) {
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (!activeProject) return;

    try {
        const zip = await window.JSZip.loadAsync(blob);
        const rootKey = Object.keys(zip.files).find(k => k.endsWith('data.json'));
        if (!rootKey) return;

        const jsonStr = await zip.file(rootKey).async("string");
        const data = JSON.parse(jsonStr);

        // Update image cache
        const promises = Object.keys(data.globalImageCache || {}).map(async id => {
            const relativePath = data.globalImageCache[id];
            if (relativePath.startsWith('images/')) {
                const rootDirName = rootKey.split('data.json')[0];
                const file = zip.file(rootDirName + relativePath);
                if (file) {
                    const b64 = await file.async("base64");
                    globalImageCache[id] = "data:image/webp;base64," + b64;
                }
            } else {
                globalImageCache[id] = relativePath;
            }
        });
        const videoPromises = Object.keys(data.globalVideoCache || {}).map(async id => {
            const relativePath = data.globalVideoCache[id];
            if (relativePath && relativePath.startsWith('videos/')) {
                const rootDirName = rootKey.split('data.json')[0];
                const file = zip.file(rootDirName + relativePath);
                if (file) {
                    const videoBlob = await file.async("blob");
                    globalVideoCache[id] = videoBlob;
                }
            } else {
                globalVideoCache[id] = relativePath;
            }
        });
        await Promise.all([...promises, ...videoPromises]);

        // Update project data
        if (activeProject.type === 'moodinfinite') {
            // Special handling for moodinfinite global variables
            const t = data;
            canvasBackgroundColor = t.canvasBackgroundColor || '#0d0d0d';
            accentColor = t.accentColor || '#429eff';
            gridColor = t.gridColor || '#f9f8f6';
            showGrid = t.showGrid ?? true;
            snapToGrid = t.snapToGrid ?? true;
            showDropShadow = t.showDropShadow ?? true;
            gridSize = t.gridSize || 50;
            gridOpacity = t.gridOpacity || .05;

            const processedItems = t.items || [];
            restoreImages(processedItems);
            
            activeProject.data.items = [
                ...processedItems.filter(i => i.type !== 'comment'),
                ...processedItems.filter(i => i.type === 'comment')
            ];
            
            // Sync the global items variable if this is still the active project
            if (activeProjectId === activeProject.id) {
                items = activeProject.data.items;
                updateUIColors();
                requestUpdate();
            }
        } else {
            // General reload for other types
            activeProject.data = { ...activeProject.data, ...data };
            if (activeProjectId === activeProject.id) {
                switchTab(activeProjectId); // Full refresh
            }
        }
        return true;
    } catch (e) {
        console.error("Failed to reload project from blob:", e);
        return false;
    }
};

function handleImageUpload(e) { if (!e.target.files) return; const t = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 }); processFiles(e.target.files, t); imageInput.value = '' }
function handleVideoUpload(e) { if (!e.target.files) return; const t = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 }); processVideoFiles(e.target.files, t); videoInput.value = '' }
function handleProjectUpload(e) { const t = e.target.files[0]; if (!t) return; loadFileFromObject(t); projectInput.value = '' }

function handlePaste(e) {
    const text = e.clipboardData.getData('text');
    if (text) {
        try {
            const data = JSON.parse(text);
            if (data && data.type === 'moodinfinite-items' && Array.isArray(data.items)) {
                e.preventDefault();
                clipboard = data.items;
                internalClipboardTimestamp = Date.now();
                
                // Add any missing images to the local globalImageCache
                clipboard.forEach(item => {
                    const registerImage = (imgItem) => {
                        if (imgItem.type === 'image' && imgItem.imgSrc) {
                            if (!imgItem.imageId) {
                                imgItem.imageId = 'img_' + Math.random().toString(36).substr(2, 9);
                            }
                            globalImageCache[imgItem.imageId] = imgItem.imgSrc;
                        } else if (imgItem.type === 'group' && Array.isArray(imgItem.items)) {
                            imgItem.items.forEach(registerImage);
                        }
                    };
                    registerImage(item);
                });
                
                pasteItems();
                return;
            }
        } catch (err) {
            // Not JSON or not our signature, continue to normal pasting checks
        }
    }

    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject && activeProject.type === 'moodlist') {
        const text = e.clipboardData.getData('text');
        if (text) {
            try {
                const data = JSON.parse(text);
                if (data && data.type === 'moodlist-card') {
                    e.preventDefault();
                    const newCard = {
                        id: Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                        title: data.title || 'Pasted List',
                        color: '',
                        pinned: false,
                        image: null,
                        items: (data.items || []).map(it => ({
                            id: Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                            text: it.text || '',
                            checked: !!it.checked
                        }))
                    };
                    if (!activeProject.data.cards) activeProject.data.cards = [];
                    activeProject.data.cards.unshift(newCard);
                    scheduleAutoSave();
                    
                    if (typeof renderMoodlistView === 'function') {
                        renderMoodlistView(activeProject);
                    }
                    showToast('List pasted as a new Moodlist card!');
                    return;
                }
            } catch (err) {
                // Fallback: parse as plain text checklist if it has lines
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) {
                    e.preventDefault();
                    let title = 'Pasted List';
                    let itemsList = [];
                    let startIdx = 0;
                    
                    if (lines[0].startsWith('# ')) {
                        title = lines[0].substring(2).trim();
                        startIdx = 1;
                    } else if (lines.length > 1 && !lines[0].startsWith('-') && !lines[0].startsWith('*') && !lines[0].match(/^\[[ x]\]/)) {
                        title = lines[0];
                        startIdx = 1;
                    }
                    
                    for (let i = startIdx; i < lines.length; i++) {
                        let line = lines[i];
                        let checked = false;
                        
                        if (line.startsWith('- [ ] ') || line.startsWith('* [ ] ')) {
                            line = line.substring(6);
                        } else if (line.startsWith('- [x] ') || line.startsWith('* [x] ') || line.startsWith('- [X] ') || line.startsWith('* [X] ')) {
                            line = line.substring(6);
                            checked = true;
                        } else if (line.startsWith('- ') || line.startsWith('* ')) {
                            line = line.substring(2);
                        }
                        
                        itemsList.push({
                            id: Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '_' + i,
                            text: line,
                            checked: checked
                        });
                    }
                    
                    if (itemsList.length > 0) {
                        const newCard = {
                            id: Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                            title: title,
                            color: '',
                            pinned: false,
                            image: null,
                            items: itemsList
                        };
                        if (!activeProject.data.cards) activeProject.data.cards = [];
                        activeProject.data.cards.unshift(newCard);
                        scheduleAutoSave();
                        
                        if (typeof renderMoodlistView === 'function') {
                            renderMoodlistView(activeProject);
                        }
                        showToast('Pasted text as a new Moodlist card!');
                        return;
                    }
                }
            }
        }
        return;
    }

    const imageFiles = Array.from(e.clipboardData.items)
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile());
    const videoFiles = Array.from(e.clipboardData.items)
        .filter(item => item.type.startsWith('video/'))
        .map(item => item.getAsFile());
    const isInternalClipboardOld = (Date.now() - internalClipboardTimestamp) > 500;
    if ((imageFiles.length > 0 || videoFiles.length > 0) && isInternalClipboardOld) {
        const center = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 });
        if (imageFiles.length > 0) processFiles(imageFiles, center);
        if (videoFiles.length > 0) processVideoFiles(videoFiles, center);
        return;
    }
    if (clipboard.length > 0) {
        pasteItems();
    }
}

function handleDragOver(e) { e.preventDefault(); canvas.style.outline = `2px dashed ${accentColor}`; canvas.style.outlineOffset = '-10px' }
function handleDragLeave(e) { e.preventDefault(); canvas.style.outline = 'none' }
function handleDrop(e) {
    e.preventDefault();
    handleDragLeave(e);
    if (!e.dataTransfer.files) return;
    const t = e.dataTransfer.files[0];
    if (t && (t.name.endsWith('.json') || t.name.endsWith('.zip') || t.name.endsWith('.mood'))) {
        loadFileFromObject(t);
    } else {
        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        const videoFiles = files.filter(f => f.type.startsWith('video/'));
        const worldPos = screenToWorld(getEventLocation(e));
        if (imageFiles.length > 0) processFiles(imageFiles, worldPos);
        if (videoFiles.length > 0) processVideoFiles(videoFiles, worldPos);
    }
}
function handleImageFile(file, callback) {
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => callback(e.target.result);
        reader.readAsDataURL(file);
    }
}

function processFiles(files, worldPos) {
    Array.from(files).forEach((file, index) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (readEvent) => {
            const img = new Image();
            img.onload = () => {
                const aspectRatio = img.width / img.height;
                const initialWidth = 250;
                const initialHeight = initialWidth / aspectRatio;
                const imageId = Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 9);

                // Store in global cache
                globalImageCache[imageId] = readEvent.target.result;

                addItemToLayeredItems({
                    id: Date.now() + index,
                    type: 'image',
                    imageId: imageId, // Reference to cache
                    img: img, // Runtime object (not for JSON)
                    x: worldPos.x - initialWidth / 2 + index * 20,
                    y: worldPos.y - initialHeight / 2 + index * 20,
                    width: initialWidth,
                    height: initialHeight,
                    originalWidth: initialWidth,
                    originalHeight: initialHeight,
                    rotation: 0,
                    isPinned: false,
                    opacity: 1,
                    scaleX: 1,
                    scaleY: 1
                });
                bringSelectedToFront();
            };
            img.src = readEvent.target.result;
        };
        reader.readAsDataURL(file);
    });
    setTimeout(saveStateForUndo, 500);
}

function processVideoFiles(files, worldPos) {
    Array.from(files).forEach((file, index) => {
        if (!file.type.startsWith('video/')) return;
        
        const videoId = 'video_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substr(2, 9);
        
        // Store raw Blob in globalVideoCache
        globalVideoCache[videoId] = file;
        
        const video = document.createElement('video');
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        
        const objectURL = URL.createObjectURL(file);
        
        video.addEventListener('loadedmetadata', () => {
            const aspectRatio = video.videoWidth / video.videoHeight || 16/9;
            const initialWidth = 320;
            const initialHeight = initialWidth / aspectRatio;
            
            addItemToLayeredItems({
                id: Date.now() + index,
                type: 'video',
                videoId: videoId,
                videoSrc: objectURL, // runtime object URL
                video: video, // runtime HTMLVideoElement
                x: worldPos.x - initialWidth / 2 + index * 20,
                y: worldPos.y - initialHeight / 2 + index * 20,
                width: initialWidth,
                height: initialHeight,
                originalWidth: initialWidth,
                originalHeight: initialHeight,
                rotation: 0,
                isPinned: false,
                opacity: 1,
                scaleX: 1,
                scaleY: 1,
                isPlaying: true,
                isMuted: true
            });
            
            video.play().catch(e => console.log("Autoplay prevented:", e));
            bringSelectedToFront();
        });

        video.src = objectURL;
    });
    setTimeout(saveStateForUndo, 500);
}

function downloadSourceImage() { if (selectedItems.length !== 1 || selectedItems[0].type !== 'image') return; const e = selectedItems[0], t = document.createElement('a'); t.href = e.img.src; try { const e = new URL(t.href), o = e.pathname.split('/'); t.download = o[o.length - 1] || 'source_image' } catch (e) { t.download = 'source_image.png' } document.body.appendChild(t); t.click(); document.body.removeChild(t); showToast("Source image download started.") }

function copyItems(e = !0) {
    if (selectedItems.length === 0) return;
    clipboard = selectedItems.map(e => {
        const t = JSON.parse(JSON.stringify(e));
        
        const attachSrc = (item, source) => {
            if (item.type === 'image') {
                item.imageId = source.imageId;
                item.imgSrc = globalImageCache[source.imageId];
                delete item.img;
            } else if (item.type === 'video') {
                item.videoId = source.videoId;
                item.videoSrc = globalVideoCache[source.videoId] instanceof Blob 
                    ? URL.createObjectURL(globalVideoCache[source.videoId]) 
                    : globalVideoCache[source.videoId];
                delete item.video;
            } else if (item.type === 'group' && Array.isArray(item.items)) {
                item.items.forEach((child, i) => attachSrc(child, source.items[i]));
            }
        };
        attachSrc(t, e);
        
        return t;
    });
    internalClipboardTimestamp = Date.now();

    try {
        const exportData = {
            type: 'moodinfinite-items',
            items: clipboard
        };
        navigator.clipboard.writeText(JSON.stringify(exportData));
    } catch (err) {
        console.warn('[Clipboard] Failed to write to system clipboard:', err);
    }

    if (e) { showToast(`${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''} copied.`) }
}

function copyListForMoodlist(item) {
    if (!item || item.type !== 'textList') return;
    const exportData = {
        type: 'moodlist-card',
        title: item.title || '',
        items: (item.items || []).map(it => ({
            text: it.text || '',
            checked: !!it.completed
        }))
    };
    navigator.clipboard.writeText(JSON.stringify(exportData)).then(() => {
        showToast('List copied! Switch to a Moodlist tab and press Ctrl+V to import.');
    }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        showToast('Failed to copy list.', 'error');
    });
}

function cutItems() {
    if (selectedItems.length === 0) return;
    copyItems(!1);
    const e = clipboard.length;
    deleteSelectedItems();
    showToast(`${e} item${e > 1 ? 's' : ''} cut to clipboard.`)
}

function pasteItems() {
    if (clipboard.length === 0) { showToast("Clipboard is empty.", "error"); return }
    const e = [], t = 20 / cameraZoom;
    const o = a => {
        const i = JSON.parse(JSON.stringify(a));
        i.id = Date.now() + Math.random();
        i.isPinned = !1;
        function r(e) {
            if (e.type === 'image') {
                const img = new Image;
                if (e.imageId && globalImageCache[e.imageId]) {
                    img.src = globalImageCache[e.imageId];
                } else if (e.imgSrc) {
                    img.src = e.imgSrc;
                }
                delete e.imgSrc;
                e.img = img;
            } else if (e.type === 'video') {
                const video = document.createElement('video');
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                if (e.videoId && globalVideoCache[e.videoId]) {
                    const videoData = globalVideoCache[e.videoId];
                    video.src = videoData instanceof Blob ? URL.createObjectURL(videoData) : videoData;
                } else if (e.videoSrc) {
                    video.src = e.videoSrc;
                }
                delete e.videoSrc;
                video.play().catch(err => console.log("Autoplay prevented:", err));
                e.video = video;
            } else if (e.type === 'group') {
                e.items.forEach(r)
            }
        }
        r(i);
        i.x += t;
        i.y += t;
        if (i.type === 'arrow' || i.type === 'measure') { i.startX += t; i.startY += t; i.endX += t; i.endY += t }
        else if (i.type === 'stroke') { i.points.forEach(e => { e.x += t; e.y += t }) }
        return i
    };
    clipboard.forEach(t => { const a = o(t); addItemToLayeredItems(a); e.push(a) });
    selectedItems = e;
    updateSelectionToolbar();
    updateLeftBarState();
    saveStateForUndo();
    showToast(`${e.length} item${e.length > 1 ? 's' : ''} pasted.`)
}

function duplicateItems() {
    if (selectedItems.length === 0) return;
    const e = selectedItems, t = [], o = 20 / cameraZoom;
    e.forEach(e => {
        const a = JSON.parse(JSON.stringify(e));
        // Manually handle image reattachment for duplicate
        function reattach(item, clone) {
            if (item.type === 'image') {
                clone.imageId = item.imageId;
                const img = new Image;
                if (item.imageId && globalImageCache[item.imageId]) {
                    img.src = globalImageCache[item.imageId];
                } else {
                    img.src = item.img.src;
                }
                clone.img = img;
            } else if (item.type === 'video') {
                clone.videoId = item.videoId;
                const video = document.createElement('video');
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                if (item.videoId && globalVideoCache[item.videoId]) {
                    const videoData = globalVideoCache[item.videoId];
                    video.src = videoData instanceof Blob ? URL.createObjectURL(videoData) : videoData;
                } else if (item.videoSrc) {
                    video.src = item.videoSrc;
                } else if (item.video) {
                    video.src = item.video.src;
                }
                video.play().catch(err => console.log("Autoplay prevented:", err));
                clone.video = video;
            } else if (item.type === 'link') {
                delete clone.iconImage;
                delete clone.iconLoading;
            } else if (item.type === 'group') {
                item.items.forEach((subItem, idx) => reattach(subItem, clone.items[idx]));
            }
        }
        reattach(e, a);

        a.id = Date.now() + Math.random();
        a.isPinned = !1;
        a.x += o;
        a.y += o;
        if (a.type === 'arrow' || a.type === 'measure') { a.startX += o; a.startY += o; a.endX += o; a.endY += o }
        else if (a.type === 'stroke') { a.points.forEach(e => { e.x += o; e.y += o }) }
        items.push(a);
        t.push(a)
    });
    selectedItems = t;
    updateSelectionToolbar();
    updateLeftBarState();
    saveStateForUndo();
    showToast(`${t.length} item${t.length > 1 ? 's' : ''} duplicated.`)
}

function deleteSelectedItems() { if (selectedItems.length > 0) { const e = new Set(selectedItems.map(e => e.id)); items = items.filter(t => !e.has(t.id)); items = items.filter(t => !(t.type === 'connector' && (e.has(t.sourceId) || e.has(t.targetId)))); selectedItems = []; updateSelectionToolbar(); updateLeftBarState(); saveStateForUndo() } }
function addItemToLayeredItems(item) {
    if (item.type === 'comment') {
        items.push(item);
    } else {
        const firstCommentIdx = items.findIndex(i => i.type === 'comment');
        if (firstCommentIdx === -1) {
            items.push(item);
        } else {
            items.splice(firstCommentIdx, 0, item);
        }
    }
}

function bringSelectedToFront() {
    if (selectedItems.length === 0) return;
    const ids = new Set(selectedItems.map(e => e.id));
    const selected = items.filter(t => ids.has(t.id));
    const others = items.filter(t => !ids.has(t.id));
    const otherRegular = others.filter(o => o.type !== 'comment');
    const otherComments = others.filter(o => o.type === 'comment');
    const selectedRegular = selected.filter(s => s.type !== 'comment');
    const selectedComments = selected.filter(s => s.type === 'comment');
    items = [...otherRegular, ...selectedRegular, ...otherComments, ...selectedComments];
    saveStateForUndo();
}

function sendSelectedToBack() {
    if (selectedItems.length === 0) return;
    const ids = new Set(selectedItems.map(e => e.id));
    const selected = items.filter(t => ids.has(t.id));
    const others = items.filter(t => !ids.has(t.id));
    const otherRegular = others.filter(o => o.type !== 'comment');
    const otherComments = others.filter(o => o.type === 'comment');
    const selectedRegular = selected.filter(s => s.type !== 'comment');
    const selectedComments = selected.filter(s => s.type === 'comment');
    items = [...selectedRegular, ...otherRegular, ...selectedComments, ...otherComments];
    saveStateForUndo();
}

function moveSelectedUp() {
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0], t = items.findIndex(t => t.id === item.id);
    if (t > -1 && t < items.length - 1) {
        const nextItem = items[t + 1];
        if (item.type !== 'comment' && nextItem.type === 'comment') return;
        [items[t], items[t + 1]] = [items[t + 1], items[t]];
        saveStateForUndo();
    }
}

function moveSelectedDown() {
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0], t = items.findIndex(t => t.id === item.id);
    if (t > 0) {
        const prevItem = items[t - 1];
        if (item.type === 'comment' && prevItem.type !== 'comment') return;
        [items[t], items[t - 1]] = [items[t - 1], items[t]];
        saveStateForUndo();
    }
}


function flipHorizontal() {
    if (selectedItems.length === 0) return;
    selectedItems.forEach(item => {
        if (item.isPinned) return;

        if (item.type === 'group') {
            // For groups, flip the scaleX of the group itself
            item.scaleX = (item.scaleX || 1) * -1;
        } else if (item.type === 'arrow' || item.type === 'stroke' || item.type === 'measure') {
            // Handle line-based items by flipping their points
            const bbox = getItemBoundingBox(item);
            const centerX = bbox.x + bbox.width / 2;
            if (item.type === 'arrow' || item.type === 'measure') {
                item.startX = centerX - (item.startX - centerX);
                item.endX = centerX - (item.endX - centerX);
            } else { // stroke
                item.points.forEach(p => { p.x = centerX - (p.x - centerX); });
            }
        } else {
            // For all other items, flip their individual scaleX
            item.scaleX = (item.scaleX || 1) * -1;
        }
    });
    saveStateForUndo();
}
function flipVertical() {
    if (selectedItems.length === 0) return;
    selectedItems.forEach(item => {
        if (item.isPinned) return;

        if (item.type === 'group') {
            item.scaleY = (item.scaleY || 1) * -1;
        } else if (item.type === 'arrow' || item.type === 'stroke' || item.type === 'measure') {
            const bbox = getItemBoundingBox(item);
            const centerY = bbox.y + bbox.height / 2;
            if (item.type === 'arrow' || item.type === 'measure') {
                item.startY = centerY - (item.startY - centerY);
                item.endY = centerY - (item.endY - centerY);
            } else { // stroke
                item.points.forEach(p => { p.y = centerY - (p.y - centerY); });
            }
        } else {
            item.scaleY = (item.scaleY || 1) * -1;
        }
    });
    saveStateForUndo();
}
function moveItem(item, dx, dy) {
    item.x += dx; item.y += dy;
    if (item.type === 'arrow' || item.type === 'measure') { item.startX += dx; item.startY += dy; item.endX += dx; item.endY += dy; }
    else if (item.type === 'stroke') { item.points.forEach(p => { p.x += dx; p.y += dy; }); }
}
function autoAlignSelection() { if (selectedItems.length < 2) return; let e = 0, t = 0; selectedItems.forEach(o => { e += getItemBoundingBox(o).width; t += getItemBoundingBox(o).height }); const o = e / selectedItems.length, a = t / selectedItems.length, i = Math.ceil(Math.sqrt(selectedItems.length)), r = getCollectiveBoundingBox(selectedItems), s = r.x, n = r.y; selectedItems.forEach((e, t) => { const r = Math.floor(t / i), l = t % i, c = s + l * (o + 20), d = n + r * (a + 20), h = c - e.x, p = d - e.y; moveItem(e, h, p); }); saveStateForUndo(); requestUpdate(); }
function alignHorizontalRow() { if (selectedItems.length < 2) return; const sorted = [...selectedItems].sort((a, b) => getItemBoundingBox(a).x - getItemBoundingBox(b).x); const topY = Math.min(...sorted.map(i => getItemBoundingBox(i).y)); let cursor = getItemBoundingBox(sorted[0]).x; sorted.forEach(item => { const bb = getItemBoundingBox(item); const dx = cursor - bb.x; const dy = topY - bb.y; moveItem(item, dx, dy); cursor += bb.width + 20; }); saveStateForUndo(); requestUpdate(); }
function alignVerticalColumn() { if (selectedItems.length < 2) return; const sorted = [...selectedItems].sort((a, b) => getItemBoundingBox(a).y - getItemBoundingBox(b).y); const leftX = Math.min(...sorted.map(i => getItemBoundingBox(i).x)); let cursor = getItemBoundingBox(sorted[0]).y; sorted.forEach(item => { const bb = getItemBoundingBox(item); const dx = leftX - bb.x; const dy = cursor - bb.y; moveItem(item, dx, dy); cursor += bb.height + 20; }); saveStateForUndo(); requestUpdate(); }
function alignLeft() { if (selectedItems.length < 2) return; const minX = Math.min(...selectedItems.map(i => getItemBoundingBox(i).x)); selectedItems.forEach(item => { const dx = minX - getItemBoundingBox(item).x; moveItem(item, dx, 0); }); saveStateForUndo(); requestUpdate(); }
function alignCenterH() { if (selectedItems.length < 2) return; const centerX = getCollectiveBoundingBox(selectedItems).x + getCollectiveBoundingBox(selectedItems).width / 2; selectedItems.forEach(item => { const bb = getItemBoundingBox(item); const dx = centerX - (bb.x + bb.width / 2); moveItem(item, dx, 0); }); saveStateForUndo(); requestUpdate(); }
function alignRight() { if (selectedItems.length < 2) return; const maxX = Math.max(...selectedItems.map(i => { const b = getItemBoundingBox(i); return b.x + b.width; })); selectedItems.forEach(item => { const bb = getItemBoundingBox(item); const dx = maxX - (bb.x + bb.width); moveItem(item, dx, 0); }); saveStateForUndo(); requestUpdate(); }
function alignTop() { if (selectedItems.length < 2) return; const minY = Math.min(...selectedItems.map(i => getItemBoundingBox(i).y)); selectedItems.forEach(item => { const dy = minY - getItemBoundingBox(item).y; moveItem(item, 0, dy); }); saveStateForUndo(); requestUpdate(); }
function alignMiddleV() { if (selectedItems.length < 2) return; const centerY = getCollectiveBoundingBox(selectedItems).y + getCollectiveBoundingBox(selectedItems).height / 2; selectedItems.forEach(item => { const bb = getItemBoundingBox(item); const dy = centerY - (bb.y + bb.height / 2); moveItem(item, 0, dy); }); saveStateForUndo(); requestUpdate(); }
function alignBottom() { if (selectedItems.length < 2) return; const maxY = Math.max(...selectedItems.map(i => { const b = getItemBoundingBox(i); return b.y + b.height; })); selectedItems.forEach(item => { const bb = getItemBoundingBox(item); const dy = maxY - (bb.y + bb.height); moveItem(item, 0, dy); }); saveStateForUndo(); requestUpdate(); }
function distributeHorizontally() { if (selectedItems.length < 3) return; const sorted = [...selectedItems].sort((a, b) => getItemBoundingBox(a).x - getItemBoundingBox(b).x); const first = getItemBoundingBox(sorted[0]); const last = getItemBoundingBox(sorted[sorted.length - 1]); const totalWidth = sorted.reduce((s, i) => s + getItemBoundingBox(i).width, 0); const gap = (last.x + last.width - first.x - totalWidth) / (sorted.length - 1); let cursor = first.x; sorted.forEach(item => { const bb = getItemBoundingBox(item); moveItem(item, cursor - bb.x, 0); cursor += bb.width + gap; }); saveStateForUndo(); requestUpdate(); }
function distributeVertically() { if (selectedItems.length < 3) return; const sorted = [...selectedItems].sort((a, b) => getItemBoundingBox(a).y - getItemBoundingBox(b).y); const first = getItemBoundingBox(sorted[0]); const last = getItemBoundingBox(sorted[sorted.length - 1]); const totalHeight = sorted.reduce((s, i) => s + getItemBoundingBox(i).height, 0); const gap = (last.y + last.height - first.y - totalHeight) / (sorted.length - 1); let cursor = first.y; sorted.forEach(item => { const bb = getItemBoundingBox(item); moveItem(item, 0, cursor - bb.y); cursor += bb.height + gap; }); saveStateForUndo(); requestUpdate(); }
function updateLeftBarState() { const needsTwo = selectedItems.length < 2; const needsThree = selectedItems.length < 3; alignBtn.disabled = needsTwo; const ids = ['align-grid-btn','align-row-btn','align-col-btn','align-left-btn','align-center-h-btn','align-right-btn','align-top-btn','align-middle-v-btn','align-bottom-btn']; ids.forEach(id => { const b = document.getElementById(id); if (b) b.disabled = needsTwo; }); ['distribute-h-btn','distribute-v-btn'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = needsThree; }); }
function getContrastColor(hex) { if (hex.indexOf('#') === 0) { hex = hex.slice(1) } if (hex.length === 3) { hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] } if (hex.length !== 6) { return '#0d0d0d' } const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16), yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000; return (yiq >= 128) ? '#262626' : '#ffffff' }
function updateUIColors() { const e = document.documentElement.style, t = getContrastColor(canvasBackgroundColor); e.setProperty('--bg-page', canvasBackgroundColor); e.setProperty('--text-color-active-tab', t); e.setProperty('--contrast-color-light', hexToRgba(t, 0.6)); e.setProperty('--bg-ui', 'rgba(35, 38, 51, 0.4)'); e.setProperty('--bg-ui-hover', 'rgba(55, 58, 71, 0.5)'); e.setProperty('--text-color', '#e2e8f0'); e.setProperty('--text-color-light', '#94a3b8'); e.setProperty('--text-color-strong', '#ffffff'); e.setProperty('--border-color', 'rgba(255, 255, 255, 0.1)'); e.setProperty('--switch-bg-checked', accentColor); canvas.style.backgroundColor = canvasBackgroundColor; bgColorPicker.value = canvasBackgroundColor; accentColorPicker.value = accentColor; toolbarAccentColorPicker.value = accentColor; gridColorPicker.value = gridColor; renderTabs() }
function setCurrentTool(e) {
    console.log('setCurrentTool called with:', e);
    if (currentTool === e && e !== null) { return }
    currentTool = e;
    requestUpdate();
    const buttons = document.querySelectorAll('#left-bar .tool-button');
    console.log('Found', buttons.length, 'tool buttons');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const activeCanvas = document.getElementById('moodboard-canvas');
    if (activeCanvas) activeCanvas.classList.remove('eyedropper-active');

    if (currentTool === null) {
        const selectBtn = document.getElementById('select-tool-btn');
        if (selectBtn) selectBtn.classList.add('active');
    } else if (currentTool === 'arrow') {
        const arrowBtn = document.getElementById('add-arrow-btn');
        if (arrowBtn) arrowBtn.classList.add('active');
    } else if (currentTool === 'text') {
        const textBtn = document.getElementById('add-text-btn');
        if (textBtn) textBtn.classList.add('active');
    } else if (currentTool === 'comment') {
        const commentBtn = document.getElementById('add-comment-btn');
        if (commentBtn) commentBtn.classList.add('active');
    } else if (currentTool === 'link') {
        const linkBtn = document.getElementById('add-link-btn');
        if (linkBtn) linkBtn.classList.add('active');
    } else if (currentTool === 'box') {
        const boxBtn = document.getElementById('add-box-btn');
        if (boxBtn) boxBtn.classList.add('active');
    } else if (currentTool === 'circle') {
        const circleBtn = document.getElementById('add-circle-btn');
        if (circleBtn) circleBtn.classList.add('active');
    } else if (currentTool === 'measure') {
        const measureBtn = document.getElementById('add-measure-btn');
        if (measureBtn) measureBtn.classList.add('active');
    } else if (currentTool === 'grid') {
        const gridBtn = document.getElementById('add-grid-btn');
        if (gridBtn) gridBtn.classList.add('active');
    } else if (currentTool === 'textList') {
        const textListBtn = document.getElementById('add-textList-btn');
        if (textListBtn) textListBtn.classList.add('active');
    } else if (currentTool === 'counter') {
        const counterBtn = document.getElementById('add-counter-btn');
        if (counterBtn) counterBtn.classList.add('active');
    } else if (currentTool === 'draw') {
        const drawBtn = document.getElementById('draw-btn');
        if (drawBtn) drawBtn.classList.add('active');
    } else if (currentTool === 'eyedropper') {
        const eyedropBtn = document.getElementById('eyedropper-btn');
        if (eyedropBtn) {
            eyedropBtn.classList.add('active');
            if (activeCanvas) activeCanvas.classList.add('eyedropper-active');
        }
    }

    // Highlight group parent if a tool inside it is active
    document.querySelectorAll('.tool-group').forEach(group => {
        const flyout = group.querySelector('.tool-group-flyout');
        if (flyout && flyout.querySelector('.tool-button.active')) {
            const groupBtn = group.querySelector('.tool-button:not(.tool-group-flyout .tool-button)');
            if (groupBtn) groupBtn.classList.add('active');
        }
    });

    console.log('Tool updated to:', currentTool);
}
function setActiveGizmo(e) { activeGizmo = activeGizmo === e ? null : e; updateSelectionToolbar() }
function toggleBoxStyle() {
    let changed = false;
    selectedItems.forEach(item => {
        if (item.type === 'box' || item.type === 'circle') {
            item.style = item.style === 'fill' ? 'outline' : 'fill';
            changed = true;
        }
    });
    if (changed) saveStateForUndo();
}
function resetItemTransform() {
    if (selectedItems.length === 0) return;
    selectedItems.forEach(item => {
        if (item.isPinned) return;
        item.rotation = 0;
        item.scaleX = 1;
        item.scaleY = 1;
        if (item.type === 'image') {
            item.width = item.originalWidth || item.width;
            item.height = item.originalHeight || item.height;
        }
        if (item.type === 'comment') {
            updateCommentDimensions(item);
        }
        if (item.type === 'textList') {
            updateTextListDimensions(item);
        }
    });
    updateSelectionToolbar();
    saveStateForUndo();
}

function togglePin() { if (selectedItems.length > 0) { const e = !selectedItems[0].isPinned; selectedItems.forEach(t => t.isPinned = e); updateSelectionToolbar(); saveStateForUndo() } }
function setTextAlign(e) { if (selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'comment' || selectedItems[0].type === 'textList')) { selectedItems[0].textAlign = e; updateSelectionToolbar(); saveStateForUndo() } }
function updateGridDimension(e, t) { if (selectedItems.length === 1 && selectedItems[0].type === 'grid') { const o = selectedItems[0], a = parseInt(t, 10); if (a > 0) { o[e] = a; saveStateForUndo() } } }
function updateMeasureUnit(e) { if (selectedItems.length === 1 && selectedItems[0].type === 'measure') { selectedItems[0].unit = e.target.value; saveStateForUndo() } }
function setTextFontFamily(e) { if (selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'comment' || selectedItems[0].type === 'textList')) { selectedItems[0].fontFamily = e.target.value; if (selectedItems[0].type === 'comment') updateCommentDimensions(selectedItems[0]); else if (selectedItems[0].type === 'textList') updateTextListDimensions(selectedItems[0]); saveStateForUndo() } }
function toggleTextStyleBold() { if (selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'comment' || selectedItems[0].type === 'textList')) { const e = selectedItems[0]; e.fontWeight = e.fontWeight === 'bold' ? 'normal' : 'bold'; if (e.type === 'comment') updateCommentDimensions(e); else if (e.type === 'textList') updateTextListDimensions(e); updateSelectionToolbar(); saveStateForUndo() } }
function toggleTextStyleItalic() { if (selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'comment' || selectedItems[0].type === 'textList')) { const e = selectedItems[0]; e.fontStyle = e.fontStyle === 'italic' ? 'normal' : 'italic'; if (e.type === 'comment') updateCommentDimensions(e); else if (e.type === 'textList') updateTextListDimensions(e); updateSelectionToolbar(); saveStateForUndo() } }
function updateCommentDimensions(e) { if (e.type !== 'comment') return; const t = e.fontStyle || 'normal', o = e.fontWeight || 'bold', a = e.fontFamily || 'Nunito'; ctx.save(); ctx.font = `${t} ${o} ${e.fontSize}px '${a}', sans-serif`; const i = e.text.split('\n'); let r = 0; i.forEach(e => { const t = ctx.measureText(e); if (t.width > r) r = t.width }); let extraW = 30; if (e.icon && e.icon !== 'none') extraW += e.fontSize * 1.2 + 10; e.width = r + extraW; const numLines = i.length || 1; e.height = numLines * (e.fontSize * 1.4) + 16; ctx.restore(); }
function updateTextListDimensions(e) {
    if (e.type !== 'textList') return;
    const t = e.fontStyle || 'normal', o = e.fontWeight || 'bold', a = e.fontFamily || 'Nunito';
    ctx.save();
    
    let maxW = 0;
    const h = e.fontSize * 1.5;
    const indentSize = 25;
    const handleSize = e.fontSize * 0.8;
    const checkboxArea = e.fontSize * 1.1 + 8;
    const padding = 30;

    if (e.title) {
        ctx.font = `bold ${e.fontSize * 1.2}px '${a}', sans-serif`;
        maxW = ctx.measureText(e.title).width;
    }

    ctx.font = `${t} ${o} ${e.fontSize}px '${a}', sans-serif`;
    (e.items || []).forEach(item => {
        const m = ctx.measureText(item.text);
        const indentOffset = (item.indent || 0) * indentSize;
        const totalW = m.width + indentOffset + handleSize + 8 + checkboxArea + 15;
        if (totalW > maxW) maxW = totalW;
    });
    
    e.width = maxW + padding;
    let totalH = (e.items || []).length * h + padding;
    if (e.title) totalH += h * 1.2 + 10;
    e.height = totalH;
    ctx.restore();
}

function syncTextListProperty(item) {
    if (item.type !== 'textList') return;
    let lines = [];
    if (item.title) {
        lines.push(`# ${item.title}`);
    }
    (item.items || []).forEach(it => {
        const indentStr = "-".repeat(it.indent || 0);
        lines.push(`${indentStr}${it.text}`);
    });
    item.text = lines.join('\n');
}
function updateSelectionToolbar() {
    const isBoxOrCircle = selectedItems.some(item => item.type === 'box' || item.type === 'circle');
    const isLink = selectedItems.length === 1 && selectedItems[0].type === 'link';
    const isComment = selectedItems.length === 1 && selectedItems[0].type === 'comment';
    const isTextList = selectedItems.length === 1 && selectedItems[0].type === 'textList';
    const isTextOrComment = selectedItems.length === 1 && (selectedItems[0].type === 'text' || selectedItems[0].type === 'comment');
    const isTextOrCommentOrList = isTextOrComment || isTextList;
    const isGrid = selectedItems.length === 1 && selectedItems[0].type === 'grid';
    const isMeasure = selectedItems.length === 1 && selectedItems[0].type === 'measure';
    const canHaveColor = selectedItems.length === 1 && (['box', 'circle', 'text', 'measure', 'comment', 'link', 'textList'].includes(selectedItems[0].type));
    const isMultiple = selectedItems.length > 1;
    const isGroup = selectedItems.length === 1 && selectedItems[0].type === 'group';

    const hasToolbarItems = selectedItems.some(item => item.type !== 'reroute' && item.type !== 'connector');

    if (selectedItems.length > 0 && hasToolbarItems) {
        selectionToolbar.style.display = 'flex';
        textToolsContainer.style.display = isTextOrCommentOrList ? 'flex' : 'none';
        iconToolsContainer.style.display = isComment ? 'flex' : 'none';
        linkToolsContainer.style.display = isLink ? 'flex' : 'none';
        gridToolsContainer.style.display = isGrid ? 'flex' : 'none';
        measureToolsContainer.style.display = isMeasure ? 'flex' : 'none';
        itemColorToolContainer.style.display = canHaveColor ? 'flex' : 'none';
        
        const isVideo = selectedItems.length === 1 && selectedItems[0].type === 'video';
        if (videoToolsContainer) videoToolsContainer.style.display = isVideo ? 'flex' : 'none';
        if (isVideo && selectedItems[0].video) {
            const item = selectedItems[0];
            const playPauseIcon = videoPlayPauseBtn.querySelector('iconify-icon');
            const muteIcon = videoMuteBtn.querySelector('iconify-icon');
            if (playPauseIcon) playPauseIcon.setAttribute('icon', item.video.paused ? 'lucide:play' : 'lucide:pause');
            if (muteIcon) muteIcon.setAttribute('icon', item.video.muted ? 'lucide:volume-x' : 'lucide:volume-2');
        }

        if (isTextOrCommentOrList) {
            const e = selectedItems[0];
            fontFamilySelect.value = e.fontFamily || 'Nunito';
            [textAlignLeftBtn, textAlignCenterBtn, textAlignRightBtn].forEach(el => {
                el.classList.remove('active');
                el.style.display = (isComment || isTextList || selectedItems[0].type === 'text') ? 'none' : 'flex';
            });
            if (e.textAlign === 'left') textAlignLeftBtn.classList.add('active');
            else if (e.textAlign === 'right') textAlignRightBtn.classList.add('active');
            else textAlignCenterBtn.classList.add('active');
            textStyleBoldBtn.classList.toggle('active', e.fontWeight === 'bold');
            textStyleItalicBtn.classList.toggle('active', e.fontStyle === 'italic');
            textStyleBoldBtn.style.display = (isTextList || selectedItems[0].type === 'text') ? 'none' : 'flex';
            textStyleItalicBtn.style.display = (isTextList || selectedItems[0].type === 'text') ? 'none' : 'flex';
        }
        if (canHaveColor) {
            itemColorPicker.value = selectedItems[0].color || accentColor;
            if (selectedItems[0].type === 'text') {
                if (noteBgColorWrapper) noteBgColorWrapper.style.display = 'flex';
                noteBgColorInput.value = selectedItems[0].bgColor || '#ffffff';
            } else {
                if (noteBgColorWrapper) noteBgColorWrapper.style.display = 'none';
            }
        }

        toggleBoxStyleBtn.style.display = isBoxOrCircle ? 'flex' : 'none';
        scaleBtn.style.display = (selectedItems.length > 0 && !isComment && !isLink && !isTextList) ? 'flex' : 'none';
        rotateBtn.style.display = (selectedItems.length > 0 && !isTextList) ? 'flex' : 'none';
        resetTransformBtn.style.display = (selectedItems.length > 0 && !isTextList) ? 'flex' : 'none';
        flipHorizontalBtn.style.display = (selectedItems.length > 0 && !isComment && !isLink && !isTextList) ? 'flex' : 'none';
        flipVerticalBtn.style.display = (selectedItems.length > 0 && !isComment && !isLink && !isTextList) ? 'flex' : 'none';
        pinBtn.style.display = (selectedItems.length > 0) ? 'flex' : 'none';
        bringFrontBtn.style.display = (selectedItems.length > 0) ? 'flex' : 'none';
        sendBackBtn.style.display = (selectedItems.length > 0) ? 'flex' : 'none';
        groupBtn.style.display = isMultiple ? 'flex' : 'none';
        groupOrderedBtn.style.display = isMultiple ? 'flex' : 'none';
        connectBtn.style.display = (selectedItems.length === 1 && !['connector', 'stroke', 'measure'].includes(selectedItems[0].type)) ? 'flex' : 'none';
        ungroupBtn.style.display = isGroup ? 'flex' : 'none';

        scaleBtn.classList.toggle('active', activeGizmo === 'scale');
        rotateBtn.classList.toggle('active', activeGizmo === 'rotate');
        pinBtn.classList.toggle('pinned', selectedItems.every(e => e.isPinned));

        // Ensure position is updated when toolbar is shown
        updateToolbarPosition();
    } else {
        selectionToolbar.style.display = 'none';
        itemColorToolContainer.style.display = 'none';
        textToolsContainer.style.display = 'none';
        gridToolsContainer.style.display = 'none';
        measureToolsContainer.style.display = 'none';
        iconToolsContainer.style.display = 'none';
        if (videoToolsContainer) videoToolsContainer.style.display = 'none';
        linkToolsContainer.style.display = 'none';
        activeGizmo = null
    }
}

editLinkBtn.onclick = () => {
    if (selectedItems.length === 1 && selectedItems[0].type === 'link') {
        showLinkInputModal(0, 0, selectedItems[0]);
    }
};

openLinkBtn.onclick = () => {
    if (selectedItems.length === 1 && selectedItems[0].type === 'link') {
        window.open(selectedItems[0].url, '_blank');
    }
};

function updateToolbarPosition() {
    if (selectedItems.length > 0) {
        const e = getCollectiveBoundingBox(selectedItems),
            // Use the bottom of the bounding box for "under" alignment
            t = worldToScreen({ x: e.x + e.width / 2, y: e.y + e.height });
        selectionToolbar.style.left = `${t.x}px`;
        selectionToolbar.style.top = `${t.y}px`
    }
}
function editText(e) {
    if (e.type === 'text') {
        currentlyEditingText = e;
        e.isHidden = true;
        noteEditorOverlay.style.display = 'flex';
        noteBodyInput.style.height = 'auto';
        setTimeout(() => {
            noteBodyInput.style.height = noteBodyInput.scrollHeight + 'px';
            noteBodyInput.focus();
            noteBodyInput.setSelectionRange(noteBodyInput.value.length, noteBodyInput.value.length);
        }, 10);
        noteTitleInput.value = e.title || '';
        noteBodyInput.value = e.text === 'Write your note here...' ? '' : e.text;
        noteTitleInput.focus();
        return;
    }
    currentlyEditingText = e;
    e.isHidden = !0;
    const t = worldToScreen({ x: e.x, y: e.y }), o = Math.max(Math.abs(e.width * cameraZoom), 150);
    let paddingWidthAdjust = e.type === 'comment' ? 30 * cameraZoom : 0;
    if (e.type === 'comment' && e.icon && e.icon !== 'none') {
        paddingWidthAdjust += e.fontSize * 1.2 * cameraZoom + 10;
    }
    Object.assign(textEditor.style, { display: 'block', left: `${t.x}px`, top: `${t.y}px`, width: `${o}px`, height: 'auto', transform: `rotate(${e.rotation}rad)`, transformOrigin: 'top left', color: e.type === 'comment' ? (getLuminance(e.color) > 0.5 ? '#111' : '#fff') : e.color, backgroundColor: e.type === 'comment' ? e.color : hexToRgba(e.color, .1), borderRadius: e.type === 'comment' ? `${12 * cameraZoom}px` : '0px', padding: e.type === 'comment' ? '8px 15px' : '0px', paddingLeft: e.type === 'comment' && e.icon && e.icon !== 'none' ? `${e.fontSize * 1.2 * cameraZoom + 20}px` : (e.type === 'comment' ? '15px' : '0px'), fontSize: `${e.fontSize * cameraZoom}px`, fontFamily: e.fontFamily || 'Nunito', textAlign: e.textAlign || 'center', fontWeight: e.fontWeight || 'bold', fontStyle: e.fontStyle || 'normal', lineHeight: e.type === 'comment' ? '1.4' : 'normal' });
    textEditor.value = e.text === "Type..." || e.text === "Note..." ? "" : e.text;
    textEditor.focus();
    autoResizeTextEditor();
    selectedItems = [];
    updateSelectionToolbar();
    updateToolbarPosition();
    updateLeftBarState()
}

function cancelNoteEditing() {
    if (currentlyEditingText) {
        currentlyEditingText.isHidden = false;
        if ((!currentlyEditingText.text || currentlyEditingText.text.trim() === '') && (!currentlyEditingText.title || currentlyEditingText.title.trim() === '')) {
            // Remove if empty new note
            items = items.filter(i => i.id !== currentlyEditingText.id);
        }
        currentlyEditingText = null;
    }
    noteEditorOverlay.style.display = 'none';
}

function finishNoteEditing() {
    if (currentlyEditingText) {
        currentlyEditingText.title = noteTitleInput.value.trim();
        currentlyEditingText.text = noteBodyInput.value.trim() || 'No content';
        currentlyEditingText.isHidden = false;

        updateNoteDimensions(currentlyEditingText);

        saveStateForUndo();
        selectedItems = [currentlyEditingText];
        currentlyEditingText = null;
    }
    noteEditorOverlay.style.display = 'none';
    updateSelectionToolbar();
}

function updateNoteDimensions(item) {
    // Using a clear, unscaled approach for height calculation
    const testCtx = canvas.getContext('2d');
    testCtx.save();
    testCtx.setTransform(1, 0, 0, 1, 0, 0); // RESET TRANSFORM for accurate measurement

    const pX = 15;
    const maxWidth = item.width - pX * 2;
    let totalH = 40;

    if (item.title && item.title.trim() !== "") {
        testCtx.font = `bold 24px Nunito`;
        const titleLines = wrapText(testCtx, item.title, maxWidth);
        totalH += titleLines.length * 32;
        totalH += 10;
    }

    const baseSize = item.fontSize || 14;
    const lines = item.text.replace(/\r/g, '').split('\n');
    lines.forEach(line => {
        let cleanText = line.trimStart();
        let scale = 1.0;
        let isBullet = false;
        let isBold = false;

        if (cleanText.startsWith('# ')) {
            scale = 1.4; isBold = true; cleanText = cleanText.substring(2);
        } else if (cleanText.startsWith('## ')) {
            scale = 1.25; isBold = true; cleanText = cleanText.substring(3);
        } else if (cleanText.startsWith('### ')) {
            scale = 1.1; isBold = true; cleanText = cleanText.substring(4);
        } else if (cleanText.startsWith('- ') || cleanText.startsWith('* ')) {
            isBullet = true; cleanText = '•  ' + cleanText.substring(2);
        }

        const finalSize = baseSize * scale;
        testCtx.font = `${isBold ? 'bold ' : ''}${finalSize}px Nunito`;
        const bulletIndent = isBullet ? 15 : 0;
        const wrapped = wrapText(testCtx, cleanText, maxWidth - bulletIndent);
        totalH += wrapped.length * (finalSize * 1.5);
    });

    testCtx.restore();
    item.height = Math.max(120, totalH + 60); // Generous safety margin
}
function finishEditingText() { if (currentlyEditingText) { if (currentlyEditingText.type === 'text') return; currentlyEditingText.text = textEditor.value.trim() || (currentlyEditingText.type === 'comment' ? "Note..." : "Type..."); const e = currentlyEditingText; if (e.type === 'comment') { updateCommentDimensions(e); } else if (currentlyEditingText.type === 'textList') {
        const lines = textEditor.value.split('\n');
        let items = [];
        let title = "";
        const oldItems = currentlyEditingText.items || [];
        lines.forEach((line, idx) => {
            if (idx === 0 && line.startsWith('# ')) {
                title = line.substring(2).trim();
            } else if (line.trim() !== "") {
                const indentMatch = line.match(/^(-+)/);
                const indentStr = indentMatch ? indentMatch[0] : "";
                const indent = indentStr.length;
                const text = line.substring(indentStr.length).trim();
                const oldItem = oldItems.find(oi => oi.text === text);
                items.push({ text: text, completed: oldItem ? oldItem.completed : false, indent: indent });
            }
        });
        if (items.length === 0 && !title) items.push({ text: "Item 1", completed: false, indent: 0 });
        currentlyEditingText.items = items;
        currentlyEditingText.title = title;
        updateTextListDimensions(currentlyEditingText);
    } else { const t = e.fontStyle || 'normal', o = e.fontWeight || 'bold', a = e.fontFamily || 'Nunito'; ctx.font = `${t} ${o} ${e.fontSize}px '${a}', sans-serif`; const i = textEditor.value.split('\n'); let r = 0; i.forEach(e => { const t = ctx.measureText(e); if (t.width > r) r = t.width }); e.width = r + 20; e.height = textEditor.scrollHeight / cameraZoom; } currentlyEditingText.isHidden = !1; selectedItems = [currentlyEditingText]; saveStateForUndo(); currentlyEditingText = null } textEditor.style.display = 'none'; textEditor.style.padding = '0'; textEditor.style.lineHeight = 'normal'; }
function autoResizeTextEditor() { textEditor.style.height = 'auto'; textEditor.style.height = textEditor.scrollHeight + 'px' }
function saveStateForUndo() { items.forEach(i => i._isDirty = true); const e = JSON.stringify(items, (e, t) => { if (e === 'img') { return undefined } return t }); if (historyIndex < historyStack.length - 1) { historyStack = historyStack.slice(0, historyIndex + 1) } if (historyStack.length > 0 && historyStack[historyStack.length - 1] === e) return; historyStack.push(e); historyIndex++; if (historyStack.length > HISTORY_LIMIT) { historyStack.shift(); historyIndex-- } scheduleAutoSave(); requestUpdate(); }
function loadStateFromHistory(e) {
    const t = JSON.parse(e);
    selectedItems = [];
    updateSelectionToolbar();
    updateLeftBarState();
    const o = e => {
        return e.map(e => {
            const t = { ...(e.scaleX !== void 0 ? {} : { scaleX: 1, scaleY: 1 }), ...e };
            if (t.type === 'image') {
                const img = new Image;
                if (t.imageId && globalImageCache[t.imageId]) {
                    img.src = globalImageCache[t.imageId];
                } else if (t.imgSrc) {
                    img.src = t.imgSrc;
                }
                t.img = img
            } else if (t.type === 'link') {
                delete t.iconImage;
                delete t.iconLoading;
            } else if (t.type === 'group') {
                t.items = o(t.items);
            }
            return t
        })
    };
    items = o(t)
}

function undoLastAction() { if (historyIndex > 0) { historyIndex--; const e = historyStack[historyIndex]; loadStateFromHistory(e) } }
function redoLastAction() { if (historyIndex < historyStack.length - 1) { historyIndex++; const e = historyStack[historyIndex]; loadStateFromHistory(e) } }
function groupSelectedItems() {
    if (selectedItems.length <= 1) return; saveStateForUndo(); const e = []; selectedItems.forEach(t => { if (t.type === 'group') { const o = t.x + t.width / 2, a = t.y + t.height / 2, i = Math.cos(t.rotation), r = Math.sin(t.rotation); t.items.forEach(s => { const n = JSON.parse(JSON.stringify(s)); reattachImages(s, n); if (n.type === 'arrow' || n.type === 'stroke' || n.type === 'measure') { const transformPt = (px, py) => { const dx = px - t.width / 2, dy = py - t.height / 2, rx = dx * i - dy * r, ry = dx * r + dy * i; return { x: o + rx, y: a + ry } }; if (n.type === 'arrow' || n.type === 'measure') { const p1 = transformPt(s.startX, s.startY), p2 = transformPt(s.endX, s.endY); n.startX = p1.x; n.startY = p1.y; n.endX = p2.x; n.endY = p2.y } else { n.points = s.points.map(pt => transformPt(pt.x, pt.y)) } } else { const l = s.x + s.width / 2, c = s.y + s.height / 2, d = l - t.width / 2, h = c - t.height / 2, p = d * i - h * r, m = d * r + h * i, u = o + p, g = a + m; n.x = u - s.width / 2; n.y = g - s.height / 2; n.rotation = (s.rotation || 0) + t.rotation; } e.push(n) }) } else { e.push(t) } }); const t = getCollectiveBoundingBox(e), o = { id: Date.now(), type: 'group', x: t.x, y: t.y, width: t.width, height: t.height, rotation: 0, isPinned: !1, opacity: 1, scaleX: 1, scaleY: 1, items: [] }; e.forEach(e => { const t = JSON.parse(JSON.stringify(e)); reattachImages(e, t); t.x -= o.x; t.y -= o.y; if (t.type === 'arrow' || t.type === 'measure') { t.startX -= o.x; t.startY -= o.y; t.endX -= o.x; t.endY -= o.y } else if (t.type === 'stroke') { t.points.forEach(e => { e.x -= o.x; e.y -= o.y }) } o.items.push(t) }); const a = new Set(selectedItems.map(e => e.id));
    items = items.filter(e => !a.has(e.id));
    addItemToLayeredItems(o);
    selectedItems = [o];
    updateSelectionToolbar();
    updateLeftBarState()
}
function groupOrderedItems() {
    if (selectedItems.length <= 1) return;
    const images = selectedItems.filter(item => item.type === 'image');
    if (images.length < 2) {
        showToast("Select at least 2 images to group ordered.", "error");
        return;
    }
    saveStateForUndo();
    const rowThreshold = 50;
    images.sort((a, b) => {
        if (Math.abs(a.y - b.y) < rowThreshold) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });
    images.forEach((item, index) => {
        item.label = (index + 1).toString().padStart(3, '0');
    });
    const originalSelection = [...selectedItems];
    selectedItems = images;
    groupSelectedItems();
}

function ungroupSelectedItems() {
    const groups = selectedItems.filter(e => e.type === 'group');
    if (groups.length === 0) return;
    saveStateForUndo();

    const newItems = [];
    const groupIds = new Set();

    groups.forEach(group => {
        groupIds.add(group.id);
        const a = group.x + group.width / 2;
        const i = group.y + group.height / 2;
        const r = Math.cos(group.rotation || 0);
        const s = Math.sin(group.rotation || 0);
        const gScaleX = group.scaleX || 1;
        const gScaleY = group.scaleY || 1;

        const transformPoint = (localX, localY) => {
            const cx = localX - group.width / 2;
            const cy = localY - group.height / 2;
            const scaledX = cx * gScaleX;
            const scaledY = cy * gScaleY;
            const rotX = scaledX * r - scaledY * s;
            const rotY = scaledX * s + scaledY * r;
            return { x: a + rotX, y: i + rotY };
        };

        group.items.forEach(child => {
            const n = JSON.parse(JSON.stringify(child));
            reattachImages(child, n);

            n.scaleX = (child.scaleX || 1) * gScaleX;
            n.scaleY = (child.scaleY || 1) * gScaleY;

            if (n.type === 'arrow' || n.type === 'measure') {
                const globalStart = transformPoint(child.startX, child.startY);
                const globalEnd = transformPoint(child.endX, child.endY);
                n.startX = globalStart.x;
                n.startY = globalStart.y;
                n.endX = globalEnd.x;
                n.endY = globalEnd.y;
            } else if (n.type === 'stroke') {
                n.points = child.points.map(pt => transformPoint(pt.x, pt.y));
            }

            const childLocalCenter = {
                x: child.x + child.width / 2,
                y: child.y + child.height / 2
            };
            const globalCenter = transformPoint(childLocalCenter.x, childLocalCenter.y);

            n.x = globalCenter.x - child.width / 2;
            n.y = globalCenter.y - child.height / 2;
            n.rotation = (child.rotation || 0) + (group.rotation || 0);

            items.push(n);
            newItems.push(n);
        });
    });

    items = items.filter(e => !groupIds.has(e.id));
    selectedItems = newItems;
    updateSelectionToolbar();
    updateLeftBarState();
}
function buildPaletteMenu() {
    palettePanel.innerHTML = '';
    colorPalettes.forEach(palette => {
        const option = document.createElement('div');
        option.className = 'palette-option';
        option.innerHTML = `<div class="palette-color" style="background-color: ${palette.bg}"></div><div class="palette-color" style="background-color: ${palette.accent}"></div><div class="palette-color" style="background-color: ${palette.grid}"></div>`;
        option.addEventListener('mouseenter', () => {
            const activeProject = projects.find(p => p.id === activeProjectId);
            if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt' || activeProject.type === 'storyflow')) {
                canvasBackgroundColor = palette.bg;
                accentColor = palette.accent;
                gridColor = palette.grid;
                updateUIColors();
            }
        });

        option.addEventListener('mouseleave', () => {
            const activeProject = projects.find(p => p.id === activeProjectId);
            if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt' || activeProject.type === 'storyflow')) {
                canvasBackgroundColor = activeProject.data.canvasBackgroundColor || '#0d0d0d';
                accentColor = activeProject.data.accentColor || '#429eff';
                gridColor = activeProject.data.gridColor || '#f9f8f6';
                updateUIColors();
            }
        });

        option.addEventListener('click', () => {
            const activeProject = projects.find(p => p.id === activeProjectId);
            if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt' || activeProject.type === 'storyflow')) {
                activeProject.data.canvasBackgroundColor = palette.bg;
                activeProject.data.accentColor = palette.accent;
                activeProject.data.gridColor = palette.grid;
                canvasBackgroundColor = palette.bg;
                accentColor = palette.accent;
                gridColor = palette.grid;
                saveProjects();
                updateUIColors();
            }
            palettePanel.classList.remove('open');
        });
        palettePanel.appendChild(option);
    });

    const separator = document.createElement('div');
    separator.style.borderTop = '1px solid var(--border-color)';
    separator.style.margin = '4px 0';
    palettePanel.appendChild(separator);

    const setDefaultBtn = document.createElement('button');
    setDefaultBtn.className = 'set-default-btn';
    setDefaultBtn.innerHTML = `<iconify-icon icon="lucide:save" width="14" height="14"></iconify-icon> Set current as default`;
    setDefaultBtn.onclick = (e) => {
        e.stopPropagation();
        saveDefaultTheme();
        palettePanel.classList.remove('open');
    };
    palettePanel.appendChild(setDefaultBtn);
}
function showToast(e, t = 'success') { if (!showNotifications) return; const o = document.getElementById('toast-container'); if (!o) return; const a = document.createElement('div'); a.className = `toast-notification ${t}`; let i = ''; if (t === 'success') { i = `<iconify-icon icon="lucide:check-circle" width="20" height="20" class="icon"></iconify-icon>` } else if (t === 'error') { i = `<iconify-icon icon="lucide:alert-circle" width="20" height="20" class="icon"></iconify-icon>` } a.innerHTML = `${i}<span>${e}</span>`; o.appendChild(a); setTimeout(() => { a.remove() }, 3e3) }

let lastTap = 0, longPressTimer = null, isPinching = false, initialPinchDistance = null, lastPinchCenter = null, initialCameraZoomOnPinch = 1;
function onTouchStart(e) {
    e.preventDefault(); clearTimeout(longPressTimer);
    if (e.touches.length === 1 && !isPinching) {
        const currentTime = new Date().getTime(); const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) { onDoubleClick(normalizeTouchEvent(e)); lastTap = 0; return; }
        lastTap = currentTime;
        longPressTimer = setTimeout(() => { const contextEvent = { preventDefault: () => { }, ...normalizeTouchEvent(e) }; onContextMenu(contextEvent); if (navigator.vibrate) { navigator.vibrate(50); } }, 750);
        onMouseDown(normalizeTouchEvent(e));
    } else if (e.touches.length === 2) {
        isDrawing = false; isMovingItems = false; isTransforming = false; isTransformingArrow = false; isSelectingBox = false; isPinching = true;
        initialPinchDistance = getPinchDistance(e); lastPinchCenter = getPinchCenter(e); initialCameraZoomOnPinch = cameraZoom;
    }
}
function onTouchMove(e) {
    e.preventDefault(); clearTimeout(longPressTimer);
    if (e.touches.length === 1 && !isPinching) {
        onMouseMove(normalizeTouchEvent(e));
    } else if (e.touches.length === 2 && isPinching) {
        const center = getPinchCenter(e);
        const deltaX = center.x - lastPinchCenter.x; const deltaY = center.y - lastPinchCenter.y;
        cameraOffset.x += deltaX / cameraZoom; cameraOffset.y += deltaY / cameraZoom;
        const dist = getPinchDistance(e); const zoomFactor = dist / initialPinchDistance; const newZoom = initialCameraZoomOnPinch * zoomFactor;
        const worldPosBeforeZoom = screenToWorld(center); cameraZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)); const worldPosAfterZoom = screenToWorld(center);
        cameraOffset.x += worldPosAfterZoom.x - worldPosBeforeZoom.x; cameraOffset.y += worldPosAfterZoom.y - worldPosBeforeZoom.y;
        lastPinchCenter = center;
        requestUpdate();
    }
}
function onTouchEnd(e) {
    e.preventDefault(); clearTimeout(longPressTimer);
    if (e.touches.length < 2) { isPinching = false; initialPinchDistance = null; lastPinchCenter = null; }
    if (e.touches.length === 0) { onMouseUp(normalizeTouchEvent(e)); }
}



function getPinchDistance(e) { const t = e.touches[0], o = e.touches[1]; return Math.hypot(t.clientX - o.clientX, t.clientY - o.clientY) }
function getPinchCenter(e) { const t = e.touches[0], o = e.touches[1]; return { x: (t.clientX + o.clientX) / 2, y: (t.clientY + o.clientY) / 2 } }
function normalizeTouchEvent(e) {
    let t;
    if (e.touches && e.touches.length > 0) { t = e.touches[0] }
    else if (e.changedTouches && e.changedTouches.length > 0) { t = e.changedTouches[0] }
    else { return { clientX: 0, clientY: 0, button: 0, target: e.target, isTouch: true } }
    return { clientX: t.clientX, clientY: t.clientY, button: 0, target: e.target, isTouch: true }
}
function screenToWorld(e) { if (!e) return { x: 0, y: 0 }; return { x: (e.x - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, y: (e.y - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2 } }
function worldToScreen(e) { if (!e) return { x: 0, y: 0 }; return { x: (e.x + cameraOffset.x - canvas.width / 2) * cameraZoom + canvas.width / 2, y: (e.y + cameraOffset.y - canvas.height / 2) * cameraZoom + canvas.height / 2 } }
function reattachImages(e, t) {
    if (!e || !t) return;
    if (e.type === 'image' && e.img instanceof HTMLImageElement) {
        t.img = e.img;
    } else if (e.type === 'link') {
        delete t.iconImage;
        delete t.iconLoading;
    } else if (e.type === 'group') {
        if (e.items && t.items) {
            e.items.forEach((e, o) => { reattachImages(e, t.items[o]) });
        }
    }
}
function getHoveredPort(mousePos) {
    const hitRadius = 15 / cameraZoom;
    if (hoveredItem || selectedItems.length > 0) {
        const itemToCheck = hoveredItem || selectedItems[0];
        const ports = getItemPorts(itemToCheck);
        for (const p of ports) {
            if (Math.hypot(p.x - mousePos.x, p.y - mousePos.y) <= hitRadius) {
                return p;
            }
        }
    }
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        const ports = getItemPorts(item);
        for (const p of ports) {
            if (Math.hypot(p.x - mousePos.x, p.y - mousePos.y) <= hitRadius) {
                return p;
            }
        }
    }
    return null;
}

function getHoveredConnector(mousePos) {
    const hitRadius = 10 / cameraZoom;
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item.type === 'connector' && item.route) {
            for (let j = 0; j < item.route.length - 1; j++) {
                const p1 = item.route[j];
                const p2 = item.route[j + 1];
                
                const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
                if (l2 === 0) continue;
                let t = ((mousePos.x - p1.x) * (p2.x - p1.x) + (mousePos.y - p1.y) * (p2.y - p1.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = p1.x + t * (p2.x - p1.x);
                const projY = p1.y + t * (p2.y - p1.y);
                
                if (Math.hypot(mousePos.x - projX, mousePos.y - projY) <= hitRadius) {
                    return item;
                }
            }
        }
    }
    return null;
}

function getItemAtPosition(pos) {
    if (!pos) return null;
    const checkItem = (item) => {
        const bbox = getItemBoundingBox(item);
        if (pos.x >= bbox.x && pos.x <= bbox.x + bbox.width && pos.y >= bbox.y && pos.y <= bbox.y + bbox.height) {
            if (item.type === 'group') {
                const centerX = item.x + item.width / 2, centerY = item.y + item.height / 2, dx = pos.x - centerX, dy = pos.y - centerY, cos = Math.cos(-item.rotation), sin = Math.sin(-item.rotation), rx = dx * cos - dy * sin, ry = dx * sin + dy * cos, localX = rx + centerX - item.x, localY = ry + centerY - item.y;
                for (let i = item.items.length - 1; i >= 0; i--) {
                    const subItem = item.items[i], subBox = { x: subItem.x, y: subItem.y, width: subItem.width, height: subItem.height };
                    if (localX >= subBox.x && localX <= subBox.x + subBox.width && localY >= subBox.y && localY <= subBox.y + subBox.height) return item;
                }
            }
            if (item.type === 'stroke' || item.type === 'arrow' || item.type === 'measure') {
                const bboxExt = getItemBoundingBox(item);
                if (pos.x >= bboxExt.x - 10 / cameraZoom && pos.x <= bboxExt.x + bboxExt.width + 10 / cameraZoom && pos.y >= bboxExt.y - 10 / cameraZoom && pos.y <= bboxExt.y + bboxExt.height + 10 / cameraZoom) {
                    if (item.type === 'stroke') {
                        for (let i = 0; i < item.points.length - 1; i++) { if (Math.sqrt(distToSegmentSquared(pos, item.points[i], item.points[i + 1])) < 10 / cameraZoom) return item }
                    } else if (item.type === 'arrow' || item.type === 'measure') {
                        if (Math.sqrt(distToSegmentSquared(pos, { x: item.startX, y: item.startY }, { x: item.endX, y: item.endY })) < 10 / cameraZoom) return item
                    }
                }
            } else if (item.type === 'reroute') {
                if (Math.hypot(pos.x - item.x, pos.y - item.y) <= 12 / cameraZoom) return item
            } else {
                const centerX = item.x + item.width / 2, centerY = item.y + item.height / 2, dx = pos.x - centerX, dy = pos.y - centerY, sin = -item.rotation, rx = dx * Math.cos(sin) - dy * Math.sin(sin), ry = dx * Math.sin(sin) + dy * Math.cos(sin);
                if (rx > -item.width / 2 && rx < item.width / 2 && ry > -item.height / 2 && ry < item.height / 2) return item
            }
        }
        return null;
    };
    // Check comments first (on top)
    for (let t = items.length - 1; t >= 0; t--) { if (items[t].type === 'comment') { const res = checkItem(items[t]); if (res) return res; } }
    // Then check all others
    for (let t = items.length - 1; t >= 0; t--) { if (items[t].type !== 'comment') { const res = checkItem(items[t]); if (res) return res; } }
    return null;
}
function getGizmoAtPosition(e) { if (!e || selectedItems.length !== 1 || !activeGizmo) return null; const t = selectedItems[0]; if (t.isPinned || t.type === 'arrow' || t.type === 'stroke' || t.type === 'measure') return null; const o = 14 / cameraZoom, a = t.x + t.width / 2, i = t.y + t.height / 2; if (activeGizmo === 'rotate') { const r = t.width / 2, s = -t.height / 2 - 20 / cameraZoom, n = r * Math.cos(t.rotation) - s * Math.sin(t.rotation), l = r * Math.sin(t.rotation) + s * Math.cos(t.rotation); if (Math.hypot(e.x - (a + n), e.y - (i + l)) < o) return 'rotate' } else if (activeGizmo === 'scale') { const r = t.width / 2, s = t.height / 2, n = r * Math.cos(t.rotation) - s * Math.sin(t.rotation), l = r * Math.sin(t.rotation) + s * Math.cos(t.rotation); if (Math.hypot(e.x - (a + n), e.y - (i + l)) < o) return 'scale' } return null }
function getArrowHandleAtPosition(e) { if (!e || selectedItems.length !== 1) return null; const t = selectedItems[0]; if (t.isPinned || (t.type !== 'arrow' && t.type !== 'measure')) return null; const o = 12 / cameraZoom; if (Math.hypot(e.x - t.startX, e.y - t.startY) < o) return 'start'; if (Math.hypot(e.x - t.endX, e.y - t.endY) < o) return 'end'; return null }
function getCollectiveBoundingBox(e) { if (e.length === 0) return { x: 0, y: 0, width: 0, height: 0 }; let t = Infinity, o = Infinity, a = -Infinity, i = -Infinity; e.forEach(e => { const r = getItemBoundingBox(e); t = Math.min(t, r.x); o = Math.min(o, r.y); a = Math.max(a, r.x + r.width); i = Math.max(i, r.y + r.height) }); return { x: t, y: o, width: a - t, height: i - o } }
function getItemBoundingBox(item) {
    if (item.type === 'connector') {
        const sX = item.computedStartX ?? 0, sY = item.computedStartY ?? 0, eX = item.computedEndX ?? 0, eY = item.computedEndY ?? 0;
        return { x: Math.min(sX, eX), y: Math.min(sY, eY), width: Math.max(1, Math.abs(sX - eX)), height: Math.max(1, Math.abs(sY - eY)) };
    }

    if (item._cachedBox && !item._isDirty) return item._cachedBox;

    let box;
    const itemRot = item.rotation || 0;
    const itemW = item.width || 0;
    const itemH = item.height || 0;

    if (item.type === 'reroute') {
        box = { x: item.x - 12 / cameraZoom, y: item.y - 12 / cameraZoom, width: 24 / cameraZoom, height: 24 / cameraZoom };
    } else if (item.type === 'group') {
        if (!item.items || item.items.length === 0) {
            box = { x: item.x, y: item.y, width: itemW, height: itemH };
        } else {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const centerX = item.x + itemW / 2, centerY = item.y + itemH / 2, cos = Math.cos(itemRot), sin = Math.sin(itemRot);
            item.items.forEach(child => {
                const childBox = getItemBoundingBox(child), vertices = [{ x: childBox.x, y: childBox.y }, { x: childBox.x + childBox.width, y: childBox.y }, { x: childBox.x + childBox.width, y: childBox.y + childBox.height }, { x: childBox.x, y: childBox.y + childBox.height }];
                vertices.forEach(v => {
                    const dx = (item.x + v.x) - centerX, dy = (item.y + v.y) - centerY, rx = dx * cos - dy * sin, ry = dx * sin + dy * cos, x = centerX + rx, y = centerY + ry;
                    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
                })
            });
            box = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
        }
    } else if (item.type === 'stroke') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (item.points && item.points.length > 0) {
            item.points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) });
            box = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
        } else {
            box = { x: item.x, y: item.y, width: 0, height: 0 };
        }
    } else if (item.type === 'arrow' || item.type === 'measure') {
        box = { x: Math.min(item.startX, item.endX), y: Math.min(item.startY, item.endY), width: Math.abs(item.startX - item.endX), height: Math.abs(item.startY - item.endY) };
    } else {
        const centerX = item.x + itemW / 2, centerY = item.y + itemH / 2, cos = Math.cos(itemRot), sin = Math.sin(itemRot);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        [{ x: -itemW / 2, y: -itemH / 2 }, { x: itemW / 2, y: -itemH / 2 }, { x: itemW / 2, y: itemH / 2 }, { x: -itemW / 2, y: itemH / 2 }].forEach(v => {
            const x = v.x * cos - v.y * sin + centerX, y = v.x * sin + v.y * cos + centerY;
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        });
        box = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }

    item._cachedBox = box;
    item._isDirty = false;
    return box;
}
function rectsIntersect(e, t) { return !(t.x > e.x + e.width || t.x + t.width < e.x || t.y > e.y + e.height || t.y + t.height < e.y) }
function getNormalizedSelectionBox() { return { x: Math.min(selectionBox.startX, selectionBox.endX), y: Math.min(selectionBox.startY, selectionBox.endY), width: Math.abs(selectionBox.startX - selectionBox.endX), height: Math.abs(selectionBox.startY - selectionBox.endY) } }
function hexToRgba(e, t) { let o = 0, a = 0, i = 0; if (e.length == 4) { o = "0x" + e[1] + e[1]; a = "0x" + e[2] + e[2]; i = "0x" + e[3] + e[3] } else if (e.length == 7) { o = "0x" + e[1] + e[2]; a = "0x" + e[3] + e[4]; i = "0x" + e[5] + e[6] } return `rgba(${+o},${+a},${+i},${t})` }
function rgbToHex(e, t, o) { return "#" + ((1 << 24) + (e << 16) + (t << 8) + o).toString(16).slice(1) }
function distSq(e, t) { return Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2) }
function distToSegmentSquared(e, t, o) { const a = distSq(t, o); if (a === 0) return distSq(e, t); let i = ((e.x - t.x) * (o.x - t.x) + (e.y - t.y) * (o.y - t.y)) / a; i = Math.max(0, Math.min(1, i)); return distSq(e, { x: t.x + i * (o.x - t.x), y: t.y + i * (o.y - t.y) }) }
function invertColor(e) { if (e.indexOf('#') === 0) e = e.slice(1); if (e.length === 3) e = e[0] + e[0] + e[1] + e[1] + e[2] + e[2]; if (e.length !== 6) return '#ffffff'; const t = (255 - parseInt(e.slice(0, 2), 16)).toString(16), o = (255 - parseInt(e.slice(2, 4), 16)).toString(16), a = (255 - parseInt(e.slice(4, 6), 16)).toString(16); return '#' + padZero(t) + padZero(o) + padZero(a) }
function padZero(e, t) { t = t || 2; const o = (new Array(t + 1)).join('0'); return (o + e).slice(-t) }
function adjustZoom(e, t) { if (isDragging) return; const evLoc = getEventLocation(e); if (!evLoc) return; const o = screenToWorld(evLoc); cameraZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraZoom * (1 + t))); const a = screenToWorld(getEventLocation(e)); cameraOffset.x += a.x - o.x; cameraOffset.y += a.y - o.y; requestUpdate(); }

function centerView() {
    cameraZoom = 1;
    cameraOffset.x = canvas.width / 2;
    cameraOffset.y = canvas.height / 2;
    showToast('View centered.');
    requestUpdate();
}

function focusOnSelection() {
    const targets = selectedItems.length > 0 ? selectedItems : items;
    if (targets.length === 0) { centerView(); return; }
    const bbox = getCollectiveBoundingBox(targets);
    if (bbox.width === 0 && bbox.height === 0) return;
    const padding = 80;
    const scaleX = (canvas.width - padding * 2) / bbox.width;
    const scaleY = (canvas.height - padding * 2) / bbox.height;
    cameraZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY)));
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    cameraOffset.x = canvas.width / 2 - centerX;
    cameraOffset.y = canvas.height / 2 - centerY;
    requestUpdate();
}

cancelNoteBtn.onclick = cancelNoteEditing;
confirmNoteBtn.onclick = finishNoteEditing;

function applyNoteFormat(fmt) {
    if (!noteBodyInput) return;
    const start = noteBodyInput.selectionStart;
    const end = noteBodyInput.selectionEnd;
    const text = noteBodyInput.value;
    const selectedText = text.substring(start, end);
    let replacement = "";

    switch (fmt) {
        case 'bold': replacement = `**${selectedText || 'text'}**`; break;
        case 'italic': replacement = `*${selectedText || 'text'}*`; break;
        case 'h1': replacement = `\n# ${selectedText || 'Heading 1'}`; break;
        case 'h2': replacement = `\n## ${selectedText || 'Heading 2'}`; break;
        case 'bullet': replacement = `\n- ${selectedText || 'Item'}`; break;
        case 'code': replacement = `\`${selectedText || 'code'}\``; break;
    }

    noteBodyInput.value = text.substring(0, start) + replacement + text.substring(end);
    noteBodyInput.focus();
    noteBodyInput.setSelectionRange(start + replacement.length, start + replacement.length);
}

noteFmtBtns.forEach(btn => {
    btn.onclick = () => {
        applyNoteFormat(btn.dataset.fmt);
    };
});

if (noteBodyInput) {
    noteBodyInput.addEventListener('input', () => {
        noteBodyInput.style.height = 'auto';
        noteBodyInput.style.height = noteBodyInput.scrollHeight + 'px';
    });
    noteBodyInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelNoteEditing();
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') { e.preventDefault(); applyNoteFormat('bold'); }
            if (e.key === 'i') { e.preventDefault(); applyNoteFormat('italic'); }
            if (e.key === 'Enter') { e.preventDefault(); finishNoteEditing(); }
        }
    });
}

if (noteTitleInput) {
    noteTitleInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelNoteEditing();
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            noteBodyInput.focus();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            finishNoteEditing();
        }
    });
}

loadSettings();
setupEventListeners();
setupGanttListeners();
buildPaletteMenu();

window.localforage.getItem('moodinfinite_video_cache').then(vCache => {
    if (vCache) globalVideoCache = vCache;
    return window.localforage.getItem('moodinfinite_cache');
}).then(cache => {
    if (cache) globalImageCache = cache;
    return window.localforage.getItem('moodinfinite_projects');
}).then(savedProjects => {
    if (savedProjects && savedProjects.length > 0) {
        savedProjects.forEach(p => {
            if (p.type === 'moodinfinite' && p.data && p.data.items) {
                restoreImages(p.data.items);
            }
        });
        projects = savedProjects;
        renderTabs();
        window.localforage.getItem('moodinfinite_active_tab').then(actId => {
            if (actId && projects.find(p => p.id === actId)) switchTab(actId);
            else switchTab(projects[0].id);
            gameLoop();
        }).catch(() => {
            switchTab(projects[0].id);
            gameLoop();
        });
    } else {
        createNewProject('moodinfinite');
        gameLoop();
    }
}).catch(err => {
    console.error("Failed to load from indexedDB", err);
    createNewProject('moodinfinite');
    gameLoop();
});

let activeLinkEdit = null;
function showLinkInputModal(x, y, existingItem = null) {
    activeLinkEdit = existingItem ? { item: existingItem } : { x, y };
    inputModalOverlay.style.display = 'flex';
    inputModalTitle.textContent = existingItem ? 'Edit Link' : 'Add Link';
    linkUrlInput.value = existingItem ? existingItem.url : '';
    linkTitleInput.value = existingItem ? existingItem.title : '';
    linkUrlInput.focus();
}

function hideLinkInputModal() {
    inputModalOverlay.style.display = 'none';
    activeLinkEdit = null;
}

function getCheckboxHitIndex(item, worldPos) {
    if (item.type !== 'textList') return -1;
    const dx = worldPos.x - (item.x + item.width / 2);
    const dy = worldPos.y - (item.y + item.height / 2);
    const cos = Math.cos(-item.rotation);
    const sin = Math.sin(-item.rotation);
    const localX = dx * cos - dy * sin + item.width / 2;
    const localY = dx * sin + dy * cos + item.height / 2;

    const padding = 15;
    const h = item.fontSize * 1.5;
    const checkboxSize = item.fontSize * 1.1;
    const indentSize = 25;
    const handleSize = item.fontSize * 0.8;

    let currentY = padding;
    if (item.title) currentY += h * 1.2 + 10;

    for (let i = 0; i < (item.items || []).length; i++) {
        const indentOffset = (item.items[i].indent || 0) * indentSize;
        const cbY = currentY + (h - checkboxSize) / 2;
        const cbX = padding + indentOffset + handleSize + 8;

        if (localX >= cbX - 5 && localX <= cbX + checkboxSize + 5 &&
            localY >= cbY - 5 && localY <= cbY + checkboxSize + 5) {
            return i;
        }
        currentY += h;
    }
    return -1;
}

function getHandleHitIndex(item, worldPos) {
    if (item.type !== 'textList') return -1;
    const dx = worldPos.x - (item.x + item.width / 2);
    const dy = worldPos.y - (item.y + item.height / 2);
    const cos = Math.cos(-item.rotation);
    const sin = Math.sin(-item.rotation);
    const localX = dx * cos - dy * sin + item.width / 2;
    const localY = dx * sin + dy * cos + item.height / 2;

    const padding = 15;
    const h = item.fontSize * 1.5;
    const handleSize = item.fontSize * 0.8;
    const indentSize = 25;

    let currentY = padding;
    if (item.title) currentY += h * 1.2 + 10;

    for (let i = 0; i < (item.items || []).length; i++) {
        const indentOffset = (item.items[i].indent || 0) * indentSize;
        const hy = currentY + (h - handleSize) / 2;
        const hx = padding + indentOffset;

        if (localX >= hx - 5 && localX <= hx + handleSize + 5 &&
            localY >= hy - 5 && localY <= hy + handleSize + 5) {
            return i;
        }
        currentY += h;
    }
    return -1;
}

function getCounterButtonHit(item, worldPos) {
    if (item.type !== 'counter') return 0;
    const dx = worldPos.x - (item.x + item.width / 2);
    const dy = worldPos.y - (item.y + item.height / 2);
    const cos = Math.cos(-item.rotation);
    const sin = Math.sin(-item.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const thirdW = item.width / 3;

    if (localX < -thirdW / 2) return -1;
    if (localX > thirdW / 2) return 1;

    return 0;
}

cancelInputBtn.onclick = hideLinkInputModal;
confirmInputBtn.onclick = () => {
    let url = linkUrlInput.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

    let title = linkTitleInput.value.trim();
    if (!title) {
        try {
            title = new URL(url).hostname.replace('www.', '');
        } catch (e) {
            title = 'Link';
        }
    }

    if (activeLinkEdit.item) {
        activeLinkEdit.item.url = url;
        activeLinkEdit.item.title = title;
        activeLinkEdit.item.iconImage = null; // Reset for reload
        saveStateForUndo();
    } else {
        const newItem = {
            id: Date.now(),
            type: 'link',
            url: url,
            title: title,
            x: activeLinkEdit.x,
            y: activeLinkEdit.y,
            width: 160,
            height: 48,
            rotation: 0,
            isPinned: false,
            opacity: 1,
            scaleX: 1,
            scaleY: 1,
            color: accentColor
        };
        addItemToLayeredItems(newItem);
        selectedItems = [newItem];
        bringSelectedToFront();
        saveStateForUndo();
    }
    hideLinkInputModal();
    setCurrentTool(null);
};

const faviconCache = {};
function drawLinkItem(ctx, item) {
    ctx.save();
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(item.rotation || 0);
    ctx.scale(item.scaleX || 1, item.scaleY || 1);
    ctx.globalAlpha *= (item.opacity ?? 1);

    const x = -item.width / 2;
    const y = -item.height / 2;

    // Glassmorphism effect for link container
    ctx.fillStyle = 'rgba(30, 30, 30, 0.9)';
    ctx.strokeStyle = item.color || accentColor;
    ctx.lineWidth = 2 / cameraZoom;

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, item.width, item.height, 10 / cameraZoom);
    else ctx.rect(x, y, item.width, item.height);
    ctx.fill();
    ctx.stroke();

    // Icon handling
    if (!item.iconImage && !item.iconLoading) {
        item.iconLoading = true;
        try {
            const domain = new URL(item.url).hostname;
            const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

            if (faviconCache[domain]) {
                item.iconImage = faviconCache[domain];
                item.iconLoading = false;
            } else {
                const img = new Image();
                img.onload = () => {
                    faviconCache[domain] = img;
                    item.iconImage = img;
                    item.iconLoading = false;
                };
                img.onerror = () => {
                    item.iconLoading = false;
                    item.iconError = true;
                };
                img.src = iconUrl;
            }
        } catch (e) {
            item.iconLoading = false;
            item.iconError = true;
        }
    }

    const padding = 12 / cameraZoom;
    const iconSize = 24 / cameraZoom;

    if (item.iconImage instanceof HTMLImageElement) {
        ctx.drawImage(item.iconImage, x + padding, y + (item.height - iconSize) / 2, iconSize, iconSize);
    } else {
        // Fallback info icon
        ctx.fillStyle = item.color || accentColor;
        ctx.beginPath();
        ctx.arc(x + padding + iconSize / 2, y + item.height / 2, 8 / cameraZoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${10 / cameraZoom}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText('L', x + padding + iconSize / 2, y + item.height / 2 + 3 / cameraZoom);
    }

    // Text handling
    ctx.fillStyle = '#ffffff';
    ctx.font = `500 ${14 / cameraZoom}px Inter, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const textX = x + padding + iconSize + 10 / cameraZoom;
    const title = item.title || 'Link';

    // Quick Go button metrics
    const btnSize = 24 / cameraZoom;
    const btnPadding = 8 / cameraZoom;
    const btnX = item.width / 2 - btnSize - btnPadding;
    const btnY = -btnSize / 2;

    // Recalculate maxWidth to avoid covering the button
    const maxWidth = item.width - (textX - x) - btnSize - btnPadding - 10 / cameraZoom;

    let displayTitle = title;
    // Iteratively truncate to fit maxWidth
    if (ctx.measureText(displayTitle).width > maxWidth) {
        while (displayTitle.length > 0 && ctx.measureText(displayTitle + '...').width > maxWidth) {
            displayTitle = displayTitle.substring(0, displayTitle.length - 1);
        }
        displayTitle += '...';
    }

    ctx.fillText(displayTitle, textX, y + item.height / 2);

    // Quick Go button rendering with hover effect
    ctx.fillStyle = item.isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(btnX, btnY, btnSize, btnSize, 6 / cameraZoom);
    else ctx.rect(btnX, btnY, btnSize, btnSize);
    ctx.fill();

    ctx.strokeStyle = item.isHovered ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 / cameraZoom;
    ctx.stroke();

    // External link icon arrow
    ctx.beginPath();
    ctx.lineWidth = 2 / cameraZoom;
    ctx.strokeStyle = item.isHovered ? '#fff' : 'rgba(255, 255, 255, 0.8)';
    const arrowPadding = 6 / cameraZoom;
    const ax = btnX + arrowPadding;
    const ay = btnY + btnSize - arrowPadding;
    const ax2 = btnX + btnSize - arrowPadding;
    const ay2 = btnY + arrowPadding;

    ctx.moveTo(ax, ay);
    ctx.lineTo(ax2, ay2);
    ctx.moveTo(ax2 - 6 / cameraZoom, ay2);
    ctx.lineTo(ax2, ay2);
    ctx.lineTo(ax2, ay2 + 6 / cameraZoom);
    ctx.stroke();

    ctx.restore();
}

// --- COLOR SEEKER ---
const colorseekerModeSelect = document.getElementById('colorseeker-mode-select');
const colorseekerBasePicker = document.getElementById('colorseeker-base-picker');
const colorseekerPalette = document.getElementById('colorseeker-palette');

function hexToHsl(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 0, l: 0 };
    let r = parseInt(result[1], 16) / 255, g = parseInt(result[2], 16) / 255, b = parseInt(result[3], 16) / 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        } h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h, s, l) {
    l /= 100; const a = s * Math.min(l, 1 - l) / 100;
    const f = n => { const k = (n + h / 30) % 12; const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * color).toString(16).padStart(2, '0'); };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '';
}

function hexToCmyk(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '';
    let r = parseInt(result[1], 16) / 255, g = parseInt(result[2], 16) / 255, b = parseInt(result[3], 16) / 255;
    let k = 1 - Math.max(r, g, b);
    if (k === 1) return '0, 0, 0, 100';
    let c = Math.round(((1 - r - k) / (1 - k)) * 100);
    let m = Math.round(((1 - g - k) / (1 - k)) * 100);
    let y = Math.round(((1 - b - k) / (1 - k)) * 100);
    return `${c}, ${m}, ${y}, ${Math.round(k * 100)}`;
}

function generatePalette(baseHex, mode, lockedColors) {
    const hsl = hexToHsl(baseHex);
    let colors = [];

    if (mode === 'shades') {
        colors = [
            hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - 40)),
            hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - 20)),
            baseHex,
            hslToHex(hsl.h, hsl.s, Math.min(100, hsl.l + 20)),
            hslToHex(hsl.h, hsl.s, Math.min(100, hsl.l + 40))
        ];
    } else if (mode === 'tones') {
        colors = [
            hslToHex(hsl.h, Math.max(0, hsl.s - 40), hsl.l),
            hslToHex(hsl.h, Math.max(0, hsl.s - 20), hsl.l),
            baseHex,
            hslToHex(hsl.h, Math.min(100, hsl.s + 20), hsl.l),
            hslToHex(hsl.h, Math.min(100, hsl.s + 40), hsl.l)
        ];
    } else if (mode === 'harmonies') {
        // Analogous: ±15°, ±30° around the base
        colors = [
            hslToHex((hsl.h - 30 + 360) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h - 15 + 360) % 360, hsl.s, hsl.l),
            baseHex,
            hslToHex((hsl.h + 15) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l)
        ];
    } else if (mode === 'complementary') {
        // Base, base-warm split, midpoint, comp-cool split, complement (180°)
        const comp = (hsl.h + 180) % 360;
        colors = [
            baseHex,
            hslToHex((hsl.h + 30) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h + 90) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h + 150) % 360, hsl.s, hsl.l),
            hslToHex(comp, hsl.s, hsl.l)
        ];
    } else if (mode === 'split-complementary') {
        // Base + two colors flanking its complement (150° and 210°)
        const splitA = (hsl.h + 150) % 360;
        const splitB = (hsl.h + 210) % 360;
        colors = [
            hslToHex(splitA, hsl.s, Math.max(5, hsl.l - 15)),
            hslToHex(splitA, hsl.s, hsl.l),
            baseHex,
            hslToHex(splitB, hsl.s, hsl.l),
            hslToHex(splitB, hsl.s, Math.min(95, hsl.l + 15))
        ];
    } else if (mode === 'triadic') {
        // Three hues at 120° intervals, with lighter/darker variants
        const t1 = (hsl.h + 120) % 360;
        const t2 = (hsl.h + 240) % 360;
        colors = [
            hslToHex(t2, hsl.s, hsl.l),
            hslToHex(t2, hsl.s, Math.min(95, hsl.l + 15)),
            baseHex,
            hslToHex(t1, hsl.s, Math.min(95, hsl.l + 15)),
            hslToHex(t1, hsl.s, hsl.l)
        ];
    } else if (mode === 'tetradic') {
        // Four hues at 90° intervals
        colors = [
            baseHex,
            hslToHex((hsl.h + 90) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h + 270) % 360, hsl.s, hsl.l),
            hslToHex((hsl.h + 45) % 360, hsl.s, Math.min(95, hsl.l + 10))
        ];
    }

    // Apply locked colors — locked slots keep their existing value
    if (lockedColors && lockedColors.length) {
        lockedColors.forEach((lockedHex, i) => {
            if (lockedHex && i < colors.length) colors[i] = lockedHex;
        });
    }

    return colors;
}

function renderColorSeeker(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project || project.type !== 'colorseeker') return;

    if (!project.data.lockedColors) project.data.lockedColors = [];

    if (colorseekerModeSelect) colorseekerModeSelect.value = project.data.mode || 'shades';
    if (colorseekerBasePicker) colorseekerBasePicker.value = project.data.baseColor || '#ffffff';
    if (!project.data.colors) project.data.colors = generatePalette(project.data.baseColor, project.data.mode, project.data.lockedColors);

    // Track which bar is "focused" for the L hotkey
    window._colorseekerFocusedIndex = null;

    if (colorseekerPalette) {
        colorseekerPalette.innerHTML = '';
        project.data.colors.forEach((cHex, i) => {
            const bar = document.createElement('div');
            bar.className = 'colorseeker-bar';
            bar.style.backgroundColor = cHex;
            bar.style.flex = '1';
            bar.style.height = '100%';
            bar.style.transition = 'flex 0.3s ease';
            bar.style.position = 'relative';
            bar.style.cursor = 'pointer';

            const isLocked = !!project.data.lockedColors[i];

            // Base indicator (only when not locked)
            const isBase = (project.data.mode === 'shades' || project.data.mode === 'tones') ? i === 2
                         : (project.data.mode === 'harmonies' || project.data.mode === 'split-complementary' || project.data.mode === 'triadic') ? i === 2
                         : (project.data.mode === 'complementary' || project.data.mode === 'tetradic') ? i === 0
                         : false;
            if (isBase && !isLocked) {
                const baseIndicator = document.createElement('div');
                baseIndicator.innerHTML = '<iconify-icon icon="lucide:target" width="24" height="24"></iconify-icon>';
                baseIndicator.style.cssText = 'position:absolute;top:1.5rem;left:50%;transform:translateX(-50%);opacity:0.5;pointer-events:none;';
                const hsl = hexToHsl(cHex);
                baseIndicator.style.color = hsl.l > 50 ? '#000' : '#fff';
                bar.appendChild(baseIndicator);
            }

            // Lock icon button (visible on hover or when locked)
            const lockBtn = document.createElement('button');
            lockBtn.title = isLocked ? 'Unlock color (L)' : 'Lock color (L)';
            lockBtn.style.cssText = `
                position: absolute;
                bottom: 1rem;
                left: 50%;
                transform: translateX(-50%);
                background: ${isLocked ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)'};
                border: 1px solid ${isLocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)'};
                border-radius: 6px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: ${isLocked ? '1' : '0'};
                transition: opacity 0.2s, background 0.2s;
                z-index: 5;
                padding: 0;
                color: ${hexToHsl(cHex).l > 50 ? '#222' : '#fff'};
            `;
            lockBtn.innerHTML = isLocked
                ? '<iconify-icon icon="lucide:lock" width="14" height="14"></iconify-icon>'
                : '<iconify-icon icon="lucide:lock-open" width="14" height="14"></iconify-icon>';
            bar.appendChild(lockBtn);

            // Locked overlay stripe
            if (isLocked) {
                const lockedStripe = document.createElement('div');
                lockedStripe.style.cssText = `
                    position:absolute;inset:0;
                    background: repeating-linear-gradient(
                        -45deg,
                        transparent,transparent 8px,
                        rgba(255,255,255,0.06) 8px,rgba(255,255,255,0.06) 10px
                    );
                    pointer-events:none;
                    border: 2px solid rgba(255,255,255,0.25);
                    box-sizing:border-box;
                `;
                bar.appendChild(lockedStripe);
            }

            // Color info tooltip
            const info = document.createElement('div');
            info.className = 'colorseeker-info';
            info.style.cssText = 'position:absolute;bottom:4.5rem;left:50%;transform:translateX(-50%);opacity:0;transition:opacity 0.2s;display:flex;flex-direction:column;gap:0.5rem;align-items:center;pointer-events:none;white-space:nowrap;';
            const hslStr = hexToHsl(cHex);
            info.style.color = hslStr.l > 50 ? '#000' : '#fff';
            info.innerHTML = `
                <div style="font-size:1.5rem;font-weight:bold;margin-bottom:0.5rem;">${cHex.toUpperCase()}</div>
                <div style="font-size:0.9rem;">RGB: ${hexToRgb(cHex)}</div>
                <div style="font-size:0.9rem;">HSL: ${hslStr.h}, ${hslStr.s}%, ${hslStr.l}%</div>
                <div style="font-size:0.9rem;">CMYK: ${hexToCmyk(cHex)}</div>
                ${isLocked ? '<div style="font-size:0.8rem;margin-top:0.25rem;opacity:0.8;">🔒 Locked</div>' : ''}
            `;
            bar.appendChild(info);

            // Hover effects
            bar.addEventListener('mouseenter', () => {
                bar.style.flex = '1.5';
                info.style.opacity = '1';
                lockBtn.style.opacity = '1';
                window._colorseekerFocusedIndex = i;
            });
            bar.addEventListener('mouseleave', () => {
                bar.style.flex = '1';
                info.style.opacity = '0';
                if (!isLocked) lockBtn.style.opacity = '0';
                if (window._colorseekerFocusedIndex === i) window._colorseekerFocusedIndex = null;
            });

            // Lock toggle function
            const toggleLock = (ev) => {
                if (ev) ev.stopPropagation();
                if (project.data.lockedColors[i]) {
                    project.data.lockedColors[i] = null;
                } else {
                    project.data.lockedColors[i] = cHex;
                }
                saveToBrowser();
                renderColorSeeker(projectId);
                showToast(project.data.lockedColors[i] ? `Color ${cHex.toUpperCase()} locked.` : 'Color unlocked.');
            };

            lockBtn.addEventListener('click', toggleLock);
            // Expose toggle on the bar element for hotkey access
            bar._toggleLock = toggleLock;

            bar.addEventListener('click', (e) => {
                if (e.target === lockBtn || lockBtn.contains(e.target)) return;
                if (e.shiftKey) {
                    project.data.baseColor = cHex;
                    project.data.colors = generatePalette(cHex, project.data.mode, project.data.lockedColors);
                    saveToBrowser();
                    renderColorSeeker(projectId);
                    showToast('Base color set.');
                } else {
                    navigator.clipboard.writeText(cHex.toUpperCase());
                    showToast(`Copied ${cHex.toUpperCase()}`);
                }
            });

            colorseekerPalette.appendChild(bar);
        });
    }
}

function downloadColorSeekerPalette() {
    const project = projects.find(p => p.id === activeProjectId);
    if (!project || project.type !== 'colorseeker' || !project.data.colors) return;
    showToast("Generating palette image...");

    const w = 1920, h = 1080;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    const barWidth = w / 5;
    project.data.colors.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * barWidth, 0, barWidth, h);

        // Add hex text
        ctx.fillStyle = hexToHsl(color).l > 50 ? '#000' : '#fff';
        ctx.font = 'bold 40px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(color.toUpperCase(), i * barWidth + barWidth / 2, h - 60);
    });

    const link = document.createElement('a');
    link.download = `palette_${project.name}.png`;
    link.href = c.toDataURL('image/png');
    link.click();
    showToast("Palette downloaded.");
}

if (colorseekerModeSelect) {
    colorseekerModeSelect.addEventListener('change', (e) => {
        const project = projects.find(p => p.id === activeProjectId);
        if (project && project.type === 'colorseeker') {
            project.data.mode = e.target.value;
            project.data.colors = generatePalette(project.data.baseColor, project.data.mode, project.data.lockedColors);
            saveToBrowser();
            renderColorSeeker(activeProjectId);
        }
    });
}
if (colorseekerBasePicker) {
    colorseekerBasePicker.addEventListener('input', (e) => {
        const project = projects.find(p => p.id === activeProjectId);
        if (project && project.type === 'colorseeker') {
            project.data.baseColor = e.target.value;
            project.data.colors = generatePalette(project.data.baseColor, project.data.mode, project.data.lockedColors);
            renderColorSeeker(activeProjectId);
        }
    });
    colorseekerBasePicker.addEventListener('change', () => {
        saveToBrowser();
    });
}

// --- STORYFLOW ---

function renderStoryflowView(project) {
    if (!storyflowContainer) return;
    const scrollArea = document.getElementById('storyflow-scroll-area');
    if (!scrollArea) return;
    
    scrollArea.innerHTML = '';
    const storyList = document.createElement('div');
    storyList.className = 'storyflow-list';

    updateStoryflowStats(project);

    project.data.frames.forEach((frame, index) => {
        storyList.appendChild(createStoryCard(project, frame, index));
    });

    storyList.addEventListener('dragover', (e) => {
        e.preventDefault();
        document.querySelectorAll('.story-card.drag-target').forEach(c => c.classList.remove('drag-target'));
        const dropTargetCard = e.target.closest('.story-card');
        if (dropTargetCard && !dropTargetCard.classList.contains('dragging')) {
            dropTargetCard.classList.add('drag-target');
        }
    });

    storyList.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || !storyList.contains(e.relatedTarget)) {
            document.querySelectorAll('.story-card.drag-target').forEach(c => c.classList.remove('drag-target'));
        }
    });

    storyList.addEventListener('drop', (e) => {
        e.preventDefault();
        const oldIndexStr = e.dataTransfer.getData('text/story-frame-index');
        if (!oldIndexStr) return;
        const oldIndex = parseInt(oldIndexStr, 10);
        const dropTargetCard = e.target.closest('.story-card');
        if (!dropTargetCard) return;

        const allCards = Array.from(storyList.querySelectorAll('.story-card'));
        const newIndex = allCards.indexOf(dropTargetCard);

        document.querySelectorAll('.story-card.drag-target').forEach(c => c.classList.remove('drag-target'));

        if (oldIndex !== newIndex) {
            const [movedFrame] = project.data.frames.splice(oldIndex, 1);
            project.data.frames.splice(newIndex, 0, movedFrame);
            renderStoryflowView(project);
            saveToBrowser();
        }
    });

    scrollArea.appendChild(storyList);

    const storyflowAddFrameBtn = document.getElementById('storyflow-add-frame-btn');
    if (storyflowAddFrameBtn) {
        storyflowAddFrameBtn.onclick = () => {
            project.data.frames.push({
                id: Date.now(),
                title: '',
                image: null,
                description: '',
                meta: { duration: '3s', camera: '', audio: '' }
            });
            renderStoryflowView(project);
            saveToBrowser();
            setTimeout(() => {
                storyflowContainer.scrollTo({ left: storyflowContainer.scrollWidth, behavior: 'smooth' });
            }, 50);
        };
    }

    const storyflowScrollStartBtn = document.getElementById('storyflow-scroll-start-btn');
    if (storyflowScrollStartBtn) {
        storyflowScrollStartBtn.onclick = () => {
            storyflowContainer.scrollTo({ left: 0, behavior: 'smooth' });
        };
    }

    const minimapTrack = document.getElementById('storyflow-minimap-track');
    const minimapViewport = document.getElementById('storyflow-minimap-viewport');
    const toggleTintBtn = document.getElementById('storyflow-toggle-tint-btn');
    
    if (toggleTintBtn && minimapTrack) {
        toggleTintBtn.onclick = () => {
            toggleTintBtn.classList.toggle('active');
            minimapTrack.classList.toggle('hide-tint');
        };
    }
    
    if (minimapTrack && minimapViewport) {
        minimapTrack.innerHTML = '';
        project.data.frames.forEach((frame, index) => {
            const miniframe = document.createElement('div');
            miniframe.className = 'minimap-frame';
            if (frame.image) {
                miniframe.style.backgroundImage = `url(${frame.image})`;
            }
            if (frame.meta && frame.meta.status === 'approved') {
                miniframe.classList.add('status-approved');
            } else if (frame.meta && frame.meta.status === 'wip') {
                miniframe.classList.add('status-wip');
            } else {
                miniframe.classList.add('status-not-started');
            }
            minimapTrack.appendChild(miniframe);
        });
        
        setTimeout(() => {
            if (typeof updateStoryflowMinimapViewport === 'function') {
                updateStoryflowMinimapViewport();
            }
        }, 50);
    }
}

function createStoryCard(project, frame, index) {
    const card = document.createElement('div');
    card.className = 'story-card';
    card.draggable = false;

    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/story-frame-index', index);
        setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        card.draggable = false;
        document.querySelectorAll('.story-card.drag-target').forEach(c => c.classList.remove('drag-target'));
    });

    card.addEventListener('contextmenu', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        e.preventDefault();
        document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
        sfContextMenu.dataset.frameIndex = index;
        showAndPositionMenu(sfContextMenu, e);
    });

    const header = document.createElement('div');
    header.className = 'story-card-header';
    const indexSpan = document.createElement('span');
    indexSpan.className = 'story-card-index';
    indexSpan.textContent = index + 1;
    
    const dragHandle = document.createElement('div');
    dragHandle.className = 'story-drag-handle';
    
    const dragIcon = document.createElement('iconify-icon');
    dragIcon.setAttribute('icon', 'lucide:grip-vertical');
    dragIcon.setAttribute('width', '16');
    dragIcon.setAttribute('height', '16');
    dragIcon.style.color = 'var(--text-color-light)';
    
    dragHandle.appendChild(dragIcon);
    
    dragHandle.addEventListener('mouseenter', () => card.draggable = true);
    dragHandle.addEventListener('mouseleave', () => card.draggable = false);

    header.append(indexSpan, dragHandle);

    const imageSlot = createStoryImageSlot(project, frame);

    const titleInput = document.createElement('input');
    titleInput.className = 'story-title-input';
    titleInput.placeholder = 'Frame Title...';
    titleInput.value = frame.title || '';
    titleInput.oninput = (e) => { frame.title = e.target.value; scheduleAutoSave(); updateStoryflowStats(project); };

    const descArea = document.createElement('textarea');
    descArea.className = 'story-desc-area';
    descArea.placeholder = 'Action / Dialogue / Notes...';
    descArea.value = frame.description || '';
    descArea.oninput = (e) => { frame.description = e.target.value; scheduleAutoSave(); updateStoryflowStats(project); };

    const metaGrid = document.createElement('div');
    metaGrid.className = 'story-meta-grid';

    const createMetaItem = (label, key) => {
        const item = document.createElement('div');
        item.className = 'story-meta-item';
        const lbl = document.createElement('label');
        lbl.className = 'story-meta-label';
        lbl.textContent = label;
        const input = document.createElement('input');
        input.className = 'story-meta-input';
        input.value = frame.meta[key] || '';
        input.oninput = (e) => { frame.meta[key] = e.target.value; scheduleAutoSave(); };
        item.append(lbl, input);
        return item;
    };

    // Duration Control
    const durationItem = document.createElement('div');
    durationItem.className = 'story-meta-item';
    const durationLbl = document.createElement('div');
    durationLbl.className = 'story-meta-label';
    durationLbl.textContent = 'Duration';
    
    const durationContainer = document.createElement('div');
    durationContainer.className = 'story-duration-container';
    
    const durationSlider = document.createElement('input');
    durationSlider.type = 'range';
    durationSlider.min = '1';
    durationSlider.max = '60';
    durationSlider.step = '1';
    durationSlider.className = 'story-duration-slider';
    
    // Prevent the parent card from catching pointer events and starting a drag
    durationSlider.addEventListener('pointerdown', (e) => e.stopPropagation());
    durationSlider.addEventListener('mousedown', (e) => e.stopPropagation());
    
    let currentDuration = Math.max(1, parseInt(frame.meta.duration) || 3);
    durationSlider.value = currentDuration;
    
    const durationValueDisplay = document.createElement('div');
    durationValueDisplay.className = 'story-duration-value';
    durationValueDisplay.textContent = currentDuration + 's';
    durationValueDisplay.title = "Double-click to type exact number";
    
    durationSlider.oninput = (e) => {
        durationValueDisplay.textContent = e.target.value + 's';
        frame.meta.duration = e.target.value + 's';
        scheduleAutoSave();
        updateStoryflowStats(project);
    };
    
    durationValueDisplay.ondblclick = () => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.value = Math.max(1, parseInt(frame.meta.duration) || 3);
        input.className = 'story-meta-input';
        input.style.width = '40px';
        input.style.padding = '0';
        input.style.textAlign = 'center';
        
        const finishEdit = () => {
            let val = Math.max(1, parseInt(input.value) || 1);
            frame.meta.duration = val + 's';
            durationSlider.value = val;
            durationValueDisplay.textContent = val + 's';
            durationContainer.replaceChild(durationValueDisplay, input);
            scheduleAutoSave();
            updateStoryflowStats(project);
        };
        
        input.onblur = finishEdit;
        input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
        
        durationContainer.replaceChild(input, durationValueDisplay);
        input.focus();
        input.select();
    };
    
    durationContainer.append(durationSlider, durationValueDisplay);
    durationItem.append(durationLbl, durationContainer);
    
    // Camera Control
    const cameraItem = document.createElement('div');
    cameraItem.className = 'story-meta-item';
    const cameraLbl = document.createElement('div');
    cameraLbl.className = 'story-meta-label';
    cameraLbl.textContent = 'Camera';
    
    const cameraSelect = document.createElement('select');
    cameraSelect.className = 'story-meta-input';
    
    const cameraOptions = [
        "Static", "Pan Left", "Pan Right", "Tilt Up", "Tilt Down", 
        "Zoom In", "Zoom Out", "Wide Shot", "Medium Shot", "Close Up", 
        "Extreme Close Up", "POV", "Tracking", "Crane/Boom"
    ];
    
    const emptyOpt = document.createElement('option');
    emptyOpt.value = "";
    emptyOpt.textContent = "None";
    cameraSelect.appendChild(emptyOpt);
    
    let foundMatch = false;
    cameraOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (frame.meta.camera === opt) {
            option.selected = true;
            foundMatch = true;
        }
        cameraSelect.appendChild(option);
    });
    
    if (frame.meta.camera && !foundMatch) {
        const customOption = document.createElement('option');
        customOption.value = frame.meta.camera;
        customOption.textContent = frame.meta.camera + ' (Custom)';
        customOption.selected = true;
        cameraSelect.appendChild(customOption);
    }
    
    cameraSelect.onchange = (e) => {
        frame.meta.camera = e.target.value;
        scheduleAutoSave();
    };
    
    cameraItem.append(cameraLbl, cameraSelect);

    metaGrid.append(durationItem, cameraItem);

    const actions = document.createElement('div');
    actions.className = 'story-card-actions';

    const togglesContainer = document.createElement('div');
    togglesContainer.style.display = 'flex';
    togglesContainer.style.gap = '0.5rem';
    togglesContainer.style.marginRight = 'auto';

    const btnApproved = document.createElement('button');
    btnApproved.textContent = 'Approved';
    btnApproved.className = 'story-toggle-btn ' + (frame.meta.status === 'approved' ? 'approved-active' : '');
    btnApproved.onclick = () => {
        frame.meta.status = frame.meta.status === 'approved' ? null : 'approved';
        scheduleAutoSave();
        renderStoryflowView(project);
    };

    const btnWip = document.createElement('button');
    btnWip.textContent = 'Wip';
    btnWip.className = 'story-toggle-btn ' + (frame.meta.status === 'wip' ? 'wip-active' : '');
    btnWip.onclick = () => {
        frame.meta.status = frame.meta.status === 'wip' ? null : 'wip';
        scheduleAutoSave();
        renderStoryflowView(project);
    };

    togglesContainer.append(btnApproved, btnWip);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'selection-tool-btn';
    deleteBtn.innerHTML = `<iconify-icon icon="lucide:trash-2" width="16" height="16" style="color:#ef4444"></iconify-icon>`;
    deleteBtn.onclick = () => {
        project.data.frames.splice(index, 1);
        renderStoryflowView(project);
        saveToBrowser();
    };
    
    actions.append(togglesContainer, deleteBtn);

    card.append(header, imageSlot, titleInput, descArea, metaGrid, actions);
    return card;
}

// --- STORYFLOW LIGHTBOX ---
(function () {
    const lightbox = document.getElementById('storyflow-lightbox');
    const lightboxImg = document.getElementById('storyflow-lightbox-img');
    const lightboxClose = document.getElementById('storyflow-lightbox-close');

    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('open');
        // Clear src after fade out to free memory
        setTimeout(() => { if (!lightbox.classList.contains('open')) lightboxImg.src = ''; }, 250);
    }

    window.openStoryLightbox = function (src) {
        if (!lightbox || !lightboxImg) return;
        lightboxImg.src = src;
        lightbox.classList.add('open');
    };
    window.closeStoryLightbox = closeLightbox;

    if (lightboxClose) lightboxClose.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

    // Click on backdrop (not on the image) closes
    if (lightbox) lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target === lightboxImg) closeLightbox();
    });

    // Escape key closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox && lightbox.classList.contains('open')) {
            e.stopPropagation();
            closeLightbox();
        }
    }, true);
})();

function createStoryImageSlot(project, frame) {
    const slot = document.createElement('div');
    slot.className = 'story-image-slot';

    if (frame.image) {
        const img = document.createElement('img');
        img.dataset.src = frame.image;
        img.className = 'lazy-load';
        imageLazyObserver.observe(img);
        slot.appendChild(img);
        slot.classList.add('has-image');

        // Click on the image itself opens the lightbox
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            window.openStoryLightbox(frame.image);
        });
    } else {
        slot.innerHTML = `<iconify-icon icon="lucide:plus" width="24" height="24" style="color:var(--text-color-light)"></iconify-icon>`;
    }

    const overlay = document.createElement('div');
    overlay.className = 'story-image-overlay';

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'story-image-overlay-btn';
    uploadBtn.title = 'Upload from Computer';
    uploadBtn.innerHTML = `<iconify-icon icon="lucide:upload" width="20" height="20"></iconify-icon>`;
    uploadBtn.onclick = (e) => {
        e.stopPropagation();
        promptImageInput.onchange = (e) => {
            const file = e.target.files[0];
            handleImageFile(file, (dataUrl) => {
                frame.image = dataUrl;
                renderStoryflowView(project);
                saveToBrowser();
            });
        };
        promptImageInput.click();
    };

    // Zoom / preview button (only shown when an image is loaded)
    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'story-image-overlay-btn';
    zoomBtn.title = 'Preview full size';
    zoomBtn.style.display = frame.image ? '' : 'none';
    zoomBtn.innerHTML = `<iconify-icon icon="lucide:zoom-in" width="20" height="20"></iconify-icon>`;
    zoomBtn.onclick = (e) => {
        e.stopPropagation();
        if (frame.image) window.openStoryLightbox(frame.image);
    };

    // Drag & Drop
    slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.add('drag-over');
    });

    slot.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        slot.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        handleImageFile(file, (dataUrl) => {
            frame.image = dataUrl;
            renderStoryflowView(project);
            saveToBrowser();
        });
    });

    const libraryBtn = document.createElement('button');
    libraryBtn.className = 'story-image-overlay-btn';
    libraryBtn.title = 'Select from Asset Library';
    libraryBtn.innerHTML = `<iconify-icon icon="lucide:library" width="20" height="20"></iconify-icon>`;
    libraryBtn.onclick = (e) => {
        e.stopPropagation();
        openAssetLibrary((selectedImage) => {
            frame.image = selectedImage;
            renderStoryflowView(project);
            saveToBrowser();
        });
    };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'story-image-overlay-btn';
    removeBtn.title = 'Remove Image';
    removeBtn.style.display = frame.image ? '' : 'none';
    removeBtn.innerHTML = `<iconify-icon icon="lucide:trash-2" width="20" height="20"></iconify-icon>`;
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        frame.image = null;
        renderStoryflowView(project);
        saveToBrowser();
    };

    overlay.append(uploadBtn, zoomBtn, libraryBtn, removeBtn);
    slot.appendChild(overlay);

    // Support paste on slot
    slot.addEventListener('mouseenter', () => {
        const handlePaste = (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (const item of items) {
                if (item.type.indexOf("image") !== -1) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (readEvent) => {
                        frame.image = readEvent.target.result;
                        renderStoryflowView(project);
                        saveToBrowser();
                    };
                    reader.readAsDataURL(blob);
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        slot.addEventListener('mouseleave', () => window.removeEventListener('paste', handlePaste), { once: true });
    });

    return slot;
}

function openAssetLibrary(callback) {
    if (!assetLibraryOverlay || !assetLibraryGrid) return;
    
    // Gather all images from global cache as base
    let allImages = new Set(Object.values(globalImageCache));
    const imagesByProject = {
        'all': new Set()
    };
    
    // Extract images embedded in projects
    projects.forEach(p => {
        const projectImages = new Set();
        if (p.type === 'moodinfinite' && p.data && p.data.items) {
            p.data.items.forEach(item => {
                if (item.type === 'image' && item.imageId && globalImageCache[item.imageId]) {
                    projectImages.add(globalImageCache[item.imageId]);
                }
            });
        } else if (p.type === 'storyflow' && p.data && p.data.frames) {
            p.data.frames.forEach(frame => {
                if (frame.image) projectImages.add(frame.image);
            });
        } else if (p.type === 'moodprompt' && p.data && p.data.prompts) {
            p.data.prompts.forEach(prompt => {
                if (prompt.image1) projectImages.add(prompt.image1);
                if (prompt.image2) projectImages.add(prompt.image2);
            });
        }
        
        if (projectImages.size > 0) {
            imagesByProject[p.id] = projectImages;
            projectImages.forEach(img => allImages.add(img));
        }
    });
    
    imagesByProject['all'] = allImages;
    
    if (assetLibraryFilter) {
        assetLibraryFilter.innerHTML = '<option value="all">All Assets</option>';
        projects.forEach(p => {
            if (imagesByProject[p.id] && imagesByProject[p.id].size > 0) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                assetLibraryFilter.appendChild(opt);
            }
        });
        
        assetLibraryFilter.onchange = (e) => {
            renderAssetGrid(imagesByProject[e.target.value], callback);
        };
    }

    renderAssetGrid(allImages, callback);
    assetLibraryOverlay.style.display = 'flex';
}

function renderAssetGrid(imagesSet, callback) {
    if (!assetLibraryGrid) return;
    
    assetLibraryGrid.innerHTML = '';
    const images = Array.from(imagesSet || []);

    if (images.length === 0) {
        assetLibraryEmpty.style.display = 'flex';
        assetLibraryGrid.style.display = 'none';
    } else {
        assetLibraryEmpty.style.display = 'none';
        assetLibraryGrid.style.display = 'grid';
        
        const fragment = document.createDocumentFragment();
        images.forEach(imgData => {
            const item = document.createElement('div');
            item.className = 'asset-library-item';
            
            const img = document.createElement('img');
            img.src = imgData;
            img.loading = 'lazy';
            
            item.appendChild(img);
            item.onclick = () => {
                callback(imgData);
                assetLibraryOverlay.style.display = 'none';
            };
            fragment.appendChild(item);
        });
        
        requestAnimationFrame(() => {
            assetLibraryGrid.appendChild(fragment);
        });
    }
}
function saveStoryflowAsPdf(project) {
    if (!project || !project.data || !project.data.frames || project.data.frames.length === 0) {
        showToast("StoryFlow is empty, nothing to export.", "error");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    showToast("Generating PDF...");

    project.data.frames.forEach((frame, index) => {
        if (index > 0) doc.addPage();

        // Background (optional, matches theme or clean white)
        // doc.setFillColor(255, 255, 255);
        // doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(40);
        doc.text(frame.title || `Frame ${index + 1}`, margin, 30);

        // Image Container
        let nextY = 40;
        if (frame.image) {
            try {
                // For storyboards, we typically want a consistent height for the image
                const imgHeight = 90; 
                doc.addImage(frame.image, 'JPEG', margin, nextY, contentWidth, imgHeight, undefined, 'FAST');
                nextY += imgHeight + 10;
            } catch (e) {
                console.error("Could not add image to PDF", e);
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text("[Image Error]", margin, nextY + 10);
                nextY += 20;
            }
        }

        // Meta Info (Duration / Camera)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(100);
        const metaText = `DURATION: ${frame.meta?.duration || 'N/A'}    |    CAMERA: ${frame.meta?.camera || 'N/A'}`;
        doc.text(metaText, margin, nextY);
        nextY += 8;

        // Divider
        doc.setDrawColor(200);
        doc.line(margin, nextY, pageWidth - margin, nextY);
        nextY += 10;

        // Description
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(60);
        const splitDescription = doc.splitTextToSize(frame.description || 'No description provided.', contentWidth);
        doc.text(splitDescription, margin, nextY);
    });

    const fileName = `${project.name || 'storyflow'}.pdf`;
    doc.save(fileName);
    showToast("StoryFlow exported as PDF.");
}

function exportMoodflowAsSheet(project) {
    if (!project || !project.data || !project.data.frames || project.data.frames.length === 0) {
        showToast('Moodflow is empty, nothing to export.', 'error');
        return;
    }

    showToast('Generating sheet export...');

    const frames = project.data.frames;
    const projectName = project.name || 'Moodflow Export';
    const exportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build table rows
    const rows = frames.map((frame, i) => {
        const frameNum = i + 1;
        const title = (frame.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const description = (frame.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        const duration = frame.meta?.duration || '—';
        const camera = (frame.meta?.camera || '—').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const imgCell = frame.image
            ? `<img src="${frame.image}" style="width:180px;height:120px;object-fit:cover;border-radius:4px;display:block;" />`
            : `<div style="width:180px;height:120px;background:#1a1a2e;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#555;font-size:11px;">No Image</div>`;

        const rowBg = i % 2 === 0 ? '#0f0f1a' : '#12121f';
        return `
        <tr style="background:${rowBg};">
            <td style="text-align:center;font-weight:700;font-size:1.1rem;color:#7c9cff;vertical-align:middle;padding:10px 8px;">${frameNum}</td>
            <td style="font-weight:600;font-size:0.9rem;color:#e2e8f0;vertical-align:middle;padding:10px 8px;min-width:120px;max-width:180px;word-break:break-word;">${title || '<span style="color:#444">Untitled</span>'}</td>
            <td style="padding:10px 8px;vertical-align:middle;">${imgCell}</td>
            <td style="font-size:0.82rem;color:#94a3b8;vertical-align:top;padding:10px 8px;min-width:200px;max-width:300px;line-height:1.6;">${description || '<span style="color:#444">—</span>'}</td>
            <td style="text-align:center;font-size:0.85rem;color:#64748b;vertical-align:middle;padding:10px 8px;white-space:nowrap;">${duration}</td>
            <td style="text-align:center;font-size:0.85rem;color:#64748b;vertical-align:middle;padding:10px 8px;white-space:nowrap;">${camera}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${projectName} — Moodflow Sheet</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background: #0d0d0d; color: #e2e8f0; padding: 2rem; }
  .sheet-header { display: flex; align-items: center; gap: 1.2rem; margin-bottom: 0.75rem; }
  .sheet-header h1 { font-size: 1.5rem; font-weight: 700; color: #fff; }
  .sheet-meta { font-size: 0.8rem; color: #64748b; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #1e2035; }
  table { border-collapse: collapse; width: 100%; min-width: 900px; }
  thead tr { background: #161628 !important; }
  th { padding: 10px 8px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #7c9cff; border-bottom: 2px solid #252545; text-align: left; white-space: nowrap; }
  th:first-child { text-align: center; }
  td { border-bottom: 1px solid #1a1a2e; vertical-align: middle; }
  tr:hover td { background: rgba(124, 156, 255, 0.04) !important; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; background: rgba(124,156,255,0.12); color: #7c9cff; }
  @media print { body { background: #fff; color: #000; } .sheet-header h1 { color: #000; } }
</style>
</head>
<body>
  <div class="sheet-header">
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" rx="6" fill="#7c9cff" fill-opacity="0.15"/><path d="M7 10h14M7 14h14M7 18h10" stroke="#7c9cff" stroke-width="1.8" stroke-linecap="round"/></svg>
    <h1>${projectName}</h1>
    <span class="badge">Moodflow</span>
  </div>
  <div class="sheet-meta">Exported on ${exportDate} &nbsp;·&nbsp; ${frames.length} frame${frames.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Moodinfinite</div>
  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th>Frame Title</th>
        <th>Visual</th>
        <th>Action / Notes</th>
        <th>Duration</th>
        <th>Camera</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9\-_. ]/gi, '_')}_sheet.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Sheet exported as "${a.download}".`);
}

// --- STORYFLOW MINIMAP LOGIC ---

function updateStoryflowMinimapViewport() {
    const storyflowContainer = document.getElementById('storyflow-scroll-area');
    const minimapTrack = document.getElementById('storyflow-minimap-track');
    const minimapViewport = document.getElementById('storyflow-minimap-viewport');
    
    if (!storyflowContainer || !minimapTrack || !minimapViewport || document.getElementById('storyflow-container').style.display === 'none') return;

    const scrollRatio = storyflowContainer.scrollLeft / (storyflowContainer.scrollWidth - storyflowContainer.clientWidth);
    const minimapWidth = minimapTrack.clientWidth;
    
    const viewportWidthRatio = storyflowContainer.clientWidth / storyflowContainer.scrollWidth;
    let viewportWidth = minimapWidth * viewportWidthRatio;
    
    viewportWidth = Math.max(20, Math.min(viewportWidth, minimapWidth));
    minimapViewport.style.width = `${viewportWidth}px`;

    let maxLeft = minimapWidth - viewportWidth;
    if (maxLeft < 0) maxLeft = 0;
    
    let viewportLeft = (isNaN(scrollRatio) || !isFinite(scrollRatio)) ? 0 : scrollRatio * maxLeft;
    minimapViewport.style.left = `${viewportLeft}px`;
}

function updateStoryflowStats(project) {
    const framesCountEl = document.getElementById('stats-frames-count');
    const totalDurEl = document.getElementById('stats-total-duration');
    const avgDurEl = document.getElementById('stats-avg-duration');
    const completionEl = document.getElementById('stats-completion');
    const approvedEl = document.getElementById('stats-approved');
    const wipEl = document.getElementById('stats-wip');
    const notStartedEl = document.getElementById('stats-not-started');
    
    if (!framesCountEl || !totalDurEl || !avgDurEl || !completionEl) return;

    let totalDuration = 0;
    let completedFrames = 0;
    let approvedFrames = 0;
    let wipFrames = 0;
    let notStartedFrames = 0;

    project.data.frames.forEach(frame => {
        totalDuration += parseInt(frame.meta?.duration) || 0;
        if (frame.image || (frame.title && frame.description)) completedFrames++;
        
        if (frame.meta?.status === 'approved') {
            approvedFrames++;
        } else if (frame.meta?.status === 'wip') {
            wipFrames++;
        } else {
            notStartedFrames++;
        }
    });
    
    const total = project.data.frames.length;
    framesCountEl.textContent = `${total} Frames`;
    totalDurEl.textContent = `${totalDuration}s Total`;
    avgDurEl.textContent = `${total > 0 ? (totalDuration / total).toFixed(1) : 0}s Avg`;
    completionEl.textContent = `${total > 0 ? Math.round((completedFrames / total) * 100) : 0}% Ready`;
    
    if (approvedEl && wipEl && notStartedEl) {
        approvedEl.textContent = `${total > 0 ? Math.round((approvedFrames / total) * 100) : 0}% Approved`;
        wipEl.textContent = `${total > 0 ? Math.round((wipFrames / total) * 100) : 0}% WIP`;
        notStartedEl.textContent = `${total > 0 ? Math.round((notStartedFrames / total) * 100) : 0}% Not Started`;
    }
}

let minimapFrameId = null;
function throttledUpdateStoryflowMinimap() {
    if (minimapFrameId) return;
    minimapFrameId = requestAnimationFrame(() => {
        updateStoryflowMinimapViewport();
        minimapFrameId = null;
    });
}

document.getElementById('storyflow-scroll-area').addEventListener('scroll', throttledUpdateStoryflowMinimap);
window.addEventListener('resize', throttledUpdateStoryflowMinimap);

document.getElementById('storyflow-scroll-area').addEventListener('wheel', (e) => {
    if (e.deltaY !== 0 && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('storyflow-scroll-area').scrollLeft += e.deltaY;
    }
}, { passive: false });

let isDraggingStoryflowMinimap = false;
let minimapStartX = 0;
let minimapStartScrollLeft = 0;

const storyflowMinimapViewportEl = document.getElementById('storyflow-minimap-viewport');
const storyflowContainerEl = document.getElementById('storyflow-scroll-area');
const storyflowMinimapTrackEl = document.getElementById('storyflow-minimap-track');
const storyflowMinimapTrackContainerEl = document.getElementById('storyflow-minimap-track-container');

if (storyflowMinimapViewportEl) {
    storyflowMinimapViewportEl.onmousedown = (e) => {
        isDraggingStoryflowMinimap = true;
        minimapStartX = e.clientX;
        minimapStartScrollLeft = storyflowContainerEl.scrollLeft;
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
    };
}

if (storyflowMinimapTrackContainerEl) {
    storyflowMinimapTrackContainerEl.addEventListener('mousedown', (e) => {
        if (e.target === storyflowMinimapViewportEl) return;
        
        const rect = storyflowMinimapTrackEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        const minimapWidth = storyflowMinimapTrackEl.clientWidth;
        const viewportWidth = parseFloat(storyflowMinimapViewportEl.style.width) || 20;
        
        let newViewportLeft = clickX - (viewportWidth / 2);
        
        const maxLeft = minimapWidth - viewportWidth;
        if (newViewportLeft < 0) newViewportLeft = 0;
        if (newViewportLeft > maxLeft) newViewportLeft = maxLeft;
        
        const scrollRatio = maxLeft > 0 ? newViewportLeft / maxLeft : 0;
        
        const maxScrollLeft = storyflowContainerEl.scrollWidth - storyflowContainerEl.clientWidth;
        storyflowContainerEl.scrollLeft = scrollRatio * maxScrollLeft;
        
        isDraggingStoryflowMinimap = true;
        minimapStartX = e.clientX;
        minimapStartScrollLeft = storyflowContainerEl.scrollLeft;
        document.body.style.cursor = 'grabbing';
        
        e.preventDefault();
    });
}

window.addEventListener('mousemove', (e) => {
    if (!isDraggingStoryflowMinimap) return;
    const deltaX = e.clientX - minimapStartX;
    const minimapWidth = storyflowMinimapTrackEl.clientWidth;
    const viewportWidth = parseFloat(storyflowMinimapViewportEl.style.width);
    const maxLeft = minimapWidth - viewportWidth;
    
    if (maxLeft > 0) {
        const scrollRatioDelta = deltaX / maxLeft;
        const maxScrollLeft = storyflowContainerEl.scrollWidth - storyflowContainerEl.clientWidth;
        storyflowContainerEl.scrollLeft = minimapStartScrollLeft + (scrollRatioDelta * maxScrollLeft);
    }
});

window.addEventListener('mouseup', () => {
    if (isDraggingStoryflowMinimap) {
        isDraggingStoryflowMinimap = false;
        document.body.style.cursor = '';
    }
});

function prepareAndPrint() {
    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject) {
        const nameEl = document.getElementById('print-project-name');
        const typeEl = document.getElementById('print-board-type');
        const dateEl = document.getElementById('print-date');
        
        if (nameEl) nameEl.textContent = activeProject.name || 'Untitled Board';
        if (typeEl) {
            typeEl.textContent = 
                activeProject.type === 'moodinfinite' ? 'Moodinfinite' : 
                activeProject.type === 'moodprompt' ? 'Moodprompt' : 
                activeProject.type === 'storyflow' ? 'Moodflow' : 
                activeProject.type === 'colorseeker' ? 'Moodtone' : 'Board';
        }
        if (dateEl) dateEl.textContent = new Date().toLocaleDateString();

        // Stamp the active tab type so CSS print rules only show the correct container
        document.body.dataset.printTab = activeProject.type;
    }

    // Clean up the attribute after the print dialog closes
    const cleanup = () => {
        delete document.body.dataset.printTab;
        window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    window.print();
}

// ─── Cloud Sync API Exports ──────────────────────────────────────────────────
// These expose internal app state/functions so cloud.js can access them cleanly.
window.__moodinfinite = {
    get projects()         { return projects; },
    get activeProjectId()  { return activeProjectId; },
    get globalImageCache() { return globalImageCache; },
    serializeItems,
    loadFileFromObject,
    showToast,
};
// Convenience aliases (cloud.js uses window.projects etc.)
Object.defineProperty(window, 'projects',         { get: () => projects,         configurable: true });
Object.defineProperty(window, 'activeProjectId',  { get: () => activeProjectId,  configurable: true });
Object.defineProperty(window, 'globalImageCache', { get: () => globalImageCache, configurable: true });
Object.defineProperty(window, 'globalVideoCache', { get: () => globalVideoCache, configurable: true });
Object.defineProperty(window, 'items',            { get: () => items,            configurable: true });
window.serializeItems     = serializeItems;
window.loadFileFromObject = loadFileFromObject;
window.showToast          = showToast;


// ══════════════════════════════════════════════════════════════════════════
// MOODGANTT — Date utilities & constants
// ══════════════════════════════════════════════════════════════════════════
const GANTT_MS_DAY = 86400000;
const GANTT_STATUS_COLORS = { done: '#22c55e', review: '#f59e0b', blocked: '#ef4444' };
const GANTT_ZOOM = {
    day:     { colWidth: 60, label: (d) => ({ top: d.toLocaleString('en',{month:'short'}), bottom: d.getDate() }) },
    week:    { colWidth: 100, label: (d) => ({ top: d.toLocaleString('en',{month:'short'}), bottom: 'W'+ganttWeekNum(d) }) },
    month:   { colWidth: 120, label: (d) => ({ top: String(d.getFullYear()), bottom: d.toLocaleString('en',{month:'short'}) }) },
    quarter: { colWidth: 200, label: (d) => ({ top: String(d.getFullYear()), bottom: 'Q'+(Math.floor(d.getMonth()/3)+1) }) }
};

function ganttParseDate(str) {
    if (!str) return ganttToday();
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d);
}
function ganttFormatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function ganttToday() { const t=new Date(); return new Date(t.getFullYear(),t.getMonth(),t.getDate()); }
function ganttAddDays(date, n) { const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function ganttAddMonths(date, n) { const d=new Date(date); d.setMonth(d.getMonth()+n); return d; }
function ganttWeekNum(date) {
    const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
    d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
    const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d-y)/GANTT_MS_DAY)+1)/7);
}
function ganttFloorWeek(date) {
    const d=new Date(date);
    const dow=d.getDay()||7;
    d.setDate(d.getDate()-(dow-1));
    return new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function ganttFloorMonth(date) { return new Date(date.getFullYear(),date.getMonth(),1); }
function ganttFloorQuarter(date) { return new Date(date.getFullYear(),Math.floor(date.getMonth()/3)*3,1); }

function ganttGetColumns(viewStartStr, viewEndStr, zoom) {
    const end = ganttParseDate(viewEndStr);
    const cols = [];
    let cur;
    if (zoom === 'day') {
        cur = ganttParseDate(viewStartStr);
        while (cur <= end) { cols.push(new Date(cur)); cur = ganttAddDays(cur, 1); }
    } else if (zoom === 'week') {
        cur = ganttFloorWeek(ganttParseDate(viewStartStr));
        while (cur <= end) { cols.push(new Date(cur)); cur = ganttAddDays(cur, 7); }
    } else if (zoom === 'month') {
        cur = ganttFloorMonth(ganttParseDate(viewStartStr));
        while (cur <= end) { cols.push(new Date(cur)); ganttAddMonths(cur, 1); cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); }
    } else { // quarter
        cur = ganttFloorQuarter(ganttParseDate(viewStartStr));
        while (cur <= end) { cols.push(new Date(cur)); cur = new Date(cur.getFullYear(), cur.getMonth()+3, 1); }
    }
    return cols;
}

function ganttColOffset(date, cols, colWidth) {
    const ts = date.getTime();
    let diffDays = 7;
    if (cols.length > 1) {
        const diffMs = cols[1].getTime() - cols[0].getTime();
        if (diffMs <= GANTT_MS_DAY * 1.5) diffDays = 1;
        else if (diffMs <= GANTT_MS_DAY * 7.5) diffDays = 7;
        else if (diffMs <= GANTT_MS_DAY * 32) diffDays = 30;
        else diffDays = 90;
    }
    
    for (let i = 0; i < cols.length; i++) {
        const colEnd = i < cols.length-1 ? cols[i+1] : ganttAddDays(cols[i], diffDays);
        if (ts < colEnd.getTime()) {
            const fraction = (ts - cols[i].getTime()) / (colEnd.getTime() - cols[i].getTime());
            return (i + fraction) * colWidth;
        }
    }
    return cols.length * colWidth;
}

function ganttPixelToDate(pixelLeft, cols, colWidth, zoom) {
    if (pixelLeft < 0) pixelLeft = 0;
    let currentLeft = 0;
    const diffDays = zoom === 'day' ? 1 : (zoom === 'week' ? 7 : (zoom === 'month' ? 30 : 90));
    for (let i = 0; i < cols.length; i++) {
        const nextDate = i < cols.length - 1 ? cols[i+1] : ganttAddDays(cols[i], diffDays);
        if (pixelLeft >= currentLeft && pixelLeft < currentLeft + colWidth) {
            const fraction = (pixelLeft - currentLeft) / colWidth;
            return new Date(cols[i].getTime() + fraction * (nextDate.getTime() - cols[i].getTime()));
        } else if (pixelLeft >= currentLeft + colWidth && i === cols.length - 1) {
            const fraction = (pixelLeft - currentLeft) / colWidth;
            return new Date(cols[i].getTime() + fraction * (nextDate.getTime() - cols[i].getTime()));
        }
        currentLeft += colWidth;
    }
    return cols[0] || ganttToday();
}

function ganttBarPixels(task, cols, colWidth) {
    const start = ganttParseDate(task.startDate);
    const end   = ganttAddDays(ganttParseDate(task.endDate), 1);
    const left  = Math.max(0, ganttColOffset(start, cols, colWidth));
    const right = ganttColOffset(end, cols, colWidth);
    return { left, width: Math.max(colWidth * 0.4, right - left - 2) };
}

function ganttStatusColor(task, groupColor) {
    return GANTT_STATUS_COLORS[task.status] || groupColor || 'var(--switch-bg-checked)';
}

// ══════════════════════════════════════════════════════════════════════════
// MOODGANTT — Render
// ══════════════════════════════════════════════════════════════════════════
let ganttDetailTarget = null; // { project, groupId, taskId }
let draggingGanttTaskInfo = null; // { group, task }
let draggingGanttGroupInfo = null; // { group }
let ganttContextTarget = null; // { projectId, groupId, taskId }

function renderGanttView(project) {
    if (!project || project.type !== 'moodgantt') return;

    const zoom     = project.data.zoomLevel || 'week';
    const zoomScale = project.data.zoomScale || 1;
    const colWidth = GANTT_ZOOM[zoom].colWidth * zoomScale;
    const cols     = ganttGetColumns(project.data.viewStartDate, project.data.viewEndDate, zoom);
    const totalW   = cols.length * colWidth;
    const today    = ganttToday();

    // Update zoom button states
    document.querySelectorAll('.gantt-zoom-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.zoom === zoom);
    });

    // ── Build date header ──
    const header = document.getElementById('gantt-date-header');
    if (!header) return;
    header.innerHTML = '';
    header.style.width = totalW + 'px';
    const labelCfg = GANTT_ZOOM[zoom].label;
    cols.forEach(colDate => {
        const isToday = (zoom === 'day' && colDate.getTime() === today.getTime()) || 
                        (zoom === 'week' && Math.abs(colDate.getTime() - ganttFloorWeek(today).getTime()) < GANTT_MS_DAY);
        const col = document.createElement('div');
        col.className = 'gantt-col-header' + (isToday ? ' is-today' : '');
        col.style.width = colWidth + 'px';
        const lbl = labelCfg(colDate);
        col.innerHTML = `<span class="gcol-top">${lbl.top}</span><span class="gcol-bottom">${lbl.bottom}</span>`;
        header.appendChild(col);
    });

    // ── Build sidebar + rows ──
    const sidebarBody = document.getElementById('gantt-sidebar-body');
    const rowsArea    = document.getElementById('gantt-rows-area');
    if (!sidebarBody || !rowsArea) return;
    sidebarBody.innerHTML = '';
    rowsArea.innerHTML = '';
    rowsArea.style.width = totalW + 'px';

    // Today line
    const todayOffset = ganttColOffset(today, cols, colWidth);
    if (todayOffset >= 0 && todayOffset <= totalW) {
        const todayLine = document.createElement('div');
        todayLine.className = 'gantt-today-line';
        todayLine.style.left = todayOffset + 'px';
        rowsArea.appendChild(todayLine);
    }

    const groups = project.data.groups || [];
    let totalTasks = 0, doneTasks = 0, blockedTasks = 0;
    let nextDeadline = null;

    groups.forEach(group => {
        let groupColor = group.color;
        if (!groupColor || groupColor.startsWith('var(')) {
            groupColor = accentColor || '#429eff';
        }

        // ── Sidebar group row ──
        const sRow = document.createElement('div');
        sRow.className = 'gantt-group-sidebar-row';
        sRow.dataset.groupId = group.id;
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'gantt-group-collapse-btn' + (group.collapsed ? ' collapsed' : '');
        collapseBtn.innerHTML = '<iconify-icon icon="lucide:chevron-down" width="14" height="14"></iconify-icon>';
        collapseBtn.title = group.collapsed ? 'Expand' : 'Collapse';
        collapseBtn.onclick = (e) => { e.stopPropagation(); group.collapsed = !group.collapsed; renderGanttView(project); scheduleAutoSave(); };
        
        const dot = document.createElement('input');
        dot.type = 'color';
        dot.className = 'gantt-group-color-dot';
        dot.value = groupColor;
        dot.title = 'Choose group color';
        dot.onclick = (e) => e.stopPropagation();
        dot.oninput = (e) => {
            const newColor = e.target.value;
            group.color = newColor;
            
            // Update summary bars in real-time
            const sumBars = rowsArea.querySelectorAll(`.gantt-group-summary-bar[data-group-id="${group.id}"]`);
            sumBars.forEach(bar => {
                bar.style.background = newColor;
            });
            
            // Update task status dots and task timeline bars in real-time
            (group.tasks || []).forEach(task => {
                if (!GANTT_STATUS_COLORS[task.status]) {
                    const sDot = sidebarBody.querySelector(`.gantt-task-status-dot[data-task-id="${task.id}"]`);
                    if (sDot) sDot.style.background = newColor;
                    
                    const tBar = rowsArea.querySelector(`.gantt-bar[data-task-id="${task.id}"]`);
                    if (tBar) {
                        tBar.style.background = newColor;
                        tBar.style.color = getContrastColor(newColor);
                    }
                }
            });
        };
        dot.onchange = (e) => {
            group.color = e.target.value;
            scheduleAutoSave();
            renderGanttView(project);
        };
        const lbl = document.createElement('span');
        lbl.className = 'gantt-group-label';
        lbl.textContent = group.name || 'Unnamed Group';
        lbl.title = 'Double-click to rename';
        lbl.ondblclick = (e) => { e.stopPropagation(); ganttStartGroupRename(lbl, group, project); };
        const delGroupBtn = document.createElement('button');
        delGroupBtn.className = 'gantt-group-del-btn';
        delGroupBtn.title = 'Delete Group';
        delGroupBtn.innerHTML = '<iconify-icon icon="lucide:trash-2" width="13" height="13"></iconify-icon>';
        delGroupBtn.onclick = (e) => {
            e.stopPropagation();
            
            const doDelete = () => {
                project.data.groups = project.data.groups.filter(g => g.id !== group.id);
                if (ganttDetailTarget && ganttDetailTarget.groupId === group.id) {
                    ganttCloseDetail();
                }
                renderGanttView(project);
                scheduleAutoSave();
            };

            if (e.shiftKey) {
                doDelete();
                return;
            }

            const overlay = document.getElementById('delete-group-modal-overlay');
            const title = document.getElementById('delete-modal-title');
            const desc = document.getElementById('delete-modal-desc');
            const confirmBtn = document.getElementById('confirm-delete-group-btn');
            const cancelBtn = document.getElementById('cancel-delete-group-btn');
            
            if (title) title.textContent = 'Delete Group?';
            if (desc) desc.textContent = 'Are you sure you want to delete this group and all its tasks?';
            
            overlay.style.display = 'flex';
            
            confirmBtn.onclick = () => {
                doDelete();
                overlay.style.display = 'none';
            };
            
            cancelBtn.onclick = () => {
                overlay.style.display = 'none';
            };
        };
        const addTaskBtn = document.createElement('button');
        addTaskBtn.className = 'gantt-group-add-task-btn';
        addTaskBtn.title = 'Add Task';
        addTaskBtn.innerHTML = '<iconify-icon icon="lucide:plus" width="13" height="13"></iconify-icon>';
        addTaskBtn.onclick = (e) => { e.stopPropagation(); ganttAddTask(project, group.id); };
        sRow.append(collapseBtn, dot, lbl, delGroupBtn, addTaskBtn);
        
        sRow.draggable = true;
        sRow.ondragstart = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            draggingGanttGroupInfo = { group };
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => sRow.style.opacity = '0.5', 0);
        };
        sRow.ondragend = (e) => {
            sRow.style.opacity = '1';
            draggingGanttGroupInfo = null;
            document.querySelectorAll('.gantt-group-sidebar-row.drag-over').forEach(el => el.classList.remove('drag-over'));
        };
        
        sRow.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            sRow.classList.add('drag-over');
        };
        sRow.ondragleave = () => {
            sRow.classList.remove('drag-over');
        };
        sRow.ondrop = (e) => {
            e.preventDefault();
            sRow.classList.remove('drag-over');
            
            if (draggingGanttTaskInfo) {
                const srcGroup = draggingGanttTaskInfo.group;
                const srcTask = draggingGanttTaskInfo.task;
                
                srcGroup.tasks = srcGroup.tasks.filter(t => t.id !== srcTask.id);
                if (!group.tasks) group.tasks = [];
                group.tasks.push(srcTask);
                
                renderGanttView(project);
                scheduleAutoSave();
            } else if (draggingGanttGroupInfo) {
                const srcGroup = draggingGanttGroupInfo.group;
                if (srcGroup.id === group.id) return;
                
                const srcIdx = project.data.groups.findIndex(g => g.id === srcGroup.id);
                const targetIdx = project.data.groups.findIndex(g => g.id === group.id);
                
                if (srcIdx !== -1 && targetIdx !== -1) {
                    project.data.groups.splice(srcIdx, 1);
                    project.data.groups.splice(targetIdx, 0, srcGroup);
                    
                    renderGanttView(project);
                    scheduleAutoSave();
                }
            }
        };
        
        sidebarBody.appendChild(sRow);

        // ── Timeline group track ──
        const gTrack = document.createElement('div');
        gTrack.className = 'gantt-group-track';
        // Group summary bar (min/max of task dates)
        if (group.tasks && group.tasks.length > 0) {
            const starts = group.tasks.map(t => ganttParseDate(t.startDate).getTime());
            const ends   = group.tasks.map(t => ganttParseDate(t.endDate).getTime());
            const gStart = new Date(Math.min(...starts));
            const gEnd   = ganttAddDays(new Date(Math.max(...ends)), 1);
            const gl = ganttColOffset(gStart, cols, colWidth);
            const gr = ganttColOffset(gEnd, cols, colWidth);
            if (gr > gl) {
                const sumBar = document.createElement('div');
                sumBar.className = 'gantt-group-summary-bar';
                sumBar.dataset.groupId = group.id;
                sumBar.style.left  = gl + 'px';
                sumBar.style.width = (gr - gl - 2) + 'px';
                sumBar.style.background = groupColor;
                gTrack.appendChild(sumBar);
            }
        }
        rowsArea.appendChild(gTrack);

        // ── Tasks ──
        if (!group.collapsed) {
            (group.tasks || []).forEach(task => {
                totalTasks++;
                if (task.status === 'done') doneTasks++;
                if (task.status === 'blocked') blockedTasks++;
                const taskEnd = ganttParseDate(task.endDate);
                if (taskEnd >= today && (!nextDeadline || taskEnd < nextDeadline)) nextDeadline = taskEnd;

                // Sidebar task row
                const tSide = document.createElement('div');
                tSide.className = 'gantt-task-sidebar-row';
                const statusDot = document.createElement('div');
                statusDot.className = 'gantt-task-status-dot';
                statusDot.style.background = ganttStatusColor(task, groupColor);
                statusDot.dataset.groupId = group.id;
                statusDot.dataset.taskId = task.id;
                const tLbl = document.createElement('span');
                tLbl.className = 'gantt-task-label';
                tLbl.textContent = task.name || 'Untitled';
                
                const delBtn = document.createElement('button');
                delBtn.className = 'gantt-task-del-btn';
                delBtn.innerHTML = '<iconify-icon icon="lucide:trash-2" width="14" height="14"></iconify-icon>';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    
                    const doDelete = () => {
                        group.tasks = group.tasks.filter(t => t.id !== task.id);
                        if (ganttDetailTarget && ganttDetailTarget.taskId === task.id) {
                            ganttCloseDetail();
                        }
                        renderGanttView(project);
                        scheduleAutoSave();
                    };

                    if (e.shiftKey) {
                        doDelete();
                        return;
                    }

                    const overlay = document.getElementById('delete-group-modal-overlay');
                    const title = document.getElementById('delete-modal-title');
                    const desc = document.getElementById('delete-modal-desc');
                    const confirmBtn = document.getElementById('confirm-delete-group-btn');
                    const cancelBtn = document.getElementById('cancel-delete-group-btn');
                    
                    if (title) title.textContent = 'Delete Task?';
                    if (desc) desc.textContent = 'Are you sure you want to delete this task?';
                    
                    overlay.style.display = 'flex';
                    
                    confirmBtn.onclick = () => {
                        doDelete();
                        overlay.style.display = 'none';
                    };
                    
                    cancelBtn.onclick = () => {
                        overlay.style.display = 'none';
                    };
                };
                
                tSide.draggable = true;
                tSide.oncontextmenu = (e) => {
                    e.preventDefault();
                    ganttContextTarget = { projectId: project.id, groupId: group.id, taskId: task.id };
                    if (ganttContextMenu) {
                        document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
                        ganttContextMenu.style.display = 'block';
                        ganttContextMenu.style.left = e.pageX + 'px';
                        ganttContextMenu.style.top = e.pageY + 'px';
                    }
                };
                tSide.ondragstart = (e) => {
                    draggingGanttTaskInfo = { group, task };
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => tSide.style.opacity = '0.5', 0);
                };
                
                tSide.ondragend = (e) => {
                    tSide.style.opacity = '1';
                    draggingGanttTaskInfo = null;
                    document.querySelectorAll('.gantt-task-sidebar-row.drag-over, .gantt-group-sidebar-row.drag-over').forEach(el => el.classList.remove('drag-over'));
                };
                
                tSide.ondragover = (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // prevent group ondragover
                    e.dataTransfer.dropEffect = 'move';
                    tSide.classList.add('drag-over');
                };
                
                tSide.ondragleave = () => {
                    tSide.classList.remove('drag-over');
                };
                
                tSide.ondrop = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    tSide.classList.remove('drag-over');
                    if (!draggingGanttTaskInfo) return;
                    
                    const srcGroup = draggingGanttTaskInfo.group;
                    const srcTask = draggingGanttTaskInfo.task;
                    
                    if (srcTask.id === task.id) return;
                    
                    srcGroup.tasks = srcGroup.tasks.filter(t => t.id !== srcTask.id);
                    if (!group.tasks) group.tasks = [];
                    const targetIdx = group.tasks.findIndex(t => t.id === task.id);
                    
                    if (targetIdx !== -1) {
                        group.tasks.splice(targetIdx, 0, srcTask);
                    } else {
                        group.tasks.push(srcTask);
                    }
                    
                    renderGanttView(project);
                    scheduleAutoSave();
                };
                
                tSide.append(statusDot, tLbl, delBtn);
                tSide.onclick = () => ganttOpenDetail(project, group.id, task.id);
                sidebarBody.appendChild(tSide);

                // Timeline task track + bar
                const tTrack = document.createElement('div');
                tTrack.className = 'gantt-task-track';
                const { left, width } = ganttBarPixels(task, cols, colWidth);
                const barColor = ganttStatusColor(task, groupColor);
                const textColor = getContrastColor(barColor.startsWith('#') ? barColor : '#429eff');
                const bar = document.createElement('div');
                bar.className = 'gantt-bar';
                bar.style.left   = left + 'px';
                bar.style.width  = width + 'px';
                bar.style.background = barColor;
                bar.style.color  = textColor;
                bar.dataset.groupId = group.id;
                bar.dataset.taskId = task.id;
                if (task.progress > 0) {
                    const prog = document.createElement('div');
                    prog.className = 'gantt-bar-progress';
                    prog.style.width = task.progress + '%';
                    bar.appendChild(prog);
                }
                const barLbl = document.createElement('span');
                barLbl.className = 'gantt-bar-label';
                barLbl.textContent = task.name || 'Untitled';
                bar.appendChild(barLbl);
                
                if (task.assignee) {
                    const assigneeSpan = document.createElement('span');
                    assigneeSpan.className = 'gantt-bar-assignee';
                    assigneeSpan.textContent = task.assignee;
                    assigneeSpan.style.color = textColor;
                    bar.appendChild(assigneeSpan);
                }

                bar.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    ganttContextTarget = { projectId: project.id, groupId: group.id, taskId: task.id };
                    if (ganttContextMenu) {
                        document.querySelectorAll('.context-menu').forEach(m => m.style.display = 'none');
                        ganttContextMenu.style.display = 'block';
                        ganttContextMenu.style.left = e.pageX + 'px';
                        ganttContextMenu.style.top = e.pageY + 'px';
                    }
                };

                // Handles for resizing
                const leftHandle = document.createElement('div');
                leftHandle.className = 'gantt-bar-handle-left';
                const rightHandle = document.createElement('div');
                rightHandle.className = 'gantt-bar-handle-right';
                bar.append(leftHandle, rightHandle);

                const setupHandleDrag = (handle, isLeft) => {
                    handle.onmousedown = (e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        let isDraggingHandle = true;
                        const startX = e.clientX;
                        const initialLeft = left;
                        const initialWidth = width;
                        
                        const mousemove = (ev) => {
                            if (!isDraggingHandle) return;
                            const delta = ev.clientX - startX;
                            if (isLeft) {
                                const newWidth = Math.max(10, initialWidth - delta);
                                const newLeft = initialLeft + (initialWidth - newWidth);
                                bar.style.left = newLeft + 'px';
                                bar.style.width = newWidth + 'px';
                            } else {
                                const newWidth = Math.max(10, initialWidth + delta);
                                bar.style.width = newWidth + 'px';
                            }
                        };
                        
                        const mouseup = (ev) => {
                            if (!isDraggingHandle) return;
                            isDraggingHandle = false;
                            document.removeEventListener('mousemove', mousemove);
                            document.removeEventListener('mouseup', mouseup);
                            
                            const deltaX = ev.clientX - startX;
                            if (isLeft) {
                                const newLeft = initialLeft + deltaX;
                                const foundDate = ganttPixelToDate(newLeft, cols, colWidth, zoom);
                                task.startDate = ganttFormatDate(foundDate);
                                if (ganttParseDate(task.startDate) > ganttParseDate(task.endDate)) task.startDate = task.endDate;
                            } else {
                                const newRight = initialLeft + initialWidth + deltaX;
                                const foundDate = ganttPixelToDate(newRight, cols, colWidth, zoom);
                                task.endDate = ganttFormatDate(ganttAddDays(foundDate, -1));
                                if (ganttParseDate(task.endDate) < ganttParseDate(task.startDate)) task.endDate = task.startDate;
                            }
                            
                            renderGanttView(project);
                            scheduleAutoSave();
                        };
                        document.addEventListener('mousemove', mousemove);
                        document.addEventListener('mouseup', mouseup);
                    };
                };
                
                setupHandleDrag(leftHandle, true);
                setupHandleDrag(rightHandle, false);
                
                // Task Dragging Logic
                let isDraggingTask = false;
                let startLeft = 0;
                let startX = 0;
                bar.onmousedown = (e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    isDraggingTask = true;
                    startLeft = left;
                    startX = e.clientX;
                    
                    const mousemove = (ev) => {
                        if (!isDraggingTask) return;
                        const delta = ev.clientX - startX;
                        bar.style.left = Math.max(0, startLeft + delta) + 'px';
                    };
                    const mouseup = (ev) => {
                        if (!isDraggingTask) return;
                        isDraggingTask = false;
                        document.removeEventListener('mousemove', mousemove);
                        document.removeEventListener('mouseup', mouseup);
                        
                        const deltaLeft = ev.clientX - startX;
                        if (Math.abs(deltaLeft) < 5) {
                            ganttOpenDetail(project, group.id, task.id);
                            bar.style.left = left + 'px';
                            return;
                        }
                        
                        // Calculate new date
                        const newLeft = Math.max(0, startLeft + deltaLeft);
                        const foundDate = ganttPixelToDate(newLeft, cols, colWidth, zoom);
                        
                        const msShift = foundDate.getTime() - ganttParseDate(task.startDate).getTime();
                        const daysShift = Math.round(msShift / GANTT_MS_DAY);
                        
                        task.startDate = ganttFormatDate(ganttAddDays(ganttParseDate(task.startDate), daysShift));
                        task.endDate = ganttFormatDate(ganttAddDays(ganttParseDate(task.endDate), daysShift));
                        
                        renderGanttView(project);
                        scheduleAutoSave();
                    };
                    document.addEventListener('mousemove', mousemove);
                    document.addEventListener('mouseup', mouseup);
                };
                
                tTrack.appendChild(bar);
                rowsArea.appendChild(tTrack);
            });
        }
    });

    // Update stats bar
    const statGroups = document.getElementById('gantt-stat-groups');
    const statTasks  = document.getElementById('gantt-stat-tasks');
    const donePct    = document.getElementById('gantt-done-pct');
    const blockedPct = document.getElementById('gantt-blocked-pct');
    const nextDl     = document.getElementById('gantt-next-deadline');
    if (statGroups) statGroups.querySelector('span').textContent = groups.length + ' Group' + (groups.length !== 1 ? 's' : '');
    if (statTasks)  statTasks.querySelector('span').textContent  = totalTasks + ' Task' + (totalTasks !== 1 ? 's' : '');
    if (donePct)    donePct.textContent   = totalTasks ? Math.round(doneTasks/totalTasks*100)+'% Done' : '0% Done';
    if (blockedPct) blockedPct.textContent = totalTasks ? Math.round(blockedTasks/totalTasks*100)+'% Blocked' : '0% Blocked';
    if (nextDl)     nextDl.textContent    = nextDeadline ? 'Next: '+nextDeadline.toLocaleDateString('en',{month:'short',day:'numeric'}) : 'No upcoming deadlines';

    // Scroll sync: sidebar mirrors timeline vertical scroll
    const timeline = document.getElementById('gantt-timeline');
    if (timeline && !timeline._scrollListenerAttached) {
        timeline._scrollListenerAttached = true;
        timeline.addEventListener('scroll', () => {
            if (sidebarBody) sidebarBody.scrollTop = timeline.scrollTop;
        });
    }
}

// ══════════════════════════════════════════════════════════════════════════
// MOODGANTT — Interactions
// ══════════════════════════════════════════════════════════════════════════
function ganttAddGroup(project) {
    const id = Date.now();
    const colors = ['#429eff','#a78bfa','#34d399','#f59e0b','#f87171','#60a5fa','#fb923c'];
    const color  = colors[(project.data.groups.length) % colors.length];
    project.data.groups.push({ id, name: 'New Group', color, collapsed: false, tasks: [] });
    renderGanttView(project);
    scheduleAutoSave();
    showToast('Group added.');
}

function ganttAddTask(project, groupId) {
    const group = project.data.groups.find(g => g.id === groupId);
    if (!group) return;
    const today    = ganttFormatDate(ganttToday());
    const nextWeek = ganttFormatDate(ganttAddDays(ganttToday(), 7));
    const id = Date.now();
    group.tasks.push({ id, name: 'New Task', startDate: today, endDate: nextWeek, progress: 0, status: '', assignee: '', notes: '' });
    renderGanttView(project);
    scheduleAutoSave();
    showToast('Task added.');
}

function ganttStartGroupRename(labelEl, group, project) {
    const input = document.createElement('input');
    input.className = 'gantt-group-rename-input';
    input.value = group.name;
    labelEl.replaceWith(input);
    input.focus(); input.select();
    const finish = () => {
        const newName = input.value.trim() || group.name;
        group.name = newName;
        input.replaceWith(labelEl);
        labelEl.textContent = newName;
        scheduleAutoSave();
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = group.name; input.blur(); } });
}

function ganttOpenDetail(project, groupId, taskId) {
    const group = project.data.groups.find(g => g.id === groupId);
    const task  = group && group.tasks.find(t => t.id === taskId);
    if (!task) return;

    ganttDetailTarget = { project, groupId, taskId };

    const panel = document.getElementById('gantt-detail-panel');
    document.getElementById('gantt-detail-name').value      = task.name || '';
    document.getElementById('gantt-detail-start').value     = task.startDate || '';
    document.getElementById('gantt-detail-end').value       = task.endDate || '';
    document.getElementById('gantt-detail-progress').value  = task.progress || 0;
    document.getElementById('gantt-detail-progress-val').textContent = (task.progress || 0) + '%';
    document.getElementById('gantt-detail-status').value    = task.status || '';
    
    // Populate assignees
    const assigneeSelect = document.getElementById('gantt-detail-assignee');
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
    const workers = project.data.workers || [];
    workers.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = w;
        assigneeSelect.appendChild(opt);
    });
    assigneeSelect.value = task.assignee || '';
    
    document.getElementById('gantt-detail-notes').value     = task.notes || '';

    // Attachment preview
    const preview = document.getElementById('gantt-detail-attachment-preview');
    const clearBtn = document.getElementById('gantt-clear-img-btn');
    let imgSrc = task.attachment;
    if (task.attachment && globalImageCache[task.attachment]) {
        imgSrc = globalImageCache[task.attachment];
    }
    
    if (imgSrc) {
        preview.innerHTML = `<img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: cover;">`;
        clearBtn.style.display = 'block';
    } else {
        preview.innerHTML = '<iconify-icon icon="lucide:image" width="16" height="16" style="color: var(--text-color-light);"></iconify-icon>';
        clearBtn.style.display = 'none';
    }

    panel.classList.add('open');
}

function ganttCloseDetail() {
    const panel = document.getElementById('gantt-detail-panel');
    if (panel) panel.classList.remove('open');
    ganttDetailTarget = null;
}

function ganttSyncDetailToTask() {
    if (!ganttDetailTarget) return;
    const { project, groupId, taskId } = ganttDetailTarget;
    const group = project.data.groups.find(g => g.id === groupId);
    const task  = group && group.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.name      = document.getElementById('gantt-detail-name').value;
    task.startDate = document.getElementById('gantt-detail-start').value;
    task.endDate   = document.getElementById('gantt-detail-end').value;
    task.progress  = parseInt(document.getElementById('gantt-detail-progress').value) || 0;
    task.status    = document.getElementById('gantt-detail-status').value;
    task.assignee  = document.getElementById('gantt-detail-assignee').value;
    task.notes     = document.getElementById('gantt-detail-notes').value;
    renderGanttView(project);
    scheduleAutoSave();
}

function ganttDeleteTask(e) {
    if (!ganttDetailTarget) return;
    const { project, groupId, taskId } = ganttDetailTarget;
    const group = project.data.groups.find(g => g.id === groupId);
    if (!group) return;

    const doDelete = () => {
        group.tasks = group.tasks.filter(t => t.id !== taskId);
        ganttCloseDetail();
        renderGanttView(project);
        scheduleAutoSave();
        showToast('Task deleted.');
    };

    if (e && e.shiftKey) {
        doDelete();
        return;
    }

    const overlay = document.getElementById('delete-group-modal-overlay');
    const title = document.getElementById('delete-modal-title');
    const desc = document.getElementById('delete-modal-desc');
    const confirmBtn = document.getElementById('confirm-delete-group-btn');
    const cancelBtn = document.getElementById('cancel-delete-group-btn');
    
    if (title) title.textContent = 'Delete Task?';
    if (desc) desc.textContent = 'Are you sure you want to delete this task?';
    
    overlay.style.display = 'flex';
    
    confirmBtn.onclick = () => {
        doDelete();
        overlay.style.display = 'none';
    };
    
    cancelBtn.onclick = () => {
        overlay.style.display = 'none';
    };
}

function ganttShiftView(project, direction) {
    const zoom = project.data.zoomLevel || 'week';
    const steps = { day: 7, week: 4, month: 3, quarter: 2 };
    const n = steps[zoom] * direction;
    if (zoom === 'day' || zoom === 'week') {
        const days = zoom === 'day' ? n : n * 7;
        project.data.viewStartDate = ganttFormatDate(ganttAddDays(ganttParseDate(project.data.viewStartDate), days));
        project.data.viewEndDate   = ganttFormatDate(ganttAddDays(ganttParseDate(project.data.viewEndDate),   days));
    } else {
        project.data.viewStartDate = ganttFormatDate(ganttAddMonths(ganttParseDate(project.data.viewStartDate), n));
        project.data.viewEndDate   = ganttFormatDate(ganttAddMonths(ganttParseDate(project.data.viewEndDate),   n));
    }
    renderGanttView(project);
    scheduleAutoSave();
}

function ganttJumpToToday(project) {
    const today  = ganttToday();
    const zoom   = project.data.zoomLevel || 'week';
    const months = { week: 3, month: 6, quarter: 12 };
    if (zoom === 'day') {
        project.data.viewStartDate = ganttFormatDate(ganttAddDays(today, -7));
        project.data.viewEndDate   = ganttFormatDate(ganttAddDays(today,  14));
    } else {
        const half   = months[zoom];
        project.data.viewStartDate = ganttFormatDate(ganttAddMonths(today, -half/2));
        project.data.viewEndDate   = ganttFormatDate(ganttAddMonths(today,  half));
    }
    renderGanttView(project);
    // Scroll to today
    setTimeout(() => {
        const cols     = ganttGetColumns(project.data.viewStartDate, project.data.viewEndDate, zoom);
        const colWidth = GANTT_ZOOM[zoom].colWidth;
        const offset   = ganttColOffset(today, cols, colWidth);
        const timeline = document.getElementById('gantt-timeline');
        if (timeline) timeline.scrollLeft = Math.max(0, offset - timeline.clientWidth / 2);
    }, 50);
}

// ══════════════════════════════════════════════════════════════════════════
// MOODGANTT — Wire up event listeners (called once on init)
// ══════════════════════════════════════════════════════════════════════════
function setupGanttListeners() {
    const addMoodganttBtn = document.getElementById('add-moodgantt-tab-btn');
    if (addMoodganttBtn) addMoodganttBtn.addEventListener('click', () => createNewProject('moodgantt'));

    const addMoodlistBtn = document.getElementById('add-moodlist-tab-btn');
    if (addMoodlistBtn) addMoodlistBtn.addEventListener('click', () => createNewProject('moodlist'));

    document.getElementById('gantt-add-group-btn')?.addEventListener('click', () => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (proj && proj.type === 'moodgantt') ganttAddGroup(proj);
    });

    document.getElementById('gantt-today-btn')?.addEventListener('click', () => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (proj && proj.type === 'moodgantt') ganttJumpToToday(proj);
    });

    document.getElementById('gantt-prev-btn')?.addEventListener('click', () => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (proj && proj.type === 'moodgantt') ganttShiftView(proj, -1);
    });

    document.getElementById('gantt-next-btn')?.addEventListener('click', () => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (proj && proj.type === 'moodgantt') ganttShiftView(proj, 1);
    });

    document.querySelectorAll('.gantt-zoom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const proj = projects.find(p => p.id === activeProjectId);
            if (!proj || proj.type !== 'moodgantt') return;
            proj.data.zoomLevel = btn.dataset.zoom;
            renderGanttView(proj);
            scheduleAutoSave();
        });
    });

    document.getElementById('gantt-detail-close')?.addEventListener('click', ganttCloseDetail);

    // Sync detail fields live
    ['gantt-detail-name','gantt-detail-start','gantt-detail-end','gantt-detail-status','gantt-detail-assignee','gantt-detail-notes'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', ganttSyncDetailToTask);
        document.getElementById(id)?.addEventListener('change', ganttSyncDetailToTask);
    });

    document.getElementById('gantt-detail-progress')?.addEventListener('input', (e) => {
        const val = document.getElementById('gantt-detail-progress-val');
        if (val) val.textContent = e.target.value + '%';
        ganttSyncDetailToTask();
    });

    document.getElementById('gantt-detail-delete')?.addEventListener('click', ganttDeleteTask);

    document.getElementById('gantt-attach-img-btn')?.addEventListener('click', () => {
        openAssetLibrary((imgData) => {
            if (!ganttDetailTarget) return;
            const { project, groupId, taskId } = ganttDetailTarget;
            const group = project.data.groups.find(g => g.id === groupId);
            const task  = group && group.tasks.find(t => t.id === taskId);
            if (!task) return;
            
            const imageId = Object.keys(globalImageCache).find(k => globalImageCache[k] === imgData);
            task.attachment = imageId || imgData;
            
            ganttOpenDetail(project, groupId, taskId);
            scheduleAutoSave();
        });
    });

    document.getElementById('gantt-clear-img-btn')?.addEventListener('click', () => {
        if (!ganttDetailTarget) return;
        const { project, groupId, taskId } = ganttDetailTarget;
        const group = project.data.groups.find(g => g.id === groupId);
        const task  = group && group.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        delete task.attachment;
        ganttOpenDetail(project, groupId, taskId);
        scheduleAutoSave();
    });

    document.getElementById('gantt-copy-link-btn')?.addEventListener('click', () => {
        if (!ganttContextTarget) return;
        const center = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 });
        clipboard = [{
            type: 'text',
            x: center.x,
            y: center.y,
            width: 250,
            height: 150,
            title: '',
            text: '',
            ganttLink: { ...ganttContextTarget },
            bgColor: '#ffffff',
            opacity: 1,
            rotation: 0
        }];
        internalClipboardTimestamp = Date.now();
        showToast("Task link copied! Paste in any canvas board.");
        if (ganttContextMenu) ganttContextMenu.style.display = 'none';
    });

    // Zoom slider and buttons logic
    const zoomSlider = document.getElementById('gantt-zoom-slider');
    const zoomInBtn = document.getElementById('gantt-zoom-in-btn');
    const zoomOutBtn = document.getElementById('gantt-zoom-out-btn');
    
    if (zoomSlider) {
        zoomSlider.addEventListener('input', (e) => {
            const proj = projects.find(p => p.id === activeProjectId);
            if (!proj || proj.type !== 'moodgantt') return;
            proj.data.zoomScale = parseInt(e.target.value) / 100;
            renderGanttView(proj);
        });
        zoomSlider.addEventListener('change', scheduleAutoSave);
    }
    
    const updateZoomFromWheelOrBtn = (delta) => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (!proj || proj.type !== 'moodgantt') return;
        let scale = proj.data.zoomScale || 1;
        scale += delta;
        scale = Math.max(0.5, Math.min(2.0, scale)); // Clamp to 50% - 200%
        proj.data.zoomScale = scale;
        if (zoomSlider) zoomSlider.value = Math.round(scale * 100);
        renderGanttView(proj);
        scheduleAutoSave();
    };

    if (zoomInBtn) zoomInBtn.addEventListener('click', () => updateZoomFromWheelOrBtn(0.1));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => updateZoomFromWheelOrBtn(-0.1));

    // Mouse wheel to zoom and pan on timeline
    const timeline = document.getElementById('gantt-timeline');
    const sidebarBody = document.getElementById('gantt-sidebar-body');
    if (timeline) {
        timeline.addEventListener('wheel', (e) => {
            // Zoom if no shift key is pressed, or if ctrl key is pressed
            if (e.deltaY !== 0 && !e.shiftKey) {
                e.preventDefault();
                updateZoomFromWheelOrBtn(e.deltaY > 0 ? -0.1 : 0.1);
            }
        }, { passive: false });

        if (sidebarBody) {
            sidebarBody.addEventListener('wheel', (e) => {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    timeline.scrollTop += e.deltaY;
                }
            }, { passive: false });
        }
        
        let isPanning = false;
        let panStartX = 0;
        let panStartY = 0;
        let panScrollLeft = 0;
        let panScrollTop = 0;
        let panTarget = null;
        
        const startPanning = (e, target) => {
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) { // Middle click or shift+left click
                e.preventDefault();
                isPanning = true;
                panTarget = target;
                panStartX = e.clientX;
                panStartY = e.clientY;
                panScrollLeft = timeline.scrollLeft;
                panScrollTop = timeline.scrollTop;
                if (target === 'timeline') timeline.style.cursor = 'grabbing';
                else if (sidebarBody) sidebarBody.style.cursor = 'grabbing';
            }
        };

        timeline.addEventListener('mousedown', (e) => startPanning(e, 'timeline'));
        if (sidebarBody) {
            sidebarBody.addEventListener('mousedown', (e) => startPanning(e, 'sidebar'));
        }
        
        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                const deltaX = e.clientX - panStartX;
                const deltaY = e.clientY - panStartY;
                if (panTarget === 'timeline') {
                    timeline.scrollLeft = panScrollLeft - deltaX;
                }
                timeline.scrollTop = panScrollTop - deltaY;
            }
        });
        
        window.addEventListener('mouseup', (e) => {
            if (isPanning) {
                isPanning = false;
                timeline.style.cursor = '';
                if (sidebarBody) sidebarBody.style.cursor = '';
            }
        });
    }
    
    // Worker Management Modal
    const manageWorkersBtn = document.getElementById('gantt-manage-workers-btn');
    const workersModal = document.getElementById('gantt-workers-modal-overlay');
    const closeWorkersBtn = document.getElementById('close-gantt-workers-btn');
    const addWorkerBtn = document.getElementById('add-worker-btn');
    const newWorkerInput = document.getElementById('new-worker-input');
    const workersList = document.getElementById('gantt-workers-list');

    const renderWorkersList = () => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (!proj || proj.type !== 'moodgantt') return;
        workersList.innerHTML = '';
        const workers = proj.data.workers || [];
        workers.forEach((worker, idx) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.padding = '0.5rem';
            div.style.background = 'rgba(0,0,0,0.1)';
            div.style.borderRadius = '0.5rem';
            
            const span = document.createElement('span');
            span.textContent = worker;
            span.style.color = 'var(--text-color)';
            
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '<iconify-icon icon="lucide:trash-2" width="14" height="14"></iconify-icon>';
            delBtn.style.background = 'none';
            delBtn.style.border = 'none';
            delBtn.style.color = 'var(--text-red-500, #ef4444)';
            delBtn.style.cursor = 'pointer';
            delBtn.onclick = () => {
                proj.data.workers.splice(idx, 1);
                renderWorkersList();
                if (ganttDetailTarget && ganttDetailTarget.project === proj) {
                    ganttOpenDetail(proj, ganttDetailTarget.groupId, ganttDetailTarget.taskId); // refresh select options
                }
                scheduleAutoSave();
            };
            
            div.append(span, delBtn);
            workersList.appendChild(div);
        });
    };

    if (manageWorkersBtn) {
        manageWorkersBtn.addEventListener('click', () => {
            workersModal.style.display = 'flex';
            renderWorkersList();
            setTimeout(() => newWorkerInput.focus(), 50);
        });
    }

    if (closeWorkersBtn) {
        closeWorkersBtn.addEventListener('click', () => {
            workersModal.style.display = 'none';
        });
    }

    if (addWorkerBtn) {
        addWorkerBtn.addEventListener('click', () => {
            const proj = projects.find(p => p.id === activeProjectId);
            if (!proj || proj.type !== 'moodgantt') return;
            const name = newWorkerInput.value.trim();
            if (name) {
                proj.data.workers = proj.data.workers || [];
                if (!proj.data.workers.includes(name)) {
                    proj.data.workers.push(name);
                    newWorkerInput.value = '';
                    renderWorkersList();
                    if (ganttDetailTarget && ganttDetailTarget.project === proj) {
                        ganttOpenDetail(proj, ganttDetailTarget.groupId, ganttDetailTarget.taskId); // refresh select options
                    }
                    scheduleAutoSave();
                } else {
                    showToast('Worker already exists');
                }
            }
        });
    }
    
    if (newWorkerInput) {
        newWorkerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addWorkerBtn.click();
        });
    }
}
