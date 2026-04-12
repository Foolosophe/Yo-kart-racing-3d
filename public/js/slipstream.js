// ============================================================
// SLIPSTREAM - Système d'aspiration
// ============================================================

import { CONFIG } from './config.js';

export class Slipstream {
    constructor() {
        this.charge = 0;
        this.active = false;
        this.bonusApplied = false; // Pour éviter d'appliquer le bonus en continu
    }

    reset() {
        this.charge = 0;
        this.active = false;
        this.bonusApplied = false;
    }

    update(dt, follower, leader, showNotification) {
        const dtFactor = Math.min(dt, 0.05) * 60;

        // Vecteur du follower vers le leader
        const dx = leader.x - follower.x;
        const dz = leader.z - follower.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 5 || dist > 25) {
            // Trop proche ou trop loin
            this.charge = Math.max(0, this.charge - dtFactor * 2);
            this.active = false;
            this.bonusApplied = false;
            return;
        }

        // Direction vers le leader
        const dirX = dx / dist;
        const dirZ = dz / dist;

        // Direction du follower
        const lookX = Math.sin(follower.angle);
        const lookZ = Math.cos(follower.angle);

        // Alignement
        const dot = dirX * lookX + dirZ * lookZ;

        // Vérifier que le leader est devant
        const leaderLookX = Math.sin(leader.angle);
        const leaderLookZ = Math.cos(leader.angle);
        const behindDot = dirX * leaderLookX + dirZ * leaderLookZ;

        if (dot > 0.85 && behindDot > 0.5) {
            // Dans le sillage !
            this.charge = Math.min(100, this.charge + dtFactor * 1.5);

            if (this.charge >= 100 && !this.active) {
                this.active = true;
                if (showNotification) showNotification('ASPIRATION!');
            }
        } else {
            this.charge = Math.max(0, this.charge - dtFactor * 3);
            this.active = false;
            this.bonusApplied = false;
        }

        // Appliquer le bonus UNE SEULE FOIS quand l'aspiration est activée
        if (this.active && !this.bonusApplied) {
            follower.speed = Math.min(follower.speed + 0.5, CONFIG.physics.maxSpeed * 1.15);
            follower.boostTime = Math.max(follower.boostTime, 50);
            follower.boostPower = Math.max(follower.boostPower, 1.2);
            this.bonusApplied = true;
        }
    }
}
