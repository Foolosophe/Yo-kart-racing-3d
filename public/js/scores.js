// ============================================================
// SCORES - Gestion des meilleurs scores et médailles
// ============================================================

const STORAGE_KEY = 'pillsStadium_scores';
const GHOST_STORAGE_KEY = 'pillsStadium_ghosts';
const HISTORY_KEY = 'pillsStadium_history';
const GLOBAL_STATS_KEY = 'pillsStadium_globalStats';
const MAX_HISTORY = 50;

// ============================================================
// SYSTÈME DE MÉDAILLES - Temps calculés automatiquement
// ============================================================

// Temps de base par tour (en secondes) pour un joueur "or"
const BASE_LAP_TIMES = {
    oval: 28,      // ~28s par tour sur l'ovale
    infini: 72,    // ~72s par tour sur l'infini (plus long)
    volcan: 140    // ~140s par tour sur le volcan (2x infini, lacets + canyon)
};

/**
 * Calcule les temps cibles pour les médailles
 * @param {string} trackType - 'oval' ou 'infini'
 * @param {number} laps - Nombre de tours
 * @returns {{ gold: number, silver: number }} Temps en millisecondes
 */
export function getMedalTimes(trackType, laps) {
    const baseLapTime = BASE_LAP_TIMES[trackType] || BASE_LAP_TIMES.oval;

    // Temps or = temps optimal (en ms)
    const goldTime = baseLapTime * laps * 1000;

    // Temps argent = +25% du temps or
    const silverTime = goldTime * 1.25;

    return { gold: goldTime, silver: silverTime };
}

/**
 * Détermine la médaille obtenue selon le temps
 * @param {number} raceTime - Temps de course en ms
 * @param {string} trackType - 'oval' ou 'infini'
 * @param {number} laps - Nombre de tours
 * @returns {'gold' | 'silver' | 'bronze' | null} La médaille ou null si pas fini
 */
export function getMedalForTime(raceTime, trackType, laps) {
    if (!raceTime || raceTime <= 0) return null;

    const { gold, silver } = getMedalTimes(trackType, laps);

    if (raceTime <= gold) return 'gold';
    if (raceTime <= silver) return 'silver';
    return 'bronze';
}

/**
 * Retourne l'emoji et le label pour une médaille
 * @param {'gold' | 'silver' | 'bronze' | null} medal
 * @returns {{ emoji: string, label: string, color: string }}
 */
export function getMedalDisplay(medal) {
    switch (medal) {
        case 'gold':
            return { emoji: '🥇', label: 'OR', color: '#FFD700' };
        case 'silver':
            return { emoji: '🥈', label: 'ARGENT', color: '#C0C0C0' };
        case 'bronze':
            return { emoji: '🥉', label: 'BRONZE', color: '#CD7F32' };
        default:
            return { emoji: '', label: '', color: '#888' };
    }
}

export class ScoreManager {
    constructor() {
        this.scores = this.load();
        this.ghosts = this.loadGhosts();
        this.history = this.loadHistory();
        this.globalStats = this.loadGlobalStats();
    }

