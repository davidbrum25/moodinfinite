/**
 * Generation metadata (genMeta) for moodboard image cards.
 * Pure functions: PNG text chunks in, a small field object out.
 * The ComfyUI workflow graph is never kept.
 */

export const GEN_META_LIMITS = {
    prompt: 4000,
    negativePrompt: 4000,
    notes: 2000,
    model: 200,
    tool: 200,
    seed: 40,
    date: 40,
    lora: 200,
    loraCount: 20,
};

const TEXT_FIELDS = ['prompt', 'negativePrompt', 'model', 'seed', 'tool', 'date', 'notes'];

function clipText(value, max) {
    if (value == null) return '';
    let text = '';
    if (typeof value === 'string') text = value;
    else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
    else return '';
    text = text.replace(/\u0000/g, '').trim();
    if (text.length > max) text = text.slice(0, max);
    return text;
}

function looksLikeWorkflow(text) {
    if (typeof text !== 'string' || text.length < 40) return false;
    return text.includes('"class_type"') && text.includes('"inputs"');
}

/**
 * One sanitizer for import, manual edit and project load.
 * Unknown keys (workflow, raw graph) are dropped. Empty input returns null.
 */
export function sanitizeGenMeta(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const limits = GEN_META_LIMITS;
    const out = {};
    TEXT_FIELDS.forEach((key) => {
        let text = clipText(input[key], limits[key]);
        if ((key === 'prompt' || key === 'negativePrompt') && looksLikeWorkflow(text)) text = '';
        if (text) out[key] = text;
    });

    let rawLoras = [];
    if (Array.isArray(input.loras)) rawLoras = input.loras;
    else if (typeof input.loras === 'string' && input.loras.trim()) rawLoras = input.loras.split(/\n+/);

    const loras = [];
    for (let i = 0; i < rawLoras.length && loras.length < limits.loraCount; i++) {
        const entry = clipText(rawLoras[i], limits.lora);
        if (entry && !looksLikeWorkflow(entry)) loras.push(entry);
    }
    if (loras.length) out.loras = loras;
    return Object.keys(out).length ? out : null;
}

export function stripGenMeta(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const copy = { ...item };
        delete copy.genMeta;
        if (copy.type === 'group' && Array.isArray(copy.items)) copy.items = stripGenMeta(copy.items);
        return copy;
    });
}

export function itemMatchesGenQuery(item, query, field) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    if (!item || item.type !== 'image' || !item.genMeta) return false;
    const meta = item.genMeta;
    const has = (value) => String(value || '').toLowerCase().includes(q);
    const loraHit = Array.isArray(meta.loras) && meta.loras.some((entry) => has(entry));
    if (field === 'prompt') return has(meta.prompt);
    if (field === 'model' || field === 'modelo') return has(meta.model);
    if (field === 'lora' || field === 'loras') return loraHit;
    return has(meta.prompt) || has(meta.model) || loraHit;
}

function readU32(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function ascii(bytes, offset, length) {
    let text = '';
    for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[offset + i]);
    return text;
}

function decodeBytes(bytes) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (err) {
        let text = '';
        for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
        return text;
    }
}

function cstring(bytes, start) {
    let end = start;
    while (end < bytes.length && bytes[end] !== 0) end++;
    return { text: decodeBytes(bytes.subarray(start, end)), next: end + 1 };
}

async function inflateZlib(bytes) {
    if (typeof DecompressionStream === 'undefined' || !bytes || !bytes.length) return null;
    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
        const out = await new Response(stream).arrayBuffer();
        return new Uint8Array(out);
    } catch (err) {
        return null;
    }
}

async function readTextChunk(type, data) {
    if (!data || !data.length) return null;
    if (type === 'tEXt') {
        const key = cstring(data, 0);
        if (!key.text || key.next > data.length) return null;
        return { keyword: key.text, text: decodeBytes(data.subarray(key.next)) };
    }
    if (type === 'zTXt') {
        const key = cstring(data, 0);
        if (!key.text || key.next >= data.length) return null;
        const inflated = await inflateZlib(data.subarray(key.next + 1));
        if (!inflated) return null;
        return { keyword: key.text, text: decodeBytes(inflated) };
    }
    if (type === 'iTXt') {
        const key = cstring(data, 0);
        if (!key.text || key.next + 2 > data.length) return null;
        const flag = data[key.next];
        let cursor = key.next + 2;
        const language = cstring(data, cursor);
        cursor = language.next;
        const translated = cstring(data, cursor);
        cursor = translated.next;
        if (cursor > data.length) return null;
        let payload = data.subarray(cursor);
        if (flag === 1) {
            const inflated = await inflateZlib(payload);
            if (!inflated) return null;
            payload = inflated;
        }
        return { keyword: key.text, text: decodeBytes(payload) };
    }
    return null;
}

