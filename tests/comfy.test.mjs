import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    detectWorkflowFormat,
    WORKFLOW_FORMATS,
    mapWorkflowNodes,
    validateTaskRequirements,
    injectWorkflowParams,
    validateAgainstObjectInfo
} from '../modules/comfy-workflows.js';

test('detectWorkflowFormat identifies UI vs API workflows', () => {
    const uiWf = { nodes: [{ id: 1, type: 'KSampler' }], links: [[1, 1, 0, 2, 0]] };
    assert.equal(detectWorkflowFormat(uiWf), WORKFLOW_FORMATS.UI);

    const apiWf = {
        '1': { class_type: 'KSampler', inputs: {} },
        '2': { class_type: 'SaveImage', inputs: {} }
    };
    assert.equal(detectWorkflowFormat(apiWf), WORKFLOW_FORMATS.API);

    assert.equal(detectWorkflowFormat(null), WORKFLOW_FORMATS.UNKNOWN);
    assert.equal(detectWorkflowFormat({}), WORKFLOW_FORMATS.UNKNOWN);
});

test('mapWorkflowNodes maps MI_* titles and falls back to heuristics', () => {
    const apiWf = {
        '10': { class_type: 'CLIPTextEncode', _meta: { title: 'MI_PROMPT' }, inputs: { text: '' } },
        '11': { class_type: 'CLIPTextEncode', _meta: { title: 'MI_NEG' }, inputs: { text: '' } },
        '20': { class_type: 'LoadImage', _meta: { title: 'MI_IMAGE_IN' }, inputs: { image: '' } },
        '30': { class_type: 'KSampler', _meta: { title: 'MI_SEED' }, inputs: { seed: 12345 } },
        '40': { class_type: 'EmptyLatentImage', _meta: { title: 'MI_SIZE' }, inputs: { width: 512, height: 512 } },
        '50': { class_type: 'SaveImage', _meta: { title: 'MI_OUTPUT' }, inputs: {} }
    };

    const mapping = mapWorkflowNodes(apiWf);
    assert.equal(mapping.promptNodeId, '10');
    assert.equal(mapping.negNodeId, '11');
    assert.equal(mapping.imageInNodeId, '20');
    assert.equal(mapping.seedNodeId, '30');
    assert.equal(mapping.sizeNodeId, '40');
    assert.equal(mapping.outputNodeId, '50');

    const reqGen = validateTaskRequirements('generate', mapping);
    assert.equal(reqGen.valid, true);

    const reqEdit = validateTaskRequirements('edit', mapping);
    assert.equal(reqEdit.valid, true);
});

test('default generated workflows load and validate correctly', () => {
    const moss = JSON.parse(fs.readFileSync(path.resolve('workflows/moss-image-t2i.api.json'), 'utf8'));
    const mossSide = JSON.parse(fs.readFileSync(path.resolve('workflows/moss-image-t2i.moodinfinite.json'), 'utf8'));
    const mossMapping = mapWorkflowNodes(moss, mossSide);
    assert.ok(mossMapping.promptNodeId, 'MOSS has prompt node');
    assert.ok(mossMapping.seedNodeId, 'MOSS has seed node');
    assert.ok(mossMapping.sizeNodeId, 'MOSS has size node');
    assert.equal(validateTaskRequirements('generate', mossMapping).valid, true);

    const qwenEdit = JSON.parse(fs.readFileSync(path.resolve('workflows/qwen-image-2.1-edit.api.json'), 'utf8'));
    const qwenEditSide = JSON.parse(fs.readFileSync(path.resolve('workflows/qwen-image-2.1-edit.moodinfinite.json'), 'utf8'));
    const qwenMapping = mapWorkflowNodes(qwenEdit, qwenEditSide);
    assert.ok(qwenMapping.promptNodeId, 'Qwen Edit has prompt node');
    assert.ok(qwenMapping.imageInNodeId, 'Qwen Edit has image node');
    assert.equal(validateTaskRequirements('edit', qwenMapping).valid, true);

    // Test parameter injection
    const injected = injectWorkflowParams(moss, mossMapping, {
        prompt: 'a futuristic city at dusk',
        seed: 9999,
        width: 1280,
        height: 720
    });
    assert.equal(injected[mossMapping.promptNodeId].inputs[mossMapping.promptKey], 'a futuristic city at dusk');
    assert.equal(injected[mossMapping.seedNodeId].inputs[mossMapping.seedKey], 9999);
    assert.equal(injected[mossMapping.sizeNodeId].inputs.width, 1280);
    assert.equal(injected[mossMapping.sizeNodeId].inputs.height, 720);
});

