/**
 * UI components, dialogs and state coordination for ComfyUI integration in moodinfinite.
 */

import { ComfyClient } from './comfy-client.js';
import {
    detectWorkflowFormat,
    WORKFLOW_FORMATS,
    mapWorkflowNodes,
    validateTaskRequirements,
    injectWorkflowParams,
    validateAgainstObjectInfo
} from './comfy-workflows.js';

class MoodComfyUI {
    constructor() {
        this.client = new ComfyClient();
        this.activeTask = 'generate'; // 'generate' | 'edit' | 'removeBg'
        this.currentWorkflowData = null;
        this.currentWorkflowSidecar = null;
        this.currentMapping = null;
        this.cachedObjectInfo = null;
        this.isGenerating = false;
        this.seedLocked = false;
        this.targetSelectedImageItem = null;

        // Built-in workflows registry
        this.builtInWorkflows = {
            'moss-image-t2i': {
                id: 'moss-image-t2i',
                task: 'generate',
                title: 'MOSS-Image (Text to Image)',
                path: 'workflows/moss-image-t2i.api.json',
                sidecar: 'workflows/moss-image-t2i.moodinfinite.json'
            },
            'qwen-image-2.1-edit': {
                id: 'qwen-image-2.1-edit',
                task: 'edit',
                title: 'Qwen Image 2.1 Edit (Turbo)',
                path: 'workflows/qwen-image-2.1-edit.api.json',
                sidecar: 'workflows/qwen-image-2.1-edit.moodinfinite.json'
            },
            'qwen-image-2.1-remove-bg': {
                id: 'qwen-image-2.1-remove-bg',
                task: 'removeBg',
                title: 'Qwen Image 2.1 Quitar Fondo (Turbo)',
                path: 'workflows/qwen-image-2.1-remove-bg.api.json',
                sidecar: 'workflows/qwen-image-2.1-remove-bg.moodinfinite.json'
            }
        };

        this.init();
    }

    init() {
        this.renderDomElements();
        this.bindEvents();
        this.applyTheme();
    }

    applyTheme() {
        // Obtains current accent color or theme variables if available
    }

