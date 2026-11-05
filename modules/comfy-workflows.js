/**
 * ComfyUI Workflows parser, validator and injector for moodinfinite.
 * Works purely in memory (no DOM dependencies) so it's fully unit-testable.
 */

export const WORKFLOW_FORMATS = {
    API: 'api',
    UI: 'ui',
    UNKNOWN: 'unknown'
};

/**
 * Detects whether a parsed JSON workflow is in UI format (nodes, links) or API format.
 */
export function detectWorkflowFormat(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return WORKFLOW_FORMATS.UNKNOWN;
    }
    if (Array.isArray(json.nodes) && (Array.isArray(json.links) || json.definitions)) {
        return WORKFLOW_FORMATS.UI;
    }
    // API format is keyed by node IDs (strings/numbers) with class_type & inputs
    const keys = Object.keys(json);
    if (keys.length > 0 && keys.every(k => json[k] && typeof json[k] === 'object' && 'class_type' in json[k] && 'inputs' in json[k])) {
        return WORKFLOW_FORMATS.API;
    }
    return WORKFLOW_FORMATS.UNKNOWN;
}

/**
 * Discovers nodes by special titles (MI_PROMPT, MI_NEG, MI_IMAGE_IN, MI_SEED, MI_SIZE, MI_OUTPUT)
 * with heuristic fallbacks if titles are missing.
 */