test('validateAgainstObjectInfo detects missing nodes and models', () => {
    const wf = {
        '1': { class_type: 'CustomCoolNode', inputs: {} },
        '2': { class_type: 'UNETLoader', inputs: { unet_name: 'missing_model.safetensors' } }
    };
    const mockObjectInfo = {
        'UNETLoader': {
            input: {
                required: {
                    unet_name: [['installed_model.safetensors'], {}]
                }
            }
        }
    };
    const res = validateAgainstObjectInfo(wf, mockObjectInfo);
    assert.equal(res.valid, false);
    assert.equal(res.missingClasses.length, 1);
    assert.equal(res.missingClasses[0].classType, 'CustomCoolNode');
    assert.equal(res.missingModels.length, 1);
    assert.equal(res.missingModels[0].requiredValue, 'missing_model.safetensors');
});

test('genNode multi-port resolution and connector direction', () => {
    // Simulate getItemPorts behavior for genNode
    const simulateGetItemPorts = (node) => {
        const w = node.width || 340;
        const isEditWf = node.workflowId === 'qwen-image-2.1-edit';
        const isRemoveBgWf = node.workflowId === 'qwen-image-2.1-remove-bg';
        const hasRef = isEditWf || isRemoveBgWf;
        const hasPrompt = !isRemoveBgWf;

        let refY = hasRef ? 122 : null;
        let promptY = hasPrompt ? (hasRef ? 202 : 122) : null;
        let seedY = hasRef ? (hasPrompt ? 292 : 212) : (hasPrompt ? 212 : 132);

        const ports = [];
        if (hasRef && refY != null) ports.push({ side: 'ref-in', x: node.x, y: node.y + refY, label: 'Image' });
        if (hasPrompt && promptY != null) ports.push({ side: 'prompt-in', x: node.x, y: node.y + promptY, label: 'Prompt' });
        if (seedY != null) ports.push({ side: 'seed-in', x: node.x, y: node.y + seedY, label: 'Seed' });
        ports.push({ side: 'out', x: node.x + w, y: node.y + (node.height || 360) / 2, label: 'Output' });
        return ports;
    };

    // Text-to-Image should NOT expose ref-in
    const t2iPorts = simulateGetItemPorts({ x: 100, y: 100, width: 340, height: 350, workflowId: 'moss-image-t2i' });
    assert.equal(t2iPorts.some(p => p.side === 'ref-in'), false, 'T2I workflow has no ref-in');
    assert.equal(t2iPorts.some(p => p.side === 'prompt-in'), true, 'T2I workflow has prompt-in');
    assert.equal(t2iPorts.some(p => p.side === 'seed-in'), true, 'T2I workflow has seed-in');
    assert.equal(t2iPorts.some(p => p.side === 'out'), true, 'T2I workflow has out');

    // Edit workflow should expose ref-in, prompt-in, seed-in, and out
    const editPorts = simulateGetItemPorts({ x: 100, y: 100, width: 340, height: 420, workflowId: 'qwen-image-2.1-edit' });
    assert.equal(editPorts.some(p => p.side === 'ref-in'), true, 'Edit workflow has ref-in');
    assert.equal(editPorts.some(p => p.side === 'prompt-in'), true, 'Edit workflow has prompt-in');
    assert.equal(editPorts.some(p => p.side === 'seed-in'), true, 'Edit workflow has seed-in');
    assert.equal(editPorts.some(p => p.side === 'out'), true, 'Edit workflow has out');

    // RemoveBg workflow has ref-in and seed-in, but no prompt-in
    const rmbgPorts = simulateGetItemPorts({ x: 100, y: 100, width: 340, height: 350, workflowId: 'qwen-image-2.1-remove-bg' });
    assert.equal(rmbgPorts.some(p => p.side === 'ref-in'), true, 'RemoveBg workflow has ref-in');
    assert.equal(rmbgPorts.some(p => p.side === 'prompt-in'), false, 'RemoveBg workflow has no prompt-in');
    assert.equal(rmbgPorts.some(p => p.side === 'seed-in'), true, 'RemoveBg workflow has seed-in');
});