    renderDomElements() {
        if (document.getElementById('comfy-settings-dialog')) return;

        // 1. Settings Dialog
        const settingsDialog = document.createElement('dialog');
        settingsDialog.id = 'comfy-settings-dialog';
        settingsDialog.className = 'comfy-modal-dialog';
        settingsDialog.setAttribute('aria-labelledby', 'comfy-settings-title');
        settingsDialog.innerHTML = `
            <div class="comfy-modal-header">
                <div class="comfy-modal-title-row">
                    <iconify-icon icon="lucide:settings" width="20" height="20"></iconify-icon>
                    <h3 id="comfy-settings-title">Configuración de ComfyUI</h3>
                </div>
                <button type="button" class="comfy-close-btn" id="comfy-settings-close-btn" aria-label="Cerrar">
                    <iconify-icon icon="lucide:x" width="18" height="18"></iconify-icon>
                </button>
            </div>
            <div class="comfy-modal-body">
                <div class="comfy-form-group">
                    <label for="comfy-host-input">Host o IP</label>
                    <input type="text" id="comfy-host-input" class="comfy-input" placeholder="127.0.0.1" value="${this.client.config.host}">
                    <span class="comfy-input-hint">Para usar en red local pon tu IP (ej. 192.168.1.50) o tu dirección de Tailscale (*.ts.net)</span>
                </div>
                <div class="comfy-form-row">
                    <div class="comfy-form-group" style="flex: 1;">
                        <label for="comfy-port-input">Puerto</label>
                        <input type="number" id="comfy-port-input" class="comfy-input" placeholder="8188" value="${this.client.config.port}">
                    </div>
                    <div class="comfy-form-group" style="flex: 1;">
                        <label for="comfy-protocol-select">Protocolo</label>
                        <select id="comfy-protocol-select" class="comfy-input">
                            <option value="http" ${this.client.config.protocol === 'http' ? 'selected' : ''}>HTTP</option>
                            <option value="https" ${this.client.config.protocol === 'https' ? 'selected' : ''}>HTTPS</option>
                        </select>
                    </div>
                </div>

                <div class="comfy-form-group">
                    <label class="comfy-checkbox-label">
                        <input type="checkbox" id="comfy-unload-toggle" ${this.client.config.autoUnloadOnSwitch ? 'checked' : ''}>
                        <span>Descargar modelos de VRAM al alternar workflows (evita saturar los 16 GB)</span>
                    </label>
                </div>

                <div class="comfy-actions-row">
                    <button type="button" id="comfy-test-btn" class="comfy-btn comfy-btn-secondary">
                        <iconify-icon icon="lucide:activity" width="16" height="16"></iconify-icon>
                        Probar conexión
                    </button>
                    <span id="comfy-test-status" class="comfy-status-badge">Sin verificar</span>
                </div>

                <div id="comfy-device-info" class="comfy-device-info-box" style="display: none;"></div>

                <div class="comfy-cors-command-box">
                    <span class="comfy-command-title">Comando para arrancar ComfyUI con CORS para este sitio:</span>
                    <div class="comfy-code-block">
                        <code id="comfy-cors-snippet"></code>
                        <button type="button" id="comfy-copy-snippet-btn" class="comfy-icon-btn" title="Copiar comando">
                            <iconify-icon icon="lucide:copy" width="16" height="16"></iconify-icon>
                        </button>
                    </div>
                    <p class="comfy-security-warning">
                        <iconify-icon icon="lucide:alert-triangle" width="14" height="14"></iconify-icon>
                        <strong>Seguridad:</strong> Nunca abras puertos hacia Internet ni uses <code>*</code> en CORS. ComfyUI no tiene contraseña.
                    </p>
                </div>
            </div>
            <div class="comfy-modal-footer">
                <button type="button" id="comfy-settings-save-btn" class="comfy-btn comfy-btn-primary">Guardar</button>
            </div>
        `;
        document.body.appendChild(settingsDialog);

        // 2. Generate / Edit Dialog
        const genDialog = document.createElement('dialog');
        genDialog.id = 'comfy-generate-dialog';
        genDialog.className = 'comfy-modal-dialog comfy-gen-dialog';
        genDialog.setAttribute('aria-labelledby', 'comfy-gen-title');
        genDialog.innerHTML = `
            <div class="comfy-modal-header">
                <div class="comfy-modal-title-row">
                    <iconify-icon icon="lucide:sparkles" width="20" height="20" class="comfy-sparkle-icon"></iconify-icon>
                    <h3 id="comfy-gen-title">Generar con IA (ComfyUI)</h3>
                </div>
                <div class="comfy-header-tools">
                    <button type="button" id="comfy-open-settings-from-gen-btn" class="comfy-icon-btn" title="Configurar ComfyUI">
                        <iconify-icon icon="lucide:settings" width="18" height="18"></iconify-icon>
                    </button>
                    <button type="button" class="comfy-close-btn" id="comfy-gen-close-btn" aria-label="Cerrar">
                        <iconify-icon icon="lucide:x" width="18" height="18"></iconify-icon>
                    </button>
                </div>
            </div>
            <div class="comfy-modal-body">
                <!-- Status warning banner if server is down -->
                <div id="comfy-offline-banner" class="comfy-warning-banner" style="display: none;">
                    <iconify-icon icon="lucide:power-off" width="20" height="20"></iconify-icon>
                    <div class="comfy-warning-text">
                        <strong>ComfyUI no está conectado o está apagado.</strong>
                        <span>Verifica que esté abierto en tu PC con CORS habilitado o revisa la configuración.</span>
                    </div>
                    <button type="button" id="comfy-retry-banner-btn" class="comfy-btn comfy-btn-small">Reintentar</button>
                </div>

                <!-- Workflow Selector Bar -->
                <div class="comfy-workflow-bar">
                    <div class="comfy-workflow-select-wrap">
                        <label for="comfy-wf-select">Workflow activo:</label>
                        <select id="comfy-wf-select" class="comfy-input comfy-select">
                            <option value="moss-image-t2i">MOSS-Image (Generar)</option>
                            <option value="qwen-image-2.1-edit">Qwen Image 2.1 Edit (Editar)</option>
                            <option value="qwen-image-2.1-remove-bg">Qwen Image 2.1 Quitar Fondo</option>
                        </select>
                    </div>
                    <button type="button" id="comfy-import-wf-btn" class="comfy-btn comfy-btn-secondary comfy-btn-small" title="Importar workflow JSON en formato API">
                        <iconify-icon icon="lucide:upload" width="14" height="14"></iconify-icon>
                        Importar API JSON
                    </button>
                    <input type="file" id="comfy-wf-file-input" accept=".json" style="display: none;">
                </div>

                <!-- Workflow validation badge -->
                <div id="comfy-wf-validation-alert" class="comfy-validation-box" style="display: none;"></div>

                <!-- Prompt Inputs -->
                <div id="comfy-prompt-section" class="comfy-form-group">
                    <label for="comfy-prompt-input">Prompt</label>
                    <textarea id="comfy-prompt-input" class="comfy-textarea" rows="3" placeholder="Describe lo que quieres generar..."></textarea>
                </div>

                <!-- Negative Prompt (collapsible) -->
                <details id="comfy-neg-details" class="comfy-details">
                    <summary>Prompt Negativo (opcional)</summary>
                    <div class="comfy-form-group" style="margin-top: 8px;">
                        <textarea id="comfy-neg-input" class="comfy-textarea" rows="2" placeholder="nsfw, worst quality, low quality, bad anatomy..."></textarea>
                    </div>
                </details>

                <!-- Target Image Preview for Edit/RemoveBg -->
                <div id="comfy-target-image-section" class="comfy-form-group" style="display: none;">
                    <label>Imagen seleccionada para editar:</label>
                    <div class="comfy-target-preview-wrap">
                        <img id="comfy-target-preview-img" src="" alt="Target" class="comfy-target-thumbnail">
                        <span id="comfy-target-name" class="comfy-target-name"></span>
                    </div>
                </div>

                <!-- Generation Parameters: Size & Seed -->
                <div class="comfy-form-row comfy-params-row">
                    <div id="comfy-size-group" class="comfy-form-group" style="flex: 1;">
                        <label for="comfy-size-select">Tamaño</label>
                        <select id="comfy-size-select" class="comfy-input">
                            <option value="1024x1024" selected>1:1 · Cuadrado (1024×1024)</option>
                            <option value="896x1152">3:4 · Retrato (896×1152)</option>
                            <option value="1152x896">4:3 · Paisaje (1152×896)</option>
                            <option value="768x1344">9:16 · Story (768×1344)</option>
                            <option value="1344x768">16:9 · Pantalla (1344×768)</option>
                        </select>
                    </div>

                    <div id="comfy-seed-group" class="comfy-form-group" style="flex: 1;">
                        <label for="comfy-seed-input">Semilla (Seed)</label>
                        <div class="comfy-seed-control">
                            <input type="number" id="comfy-seed-input" class="comfy-input" placeholder="Aleatoria">
                            <button type="button" id="comfy-seed-lock-btn" class="comfy-icon-btn" title="Bloquear semilla (no aleatorizar)">
                                <iconify-icon icon="lucide:unlock" width="16" height="16"></iconify-icon>
                            </button>
                            <button type="button" id="comfy-seed-random-btn" class="comfy-icon-btn" title="Nueva semilla aleatoria">
                                <iconify-icon icon="lucide:dice-5" width="16" height="16"></iconify-icon>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Progress Bar container -->
                <div id="comfy-progress-wrap" class="comfy-progress-container" style="display: none;">
                    <div class="comfy-progress-info">
                        <span id="comfy-progress-status-text">Iniciando generación...</span>
                        <span id="comfy-progress-percent">0%</span>
                    </div>
                    <div class="comfy-progress-bar-bg">
                        <div id="comfy-progress-bar-fill" class="comfy-progress-bar-fill" style="width: 0%;"></div>
                    </div>
                </div>
            </div>
            <div class="comfy-modal-footer">
                <button type="button" id="comfy-interrupt-btn" class="comfy-btn comfy-btn-danger" style="display: none;">
                    <iconify-icon icon="lucide:square" width="14" height="14"></iconify-icon>
                    Cancelar
                </button>
                <button type="button" id="comfy-submit-btn" class="comfy-btn comfy-btn-primary">
                    <iconify-icon icon="lucide:sparkles" width="16" height="16"></iconify-icon>
                    <span id="comfy-submit-btn-text">Generar</span>
                </button>
            </div>
        `;
        document.body.appendChild(genDialog);

        // Update snippet text with current origin
        this.updateCorsSnippet();
    }

