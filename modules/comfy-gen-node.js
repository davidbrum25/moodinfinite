/**
 * ComfyUI Generation Node implementation for Moodinfinite.
 * Handles the on-canvas generator element, DOM overlay synchronization,
 * multi-port connectors (Reference, Prompt, Seed, Output), execution lifecycle
 * and output image placement.
 */

import { ComfyClient } from './comfy-client.js';
import {
    detectWorkflowFormat,
    WORKFLOW_FORMATS,
    mapWorkflowNodes,
    validateTaskRequirements,
    injectWorkflowParams,
    validateAgainstObjectInfo,
    autoAdjustWorkflowModels
} from './comfy-workflows.js';

export const GEN_NODE_WIDTH = 340;
export const GEN_NODE_DEFAULT_HEIGHT = 420;

export class ComfyGenNodeManager {
    constructor() {
        this.client = new ComfyClient();
        this.container = null; // DOM overlay container
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

        this.workflowCache = new Map();
        this.cachedObjectInfo = null;
        this.init();
    }

    init() {
        this.setupOverlayContainer();
        this.setupGlobalEvents();
        this.preloadBuiltInWorkflows();
    }

    setupOverlayContainer() {
        let overlay = document.getElementById('comfy-gen-nodes-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'comfy-gen-nodes-overlay';
            overlay.className = 'comfy-gen-nodes-overlay';
            const parent = document.getElementById('moodinfinite-container') || document.body;
            parent.appendChild(overlay);
        }
        this.container = overlay;
    }

    setupGlobalEvents() {
        // Hotkeys are routed centrally from script.js
    }

    async preloadBuiltInWorkflows() {
        for (const [id, def] of Object.entries(this.builtInWorkflows)) {
            try {
                const [rWf, rSide] = await Promise.all([
                    fetch(def.path).then(r => r.json()),
                    fetch(def.sidecar).then(r => r.json()).catch(() => null)
                ]);
                this.workflowCache.set(id, { workflow: rWf, sidecar: rSide });
            } catch (err) {
                console.warn(`[MoodComfy] Failed to preload workflow ${id}:`, err);
            }
        }
    }

    async getWorkflowData(workflowId) {
        if (this.workflowCache.has(workflowId)) {
            return this.workflowCache.get(workflowId);
        }
        // Custom workflow from config
        if (this.client.config.userWorkflows && this.client.config.userWorkflows[workflowId]) {
            const data = { workflow: this.client.config.userWorkflows[workflowId], sidecar: null };
            this.workflowCache.set(workflowId, data);
            return data;
        }
        return null;
    }

    /**
     * Factory function to create a new genNode canvas item
     */
    createGenNode(opts = {}) {
        const id = 'gen_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
        const node = {
            id,
            type: 'genNode',
            x: opts.x ?? 0,
            y: opts.y ?? 0,
            width: GEN_NODE_WIDTH,
            height: GEN_NODE_DEFAULT_HEIGHT,
            workflowId: opts.workflowId || 'moss-image-t2i',
            prompt: opts.prompt ?? '',
            negativePrompt: opts.negativePrompt ?? '',
            size: opts.size ?? '1024x1024',
            seedMode: opts.seedMode ?? 'random',
            seed: opts.seed != null ? opts.seed : Math.floor(Math.random() * 1000000000),
            batchCount: opts.batchCount ?? 1,
            outputMode: opts.outputMode ?? 'add',
            outputs: [],
            // Runtime volatile state (ignored by storageReplacer)
            _runtime: {
                status: 'idle', // 'idle' | 'queued' | 'running' | 'error' | 'offline'
                progressPercent: 0,
                statusText: '',
                currentPromptId: null,
                isDirty: false
            }
        };
        return node;
    }

    createGenNodeAtCenter(opts = {}) {
        let worldPos = { x: 0, y: 0 };
        const cv = (typeof window !== 'undefined' && window.canvas) || (typeof document !== 'undefined' ? document.getElementById('moodboard-canvas') : null);
        const centerScreen = {
            x: (cv && cv.clientWidth ? cv.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1280)) / 2,
            y: (cv && cv.clientHeight ? cv.clientHeight : (typeof window !== 'undefined' ? window.innerHeight : 800)) / 2
        };
        if (typeof window !== 'undefined' && typeof window.screenToWorld === 'function') {
            worldPos = window.screenToWorld(centerScreen);
        }
        const defaultW = GEN_NODE_WIDTH;
        const defaultH = 320;
        const node = this.createGenNode({
            x: opts.x !== undefined ? opts.x : (worldPos.x - defaultW / 2),
            y: opts.y !== undefined ? opts.y : (worldPos.y - defaultH / 2),
            width: opts.width || defaultW,
            height: opts.height || defaultH,
            ...opts
        });

        if (typeof window.saveStateForUndo === 'function') window.saveStateForUndo();
        if (typeof window.addItemToLayeredItems === 'function') {
            window.addItemToLayeredItems(node);
        }
        if (Array.isArray(window.selectedItems)) {
            window.selectedItems = [node];
        }
        if (typeof window.bringSelectedToFront === 'function') window.bringSelectedToFront();
        if (typeof window.requestUpdate === 'function') window.requestUpdate();

