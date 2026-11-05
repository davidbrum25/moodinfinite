/**
 * ComfyUI Client for moodinfinite.
 * Handles HTTP & WebSocket communication, Local Network Access (LNA) targetAddressSpace,
 * error categorization, image upload and prompt lifecycle.
 */

const STORAGE_KEY = 'mi.comfy.v1';

export const DEFAULT_CONFIG = {
    host: '127.0.0.1',
    port: 8188,
    protocol: 'http', // 'http' | 'https'
    autoUnloadOnSwitch: true,
    activeWorkflowGenerate: 'moss-image-t2i',
    activeWorkflowEdit: 'qwen-image-2.1-edit',
    activeWorkflowRemoveBg: 'qwen-image-2.1-remove-bg',
    userWorkflows: {} // custom imported workflows by id
};

export class ComfyClient {
    constructor() {
        this.config = this.loadConfig();
        this.clientId = this.generateClientId();
    }

    generateClientId() {
        return 'mi_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    loadConfig() {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
            return { ...DEFAULT_CONFIG };
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        } catch (e) {
            console.warn('[MoodComfy] Error reading localStorage config:', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    saveConfig(updates) {
        this.config = { ...this.config, ...updates };
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
            return this.config;
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
        } catch (e) {
            console.warn('[MoodComfy] Error saving to localStorage:', e);
        }
        return this.config;
    }

    /**
     * Determines whether host is loopback or local LAN
     */
    getTargetAddressSpace() {
        const host = (this.config.host || '').trim().toLowerCase();
        if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
            return 'loopback';
        }
        // RFC 1918 or .local or private IP
        if (
            host.startsWith('192.168.') ||
            host.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
            host.endsWith('.local')
        ) {
            return 'local';
        }
        return null;
    }

    getBaseUrl() {
        let proto = this.config.protocol || 'http';
        const host = (this.config.host || '127.0.0.1').trim();
        // If host is Tailscale (.ts.net), default to https
        if (host.endsWith('.ts.net')) {
            proto = 'https';
        }
        const port = this.config.port ? `:${this.config.port}` : '';
        return `${proto}://${host}${port}`;
    }

    getWsUrl() {
        let proto = this.config.protocol === 'https' ? 'wss' : 'ws';
        const host = (this.config.host || '127.0.0.1').trim();
        if (host.endsWith('.ts.net')) {
            proto = 'wss';
        }
        const port = this.config.port ? `:${this.config.port}` : '';
        return `${proto}://${host}${port}/ws?clientId=${encodeURIComponent(this.clientId)}`;
    }

    /**
     * Wrapper over fetch that injects targetAddressSpace for LNA when supported
     */
    async fetchWithLna(endpoint, options = {}) {
        const url = `${this.getBaseUrl()}${endpoint}`;
        const addressSpace = this.getTargetAddressSpace();

        const fetchOptions = { ...options, mode: 'cors' };
        if (addressSpace && typeof window !== 'undefined' && window.location.protocol === 'https:') {
            fetchOptions.targetAddressSpace = addressSpace;
        }

        try {
            return await fetch(url, fetchOptions);
        } catch (err) {
            // Classify errors for user-friendly UI
            const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
            const isLocal = addressSpace !== null;

            if (err.name === 'TypeError') {
                if (isHttps && this.config.protocol === 'http') {
                    err.classifiedType = 'MIXED_CONTENT_OR_LNA_DENIED';
                    err.userMessage = 'Conexión bloqueada. Verifica los permisos de Red Local (LNA) en tu navegador o que ComfyUI tenga CORS activado.';
                } else {
                    err.classifiedType = 'CONNECTION_REFUSED_OR_CORS';
                    err.userMessage = 'No se pudo conectar a ComfyUI. Asegúrate de que esté abierto y con --enable-cors-header configurado.';
                }
            }
            throw err;
        }
    }

    /**
     * Check system stats and connection status
     */
    async getSystemStats() {
        const res = await this.fetchWithLna('/system_stats');
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.json();
    }

    /**
     * Test connection to ComfyUI (HTTP + WebSocket)
     */
    async testConnection() {
        const stats = await this.getSystemStats();
        // Check WS
        const wsOk = await new Promise((resolve) => {
            let socket;
            let resolved = false;
            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (socket) socket.close();
                    resolve(false);
                }
            }, 3000);