    updateCorsSnippet() {
        const origin = window.location.origin;
        const snippetEl = document.getElementById('comfy-cors-snippet');
        if (snippetEl) {
            snippetEl.textContent = `python main.py --disable-auto-launch --listen --enable-cors-header ${origin}`;
        }
    }

    bindEvents() {
        // Settings close / open
        document.getElementById('comfy-settings-close-btn')?.addEventListener('click', () => {
            document.getElementById('comfy-settings-dialog')?.close();
        });
        document.getElementById('comfy-gen-close-btn')?.addEventListener('click', () => {
            if (!this.isGenerating) {
                document.getElementById('comfy-generate-dialog')?.close();
            }
        });
        document.getElementById('comfy-open-settings-from-gen-btn')?.addEventListener('click', () => {
            this.openSettingsDialog();
        });

        // Settings test connection
        document.getElementById('comfy-test-btn')?.addEventListener('click', () => this.handleTestConnection());

        // Settings save
        document.getElementById('comfy-settings-save-btn')?.addEventListener('click', () => {
            const host = document.getElementById('comfy-host-input')?.value || '127.0.0.1';
            const port = parseInt(document.getElementById('comfy-port-input')?.value, 10) || 8188;
            const protocol = document.getElementById('comfy-protocol-select')?.value || 'http';
            const autoUnload = document.getElementById('comfy-unload-toggle')?.checked ?? true;

            this.client.saveConfig({ host, port, protocol, autoUnloadOnSwitch: autoUnload });
            document.getElementById('comfy-settings-dialog')?.close();
            if (window.showToast) window.showToast('Configuración guardada');
        });

        // Copy CORS snippet
        document.getElementById('comfy-copy-snippet-btn')?.addEventListener('click', () => {
            const snippet = document.getElementById('comfy-cors-snippet')?.textContent || '';
            navigator.clipboard.writeText(snippet).then(() => {
                if (window.showToast) window.showToast('Comando copiado al portapapeles');
            });
        });

        // Retry banner button
        document.getElementById('comfy-retry-banner-btn')?.addEventListener('click', async () => {
            await this.checkServerStatus();
        });

        // Seed controls
        const seedLockBtn = document.getElementById('comfy-seed-lock-btn');
        const seedInput = document.getElementById('comfy-seed-input');
        const seedRandomBtn = document.getElementById('comfy-seed-random-btn');

        seedLockBtn?.addEventListener('click', () => {
            this.seedLocked = !this.seedLocked;
            seedLockBtn.innerHTML = this.seedLocked
                ? '<iconify-icon icon="lucide:lock" width="16" height="16"></iconify-icon>'
                : '<iconify-icon icon="lucide:unlock" width="16" height="16"></iconify-icon>';
            seedLockBtn.classList.toggle('active', this.seedLocked);
            if (this.seedLocked && !seedInput.value) {
                seedInput.value = Math.floor(Math.random() * 1000000000);
            }
        });

        seedRandomBtn?.addEventListener('click', () => {
            seedInput.value = Math.floor(Math.random() * 1000000000);
        });

        // Workflow selection change
        document.getElementById('comfy-wf-select')?.addEventListener('change', (e) => {
            this.loadWorkflow(e.target.value);
        });

        // Import workflow button
        const fileInput = document.getElementById('comfy-wf-file-input');
        document.getElementById('comfy-import-wf-btn')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.handleImportWorkflowFile(e));