        // Focus prompt textarea after mount
        setTimeout(() => {
            const el = document.getElementById(`gen-dom-${node.id}`);
            const textarea = el?.querySelector('.gen-node-prompt');
            if (textarea) textarea.focus();
        }, 60);

        return node;
    }

    /**
     * Create connected genNode from an existing image (e.g. for Edit or RemoveBg)
     */
    createNodeFromImage(imageItem, task = 'edit') {
        if (!imageItem || imageItem.type !== 'image') return null;

        const workflowId = task === 'removeBg' ? 'qwen-image-2.1-remove-bg' : 'qwen-image-2.1-edit';
        const nodeX = (imageItem.x || 0) + (imageItem.width || 250) + 120;
        const nodeY = (imageItem.y || 0);

        const node = this.createGenNode({
            x: nodeX,
            y: nodeY,
            workflowId,
            prompt: task === 'removeBg' ? 'Remove the background, and output a PNG image' : (imageItem.genMeta?.prompt || '')
        });

        if (typeof window.saveStateForUndo === 'function') window.saveStateForUndo();
        if (typeof window.addItemToLayeredItems === 'function') {
            window.addItemToLayeredItems(node);
        }

        // Create connector: image (right port) -> genNode (ref-in port)
        const conn = {
            id: 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'connector',
            sourceId: imageItem.id,
            sourcePort: 'right',
            targetId: node.id,
            targetPort: 'ref-in',
            color: window.accentColor || '#38bdf8'
        };
        if (typeof window.addItemToLayeredItems === 'function') {
            window.addItemToLayeredItems(conn);
        }

        if (Array.isArray(window.selectedItems)) {
            window.selectedItems = [node];
        }
        if (typeof window.requestUpdate === 'function') window.requestUpdate();

        return node;
    }

    /**
     * Resolves all connected inputs (reference image, prompt notes, seed counters)
     */
    getConnectedInputs(node) {
        if (!Array.isArray(window.items)) return { refImages: [], promptTexts: [], seeds: [] };
        const incomingConnectors = window.items.filter(i =>
            i && i.type === 'connector' && (i.targetId === node.id || (i.sourceId === node.id && ['left', 'ref-in', 'prompt-in', 'seed-in'].includes(i.sourcePort)))
        );

        const refImages = [];
        const promptTexts = [];
        const seeds = [];

        for (const conn of incomingConnectors) {
            const isTarget = conn.targetId === node.id;
            const portName = isTarget ? conn.targetPort : conn.sourcePort;
            const otherId = isTarget ? conn.sourceId : conn.targetId;
            const other = window.items.find(i => i && i.id === otherId);
            if (!other) continue;

            if (portName === 'ref-in' || (portName === 'left' && other.type === 'image')) {
                if (other.type === 'image') refImages.push(other);
            } else if (portName === 'prompt-in' || (portName === 'left' && ['text', 'comment', 'textList'].includes(other.type))) {
                if (other.type === 'text' || other.type === 'comment') {
                    if (other.text) promptTexts.push(other.text);
                } else if (other.type === 'textList' && Array.isArray(other.items)) {
                    const combined = other.items.map(t => t.text).filter(Boolean).join(', ');
                    if (combined) promptTexts.push(combined);
                }
            } else if (portName === 'seed-in' || (portName === 'left' && other.type === 'counter')) {
                if (other.type === 'counter' && typeof other.value === 'number') {
                    seeds.push(other.value);
                } else if (other.type === 'text' || other.type === 'comment') {
                    const num = parseInt(other.text, 10);
                    if (!isNaN(num)) seeds.push(num);
                }
            } else {
                // Heuristic fallback by type
                if (other.type === 'image') refImages.push(other);
                else if (other.type === 'text' || other.type === 'comment') {
                    if (other.text) promptTexts.push(other.text);
                } else if (other.type === 'counter') {
                    seeds.push(other.value);
                }
            }
        }
        return { refImages, promptTexts, seeds };
    }

    /**
     * Backward-compatible helper for reference image
     */
    getConnectedInputImages(node) {
        return this.getConnectedInputs(node).refImages;
    }

    /**
     * Main execution trigger for a genNode
     */
    async executeNode(node) {
        if (!node || node.type !== 'genNode') return;
        if (node._runtime?.status === 'queued' || node._runtime?.status === 'running') return;

        node._runtime = node._runtime || {};
        node._runtime.status = 'queued';
        node._runtime.statusText = 'Checking ComfyUI...';
        node._runtime.progressPercent = 5;
        this.syncSingleNodeDom(node);

        try {
            // Check server stats
            const stats = await this.client.getSystemStats().catch(() => null);
            if (!stats) {
                node._runtime.status = 'offline';
                node._runtime.statusText = 'ComfyUI offline or disconnected';
                this.syncSingleNodeDom(node);
                return;
            }

            // Get workflow data
            const wfData = await this.getWorkflowData(node.workflowId);
            if (!wfData || !wfData.workflow) {
                throw new Error('Workflow not found or invalid.');
            }

            // Check object_info for model auto-adjust
            if (!this.cachedObjectInfo) {
                this.cachedObjectInfo = await this.client.getObjectInfo().catch(() => null);
            }

            let effectiveWorkflow = wfData.workflow;
            if (wfData.sidecar && this.cachedObjectInfo) {
                effectiveWorkflow = autoAdjustWorkflowModels(effectiveWorkflow, wfData.sidecar, this.cachedObjectInfo);
            }

            const mapping = mapWorkflowNodes(effectiveWorkflow, wfData.sidecar);

            // Read connected inputs (reference image, prompt, seed)
            const connected = this.getConnectedInputs(node);

            // Check input image requirement
            let uploadedImageName = null;
            if (mapping.imageInNodeId) {
                node._runtime.statusText = 'Uploading input reference image...';
                this.syncSingleNodeDom(node);

                const refImg = connected.refImages[0];
                if (!refImg) {
                    throw new Error('This workflow requires an image connected to the reference port (left).');
                }

                let blob = null;
                if (refImg.imageId && window.globalImageCache && window.globalImageCache[refImg.imageId]) {
                    const dataUrl = window.globalImageCache[refImg.imageId];
                    const r = await fetch(dataUrl);
                    blob = await r.blob();
                } else if (refImg.img && refImg.img.src) {
                    const r = await fetch(refImg.img.src);
                    blob = await r.blob();
                }

                if (!blob) throw new Error('Could not read connected input image.');
                const uploadRes = await this.client.uploadImage(blob, `ref_${node.id}_${Date.now()}.png`);
                uploadedImageName = uploadRes.name;
            }

            // Effective prompt (combines manual prompt + connected text note if present)
            let effectivePrompt = (node.prompt || '').trim();
            if (connected.promptTexts.length > 0) {
                const piped = connected.promptTexts.join(', ');
                effectivePrompt = effectivePrompt ? `${effectivePrompt}, ${piped}` : piped;
            }

            // Unload models if switch configured
            if (this.client.config.autoUnloadOnSwitch) {
                await this.client.freeMemory(true, false);
            }

            // Batch count (minimum 1, user can specify any number)
            const batchCount = Math.max(1, parseInt(node.batchCount, 10) || 1);
            const [w, h] = (node.size || '1024x1024').split('x').map(Number);

            for (let b = 0; b < batchCount; b++) {
                let currentSeed = node.seedMode === 'fixed' ? Number(node.seed) : Math.floor(Math.random() * 10000000000);
                if (connected.seeds.length > 0) {
                    currentSeed = connected.seeds[0];
                } else if (node.seedMode === 'random' && b === 0) {
                    node.seed = currentSeed;
                } else if (b > 0) {
                    currentSeed = Math.floor(Math.random() * 10000000000);
                }

                const promptParams = {
                    prompt: effectivePrompt,
                    negativePrompt: node.negativePrompt || '',
                    imageName: uploadedImageName,
                    seed: currentSeed,
                    width: w || 1024,
                    height: h || 1024
                };

                const finalPrompt = injectWorkflowParams(effectiveWorkflow, mapping, promptParams);

                node._runtime.status = 'running';
                node._runtime.statusText = `Generating (${b + 1}/${batchCount})...`;
                node._runtime.progressPercent = 15;
                this.syncSingleNodeDom(node);

                const queueRes = await this.client.queuePrompt(finalPrompt);
                const promptId = queueRes.prompt_id;
                node._runtime.currentPromptId = promptId;

                const histEntry = await this.client.watchPrompt(promptId, (p) => {
                    if (p.value != null && p.max != null && p.max > 0) {
                        const pct = 15 + (p.value / p.max) * 80;
                        node._runtime.progressPercent = pct;
                        node._runtime.statusText = `Step ${p.value} of ${p.max} (${b + 1}/${batchCount})`;
                        this.syncSingleNodeDom(node);
                    }
                });

                // Retrieve output image
                const outputs = histEntry.outputs || {};
                let outputImageMeta = null;
                if (mapping.outputNodeId && outputs[mapping.outputNodeId]) {
                    const nodeOut = outputs[mapping.outputNodeId];
                    if (nodeOut.images && nodeOut.images.length > 0) outputImageMeta = nodeOut.images[0];
                }
                if (!outputImageMeta) {
                    for (const nodeOut of Object.values(outputs)) {
                        if (nodeOut.images && nodeOut.images.length > 0) {
                            outputImageMeta = nodeOut.images[0];
                            break;
                        }
                    }
                }

                if (!outputImageMeta) {
                    throw new Error('ComfyUI finished but returned no generated image.');
                }

                const imageBlob = await this.client.getImageBlob(outputImageMeta.filename, outputImageMeta.subfolder, outputImageMeta.type);
                const imageFile = new File([imageBlob], outputImageMeta.filename, { type: 'image/png' });

                const genMeta = {
                    prompt: effectivePrompt,
                    negativePrompt: node.negativePrompt || '',
                    model: mapping.modelName || 'ComfyUI',
                    seed: String(currentSeed),
                    tool: `ComfyUI · ${wfData.sidecar?.name || node.workflowId}`,
                    date: new Date().toISOString()
                };

                // Place output image to the right of genNode, stacked vertically
                const outputIndex = (node.outputs ? node.outputs.length : 0);
                const targetPos = {
                    x: node.x + node.width + 120,
                    y: node.y + (outputIndex * 270)
                };

                await this.ingestOutputImage(node, imageFile, targetPos, genMeta);
            }

            node._runtime.status = 'idle';
            node._runtime.statusText = 'Generation completed!';
            node._runtime.progressPercent = 100;
            this.syncSingleNodeDom(node);
            if (window.showToast) window.showToast('Image(s) generated successfully');

        } catch (err) {
            console.error('[MoodComfy] Error executing genNode:', err);
            node._runtime.status = 'error';
            node._runtime.statusText = err.userMessage || err.message;
            this.syncSingleNodeDom(node);
            if (window.showToast) window.showToast(err.message, 'error');
        }
    }

    /**
     * Ingests generated image into moodinfinite and connects it to the node's output port
     */
    async ingestOutputImage(node, imageFile, targetPos, genMeta) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (readEvent) => {
                const img = new Image();
                img.onload = () => {
                    const aspectRatio = img.width / img.height;
                    const initialWidth = 250;
                    const initialHeight = initialWidth / aspectRatio;
                    const imageId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

                    if (window.globalImageCache) {
                        window.globalImageCache[imageId] = readEvent.target.result;
                    }

                    const newItem = {
                        id: 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        type: 'image',
                        imageId: imageId,
                        img: img,
                        x: targetPos.x,
                        y: targetPos.y,
                        width: initialWidth,
                        height: initialHeight,
                        originalWidth: initialWidth,
                        originalHeight: initialHeight,
                        rotation: 0,
                        isPinned: false,
                        opacity: 1,
                        scaleX: 1,
                        scaleY: 1,
                        genMeta: genMeta,
                        genSourceNodeId: node.id
                    };

                    if (typeof window.addItemToLayeredItems === 'function') {
                        window.addItemToLayeredItems(newItem);
                    }

                    // Create connector: genNode (out port) -> newItem (left port)
                    const conn = {
                        id: 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        type: 'connector',
                        sourceId: node.id,
                        sourcePort: 'out',
                        targetId: newItem.id,
                        targetPort: 'left',
                        color: window.accentColor || '#38bdf8',
                        isAutoOutput: true
                    };

                    if (typeof window.addItemToLayeredItems === 'function') {
                        window.addItemToLayeredItems(conn);
                    }

                    node.outputs = node.outputs || [];
                    node.outputs.push(newItem.id);

                    if (typeof window.saveStateForUndo === 'function') {
                        setTimeout(window.saveStateForUndo, 200);
                    }
                    if (typeof window.requestUpdate === 'function') {
                        window.requestUpdate();
                    }
                    resolve(newItem);
                };
                img.src = readEvent.target.result;
            };
            reader.readAsDataURL(imageFile);
        });
    }

    /**
     * Cancel currently running generation on a node
     */
    async cancelNode(node) {
        if (node._runtime?.currentPromptId) {
            await this.client.deleteQueueItem(node._runtime.currentPromptId);
        }
        await this.client.interrupt();
        node._runtime.status = 'idle';
        node._runtime.statusText = 'Cancelado';
        node._runtime.progressPercent = 0;
        this.syncSingleNodeDom(node);
        if (window.showToast) window.showToast('Generación cancelada');
    }

    /**
     * Regenerates an output image using its original settings with a new random seed
     */
    async regenerateImage(imageItem) {
        if (!imageItem || imageItem.type !== 'image') return;

        // 1. Look for source genNode by id
        let sourceNode = null;
        if (imageItem.genSourceNodeId && Array.isArray(window.items)) {
            sourceNode = window.items.find(i => i && i.id === imageItem.genSourceNodeId && i.type === 'genNode');
        }

        // 2. Look for source genNode via connectors
        if (!sourceNode && Array.isArray(window.items)) {
            const conn = window.items.find(c =>
                c && c.type === 'connector' &&
                (c.targetId === imageItem.id || c.sourceId === imageItem.id) &&
                window.items.some(n => n && (n.id === c.sourceId || n.id === c.targetId) && n.type === 'genNode')
            );
            if (conn) {
                const nodeId = conn.targetId === imageItem.id ? conn.sourceId : conn.targetId;
                sourceNode = window.items.find(n => n && n.id === nodeId && n.type === 'genNode');
            }
        }

        // 3. If source node exists: randomize seed and re-execute
        if (sourceNode) {
            sourceNode.seedMode = 'random';
            sourceNode.seed = Math.floor(Math.random() * 10000000000);
            this.syncSingleNodeDom(sourceNode);
            if (typeof window.requestUpdate === 'function') window.requestUpdate();
            await this.executeNode(sourceNode);
            return;
        }

        // 4. Fallback if node was removed: spawn a new genNode next to image
        const meta = imageItem.genMeta || {};
        const newNode = this.createGenNodeAtCenter({
            x: (imageItem.x || 0) - GEN_NODE_WIDTH - 120,
            y: imageItem.y || 0,
            prompt: meta.prompt || '',
            negativePrompt: meta.negativePrompt || '',
            seedMode: 'random'
        });
        if (typeof window.requestUpdate === 'function') window.requestUpdate();
        await this.executeNode(newNode);
    }

    /**
     * Synchronizes all on-canvas genNodes with DOM overlay elements
     */
    syncAllNodes() {
        if (!this.container) this.setupOverlayContainer();
        if (!Array.isArray(window.items)) return;

        const currentGenNodes = window.items.filter(i => i && i.type === 'genNode');
        const activeIds = new Set(currentGenNodes.map(n => String(n.id)));

        // Remove DOM elements of deleted nodes
        const existingEls = this.container.querySelectorAll('.comfy-gen-node-dom');
        for (const el of existingEls) {
            const nodeId = el.dataset.nodeId;
            if (!activeIds.has(String(nodeId))) {
                el.remove();
            }
        }

        // Mount/update visible nodes
        for (const node of currentGenNodes) {
            this.syncSingleNodeDom(node);
        }
    }

    syncSingleNodeDom(node) {
        if (!this.container) return;

        const stringId = String(node.id);
        let el = document.getElementById(`gen-dom-${stringId}`);
        const connected = this.getConnectedInputs(node);
        const connSignature = `${connected.refImages.length}_${connected.promptTexts.join('|')}_${connected.seeds.join('|')}_${node.outputs?.length || 0}_${node.workflowId}_${node.seedMode}_${node.seed}`;

        if (!el) {
            el = document.createElement('div');
            el.id = `gen-dom-${stringId}`;
            el.className = 'comfy-gen-node-dom';
            el.dataset.nodeId = stringId;
            el.dataset.connSignature = connSignature;
            this.container.appendChild(el);
            this.renderNodeDomContent(el, node);
        } else if (el.dataset.connSignature !== connSignature) {
            const isEditing = document.activeElement && el.contains(document.activeElement) &&
                ['input', 'textarea', 'select'].includes(document.activeElement.tagName.toLowerCase());
            if (!isEditing) {
                el.dataset.connSignature = connSignature;
                this.renderNodeDomContent(el, node);
            }
        }

        // Update position according to worldToScreen and cameraZoom
        if (typeof window.worldToScreen === 'function') {
            const screenPos = window.worldToScreen({ x: node.x, y: node.y });
            const zoom = window.cameraZoom || 1;

            el.style.left = `${screenPos.x}px`;
            el.style.top = `${screenPos.y}px`;
            el.style.transform = `scale(${zoom})`;
            el.style.transformOrigin = 'top left';

            // LOD: if zoomed far out, reduce interaction
            el.style.opacity = zoom < 0.25 ? '0' : '1';
            el.style.pointerEvents = zoom < 0.25 ? 'none' : 'auto';
        }

        // Keep DOM selection styling in sync with Moodinfinite selection
        el.classList.toggle('selected', !!(window.selectedItems && window.selectedItems.includes(node)));

        // Update runtime status texts/bars
        this.updateNodeStatusInDom(el, node);
    }

    renderNodeDomContent(el, node) {
        const connected = this.getConnectedInputs(node);
        const hasInputImages = connected.refImages.length > 0;
        const hasPromptConnected = connected.promptTexts.length > 0;
        const hasSeedConnected = connected.seeds.length > 0;

        const isEditWf = node.workflowId === 'qwen-image-2.1-edit';
        const isRemoveBgWf = node.workflowId === 'qwen-image-2.1-remove-bg';
        const hasRef = isEditWf || isRemoveBgWf || (node.workflowId && (node.workflowId.includes('edit') || node.workflowId.includes('remove-bg')));
        const hasPrompt = !isRemoveBgWf;

        el.innerHTML = `
            <!-- Output Square Port (right edge, vertically centered) -->
            <div class="gen-port-square gen-port-out ${node.outputs?.length ? 'connected' : ''}" title="Image output (out)"></div>

            <div class="gen-node-header" title="Drag to move node">
                <div class="gen-node-title-group">
                    <iconify-icon icon="lucide:sparkles" width="16" height="16" class="gen-sparkle"></iconify-icon>
                    <span class="gen-node-title">Image Generator</span>
                </div>
                <div class="gen-node-tools">
                    <button type="button" class="gen-btn-icon gen-settings-btn" title="Configure ComfyUI">
                        <iconify-icon icon="lucide:settings" width="15" height="15"></iconify-icon>
                    </button>
                    <button type="button" class="gen-btn-icon gen-delete-btn" title="Delete node">
                        <iconify-icon icon="lucide:trash-2" width="15" height="15"></iconify-icon>
                    </button>
                </div>
            </div>

            <div class="gen-node-row">
                <select class="gen-workflow-select">
                    <option value="moss-image-t2i" ${node.workflowId === 'moss-image-t2i' ? 'selected' : ''}>MOSS-Image (Generate)</option>
                    <option value="qwen-image-2.1-edit" ${node.workflowId === 'qwen-image-2.1-edit' ? 'selected' : ''}>Qwen Image 2.1 Edit</option>
                    <option value="qwen-image-2.1-remove-bg" ${node.workflowId === 'qwen-image-2.1-remove-bg' ? 'selected' : ''}>Qwen Remove Background</option>
                </select>
            </div>

            <!-- References slot (shown when workflow is edit/removeBg) -->
            <div class="gen-node-refs-section" style="${hasRef ? '' : 'display:none;'}">
                <div class="gen-port-square gen-port-ref ${hasInputImages ? 'connected' : ''}" title="Image input (ref-in)"></div>
                <div class="gen-section-label">Connected reference:</div>
                <div class="gen-refs-row">
                    ${hasInputImages ? `
                        <div class="gen-ref-thumb-wrap">
                            <img src="${connected.refImages[0].img?.src || ''}" class="gen-ref-thumb" alt="Ref">
                            <span class="gen-ref-name">${connected.refImages[0].caption || 'Image'}</span>
                        </div>
                    ` : `
                        <div class="gen-ref-placeholder">
                            <iconify-icon icon="lucide:arrow-left" width="14" height="14"></iconify-icon>
                            <span>Connect an image on the left</span>
                        </div>
                    `}
                </div>
            </div>

            <!-- Prompt -->
            <div class="gen-node-prompt-wrap" style="${hasPrompt ? '' : 'display:none;'}">
                <div class="gen-port-square gen-port-prompt ${hasPromptConnected ? 'connected' : 'can-add'}" data-port-action="add-prompt" title="${hasPromptConnected ? 'Prompt input (prompt-in)' : 'Add prompt note'}">
                    ${!hasPromptConnected ? '<span class="gen-port-plus">+</span>' : ''}
                </div>
                <textarea class="gen-node-prompt" rows="2" placeholder="${hasPromptConnected ? `Connected: "${connected.promptTexts[0]?.slice(0, 32)}..."` : 'Describe what you want to generate... (Ctrl+Enter to generate)'}">${node.prompt || ''}</textarea>
                ${hasPromptConnected ? `<div class="gen-connected-hint">↳ Connected prompt note</div>` : ''}
            </div>

            <!-- Controls row: Size & Batch Stepper -->
            <div class="gen-node-controls-row">
                <select class="gen-node-size-select">
                    <option value="1024x1024" ${node.size === '1024x1024' ? 'selected' : ''}>1:1 (1024×1024)</option>
                    <option value="896x1152" ${node.size === '896x1152' ? 'selected' : ''}>3:4 (896×1152)</option>
                    <option value="1152x896" ${node.size === '1152x896' ? 'selected' : ''}>4:3 (1152×896)</option>
                    <option value="768x1344" ${node.size === '768x1344' ? 'selected' : ''}>9:16 (768×1344)</option>
                    <option value="1344x768" ${node.size === '1344x768' ? 'selected' : ''}>16:9 (1344×768)</option>
                </select>

                <div class="gen-batch-wrap" title="Batch count">
                    <label>Batch:</label>
                    <input type="number" class="gen-batch-input" min="1" step="1" value="${node.batchCount || 1}">
                </div>
            </div>

            <!-- Seed & Advance Details -->
            <div class="gen-node-seed-row">
                <div class="gen-port-square gen-port-seed ${hasSeedConnected ? 'connected' : 'can-add'}" data-port-action="add-seed" title="${hasSeedConnected ? 'Seed input (seed-in)' : 'Add seed note'}">
                    ${!hasSeedConnected ? '<span class="gen-port-plus">+</span>' : ''}
                </div>
                <input type="number" class="gen-seed-input" placeholder="${hasSeedConnected ? `Connected seed: ${connected.seeds[0]}` : 'Seed (Random)'}" value="${node.seedMode === 'fixed' ? node.seed : ''}">
                <button type="button" class="gen-btn-icon gen-seed-lock-btn ${node.seedMode === 'fixed' ? 'active' : ''}" title="${node.seedMode === 'fixed' ? 'Locked seed' : 'Lock seed'}">
                    <iconify-icon icon="${node.seedMode === 'fixed' ? 'lucide:lock' : 'lucide:unlock'}" width="15" height="15"></iconify-icon>
                </button>
            </div>

            <!-- Progress bar container -->
            <div class="gen-node-progress-wrap" style="display: none;">
                <div class="gen-progress-bar-bg">
                    <div class="gen-progress-bar-fill" style="width: 0%;"></div>
                </div>
                <div class="gen-progress-text">Starting...</div>
            </div>

            <!-- Footer Action Button -->
            <div class="gen-node-footer">
                <button type="button" class="gen-cancel-btn" style="display: none;">
                    <iconify-icon icon="lucide:square" width="14" height="14"></iconify-icon>
                    Cancel
                </button>
                <button type="button" class="gen-submit-btn" title="Generate image (Ctrl+Enter)">
                    <iconify-icon icon="lucide:sparkles" width="16" height="16"></iconify-icon>
                    <span class="gen-submit-text">Generate</span>
                </button>
            </div>
        `;

        this.bindNodeDomEvents(el, node);
    }

    bindNodeDomEvents(el, node) {
        const header = el.querySelector('.gen-node-header');

        // Drag handler that integrates directly with Moodinfinite's native canvas item move & grid snap
        const handleDragStart = (e) => {
            if (e.target.closest('input, textarea, select, button, .gen-btn-icon, .gen-port-square')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.startMovingGenNode === 'function') {
                window.startMovingGenNode(node, e);
            }
        };

        header?.addEventListener('pointerdown', handleDragStart);
        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('input, textarea, select, button, .gen-btn-icon, .gen-port-square')) {
                if (Array.isArray(window.selectedItems) && !window.selectedItems.includes(node)) {
                    window.selectedItems = [node];
                    if (typeof window.requestUpdate === 'function') window.requestUpdate();
                }
                return;
            }
            handleDragStart(e);
        });

        // Prompt input and Ctrl+Enter shortcut
        const promptInput = el.querySelector('.gen-node-prompt');
        promptInput?.addEventListener('input', (e) => {
            node.prompt = e.target.value;
            if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
        });
        promptInput?.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.executeNode(node);
            }
        });

        // Workflow selection
        const wfSelect = el.querySelector('.gen-workflow-select');
        wfSelect?.addEventListener('change', (e) => {
            node.workflowId = e.target.value;
            this.renderNodeDomContent(el, node);
            if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
            if (typeof window.requestUpdate === 'function') window.requestUpdate();
        });

        // Size selection
        const sizeSelect = el.querySelector('.gen-node-size-select');
        sizeSelect?.addEventListener('change', (e) => {
            node.size = e.target.value;
            if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
        });

        // Batch count stepper input
        const batchInput = el.querySelector('.gen-batch-input');
        batchInput?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 1) {
                node.batchCount = val;
                if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
            }
        });
        batchInput?.addEventListener('change', (e) => {
            let val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 1) val = 1;
            e.target.value = val;
            node.batchCount = val;
            if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
        });

        // Seed input
        const seedInput = el.querySelector('.gen-seed-input');
        seedInput?.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            if (val) {
                node.seed = parseInt(val, 10);
                node.seedMode = 'fixed';
            } else {
                node.seedMode = 'random';
            }
            this.renderNodeDomContent(el, node);
            if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
        });

        // Seed lock button
        const seedLockBtn = el.querySelector('.gen-seed-lock-btn');
        seedLockBtn?.addEventListener('click', () => {
            node.seedMode = node.seedMode === 'fixed' ? 'random' : 'fixed';
            if (node.seedMode === 'fixed' && !node.seed) {
                node.seed = Math.floor(Math.random() * 1000000000);
            }
            this.renderNodeDomContent(el, node);
            if (typeof window.scheduleAutoSave === 'function') window.scheduleAutoSave();
        });

        // Settings gear button (stops pointerdown to prevent canvas drag, then calls openComfySettings)
        const settingsBtn = el.querySelector('.gen-settings-btn');
        settingsBtn?.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        settingsBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openComfySettings === 'function') {
                window.openComfySettings();
            } else if (window.MoodComfy && typeof window.MoodComfy.openSettingsDialog === 'function') {
                window.MoodComfy.openSettingsDialog();
            }
        });

        // Delete button
        const deleteBtn = el.querySelector('.gen-delete-btn');
        deleteBtn?.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        deleteBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.deleteItem === 'function') {
                window.deleteItem(node);
            } else {
                if (typeof window.saveStateForUndo === 'function') window.saveStateForUndo();
                if (Array.isArray(window.items)) {
                    const removedIds = new Set([node.id]);
                    if (typeof window.rejoinConnectorsAround === 'function') window.rejoinConnectorsAround(removedIds);
                    window.items = window.items.filter(i => i && i.id !== node.id && !(i.type === 'connector' && (i.sourceId === node.id || i.targetId === node.id)));
                }
                if (Array.isArray(window.selectedItems)) {
                    window.selectedItems = window.selectedItems.filter(i => i && i.id !== node.id);
                }
                el.remove();
                if (typeof window.requestUpdate === 'function') window.requestUpdate();
            }
        });

        // Submit action
        const submitBtn = el.querySelector('.gen-submit-btn');
        submitBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.executeNode(node);
        });

        // Cancel action
        const cancelBtn = el.querySelector('.gen-cancel-btn');
        cancelBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.cancelNode(node);
        });

        // Port "+" click to create connected text notes
        el.querySelectorAll('.gen-port-square.can-add').forEach(portEl => {
            portEl.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            });
            portEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = portEl.dataset.portAction;
                if (action === 'add-prompt') {
                    this.createConnectedNoteForInput(node, 'prompt-in');
                } else if (action === 'add-seed') {
                    this.createConnectedNoteForInput(node, 'seed-in');
                }
            });
        });
    }

    createConnectedNoteForInput(node, portType) {
        if (!node) return;
        const domEl = document.getElementById(`gen-dom-${node.id}`);
        const zoom = window.cameraZoom || 1;

        let targetY = node.y + (portType === 'prompt-in' ? 115 : 200);
        if (domEl) {
            const targetSection = portType === 'prompt-in'
                ? domEl.querySelector('.gen-node-prompt-wrap')
                : domEl.querySelector('.gen-node-seed-row');
            if (targetSection && targetSection.offsetParent !== null) {
                targetY = node.y + targetSection.offsetTop + targetSection.offsetHeight / 2;
            }
        }

        const isPrompt = portType === 'prompt-in';
        const noteW = isPrompt ? 200 : 160;
        const noteH = isPrompt ? 110 : 70;
        const noteX = node.x - noteW - 50;
        const noteY = targetY - noteH / 2;

        const textVal = isPrompt
            ? (node.prompt ? node.prompt : 'A creative scene with...')
            : String(node.seedMode === 'fixed' && node.seed ? node.seed : Math.floor(Math.random() * 10000000000));
        const titleVal = isPrompt ? 'PROMPT' : 'Seed';

        const textItem = {
            id: 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'text',
            text: textVal,
            title: titleVal,
            x: Math.round(noteX / 50) * 50,
            y: Math.round(noteY / 50) * 50,
            width: noteW,
            height: noteH,
            fontSize: 16,
            rotation: 0,
            isPinned: false,
            opacity: 1,
            fontFamily: 'Nunito',
            color: window.accentColor || '#38bdf8',
            scaleX: 1,
            scaleY: 1
        };

        const conn = {
            id: 'group_' + (Date.now() + 1) + '_' + Math.random().toString(36).substr(2, 5),
            type: 'connector',
            sourceId: textItem.id,
            sourcePort: 'right',
            targetId: node.id,
            targetPort: portType,
            color: window.accentColor || '#38bdf8'
        };

        if (typeof window.saveStateForUndo === 'function') window.saveStateForUndo();
        if (typeof window.addItemToLayeredItems === 'function') {
            window.addItemToLayeredItems(textItem);
            window.addItemToLayeredItems(conn);
        } else if (Array.isArray(window.items)) {
            window.items.push(textItem);
            window.items.push(conn);
        }

        if (typeof window.requestUpdate === 'function') window.requestUpdate();
        if (domEl) this.renderNodeDomContent(domEl, node);
        this.syncSingleNodeDom(node);
        if (window.showToast) {
            window.showToast(`Created connected ${titleVal.toLowerCase()} note`);
        }
    }

    updateNodeStatusInDom(el, node) {
        const runtime = node._runtime || {};
        const progressWrap = el.querySelector('.gen-node-progress-wrap');
        const progressBarFill = el.querySelector('.gen-progress-bar-fill');
        const progressText = el.querySelector('.gen-progress-text');
        const submitBtn = el.querySelector('.gen-submit-btn');
        const submitText = el.querySelector('.gen-submit-text');
        const cancelBtn = el.querySelector('.gen-cancel-btn');

        const isRunning = runtime.status === 'queued' || runtime.status === 'running';

        if (progressWrap) progressWrap.style.display = isRunning ? 'block' : 'none';
        if (cancelBtn) cancelBtn.style.display = isRunning ? 'inline-flex' : 'none';
        if (submitBtn) submitBtn.disabled = isRunning;

        if (progressBarFill) {
            progressBarFill.style.width = `${runtime.progressPercent || 0}%`;
        }
        if (progressText) {
            progressText.textContent = runtime.statusText || '';
        }

        if (runtime.status === 'offline') {
            if (submitText) submitText.textContent = 'Retry (ComfyUI offline)';
            if (submitBtn) submitBtn.classList.add('gen-btn-offline');
        } else {
            if (submitText) submitText.textContent = isRunning ? 'Generating...' : 'Generate';
            if (submitBtn) submitBtn.classList.remove('gen-btn-offline');
        }
    }

    /**
     * Canvas 2D fallback renderer (for PNG export and low zoom levels)
     */
    drawGenNodeOnCanvas(ctx, node) {
        const w = node.width || GEN_NODE_WIDTH;
        const h = node.height || GEN_NODE_DEFAULT_HEIGHT;

        ctx.save();
        ctx.translate(node.x, node.y);

        // Body rounded rect
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = window.selectedItems?.includes(node) ? (window.accentColor || '#38bdf8') : '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, w, h, 12);
        } else {
            ctx.rect(0, 0, w, h);
        }
        ctx.fill();
        ctx.stroke();

        // Header bar
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, w, 44, [12, 12, 0, 0]);
        } else {
            ctx.rect(0, 0, w, 44);
        }
        ctx.fill();

        // Title
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('✨ Image Generator', 14, 22);

        // Workflow chip
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(14, 54, w - 28, 28, 6);
        else ctx.rect(14, 54, w - 28, 28);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Nunito, sans-serif';
        ctx.fillText(node.workflowId || 'MOSS-Image', 24, 68);

        // Prompt box
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(14, 92, w - 28, 60, 6);
        else ctx.rect(14, 92, w - 28, 60);
        ctx.fill();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '12px Nunito, sans-serif';
        const promptSnippet = (node.prompt || 'Sin prompt...').slice(0, 60);
        ctx.fillText(promptSnippet, 22, 112);

        // Ports visualization (square handles matching DOM indicators)
        ctx.fillStyle = window.accentColor || '#38bdf8';
        const isEditWf = node.workflowId === 'qwen-image-2.1-edit';
        const isRemoveBgWf = node.workflowId === 'qwen-image-2.1-remove-bg';
        const hasRef = isEditWf || isRemoveBgWf;
        const hasPrompt = !isRemoveBgWf;

        if (hasRef) ctx.fillRect(-5, 105, 10, 10);
        if (hasPrompt) ctx.fillRect(-5, hasRef ? 190 : 115, 10, 10);
        ctx.fillRect(-5, hasRef ? (hasPrompt ? 280 : 190) : (hasPrompt ? 195 : 120), 10, 10);
        ctx.fillRect(w - 5, h / 2 - 5, 10, 10);

        ctx.restore();
    }
}

// Global helper attachment
if (typeof window !== 'undefined') {
    window.ComfyGenNodeManager = new ComfyGenNodeManager();
}
