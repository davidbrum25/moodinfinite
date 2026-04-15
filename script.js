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

const closeBoardModalOverlay = document.getElementById('close-board-modal-overlay');
const cancelCloseBtn = document.getElementById('cancel-close-btn');
const confirmCloseBtn = document.getElementById('confirm-close-btn');
let projectPendingClose = null;

const leftScrollIndicator = document.querySelector('.tabs-list-container .scroll-indicator.left');
const rightScrollIndicator = document.querySelector('.tabs-list-container .scroll-indicator.right');

let autoSaveTimeout = null;
function scheduleAutoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(saveToBrowser, 1500);
}

function serializeItems(itemArray) {
    return itemArray.map(t => {
        const e = { ...t };
        if (e.type === 'image') delete e.img;
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
        } else if (t.type === 'group' && t.items) {
            restoreImages(t.items);
        }
    });
}

function saveToBrowser() {
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
    const projectsToSave = projects.map(p => {
        const copy = JSON.parse(JSON.stringify(p));
        if (copy.type === 'moodinfinite' && copy.data && copy.data.items) {
            copy.data.items = serializeItems(p.data.items);
        }
        return copy;
    });
    window.localforage.setItem('moodinfinite_projects', projectsToSave);
    window.localforage.setItem('moodinfinite_cache', globalImageCache);
    window.localforage.setItem('moodinfinite_active_tab', activeProjectId);
}


const genericIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`;
const platformData = {
    higgsfield: { name: 'Higgsfield', icon: genericIcon },
    openai_sora: { name: 'OpenAI Sora', icon: genericIcon },
    midjourney: { name: 'Midjourney', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m8 3l4 8l5-5l5 15H2z"/></svg>` },
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
                canvasBackgroundColor: defaultCanvasBg,
                accentColor: defaultAccent,
                gridColor: defaultGridColor
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
    scheduleAutoSave();
}

