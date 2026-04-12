// ============================================================
// UTILS - Fonctions utilitaires
// ============================================================

export function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const c = Math.floor((ms % 1000) / 10);
    return `${m}:${s.toString().padStart(2, '0')}.${c.toString().padStart(2, '0')}`;
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function distance(x1, z1, x2, z2) {
    return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
}

export function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

// Objet réutilisé pour pointToSegment (évite GC pressure)
const _ptSegResult = { dist: 0, cx: 0, cz: 0 };

export function pointToSegment(px, pz, x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const lenSq = dx * dx + dz * dz;

    if (lenSq < 0.0001) {
        _ptSegResult.dist = Math.sqrt((px - x1) * (px - x1) + (pz - z1) * (pz - z1));
        _ptSegResult.cx = x1;
        _ptSegResult.cz = z1;
        return _ptSegResult;
    }

    let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = x1 + t * dx;
    const cz = z1 + t * dz;

    _ptSegResult.dist = Math.sqrt((px - cx) * (px - cx) + (pz - cz) * (pz - cz));
    _ptSegResult.cx = cx;
    _ptSegResult.cz = cz;
    return _ptSegResult;
}
