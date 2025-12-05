// --- TABS & PROJECT MANAGEMENT ---
let projects = [];
let activeProjectId = null;

const tabsBar = document.getElementById('tabs-bar');
const tabsList = document.getElementById('tabs-list');
const addMoodinfiniteTabBtn = document.getElementById('add-moodinfinite-tab-btn');
const addMoodpromptTabBtn = document.getElementById('add-moodprompt-tab-btn');
const moodinfiniteContainer = document.getElementById('moodinfinite-container');
const moodpromptContainer = document.getElementById('moodprompt-container');
const promptImageInput = document.getElementById('prompt-image-input');
const mobileTabsBtn = document.getElementById('mobile-tabs-btn');
const mobileTabsPopup = document.getElementById('mobile-tabs-popup');

const leftScrollIndicator = document.querySelector('.tabs-list-container .scroll-indicator.left');
const rightScrollIndicator = document.querySelector('.tabs-list-container .scroll-indicator.right');

const genericIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.69l.56 2.83 2.13.23-1.63 1.49.5 2.17-1.92-1.12-1.92 1.12.5-2.17-1.63-1.49 2.13.23.56-2.83M5 19.42l.62-3.13 2.37-.26-1.82-1.65.55-2.41-2.14 1.24-2.14-1.24.55 2.41-1.82 1.65 2.37.26.62 3.13M19 19.42l.62-3.13 2.37-.26-1.82-1.65.55-2.41-2.14 1.24-2.14-1.24.55 2.41-1.82 1.65 2.37.26.62 3.13z"></path></svg>`;
const platformData = {
    higgsfield: { name: 'Higgsfield', icon: genericIcon },
    openai_sora: { name: 'OpenAI Sora', icon: genericIcon },
    midjourney: { name: 'Midjourney', icon: `<svg viewBox="0 0 100 100"><path fill="currentColor" d="M50,15 L15,85 L85,85 L50,15 Z M50,35 L35,75 L65,75 L50,35 Z"></path></svg>` },
    wanz_5: { name: 'Wan2.5', icon: genericIcon },
    wanz_2: { name: 'Wan2.2', icon: genericIcon },
    minimax: { name: 'Minimax', icon: genericIcon },
    seedance: { name: 'Seedance', icon: genericIcon },
    kling: { name: 'Kling', icon: genericIcon },
    google_veo: { name: 'Google Veo', icon: genericIcon },
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
                canvasBackgroundColor: '#0d0d0d',
                accentColor: '#429eff',
                gridColor: '#f9f8f6'
            }
        };
    } else {
        const projectCount = projects.filter(p => p.type === 'moodprompt').length;
        newProject = {
            id: newId,
            type: 'moodprompt',
            name: `Prompts ${projectCount + 1}`,
            data: {
                prompts: [],
                canvasBackgroundColor: '#0d0d0d',
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

    canvasBackgroundColor = newActiveProject.data.canvasBackgroundColor;

    if (newActiveProject.type === 'moodinfinite') {
        items = newActiveProject.data.items;
        cameraOffset = newActiveProject.data.cameraOffset;
        cameraZoom = newActiveProject.data.cameraZoom;
        historyStack = newActiveProject.data.historyStack;
        historyIndex = newActiveProject.data.historyIndex;
        currentProjectName = newActiveProject.name;
        accentColor = newActiveProject.data.accentColor;
        gridColor = newActiveProject.data.gridColor;
        moodinfiniteContainer.style.display = 'block';
        moodpromptContainer.style.display = 'none';
        resizeCanvas();
    } else {
        moodinfiniteContainer.style.display = 'none';
        moodpromptContainer.style.display = 'block';
        renderMoodpromptView(newActiveProject);
    }

    applySettingsToUI();
    mobileTabsPopup.style.display = 'none'; // Hide popup on tab switch

    document.querySelectorAll('.tab-item').forEach(t => {
        t.classList.toggle('active', t.dataset.id == projectId);
    });
}

function closeTab(projectId, event) {
    if (event) event.stopPropagation();
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
                return;
            }
        }
        renderTabs();
    }
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
        tab.dataset.id = project.id;
        tab.draggable = true;

        const icon = document.createElement('span');
        icon.innerHTML = project.type === 'moodinfinite'
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 15 9 5 19"></polyline></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;

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