function closeTab(projectId, event) {
    if (event) event.stopPropagation();
    projectPendingClose = projectId;
    if (closeBoardModalOverlay) closeBoardModalOverlay.style.display = 'flex';
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
        tab.dataset.id = project.id;
        tab.draggable = true;

        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        icon.innerHTML = project.type === 'moodinfinite'
            ? `<iconify-icon icon="lucide:image" width="16" height="16"></iconify-icon>`
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
    addBtn.innerHTML = `<iconify-icon icon="lucide:plus" width="18" height="18"></iconify-icon> Add New Prompt`;
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
    deleteBtn.innerHTML = `<iconify-icon icon="lucide:trash-2" width="18" height="18"></iconify-icon>`;
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
const projectInput = document.getElementById('project-input');
const addImageBtn = document.getElementById('add-image-btn');
const addTextBtn = document.getElementById('add-text-btn');
const addCommentBtn = document.getElementById('add-comment-btn');
const addArrowBtn = document.getElementById('add-arrow-btn');
const addBoxBtn = document.getElementById('add-box-btn');
const addCircleBtn = document.getElementById('add-circle-btn');
const addMeasureBtn = document.getElementById('add-measure-btn');
const addGridBtn = document.getElementById('add-grid-btn');
const addTextListBtn = document.getElementById('add-text-list-btn');
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

let cameraOffset, cameraZoom;
let items = [], selectedItems = [];
let globalImageCache = {}; // Cache for image source data
let historyStack, historyIndex;

const MAX_ZOOM = 5, MIN_ZOOM = 0.1, SCROLL_SENSITIVITY = 0.0005;
let isDragging = false, dragStart = { x: 0, y: 0 };
let clipboard = [];
let internalClipboardTimestamp = 0;
let isMovingItems = false, moveStart = { x: 0, y: 0 };
let currentTool = null, isDrawing = false;
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
let showGrid = true, snapToGrid = true, showDropShadow = true, showNotifications = true;
let gridSize = 50, gridOpacity = 0.05;
let currentProjectName = 'moodinfinite';
const HISTORY_LIMIT = 50;

function getLuminance(hex) {
    if (!hex) return 0;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const a = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
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

    if (addMoodinfiniteTabBtn) addMoodinfiniteTabBtn.addEventListener('click', () => createNewProject('moodinfinite'));
    if (addMoodpromptTabBtn) addMoodpromptTabBtn.addEventListener('click', () => createNewProject('moodprompt'));

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

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
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
        if (mobileTabsPopup && mobileTabsPopup.style.display === 'block' && !mobileTabsPopup.contains(e.target) && e.target !== mobileTabsBtn && !mobileTabsBtn.contains(e.target)) {
            mobileTabsPopup.style.display = 'none'
        }
        if (palettePanel && palettePanel.classList.contains('open') && !palettePanel.contains(e.target) && e.target !== paletteBtn && !paletteBtn.contains(e.target)) {
            palettePanel.classList.remove('open')
        }
    });

    document.addEventListener('touchstart', e => {
        if (contextMenu && !contextMenu.contains(e.target)) contextMenu.style.display = 'none';
        if (tabContextMenu && !tabContextMenu.contains(e.target)) tabContextMenu.style.display = 'none';
        if (palettePanel && palettePanel.classList.contains('open') && !palettePanel.contains(e.target) && e.target !== paletteBtn && !paletteBtn.contains(e.target)) {
            palettePanel.classList.remove('open')
        }
        if (iconPickerPanel && iconPickerPanel.style.display === 'flex' && !iconPickerPanel.contains(e.target) && e.target !== commentIconBtn && !commentIconBtn.contains(e.target)) {
            iconPickerPanel.style.display = 'none'
        }
    }, { capture: true, passive: true });

    window.addEventListener('paste', handlePaste);
    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('dragleave', handleDragLeave);
    canvas.addEventListener('drop', handleDrop);

    if (openHelpBtn) openHelpBtn.addEventListener('click', () => helpModalOverlay.style.display = 'flex');
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => helpModalOverlay.style.display = 'none');
    if (helpModalOverlay) helpModalOverlay.addEventListener('click', e => { if (e.target === helpModalOverlay) { helpModalOverlay.style.display = 'none' } });

    if (savePngBtn) savePngBtn.addEventListener('click', saveAsPng);
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

    if (addArrowBtn) addArrowBtn.addEventListener('click', () => setCurrentTool('arrow'));
    if (addTextBtn) addTextBtn.addEventListener('click', () => setCurrentTool('text'));
    if (addCommentBtn) addCommentBtn.addEventListener('click', () => setCurrentTool('comment'));
    if (addLinkBtn) addLinkBtn.addEventListener('click', () => setCurrentTool('link'));
    if (addBoxBtn) addBoxBtn.addEventListener('click', () => setCurrentTool('box'));
    if (addCircleBtn) addCircleBtn.addEventListener('click', () => setCurrentTool('circle'));
    if (addMeasureBtn) addMeasureBtn.addEventListener('click', () => setCurrentTool('measure'));
    if (addGridBtn) addGridBtn.addEventListener('click', () => setCurrentTool('grid'));
    if (addTextListBtn) addTextListBtn.addEventListener('click', () => setCurrentTool('textList'));
    if (drawBtn) drawBtn.addEventListener('click', () => setCurrentTool('draw'));
    if (eyedropperBtn) eyedropperBtn.addEventListener('click', () => setCurrentTool('eyedropper'));
    if (selectToolBtn) selectToolBtn.addEventListener('click', () => setCurrentTool(null));

    if (alignBtn) alignBtn.addEventListener('click', autoAlignSelection);

    if (showGridToggle) showGridToggle.addEventListener('change', e => { showGrid = e.target.checked; saveSettings() });
    if (snapGridToggle) snapGridToggle.addEventListener('change', e => { snapToGrid = e.target.checked; saveSettings() });
    if (dropShadowToggle) dropShadowToggle.addEventListener('change', e => { showDropShadow = e.target.checked; saveSettings() });
    if (showNotificationsToggle) showNotificationsToggle.addEventListener('change', e => { showNotifications = e.target.checked; saveSettings() });
    
    if (gridSizeSlider) gridSizeSlider.addEventListener('input', e => { gridSize = parseInt(e.target.value); gridSizeValue.textContent = `${gridSize}px`; saveSettings() });
    if (gridOpacitySlider) gridOpacitySlider.addEventListener('input', e => { gridOpacity = parseFloat(e.target.value); gridOpacityValue.textContent = `${Math.round(gridOpacity * 100)}%`; saveSettings() });

    if (deleteItemBtn) deleteItemBtn.addEventListener('click', deleteSelectedItems);

    const updateColor = (key, value) => {
        const proj = projects.find(p => p.id === activeProjectId);
        if (proj && (proj.type === 'moodinfinite' || proj.type === 'moodprompt')) {
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
            if (selectedItems.length === 1 && (['box', 'circle', 'text', 'measure', 'comment', 'link'].includes(selectedItems[0].type))) {
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
        if(icon === 'none') {
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
function resizeCanvas() { if (!activeProjectId || projects.find(e => e.id === activeProjectId)?.type !== 'moodinfinite') return; const t = document.getElementById('content-area'), o = canvas.width, a = canvas.height, i = t.clientWidth, r = t.clientHeight; if (o === i && a === r) return; cameraOffset.x -= (i - o) / (2 * cameraZoom); cameraOffset.y -= (r - a) / (2 * cameraZoom); canvas.width = i; canvas.height = r }
function gameLoop() { draw(); updateToolbarPosition(); requestAnimationFrame(gameLoop) }
function draw() {
    if (!activeProjectId || projects.find(e => e.id === activeProjectId)?.type !== 'moodinfinite') return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cameraZoom, cameraZoom);
    ctx.translate(-canvas.width / 2 + cameraOffset.x, -canvas.height / 2 + cameraOffset.y);
    if (showGrid) drawGrid();

    const drawItem = (e) => {
        if (e.isHidden) return;
        ctx.save();
        ctx.globalAlpha = e.opacity ?? 1;
        if (showDropShadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 15 / cameraZoom;
            ctx.shadowOffsetX = 4 / cameraZoom;
            ctx.shadowOffsetY = 4 / cameraZoom
        }
        if (e.type === 'image') { drawImageItem(ctx, e) }
        else if (e.type === 'arrow') { drawArrow(ctx, e) }
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
        else if (e.type === 'reroute') { drawRerouteItem(ctx, e) }
        else if (e.type === 'connector') { drawConnectorItem(e) }
        ctx.restore();
    };

    // Unified Rendering Pass (respects array order)
    // We still draw comments and links on top of "regular" items for convenience,
    // but connectors and reroutes now mingle with regular items.
    items.forEach(e => { if (e.type !== 'comment' && e.type !== 'link') drawItem(e); });
    
    // Layer 2: Links & Comments (Always on top)
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
    ctx.restore();
}
function drawSelection(e) { if (selectedItems.length > 1) { drawSelectionOutline(e); return } if ((e.type === 'arrow' || e.type === 'measure') && !e.isPinned) { const t = 8 / cameraZoom, o = invertColor(canvasBackgroundColor); ctx.save(); ctx.fillStyle = o; ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 4 / cameraZoom; ctx.beginPath(); ctx.arc(e.startX, e.startY, t, 0, Math.PI * 2); ctx.fill(); if (hoveredArrowHandle === 'start') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } ctx.beginPath(); ctx.arc(e.endX, e.endY, t, 0, Math.PI * 2); ctx.fill(); if (hoveredArrowHandle === 'end') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } ctx.restore(); return } if (e.type === 'stroke') { if (!isDrawing) drawSelectionOutline(e); return } ctx.save(); const t = e.x + e.width / 2, o = e.y + e.height / 2; ctx.translate(t, o); ctx.rotate(e.rotation); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.strokeRect(-e.width / 2, -e.height / 2, e.width, e.height); if (activeGizmo && !e.isPinned) { const t = invertColor(canvasBackgroundColor), o = 8 / cameraZoom; ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 4 / cameraZoom; ctx.fillStyle = t; ctx.strokeStyle = t; if (activeGizmo === 'scale') { const t = e.width / 2, a = e.height / 2; ctx.beginPath(); ctx.arc(t, a, o, 0, Math.PI * 2); ctx.fill(); if (hoveredGizmo === 'scale') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } } else if (activeGizmo === 'rotate') { const t = e.width / 2, a = -e.height / 2, i = a - 20 / cameraZoom; ctx.beginPath(); ctx.moveTo(t, a); ctx.lineTo(t, i); ctx.stroke(); ctx.beginPath(); ctx.arc(t, i, o, 0, Math.PI * 2); ctx.fill(); if (hoveredGizmo === 'rotate') { ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.stroke() } } } ctx.restore() }
function drawSelectionOutline(e) { ctx.save(); const t = getItemBoundingBox(e); ctx.strokeStyle = accentColor; ctx.lineWidth = 2 / cameraZoom; ctx.setLineDash([6 / cameraZoom, 4 / cameraZoom]); ctx.strokeRect(t.x, t.y, t.width, t.height); ctx.restore() }
function drawSelectionBox() { ctx.save(); ctx.fillStyle = hexToRgba(accentColor, .1); ctx.strokeStyle = accentColor; ctx.lineWidth = 1 / cameraZoom; const { x: e, y: t, width: o, height: a } = getNormalizedSelectionBox(); ctx.fillRect(e, t, o, a); ctx.strokeRect(e, t, o, a); ctx.restore() }
function drawGrid() { const e = (0 - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, t = (0 - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2, o = (canvas.width - canvas.width / 2) / cameraZoom - cameraOffset.x + canvas.width / 2, a = (canvas.height - canvas.height / 2) / cameraZoom - cameraOffset.y + canvas.height / 2, i = Math.floor(e / gridSize) * gridSize, r = Math.floor(t / gridSize) * gridSize; ctx.save(); ctx.globalAlpha = gridOpacity; ctx.beginPath(); ctx.strokeStyle = gridColor; ctx.lineWidth = 1 / cameraZoom; for (let s = i; s < o; s += gridSize) { ctx.moveTo(s, t); ctx.lineTo(s, a) } for (let s = r; s < a; s += gridSize) { ctx.moveTo(e, s); ctx.lineTo(o, s) } ctx.stroke(); ctx.restore() }
function drawArrow(e, t) { const o = 10 / cameraZoom, a = t.endX - t.startX, i = t.endY - t.startY, r = Math.atan2(i, a); e.save(); e.beginPath(); e.moveTo(t.startX, t.startY); e.lineTo(t.endX, t.endY); e.lineTo(t.endX - o * Math.cos(r - Math.PI / 6), t.endY - o * Math.sin(r - Math.PI / 6)); e.moveTo(t.endX, t.endY); e.lineTo(t.endX - o * Math.cos(r + Math.PI / 6), t.endY - o * Math.sin(r + Math.PI / 6)); e.strokeStyle = t.color || accentColor; e.lineWidth = 3 / cameraZoom; e.stroke(); e.restore() }
function drawTextItem(ctx, item) {
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
        ctx.font = `bold 16px '${item.fontFamily || 'Nunito'}', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const titleLines = wrapText(ctx, item.title, item.width - pX * 2);
        titleLines.forEach(line => {
            ctx.fillText(line, x + pX, currY);
            currY += 22; // Slightly more line height for title
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
    e.font = `${i} ${r} ${t.fontSize}px '${s}', sans-serif`; 
    e.textAlign = 'left'; 
    e.textBaseline = 'top'; 

    const h = t.fontSize * 1.5; 
    const padding = 15;
    const checkboxSize = t.fontSize * 1.1;
    const checkboxMargin = 10;

    (t.items || []).forEach((item, idx) => {
        const itemY = -t.height / 2 + padding + idx * h;
        
        // Draw Checkbox
        e.strokeStyle = textColor;
        e.lineWidth = 2 / cameraZoom;
        const cbX = -t.width / 2 + padding;
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
        if (item.completed) {
            e.globalAlpha *= 0.5;
        }
        e.fillText(item.text, cbX + checkboxSize + checkboxMargin, itemY + (h - t.fontSize) / 2);
        
        if (item.completed) {
            const metrics = e.measureText(item.text);
            e.beginPath();
            e.moveTo(cbX + checkboxSize + checkboxMargin, itemY + h / 2);
            e.lineTo(cbX + checkboxSize + checkboxMargin + metrics.width, itemY + h / 2);
            e.stroke();
        }
        e.restore();
    });
    e.restore(); 
}
function drawStrokeItem(e, t) { if (t.points.length < 2) return; e.save(); e.strokeStyle = t.color; e.lineWidth = 4 / cameraZoom; e.lineCap = 'round'; e.lineJoin = 'round'; e.beginPath(); e.moveTo(t.points[0].x, t.points[0].y); for (let o = 1; o < t.points.length; o++) { e.lineTo(t.points[o].x, t.points[o].y) } e.stroke(); e.restore() }
function getItemPorts(e) {
    if (!['group', 'image', 'box', 'circle', 'textList', 'comment', 'text', 'reroute'].includes(e.type)) return [];
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
        { side: 'left', x: cx + (-t/2)*s, y: cy + (-t/2)*n, item: e },
        { side: 'right', x: cx + (t/2)*s, y: cy + (t/2)*n, item: e },
        { side: 'top', x: cx + (o/2)*n, y: cy + (-o/2)*s, item: e },
        { side: 'bottom', x: cx + (-o/2)*n, y: cy + (o/2)*s, item: e }
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

function getGlobalPortPos(item, side) {
    const ports = getItemPorts(item);
    return ports.find(p => p.side === side);
}

function drawConnectorItem(e) {
    const sourceItem = items.find(i => i.id === e.sourceId);
    if (!sourceItem) return;
    const sourcePortPos = getGlobalPortPos(sourceItem, e.sourcePort);
    if (!sourcePortPos) return;

    let endX = e.endX, endY = e.endY;
    let targetPortPos = null;
    let targetSide = null;
    
    if (e.targetId) {
        const targetItem = items.find(i => i.id === e.targetId);
        if (targetItem) {
            targetPortPos = getGlobalPortPos(targetItem, e.targetPort);
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

    const pushStrength = Math.min(Math.max(Math.hypot(endX - sourcePortPos.x, endY - sourcePortPos.y) / 2, 50), 200);
    
    const getControlPoint = (portX, portY, side, item) => {
        let dx = 0, dy = 0;
        if (side === 'left') dx = -1;
        if (side === 'right') dx = 1;
        if (side === 'top') dy = -1;
        if (side === 'bottom') dy = 1;
        if (item && item.type !== 'reroute') {
           const s = Math.cos(item.rotation || 0);
           const n = Math.sin(item.rotation || 0);
           const rotDx = dx * s - dy * n;
           const rotDy = dx * n + dy * s;
           return { x: portX + rotDx * pushStrength, y: portY + rotDy * pushStrength };
        }
        return { x: portX + dx * pushStrength, y: portY + dy * pushStrength };
    };

    const cp1 = getControlPoint(sourcePortPos.x, sourcePortPos.y, e.sourcePort, sourceItem);
    const cp2 = targetPortPos ? getControlPoint(endX, endY, targetSide, items.find(i => i.id === e.targetId)) : { x: endX, y: endY };
    
    e.cp1 = cp1;
    e.cp2 = cp2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sourcePortPos.x, sourcePortPos.y);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, endX, endY);
    
    ctx.lineWidth = 4 / cameraZoom;
    ctx.strokeStyle = e.color || accentColor;
    
    if (selectedItems.includes(e) || (typeof hoveredConnector !== 'undefined' && hoveredConnector === e)) {
        ctx.save();
        ctx.strokeStyle = invertColor(canvasBackgroundColor);
        ctx.lineWidth = 8 / cameraZoom;
        ctx.stroke();
        ctx.restore();
    }
    
    ctx.stroke();
    ctx.restore();
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
    });
    e.restore();
}

function handleKeyDown(e) {
    const activeEl = document.activeElement;
    if (currentlyEditingText || (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA'))) { return; }
    
    if (e.key === 'Control' || e.key === 'Meta') {
        updateCursor(e);
    }
    
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
    if (key === 'n') { e.preventDefault(); setCurrentTool('comment'); return; }
    if (key === 'k' && !e.ctrlKey) { e.preventDefault(); setCurrentTool('link'); return; }
    if (key === 'l') { e.preventDefault(); setCurrentTool('textList'); return; }
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

function handleKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
        updateCursor(e);
    }
}

function onDoubleClick(e) { 
    const t = screenToWorld(getEventLocation(e)), o = getItemAtPosition(t); 
    if (o && (o.type === 'text' || o.type === 'comment' || o.type === 'textList') && !o.isPinned) {
        editText(o);
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
        accentColor = hexColor;
        updateUIColors();
        saveSettings();
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

        if ((e.ctrlKey || e.metaKey) && hoveredItem && hoveredItem.type === 'reroute') {
             if (e.preventDefault) e.preventDefault();
             items = items.filter(i => i.id !== hoveredItem.id);
             selectedItems = selectedItems.filter(i => i.id !== hoveredItem.id);
             items = items.filter(i => !(i.type === 'connector' && (i.sourceId === hoveredItem.id || i.targetId === hoveredItem.id)));
             updateSelectionToolbar();
             updateLeftBarState();
             saveStateForUndo();
             return;
        }

        if (hoveredPort) {
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
            } else if (currentTool === 'draw') {
                newItem = { id: Date.now(), type: 'stroke', points: [{ x: o.x, y: o.y }], color: accentColor, isPinned: false, x: o.x, y: o.y, width: 0, height: 0, opacity: 1, scaleX: 1, scaleY: 1 };
            }

            if (newItem) {
                addItemToLayeredItems(newItem);
                selectedItems = [newItem];
                bringSelectedToFront();
                if (['textList', 'text', 'comment'].includes(newItem.type)) {
                    setCurrentTool(null);
                }
            }
        } else {
            // Selection / Moving logic
            const itemUnderMouse = getItemAtPosition(o);
            if (itemUnderMouse && itemUnderMouse.type === 'link') {
                if (isLinkButtonHit(itemUnderMouse, o)) {
                    window.open(itemUnderMouse.url, '_blank');
                    return;
                }
            }
            if (itemUnderMouse && itemUnderMouse.type === 'textList') {
                const hitIndex = getCheckboxHitIndex(itemUnderMouse, o);
                if (hitIndex !== -1) {
                    itemUnderMouse.items[hitIndex].completed = !itemUnderMouse.items[hitIndex].completed;
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
}
function onMouseUp(e) { 
    if (e.button === 0) { 
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
        if (isDrawing || isMovingItems || isTransforming || isTransformingArrow) { if (isDrawing) { const e = selectedItems[0]; if (e && (e.type === 'box' || e.type === 'circle' || e.type === 'grid') && (Math.abs(e.width) < 10 || Math.abs(e.height) < 10)) { items = items.filter(t => t.id !== e.id); selectedItems = [] } else if (e && (e.type === 'text' || e.type === 'comment')) { editText(e) } } saveStateForUndo() } if (isSelectingBox) { isSelectingBox = !1; const e = getNormalizedSelectionBox(); selectedItems = items.filter(t => rectsIntersect(getItemBoundingBox(t), e)); updateSelectionToolbar(); updateLeftBarState() } isDrawing = !1; isMovingItems = !1; isTransforming = !1; isTransformingArrow = !1; transformingHandle = null; originalItemState = null 
    } else if (e.button === 1) { 
        isDragging = !1; canvas.classList.remove('grabbing') 
    } 
}
function onMouseMove(e) {
    const worldPos = screenToWorld(getEventLocation(e));
    hoveredItem = getItemAtPosition(worldPos);
    hoveredPort = getHoveredPort(worldPos);
    if (hoveredPort) {
        hoveredItem = hoveredPort.item;
    }
    hoveredConnector = getHoveredConnector(worldPos);

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
        const itemUnderMouse = getItemAtPosition(worldPos);
        
        // Reset ALL link hover states first
        items.forEach(i => { if (i.type === 'link') i.isHovered = false; });

        hoveredGizmo = currentGizmo;
        hoveredArrowHandle = currentArrowHandle;
        updateCursor(e);
    }
}

function updateCursor(e) {
    if (hoveredConnector && (e.ctrlKey || e.metaKey)) {
        canvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>') 10 10, crosshair`;
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
        ctx.restore()
    };

    // Draw in layers to match screen
    items.forEach(e => { if (e.type !== 'comment' && e.type !== 'link') drawItemToCtx(e, l); });
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
        else if (e.type === 'comment') { drawCommentItem(ctx, e) }
        else if (e.type === 'link') { drawLinkItem(ctx, e) }
        ctx.restore()
    };

    // Draw in layers to match screen
    items.forEach(e => { if (e.type !== 'comment' && e.type !== 'link') drawItemToCtx(e, n); });
    items.forEach(e => { if (e.type === 'link') drawItemToCtx(e, n); });
    items.forEach(e => { if (e.type === 'comment') drawItemToCtx(e, n); });

    const l = document.createElement('a');
    l.download = 'moodboard.png';
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
        const usedImageIds = new Set();
        const extractUsedIds = (arr) => {
            arr.forEach(item => {
                if (item.type === 'image' && item.imageId) usedImageIds.add(item.imageId);
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
                        if(blob) {
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
            eJSON.globalImageCache = localCache;
            rootDir.file("data.json", JSON.stringify(eJSON, null, 2));
            zip.generateAsync({type:"blob"}).then(function(content) {
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
    } else if (t.type === 'moodprompt') { 
        eJSON = t.data;
        rootDir.file("data.json", JSON.stringify(eJSON, null, 2));
        zip.generateAsync({type:"blob"}).then(function(content) {
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
function loadFileAsNewTab(fileContent, fileName) { try { const data = JSON.parse(fileContent); const name = fileName.split('.').slice(0, -1).join('.') || 'Loaded Project'; if (data.prompts && Array.isArray(data.prompts)) { const newId = Date.now(); const newProject = { id: newId, type: 'moodprompt', name: name, data: { prompts: data.prompts, canvasBackgroundColor: data.canvasBackgroundColor || '#0d0d0d' } }; projects.push(newProject); renderTabs(); switchTab(newId); showToast("Prompt file loaded successfully."); return } if (data.items && Array.isArray(data.items)) { const newId = Date.now(); const newProject = { id: newId, type: 'moodinfinite', name: name, data: { items: [], cameraOffset: {}, cameraZoom: 1, historyStack: [], historyIndex: -1 } }; projects.push(newProject); activeProjectId = newId; renderTabs(); loadProject(fileContent); return } showToast("Failed to load project. Unknown format.", "error") } catch (err) { console.error("Failed to load project:", err); showToast("Failed to load project. Invalid JSON.", "error") } }
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
                Promise.all(promises).then(() => {
                    data.globalImageCache = globalImageCache;
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

function handleImageUpload(e) { if (!e.target.files) return; const t = screenToWorld({ x: canvas.width / 2, y: canvas.height / 2 }); processFiles(e.target.files, t); imageInput.value = '' }
function handleProjectUpload(e) { const t = e.target.files[0]; if (!t) return; loadFileFromObject(t); projectInput.value = '' }

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
function handleDrop(e) { e.preventDefault(); handleDragLeave(e); if (!e.dataTransfer.files) return; const t = e.dataTransfer.files[0]; if (t && (t.name.endsWith('.json') || t.name.endsWith('.zip') || t.name.endsWith('.mood'))) { loadFileFromObject(t); } else { processFiles(e.dataTransfer.files, screenToWorld(getEventLocation(e))) } }
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
function downloadSourceImage() { if (selectedItems.length !== 1 || selectedItems[0].type !== 'image') return; const e = selectedItems[0], t = document.createElement('a'); t.href = e.img.src; try { const e = new URL(t.href), o = e.pathname.split('/'); t.download = o[o.length - 1] || 'source_image' } catch (e) { t.download = 'source_image.png' } document.body.appendChild(t); t.click(); document.body.removeChild(t); showToast("Source image download started.") }

function copyItems(e = !0) {
    if (selectedItems.length === 0) return;
    clipboard = selectedItems.map(e => {
        const t = JSON.parse(JSON.stringify(e));
        if (e.type === 'image') {
            // Keep imageId for internal copy/paste
            t.imageId = e.imageId;
            // Also keep imgSrc for safety or external paste if we ever support it
            // But for now, let's rely on cache to avoid memory spike
            // t.imgSrc = e.img.src; 
            delete t.img;
        } else if (e.type === 'group') {
            e.items.forEach((e, o) => {
                if (e.type === 'image') {
                    t.items[o].imageId = e.imageId;
                    delete t.items[o].img;
                }
            })
        }
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

function deleteSelectedItems() { if (selectedItems.length > 0) { const e = new Set(selectedItems.map(e => e.id)); items = items.filter(t => !e.has(t.id)); selectedItems = []; updateSelectionToolbar(); updateLeftBarState(); saveStateForUndo() } }
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

function duplicateItems() {
    if (selectedItems.length === 0) return;
    const e = selectedItems, t = [], o = 20 / cameraZoom;
    e.forEach(e => {
        const a = JSON.parse(JSON.stringify(e));
        a.id = Date.now() + Math.random();
        a.isPinned = !1;
        reattachImages(e, a);
        a.x += o;
        a.y += o;
        if (a.type === 'arrow' || a.type === 'measure') { a.startX += o; a.startY += o; a.endX += o; a.endY += o }
        else if (a.type === 'stroke') { a.points.forEach(e => { e.x += o; e.y += o }) }
        addItemToLayeredItems(a);
        t.push(a)
    });
    selectedItems = t;
    updateSelectionToolbar();
    updateLeftBarState();
    saveStateForUndo();
    showToast(`${t.length} item${t.length > 1 ? 's' : ''} duplicated.`)
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
function setCurrentTool(e) {
    console.log('setCurrentTool called with:', e);
    if (currentTool === e && e !== null) { return }
    currentTool = e;
    const buttons = document.querySelectorAll('#left-bar .tool-button');
    console.log('Found', buttons.length, 'tool buttons');
    buttons.forEach(btn => btn.classList.remove('active'));
    canvas.classList.remove('eyedropper-active');
    
    if (currentTool === null) {
        if (selectToolBtn) selectToolBtn.classList.add('active');
    } else if (currentTool === 'arrow') {
        if (addArrowBtn) addArrowBtn.classList.add('active');
    } else if (currentTool === 'text') {
        if (addTextBtn) addTextBtn.classList.add('active');
    } else if (currentTool === 'comment') {
        if (addCommentBtn) addCommentBtn.classList.add('active');
    } else if (currentTool === 'link') {
        if (addLinkBtn) addLinkBtn.classList.add('active');
    } else if (currentTool === 'box') {
        if (addBoxBtn) addBoxBtn.classList.add('active');
    } else if (currentTool === 'circle') {
        if (addCircleBtn) addCircleBtn.classList.add('active');
    } else if (currentTool === 'measure') {
        if (addMeasureBtn) addMeasureBtn.classList.add('active');
    } else if (currentTool === 'grid') {
        if (addGridBtn) addGridBtn.classList.add('active');
    } else if (currentTool === 'textList') {
        if (addTextListBtn) addTextListBtn.classList.add('active');
    } else if (currentTool === 'draw') {
        if (drawBtn) drawBtn.classList.add('active');
    } else if (currentTool === 'eyedropper') {
        if (eyedropperBtn) {
            eyedropperBtn.classList.add('active');
            canvas.classList.add('eyedropper-active');
        }
    }
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
    ctx.font = `${t} ${o} ${e.fontSize}px '${a}', sans-serif`; 
    let maxW = 0; 
    (e.items || []).forEach(item => { 
        const m = ctx.measureText(item.text); 
        if (m.width > maxW) maxW = m.width; 
    }); 
    const checkboxArea = e.fontSize * 1.1 + 10;
    e.width = maxW + checkboxArea + 30; 
    const h = e.fontSize * 1.5;
    e.height = (e.items || []).length * h + 30; 
    ctx.restore(); 
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
                noteBgColorInput.style.display = 'block';
                noteBgColorInput.value = selectedItems[0].bgColor || '#ffffff';
            } else {
                noteBgColorInput.style.display = 'none';
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
    } else {
        selectionToolbar.style.display = 'none';
        itemColorToolContainer.style.display = 'none';
        textToolsContainer.style.display = 'none';
        gridToolsContainer.style.display = 'none';
        measureToolsContainer.style.display = 'none';
        iconToolsContainer.style.display = 'none';
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

function updateToolbarPosition() { if (selectedItems.length > 0) { const e = getCollectiveBoundingBox(selectedItems), t = worldToScreen({ x: e.x + e.width / 2, y: e.y }); selectionToolbar.style.left = `${t.x}px`; selectionToolbar.style.top = `${t.y}px` } }
function editText(e) {
    if (e.type === 'text') {
        currentlyEditingText = e;
        e.isHidden = true;
        noteEditorOverlay.style.display = 'flex';
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
    Object.assign(textEditor.style, { display: 'block', left: `${t.x}px`, top: `${t.y}px`, width: `${o}px`, height: 'auto', transform: `rotate(${e.rotation}rad)`, transformOrigin: 'top left', color: e.type === 'comment' ? (getLuminance(e.color) > 0.5 ? '#111' : '#fff') : e.color, backgroundColor: e.type === 'comment' ? e.color : hexToRgba(e.color, .1), borderRadius: e.type === 'comment' ? `${12 * cameraZoom}px` : '0px', padding: e.type === 'comment' ? '8px 15px' : '0px', paddingLeft: e.type === 'comment' && e.icon && e.icon !== 'none' ? `${e.fontSize * 1.2 * cameraZoom  + 20}px` : (e.type === 'comment' ? '15px' : '0px'), fontSize: `${e.fontSize * cameraZoom}px`, fontFamily: e.fontFamily || 'Nunito', textAlign: e.textAlign || 'center', fontWeight: e.fontWeight || 'bold', fontStyle: e.fontStyle || 'normal', lineHeight: e.type === 'comment' ? '1.4' : 'normal' });
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
        testCtx.font = `bold 16px Nunito`;
        const titleLines = wrapText(testCtx, item.title, maxWidth);
        totalH += titleLines.length * 22;
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
function finishEditingText() { if (currentlyEditingText) { if (currentlyEditingText.type === 'text') return; currentlyEditingText.text = textEditor.value.trim() || (currentlyEditingText.type === 'comment' ? "Note..." : "Type..."); const e = currentlyEditingText; if (e.type === 'comment') { updateCommentDimensions(e); } else if (e.type === 'textList') { const lines = textEditor.value.split('\n').filter(l => l.trim() !== ""); if (lines.length === 0) lines.push("Item 1"); const oldItems = e.items || []; e.items = lines.map((l, i) => ({ text: l, completed: (oldItems[i] && oldItems[i].text === l) ? oldItems[i].completed : false })); updateTextListDimensions(e); } else { const t = e.fontStyle || 'normal', o = e.fontWeight || 'bold', a = e.fontFamily || 'Nunito'; ctx.font = `${t} ${o} ${e.fontSize}px '${a}', sans-serif`; const i = textEditor.value.split('\n'); let r = 0; i.forEach(e => { const t = ctx.measureText(e); if (t.width > r) r = t.width }); e.width = r + 20; e.height = textEditor.scrollHeight / cameraZoom; } currentlyEditingText.isHidden = !1; selectedItems = [currentlyEditingText]; saveStateForUndo(); currentlyEditingText = null } textEditor.style.display = 'none'; textEditor.style.padding = '0'; textEditor.style.lineHeight = 'normal'; }
function autoResizeTextEditor() { textEditor.style.height = 'auto'; textEditor.style.height = textEditor.scrollHeight + 'px' }
function saveStateForUndo() { const e = JSON.stringify(items, (e, t) => { if (e === 'img') { return undefined } return t }); if (historyIndex < historyStack.length - 1) { historyStack = historyStack.slice(0, historyIndex + 1) } if (historyStack.length > 0 && historyStack[historyStack.length - 1] === e) return; historyStack.push(e); historyIndex++; if (historyStack.length > HISTORY_LIMIT) { historyStack.shift(); historyIndex-- } scheduleAutoSave(); }
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
function groupSelectedItems() { if (selectedItems.length <= 1) return; saveStateForUndo(); const e = []; selectedItems.forEach(t => { if (t.type === 'group') { const o = t.x + t.width / 2, a = t.y + t.height / 2, i = Math.cos(t.rotation), r = Math.sin(t.rotation); t.items.forEach(s => { const n = JSON.parse(JSON.stringify(s)); reattachImages(s, n); const l = s.x + s.width / 2, c = s.y + s.height / 2, d = l - t.width / 2, h = c - t.height / 2, p = d * i - h * r, m = d * r + h * i, u = o + p, g = a + m; n.x = u - s.width / 2; n.y = g - s.height / 2; n.rotation = (s.rotation || 0) + t.rotation; if (n.type === 'arrow' || n.type === 'stroke' || n.type === 'measure') { const e = (e, l) => { const c = t.x + e.x, d = t.y + e.y, h = c - o, p = d - a, m = h * i - p * r, u = h * r + p * i; return { x: o + m, y: a + u } }; if (n.type === 'arrow' || n.type === 'measure') { const t = e({ x: s.startX - s.x, y: s.startY - s.y }), o = e({ x: s.endX - s.x, y: s.endY - s.y }); n.startX = t.x; n.startY = t.y; n.endX = o.x; n.endY = o.y } else { n.points = s.points.map(t => e({ x: t.x - s.x, y: t.y - s.y })) } } e.push(n) }) } else { e.push(t) } }); const t = getCollectiveBoundingBox(e), o = { id: Date.now(), type: 'group', x: t.x, y: t.y, width: t.width, height: t.height, rotation: 0, isPinned: !1, opacity: 1, scaleX: 1, scaleY: 1, items: [] }; e.forEach(e => { const t = JSON.parse(JSON.stringify(e)); reattachImages(e, t); t.x -= o.x; t.y -= o.y; if (t.type === 'arrow' || t.type === 'measure') { t.startX -= o.x; t.startY -= o.y; t.endX -= o.x; t.endY -= o.y } else if (t.type === 'stroke') { t.points.forEach(e => { e.x -= o.x; e.y -= o.y }) } o.items.push(t) });     const a = new Set(selectedItems.map(e => e.id));
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
            if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt')) { 
                canvasBackgroundColor = palette.bg; 
                if (activeProject.type === 'moodinfinite') { 
                    accentColor = palette.accent; 
                    gridColor = palette.grid; 
                } 
                updateUIColors();
            }
        });

        option.addEventListener('mouseleave', () => {
            const activeProject = projects.find(p => p.id === activeProjectId); 
            if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt')) {
                canvasBackgroundColor = activeProject.data.canvasBackgroundColor || '#0d0d0d';
                if (activeProject.type === 'moodinfinite') {
                    accentColor = activeProject.data.accentColor || '#429eff';
                    gridColor = activeProject.data.gridColor || '#f9f8f6';
                }
                updateUIColors();
            }
        });

        option.addEventListener('click', () => { 
            const activeProject = projects.find(p => p.id === activeProjectId); 
            if (activeProject && (activeProject.type === 'moodinfinite' || activeProject.type === 'moodprompt')) { 
                activeProject.data.canvasBackgroundColor = palette.bg; 
                canvasBackgroundColor = palette.bg; 
                if (activeProject.type === 'moodinfinite') { 
                    activeProject.data.accentColor = palette.accent; 
                    activeProject.data.gridColor = palette.grid; 
                    accentColor = palette.accent; 
                    gridColor = palette.grid; 
                } 
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
        if (item.type === 'connector' && item.cp1 && item.cp2) {
            const steps = 20;
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const x = (1-t)**3 * item.computedStartX + 3*(1-t)**2 * t * item.cp1.x + 3*(1-t) * t**2 * item.cp2.x + t**3 * item.computedEndX;
                const y = (1-t)**3 * item.computedStartY + 3*(1-t)**2 * t * item.cp1.y + 3*(1-t) * t**2 * item.cp2.y + t**3 * item.computedEndY;
                if (Math.hypot(x - mousePos.x, y - mousePos.y) <= hitRadius) return item;
            }
        }
    }
    return null;
}

function getItemAtPosition(e) {
    if (!e) return null;
    const checkItem = (o) => {
        const a = getItemBoundingBox(o);
        if (e.x >= a.x && e.x <= a.x + a.width && e.y >= a.y && e.y <= a.y + a.height) {
            if (o.type === 'group') {
                const t = o.x + o.width / 2, a = o.y + o.height / 2, i = e.x - t, r = e.y - a, s = Math.cos(-o.rotation), n = Math.sin(-o.rotation), l = i * s - r * n, c = i * n + r * s, d = l + t - o.x, h = c + a - o.y;
                for (let e = o.items.length - 1; e >= 0; e--) {
                    const t = o.items[e], a = { x: t.x, y: t.y, width: t.width, height: t.height };
                    if (d >= a.x && d <= a.x + a.width && h >= a.y && h <= a.y + a.height) return o;
                }
            }
            if (o.type === 'stroke' || o.type === 'arrow' || o.type === 'measure') {
                const a = getItemBoundingBox(o);
                if (e.x >= a.x - 10 / cameraZoom && e.x <= a.x + a.width + 10 / cameraZoom && e.y >= a.y - 10 / cameraZoom && e.y <= a.y + a.height + 10 / cameraZoom) {
                    if (o.type === 'stroke') {
                        for (let t = 0; t < o.points.length - 1; t++) { if (Math.sqrt(distToSegmentSquared(e, o.points[t], o.points[t + 1])) < 10 / cameraZoom) return o }
                    } else if (o.type === 'arrow' || o.type === 'measure') {
                        if (Math.sqrt(distToSegmentSquared(e, { x: o.startX, y: o.startY }, { x: o.endX, y: o.endY })) < 10 / cameraZoom) return o }
                }
            } else {
                const t = o.x + o.width / 2, a = o.y + o.height / 2, i = e.x - t, r = e.y - a, s = -o.rotation, n = i * Math.cos(s) - r * Math.sin(s), l = i * Math.sin(s) + r * Math.cos(s);
                if (n > -o.width / 2 && n < o.width / 2 && l > -o.height / 2 && l < o.height / 2) return o
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
function getItemBoundingBox(e) { if (e.type === 'connector') { return { x: -999999, y: -999999, width: 0, height: 0 } } if (e.type === 'group') { if (!e.items || e.items.length === 0) { return { x: e.x, y: e.y, width: e.width, height: e.height } } let t = Infinity, o = Infinity, a = -Infinity, i = -Infinity; const r = e.x + e.width / 2, s = e.y + e.height / 2, n = Math.cos(e.rotation), l = Math.sin(e.rotation); e.items.forEach(c => { const d = getItemBoundingBox(c), h = [{ x: d.x, y: d.y }, { x: d.x + d.width, y: d.y }, { x: d.x + d.width, y: d.y + d.height }, { x: d.x, y: d.y + d.height }]; h.forEach(c => { const d = (e.x + c.x) - r, h = (e.y + c.y) - s, p = d * n - h * l, m = d * l + h * n, u = r + p, g = s + m; t = Math.min(t, u); o = Math.min(o, g); a = Math.max(a, u); i = Math.max(i, g) }) }); return { x: t, y: o, width: a - t, height: i - o } } if (e.type === 'stroke') { let t = Infinity, o = Infinity, a = -Infinity, i = -Infinity; if (e.points && e.points.length > 0) { e.points.forEach(e => { t = Math.min(t, e.x); o = Math.min(o, e.y); a = Math.max(a, e.x); i = Math.max(i, e.y) }); return { x: t, y: o, width: a - t, height: i - o } } return { x: e.x, y: e.y, width: 0, height: 0 } } if (e.type === 'arrow' || e.type === 'measure') { return { x: Math.min(e.startX, e.endX), y: Math.min(e.startY, e.endY), width: Math.abs(e.startX - e.endX), height: Math.abs(e.startY - e.endY) } } const t = e.width, o = e.height, a = e.x + t / 2, i = e.y + o / 2, r = e.rotation, s = Math.cos(r), n = Math.sin(r); let l = Infinity, c = Infinity, d = -Infinity, h = -Infinity;[{ x: -t / 2, y: -o / 2 }, { x: t / 2, y: -o / 2 }, { x: t / 2, y: o / 2 }, { x: -t / 2, y: o / 2 }].forEach(e => { const t = e.x * s - e.y * n + a, o = e.x * n + e.y * s + i; l = Math.min(l, t); c = Math.min(c, o); d = Math.max(d, t); h = Math.max(h, o) }); return { x: l, y: c, width: d - l, height: h - c } }
function rectsIntersect(e, t) { return !(t.x > e.x + e.width || t.x + t.width < e.x || t.y > e.y + e.height || t.y + t.height < e.y) }
function getNormalizedSelectionBox() { return { x: Math.min(selectionBox.startX, selectionBox.endX), y: Math.min(selectionBox.startY, selectionBox.endY), width: Math.abs(selectionBox.startX - selectionBox.endX), height: Math.abs(selectionBox.startY - selectionBox.endY) } }
function hexToRgba(e, t) { let o = 0, a = 0, i = 0; if (e.length == 4) { o = "0x" + e[1] + e[1]; a = "0x" + e[2] + e[2]; i = "0x" + e[3] + e[3] } else if (e.length == 7) { o = "0x" + e[1] + e[2]; a = "0x" + e[3] + e[4]; i = "0x" + e[5] + e[6] } return `rgba(${+o},${+a},${+i},${t})` }
function rgbToHex(e, t, o) { return "#" + ((1 << 24) + (e << 16) + (t << 8) + o).toString(16).slice(1) }
function distSq(e, t) { return Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2) }
function distToSegmentSquared(e, t, o) { const a = distSq(t, o); if (a === 0) return distSq(e, t); let i = ((e.x - t.x) * (o.x - t.x) + (e.y - t.y) * (o.y - t.y)) / a; i = Math.max(0, Math.min(1, i)); return distSq(e, { x: t.x + i * (o.x - t.x), y: t.y + i * (o.y - t.y) }) }
function invertColor(e) { if (e.indexOf('#') === 0) e = e.slice(1); if (e.length === 3) e = e[0] + e[0] + e[1] + e[1] + e[2] + e[2]; if (e.length !== 6) return '#ffffff'; const t = (255 - parseInt(e.slice(0, 2), 16)).toString(16), o = (255 - parseInt(e.slice(2, 4), 16)).toString(16), a = (255 - parseInt(e.slice(4, 6), 16)).toString(16); return '#' + padZero(t) + padZero(o) + padZero(a) }
function padZero(e, t) { t = t || 2; const o = (new Array(t + 1)).join('0'); return (o + e).slice(-t) }
function adjustZoom(e, t) { if (isDragging) return; const evLoc = getEventLocation(e); if (!evLoc) return; const o = screenToWorld(evLoc); cameraZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraZoom * (1 + t))); const a = screenToWorld(getEventLocation(e)); cameraOffset.x += a.x - o.x; cameraOffset.y += a.y - o.y }

cancelNoteBtn.onclick = cancelNoteEditing;
confirmNoteBtn.onclick = finishNoteEditing;

function applyNoteFormat(fmt) {
    if (!noteBodyInput) return;
    const start = noteBodyInput.selectionStart;
    const end = noteBodyInput.selectionEnd;
    const text = noteBodyInput.value;
    const selectedText = text.substring(start, end);
    let replacement = "";

    switch(fmt) {
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
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            finishNoteEditing();
        }
    });
}

loadSettings();
setupEventListeners();
buildPaletteMenu();

window.localforage.getItem('moodinfinite_cache').then(cache => {
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

    for (let i = 0; i < (item.items || []).length; i++) {
        const itemY = padding + i * h;
        const cbY = itemY + (h - checkboxSize) / 2;
        const cbX = padding;
        
        if (localX >= cbX - 5 && localX <= cbX + checkboxSize + 5 && 
            localY >= cbY - 5 && localY <= cbY + checkboxSize + 5) {
            return i;
        }
    }
    return -1;
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