        // Submit generation
        document.getElementById('comfy-submit-btn')?.addEventListener('click', () => this.handleExecuteGeneration());

        // Interrupt generation
        document.getElementById('comfy-interrupt-btn')?.addEventListener('click', async () => {
            await this.client.interrupt();
            this.isGenerating = false;
            this.updateUiGeneratingState(false);
            if (window.showToast) window.showToast('Generación cancelada');
        });

        // Global hotkey 'g' to trigger Generate dialog if not inside an input/textarea
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
                    e.preventDefault();
                    this.openGenerateDialog('generate');
                }
            }
        });
    }

    openSettingsDialog() {
        this.updateCorsSnippet();
        const dialog = document.getElementById('comfy-settings-dialog');
        if (dialog && typeof dialog.showModal === 'function') {
            dialog.showModal();
        }
    }

    async handleTestConnection() {
        const badge = document.getElementById('comfy-test-status');
        const box = document.getElementById('comfy-device-info');
        if (badge) {
            badge.className = 'comfy-status-badge comfy-status-loading';
            badge.textContent = 'Conectando...';
        }

        try {
            const res = await this.client.testConnection();
            if (badge) {
                badge.className = 'comfy-status-badge comfy-status-success';
                badge.textContent = 'Conectado';
            }
            if (box && res.stats) {
                const sys = res.stats.system || {};
                const dev = (res.stats.devices && res.stats.devices[0]) || {};
                box.style.display = 'block';
                box.innerHTML = `
                    <div><strong>Versión:</strong> ComfyUI ${sys.comfyui_version || 'Desconocida'}</div>
                    <div><strong>Dispositivo:</strong> ${dev.name || 'CPU'}</div>
                    <div><strong>VRAM libre:</strong> ${(dev.vram_free ? (dev.vram_free / (1024**3)).toFixed(2) + ' GB' : 'N/A')}</div>
                    <div><strong>WebSocket:</strong> ${res.webSocketOk ? 'OK' : 'Error (se usará polling)'}</div>
                `;
            }
        } catch (err) {
            if (badge) {
                badge.className = 'comfy-status-badge comfy-status-error';
                badge.textContent = 'Error';
            }
            if (box) {
                box.style.display = 'block';
                box.innerHTML = `<span style="color: var(--accent-danger, #ef4444);">${err.userMessage || err.message}</span>`;
            }
        }
    }

    async checkServerStatus() {
        const banner = document.getElementById('comfy-offline-banner');
        try {
            await this.client.getSystemStats();
            if (banner) banner.style.display = 'none';
            return true;
        } catch (e) {
            if (banner) banner.style.display = 'flex';
            return false;
        }
    }

    async openGenerateDialog(task = 'generate', targetItem = null) {
        this.activeTask = task;
        this.targetSelectedImageItem = targetItem;

        const titleEl = document.getElementById('comfy-gen-title');
        const targetSection = document.getElementById('comfy-target-image-section');
        const promptSection = document.getElementById('comfy-prompt-section');
        const sizeGroup = document.getElementById('comfy-size-group');
        const submitBtnText = document.getElementById('comfy-submit-btn-text');

        // Configure UI according to task
        if (task === 'generate') {
            if (titleEl) titleEl.textContent = 'Generar imagen con IA (ComfyUI)';
            if (submitBtnText) submitBtnText.textContent = 'Generar';
            if (targetSection) targetSection.style.display = 'none';
            if (promptSection) promptSection.style.display = 'block';
            if (sizeGroup) sizeGroup.style.display = 'block';
            this.setWorkflowSelectValue(this.client.config.activeWorkflowGenerate || 'moss-image-t2i');
        } else if (task === 'edit') {
            if (titleEl) titleEl.textContent = 'Editar imagen con IA (ComfyUI)';
            if (submitBtnText) submitBtnText.textContent = 'Aplicar Edición';
            if (targetSection) targetSection.style.display = 'block';
            if (promptSection) promptSection.style.display = 'block';
            if (sizeGroup) sizeGroup.style.display = 'none'; // size inherited from original image
            this.setupTargetPreview(targetItem);
            this.setWorkflowSelectValue(this.client.config.activeWorkflowEdit || 'qwen-image-2.1-edit');
        } else if (task === 'removeBg') {
            if (titleEl) titleEl.textContent = 'Quitar fondo con IA (ComfyUI)';
            if (submitBtnText) submitBtnText.textContent = 'Quitar Fondo';
            if (targetSection) targetSection.style.display = 'block';
            if (promptSection) promptSection.style.display = 'none'; // fixed prompt
            if (sizeGroup) sizeGroup.style.display = 'none';
            this.setupTargetPreview(targetItem);
            this.setWorkflowSelectValue(this.client.config.activeWorkflowRemoveBg || 'qwen-image-2.1-remove-bg');
        }

        const dialog = document.getElementById('comfy-generate-dialog');
        if (dialog && typeof dialog.showModal === 'function') {
            dialog.showModal();
        }

        await this.checkServerStatus();
        await this.loadWorkflow(document.getElementById('comfy-wf-select')?.value);
    }

    setWorkflowSelectValue(val) {
        const select = document.getElementById('comfy-wf-select');
        if (select) {
            select.value = val;
        }
    }

    setupTargetPreview(item) {
        const imgEl = document.getElementById('comfy-target-preview-img');
        const nameEl = document.getElementById('comfy-target-name');
        if (item && item.imageId && window.globalImageCache && window.globalImageCache[item.imageId]) {
            if (imgEl) imgEl.src = window.globalImageCache[item.imageId];
            if (nameEl) nameEl.textContent = `Imagen (${item.width || 0}×${item.height || 0} px)`;
        } else if (item && item.img && item.img.src) {
            if (imgEl) imgEl.src = item.img.src;
            if (nameEl) nameEl.textContent = 'Imagen seleccionada';
        }
    }

    async loadWorkflow(workflowId) {
        const alertBox = document.getElementById('comfy-wf-validation-alert');
        if (alertBox) alertBox.style.display = 'none';

        try {
            // Built-in or custom?
            if (this.builtInWorkflows[workflowId]) {
                const def = this.builtInWorkflows[workflowId];
                const resWf = await fetch(def.path);
                this.currentWorkflowData = await resWf.json();
                try {
                    const resSide = await fetch(def.sidecar);
                    this.currentWorkflowSidecar = await resSide.json();
                } catch (_) {
                    this.currentWorkflowSidecar = null;
                }
            } else if (this.client.config.userWorkflows && this.client.config.userWorkflows[workflowId]) {
                this.currentWorkflowData = this.client.config.userWorkflows[workflowId];
                this.currentWorkflowSidecar = null;
            }

            if (!this.currentWorkflowData) {
                throw new Error('No se pudo cargar el workflow seleccionado');
            }

            this.currentMapping = mapWorkflowNodes(this.currentWorkflowData, this.currentWorkflowSidecar);

            // Validate task requirements
            const req = validateTaskRequirements(this.activeTask, this.currentMapping);
            if (!req.valid) {
                if (alertBox) {
                    alertBox.className = 'comfy-validation-box comfy-validation-error';
                    alertBox.style.display = 'block';
                    alertBox.innerHTML = `<strong>Este workflow no es compatible con la tarea actual:</strong> Faltan nodos: ${req.missing.join(', ')}`;
                }
                return;
            }

            // Check against object_info if server is reachable
            if (!this.cachedObjectInfo) {
                this.cachedObjectInfo = await this.client.getObjectInfo().catch(() => null);
            }

            if (this.cachedObjectInfo) {
                const objVal = validateAgainstObjectInfo(this.currentWorkflowData, this.cachedObjectInfo);
                if (!objVal.valid && alertBox) {
                    alertBox.className = 'comfy-validation-box comfy-validation-warning';
                    alertBox.style.display = 'block';
                    let html = '<strong>Advertencia de compatibilidad con tus modelos/nodos:</strong><br>';
                    if (objVal.missingClasses.length) {
                        html += `Custom nodes faltantes: ${objVal.missingClasses.map(c => c.classType).join(', ')}<br>`;
                    }
                    if (objVal.missingModels.length) {
                        html += `Modelos faltantes en carpetas de ComfyUI: ${objVal.missingModels.map(m => m.requiredValue).join(', ')}<br>`;
                    }
                    alertBox.innerHTML = html;
                }
            }
        } catch (e) {
            console.warn('[MoodComfy] Error loading workflow:', e);
            if (alertBox) {
                alertBox.className = 'comfy-validation-box comfy-validation-error';
                alertBox.style.display = 'block';
                alertBox.textContent = `Error cargando workflow: ${e.message}`;
            }
        }
    }

    async handleImportWorkflowFile(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);
            const format = detectWorkflowFormat(json);

            if (format === WORKFLOW_FORMATS.UI) {
                alert('El archivo cargado está en formato UI (con enlaces visuales de nodos). Por favor expórtalo desde ComfyUI usando la opción "Export (API)" o "Save (API format)".');
                return;
            }

            if (format !== WORKFLOW_FORMATS.API) {
                alert('Formato de workflow no reconocido.');
                return;
            }

            const customId = 'user_' + Date.now().toString(36);
            const userWfs = { ...(this.client.config.userWorkflows || {}) };
            userWfs[customId] = json;
            this.client.saveConfig({ userWorkflows: userWfs });

            // Add to select dropdown
            const select = document.getElementById('comfy-wf-select');
            if (select) {
                const opt = document.createElement('option');
                opt.value = customId;
                opt.textContent = `Custom: ${file.name.replace('.json', '')}`;
                select.appendChild(opt);
                select.value = customId;
                await this.loadWorkflow(customId);
            }

            if (window.showToast) window.showToast('Workflow API importado con éxito');
        } catch (err) {
            alert('Error leyendo el archivo JSON: ' + err.message);
        }
    }

    updateUiGeneratingState(isGenerating) {
        this.isGenerating = isGenerating;
        const progressWrap = document.getElementById('comfy-progress-wrap');
        const submitBtn = document.getElementById('comfy-submit-btn');
        const interruptBtn = document.getElementById('comfy-interrupt-btn');

        if (progressWrap) progressWrap.style.display = isGenerating ? 'block' : 'none';
        if (interruptBtn) interruptBtn.style.display = isGenerating ? 'inline-flex' : 'none';
        if (submitBtn) submitBtn.disabled = isGenerating;
    }

    updateProgress(percent, text) {
        const fill = document.getElementById('comfy-progress-bar-fill');
        const pctEl = document.getElementById('comfy-progress-percent');
        const txtEl = document.getElementById('comfy-progress-status-text');

        if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
        if (txtEl && text) txtEl.textContent = text;
    }

    async handleExecuteGeneration() {
        if (this.isGenerating) return;

        const isConnected = await this.checkServerStatus();
        if (!isConnected) {
            if (window.showToast) window.showToast('No se puede conectar a ComfyUI', 'error');
            return;
        }

        if (!this.currentWorkflowData || !this.currentMapping) {
            alert('Por favor selecciona un workflow válido.');
            return;
        }

        // Gather parameters
        let promptVal = document.getElementById('comfy-prompt-input')?.value || '';
        if (this.activeTask === 'removeBg') {
            promptVal = 'Remove the background, and output a PNG image';
        }
        const negVal = document.getElementById('comfy-neg-input')?.value || '';
        const sizeVal = document.getElementById('comfy-size-select')?.value || '1024x1024';
        const [targetWidth, targetHeight] = sizeVal.split('x').map(Number);

        const seedInput = document.getElementById('comfy-seed-input');
        let seedVal = seedInput?.value ? parseInt(seedInput.value, 10) : null;
        if (seedVal == null || isNaN(seedVal)) {
            seedVal = Math.floor(Math.random() * 10000000000);
            if (this.seedLocked && seedInput) seedInput.value = seedVal;
        }

        this.updateUiGeneratingState(true);
        this.updateProgress(5, 'Preparando workflow...');

        try {
            let uploadedImageName = null;

            // Handle image upload if task is edit / removeBg
            if (this.activeTask === 'edit' || this.activeTask === 'removeBg') {
                this.updateProgress(10, 'Subiendo imagen a ComfyUI...');
                let blob = null;
                const item = this.targetSelectedImageItem;

                if (item && item.imageId && window.globalImageCache && window.globalImageCache[item.imageId]) {
                    const dataUrl = window.globalImageCache[item.imageId];
                    const res = await fetch(dataUrl);
                    blob = await res.blob();
                } else if (item && item.img && item.img.src) {
                    const res = await fetch(item.img.src);
                    blob = await res.blob();
                }

                if (!blob) {
                    throw new Error('No se encontró la imagen seleccionada para subir.');
                }

                const uploadRes = await this.client.uploadImage(blob, `mi_input_${Date.now()}.png`);
                uploadedImageName = uploadRes.name;
            }

            // Unload models if configured to avoid VRAM overload
            if (this.client.config.autoUnloadOnSwitch) {
                await this.client.freeMemory(true, false);
            }

            // Inject params into workflow
            const promptParams = {
                prompt: promptVal,
                negativePrompt: negVal,
                imageName: uploadedImageName,
                seed: seedVal,
                width: targetWidth,
                height: targetHeight
            };

            const finalPrompt = injectWorkflowParams(this.currentWorkflowData, this.currentMapping, promptParams);

            this.updateProgress(20, 'Enviando a la cola de ComfyUI...');
            const queueRes = await this.client.queuePrompt(finalPrompt);
            const promptId = queueRes.prompt_id;

            this.updateProgress(25, 'Procesando en GPU...');

            // Watch progress via WebSocket / polling
            const histEntry = await this.client.watchPrompt(promptId, (p) => {
                if (p.value != null && p.max != null && p.max > 0) {
                    const pct = 25 + (p.value / p.max) * 70;
                    this.updateProgress(pct, `Paso ${p.value} de ${p.max}...`);
                }
            });

            this.updateProgress(96, 'Descargando resultado...');

            // Retrieve outputs from history
            const outputs = histEntry.outputs || {};
            let outputImageMeta = null;

            // Look for output node images
            if (this.currentMapping.outputNodeId && outputs[this.currentMapping.outputNodeId]) {
                const nodeOut = outputs[this.currentMapping.outputNodeId];
                if (nodeOut.images && nodeOut.images.length > 0) {
                    outputImageMeta = nodeOut.images[0];
                }
            }

            // If not found in marked output node, find first available node with images
            if (!outputImageMeta) {
                for (const nodeOut of Object.values(outputs)) {
                    if (nodeOut.images && nodeOut.images.length > 0) {
                        outputImageMeta = nodeOut.images[0];
                        break;
                    }
                }
            }

            if (!outputImageMeta) {
                throw new Error('ComfyUI terminó pero no devolvió ninguna imagen en la salida.');
            }

            // Fetch Blob
            const imageBlob = await this.client.getImageBlob(outputImageMeta.filename, outputImageMeta.subfolder, outputImageMeta.type);
            const imageFile = new File([imageBlob], outputImageMeta.filename, { type: 'image/png' });

            // Prepare genMeta
            const genMeta = {
                prompt: promptVal,
                negativePrompt: negVal,
                model: this.currentMapping.modelName || 'ComfyUI',
                seed: String(seedVal),
                tool: `ComfyUI · ${this.currentWorkflowSidecar?.name || 'Workflow'}`,
                date: new Date().toISOString()
            };

            this.updateProgress(100, '¡Completado!');

            // Calculate world placement
            let worldPos = { x: 0, y: 0 };
            if (typeof window.screenToWorld === 'function') {
                worldPos = window.screenToWorld({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
            }
            if (this.targetSelectedImageItem) {
                worldPos = {
                    x: (this.targetSelectedImageItem.x || 0) + (this.targetSelectedImageItem.width || 250) + 40,
                    y: (this.targetSelectedImageItem.y || 0)
                };
            }

            // Ingest image into moodinfinite board via processFiles
            if (typeof window.processFiles === 'function') {
                window.processFiles([imageFile], worldPos, genMeta);
            }

            if (window.showToast) window.showToast('Imagen generada y agregada al board');

            // Close dialog
            document.getElementById('comfy-generate-dialog')?.close();

        } catch (err) {
            console.error('[MoodComfy] Error during generation:', err);
            alert(`Error durante la generación: ${err.userMessage || err.message}`);
        } finally {
            this.updateUiGeneratingState(false);
        }
    }
}

// Export singleton on window
if (typeof window !== 'undefined') {
    window.MoodComfy = new MoodComfyUI();
}

export { MoodComfyUI };