function renderMoodpromptView(project) {
    moodpromptContainer.innerHTML = '';
    const promptList = document.createElement('div');
    promptList.className = 'prompt-list';

    project.data.prompts.forEach((prompt, index) => { promptList.appendChild(createPromptCard(project, prompt, index)); });

    promptList.addEventListener('dragover', (e) => { e.preventDefault(); });

    promptList.addEventListener('drop', (e) => {
        e.preventDefault();
        const oldIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const dropTargetCard = e.target.closest('.prompt-card');
        if (!dropTargetCard) return;

        const allCards = Array.from(promptList.querySelectorAll('.prompt-card'));
        const newIndex = allCards.indexOf(dropTargetCard);

        if (oldIndex !== newIndex) {
            const [movedPrompt] = project.data.prompts.splice(oldIndex, 1);
            project.data.prompts.splice(newIndex, 0, movedPrompt);
            renderMoodpromptView(project);
        }
    });

    moodpromptContainer.appendChild(promptList);

    const addBtn = document.createElement('button');
    addBtn.id = 'add-prompt-btn';
    addBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add New Prompt`;
    addBtn.onclick = () => {
        project.data.prompts.push({ id: Date.now(), title: 'New Prompt', platform: 'midjourney', mediaType: 'image', image1: null, image2: null, text: '' });
        renderMoodpromptView(project);
    };
    moodpromptContainer.appendChild(addBtn);
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
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    deleteBtn.onclick = () => { project.data.prompts.splice(index, 1); renderMoodpromptView(project); };
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
    promptText.onchange = (e) => prompt.text = e.target.value;
    const setMediaType = (type) => {
        prompt.mediaType = type;
        imgBtn.classList.toggle('active', type === 'image');
        vidBtn.classList.toggle('active', type === 'video');
        imgSlot2.style.display = type === 'video' ? 'flex' : 'none';
    };
    imgBtn.onclick = () => setMediaType('image');
    vidBtn.onclick = () => setMediaType('video');
    setMediaType(prompt.mediaType);
    controls.append(platformSelectWrapper, mediaToggle, deleteBtn);
    header.append(titleContainer, controls);
    body.append(imagesContainer, promptText);
    card.append(header, body);
    return card;
}

function createImageSlot(project, prompt, slotNumber) {
    const slot = document.createElement('div');
    slot.className = 'image-upload-slot';
    const prop = `image${slotNumber}`;
    if (prompt[prop]) {
        const img = document.createElement('img');
        img.src = prompt[prop];
        slot.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'placeholder';
        placeholder.textContent = `+ Add Image ${slotNumber}`;
        slot.appendChild(placeholder);
    }
    slot.onclick = () => {
        promptImageInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (readEvent) => { prompt[prop] = readEvent.target.result; renderMoodpromptView(project); };
                reader.readAsDataURL(file);
            }
        };
        promptImageInput.click();
    };
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
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 15 9 5 19"></polyline></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;

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

addMoodinfiniteTabBtn.onclick = () => createNewProject('moodinfinite');
addMoodpromptTabBtn.onclick = () => createNewProject('moodprompt');

const canvas = document.getElementById('moodboard-canvas');
const ctx = canvas.getContext('2d');
const imageInput = document.getElementById('image-input');
const projectInput = document.getElementById('project-input');
const addImageBtn = document.getElementById('add-image-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addArrowBtn = document.getElementById('add-arrow-btn');
const addBoxBtn = document.getElementById('add-box-btn');
const addCircleBtn = document.getElementById('add-circle-btn');
const addMeasureBtn = document.getElementById('add-measure-btn');
const addGridBtn = document.getElementById('add-grid-btn');
const drawBtn = document.getElementById('draw-btn');
const alignBtn = document.getElementById('align-btn');
const contextMenu = document.getElementById('context-menu');
const tabContextMenu = document.getElementById('tab-context-menu');
const showGridToggle = document.getElementById('show-grid-toggle');
const snapGridToggle = document.getElementById('snap-grid-toggle');
const dropShadowToggle = document.getElementById('drop-shadow-toggle');
const showNotificationsToggle = document.getElementById('show-notifications-toggle');
const gridSizeSlider = document.getElementById('grid-size-slider');
const gridSizeValue = document.getElementById('grid-size-value');
const gridOpacitySlider = document.getElementById('grid-opacity-slider');
const gridOpacityValue = document.getElementById('grid-opacity-value');
const deleteItemBtn = document.getElementById('delete-item-btn');
const savePngBtn = document.getElementById('save-png-btn');
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
const ungroupBtn = document.getElementById('ungroup-btn');
const textToolsContainer = document.getElementById('text-tools-container');
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
const downloadSeparator = document.getElementById('download-separator');

let cameraOffset, cameraZoom;
let items = [], selectedItems = [];
let historyStack, historyIndex;

const MAX_ZOOM = 5, MIN_ZOOM = 0.1, SCROLL_SENSITIVITY = 0.0005;
let isDragging = false, dragStart = { x: 0, y: 0 };
let clipboard = [];
let internalClipboardTimestamp = 0;
let isMovingItems = false, moveStart = { x: 0, y: 0 };
let currentTool = null, isDrawing = false;
let canvasBackgroundColor = '#0d0d0d', accentColor = '#429eff', gridColor = '#f9f8f6';
let activeGizmo = null, isTransforming = false, isTransformingArrow = false;
let transformingHandle = null, transformStart = { x: 0, y: 0 }, originalItemState = null;
let hoveredGizmo = null, hoveredArrowHandle = null;
let isSelectingBox = false, selectionBox = { startX: 0, startY: 0, endX: 0, endY: 0 };
let currentlyEditingText = null;
let showGrid = true, snapToGrid = true, showDropShadow = true, showNotifications = true;
let gridSize = 50, gridOpacity = 0.05;
let currentProjectName = 'moodinfinite';
const HISTORY_LIMIT = 50;

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
        const settings = { showGrid, snapToGrid, showDropShadow, showNotifications, gridSize, gridOpacity };
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
            gridSize = settings.gridSize ?? gridSize;
            gridOpacity = settings.gridOpacity ?? gridOpacity;
        }
    } catch (error) { console.error("Could not load settings from localStorage:", error); }
}

function applySettingsToUI() {
    showGridToggle.checked = showGrid;
    snapGridToggle.checked = snapToGrid;
    dropShadowToggle.checked = showDropShadow;
    showNotificationsToggle.checked = showNotifications;
    gridSizeSlider.value = gridSize;
    gridSizeValue.textContent = `${gridSize}px`;
    gridOpacitySlider.value = gridOpacity;
    gridOpacityValue.textContent = `${Math.round(gridOpacity * 100)}%`;
    updateUIColors();
}

function setupEventListeners() {
    tabsList.addEventListener('dragover', e => { e.preventDefault(); const t = document.querySelector('.tab-item.dragging'); if (!t) return; const o = getDragAfterElement(tabsList, e.clientX); if (o == null) { tabsList.appendChild(t) } else { tabsList.insertBefore(t, o) } });
    tabsList.addEventListener('drop', e => { e.preventDefault(); const t = parseInt(e.dataTransfer.getData('text/plain')); if (isNaN(t)) return; const o = Array.from(tabsList.querySelectorAll('.tab-item')).map(e => parseInt(e.dataset.id)); projects.sort((e, t) => o.indexOf(e.id) - o.indexOf(t.id)); renderTabs() });
    tabsList.addEventListener('wheel', e => { if (tabsList.scrollWidth <= tabsList.clientWidth || e.deltaY === 0) return; e.preventDefault(); tabsList.scrollLeft += e.deltaY; });
    tabsList.addEventListener('scroll', updateScrollIndicators);
    const tabObserver = new ResizeObserver(updateScrollIndicators);
    tabObserver.observe(tabsList);

    const copyBtn = document.getElementById('copy-to-clipboard-btn'); const renameTabBtn = document.getElementById('rename-tab-btn'); const closeContextTabBtn = document.getElementById('close-context-tab-btn'); copyBtn.addEventListener('click', copyToClipboard); renameTabBtn.addEventListener('click', () => { const e = tabContextMenu.dataset.tabId; if (e) { const t = document.querySelector(`.tab-item[data-id='${e}']`); if (t) { const e = t.querySelector('.tab-name'), o = t.querySelector('.tab-name-input'); e.style.display = 'none'; o.style.display = 'inline'; o.focus(); o.select() } } tabContextMenu.style.display = 'none' }); closeContextTabBtn.addEventListener('click', () => { const e = tabContextMenu.dataset.tabId; if (e) { closeTab(parseInt(e)) } tabContextMenu.style.display = 'none' }); canvas.addEventListener('mousedown', onMouseDown); canvas.addEventListener('mouseup', onMouseUp); canvas.addEventListener('mousemove', onMouseMove); canvas.addEventListener('dblclick', onDoubleClick); canvas.addEventListener('wheel', e => { e.preventDefault(); adjustZoom(e, -e.deltaY * SCROLL_SENSITIVITY) }); canvas.addEventListener('contextmenu', onContextMenu); canvas.addEventListener('touchstart', onTouchStart, { passive: !1 }); canvas.addEventListener('touchend', onTouchEnd, { passive: !1 }); canvas.addEventListener('touchmove', onTouchMove, { passive: !1 }); canvas.addEventListener('touchcancel', onTouchEnd, { passive: !1 }); window.addEventListener('resize', resizeCanvas); window.addEventListener('keydown', handleKeyDown); document.addEventListener('click', e => { if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none'; if (!tabContextMenu.contains(e.target)) tabContextMenu.style.display = 'none'; if (mobileTabsPopup.style.display === 'block' && !mobileTabsPopup.contains(e.target) && e.target !== mobileTabsBtn && !mobileTabsBtn.contains(e.target)) { mobileTabsPopup.style.display = 'none' } if (palettePanel.classList.contains('open') && !palettePanel.contains(e.target) && e.target !== paletteBtn && !paletteBtn.contains(e.target)) { palettePanel.classList.remove('open') } }); window.addEventListener('paste', handlePaste); canvas.addEventListener('dragover', handleDragOver); canvas.addEventListener('dragleave', handleDragLeave); canvas.addEventListener('drop', handleDrop); openHelpBtn.addEventListener('click', () => helpModalOverlay.style.display = 'flex'); closeHelpBtn.addEventListener('click', () => helpModalOverlay.style.display = 'none'); helpModalOverlay.addEventListener('click', e => { if (e.target === helpModalOverlay) { helpModalOverlay.style.display = 'none' } }); savePngBtn.addEventListener('click', saveAsPng); saveProjectBtn.addEventListener('click', saveProject); loadProjectBtn.addEventListener('click', () => projectInput.click()); paletteBtn.addEventListener('click', () => { if (palettePanel.classList.contains('open')) { palettePanel.classList.remove('open'); } else { const buttonRect = paletteBtn.getBoundingClientRect(); palettePanel.style.top = `${buttonRect.bottom + 8}px`; palettePanel.style.left = `0px`; palettePanel.classList.add('open'); const panelWidth = palettePanel.offsetWidth; const screenPadding = 8; let newLeft = buttonRect.right - panelWidth; newLeft = Math.max(screenPadding, newLeft); palettePanel.style.left = `${newLeft}px`; } }); addImageBtn.addEventListener('click', () => imageInput.click()); imageInput.addEventListener('change', handleImageUpload); projectInput.addEventListener('change', handleProjectUpload); mobileTabsBtn.addEventListener('click', toggleMobileTabsPopup); addArrowBtn.addEventListener('click', () => setCurrentTool('arrow')); addTextBtn.addEventListener('click', () => setCurrentTool('text')); addBoxBtn.addEventListener('click', () => setCurrentTool('box')); addCircleBtn.addEventListener('click', () => setCurrentTool('circle')); addMeasureBtn.addEventListener('click', () => setCurrentTool('measure')); addGridBtn.addEventListener('click', () => setCurrentTool('grid')); drawBtn.addEventListener('click', () => setCurrentTool('draw')); eyedropperBtn.addEventListener('click', () => setCurrentTool('eyedropper')); alignBtn.addEventListener('click', autoAlignSelection); selectToolBtn.addEventListener('click', () => setCurrentTool(null)); showGridToggle.addEventListener('change', e => { showGrid = e.target.checked; saveSettings() }); snapGridToggle.addEventListener('change', e => { snapToGrid = e.target.checked; saveSettings() }); dropShadowToggle.addEventListener('change', e => { showDropShadow = e.target.checked; saveSettings() }); showNotificationsToggle.addEventListener('change', e => { showNotifications = e.target.checked; saveSettings() }); gridSizeSlider.addEventListener('input', e => { gridSize = parseInt(e.target.value); gridSizeValue.textContent = `${gridSize}px`; saveSettings() }); gridOpacitySlider.addEventListener('input', e => { gridOpacity = parseFloat(e.target.value); gridOpacityValue.textContent = `${Math.round(gridOpacity * 100)}%`; saveSettings() }); deleteItemBtn.addEventListener('click', deleteSelectedItems); const updateColor = (key, value) => { const proj = projects.find(p => p.id === activeProjectId); if (proj && (proj.type === 'moodinfinite' || proj.type === 'moodprompt')) { proj.data[key] = value; if (key === 'canvasBackgroundColor') canvasBackgroundColor = value; else if (key === 'accentColor') accentColor = value; else if (key === 'gridColor') gridColor = value; updateUIColors() } }; bgColorPicker.addEventListener('input', e => updateColor('canvasBackgroundColor', e.target.value)); accentColorPicker.addEventListener('input', e => updateColor('accentColor', e.target.value)); toolbarAccentColorPicker.addEventListener('input', e => updateColor('accentColor', e.target.value)); gridColorPicker.addEventListener('input', e => updateColor('gridColor', e.target.value)); itemOpacitySlider.addEventListener('input', e => { const t = parseFloat(e.target.value); selectedItems.forEach(e => { e.opacity = t }); itemOpacityValue.textContent = `${Math.round(t * 100)}%` }); itemOpacitySlider.addEventListener('change', () => { saveStateForUndo() }); toggleBoxStyleBtn.addEventListener('click', toggleBoxStyle); groupBtn.addEventListener('click', groupSelectedItems); ungroupBtn.addEventListener('click', ungroupSelectedItems); scaleBtn.addEventListener('click', () => setActiveGizmo('scale')); rotateBtn.addEventListener('click', () => setActiveGizmo('rotate')); flipHorizontalBtn.addEventListener('click', flipHorizontal); flipVerticalBtn.addEventListener('click', flipVertical); pinBtn.addEventListener('click', togglePin); deleteSelectionBtn.addEventListener('click', deleteSelectedItems); bringFrontBtn.addEventListener('click', bringSelectedToFront); sendBackBtn.addEventListener('click', sendSelectedToBack); fontFamilySelect.addEventListener('change', setTextFontFamily); textAlignLeftBtn.addEventListener('click', () => setTextAlign('left')); textAlignCenterBtn.addEventListener('click', () => setTextAlign('center')); textAlignRightBtn.addEventListener('click', () => setTextAlign('right')); textStyleBoldBtn.addEventListener('click', toggleTextStyleBold); textStyleItalicBtn.addEventListener('click', toggleTextStyleItalic); gridRowsInput.addEventListener('change', e => updateGridDimension('rows', e.target.value)); gridColsInput.addEventListener('change', e => updateGridDimension('cols', e.target.value)); measureUnitSelect.addEventListener('change', updateMeasureUnit); textEditor.addEventListener('blur', finishEditingText); textEditor.addEventListener('input', autoResizeTextEditor); textEditor.addEventListener('keydown', e => { if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); finishEditingText() } }); itemColorPicker.addEventListener('input', e => { if (selectedItems.length === 1 && (selectedItems[0].type === 'box' || selectedItems[0].type === 'circle' || selectedItems[0].type === 'text' || selectedItems[0].type === 'measure')) { selectedItems[0].color = e.target.value } }); confirmNewBtn.addEventListener('click', () => { resetBoard(); hideConfirmationModal() }); cancelNewBtn.addEventListener('click', hideConfirmationModal); downloadImageBtn.addEventListener('click', downloadSourceImage)
}
function resizeCanvas() { if (!activeProjectId || projects.find(e => e.id === activeProjectId)?.type !== 'moodinfinite') return; const t = document.getElementById('content-area'), o = canvas.width, a = canvas.height, i = t.clientWidth, r = t.clientHeight; if (o === i && a === r) return; cameraOffset.x -= (i - o) / (2 * cameraZoom); cameraOffset.y -= (r - a) / (2 * cameraZoom); canvas.width = i; canvas.height = r }
function gameLoop() { draw(); updateToolbarPosition(); requestAnimationFrame(gameLoop) }
function draw() { if (!activeProjectId || projects.find(e => e.id === activeProjectId)?.type !== 'moodinfinite') return; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(cameraZoom, cameraZoom); ctx.translate(-canvas.width / 2 + cameraOffset.x, -canvas.height / 2 + cameraOffset.y); if (showGrid) drawGrid(); items.forEach(e => { if (e.isHidden) return; ctx.save(); ctx.globalAlpha = e.opacity ?? 1; if (showDropShadow) { ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 15 / cameraZoom; ctx.shadowOffsetX = 4 / cameraZoom; ctx.shadowOffsetY = 4 / cameraZoom } if (e.type === 'image') { const t = e.x + e.width / 2, o = e.y + e.height / 2; ctx.translate(t, o); ctx.rotate(e.rotation); ctx.scale(e.scaleX || 1, e.scaleY || 1); if (e.img.complete) { ctx.drawImage(e.img, -e.width / 2, -e.height / 2, e.width, e.height) } } else if (e.type === 'arrow') { drawArrow(ctx, e) } else if (e.type === 'text') { drawTextItem(ctx, e) } else if (e.type === 'box') { drawBoxItem(ctx, e) } else if (e.type === 'circle') { drawCircleItem(ctx, e) } else if (e.type === 'measure') { drawMeasureItem(ctx, e) } else if (e.type === 'stroke') { drawStrokeItem(ctx, e) } else if (e.type === 'grid') { drawGridItem(ctx, e) } else if (e.type === 'group') { drawGroupItem(ctx, e) } ctx.restore() }); selectedItems.forEach(e => { drawSelection(e) }); if (isSelectingBox) drawSelectionBox(); ctx.restore() }
function drawSelection(e) { if (selectedItems.length > 1) { drawSelectionOutline(e); return } if ((e.type === 'arrow' || e.type === 'measure') && !e.isPinned) { const t = 8 / cameraZoom, o = invertColor(canvasBackgroundColor); ctx.save(); ctx.fillStyle = o; ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 4 / cameraZoom; ctx.beginPath(); ctx.arc(e.startX, e.startY, t, 0, Math.PI * 2); ctx.fill(); if (hoveredArrowHandle === 'start') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } ctx.beginPath(); ctx.arc(e.endX, e.endY, t, 0, Math.PI * 2); ctx.fill(); if (hoveredArrowHandle === 'end') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } ctx.restore(); return } if (e.type === 'stroke') { if (!isDrawing) drawSelectionOutline(e); return } ctx.save(); const t = e.x + e.width / 2, o = e.y + e.height / 2; ctx.translate(t, o); ctx.rotate(e.rotation); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.strokeRect(-e.width / 2, -e.height / 2, e.width, e.height); if (activeGizmo && !e.isPinned) { const t = invertColor(canvasBackgroundColor), o = 8 / cameraZoom; ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 4 / cameraZoom; ctx.fillStyle = t; ctx.strokeStyle = t; if (activeGizmo === 'scale') { const t = e.width / 2, a = e.height / 2; ctx.beginPath(); ctx.arc(t, a, o, 0, Math.PI * 2); ctx.fill(); if (hoveredGizmo === 'scale') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } } else if (activeGizmo === 'rotate') { const t = e.width / 2, a = -e.height / 2, i = a - 20 / cameraZoom; ctx.beginPath(); ctx.moveTo(t, a); ctx.lineTo(t, i); ctx.stroke(); ctx.beginPath(); ctx.arc(t, i, o, 0, Math.PI * 2); ctx.fill(); if (hoveredGizmo === 'rotate') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } } } ctx.restore() }
function drawSelectionOutline(e) { ctx.save(); const t = getItemBoundingBox(e); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.setLineDash([6 / cameraZoom, 4 / cameraZoom]); ctx.strokeRect(t.x, t.y, t.width, t.height); ctx.restore() }
function drawSelectionBox() { ctx.save(); ctx.fillStyle = hexToRgba(accentColor, .1); ctx.strokeStyle = accentColor; ctx.lineWidth = 1 / cameraZoom; const { x: e, y: t, width: o, height: a } = getNormalizedSelectionBox(); ctx.fillRect(e, t, o, a); ctx.strokeRect(e, t, o, a); ctx.restore() }
function drawGrid() { const e = (0 - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, t = (0 - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2, o = (canvas.width - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, a = (canvas.height - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2, i = Math.floor(e / gridSize) * gridSize, r = Math.floor(t / gridSize) * gridSize; ctx.save(); ctx.globalAlpha = gridOpacity; ctx.beginPath(); ctx.strokeStyle = gridColor; ctx.lineWidth = 1 / cameraZoom; for (let s = i; s < o; s += gridSize) { ctx.moveTo(s, t); ctx.lineTo(s, a) } for (let s = r; s < a; s += gridSize) { ctx.moveTo(e, s); ctx.lineTo(o, s) } ctx.stroke(); ctx.restore() }
function drawArrow(e, t) { const o = 10 / cameraZoom, a = t.endX - t.startX, i = t.endY - t.startY, r = Math.atan2(i, a); e.save(); e.beginPath(); e.moveTo(t.startX, t.startY); e.lineTo(t.endX, t.endY); e.lineTo(t.endX - o * Math.cos(r - Math.PI / 6), t.endY - o * Math.sin(r - Math.PI / 6)); e.moveTo(t.endX, t.endY); e.lineTo(t.endX - o * Math.cos(r + Math.PI / 6), t.endY - o * Math.sin(r + Math.PI / 6)); e.strokeStyle = t.color || accentColor; e.lineWidth = 3 / cameraZoom; e.stroke(); e.restore() }
function drawTextItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); e.globalAlpha = (t.opacity ?? 1) * .05; e.fillStyle = t.color; e.fillRect(-t.width / 2, -t.height / 2, t.width, t.height); e.globalAlpha = t.opacity ?? 1; e.fillStyle = t.color; const i = t.fontStyle || 'normal', r = t.fontWeight || 'bold', s = t.fontFamily || 'Inter'; e.font = `${i} ${r} ${t.fontSize}px '${s}', sans-serif`; e.textAlign = t.textAlign || 'center'; e.textBaseline = 'middle'; const n = t.text.split(' '), l = [], c = ''; let d = c; for (let o = 0; o < n.length; o++) { const a = d + n[o] + ' '; if (e.measureText(a).width > t.width - 20 && o > 0) { l.push(d.trim()); d = n[o] + ' ' } else { d = a } } l.push(d.trim()); const h = t.fontSize * 1.4; let p = -l.length * h / 2 + h / 2, m = 0; if (e.textAlign === 'left') { m = -t.width / 2 + 10 } else if (e.textAlign === 'right') { m = t.width / 2 - 10 } l.forEach((t, o) => { e.fillText(t, m, p + o * h) }); e.restore() }
function drawBoxItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); if (!t.style || t.style === 'fill') { e.fillStyle = t.color; e.fillRect(-t.width / 2, -t.height / 2, t.width, t.height) } else { e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.strokeRect(-t.width / 2, -t.height / 2, t.width, t.height) } e.restore() }
function drawCircleItem(e, t) { e.save(); const o = t.x + t.width / 2, a = t.y + t.height / 2, i = t.width / 2, r = t.height / 2; e.translate(o, a); e.rotate(t.rotation); e.scale(t.scaleX || 1, t.scaleY || 1); e.beginPath(); e.ellipse(0, 0, i, r, 0, 0, Math.PI * 2); if (!t.style || t.style === "fill") { e.fillStyle = t.color; e.fill(); } else { e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.stroke(); } e.restore(); }

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
function drawStrokeItem(e, t) { if (t.points.length < 2) return; e.save(); e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.lineCap = 'round'; e.lineJoin = 'round'; e.beginPath(); e.moveTo(t.points[0].x, t.points[0].y); for (let o = 1; o < t.points.length; o++) { e.lineTo(t.points[o].x, t.points[o].y) } e.stroke(); e.restore() }
function drawGroupItem(e, t) { e.save(); e.globalAlpha *= (t.opacity ?? 1); const o = t.x + t.width / 2, a = t.y + t.height / 2; e.translate(o, a); e.rotate(t.rotation || 0); e.scale(t.scaleX || 1, t.scaleY || 1); t.items.forEach(o => { const a = { ...o, x: o.x - t.width / 2, y: o.y - t.height / 2 }; if (a.type === "arrow" || a.type === 'measure') { a.startX = o.startX - t.width / 2; a.startY = o.startY - t.height / 2; a.endX = o.endX - t.width / 2; a.endY = o.endY - t.height / 2 } if (a.type === "stroke") { a.points = o.points.map(e => ({ x: e.x - t.width / 2, y: e.y - t.height / 2 })) } if (o.type === "image") { e.save(); const t = a.x + a.width / 2, i = a.y + a.height / 2; e.translate(t, i); e.rotate(a.rotation || 0); e.scale(a.scaleX || 1, a.scaleY || 1); if (o.img && o.img.complete) e.drawImage(o.img, -a.width / 2, -a.height / 2, a.width, a.height); e.restore() } else if (o.type === "arrow") drawArrow(e, a); else if (o.type === "text") drawTextItem(e, a); else if (o.type === "box") drawBoxItem(e, a); else if (o.type === 'circle') drawCircleItem(e, a); else if (o.type === 'measure') drawMeasureItem(e, a); else if (o.type === "stroke") drawStrokeItem(e, a); else if (o.type === "grid") drawGridItem(e, a) }); e.restore() }

function handleKeyDown(e) {
    const activeEl = document.activeElement;
    if (currentlyEditingText || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA'))) { return; }
    const key = e.key.toLowerCase();
    if (key === 'escape') { e.preventDefault(); if (helpModalOverlay.style.display === 'flex') { helpModalOverlay.style.display = 'none'; return; } if (currentTool) { setCurrentTool(null); } else if (selectedItems.length > 0) { selectedItems = []; updateSelectionToolbar(); updateLeftBarState(); } return; }
    if (e.shiftKey && key === 'n') { e.preventDefault(); confirmNewBoard(); return; }
    if (e.shiftKey && key === 'c') { e.preventDefault(); copyToClipboard(); return; }
    if (e.altKey && key === 'g') { e.preventDefault(); setCurrentTool('grid'); return; }
    if (e.ctrlKey) {
        if (e.shiftKey && key === 'a') { e.preventDefault(); autoAlignSelection(); return; }
        if (e.shiftKey && key === 'z') { e.preventDefault(); redoLastAction(); return; }
        if (e.shiftKey && key === 'g') { e.preventDefault(); ungroupSelectedItems(); return; }
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
    if (key === 'i') { e.preventDefault(); imageInput.click(); return; }
    if (key === 'b') { e.preventDefault(); setCurrentTool('box'); return; }
    if (key === 'c') { e.preventDefault(); setCurrentTool('circle'); return; }
    if (key === 'm') { e.preventDefault(); setCurrentTool('measure'); return; }
    if (key === 'd') { e.preventDefault(); setCurrentTool('draw'); return; }
    if (key === 'e') { e.preventDefault(); setCurrentTool('eyedropper'); return; }
    if (selectedItems.length === 0) return;
    if (key === 'h') { e.preventDefault(); flipHorizontal(); return; }
    if (key === 'v') { e.preventDefault(); flipVertical(); return; }
    if (key === 'home') { e.preventDefault(); bringSelectedToFront(); return; }
    if (key === 'end') { e.preventDefault(); sendSelectedToBack(); return; }
    if (key === 'pageup') { e.preventDefault(); moveSelectedUp(); return; }
    if (key === 'pagedown') { e.preventDefault(); moveSelectedDown(); return; }
    if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelectedItems(); return; }
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0];
    e.preventDefault();
    if (key === 'p') { togglePin(); return; }
    if (item.isPinned) return;
    switch (key) { case 'r': setActiveGizmo('rotate'); break; case 's': setActiveGizmo('scale'); break; }
}

function onDoubleClick(e) { const t = screenToWorld(getEventLocation(e)), o = getItemAtPosition(t); if (o && o.type === 'text' && !o.isPinned) editText(o) }
function onMouseDown(e) { if (currentlyEditingText) { finishEditingText(); return } const t = getEventLocation(e), o = screenToWorld(t); if (currentTool === 'eyedropper') { const pixelData = ctx.getImageData(t.x, t.y, 1, 1).data, hexColor = rgbToHex(pixelData[0], pixelData[1], pixelData[2]); accentColor = hexColor; updateUIColors(); saveSettings(); setCurrentTool(null); return } if (e.button === 0) { if (selectedItems.length === 1) { if ((selectedItems[0].type === 'arrow' || selectedItems[0].type === 'measure') && !selectedItems[0].isPinned) { const e = getArrowHandleAtPosition(o); if (e) { isTransformingArrow = !0; transformingHandle = e; return } } const e = getGizmoAtPosition(o); if (e && !selectedItems[0].isPinned) { isTransforming = !0; const t = selectedItems[0]; originalItemState = JSON.parse(JSON.stringify(t)); reattachImages(t, originalItemState); originalItemState.centerX = t.x + t.width / 2; originalItemState.centerY = t.y + t.height / 2; originalItemState.startAngle = Math.atan2(o.y - originalItemState.centerY, o.x - originalItemState.centerX); originalItemState.startDist = Math.hypot(o.x - originalItemState.centerY, o.y - originalItemState.centerX); if (e === 'scale') { const e = { x: -originalItemState.width / 2, y: -originalItemState.height / 2 }, t = Math.cos(originalItemState.rotation), o = Math.sin(originalItemState.rotation), a = e.x * t - e.y * o + originalItemState.centerX, i = e.x * o + e.y * t + originalItemState.centerY; originalItemState.pivot = { x: a, y: i } } return } } if (currentTool) { isDrawing = !0; let e; if (currentTool === 'arrow') { e = { id: Date.now(), type: 'arrow', startX: o.x, startY: o.y, endX: o.x, endY: o.y, rotation: 0, isPinned: !1, x: o.x, y: o.y, width: 0, height: 0, opacity: 1, scaleX: 1, scaleY: 1 } } else if (currentTool === 'text') { e = { id: Date.now(), type: 'text', text: 'Type...', x: o.x, y: o.y, width: 0, height: 0, fontSize: 32, rotation: 0, isPinned: !1, opacity: 1, fontFamily: 'Inter', textAlign: 'center', fontWeight: 'bold', fontStyle: 'normal', color: accentColor, scaleX: 1, scaleY: 1 } } else if (currentTool === 'box') { e = { id: Date.now(), type: 'box', color: accentColor, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, isPinned: !1, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 } } else if (currentTool === 'circle') { e = { id: Date.now(), type: 'circle', color: accentColor, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, isPinned: !1, style: 'fill', opacity: 1, scaleX: 1, scaleY: 1 } } else if (currentTool === 'measure') { e = { id: Date.now(), type: 'measure', startX: o.x, startY: o.y, endX: o.x, endY: o.y, unit: 'px', color: accentColor, isPinned: !1, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, opacity: 1 } } else if (currentTool === 'grid') { e = { id: Date.now(), type: 'grid', color: accentColor, x: o.x, y: o.y, width: 0, height: 0, rotation: 0, isPinned: !1, opacity: 1, rows: 3, cols: 3, scaleX: 1, scaleY: 1 } } else if (currentTool === 'draw') { e = { id: Date.now(), type: 'stroke', points: [{ x: o.x, y: o.y }], color: accentColor, isPinned: !1, x: o.x, y: o.y, width: 0, height: 0, opacity: 1, scaleX: 1, scaleY: 1 } } items.push(e); selectedItems = [e]; bringSelectedToFront() } else { const t = getItemAtPosition(o); if (e.shiftKey) { if (t) { const e = selectedItems.findIndex(e => e.id === t.id); if (e > -1) selectedItems.splice(e, 1); else selectedItems.push(t) } } else { if (t) { if (!selectedItems.includes(t)) { selectedItems = [t] } isMovingItems = !0; moveStart.x = o.x; moveStart.y = o.y; selectedItems.forEach(e => { e.originalX = e.x; e.originalY = e.y; if (e.type === 'arrow' || e.type === 'measure') { e.originalStartX = e.startX; e.originalStartY = e.startY; e.originalEndX = e.endX; e.originalEndY = e.endY } else if (e.type === 'stroke') { e.originalPoints = JSON.parse(JSON.stringify(e.points)) } else if (e.type === 'group') { e.originalItems = JSON.parse(JSON.stringify(e.items)); reattachImages(e, { items: e.originalItems }) } }) } else { selectedItems = []; isSelectingBox = !0; selectionBox.startX = o.x; selectionBox.startY = o.y; selectionBox.endX = o.x; selectionBox.endY = o.y } } updateSelectionToolbar(); updateLeftBarState() } } else if (e.button === 1) { isDragging = !0; dragStart.x = getEventLocation(e).x / cameraZoom - cameraOffset.x; dragStart.y = getEventLocation(e).y / cameraZoom - cameraOffset.y; canvas.classList.add('grabbing') } }
function onMouseUp(e) { if (e.button === 0) { if (isDrawing || isMovingItems || isTransforming || isTransformingArrow) { if (isDrawing) { const e = selectedItems[0]; if (e && (e.type === 'text' || e.type === 'box' || e.type === 'circle' || e.type === 'grid') && (e.width < 10 || e.height < 10)) { items = items.filter(t => t.id !== e.id); selectedItems = [] } else if (e && e.type === 'text') { editText(e) } } saveStateForUndo() } if (isSelectingBox) { isSelectingBox = !1; const e = getNormalizedSelectionBox(); selectedItems = items.filter(t => rectsIntersect(getItemBoundingBox(t), e)); updateSelectionToolbar(); updateLeftBarState() } isDrawing = !1; isMovingItems = !1; isTransforming = !1; isTransformingArrow = !1; transformingHandle = null; originalItemState = null } else if (e.button === 1) { isDragging = !1; canvas.classList.remove('grabbing') } }
function onMouseMove(e) {
    const worldPos = screenToWorld(getEventLocation(e));
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
            } else if (item.type === 'text') { // Scale font size for text items
                item.fontSize = originalItemState.fontSize * scaleRatio;
            }
        }
    } else if (isMovingItems && selectedItems.length > 0) {
        const deltaX = worldPos.x - moveStart.x;
        const deltaY = worldPos.y - moveStart.y;
        const doSnap = e.shiftKey ? !snapToGrid : snapToGrid; // Toggle snap with Shift

        selectedItems.forEach(item => {
            if (item.isPinned) return;
            let currentDeltaX = deltaX;
            let currentDeltaY = deltaY;

            if (doSnap && selectedItems.length === 1) { // Only snap single items for simplicity
                const snappedX = Math.round((item.originalX + deltaX) / gridSize) * gridSize;
                const snappedY = Math.round((item.originalY + deltaY) / gridSize) * gridSize;
                currentDeltaX = snappedX - item.originalX;
                currentDeltaY = snappedY - item.originalY;
            }

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

        if (currentGizmo !== hoveredGizmo || currentArrowHandle !== hoveredArrowHandle) {
            hoveredGizmo = currentGizmo;
            hoveredArrowHandle = currentArrowHandle;
            // Update cursor immediately
            if (hoveredGizmo || hoveredArrowHandle) {
                canvas.style.cursor = 'pointer';
            } else if (getItemAtPosition(worldPos)) {
                canvas.style.cursor = 'move';
            } else if (currentTool) {
                canvas.style.cursor = 'crosshair';
            } else {
                canvas.style.cursor = 'grab';
            }
        }
    }
}
function onContextMenu(e) { e.preventDefault(); const t = getItemAtPosition(screenToWorld(getEventLocation(e))); if (t && !selectedItems.includes(t)) { selectedItems = [t]; updateSelectionToolbar(); updateLeftBarState() } if (selectedItems.length > 0) { opacitySliderContainer.style.display = 'flex'; opacitySeparator.style.display = 'block'; const e = selectedItems[0].opacity ?? 1; itemOpacitySlider.value = e; itemOpacityValue.textContent = `${Math.round(e * 100)}%`; deleteItemBtn.style.display = 'flex'; document.getElementById('delete-separator').style.display = 'block' } else { opacitySliderContainer.style.display = 'none'; opacitySeparator.style.display = 'none'; deleteItemBtn.style.display = 'none'; document.getElementById('delete-separator').style.display = 'none' } const o = selectedItems.length === 1 && selectedItems[0].type === 'image'; downloadImageBtn.style.display = o ? 'flex' : 'none'; downloadSeparator.style.display = o ? 'block' : 'none'; showAndPositionMenu(contextMenu, e) }
function confirmNewBoard() { if (items.length > 0) { showConfirmationModal() } else { resetBoard() } }
function resetBoard() { const e = projects.find(e => e.id === activeProjectId); if (!e) return; e.data.items = []; e.data.cameraOffset = { x: window.innerWidth / 2, y: (window.innerHeight - 48) / 2 }; e.data.cameraZoom = 1; e.data.historyStack = []; e.data.historyIndex = -1; e.data.canvasBackgroundColor = '#0d0d0d'; e.data.accentColor = '#429eff'; e.data.gridColor = '#f9f8f6'; switchTab(activeProjectId); saveStateForUndo() }
function showConfirmationModal() { confirmationModalOverlay.style.display = 'flex' }
function hideConfirmationModal() { confirmationModalOverlay.style.display = 'none' }
async function copyToClipboard() { if (items.length === 0) { showToast("Board is empty, nothing to copy.", "error"); return } let e = Infinity, t = Infinity, o = -Infinity, a = -Infinity; items.forEach(i => { const r = getItemBoundingBox(i); e = Math.min(e, r.x); t = Math.min(t, r.y); o = Math.max(o, r.x + r.width); a = Math.max(a, r.y + r.height) }); const i = 50, r = o - e + i * 2, s = a - t + i * 2, n = document.createElement('canvas'); n.width = r; n.height = s; const l = n.getContext('2d'); l.fillStyle = canvasBackgroundColor; l.fillRect(0, 0, r, s); l.translate(-e + i, -t + i); items.forEach(e => { l.save(); l.globalAlpha = e.opacity ?? 1; if (showDropShadow) { l.shadowColor = 'rgba(0,0,0,0.4)'; l.shadowBlur = 15; l.shadowOffsetX = 4; l.shadowOffsetY = 4 } if (e.type === 'image') { const t = e.x + e.width / 2, o = e.y + e.height / 2; l.translate(t, o); l.rotate(e.rotation); l.scale(e.scaleX || 1, e.scaleY || 1); l.drawImage(e.img, -e.width / 2, -e.height / 2, e.width, e.height) } else if (e.type === 'arrow') { drawArrow(l, e) } else if (e.type === 'text') { drawTextItem(l, e) } else if (e.type === 'box') { drawBoxItem(l, e) } else if (e.type === 'circle') { drawCircleItem(l, e) } else if (e.type === 'measure') { drawMeasureItem(l, e) } else if (e.type === 'stroke') { drawStrokeItem(l, e) } else if (e.type === 'grid') { drawGridItem(l, e) } else if (e.type === 'group') { drawGroupItem(l, e) } l.restore() }); try { const e = await new Promise(e => n.toBlob(e, 'image/png')), t = new ClipboardItem({ 'image/png': e }); await navigator.clipboard.write([t]); showToast("Board copied to clipboard.") } catch (e) { console.error('Failed to copy image to clipboard:', e); showToast('Failed to copy to clipboard.', 'error') } }
function saveAsPng() { if (items.length === 0) { showToast("Board is empty, nothing to export.", "error"); return } let e = Infinity, t = Infinity, o = -Infinity, a = -Infinity; items.forEach(i => { const r = getItemBoundingBox(i); e = Math.min(e, r.x); t = Math.min(t, r.y); o = Math.max(o, r.x + r.width); a = Math.max(a, r.y + r.height) }); const i = o - e + 100, r = a - t + 100, s = document.createElement('canvas'); s.width = i; s.height = r; const n = s.getContext('2d'); n.fillStyle = canvasBackgroundColor; n.fillRect(0, 0, i, r); n.translate(-e + 50, -t + 50); items.forEach(e => { n.save(); n.globalAlpha = e.opacity ?? 1; if (showDropShadow) { n.shadowColor = 'rgba(0,0,0,0.4)'; n.shadowBlur = 15; n.shadowOffsetX = 4; n.shadowOffsetY = 4 } if (e.type === 'image') { const t = e.x + e.width / 2, o = e.y + e.height / 2; n.translate(t, o); n.rotate(e.rotation); n.scale(e.scaleX || 1, e.scaleY || 1); n.drawImage(e.img, -e.width / 2, -e.height / 2, e.width, e.height) } else if (e.type === 'arrow') { drawArrow(n, e) } else if (e.type === 'text') { drawTextItem(n, e) } else if (e.type === 'box') { drawBoxItem(n, e) } else if (e.type === 'circle') { drawCircleItem(n, e) } else if (e.type === 'measure') { drawMeasureItem(n, e) } else if (e.type === 'stroke') { drawStrokeItem(n, e) } else if (e.type === 'grid') { drawGridItem(n, e) } else if (e.type === 'group') { drawGroupItem(n, e) } n.restore() }); const l = document.createElement('a'); l.download = 'moodboard.png'; l.href = s.toDataURL('image/png'); l.click(); showToast("Image exported as PNG.") }
function saveProject() { const t = projects.find(e => e.id === activeProjectId); if (!t) { showToast("No active project to save.", "error"); return } let e; const o = `${t.name}.json`; if (t.type === 'moodinfinite') { const o = projects.find(e => e.id === activeProjectId); if (o) { o.data.items = items; o.data.cameraOffset = cameraOffset; o.data.cameraZoom = cameraZoom; o.data.historyStack = historyStack; o.data.historyIndex = historyIndex } e = { items: items.map(t => { const e = { ...t }; if (t.type === 'image' && t.img) { e.img = t.img.src } else if (t.type === 'group' && t.items) { e.items = t.items.map(e => { const o = { ...e }; if (e.type === 'image' && e.img) { o.img = e.img.src } return o }) } return e }), cameraOffset: cameraOffset, cameraZoom: cameraZoom, canvasBackgroundColor: canvasBackgroundColor, accentColor: accentColor, gridColor: gridColor, showGrid: showGrid, snapToGrid: snapToGrid, showDropShadow: showDropShadow, gridSize: gridSize, gridOpacity: gridOpacity } } else if (t.type === 'moodprompt') { e = t.data } else { showToast("Unknown project type, cannot save.", "error"); return } const a = new Blob([JSON.stringify(e, null, 2)], { type: 'application/json' }), n = document.createElement('a'); n.href = URL.createObjectURL(a); n.download = o; document.body.appendChild(n); n.click(); document.body.removeChild(n); URL.revokeObjectURL(n.href); showToast("Project saved successfully.") }
function loadFileAsNewTab(fileContent, fileName) { try { const data = JSON.parse(fileContent); const name = fileName.split('.').slice(0, -1).join('.') || 'Loaded Project'; if (data.prompts && Array.isArray(data.prompts)) { const newId = Date.now(); const newProject = { id: newId, type: 'moodprompt', name: name, data: { prompts: data.prompts, canvasBackgroundColor: data.canvasBackgroundColor || '#0d0d0d' } }; projects.push(newProject); renderTabs(); switchTab(newId); showToast("Prompt file loaded successfully."); return } if (data.items && Array.isArray(data.items)) { const newId = Date.now(); const newProject = { id: newId, type: 'moodinfinite', name: name, data: { items: [], cameraOffset: {}, cameraZoom: 1, historyStack: [], historyIndex: -1 } }; projects.push(newProject); activeProjectId = newId; renderTabs(); loadProject(fileContent); return } showToast("Failed to load project. Unknown format.", "error") } catch (err) { console.error("Failed to load project:", err); showToast("Failed to load project. Invalid JSON.", "error") } }
function loadProject(e) { try { const t = JSON.parse(e); const o = projects.find(e => e.id === activeProjectId); if (!o || o.type !== 'moodinfinite') return; o.data.cameraOffset = t.cameraOffset || { x: window.innerWidth / 2, y: window.innerHeight / 2 }; o.data.cameraZoom = t.cameraZoom || 1; canvasBackgroundColor = t.canvasBackgroundColor || '#0d0d0d'; accentColor = t.accentColor || '#429eff'; gridColor = t.gridColor || '#f9f8f6'; o.data.canvasBackgroundColor = canvasBackgroundColor; o.data.accentColor = accentColor; o.data.gridColor = gridColor; showGrid = t.showGrid ?? true; snapToGrid = t.snapToGrid ?? true; showDropShadow = t.showDropShadow ?? true; gridSize = t.gridSize || 50; gridOpacity = t.gridOpacity || .05; const a = e => { return e.map(e => { const t = { ...(e.scaleX !== void 0 ? {} : { scaleX: 1, scaleY: 1 }), ...e }; if (t.type === 'image') { const o = new Image; o.src = e.img; t.img = o } else if (t.type === 'group') { t.items = a(e.items) } return t }) }; o.data.items = a(t.items); o.data.historyStack = []; o.data.historyIndex = -1; switchTab(activeProjectId); updateUIColors(); saveStateForUndo(); showToast("Project loaded successfully.") } catch (e) { console.error("Failed to load project:", e); showToast("Failed to load project. Invalid file.", "error") } }
function handleImageUpload(e) { if (!e.target.files) return; const t = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 }); processFiles(e.target.files, t); imageInput.value = '' }
function handleProjectUpload(e) { const t = e.target.files[0]; if (!t) return; const o = new FileReader; o.onload = e => { loadFileAsNewTab(e.target.result, t.name) }; o.readAsText(t); projectInput.value = '' }

function handlePaste(e) {
    const files = Array.from(e.clipboardData.items)
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile());
    const isInternalClipboardOld = (Date.now() - internalClipboardTimestamp) > 500;
    if (files.length > 0 && isInternalClipboardOld) {
        processFiles(files, screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 }));
        return;
    }
    if (clipboard.length > 0) {
        pasteItems();
    }
}

function handleDragOver(e) { e.preventDefault(); canvas.style.outline = `2px dashed ${accentColor}`; canvas.style.outlineOffset = '-10px' }
function handleDragLeave(e) { e.preventDefault(); canvas.style.outline = 'none' }
function handleDrop(e) { e.preventDefault(); handleDragLeave(e); if (!e.dataTransfer.files) return; const t = e.dataTransfer.files[0]; if (t && (t.name.endsWith('.json') || t.name.endsWith('.mood'))) { const o = new FileReader; o.onload = e => { loadFileAsNewTab(e.target.result, t.name) }; o.readAsText(t) } else { processFiles(e.dataTransfer.files, screenToWorld(getEventLocation(e))) } }
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
                items.push({
                    id: Date.now() + index,
                    type: 'image',
                    img: img,
                    x: worldPos.x - initialWidth / 2 + index * 20,
                    y: worldPos.y - initialHeight / 2 + index * 20,
                    width: initialWidth,
                    height: initialHeight,
                    originalWidth: initialWidth, // Added
                    originalHeight: initialHeight, // Added
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
function downloadSourceImage() { if (selectedItems.length !== 1 || selectedItems[0].type !== 'image') return; const e = selectedItems[0], t = document.createElement('a'); t.href = e.img.src; try { const e = new URL(t.href), o = e.pathname.split('/'); t.download = o[o.length - 1] || 'source_image' } catch (e) { t.download = 'source_image.png' } document.body.appendChild(t); t.click(); document.body.removeChild(t); showToast("Source image download started.") }

function copyItems(e = !0) {
    if (selectedItems.length === 0) return;
    clipboard = selectedItems.map(e => {
        const t = JSON.parse(JSON.stringify(e));
        if (e.type === 'image') { t.imgSrc = e.img.src; delete t.img }
        else if (e.type === 'group') { e.items.forEach((e, o) => { if (e.type === 'image') { t.items[o].imgSrc = e.img.src; delete t.items[o].img } }) }
        return t
    });
    internalClipboardTimestamp = Date.now();
    if (e) { showToast(`${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''} copied.`) }
}

function cutItems() {
    if (selectedItems.length === 0) return;
    copyItems(!1);
    const e = clipboard.length;
    deleteSelectedItems();
    showToast(`${e} item${e > 1 ? 's' : ''} cut to clipboard.`)
}

function pasteItems() { if (clipboard.length === 0) { showToast("Clipboard is empty.", "error"); return } const e = [], t = 20 / cameraZoom, o = a => { const i = JSON.parse(JSON.stringify(a)); i.id = Date.now() + Math.random(); i.isPinned = !1; function r(e) { if (e.type === 'image') { const t = new Image; t.src = e.imgSrc; delete e.imgSrc; e.img = t } else if (e.type === 'group') { e.items.forEach(r) } } r(i); i.x += t; i.y += t; if (i.type === 'arrow' || i.type === 'measure') { i.startX += t; i.startY += t; i.endX += t; i.endY += t } else if (i.type === 'stroke') { i.points.forEach(e => { e.x += t; e.y += t }) } return i }; clipboard.forEach(t => { const a = o(t); items.push(a); e.push(a) }); selectedItems = e; updateSelectionToolbar(); updateLeftBarState(); saveStateForUndo(); showToast(`${e.length} item${e.length > 1 ? 's' : ''} pasted.`) }
function duplicateItems() { if (selectedItems.length === 0) return; const e = selectedItems, t = [], o = 20 / cameraZoom; e.forEach(e => { const a = JSON.parse(JSON.stringify(e)); reattachImages(e, a); a.id = Date.now() + Math.random(); a.isPinned = !1; a.x += o; a.y += o; if (a.type === 'arrow' || a.type === 'measure') { a.startX += o; a.startY += o; a.endX += o; a.endY += o } else if (a.type === 'stroke') { a.points.forEach(e => { e.x += o; e.y += o }) } items.push(a); t.push(a) }); selectedItems = t; updateSelectionToolbar(); updateLeftBarState(); saveStateForUndo(); showToast(`${t.length} item${t.length > 1 ? 's' : ''} duplicated.`) }
function deleteSelectedItems() { if (selectedItems.length > 0) { const e = new Set(selectedItems.map(e => e.id)); items = items.filter(t => !e.has(t.id)); selectedItems = []; updateSelectionToolbar(); updateLeftBarState(); saveStateForUndo() } }
function bringSelectedToFront() { if (selectedItems.length === 0) return; const e = new Set(selectedItems.map(e => e.id)), t = items.filter(t => e.has(t.id)), o = items.filter(t => !e.has(t.id)); items = [...o, ...t]; saveStateForUndo() }
function sendSelectedToBack() { if (selectedItems.length === 0) return; const e = new Set(selectedItems.map(e => e.id)), t = items.filter(t => e.has(t.id)), o = items.filter(t => !e.has(t.id)); items = [...t, ...o]; saveStateForUndo() }
function moveSelectedUp() { if (selectedItems.length !== 1) return; const e = selectedItems[0], t = items.findIndex(t => t.id === e.id); if (t > -1 && t < items.length - 1) { [items[t], items[t + 1]] = [items[t + 1], items[t]]; saveStateForUndo() } }
function moveSelectedDown() { if (selectedItems.length !== 1) return; const e = selectedItems[0], t = items.findIndex(t => t.id === e.id); if (t > 0) { [items[t], items[t - 1]] = [items[t - 1], items[t]]; saveStateForUndo() } }
function toggleBoxStyle() { let e = !1; selectedItems.forEach(t => { if (t.type === 'box' || t.type === 'circle') { t.style = t.style === 'fill' ? 'outline' : 'fill'; e = !0 } }); if (e) { saveStateForUndo() } }
function resetItemTransform() {
    if (selectedItems.length === 0) return;
    selectedItems.forEach(item => {
        if (item.isPinned) return;

        // Reset rotation and scale first, so bounding box is accurate
        item.rotation = 0;
        item.scaleX = 1;
        item.scaleY = 1;

        const bbox = getItemBoundingBox(item);
        const currentCenterX = bbox.x + bbox.width / 2;
        const currentCenterY = bbox.y + bbox.height / 2;

        const viewCenter = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 });

        const deltaX = viewCenter.x - currentCenterX;
        const deltaY = viewCenter.y - currentCenterY;

        // Apply delta to reset position
        if (item.type === 'arrow' || item.type === 'measure') {
            item.startX += deltaX;
            item.startY += deltaY;
            item.endX += deltaX;
            item.endY += deltaY;
        } else if (item.type === 'stroke') {
            item.points.forEach(p => {
                p.x += deltaX;
                p.y += deltaY;
            });
        } else {
            item.x += deltaX;
            item.y += deltaY;
        }
    });
    saveStateForUndo();
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
function autoAlignSelection() { if (selectedItems.length < 2) return; let e = 0, t = 0; selectedItems.forEach(o => { e += getItemBoundingBox(o).width; t += getItemBoundingBox(o).height }); const o = e / selectedItems.length, a = t / selectedItems.length, i = Math.ceil(Math.sqrt(selectedItems.length)), r = getCollectiveBoundingBox(selectedItems), s = r.x, n = r.y; selectedItems.forEach((e, t) => { const r = Math.floor(t / i), l = t % i, c = s + l * (o + 20), d = n + r * (a + 20), h = c - e.x, p = d - e.y; e.x += h; e.y += p; if (e.type === 'arrow' || e.type === 'measure') { e.startX += h; e.startY += p; e.endX += h; e.endY += p } else if (e.type === 'stroke') { e.points.forEach(e => { e.x += h; e.y += p }) } }); saveStateForUndo() }
function updateLeftBarState() { alignBtn.disabled = selectedItems.length < 2 }
function getContrastColor(hex) { if (hex.indexOf('#') === 0) { hex = hex.slice(1) } if (hex.length === 3) { hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] } if (hex.length !== 6) { return '#0d0d0d' } const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16), yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000; return (yiq >= 128) ? '#262626' : '#ffffff' }
function updateUIColors() { const e = document.documentElement.style, t = getContrastColor(canvasBackgroundColor); e.setProperty('--bg-page', canvasBackgroundColor); e.setProperty('--text-color-active-tab', t); e.setProperty('--contrast-color-light', hexToRgba(t, 0.6)); e.setProperty('--bg-ui', 'rgba(35, 38, 51, 0.4)'); e.setProperty('--bg-ui-hover', 'rgba(55, 58, 71, 0.5)'); e.setProperty('--text-color', '#e2e8f0'); e.setProperty('--text-color-light', '#94a3b8'); e.setProperty('--text-color-strong', '#ffffff'); e.setProperty('--border-color', 'rgba(255, 255, 255, 0.1)'); e.setProperty('--switch-bg-checked', accentColor); canvas.style.backgroundColor = canvasBackgroundColor; bgColorPicker.value = canvasBackgroundColor; accentColorPicker.value = accentColor; toolbarAccentColorPicker.value = accentColor; gridColorPicker.value = gridColor; renderTabs() }
function setCurrentTool(e) { if (currentTool === e && e !== null) { return } currentTool = e; document.querySelectorAll('#left-bar .tool-button').forEach(e => e.classList.remove('active')); canvas.classList.remove('eyedropper-active'); if (currentTool === null) { selectToolBtn.classList.add('active') } else if (currentTool === 'arrow') { addArrowBtn.classList.add('active') } else if (currentTool === 'text') { addTextBtn.classList.add('active') } else if (currentTool === 'box') { addBoxBtn.classList.add('active') } else if (currentTool === 'circle') { addCircleBtn.classList.add('active') } else if (currentTool === 'measure') { addMeasureBtn.classList.add('active') } else if (currentTool === 'grid') { addGridBtn.classList.add('active') } else if (currentTool === 'draw') { drawBtn.classList.add('active') } else if (currentTool === 'eyedropper') { eyedropperBtn.classList.add('active'); canvas.classList.add('eyedropper-active') } }
function setActiveGizmo(e) { activeGizmo = activeGizmo === e ? null : e; updateSelectionToolbar() }
function togglePin() { if (selectedItems.length > 0) { const e = !selectedItems[0].isPinned; selectedItems.forEach(t => t.isPinned = e); updateSelectionToolbar(); saveStateForUndo() } }
function setTextAlign(e) { if (selectedItems.length === 1 && selectedItems[0].type === 'text') { selectedItems[0].textAlign = e; updateSelectionToolbar(); saveStateForUndo() } }
function updateGridDimension(e, t) { if (selectedItems.length === 1 && selectedItems[0].type === 'grid') { const o = selectedItems[0], a = parseInt(t, 10); if (a > 0) { o[e] = a; saveStateForUndo() } } }
function updateMeasureUnit(e) { if (selectedItems.length === 1 && selectedItems[0].type === 'measure') { selectedItems[0].unit = e.target.value; saveStateForUndo() } }
function setTextFontFamily(e) { if (selectedItems.length === 1 && selectedItems[0].type === 'text') { selectedItems[0].fontFamily = e.target.value; saveStateForUndo() } }
function toggleTextStyleBold() { if (selectedItems.length === 1 && selectedItems[0].type === 'text') { const e = selectedItems[0]; e.fontWeight = e.fontWeight === 'bold' ? 'normal' : 'bold'; updateSelectionToolbar(); saveStateForUndo() } }
function toggleTextStyleItalic() { if (selectedItems.length === 1 && selectedItems[0].type === 'text') { const e = selectedItems[0]; e.fontStyle = e.fontStyle === 'italic' ? 'normal' : 'italic'; updateSelectionToolbar(); saveStateForUndo() } }
function updateSelectionToolbar() { const e = selectedItems.some(item => item.type === 'box' || item.type === 'circle'), t = selectedItems.length > 0, o = selectedItems.length > 0, a = selectedItems.length > 0, i = selectedItems.length > 1, r = selectedItems.length === 1 && selectedItems[0].type === 'group', s = selectedItems.length === 1 && selectedItems[0].type === 'text', n = selectedItems.length === 1 && selectedItems[0].type === 'grid', l = selectedItems.length === 1 && selectedItems[0].type === 'measure', c = selectedItems.length === 1 && (selectedItems[0].type === 'box' || selectedItems[0].type === 'circle' || selectedItems[0].type === 'text' || selectedItems[0].type === 'measure'); if (selectedItems.length > 0) { selectionToolbar.style.display = 'flex'; textToolsContainer.style.display = s ? 'flex' : 'none'; gridToolsContainer.style.display = n ? 'flex' : 'none'; measureToolsContainer.style.display = l ? 'flex' : 'none'; itemColorToolContainer.style.display = c ? 'flex' : 'none'; if (s) { const e = selectedItems[0]; fontFamilySelect.value = e.fontFamily || 'Inter';[textAlignLeftBtn, textAlignCenterBtn, textAlignRightBtn].forEach(e => e.classList.remove('active')); if (e.textAlign === 'left') textAlignLeftBtn.classList.add('active'); else if (e.textAlign === 'right') textAlignRightBtn.classList.add('active'); else textAlignCenterBtn.classList.add('active'); textStyleBoldBtn.classList.toggle('active', e.fontWeight === 'bold'); textStyleItalicBtn.classList.toggle('active', e.fontStyle === 'italic') } if (n) { const e = selectedItems[0]; gridRowsInput.value = e.rows; gridColsInput.value = e.cols } if (l) { measureUnitSelect.value = selectedItems[0].unit || 'px' } if (c) { itemColorPicker.value = selectedItems[0].color || accentColor } toggleBoxStyleBtn.style.display = e ? 'flex' : 'none'; scaleBtn.style.display = t ? 'flex' : 'none'; rotateBtn.style.display = t ? 'flex' : 'none'; resetTransformBtn.style.display = t ? 'flex' : 'none'; flipHorizontalBtn.style.display = t ? 'flex' : 'none'; flipVerticalBtn.style.display = t ? 'flex' : 'none'; pinBtn.style.display = o ? 'flex' : 'none'; bringFrontBtn.style.display = a ? 'flex' : 'none'; sendBackBtn.style.display = a ? 'flex' : 'none'; groupBtn.style.display = i ? 'flex' : 'none'; ungroupBtn.style.display = r ? 'flex' : 'none'; scaleBtn.classList.toggle('active', activeGizmo === 'scale'); rotateBtn.classList.toggle('active', activeGizmo === 'rotate'); pinBtn.classList.toggle('pinned', o && selectedItems.every(e => e.isPinned)) } else { selectionToolbar.style.display = 'none'; itemColorToolContainer.style.display = 'none'; textToolsContainer.style.display = 'none'; gridToolsContainer.style.display = 'none'; measureToolsContainer.style.display = 'none'; activeGizmo = null } }
function updateToolbarPosition() { if (selectedItems.length > 0) { const e = getCollectiveBoundingBox(selectedItems), t = worldToScreen({ x: e.x + e.width / 2, y: e.y + e.height }); selectionToolbar.style.left = `${t.x}px`; selectionToolbar.style.top = `${t.y}px` } }
function editText(e) { currentlyEditingText = e; e.isHidden = !0; const t = worldToScreen({ x: e.x, y: e.y }), o = e.width * cameraZoom; Object.assign(textEditor.style, { display: 'block', left: `${t.x}px`, top: `${t.y}px`, width: `${o}px`, height: 'auto', transform: `rotate(${e.rotation}rad)`, transformOrigin: 'top left', color: e.color, backgroundColor: hexToRgba(e.color, .1), fontSize: `${e.fontSize * cameraZoom}px`, fontFamily: e.fontFamily || 'Inter', textAlign: e.textAlign || 'center', fontWeight: e.fontWeight || 'bold', fontStyle: e.fontStyle || 'normal' }); textEditor.value = e.text === "Type..." ? "" : e.text; textEditor.focus(); autoResizeTextEditor(); selectedItems = []; updateToolbarPosition(); updateLeftBarState() }
function finishEditingText() { if (currentlyEditingText) { currentlyEditingText.text = textEditor.value.trim() || "Type..."; const e = currentlyEditingText, t = e.fontStyle || 'normal', o = e.fontWeight || 'bold', a = e.fontFamily || 'Inter'; ctx.font = `${t} ${o} ${e.fontSize}px '${a}', sans-serif`; const i = textEditor.value.split('\n'); let r = 0; i.forEach(e => { const t = ctx.measureText(e); if (t.width > r) r = t.width }); currentlyEditingText.width = r + 20; currentlyEditingText.height = textEditor.scrollHeight / cameraZoom; currentlyEditingText.isHidden = !1; selectedItems = [currentlyEditingText]; saveStateForUndo(); currentlyEditingText = null } textEditor.style.display = 'none' }
function autoResizeTextEditor() { textEditor.style.height = 'auto'; textEditor.style.height = textEditor.scrollHeight + 'px' }
function saveStateForUndo() { const e = JSON.stringify(items, (e, t) => { if (e === 'img') { return t.src } return t }); if (historyIndex < historyStack.length - 1) { historyStack = historyStack.slice(0, historyIndex + 1) } if (historyStack.length > 0 && historyStack[historyStack.length - 1] === e) return; historyStack.push(e); historyIndex++; if (historyStack.length > HISTORY_LIMIT) { historyStack.shift(); historyIndex-- } }
function loadStateFromHistory(e) { const t = JSON.parse(e); selectedItems = []; updateSelectionToolbar(); updateLeftBarState(); const o = e => { return e.map(e => { const t = { ...(e.scaleX !== void 0 ? {} : { scaleX: 1, scaleY: 1 }), ...e }; if (t.type === 'image') { const itemState = t; const img = new Image; img.src = itemState.img; t.img = img } else if (t.type === 'group') { t.items = o(t.items) } return t }) }; items = o(t) } // Fixed: used itemState instead of t inside image loading
function undoLastAction() { if (historyIndex > 0) { historyIndex--; const e = historyStack[historyIndex]; loadStateFromHistory(e) } }
function redoLastAction() { if (historyIndex < historyStack.length - 1) { historyIndex++; const e = historyStack[historyIndex]; loadStateFromHistory(e) } }
function groupSelectedItems() { if (selectedItems.length <= 1) return; saveStateForUndo(); const e = []; selectedItems.forEach(t => { if (t.type === 'group') { const o = t.x + t.width / 2, a = t.y + t.height / 2, i = Math.cos(t.rotation), r = Math.sin(t.rotation); t.items.forEach(s => { const n = JSON.parse(JSON.stringify(s)); reattachImages(s, n); const l = s.x + s.width / 2, c = s.y + s.height / 2, d = l - t.width / 2, h = c - t.height / 2, p = d * i - h * r, m = d * r + h * i, u = o + p, g = a + m; n.x = u - s.width / 2; n.y = g - s.height / 2; n.rotation = (s.rotation || 0) + t.rotation; if (n.type === 'arrow' || n.type === 'stroke' || n.type === 'measure') { const e = (e, l) => { const c = t.x + e.x, d = t.y + e.y, h = c - o, p = d - a, m = h * i - p * r, u = h * r + p * i; return { x: o + m, y: a + u } }; if (n.type === 'arrow' || n.type === 'measure') { const t = e({ x: s.startX - s.x, y: s.startY - s.y }), o = e({ x: s.endX - s.x, y: s.endY - s.y }); n.startX = t.x; n.startY = t.y; n.endX = o.x; n.endY = o.y } else { n.points = s.points.map(t => e({ x: t.x - s.x, y: t.y - s.y })) } } e.push(n) }) } else { e.push(t) } }); const t = getCollectiveBoundingBox(e), o = { id: Date.now(), type: 'group', x: t.x, y: t.y, width: t.width, height: t.height, rotation: 0, isPinned: !1, opacity: 1, scaleX: 1, scaleY: 1, items: [] }; e.forEach(e => { const t = JSON.parse(JSON.stringify(e)); reattachImages(e, t); t.x -= o.x; t.y -= o.y; if (t.type === 'arrow' || t.type === 'measure') { t.startX -= o.x; t.startY -= o.y; t.endX -= o.x; t.endY -= o.y } else if (t.type === 'stroke') { t.points.forEach(e => { e.x -= o.x; e.y -= o.y }) } o.items.push(t) }); const a = new Set(selectedItems.map(e => e.id)); items = items.filter(e => !a.has(e.id)); items.push(o); selectedItems = [o]; updateSelectionToolbar(); updateLeftBarState() }
function ungroupSelectedItems() { const e = selectedItems.filter(e => e.type === 'group'); if (e.length === 0) return; saveStateForUndo(); const t = [], o = new Set; e.forEach(e => { o.add(e.id); const a = e.x + e.width / 2, i = e.y + e.height / 2, r = Math.cos(e.rotation), s = Math.sin(e.rotation); e.items.forEach(o => { const n = JSON.parse(JSON.stringify(o)); reattachImages(o, n); if (n.type === 'arrow' || n.type === 'stroke' || n.type === 'measure') { const t = (t, l) => { const c = e.x + t.x, d = e.y + t.y, h = c - a, p = d - i, m = h * r - p * s, u = h * s + p * r; return { x: a + m, y: i + u } }; if (n.type === 'arrow' || n.type === 'measure') { const e = t({ x: o.startX - o.x, y: o.startY - o.y }), a = t({ x: o.endX - o.x, y: o.endY - o.y }); n.startX = e.x; n.startY = e.y; n.endX = a.x; n.endY = a.y } else { n.points = o.points.map(e => t({ x: e.x - o.x, y: e.y - o.y })) } } const l = o.x + o.width / 2, c = o.y + o.height / 2, d = l - e.width / 2, h = c - e.height / 2, p = d * r - h * s, m = d * s + h * r, u = a + p, g = i + m; n.x = u - o.width / 2; n.y = g - o.height / 2; n.rotation = (o.rotation || 0) + e.rotation; items.push(n); t.push(n) }) }); items = items.filter(e => !o.has(e.id)); selectedItems = t; updateSelectionToolbar(); updateLeftBarState() }
function buildPaletteMenu() { palettePanel.innerHTML = ''; colorPalettes.forEach(palette => { const option = document.createElement('div'); option.className = 'palette-option'; option.innerHTML = `<div class="palette-color" style="background-color: ${palette.bg}"></div><div class="palette-color" style="background-color: ${palette.accent}"></div><div class="palette-color" style="background-color: ${palette.grid}"></div>`; option.addEventListener('click', () => { const activeProject = projects.find(p => p.id === activeProjectId); if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt')) { activeProject.data.canvasBackgroundColor = palette.bg; canvasBackgroundColor = palette.bg; if (activeProject.type === 'moodinfinite') { activeProject.data.accentColor = palette.accent; activeProject.data.gridColor = palette.grid; accentColor = palette.accent; gridColor = palette.grid } updateUIColors() } palettePanel.classList.remove('open') }); palettePanel.appendChild(option) }) }
function showToast(e, t = 'success') { if (!showNotifications) return; const o = document.getElementById('toast-container'); if (!o) return; const a = document.createElement('div'); a.className = `toast-notification ${t}`; let i = ''; if (t === 'success') { i = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>` } else if (t === 'error') { i = `<svg xmlns="http://www.w3.org/2000/svg" class="icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>` } a.innerHTML = `${i}<span>${e}</span>`; o.appendChild(a); setTimeout(() => { a.remove() }, 3e3) }

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
    }
}
function onTouchEnd(e) {
    e.preventDefault(); clearTimeout(longPressTimer);
    if (e.touches.length < 2) { isPinching = false; initialPinchDistance = null; lastPinchCenter = null; }
    if (e.touches.length === 0) { onMouseUp(normalizeTouchEvent(e)); }
}

