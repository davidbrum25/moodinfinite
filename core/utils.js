/**
 * Utility Functions
 * Pure math and color helpers used across the application.
 */

export function hexToRgba(e, t) { 
    let o = 0, a = 0, i = 0; 
    if (e.length == 4) { 
        o = "0x" + e[1] + e[1]; 
        a = "0x" + e[2] + e[2]; 
        i = "0x" + e[3] + e[3] 
    } else if (e.length == 7) { 
        o = "0x" + e[1] + e[2]; 
        a = "0x" + e[3] + e[4]; 
        i = "0x" + e[5] + e[6] 
    } 
    return `rgba(${+o},${+a},${+i},${t})`;
}

export function rgbToHex(e, t, o) { 
    return "#" + ((1 << 24) + (e << 16) + (t << 8) + o).toString(16).slice(1);
}

export function hslToHex(h, s, l) {
    l /= 100; const a = s * Math.min(l, 1 - l) / 100;
    const f = n => { const k = (n + h / 30) % 12; const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * color).toString(16).padStart(2, '0'); };
    return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '';
}

export function padZero(e, t) { 
    t = t || 2; 
    const o = (new Array(t + 1)).join('0'); 
    return (o + e).slice(-t);
}

export function invertColor(e) { 
    if (e.indexOf('#') === 0) e = e.slice(1); 
    if (e.length === 3) e = e[0] + e[0] + e[1] + e[1] + e[2] + e[2]; 
    if (e.length !== 6) return '#ffffff'; 
    const t = (255 - parseInt(e.slice(0, 2), 16)).toString(16), 
          o = (255 - parseInt(e.slice(2, 4), 16)).toString(16), 
          a = (255 - parseInt(e.slice(4, 6), 16)).toString(16); 
    return '#' + padZero(t) + padZero(o) + padZero(a);
}

export function distSq(e, t) { 
    return Math.pow(e.x - t.x, 2) + Math.pow(e.y - t.y, 2);
}

export function distToSegmentSquared(p, v, w) { 
    const l2 = distSq(v, w); 
    if (l2 === 0) return distSq(p, v); 
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2; 
    t = Math.max(0, Math.min(1, t)); 
    return distSq(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export const GENERIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`;