            try {
                socket = new WebSocket(this.getWsUrl());
                socket.onopen = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        socket.close();
                        resolve(true);
                    }
                };
                socket.onerror = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(false);
                    }
                };
            } catch (e) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve(false);
                }
            }
        });

        return {
            ok: true,
            stats,
            webSocketOk: wsOk
        };
    }

    /**
     * Get /object_info
     */
    async getObjectInfo() {
        const res = await this.fetchWithLna('/object_info');
        if (!res.ok) throw new Error(`HTTP ${res.status} al obtener object_info`);
        return await res.json();
    }

    /**
     * List user workflows via ComfyUI userdata endpoint
     */
    async listUserWorkflows() {
        try {
            const res = await this.fetchWithLna('/api/userdata?dir=workflows&recurse=true&full_info=true');
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('[MoodComfy] Could not list user workflows:', e);
        }
        return [];
    }

    /**
     * Fetch a specific workflow file from ComfyUI userdata
     */
    async getUserWorkflow(workflowPath) {
        const encoded = encodeURIComponent(workflowPath);
        const res = await this.fetchWithLna(`/api/userdata/workflows%2F${encoded}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} al leer workflow de usuario`);
        return await res.json();
    }

    /**
     * Upload an image Blob/File to ComfyUI input folder
     */
    async uploadImage(blobOrFile, filename = 'moodinfinite_input.png') {
        const formData = new FormData();
        formData.append('image', blobOrFile, filename);
        formData.append('overwrite', 'true');

        const res = await this.fetchWithLna('/upload/image', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Error subiendo imagen a ComfyUI (${res.status}): ${txt}`);
        }
        return await res.json(); // returns { name: '...', subfolder: '...', type: 'input' }
    }

    /**
     * Queue a prompt workflow execution
     */
    async queuePrompt(apiPrompt) {
        const payload = {
            prompt: apiPrompt,
            client_id: this.clientId
        };

        const res = await this.fetchWithLna('/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error || (data.node_errors && Object.keys(data.node_errors).length > 0)) {
            const error = new Error('ComfyUI rechazó la ejecución del prompt');
            error.details = data;
            throw error;
        }

        return data; // returns { prompt_id: '...', number: 1, node_errors: {} }
    }

    /**
     * Interrupt currently executing generation
     */
    async interrupt() {
        try {
            await this.fetchWithLna('/interrupt', { method: 'POST' });
        } catch (e) {
            console.warn('[MoodComfy] Failed to interrupt:', e);
        }
    }

    /**
     * Free memory / unload models (POST /free)
     */
    async freeMemory(unloadModels = true, freeMemory = true) {
        try {
            await this.fetchWithLna('/free', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unload_models: unloadModels, free_memory: freeMemory })
            });
        } catch (e) {
            console.warn('[MoodComfy] Failed to free memory:', e);
        }
    }

    /**
     * Fetch generation history for a prompt ID
     */
    async getHistory(promptId) {
        const res = await this.fetchWithLna(`/history/${encodeURIComponent(promptId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} al consultar historial`);
        return await res.json();
    }

    /**
     * Download generated image output as a Blob
     */
    async getImageBlob(filename, subfolder = '', type = 'output') {
        const params = new URLSearchParams({ filename, type });
        if (subfolder) params.set('subfolder', subfolder);

        const res = await this.fetchWithLna(`/view?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} al descargar imagen de salida`);
        return await res.blob();
    }

    /**
     * Watches prompt execution via WebSocket with fallback to polling /history.
     * onProgress callback receives { value, max, node, promptId }
     */
    watchPrompt(promptId, onProgress) {
        return new Promise((resolve, reject) => {
            let socket = null;
            let pollingTimer = null;
            let finished = false;

            const cleanup = () => {
                if (socket) {
                    try { socket.close(); } catch (_) {}
                    socket = null;
                }
                if (pollingTimer) {
                    clearInterval(pollingTimer);
                    pollingTimer = null;
                }
            };

            const checkHistory = async () => {
                try {
                    const hist = await this.getHistory(promptId);
                    if (hist && hist[promptId]) {
                        const entry = hist[promptId];
                        if (entry.status && entry.status.completed) {
                            finished = true;
                            cleanup();
                            resolve(entry);
                        } else if (entry.status && entry.status.status_str === 'error') {
                            finished = true;
                            cleanup();
                            reject(new Error(`ComfyUI error en ejecución: ${JSON.stringify(entry.status.messages || '')}`));
                        }
                    }
                } catch (e) {
                    // Ignore transient network errors during poll
                }
            };

            // Start WS
            try {
                socket = new WebSocket(this.getWsUrl());
                socket.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'progress') {
                            if (onProgress && msg.data) {
                                onProgress({
                                    value: msg.data.value,
                                    max: msg.data.max,
                                    promptId: msg.data.prompt_id
                                });
                            }
                        } else if (msg.type === 'executing') {
                            if (msg.data && msg.data.prompt_id === promptId) {
                                if (msg.data.node === null) {
                                    // Done!
                                    finished = true;
                                    cleanup();
                                    this.getHistory(promptId).then((h) => resolve(h[promptId])).catch(reject);
                                } else if (onProgress) {
                                    onProgress({ node: msg.data.node, promptId });
                                }
                            }
                        } else if (msg.type === 'execution_error') {
                            if (msg.data && msg.data.prompt_id === promptId) {
                                finished = true;
                                cleanup();
                                reject(new Error(`Error de ejecución: ${msg.data.exception_message || 'ComfyUI Execution Error'}`));
                            }
                        }
                    } catch (_) {}
                };

                socket.onerror = () => {
                    // Fall back directly to polling if WS fails
                    if (!pollingTimer && !finished) {
                        pollingTimer = setInterval(checkHistory, 1000);
                    }
                };
            } catch (e) {
                // If WS construction threw
                pollingTimer = setInterval(checkHistory, 1000);
            }

            // Also have a safeguard poll every 3s in case WS disconnects silently
            if (!pollingTimer) {
                pollingTimer = setInterval(checkHistory, 3000);
            }
        });
    }
}