function getPinchDistance(e) { const t = e.touches[0], o = e.touches[1]; return Math.hypot(t.clientX - o.clientX, t.clientY - o.clientY) }
function getPinchCenter(e) { const t = e.touches[0], o = e.touches[1]; return { x: (t.clientX + o.clientX) / 2, y: (t.clientY + o.clientY) / 2 } }
function normalizeTouchEvent(e) { let t; if (e.touches && e.touches.length > 0) { t = e.touches[0] } else if (e.changedTouches && e.changedTouches.length > 0) { t = e.changedTouches[0] } else { return { clientX: 0, clientY: 0, button: 0, target: e.target } } return { clientX: t.clientX, clientY: t.clientY, button: 0, target: e.target } }
function getEventLocation(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top } }
function screenToWorld(e) { return { x: (e.x - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, y: (e.y - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2 } }
function worldToScreen(e) { return { x: (e.x + cameraOffset.x - canvas.width / 2) * cameraZoom + canvas.width / 2, y: (e.y + cameraOffset.y - canvas.height / 2) * cameraZoom + canvas.height / 2 } }
function reattachImages(e, t) { if (!e || !t) return; if (e.type === 'image' && e.img instanceof HTMLImageElement) { t.img = e.img } else if (e.type === 'group') { if (e.items && t.items) { e.items.forEach((e, o) => { reattachImages(e, t.items[o]) }) } } }
function getItemAtPosition(e) { for (let t = items.length - 1; t >= 0; t--) { const o = items[t], a = getItemBoundingBox(o); if (e.x >= a.x && e.x <= a.x + a.width && e.y >= a.y && e.y <= a.y + a.height) { if (o.type === 'group') { const t = o.x + o.width / 2, a = o.y + o.height / 2, i = e.x - t, r = e.y - a, s = Math.cos(-o.rotation), n = Math.sin(-o.rotation), l = i * s - r * n, c = i * n + r * s, d = l + t - o.x, h = c + a - o.y; for (let e = o.items.length - 1; e >= 0; e--) { const t = o.items[e], a = { x: t.x, y: t.y, width: t.width, height: t.height }; if (d >= a.x && d <= a.x + a.width && h >= a.y && h <= a.y + a.height) { return o } } } if (o.type === 'stroke' || o.type === 'arrow' || o.type === 'measure') { const a = getItemBoundingBox(o); if (e.x >= a.x - 10 / cameraZoom && e.x <= a.x + a.width + 10 / cameraZoom && e.y >= a.y - 10 / cameraZoom && e.y <= a.y + a.height + 10 / cameraZoom) { if (o.type === 'stroke') { for (let t = 0; t < o.points.length - 1; t++) { if (Math.sqrt(distToSegmentSquared(e, o.points[t], o.points[t + 1])) < 10 / cameraZoom) return o } } else if (o.type === 'arrow' || o.type === 'measure') { if (Math.sqrt(distToSegmentSquared(e, { x: o.startX, y: o.startY }, { x: o.endX, y: o.endY })) < 10 / cameraZoom) return o } } } else { const t = o.x + o.width / 2, a = o.y + o.height / 2, i = e.x - t, r = e.y - a, s = -o.rotation, n = i * Math.cos(s) - r * Math.sin(s), l = i * Math.sin(s) + r * Math.cos(s); if (n > -o.width / 2 && n < o.width / 2 && l > -o.height / 2 && l < o.height / 2) return o } } } return null }
function getGizmoAtPosition(e) { if (selectedItems.length !== 1 || !activeGizmo) return null; const t = selectedItems[0]; if (t.isPinned || t.type === 'arrow' || t.type === 'stroke' || t.type === 'measure') return null; const o = 14 / cameraZoom, a = t.x + t.width / 2, i = t.y + t.height / 2; if (activeGizmo === 'rotate') { const r = t.width / 2, s = -t.height / 2 - 20 / cameraZoom, n = r * Math.cos(t.rotation) - s * Math.sin(t.rotation), l = r * Math.sin(t.rotation) + s * Math.cos(t.rotation); if (Math.hypot(e.x - (a + n), e.y - (i + l)) < o) return 'rotate' } else if (activeGizmo === 'scale') { const r = t.width / 2, s = t.height / 2, n = r * Math.cos(t.rotation) - s * Math.sin(t.rotation), l = r * Math.sin(t.rotation) + s * Math.cos(t.rotation); if (Math.hypot(e.x - (a + n), e.y - (i + l)) < o) return 'scale' } return null }
function getArrowHandleAtPosition(e) { if (selectedItems.length !== 1) return null; const t = selectedItems[0]; if (t.isPinned || (t.type !== 'arrow' && t.type !== 'measure')) return null; const o = 12 / cameraZoom; if (Math.hypot(e.x - t.startX, e.y - t.startY) < o) return 'start'; if (Math.hypot(e.x - t.endX, e.y - t.endY) < o) return 'end'; return null }
function getCollectiveBoundingBox(e) { if (e.length === 0) return { x: 0, y: 0, width: 0, height: 0 }; let t = Infinity, o = Infinity, a = -Infinity, i = -Infinity; e.forEach(e => { const r = getItemBoundingBox(e); t = Math.min(t, r.x); o = Math.min(o, r.y); a = Math.max(a, r.x + r.width); i = Math.max(i, r.y + r.height) }); return { x: t, y: o, width: a - t, height: i - o } }
function getItemBoundingBox(e) { if (e.type === 'group') { if (!e.items || e.items.length === 0) { return { x: e.x, y: e.y, width: e.width, height: e.height } } let t = Infinity, o = Infinity, a = -Infinity, i = -Infinity; const r = e.x + e.width / 2, s = e.y + e.height / 2, n = Math.cos(e.rotation), l = Math.sin(e.rotation); e.items.forEach(c => { const d = getItemBoundingBox(c), h = [{ x: d.x, y: d.y }, { x: d.x + d.width, y: d.y }, { x: d.x + d.width, y: d.y + d.height }, { x: d.x, y: d.y + d.height }]; h.forEach(c => { const d = (e.x + c.x) - r, h = (e.y + c.y) - s, p = d * n - h * l, m = d * l + h * n, u = r + p, g = s + m; t = Math.min(t, u); o = Math.min(o, g); a = Math.max(a, u); i = Math.max(i, g) }) }); return { x: t, y: o, width: a - t, height: i - o } } if (e.type === 'stroke') { let t = Infinity, o = Infinity, a = -Infinity, i = -Infinity; if (e.points && e.points.length > 0) { e.points.forEach(e => { t = Math.min(t, e.x); o = Math.min(o, e.y); a = Math.max(a, e.x); i = Math.max(i, e.y) }); return { x: t, y: o, width: a - t, height: i - o } } return { x: e.x, y: e.y, width: 0, height: 0 } } if (e.type === 'arrow' || e.type === 'measure') { return { x: Math.min(e.startX, e.endX), y: Math.min(e.startY, e.endY), width: Math.abs(e.startX - e.endX), height: Math.abs(e.startY - e.endY) } } const t = e.width, o = e.height, a = e.x + t / 2, i = e.y + o / 2, r = e.rotation, s = Math.cos(r), n = Math.sin(r); let l = Infinity, c = Infinity, d = -Infinity, h = -Infinity;[{ x: -t / 2, y: -o / 2 }, { x: t / 2, y: -o / 2 }, { x: t / 2, y: o / 2 }, { x: -t / 2, y: o / 2 }].forEach(e => { const t = e.x * s - e.y * n + a, o = e.x * n + e.y * s + i; l = Math.min(l, t); c = Math.min(c, o); d = Math.max(d, t); h = Math.max(h, o) }); return { x: l, y: c, width: d - l, height: h - c } }
function rectsIntersect(e, t) { return !(t.x > e.x + e.width || t.x + t.width < e.x || t.y > e.y + e.height || t.y + t.height < e.y) }
function getNormalizedSelectionBox() { return { x: Math.min(selectionBox.startX, selectionBox.endX), y: Math.min(selectionBox.startY, selectionBox.endY), width: Math.abs(selectionBox.startX - selectionBox.endX), height: Math.abs(selectionBox.startY - selectionBox.endY) } }
function hexToRgba(e, t) { let o = 0, a = 0, i = 0; if (e.length == 4) { o = "0x" + e[1] + e[1]; a = "0x" + e[2] + e[2]; i = "0x" + e[3] + e[3] } else if (e.length == 7) { o = "0x" + e[1] + e[2]; a = "0x" + e[3] + e[4]; i = "0x" + e[5] + e[6] } return `rgba(${+o},${+a},${+i},${t})` }
function rgbToHex(e, t, o) { return "#" + ((1 << 24) + (e << 16) + (t << 8) + o).toString(16).slice(1) }
function distSq(e, t) { return Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2) }
function distToSegmentSquared(e, t, o) { const a = distSq(t, o); if (a === 0) return distSq(e, t); let i = ((e.x - t.x) * (o.x - t.x) + (e.y - t.y) * (o.y - t.y)) / a; i = Math.max(0, Math.min(1, i)); return distSq(e, { x: t.x + i * (o.x - t.x), y: t.y + i * (o.y - t.y) }) }
function invertColor(e) { if (e.indexOf('#') === 0) e = e.slice(1); if (e.length === 3) e = e[0] + e[0] + e[1] + e[1] + e[2] + e[2]; if (e.length !== 6) return '#ffffff'; const t = (255 - parseInt(e.slice(0, 2), 16)).toString(16), o = (255 - parseInt(e.slice(2, 4), 16)).toString(16), a = (255 - parseInt(e.slice(4, 6), 16)).toString(16); return '#' + padZero(t) + padZero(o) + padZero(a) }
function padZero(e, t) { t = t || 2; const o = (new Array(t + 1)).join('0'); return (o + e).slice(-t) }
function adjustZoom(e, t) { if (isDragging) return; const o = screenToWorld(getEventLocation(e)); cameraZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraZoom * (1 + t))); const a = screenToWorld(getEventLocation(e)); cameraOffset.x += a.x - o.x; cameraOffset.y += a.y - o.y }

loadSettings();
setupEventListeners();
buildPaletteMenu();
createNewProject('moodinfinite');
gameLoop();