function formatPngTime(data) {
    if (!data || data.length < 7) return '';
    const year = (data[0] << 8) | data[1];
    const month = data[2];
    const day = data[3];
    const hour = data[4];
    const minute = data[5];
    const second = data[6];
    if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    if (hour > 23 || minute > 59 || second > 60) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return year + '-' + pad(month) + '-' + pad(day) + ' ' + pad(hour) + ':' + pad(minute) + ':' + pad(second);
}

function linkId(value) {
    if (!Array.isArray(value) || value.length < 2) return null;
    if (typeof value[1] !== 'number') return null;
    if (typeof value[0] !== 'string' && typeof value[0] !== 'number') return null;
    return String(value[0]);
}

function resolveScalar(graph, value, depth) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    const id = linkId(value);
    if (!id || depth > 6 || !graph[id] || !graph[id].inputs) return '';
    const inputs = graph[id].inputs;
    const next = inputs.value ?? inputs.text ?? inputs.string ?? inputs.seed ?? inputs.noise_seed ?? inputs.int;
    if (next === value) return '';
    return resolveScalar(graph, next, depth + 1);
}

function isSampler(type) {
    return type === 'KSampler' || type === 'KSamplerAdvanced' || type === 'SamplerCustom' || type === 'SamplerCustomAdvanced' || type.indexOf('KSampler') === 0;
}

function collectClipText(graph, nodeId, seen) {
    if (!nodeId || seen.has(nodeId)) return [];
    seen.add(nodeId);
    const node = graph[nodeId];
    if (!node || typeof node !== 'object') return [];
    const type = String(node.class_type || '');
    const inputs = node.inputs || {};
    if (/CLIPTextEncode|TextEncode/i.test(type)) {
        const parts = [];
        ['text', 'text_g', 'text_l'].forEach((key) => {
            const text = resolveScalar(graph, inputs[key], 0);
            if (text) parts.push(text);
        });
        return parts;
    }
    const out = [];
    Object.keys(inputs).forEach((key) => {
        if (!/conditioning|positive|negative|cond/i.test(key)) return;
        const id = linkId(inputs[key]);
        if (id) out.push(...collectClipText(graph, id, seen));
    });
    return out;
}

function readSamplerSeed(graph, node) {
    const inputs = node.inputs || {};
    const direct = resolveScalar(graph, inputs.seed, 0) || resolveScalar(graph, inputs.noise_seed, 0);
    if (direct) return direct;
    const noiseId = linkId(inputs.noise);
    if (!noiseId || !graph[noiseId] || !graph[noiseId].inputs) return '';
    const noise = graph[noiseId].inputs;
    return resolveScalar(graph, noise.noise_seed, 0) || resolveScalar(graph, noise.seed, 0);
}

function formatStrength(value) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return '';
    const rounded = Math.round(number * 1000) / 1000;
    return String(rounded);
}

function asGraph(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const nodes = Object.keys(value).filter((key) => {
        const node = value[key];
        return node && typeof node === 'object' && typeof node.class_type === 'string';
    });
    if (nodes.length) return value;
    if (value.prompt && typeof value.prompt === 'object') return asGraph(value.prompt);
    return null;
}

export function extractComfyGenMeta(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        return null;
    }
    const graph = asGraph(parsed);
    if (!graph) return null;

    const samplers = [];
    const models = [];
    const loras = [];
    Object.keys(graph).forEach((key) => {
        const node = graph[key];
        if (!node || typeof node !== 'object') return;
        const type = String(node.class_type || '');
        const inputs = node.inputs || {};
        if (isSampler(type)) samplers.push(node);
        if (/CheckpointLoader|UNETLoader|UnetLoader|DiffusionModel/i.test(type)) {
            const name = inputs.ckpt_name || inputs.unet_name || inputs.model_name;
            if (typeof name === 'string' && name.trim()) models.push(name.trim());
        }
        if (/LoraLoader/i.test(type) && typeof inputs.lora_name === 'string' && inputs.lora_name.trim()) {
            const strength = formatStrength(inputs.strength_model);
            loras.push(strength ? inputs.lora_name.trim() + ':' + strength : inputs.lora_name.trim());
        }
    });

    let positive = [];
    let negative = [];
    let seed = '';
    samplers.forEach((sampler) => {
        const inputs = sampler.inputs || {};
        if (!positive.length && inputs.positive != null) positive = collectClipText(graph, linkId(inputs.positive), new Set());
        if (!negative.length && inputs.negative != null) negative = collectClipText(graph, linkId(inputs.negative), new Set());
        if (!seed) seed = readSamplerSeed(graph, sampler);
    });

    return sanitizeGenMeta({
        prompt: positive.join('\n'),
        negativePrompt: negative.join('\n'),
        model: models.filter((name, index) => models.indexOf(name) === index).join(', '),
        seed: seed,
        loras: loras,
        tool: 'ComfyUI',
    });
}