export function mapWorkflowNodes(apiWorkflow, sidecar = null) {
    const mapping = {
        promptNodeId: null,
        promptKey: 'text',
        negNodeId: null,
        negKey: 'text',
        imageInNodeId: null,
        imageInKey: 'image',
        seedNodeId: null,
        seedKey: 'seed',
        sizeNodeId: null,
        sizeWidthKey: 'width',
        sizeHeightKey: 'height',
        outputNodeId: null,
        modelName: null
    };

    if (!apiWorkflow || typeof apiWorkflow !== 'object') return mapping;

    // 1. Check sidecar explicit overrides
    if (sidecar && sidecar.inputs) {
        if (sidecar.inputs.prompt) {
            mapping.promptNodeId = String(sidecar.inputs.prompt[0]);
            mapping.promptKey = sidecar.inputs.prompt[1] || 'text';
        }
        if (sidecar.inputs.negativePrompt) {
            mapping.negNodeId = String(sidecar.inputs.negativePrompt[0]);
            mapping.negKey = sidecar.inputs.negativePrompt[1] || 'text';
        }
        if (sidecar.inputs.image) {
            mapping.imageInNodeId = String(sidecar.inputs.image[0]);
            mapping.imageInKey = sidecar.inputs.image[1] || 'image';
        }
        if (sidecar.inputs.seed) {
            mapping.seedNodeId = String(sidecar.inputs.seed[0]);
            mapping.seedKey = sidecar.inputs.seed[1] || 'seed';
        }
        if (sidecar.inputs.size) {
            mapping.sizeNodeId = String(sidecar.inputs.size[0]);
            mapping.sizeWidthKey = sidecar.inputs.size[1] || 'width';
            mapping.sizeHeightKey = sidecar.inputs.size[2] || 'height';
        }
    }

    // 2. Scan meta titles
    for (const [id, node] of Object.entries(apiWorkflow)) {
        if (!node || !node.class_type) continue;
        const metaTitle = (node._meta && node._meta.title) ? String(node._meta.title).trim() : '';
        const inputs = node.inputs || {};

        if (metaTitle === 'MI_PROMPT' || metaTitle.startsWith('MI_PROMPT:')) {
            mapping.promptNodeId = id;
            if (metaTitle.includes(':')) mapping.promptKey = metaTitle.split(':')[1];
            else if ('prompt' in inputs) mapping.promptKey = 'prompt';
            else if ('text' in inputs) mapping.promptKey = 'text';
        } else if (metaTitle === 'MI_NEG' || metaTitle.startsWith('MI_NEG:')) {
            mapping.negNodeId = id;
            if (metaTitle.includes(':')) mapping.negKey = metaTitle.split(':')[1];
            else if ('text' in inputs) mapping.negKey = 'text';
            else if ('negative_prompt' in inputs) mapping.negKey = 'negative_prompt';
        } else if (metaTitle === 'MI_IMAGE_IN' || metaTitle.startsWith('MI_IMAGE_IN:')) {
            mapping.imageInNodeId = id;
            if (metaTitle.includes(':')) mapping.imageInKey = metaTitle.split(':')[1];
            else mapping.imageInKey = 'image';
        } else if (metaTitle === 'MI_SEED' || metaTitle.startsWith('MI_SEED:')) {
            mapping.seedNodeId = id;
            if (metaTitle.includes(':')) mapping.seedKey = metaTitle.split(':')[1];
            else if ('seed' in inputs) mapping.seedKey = 'seed';
            else if ('noise_seed' in inputs) mapping.seedKey = 'noise_seed';
        } else if (metaTitle === 'MI_SIZE') {
            mapping.sizeNodeId = id;
        } else if (metaTitle === 'MI_OUTPUT') {
            mapping.outputNodeId = id;
        }

        // Try extracting model name
        if (!mapping.modelName) {
            if (inputs.unet_name && typeof inputs.unet_name === 'string') {
                mapping.modelName = inputs.unet_name;
            } else if (inputs.ckpt_name && typeof inputs.ckpt_name === 'string') {
                mapping.modelName = inputs.ckpt_name;
            }
        }
    }

    // 3. Heuristic fallbacks if not found by title/sidecar
    for (const [id, node] of Object.entries(apiWorkflow)) {
        const cls = node.class_type || '';
        const inputs = node.inputs || {};

        if (!mapping.promptNodeId) {
            if ((cls === 'CLIPTextEncode' || cls.includes('TextEncode') || cls === 'PrimitiveStringMultiline') && ('text' in inputs || 'prompt' in inputs || 'value' in inputs)) {
                // If there's another node that might be negative, don't pick it as prompt if it has "negative" in title
                const titleLower = ((node._meta && node._meta.title) || '').toLowerCase();
                if (!titleLower.includes('negative') && !titleLower.includes('system')) {
                    mapping.promptNodeId = id;
                    mapping.promptKey = 'text' in inputs ? 'text' : ('prompt' in inputs ? 'prompt' : 'value');
                }
            }
        }

        if (!mapping.negNodeId) {
            const titleLower = ((node._meta && node._meta.title) || '').toLowerCase();
            if (titleLower.includes('negative') && (cls === 'CLIPTextEncode' || cls.includes('TextEncode'))) {
                mapping.negNodeId = id;
                mapping.negKey = 'text' in inputs ? 'text' : 'negative_prompt';
            }
        }

        if (!mapping.imageInNodeId) {
            if (cls === 'LoadImage' && 'image' in inputs) {
                mapping.imageInNodeId = id;
                mapping.imageInKey = 'image';
            }
        }

        if (!mapping.seedNodeId) {
            if (cls === 'KSampler' || cls === 'KSamplerAdvanced') {
                mapping.seedNodeId = id;
                mapping.seedKey = 'seed';
            } else if (cls === 'RandomNoise' && 'noise_seed' in inputs) {
                mapping.seedNodeId = id;
                mapping.seedKey = 'noise_seed';
            }
        }

        if (!mapping.sizeNodeId) {
            if ((cls === 'EmptyLatentImage' || cls === 'EmptyFlux2LatentImage') && 'width' in inputs && 'height' in inputs) {
                mapping.sizeNodeId = id;
            }
        }

        if (!mapping.outputNodeId) {
            if (cls === 'SaveImage' || cls === 'SaveImageAdvanced') {
                mapping.outputNodeId = id;
            }
        }
    }

    return mapping;
}

/**
 * Validates requirements for a given task:
 * - 'generate': requires promptNodeId
 * - 'edit': requires promptNodeId and imageInNodeId
 * - 'removeBg': requires imageInNodeId
 */