    load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('Erreur chargement scores:', e);
        }
        // Structure par défaut
        return {
            easy: { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 },
            normal: { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 },
            hard: { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 }
        };
    }

    loadGhosts() {
        try {
            const data = localStorage.getItem(GHOST_STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('Erreur chargement ghosts:', e);
        }
        return { easy: null, normal: null, hard: null };
    }

    loadHistory() {
        try {
            const data = localStorage.getItem(HISTORY_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('Erreur chargement historique:', e);
        }
        return [];
    }

    loadGlobalStats() {
        try {
            const data = localStorage.getItem(GLOBAL_STATS_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('Erreur chargement stats globales:', e);
        }
        return {
            totalRaces: 0,
            totalWins: 0,
            totalPlayTime: 0,
            totalItemsPicked: 0,
            totalItemsUsed: 0,
            totalHitsGiven: 0,
            totalHitsReceived: 0,
            totalOvertakes: 0,
            bestWinStreak: 0,
            currentWinStreak: 0
        };
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.scores));
        } catch (e) {
            console.warn('Erreur sauvegarde scores:', e);
        }
    }

    saveGhosts() {
        try {
            localStorage.setItem(GHOST_STORAGE_KEY, JSON.stringify(this.ghosts));
        } catch (e) {
            console.warn('Erreur sauvegarde ghosts:', e);
        }
    }

    saveHistory() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
        } catch (e) {
            console.warn('Erreur sauvegarde historique:', e);
        }
    }

    saveGlobalStats() {
        try {
            localStorage.setItem(GLOBAL_STATS_KEY, JSON.stringify(this.globalStats));
        } catch (e) {
            console.warn('Erreur sauvegarde stats globales:', e);
        }
    }

    // Enregistre le résultat d'une course
    recordRace(difficulty, raceTime, bestLapTime, isWin, ghostData = null, track = 'oval', laps = 3, raceData = null) {
        const diff = this.scores[difficulty];
        if (!diff) return { newBestRace: false, newBestLap: false, medal: null, newMedal: false };

        diff.races++;
        if (isWin) diff.wins++;

        let newBestRace = false;
        let newBestLap = false;

        // Utiliser la médaille fournie (déjà cappée) ou calculer
        const medal = raceData?.medal ?? getMedalForTime(raceTime, track, laps);

        // Clé pour stocker les records par circuit
        const trackKey = `${track}_${laps}`;
        if (!diff.trackRecords) diff.trackRecords = {};
        if (!diff.trackRecords[trackKey]) {
            diff.trackRecords[trackKey] = { bestTime: null, bestLap: null, medal: null, top5: [] };
        }

        const trackRecord = diff.trackRecords[trackKey];

        // Retrocompatibilite : ajouter top5 si absent
        if (!trackRecord.top5) trackRecord.top5 = [];

        // Meilleur temps de course (seulement si victoire)
        if (isWin && raceTime && (!diff.bestRaceTime || raceTime < diff.bestRaceTime)) {
            diff.bestRaceTime = raceTime;
            newBestRace = true;
        }

        // Record spécifique au circuit (même en cas de défaite)
        let newTrackRecord = false;
        if (raceTime && (!trackRecord.bestTime || raceTime < trackRecord.bestTime)) {
            trackRecord.bestTime = raceTime;
            trackRecord.recordHolder = raceData?.playerName || 'Joueur';
            newTrackRecord = true;
        }

        // Top 5 : ajouter si victoire
        if (isWin && raceTime) {
            trackRecord.top5.push({
                time: raceTime,
                date: Date.now(),
                medal: medal,
                lapTimes: raceData?.lapTimes || []
            });
            trackRecord.top5.sort((a, b) => a.time - b.time);
            if (trackRecord.top5.length > 5) {
                trackRecord.top5 = trackRecord.top5.slice(0, 5);
            }
        }

        // Meilleure médaille pour ce circuit
        let newMedal = false;
        const medalRank = { gold: 3, silver: 2, bronze: 1 };
        const currentMedalRank = medalRank[trackRecord.medal] || 0;
        const newMedalRank = medalRank[medal] || 0;
        if (newMedalRank > currentMedalRank) {
            trackRecord.medal = medal;
            newMedal = true;
        }

        // Clé combinée circuit + difficulté + tours pour le fantôme
        const ghostKey = `${track}_${difficulty}_${laps}`;

        // Sauvegarder le fantôme à chaque nouveau record (victoire ou défaite)
        if (ghostData && ghostData.length > 0) {
            if (!this.ghosts[ghostKey] || newTrackRecord) {
                this.ghosts[ghostKey] = ghostData;
                this.saveGhosts();
                console.log(`[GHOST] Sauvegardé! clé=${ghostKey}, frames=${ghostData.length}`);
            }
        }

        // Meilleur temps de tour (ignorer les valeurs invalides)
        if (bestLapTime && bestLapTime > 0 && bestLapTime < 3600000 && (!diff.bestLapTime || bestLapTime < diff.bestLapTime)) {
            diff.bestLapTime = bestLapTime;
            newBestLap = true;
        }

        // Record tour pour ce circuit (ignorer les valeurs invalides)
        if (bestLapTime && bestLapTime > 0 && bestLapTime < 3600000 && (!trackRecord.bestLap || bestLapTime < trackRecord.bestLap)) {
            trackRecord.bestLap = bestLapTime;
            trackRecord.bestLapHolder = raceData?.playerName || 'Joueur';
        }

        this.save();

        // Historique et stats globales
        if (raceData) {
            this.addToHistory({
                date: Date.now(),
                track,
                difficulty,
                laps,
                playerName: raceData.playerName || 'Joueur',
                aiName: raceData.aiName || 'Claudius',
                raceTime,
                bestLapTime,
                lapTimes: raceData.lapTimes || [],
                position: isWin ? 1 : 2,
                medal,
                forfeited: raceData.forfeited || false,
                stats: {
                    bestDriftTime: raceData.stats?.bestDriftTime || 0,
                    bestCombo: raceData.stats?.bestCombo || 0,
                    itemsPicked: raceData.stats?.itemsPicked || 0,
                    itemsUsed: raceData.stats?.itemsUsed || 0,
                    hitsGiven: raceData.stats?.hitsGiven || 0,
                    hitsReceived: raceData.stats?.hitsReceived || 0,
                    leadTimePercent: raceData.stats?.totalRaceTime > 0
                        ? Math.round((raceData.stats.leadTime / raceData.stats.totalRaceTime) * 100)
                        : 0,
                    overtakeCount: raceData.stats?.overtakes?.length || 0
                }
            });

            this.updateGlobalStats(isWin, raceTime, raceData.stats);
        }

        return { newBestRace, newBestLap, medal, newMedal, newTrackRecord };
    }

    addToHistory(entry) {
        this.history.unshift(entry);
        if (this.history.length > MAX_HISTORY) {
            this.history = this.history.slice(0, MAX_HISTORY);
        }
        this.saveHistory();
    }

    updateGlobalStats(isWin, raceTime, stats) {
        const g = this.globalStats;
        g.totalRaces++;
        if (isWin) {
            g.totalWins++;
            g.currentWinStreak++;
            if (g.currentWinStreak > g.bestWinStreak) {
                g.bestWinStreak = g.currentWinStreak;
            }
        } else {
            g.currentWinStreak = 0;
        }
        g.totalPlayTime += raceTime || 0;
        g.totalItemsPicked += stats?.itemsPicked || 0;
        g.totalItemsUsed += stats?.itemsUsed || 0;
        g.totalHitsGiven += stats?.hitsGiven || 0;
        g.totalHitsReceived += stats?.hitsReceived || 0;
        g.totalOvertakes += stats?.overtakes?.length || 0;
        this.saveGlobalStats();
    }

    // Récupère les records pour un circuit spécifique
    getTrackRecord(difficulty, track, laps = 3) {
        const diff = this.scores[difficulty];
        if (!diff || !diff.trackRecords) return { bestTime: null, bestLap: null, medal: null };

        const trackKey = `${track}_${laps}`;
        return diff.trackRecords[trackKey] || { bestTime: null, bestLap: null, medal: null };
    }

    // Récupère le top 5 pour un circuit
    getTop5(difficulty, track, laps = 3) {
        const record = this.getTrackRecord(difficulty, track, laps);
        return record.top5 || [];
    }

    // Récupère le fantôme pour un circuit, difficulté et nombre de tours
    getGhost(difficulty, track = 'oval', laps = 3) {
        const ghostKey = `${track}_${difficulty}_${laps}`;
        // Fallback vers l'ancienne clé (sans tours) pour compatibilité
        return this.ghosts[ghostKey] || this.ghosts[`${track}_${difficulty}`] || null;
    }

    // Récupère les scores pour une difficulté
    getScores(difficulty) {
        return this.scores[difficulty] || { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 };
    }

    // Récupère tous les scores
    getAllScores() {
        return this.scores;
    }

    // Récupère l'historique (optionnel : filtré)
    getHistory(filters = null) {
        if (!filters) return this.history;
        return this.history.filter(entry => {
            if (filters.track && entry.track !== filters.track) return false;
            if (filters.difficulty && entry.difficulty !== filters.difficulty) return false;
            return true;
        });
    }

    // Récupère les stats globales
    getGlobalStats() {
        return this.globalStats;
    }

    // Remet à zéro tous les scores
    reset() {
        this.scores = {
            easy: { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 },
            normal: { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 },
            hard: { bestRaceTime: null, bestLapTime: null, wins: 0, races: 0 }
        };
        this.ghosts = { easy: null, normal: null, hard: null };
        this.history = [];
        this.globalStats = {
            totalRaces: 0, totalWins: 0, totalPlayTime: 0,
            totalItemsPicked: 0, totalItemsUsed: 0,
            totalHitsGiven: 0, totalHitsReceived: 0,
            totalOvertakes: 0, bestWinStreak: 0, currentWinStreak: 0
        };
        this.save();
        this.saveGhosts();
        this.saveHistory();
        this.saveGlobalStats();
    }
}