export function parseA1111Parameters(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const source = text.replace(/\r\n/g, '\n');
    let positive = source.trim();
    let negative = '';
    let settings = '';
    const negMatch = source.match(/\nNegative prompt:\s*/i);
    if (negMatch) {
        positive = source.slice(0, negMatch.index).trim();
        const rest = source.slice(negMatch.index + negMatch[0].length);
        const stepsAt = rest.search(/(?:^|\n)Steps:\s*/i);
        if (stepsAt >= 0) {
            negative = rest.slice(0, stepsAt).trim();
            settings = rest.slice(stepsAt).replace(/^\n/, '');
        } else {
            negative = rest.trim();
        }
    } else {
        const lines = source.split('\n');
        const stepsIndex = lines.findIndex((line) => /^Steps:\s*/i.test(line.trim()));
        if (stepsIndex >= 0) {
            positive = lines.slice(0, stepsIndex).join('\n').trim();
            settings = lines.slice(stepsIndex).join('\n');
        }
    }

    const seedMatch = settings.match(/(?:^|,)\s*Seed:\s*([^,\n]+)/i);
    const modelMatch = settings.match(/(?:^|,)\s*Model:\s*([^,\n]+)/i);
    const loras = [];
    const tag = /<lora:([^:>]+):([^>]+)>/gi;
    const haystack = positive + '\n' + negative;
    let match;
    while ((match = tag.exec(haystack))) {
        const name = match[1].trim();
        const weight = match[2].trim();
        if (name) loras.push(weight ? name + ':' + weight : name);
    }
    if (!loras.length) {
        const hashes = settings.match(/Lora hashes:\s*"([^"]*)"/i);
        if (hashes && hashes[1]) {
            hashes[1].split(',').forEach((part) => {
                const name = part.split(':')[0].trim().replace(/^"|"$/g, '');
                if (name) loras.push(name);
            });
        }
    }

    return sanitizeGenMeta({
        prompt: positive,
        negativePrompt: negative,
        model: modelMatch ? modelMatch[1].trim() : '',
        seed: seedMatch ? seedMatch[1].trim() : '',
        loras: loras,
        tool: 'A1111',
    });
}

function hasPngSignature(bytes) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!bytes || bytes.length < 8) return false;
    for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return false;
    return true;
}

export async function readGenMetaFromBuffer(buffer) {
    try {
        const bytes = buffer instanceof Uint8Array
            ? buffer
            : buffer instanceof ArrayBuffer
                ? new Uint8Array(buffer)
                : null;
        if (!hasPngSignature(bytes)) return null;

        let promptText = null;
        let parametersText = null;
        let dateText = '';
        let offset = 8;
        while (offset + 12 <= bytes.length) {
            const length = readU32(bytes, offset);
            if (offset + 12 + length > bytes.length) break;
            const type = ascii(bytes, offset + 4, 4);
            const data = bytes.subarray(offset + 8, offset + 8 + length);
            offset += 12 + length;
            if (type === 'IEND') break;
            if (type === 'tIME' && !dateText) dateText = formatPngTime(data);
            if (type !== 'tEXt' && type !== 'iTXt' && type !== 'zTXt') continue;
            const parsed = await readTextChunk(type, data);
            if (!parsed || !parsed.keyword) continue;
            const key = parsed.keyword.trim();
            if (!key || key.toLowerCase() === 'workflow') continue;
            if (key === 'prompt' && promptText == null) promptText = parsed.text;
            else if (key === 'parameters' && parametersText == null) parametersText = parsed.text;
            else if (!dateText && /^(Creation Time|date:create|Date|datetime)$/i.test(key)) dateText = parsed.text || '';
        }

        let meta = null;
        if (promptText) meta = extractComfyGenMeta(promptText);
        if (!meta && parametersText) meta = parseA1111Parameters(parametersText);
        if (!meta) return null;
        if (dateText && !meta.date) {
            const withDate = sanitizeGenMeta({ ...meta, date: dateText });
            return withDate;
        }
        return meta;
    } catch (err) {
        return null;
    }
}

const GenMetaApi = {
    GEN_META_LIMITS,
    sanitizeGenMeta,
    stripGenMeta,
    itemMatchesGenQuery,
    extractComfyGenMeta,
    parseA1111Parameters,
    readGenMetaFromBuffer,
};

if (typeof window !== 'undefined') window.GenMeta = GenMetaApi;
