/**
 * Moodlist — Google Keep–style note/checklist cards
 * ===================================================
 * Self-contained module. All state lives inside the active project's data.
 * Data shape: { cards: [ { id, title, color, pinned, image, items: [{ id, text, checked }] } ] }
 */

/* ─── MOODLIST COLORS ──────────────────────────────────────────────────── */
const MOODLIST_COLORS = [
    { label: 'Default',  value: '' },
    { label: 'Red',      value: '#4a1c1c' },
    { label: 'Orange',   value: '#4a2e1c' },
    { label: 'Yellow',   value: '#3d3a10' },
    { label: 'Green',    value: '#163d20' },
    { label: 'Teal',     value: '#0f3030' },
    { label: 'Blue',     value: '#0f2040' },
    { label: 'Indigo',   value: '#1e1650' },
    { label: 'Purple',   value: '#2e1050' },
    { label: 'Pink',     value: '#4a1040' },
    { label: 'Graphite', value: '#2a2a2a' },
];

/* ─── UNIQUE ID ─────────────────────────────────────────────────────────── */
function mlId() { return Date.now() + '_' + Math.random().toString(36).slice(2, 9); }

/* ─── MAIN RENDER ───────────────────────────────────────────────────────── */
function renderMoodlistView(project) {
    const container = document.getElementById('moodlist-container');
    if (!container) return;

    if (!project.data.cards) project.data.cards = [];

    // Build or reuse layout
    let topBar    = container.querySelector('.ml-top-bar');
    let grid      = container.querySelector('.ml-grid');
    let addPanel  = container.querySelector('.ml-add-panel');

    if (!topBar) {
        container.innerHTML = '';

        /* ── Top bar ─────────────────────────────────────────────────────── */
        topBar = document.createElement('div');
        topBar.className = 'ml-top-bar';
        topBar.innerHTML = `
            <div class="ml-top-bar-left">
                <iconify-icon icon="lucide:list-check" width="20" height="20"
                    style="color:var(--switch-bg-checked);"></iconify-icon>
                <span class="ml-top-title">Moodlist</span>
            </div>
            <div class="ml-top-bar-right">
                <div class="ml-search-wrap">
                    <iconify-icon icon="lucide:search" width="14" height="14"></iconify-icon>
                    <input type="text" class="ml-search" placeholder="Search cards…">
                </div>
                <label class="ml-view-toggle" title="Toggle pinned">
                    <input type="checkbox" class="ml-show-pinned" checked>
                    <iconify-icon icon="lucide:pin" width="14" height="14"></iconify-icon>
                    <span>Pinned</span>
                </label>
            </div>
        `;
        container.appendChild(topBar);

        /* ── Quick add panel ─────────────────────────────────────────────── */
        addPanel = document.createElement('div');
        addPanel.className = 'ml-add-panel-wrap';
        addPanel.innerHTML = `
            <div class="ml-add-panel">
                <div class="ml-add-body">
                    <input class="ml-add-title"  type="text" placeholder="Title (optional)">
                    <div class="ml-add-items"></div>
                    <button class="ml-add-item-btn">
                        <iconify-icon icon="lucide:plus" width="14" height="14"></iconify-icon> Add item
                    </button>
                </div>
                <div class="ml-add-footer">
                    <div class="ml-add-actions-left">
                        <label class="ml-icon-btn" title="Attach image">
                            <iconify-icon icon="lucide:image" width="16" height="16"></iconify-icon>
                            <input type="file" accept="image/*" class="ml-img-input" style="display:none">
                        </label>
                        <div class="ml-color-picker-wrap">
                            <button class="ml-icon-btn ml-color-btn" title="Card color">
                                <iconify-icon icon="lucide:palette" width="16" height="16"></iconify-icon>
                            </button>
                            <div class="ml-color-picker" style="display:none"></div>
                        </div>
                    </div>
                    <div class="ml-add-actions-right">
                        <button class="ml-add-pin-btn ml-icon-btn" title="Pin card">
                            <iconify-icon icon="lucide:pin" width="16" height="16"></iconify-icon>
                        </button>
                        <button class="ml-save-btn">Add card</button>
                    </div>
                </div>
                <div class="ml-add-preview-img" style="display:none">
                    <img class="ml-add-img" src="" alt="">
                    <button class="ml-remove-img-btn" title="Remove image">
                        <iconify-icon icon="lucide:x" width="14" height="14"></iconify-icon>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(addPanel);
        _wireAddPanel(addPanel, project, () => renderMoodlistCards(project, grid));

        /* ── Card grid ───────────────────────────────────────────────────── */
        grid = document.createElement('div');
        grid.className = 'ml-grid';
        container.appendChild(grid);

        /* ── Search + filter ─────────────────────────────────────────────── */
        topBar.querySelector('.ml-search').addEventListener('input', () => {
            renderMoodlistCards(project, grid);
        });
        topBar.querySelector('.ml-show-pinned').addEventListener('change', () => {
            renderMoodlistCards(project, grid);
        });
    }

    renderMoodlistCards(project, grid);
}

/* ─── WIRE ADD PANEL ────────────────────────────────────────────────────── */
function _wireAddPanel(panel, project, onSave) {
    let pendingColor = '';
    let pendingPinned = false;
    let pendingImgDataUrl = null;

    const titleInput   = panel.querySelector('.ml-add-title');
    const itemsDiv     = panel.querySelector('.ml-add-items');
    const addItemBtn   = panel.querySelector('.ml-add-item-btn');
    const saveBtn      = panel.querySelector('.ml-save-btn');
    const imgInput     = panel.querySelector('.ml-img-input');
    const colorBtn     = panel.querySelector('.ml-color-btn');
    const colorPicker  = panel.querySelector('.ml-color-picker');
    const pinBtn       = panel.querySelector('.ml-add-pin-btn');
    const previewWrap  = panel.querySelector('.ml-add-preview-img');
    const previewImg   = panel.querySelector('.ml-add-img');
    const removeImgBtn = panel.querySelector('.ml-remove-img-btn');

    // Build color picker swatches
    colorPicker.innerHTML = MOODLIST_COLORS.map(c => `
        <button class="ml-swatch${c.value === '' ? ' default' : ''}"
            style="background:${c.value || 'var(--bg-ui-hover)'}"
            data-color="${c.value}" title="${c.label}"></button>
    `).join('');

    colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        colorPicker.style.display = colorPicker.style.display === 'none' ? 'flex' : 'none';
    });
    colorPicker.addEventListener('click', (e) => {
        const swatch = e.target.closest('.ml-swatch');
        if (!swatch) return;
        pendingColor = swatch.dataset.color;
        panel.querySelector('.ml-add-panel').style.background = pendingColor
            ? pendingColor
            : '';
        colorPicker.style.display = 'none';
    });
    document.addEventListener('click', () => { colorPicker.style.display = 'none'; });

    pinBtn.addEventListener('click', () => {
        pendingPinned = !pendingPinned;
        pinBtn.classList.toggle('active', pendingPinned);
    });

    function addItemRow(text = '') {
        const row = document.createElement('div');
        row.className = 'ml-add-item-row';
        row.innerHTML = `
            <span class="ml-check-placeholder"><iconify-icon icon="lucide:circle" width="14" height="14"></iconify-icon></span>
            <input type="text" class="ml-item-text" placeholder="List item…" value="${_escapeAttr(text)}">
            <button class="ml-item-del"><iconify-icon icon="lucide:x" width="12" height="12"></iconify-icon></button>
        `;
        row.querySelector('.ml-item-del').addEventListener('click', () => row.remove());
        row.querySelector('.ml-item-text').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addItemRow(); }
        });
        itemsDiv.appendChild(row);
        row.querySelector('.ml-item-text').focus();
    }

    addItemBtn.addEventListener('click', () => addItemRow());
    // Add a starter row
    addItemRow();

    imgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            pendingImgDataUrl = ev.target.result;
            previewImg.src = ev.target.result;
            previewWrap.style.display = 'flex';
        };
        reader.readAsDataURL(file);
        imgInput.value = '';
    });

    removeImgBtn.addEventListener('click', () => {
        pendingImgDataUrl = null;
        previewWrap.style.display = 'none';
        previewImg.src = '';
    });

    saveBtn.addEventListener('click', () => {
        const items = Array.from(itemsDiv.querySelectorAll('.ml-add-item-row'))
            .map(r => ({ id: mlId(), text: r.querySelector('.ml-item-text').value.trim(), checked: false }))
            .filter(i => i.text);

        if (!titleInput.value.trim() && items.length === 0 && !pendingImgDataUrl) return;

        const card = {
            id: mlId(),
            title: titleInput.value.trim(),
            color: pendingColor,
            pinned: pendingPinned,
            image: pendingImgDataUrl || null,
            items,
        };
        project.data.cards.unshift(card);

        // reset
        titleInput.value = '';
        itemsDiv.innerHTML = '';
        addItemRow();
        pendingColor = '';
        pendingPinned = false;
        pendingImgDataUrl = null;
        previewWrap.style.display = 'none';
        previewImg.src = '';
        panel.querySelector('.ml-add-panel').style.background = '';
        pinBtn.classList.remove('active');

        scheduleAutoSave();
        onSave();
    });

    titleInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveBtn.click();
    });
}

/* ─── RENDER CARDS ──────────────────────────────────────────────────────── */
function renderMoodlistCards(project, grid) {
    const container = document.getElementById('moodlist-container');
    const searchInput = container?.querySelector('.ml-search');
    const showPinnedToggle = container?.querySelector('.ml-show-pinned');

    const query = (searchInput?.value || '').toLowerCase().trim();
    const showOnlyPinned = showPinnedToggle && !showPinnedToggle.checked ? false : null;

    let cards = project.data.cards || [];

    // Filter
    if (query) {
        cards = cards.filter(c =>
            c.title.toLowerCase().includes(query) ||
            c.items.some(i => i.text.toLowerCase().includes(query))
        );
    }

    const pinned = cards.filter(c => c.pinned);
    const rest   = cards.filter(c => !c.pinned);
    const ordered = [...pinned, ...rest];

    grid.innerHTML = '';

    if (ordered.length === 0) {
        grid.innerHTML = `
            <div class="ml-empty">
                <iconify-icon icon="lucide:list-check" width="48" height="48"></iconify-icon>
                <p>No cards yet. Add one above!</p>
            </div>
        `;
        return;
    }

    if (pinned.length > 0 && rest.length > 0) {
        const pinnedLabel = document.createElement('div');
        pinnedLabel.className = 'ml-section-label';
        pinnedLabel.innerHTML = `<iconify-icon icon="lucide:pin" width="12" height="12"></iconify-icon> Pinned`;
        grid.appendChild(pinnedLabel);
    }

    pinned.forEach(card => grid.appendChild(_buildCard(card, project, grid)));

    if (pinned.length > 0 && rest.length > 0) {
        const othersLabel = document.createElement('div');
        othersLabel.className = 'ml-section-label';
        othersLabel.textContent = 'Others';
        grid.appendChild(othersLabel);
    }

    rest.forEach(card => grid.appendChild(_buildCard(card, project, grid)));
}

/* ─── BUILD SINGLE CARD ─────────────────────────────────────────────────── */
function _buildCard(card, project, grid) {
    const el = document.createElement('div');
    el.className = 'ml-card';
    el.dataset.id = card.id;
    if (card.color) el.style.background = card.color;
    if (card.pinned) el.classList.add('pinned');

    // Image section
    const imgHtml = card.image ? `
        <div class="ml-card-img-wrap">
            <img src="${card.image}" class="ml-card-img" alt="">
        </div>
    ` : '';

    // Items
    const itemsHtml = card.items.map(item => `
        <div class="ml-card-item${item.checked ? ' checked' : ''}" data-item-id="${item.id}" draggable="true">
            <span class="ml-drag-handle" title="Drag to reorder">
                <iconify-icon icon="lucide:grip-vertical" width="14" height="14"></iconify-icon>
            </span>
            <span class="ml-card-checkbox">
                <iconify-icon icon="${item.checked ? 'lucide:check-square' : 'lucide:square'}" width="15" height="15"></iconify-icon>
            </span>
            <span class="ml-card-item-text">${_escapeHtml(item.text)}</span>
            <button class="ml-card-item-del" title="Delete item" tabindex="-1">
                <iconify-icon icon="lucide:x" width="12" height="12"></iconify-icon>
            </button>
        </div>
    `).join('');

    const pinnedIcon = card.pinned
        ? `<iconify-icon icon="lucide:pin" width="14" height="14" style="color:var(--switch-bg-checked)"></iconify-icon>`
        : `<iconify-icon icon="lucide:pin" width="14" height="14"></iconify-icon>`;

    el.innerHTML = `
        ${imgHtml}
        <div class="ml-card-body">
            ${card.title ? `<div class="ml-card-title" contenteditable="true" spellcheck="false">${_escapeHtml(card.title)}</div>` : `<div class="ml-card-title empty" contenteditable="true" spellcheck="false" data-placeholder="Title…"></div>`}
            <div class="ml-card-items">${itemsHtml}</div>
            <div class="ml-card-add-item">
                <iconify-icon icon="lucide:plus" width="13" height="13"></iconify-icon>
                <span>Add item</span>
            </div>
        </div>
        <div class="ml-card-footer">
            <div class="ml-card-actions">
                <button class="ml-card-btn ml-pin-btn" title="${card.pinned ? 'Unpin' : 'Pin'}">${pinnedIcon}</button>
                <label class="ml-card-btn" title="Add image">
                    <iconify-icon icon="lucide:image" width="14" height="14"></iconify-icon>
                    <input type="file" accept="image/*" class="ml-card-img-input" style="display:none">
                </label>
                <div class="ml-card-color-wrap">
                    <button class="ml-card-btn ml-card-color-btn" title="Color">
                        <iconify-icon icon="lucide:palette" width="14" height="14"></iconify-icon>
                    </button>
                    <div class="ml-color-picker" style="display:none"></div>
                </div>
            </div>
            <button class="ml-card-btn ml-card-delete-btn" title="Delete card">
                <iconify-icon icon="lucide:trash-2" width="14" height="14"></iconify-icon>
            </button>
        </div>
    `;

    _wireCard(el, card, project, grid);
    return el;
}

/* ─── WIRE CARD INTERACTIONS ────────────────────────────────────────────── */
function _wireCard(el, card, project, grid) {
    // Toggle checkboxes + delete item buttons
    el.querySelectorAll('.ml-card-item').forEach(itemEl => {
        itemEl.addEventListener('click', (e) => {
            if (e.target.closest('.ml-card-item-del')) return;
            const item = card.items.find(i => i.id === itemEl.dataset.itemId);
            if (item) {
                item.checked = !item.checked;
                scheduleAutoSave();
                renderMoodlistCards(project, grid);
            }
        });
        itemEl.querySelector('.ml-card-item-del')?.addEventListener('click', (e) => {
            e.stopPropagation();
            card.items = card.items.filter(i => i.id !== itemEl.dataset.itemId);
            scheduleAutoSave();
            renderMoodlistCards(project, grid);
        });
    });

    // Editable title
    const titleEl = el.querySelector('.ml-card-title');
    titleEl.addEventListener('blur', () => {
        card.title = titleEl.textContent.trim();
        if (card.title) titleEl.classList.remove('empty');
        else titleEl.classList.add('empty');
        scheduleAutoSave();
    });
    titleEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });

    // Inline add item
    el.querySelector('.ml-card-add-item').addEventListener('click', () => {
        const itemsContainer = el.querySelector('.ml-card-items');

        const input = document.createElement('div');
        input.className = 'ml-card-inline-add';
        input.innerHTML = `
            <span class="ml-check-placeholder"><iconify-icon icon="lucide:circle" width="14" height="14"></iconify-icon></span>
            <input type="text" placeholder="New item…" class="ml-inline-input">
        `;
        itemsContainer.appendChild(input);
        const inp = input.querySelector('.ml-inline-input');
        inp.focus();

        let anyAdded = false;

        const addInPlace = () => {
            const text = inp.value.trim();
            if (!text) return;

            // 1. Push to data
            const newItem = { id: mlId(), text, checked: false };
            card.items.push(newItem);
            scheduleAutoSave();
            anyAdded = true;

            // 2. Insert a visible row immediately BEFORE the inline input
            const row = document.createElement('div');
            row.className = 'ml-card-item';
            row.dataset.itemId = newItem.id;
            row.innerHTML = `
                <span class="ml-drag-handle" title="Drag to reorder">
                    <iconify-icon icon="lucide:grip-vertical" width="14" height="14"></iconify-icon>
                </span>
                <span class="ml-card-checkbox">
                    <iconify-icon icon="lucide:square" width="15" height="15"></iconify-icon>
                </span>
                <span class="ml-card-item-text">${_escapeHtml(text)}</span>
                <button class="ml-card-item-del" title="Delete item" tabindex="-1">
                    <iconify-icon icon="lucide:x" width="12" height="12"></iconify-icon>
                </button>
            `;
            row.addEventListener('click', (e) => {
                if (e.target.closest('.ml-card-item-del')) return;
                newItem.checked = !newItem.checked;
                row.classList.toggle('checked', newItem.checked);
                row.querySelector('.ml-card-checkbox iconify-icon').setAttribute('icon',
                    newItem.checked ? 'lucide:check-square' : 'lucide:square');
                scheduleAutoSave();
            });
            row.querySelector('.ml-card-item-del').addEventListener('click', (e) => {
                e.stopPropagation();
                card.items = card.items.filter(i => i.id !== newItem.id);
                row.remove();
                scheduleAutoSave();
            });
            itemsContainer.insertBefore(row, input);

            // 3. Clear field, keep focus
            inp.value = '';
        };

        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addInPlace(); }
            if (e.key === 'Escape') {
                input.remove();
                if (anyAdded) renderMoodlistCards(project, grid);
            }
        });

        inp.addEventListener('blur', () => {
            const text = inp.value.trim();
            if (text) {
                card.items.push({ id: mlId(), text, checked: false });
                scheduleAutoSave();
                anyAdded = true;
            }
            if (anyAdded) {
                renderMoodlistCards(project, grid);
            } else {
                input.remove();
            }
        });
    });

    // Pin toggle
    el.querySelector('.ml-pin-btn').addEventListener('click', () => {
        card.pinned = !card.pinned;
        scheduleAutoSave();
        renderMoodlistCards(project, grid);
    });

    // Delete card
    el.querySelector('.ml-card-delete-btn').addEventListener('click', () => {
        project.data.cards = project.data.cards.filter(c => c.id !== card.id);
        scheduleAutoSave();
        renderMoodlistCards(project, grid);
    });

    // Color picker
    const colorPickerEl = el.querySelector('.ml-color-picker');
    colorPickerEl.innerHTML = MOODLIST_COLORS.map(c => `
        <button class="ml-swatch${c.value === '' ? ' default' : ''}"
            style="background:${c.value || 'var(--bg-ui-hover)'}"
            data-color="${c.value}" title="${c.label}"></button>
    `).join('');

    el.querySelector('.ml-card-color-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = colorPickerEl.style.display !== 'none';
        document.querySelectorAll('.ml-color-picker').forEach(p => p.style.display = 'none');
        colorPickerEl.style.display = isOpen ? 'none' : 'flex';
    });
    colorPickerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const swatch = e.target.closest('.ml-swatch');
        if (!swatch) return;
        card.color = swatch.dataset.color;
        el.style.background = card.color || '';
        colorPickerEl.style.display = 'none';
        scheduleAutoSave();
    });

    // Image upload
    el.querySelector('.ml-card-img-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            card.image = ev.target.result;
            scheduleAutoSave();
            renderMoodlistCards(project, grid);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    // Click on card image = lightbox
    const imgEl = el.querySelector('.ml-card-img');
    if (imgEl) {
        imgEl.addEventListener('click', () => {
            if (typeof openLightbox === 'function') openLightbox(card.image);
        });
    }

    // Dismiss color pickers on outside click
    document.addEventListener('click', () => {
        colorPickerEl.style.display = 'none';
    }, { once: false });

    // Drag-to-reorder
    _wireDragDrop(el.querySelector('.ml-card-items'), card, project, grid);
}

/* ─── DRAG-AND-DROP REORDER ─────────────────────────────────────────────── */
function _wireDragDrop(container, card, project, grid) {
    let draggedId = null;
    let pointerOnHandle = false; // track if mousedown originated on the grip handle

    // Must use mousedown (fires before dragstart) to know if drag started from handle
    container.addEventListener('mousedown', (e) => {
        pointerOnHandle = !!e.target.closest('.ml-drag-handle');
    });

    container.addEventListener('dragstart', (e) => {
        if (!pointerOnHandle) { e.preventDefault(); return; }
        const row = e.target.closest('.ml-card-item');
        if (!row) return;
        draggedId = row.dataset.itemId;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => row.classList.add('ml-dragging'), 0);
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const row = e.target.closest('.ml-card-item');
        container.querySelectorAll('.ml-card-item').forEach(r =>
            r.classList.remove('ml-drag-over-top', 'ml-drag-over-bottom'));
        if (!row || row.dataset.itemId === draggedId) return;
        const midY = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
        row.classList.add(e.clientY < midY ? 'ml-drag-over-top' : 'ml-drag-over-bottom');
    });

    container.addEventListener('dragleave', (e) => {
        if (!container.contains(e.relatedTarget)) {
            container.querySelectorAll('.ml-card-item').forEach(r =>
                r.classList.remove('ml-drag-over-top', 'ml-drag-over-bottom'));
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const row = e.target.closest('.ml-card-item');
        if (!row || !draggedId || row.dataset.itemId === draggedId) return;

        const midY = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
        const dropBefore = e.clientY < midY;

        const fromIdx = card.items.findIndex(i => i.id === draggedId);
        const targetId = row.dataset.itemId;
        const [moved] = card.items.splice(fromIdx, 1);
        const toIdx = card.items.findIndex(i => i.id === targetId);
        card.items.splice(dropBefore ? toIdx : toIdx + 1, 0, moved);

        scheduleAutoSave();
        renderMoodlistCards(project, grid);
    });

    container.addEventListener('dragend', () => {
        draggedId = null;
        container.querySelectorAll('.ml-card-item').forEach(r =>
            r.classList.remove('ml-dragging', 'ml-drag-over-top', 'ml-drag-over-bottom'));
    });
}


/* ─── UTILS ─────────────────────────────────────────────────────────────── */
function _escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}
function _escapeAttr(str) {
    return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ─── EXPOSE ─────────────────────────────────────────────────────────────── */
window.renderMoodlistView = renderMoodlistView;
