// leaderboard.js — Communication avec l'API leaderboard

const API_BASE = '/api/leaderboard';

function detectCountry() {
    try {
        const lang = navigator.language || navigator.userLanguage || '';
        const parts = lang.split('-');
        if (parts.length >= 2) return parts[1].toUpperCase();
        // Fallback: timezone-based guess
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const tzCountry = {
            'Europe/Paris': 'FR', 'Europe/London': 'GB', 'America/New_York': 'US',
            'America/Los_Angeles': 'US', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES',
            'Europe/Rome': 'IT', 'Asia/Tokyo': 'JP', 'Europe/Brussels': 'BE',
            'America/Toronto': 'CA', 'Europe/Zurich': 'CH', 'Australia/Sydney': 'AU'
        };
        return tzCountry[tz] || '';
    } catch (e) {
        return '';
    }
}

export async function submitScore({ track, laps, difficulty, playerName, raceTime, bestLapTime, isAI = false }) {
    try {
        const country = isAI ? '' : detectCountry();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track, laps, difficulty, playerName, raceTime, bestLapTime, isAI, country }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('[LEADERBOARD] Erreur soumission:', e.message);
        return null;
    }
}

export async function fetchLeaderboard(track, laps, difficulty) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`${API_BASE}/${track}/${laps}/${difficulty}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) return [];
        const data = await res.json();
        return data.entries || [];
    } catch (e) {
        console.warn('[LEADERBOARD] Erreur chargement:', e.message);
        return [];
    }
}
