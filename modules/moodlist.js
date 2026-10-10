/**
 * Moodlist — Google Keep–style note/checklist cards
 * ===================================================
 * Self-contained module. All state lives inside the active project's data.
 * Data shape: { cards: [ { id, title, color, pinned, image, items: [{ id, text, checked, due, indent }] } ] }
 * indent is 1 when the row sits under the row above it, and only when that row is not first.
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
function _activeMoodlistProject() {
    const container = document.getElementById('moodlist-container');
    const id = container?.dataset.mlProjectId;
    if (!id) return null;
    return projects.find(p => String(p.id) === id) || null;
}

function renderMoodlistView(project) {
    const container = document.getElementById('moodlist-container');
    if (!container) return;

    if (!project.data) project.data = {};
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
                <span class="ml-cards-count-badge" id="ml-cards-count">0 cards</span>
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
        _wireAddPanel(addPanel, project, () => {
            const current = _activeMoodlistProject() || project;
            const g = container.querySelector('.ml-grid');
            if (g) renderMoodlistCards(current, g);
        });

        /* ── Card grid ───────────────────────────────────────────────────── */
        grid = document.createElement('div');
        grid.className = 'ml-grid';
        container.appendChild(grid);

        /* ── Search + filter ─────────────────────────────────────────────── */
        topBar.querySelector('.ml-search').addEventListener('input', () => {
            const current = _activeMoodlistProject();
            const g = container.querySelector('.ml-grid');
            if (current && g) renderMoodlistCards(current, g);
        });
        topBar.querySelector('.ml-show-pinned').addEventListener('change', () => {
            const current = _activeMoodlistProject();
            const g = container.querySelector('.ml-grid');
            if (current && g) renderMoodlistCards(current, g);
        });
    }

    if (container.dataset.mlProjectId && container.dataset.mlProjectId !== String(project.id)) {
        const search = container.querySelector('.ml-search');
        if (search) search.value = '';
    }
    container.dataset.mlProjectId = String(project.id);

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
        const addPanel = panel.querySelector('.ml-add-panel');
        addPanel.style.background = pendingColor ? pendingColor : '';
        addPanel.classList.toggle('ml-tinted', !!pendingColor);
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
        const target = _activeMoodlistProject() || project;
        if (!target.data.cards) target.data.cards = [];
        target.data.cards.unshift(card);

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
        panel.querySelector('.ml-add-panel').classList.remove('ml-tinted');
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
    const countBadge = container?.querySelector('#ml-cards-count');
    if (countBadge) {
        const total = (project.data.cards || []).length;
        countBadge.textContent = `${total} card${total === 1 ? '' : 's'}`;
    }

    const searchInput = container?.querySelector('.ml-search');
    const showPinnedToggle = container?.querySelector('.ml-show-pinned');

    const query = (searchInput?.value || '').toLowerCase().trim();
    const showPinned = !showPinnedToggle || showPinnedToggle.checked;

    let cards = project.data.cards || [];
    cards.forEach(c => { if (!c.items) c.items = []; });

    if (!showPinned) cards = cards.filter(c => !c.pinned);

    // Filter
    if (query) {
        cards = cards.filter(c =>
            (c.title || '').toLowerCase().includes(query) ||
            c.items.some(i => (i.text || '').toLowerCase().includes(query) || (i.due || '').toLowerCase().includes(query))
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

function _moodlistIndentOf(item, index) {
    return index > 0 && item && item.indent ? 1 : 0;
}

function _normalizeMoodlistIndent(card) {
    let changed = false;
    (card.items || []).forEach((item, index) => {
        const next = _moodlistIndentOf(item, index);
        if ((item.indent || 0) !== next) {
            item.indent = next;
            changed = true;
        }
    });
    if (changed) scheduleAutoSave();
}

function _moodlistItemClass(item, index) {
    return `ml-card-item${item.checked ? ' checked' : ''}${_moodlistIndentOf(item, index) ? ' ml-subtask' : ''}`;
}

function _moodlistItemInner(item, index) {
    const indented = _moodlistIndentOf(item, index) === 1;
    const indentBtn = index > 0
        ? `<button type="button" class="ml-indent-btn" title="${indented ? 'Outdent' : 'Indent'}">
                <iconify-icon icon="lucide:${indented ? 'indent-decrease' : 'indent-increase'}" width="13" height="13"></iconify-icon>
           </button>`
        : '';
    return `
            <span class="ml-drag-handle" title="Drag to reorder">
                <iconify-icon icon="lucide:grip-vertical" width="14" height="14"></iconify-icon>
            </span>
            ${indentBtn}
            <span class="ml-due-wrap${item.due ? ' has-date' : ''}">
                <button type="button" class="ml-due-btn" title="Due date" tabindex="-1">
                    <iconify-icon icon="lucide:calendar" width="14" height="14"></iconify-icon>
                </button>
                <input type="date" class="ml-item-due" title="Due date" tabindex="-1"${item.due ? ` value="${_escapeAttr(item.due)}"` : ''}>
            </span>
            <span class="ml-card-checkbox">
                <iconify-icon icon="${item.checked ? 'lucide:check-square' : 'lucide:square'}" width="15" height="15"></iconify-icon>
            </span>
            <input type="text" class="ml-card-item-text" value="${_escapeAttr(item.text || '')}">
            <button class="ml-card-item-del" title="Delete item" tabindex="-1">
                <iconify-icon icon="lucide:x" width="12" height="12"></iconify-icon>
            </button>`;
}

/* ─── BUILD SINGLE CARD ─────────────────────────────────────────────────── */
function _buildCard(card, project, grid) {
    const el = document.createElement('div');
    el.className = 'ml-card';
    el.dataset.id = card.id;
    if (card.color) {
        el.style.background = card.color;
        el.classList.add('ml-tinted');
    }
    if (card.pinned) el.classList.add('pinned');
    _normalizeMoodlistIndent(card);

    // Image section
    const imgHtml = card.image ? `
        <div class="ml-card-img-wrap">
            <img src="${card.image}" class="ml-card-img" alt="">
        </div>
    ` : '';

    // Items
    const itemsHtml = card.items.map((item, index) => `
        <div class="${_moodlistItemClass(item, index)}" data-item-id="${item.id}" draggable="true">
            ${_moodlistItemInner(item, index)}
        </div>
    `).join('');

    const pinnedIcon = card.pinned
        ? `<iconify-icon icon="lucide:pin" width="14" height="14" style="color:var(--switch-bg-checked)"></iconify-icon>`
        : `<iconify-icon icon="lucide:pin" width="14" height="14"></iconify-icon>`;

    const totalItems = (card.items || []).length;
    const doneItems = (card.items || []).filter(i => i.checked).length;
    const progressBadge = totalItems > 0
        ? `<span class="ml-card-progress-badge${doneItems === totalItems ? ' is-complete' : ''}" title="${doneItems} of ${totalItems} completed">${doneItems}/${totalItems}</span>`
        : '';

    el.innerHTML = `
        ${imgHtml}
        <div class="ml-card-body">
            <div class="ml-card-header-row">
                ${card.title ? `<div class="ml-card-title" contenteditable="true" spellcheck="false">${_escapeHtml(card.title)}</div>` : `<div class="ml-card-title empty" contenteditable="true" spellcheck="false" data-placeholder="Title…"></div>`}
                ${progressBadge}
            </div>
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
                <button class="ml-card-btn ml-card-check-all-btn" title="Toggle all items">
                    <iconify-icon icon="lucide:check-check" width="14" height="14"></iconify-icon>
                </button>
                <button class="ml-card-btn ml-card-duplicate-btn" title="Duplicate card">
                    <iconify-icon icon="lucide:copy-plus" width="14" height="14"></iconify-icon>
                </button>
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
        const item = card.items.find(i => i.id === itemEl.dataset.itemId);
        _wireItemText(itemEl, item);
        _wireItemDue(itemEl, item);
        _wireItemIndent(itemEl, item, card, project, grid);
        itemEl.addEventListener('click', (e) => {
            if (e.target.closest('.ml-card-item-del') || e.target.closest('.ml-item-due') || e.target.closest('.ml-due-wrap') || e.target.closest('.ml-indent-btn') || e.target.closest('.ml-card-item-text')) return;
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
            const newIndex = card.items.length - 1;
            scheduleAutoSave();
            anyAdded = true;

            // 2. Insert a visible row immediately BEFORE the inline input
            const row = document.createElement('div');
            row.className = _moodlistItemClass(newItem, newIndex);
            row.dataset.itemId = newItem.id;
            row.draggable = true;
            row.innerHTML = _moodlistItemInner(newItem, newIndex);
            _wireItemText(row, newItem);
            _wireItemDue(row, newItem);
            _wireItemIndent(row, newItem, card, project, grid);
            row.addEventListener('click', (e) => {
                if (e.target.closest('.ml-card-item-del') || e.target.closest('.ml-item-due') || e.target.closest('.ml-due-wrap') || e.target.closest('.ml-indent-btn') || e.target.closest('.ml-card-item-text')) return;
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

    // Toggle all items
    el.querySelector('.ml-card-check-all-btn')?.addEventListener('click', () => {
        const items = card.items || [];
        if (!items.length) return;
        const allChecked = items.every(i => i.checked);
        items.forEach(i => i.checked = !allChecked);
        scheduleAutoSave();
        renderMoodlistCards(project, grid);
    });

    // Pin toggle
    el.querySelector('.ml-pin-btn').addEventListener('click', () => {
        card.pinned = !card.pinned;
        scheduleAutoSave();
        renderMoodlistCards(project, grid);
    });

    // Duplicate card
    el.querySelector('.ml-card-duplicate-btn')?.addEventListener('click', () => {
        const target = _activeMoodlistProject() || project;
        if (!target.data.cards) target.data.cards = [];
        const idx = target.data.cards.findIndex(c => c.id === card.id);
        const clone = JSON.parse(JSON.stringify(card));
        clone.id = mlId();
        clone.title = card.title ? `${card.title} (Copy)` : 'Copy';
        (clone.items || []).forEach(it => { it.id = mlId(); });
        target.data.cards.splice(idx >= 0 ? idx + 1 : 0, 0, clone);
        scheduleAutoSave();
        renderMoodlistCards(target, grid);
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
function _wireItemText(itemEl, item) {
    const field = itemEl.querySelector('.ml-card-item-text');
    if (!field || !item || field.tagName !== 'INPUT') return;
    const stop = (e) => e.stopPropagation();
    field.addEventListener('pointerdown', stop);
    field.addEventListener('mousedown', stop);
    field.addEventListener('click', stop);
    field.addEventListener('input', () => {
        item.text = field.value;
        scheduleAutoSave();
    });
}

function _wireItemDue(itemEl, item) {
    const due = itemEl.querySelector('.ml-item-due');
    if (!due || !item) return;
    const wrap = due.closest('.ml-due-wrap');
    const paint = () => { if (wrap) wrap.classList.toggle('has-date', !!due.value); };
    paint();
    const stop = (e) => e.stopPropagation();
    due.addEventListener('click', stop);
    due.addEventListener('pointerdown', stop);
    due.addEventListener('mousedown', stop);
    due.addEventListener('change', (e) => {
        e.stopPropagation();
        item.due = due.value || '';
        paint();
        scheduleAutoSave();
    });
}

function _wireItemIndent(itemEl, item, card, project, grid) {
    const btn = itemEl.querySelector('.ml-indent-btn');
    if (!btn || !item) return;
    const stop = (e) => e.stopPropagation();
    btn.addEventListener('pointerdown', stop);
    btn.addEventListener('mousedown', stop);
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = card.items.findIndex((entry) => entry.id === item.id);
        if (index <= 0) return;
        item.indent = item.indent ? 0 : 1;
        scheduleAutoSave();
        renderMoodlistCards(project, grid);
    });
}

function _escapeAttr(str) {
    return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ─── EXPOSE ─────────────────────────────────────────────────────────────── */
window.renderMoodlistView = renderMoodlistView;