export function validateTaskRequirements(task, mapping) {
    const missing = [];
    if (task === 'generate') {
        if (!mapping.promptNodeId) missing.push('MI_PROMPT (Text/Prompt Node)');
    } else if (task === 'edit') {
        if (!mapping.promptNodeId) missing.push('MI_PROMPT (Text/Prompt Node)');
        if (!mapping.imageInNodeId) missing.push('MI_IMAGE_IN (LoadImage Node)');
    } else if (task === 'removeBg') {
        if (!mapping.imageInNodeId) missing.push('MI_IMAGE_IN (LoadImage Node)');
    }
    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * Injects parameters into a clone of the API workflow.
 */
export function injectWorkflowParams(apiWorkflow, mapping, params = {}) {
    // Deep clone
    const cloned = JSON.parse(JSON.stringify(apiWorkflow));

    if (mapping.promptNodeId && params.prompt != null && cloned[mapping.promptNodeId]) {
        cloned[mapping.promptNodeId].inputs[mapping.promptKey] = String(params.prompt);
    }

    if (mapping.negNodeId && params.negativePrompt != null && cloned[mapping.negNodeId]) {
        cloned[mapping.negNodeId].inputs[mapping.negKey] = String(params.negativePrompt);
    }

    if (mapping.imageInNodeId && params.imageName != null && cloned[mapping.imageInNodeId]) {
        cloned[mapping.imageInNodeId].inputs[mapping.imageInKey] = String(params.imageName);
    }

    if (mapping.seedNodeId && params.seed != null && cloned[mapping.seedNodeId]) {
        cloned[mapping.seedNodeId].inputs[mapping.seedKey] = Number(params.seed);
    }

    if (mapping.sizeNodeId && cloned[mapping.sizeNodeId]) {
        if (params.width != null) cloned[mapping.sizeNodeId].inputs[mapping.sizeWidthKey] = Number(params.width);
        if (params.height != null) cloned[mapping.sizeNodeId].inputs[mapping.sizeHeightKey] = Number(params.height);
    }

    // Apply model alternative if specified in params.modelOverrides
    if (params.modelOverrides && typeof params.modelOverrides === 'object') {
        for (const [nodeAndKey, val] of Object.entries(params.modelOverrides)) {
            const [nid, key] = nodeAndKey.split('.');
            if (nid && key && cloned[nid] && cloned[nid].inputs) {
                cloned[nid].inputs[key] = val;
            }
        }
    }

    return cloned;
}

/**
 * Auto-adjusts model references in workflow based on available models in objectInfo
 * and alternatives specified in sidecar.
 */
export function autoAdjustWorkflowModels(apiWorkflow, sidecar, objectInfo) {
    if (!apiWorkflow || !sidecar || !sidecar.alternatives || !objectInfo) return apiWorkflow;
    const cloned = JSON.parse(JSON.stringify(apiWorkflow));

    for (const [nodeAndKey, candidates] of Object.entries(sidecar.alternatives)) {
        const [nid, key] = nodeAndKey.split('.');
        if (!nid || !key || !cloned[nid] || !cloned[nid].inputs) continue;
        const node = cloned[nid];
        const cls = node.class_type;
        const nodeDef = objectInfo[cls];
        if (!nodeDef) continue;

        const findOptions = (inputs) => {
            if (inputs && inputs[key] && Array.isArray(inputs[key]) && Array.isArray(inputs[key][0])) {
                return inputs[key][0];
            }
            return null;
        };

        const available = findOptions(nodeDef.input?.required) || findOptions(nodeDef.input?.optional);
        if (!available) continue;

        // If current value is not available, check candidates
        const currentVal = node.inputs[key];
        if (!available.includes(currentVal)) {
            for (const cand of candidates) {
                if (available.includes(cand)) {
                    node.inputs[key] = cand;
                    break;
                }
            }
        }
    }

    return cloned;
}

/**
 * Validates class_types and model values against ComfyUI /object_info output.
 * Returns { valid: boolean, missingClasses: [], missingModels: [] }
 */
export function validateAgainstObjectInfo(apiWorkflow, objectInfo) {
    if (!objectInfo || typeof objectInfo !== 'object') {
        return { valid: true, missingClasses: [], missingModels: [] };
    }

    const missingClasses = [];
    const missingModels = [];

    for (const [nid, node] of Object.entries(apiWorkflow)) {
        if (!node || !node.class_type) continue;
        const cls = node.class_type;
        const nodeDef = objectInfo[cls];
        if (!nodeDef) {
            missingClasses.push({ nodeId: nid, classType: cls });
            continue;
        }

        // Check required and optional inputs for model dropdowns
        const checkInputs = (inputDefs) => {
            if (!inputDefs) return;
            for (const [inputName, def] of Object.entries(inputDefs)) {
                if (Array.isArray(def) && Array.isArray(def[0]) && typeof def[0][0] === 'string') {
                    // It's a combo dropdown (e.g. unet_name, clip_name, vae_name, ckpt_name)
                    const actualValue = node.inputs ? node.inputs[inputName] : null;
                    if (typeof actualValue === 'string' && actualValue.trim() !== '') {
                        const availableOptions = def[0];
                        if (!availableOptions.includes(actualValue)) {
                            missingModels.push({
                                nodeId: nid,
                                classType: cls,
                                inputName,
                                requiredValue: actualValue,
                                availableOptions
                            });
                        }
                    }
                }
            }
        };

        if (nodeDef.input) {
            checkInputs(nodeDef.input.required);
            checkInputs(nodeDef.input.optional);
        }
    }

    return {
        valid: missingClasses.length === 0 && missingModels.length === 0,
        missingClasses,
        missingModels
    };
}
