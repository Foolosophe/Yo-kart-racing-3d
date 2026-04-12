const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Leaderboard Storage ---
const DATA_DIR = path.join(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

// Créer le dossier data s'il n'existe pas
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[LEADERBOARD] Erreur lecture:', e.message);
    }
    return {};
}

function saveLeaderboard(data) {
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[LEADERBOARD] Erreur écriture:', e.message);
    }
}

// Validation basique anti-triche (temps minimum réaliste par tour en ms)
const MIN_LAP_TIMES = { oval: 8000, infini: 12000, volcan: 10000 };

function isValidScore(track, laps, raceTime, bestLapTime) {
    const minLap = MIN_LAP_TIMES[track] || 8000;
    if (raceTime < minLap * laps) return false; // Temps total trop rapide
    if (bestLapTime && bestLapTime < minLap) return false; // Tour trop rapide
    if (raceTime > 1200000) return false; // Plus de 20 minutes
    return true;
}

// --- Middleware ---
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// GET leaderboard pour un circuit/tours/difficulté
app.get('/api/leaderboard/:track/:laps/:difficulty', (req, res) => {
    const { track, laps, difficulty } = req.params;
    const key = `${track}_${laps}_${difficulty}`;

    const leaderboard = loadLeaderboard();
    const entries = leaderboard[key] || [];

    res.json({ entries: entries.slice(0, 10) });
});

// POST un nouveau score
app.post('/api/leaderboard', (req, res) => {
    const { track, laps, difficulty, playerName, raceTime, bestLapTime, isAI, country } = req.body;

    // Validation des champs
    if (!track || !laps || !difficulty || !raceTime) {
        console.log('[LEADERBOARD] 400 Champs manquants:', JSON.stringify({ track, laps, difficulty, raceTime: typeof raceTime }));
        return res.status(400).json({ error: 'Champs manquants' });
    }

    if (!['oval', 'infini', 'volcan'].includes(track)) {
        return res.status(400).json({ error: 'Circuit invalide' });
    }
    if (!['easy', 'normal', 'hard'].includes(difficulty)) {
        return res.status(400).json({ error: 'Difficulté invalide' });
    }
    if (typeof raceTime !== 'number' || raceTime <= 0) {
        return res.status(400).json({ error: 'Temps invalide' });
    }

    // Validation anti-triche
    if (!isValidScore(track, parseInt(laps), raceTime, bestLapTime)) {
        console.log('[LEADERBOARD] 400 Temps suspect:', JSON.stringify({ track, laps, raceTime, bestLapTime }));
        return res.status(400).json({ error: 'Temps suspect' });
    }

    // Nettoyer le nom (max 12 chars, pas de HTML)
    const name = String(playerName || 'Joueur').replace(/<[^>]*>/g, '').trim().slice(0, 12) || 'Joueur';

    const key = `${track}_${laps}_${difficulty}`;
    const leaderboard = loadLeaderboard();

    if (!leaderboard[key]) {
        leaderboard[key] = [];
    }

    // Nettoyer le code pays (2 lettres max)
    const cc = String(country || '').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 2);

    const entry = {
        name,
        raceTime: Math.round(raceTime),
        bestLapTime: bestLapTime ? Math.round(bestLapTime) : null,
        isAI: !!isAI,
        country: cc || '',
        date: Date.now()
    };

    leaderboard[key].push(entry);

    // Trier par temps et garder le top 10
    leaderboard[key].sort((a, b) => a.raceTime - b.raceTime);
    leaderboard[key] = leaderboard[key].slice(0, 10);

    saveLeaderboard(leaderboard);

    // Retourner la position du joueur (-1 si pas dans le top 10)
    const rank = leaderboard[key].findIndex(e => e.date === entry.date && e.name === entry.name);

    console.log(`[LEADERBOARD] ${isAI ? 'AI' : name} | ${track}_${laps}_${difficulty} | ${(raceTime / 1000).toFixed(2)}s | rank: ${rank + 1}`);

    res.json({
        rank: rank >= 0 ? rank + 1 : -1,
        entries: leaderboard[key].slice(0, 10)
    });
});

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║       🏎️  PILLS STADIUM               ║
    ╠═══════════════════════════════════════╣
    ║  Serveur démarré !                    ║
    ║  http://localhost:${PORT}                 ║
    ╚═══════════════════════════════════════╝
    `);
});
