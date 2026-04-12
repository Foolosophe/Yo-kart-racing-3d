// ============================================================
// PHYSICS - Système de physique et collisions
// ============================================================

import { CONFIG } from './config.js';
import { pointToSegment } from './utils.js';

export class Physics {
    constructor(track) {
        this.track = track;
        this._wallGrid = null;
        this._wallGridSize = 40; // Taille de cellule en unités (assez large pour couvrir un mur)
    }

    // Hash numérique pour la grille (évite les string allocations)
    _cellKey(cx, cz) {
        return (cx + 500) * 10000 + (cz + 500); // Supporte des coordonnées de -500 à +500 cellules
    }

    // Construire une grille spatiale pour les murs (appelé une fois après génération du circuit)
    buildWallGrid() {
        const cellSize = this._wallGridSize;
        this._wallGrid = new Map();

        for (const seg of this.track.wallSegments) {
            const minX = Math.min(seg.x1, seg.x2);
            const maxX = Math.max(seg.x1, seg.x2);
            const minZ = Math.min(seg.z1, seg.z2);
            const maxZ = Math.max(seg.z1, seg.z2);

            const cellMinX = Math.floor(minX / cellSize);
            const cellMaxX = Math.floor(maxX / cellSize);
            const cellMinZ = Math.floor(minZ / cellSize);
            const cellMaxZ = Math.floor(maxZ / cellSize);

            for (let cx = cellMinX; cx <= cellMaxX; cx++) {
                for (let cz = cellMinZ; cz <= cellMaxZ; cz++) {
                    const key = this._cellKey(cx, cz);
                    if (!this._wallGrid.has(key)) {
                        this._wallGrid.set(key, []);
                    }
                    this._wallGrid.get(key).push(seg);
                }
            }
        }
        console.log('Wall grid built: ' + this._wallGrid.size + ' cells for ' + this.track.wallSegments.length + ' wall segments');
    }

    // =========================================================
    // COLLISION MURS - Optimisé avec grille spatiale
    // =========================================================
    checkWallCollision(x, z, radius, playerY = null) {
        // Construire la grille au premier appel (lazy init)
        if (!this._wallGrid) {
            this.buildWallGrid();
        }

        const cellSize = this._wallGridSize;
        const cx = Math.floor(x / cellSize);
        const cz = Math.floor(z / cellSize);

        // Chercher dans la cellule courante + les 8 voisines
        let closestDist = Infinity;
        // Stocker les valeurs du meilleur résultat (pas la référence — objet réutilisé)
        let bestCx = 0, bestCz = 0, bestDist = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = this._cellKey(cx + dx, cz + dz);
                const segments = this._wallGrid.get(key);
                if (!segments) continue;

                for (let i = 0; i < segments.length; i++) {
                    const seg = segments[i];
                    // Filtrer par proximité d'élévation au lieu de layer binaire
                    // Accepte les murs à ±10 unités du joueur en Y
                    if (playerY !== null && seg.elevation !== undefined) {
                        const yDiff = Math.abs(playerY - seg.elevation);
                        if (yDiff > 10) continue;
                    }

                    const r = pointToSegment(x, z, seg.x1, seg.z1, seg.x2, seg.z2);
                    if (r.dist < radius && r.dist > 0.01 && r.dist < closestDist) {
                        closestDist = r.dist;
                        bestCx = r.cx;
                        bestCz = r.cz;
                        bestDist = r.dist;
                    }
                }
            }
        }

        // Réutiliser l'objet résultat (évite GC)
        if (!this._wallResult) this._wallResult = { hit: false, x: 0, z: 0 };
        const result = this._wallResult;

        if (bestDist < Infinity) {
            // Calculer la direction pour pousser le kart hors du mur
            const normalX = (x - bestCx) / bestDist;
            const normalZ = (z - bestCz) / bestDist;

            // Pousser le kart juste assez pour sortir du mur
            const overlap = radius - bestDist + 0.5;
            result.hit = true;
            result.x = x + normalX * overlap;
            result.z = z + normalZ * overlap;
        } else {
            result.hit = false;
            result.x = x;
            result.z = z;
        }

        return result;
    }
    
    // Collision entre deux karts quelconques
    checkKartPairCollision(kartA, kartB) {
        // Ne pas collisionner si les karts sont sur des couches différentes
        if (kartA.currentLayer !== undefined && kartB.currentLayer !== undefined) {
            if (kartA.currentLayer !== kartB.currentLayer) {
                return false;
            }
        }

        const radius = CONFIG.physics.kartRadius * 2;
        const dx = kartA.x - kartB.x;
        const dz = kartA.z - kartB.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < radius && dist > 0.1) {
            const overlap = radius - dist;
            const nx = dx / dist;
            const nz = dz / dist;

            // Le kart le plus rapide pousse l'autre davantage (style Mario Kart)
            const speedA = Math.abs(kartA.speed);
            const speedB = Math.abs(kartB.speed);
            const totalSpeed = speedA + speedB || 1;
            const ratioA = speedA / totalSpeed;
            const ratioB = speedB / totalSpeed;
            const pushForce = overlap * 0.7;

            kartA.x += nx * pushForce * ratioB * 0.5;
            kartA.z += nz * pushForce * ratioB * 0.5;
            kartB.x -= nx * pushForce * ratioA;
            kartB.z -= nz * pushForce * ratioA;

            kartA.speed *= (0.92 + ratioA * 0.06);
            kartB.speed *= (0.92 + ratioB * 0.06);

            return true;
        }

        return false;
    }

    // Collision entre tous les karts (N-way)
    checkAllKartCollisions(racers) {
        const collisions = [];
        for (let i = 0; i < racers.length; i++) {
            for (let j = i + 1; j < racers.length; j++) {
                if (this.checkKartPairCollision(racers[i], racers[j])) {
                    collisions.push([i, j]);
                }
            }
        }
        return collisions;
    }

    // Wrapper retrocompatible
    checkKartCollision(player, ai) {
        return this.checkKartPairCollision(player, ai);
    }
    
    getDistanceToNextCheckpoint(racer, checkpointZones) {
        // Protection contre index hors limites
        if (!checkpointZones || racer.currentCheckpoint >= checkpointZones.length) return 0;

        const cp = checkpointZones[racer.currentCheckpoint];
        if (!cp) return 0;

        const dist = Math.sqrt((racer.x - cp.x) ** 2 + (racer.z - cp.z) ** 2);
        return 100 - Math.min(dist, 100);
    }
}
