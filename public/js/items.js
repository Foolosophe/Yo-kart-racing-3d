// ============================================================
// ITEMS - Système d'objets (style Mario Kart)
// ============================================================

import { CONFIG } from './config.js';

// Types d'items disponibles
export const ITEM_TYPES = {
    NONE: 'none',
    PILL_BOOST: 'pill_boost',      // Boost de vitesse (comme champignon)
    BALL: 'ball',                   // Projectile rebondissant (comme carapace verte)
    HOMING_BALL: 'homing_ball',     // Projectile guidé (comme carapace rouge)
    SLIME: 'slime',                 // Obstacle au sol (comme banane)
    SHIELD: 'shield',               // Protection temporaire (comme étoile)
    EMP: 'emp'                      // Ralentit tous les adversaires (comme éclair)
};

// Configuration des items
export const ITEM_CONFIG = {
    [ITEM_TYPES.PILL_BOOST]: {
        name: 'Pilule Boost',
        color: 0x00ff88,
        duration: 0,            // Effet instantané
        boostPower: 1.5,
        boostDuration: 75       // Frames de boost (~1.25s)
    },
    [ITEM_TYPES.BALL]: {
        name: 'Balle',
        color: 0xff4444,
        speed: 3.5,
        bounces: 5,             // Nombre de rebonds avant disparition
        lifetime: 300,          // Frames max
        hitRadius: 3
    },
    [ITEM_TYPES.HOMING_BALL]: {
        name: 'Missile Guidé',
        color: 0xff0000,
        speed: 2.8,
        turnSpeed: 0.08,
        lifetime: 400,
        hitRadius: 3
    },
    [ITEM_TYPES.SLIME]: {
        name: 'Flaque de Slime',
        color: 0x44ff44,
        lifetime: 1800,         // 30 secondes à 60fps - reste longtemps sur la piste
        hitRadius: 4,
        slowdownFactor: 0.3,    // Réduction de vitesse
        slowdownDuration: 60    // Frames de ralentissement
    },
    [ITEM_TYPES.SHIELD]: {
        name: 'Étoile',
        color: 0xffff00,
        duration: 360,          // ~6 secondes
        boostPower: 1.3         // +30% vitesse pendant l'étoile
    },
    [ITEM_TYPES.EMP]: {
        name: 'EMP',
        color: 0x8844ff,
        slowdownFactor: 0.3,
        slowdownDuration: 150
    }
};

// Probabilités selon la position (1er = moins de bons items)
const ITEM_PROBABILITIES = {
    first: [
        { type: ITEM_TYPES.SLIME, weight: 40 },
        { type: ITEM_TYPES.BALL, weight: 35 },
        { type: ITEM_TYPES.PILL_BOOST, weight: 25 }
    ],
    second: [
        { type: ITEM_TYPES.PILL_BOOST, weight: 30 },
        { type: ITEM_TYPES.HOMING_BALL, weight: 25 },
        { type: ITEM_TYPES.BALL, weight: 20 },
        { type: ITEM_TYPES.SLIME, weight: 15 },
        { type: ITEM_TYPES.SHIELD, weight: 10 }
    ]
};

// ============================================================
// ITEM BOX - Capsule à ramasser sur la piste
// ============================================================

export class ItemBox {
    constructor(scene, x, y, z) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.z = z;
        this.active = true;
        this.respawnTime = 0;
        this.respawnDelay = 180; // Frames avant réapparition

        this.createMesh();
    }

    createMesh() {
        // Capsule rotative colorée
        const geometry = new THREE.BoxGeometry(3, 3, 3);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00aaff,
            emissive: 0x004488,
            metalness: 0.8,
            roughness: 0.2
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.y + 2, this.z);

        // Effet de brillance
        const glowGeometry = new THREE.BoxGeometry(3.5, 3.5, 3.5);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00aaff,
            transparent: true,
            opacity: 0.3
        });
        this.glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.mesh.add(this.glow);

        this.scene.add(this.mesh);
    }

    update(dt) {
        if (this.active) {
            // Rotation et flottement
            this.mesh.rotation.y += 0.03;
            this.mesh.rotation.x += 0.01;
            this.mesh.position.y = this.y + 2 + Math.sin(Date.now() * 0.003) * 0.5;
            this.mesh.visible = true;
        } else {
            // En attente de respawn
            this.respawnTime++;
            this.mesh.visible = false;

            if (this.respawnTime >= this.respawnDelay) {
                this.active = true;
                this.respawnTime = 0;
            }
        }
    }

    collect() {
        if (!this.active) return false;
        this.active = false;
        this.respawnTime = 0;
        return true;
    }

    checkCollision(x, y, z, radius = 3) {
        if (!this.active) return false;

        const dx = x - this.x;
        const dy = y - this.y;
        const dz = z - this.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        return dist < radius + 2;
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}

// ============================================================
// PROJECTILE - Balle lancée
// ============================================================

export class Projectile {
    constructor(scene, x, y, z, angle, type, owner) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.z = z;
        this.angle = angle;
        this.type = type;
        this.owner = owner; // 'player' ou 'ai'
        this.config = ITEM_CONFIG[type];
        this.active = true;
        this.lifetime = this.config.lifetime;
        this.bounces = this.config.bounces || 0;
        this.target = null; // Pour homing

        this.createMesh();
    }

    createMesh() {
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.config.color,
            emissive: this.config.color,
            emissiveIntensity: 0.5
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.y + 1, this.z);
        this.scene.add(this.mesh);
    }

    update(dt, track, targetKart = null) {
        if (!this.active) return;

        this.lifetime--;
        if (this.lifetime <= 0) {
            this.destroy();
            return;
        }

        const speed = this.config.speed;

        // Homing: tourner vers la cible
        if (this.type === ITEM_TYPES.HOMING_BALL && targetKart) {
            const dx = targetKart.x - this.x;
            const dz = targetKart.z - this.z;
            const targetAngle = Math.atan2(dx, dz);

            let angleDiff = targetAngle - this.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            this.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.config.turnSpeed);
        }

        // Mouvement
        const newX = this.x + Math.sin(this.angle) * speed;
        const newZ = this.z + Math.cos(this.angle) * speed;

        // Rebond sur les murs (pour balle simple)
        if (this.type === ITEM_TYPES.BALL && track) {
            const collision = this.checkWallCollision(newX, newZ, track);
            if (collision.hit) {
                this.bounces--;
                if (this.bounces <= 0) {
                    this.destroy();
                    return;
                }
                // Réflexion
                this.angle = collision.newAngle;
            }
        }

        this.x = newX;
        this.z = newZ;

        // Suivre le terrain (passer this.y pour rester sur le bon niveau au croisement)
        if (track && track.is3DReliefEnabled && track.is3DReliefEnabled()) {
            this.y = track.get3DElevationAt(this.x, this.z, this.y, 2) || 0;
        }

        this.mesh.position.set(this.x, this.y + 1, this.z);
        this.mesh.rotation.y += 0.2;
    }

    checkWallCollision(x, z, track) {
        // Simplification: vérifier si hors piste
        if (!track.isOnTrack(x, z)) {
            // Calculer un nouvel angle (réflexion approximative)
            return { hit: true, newAngle: this.angle + Math.PI + (Math.random() - 0.5) * 0.5 };
        }
        return { hit: false };
    }

    checkHit(kart) {
        if (!this.active) return false;
        // Ne pas toucher le lanceur (utilise la reference directe)
        if (kart === this.ownerKart) return false;

        // Filtrer par élévation : ignorer si sol/pont différent (croisement figure-8)
        if (Math.abs(kart.y - this.y) > 10) return false;

        const dx = kart.x - this.x;
        const dz = kart.z - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        return dist < this.config.hitRadius + CONFIG.physics.kartRadius;
    }

    destroy() {
        this.active = false;
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
    }
}

// ============================================================
// OBSTACLE - Flaque de slime au sol
// ============================================================

export class Obstacle {
    constructor(scene, x, y, z, type, owner, ownerKart) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.z = z;
        this.type = type;
        this.owner = owner;           // 'player' ou 'ai'
        this.ownerKart = ownerKart;   // Référence au kart créateur
        this.config = ITEM_CONFIG[type];
        this.active = true;
        this.lifetime = this.config.lifetime;
        this.ignoreOwnerTime = 30;    // Frames d'immunité pour le créateur

        this.createMesh();
    }

    createMesh() {
        // Flaque plate
        const geometry = new THREE.CylinderGeometry(2.5, 3, 0.3, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.config.color,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.x, this.y + 0.15, this.z);
        this.scene.add(this.mesh);
    }

    update(dt) {
        if (!this.active) return;

        this.lifetime--;
        if (this.ignoreOwnerTime > 0) this.ignoreOwnerTime--;

        if (this.lifetime <= 0) {
            this.destroy();
            return;
        }

        // Clignotement avant disparition
        if (this.lifetime < 60) {
            this.mesh.visible = Math.floor(this.lifetime / 5) % 2 === 0;
        }
    }

    checkHit(kart) {
        if (!this.active) return false;

        // Ignorer le créateur pendant le délai d'immunité
        if (this.ignoreOwnerTime > 0 && kart === this.ownerKart) return false;

        // Filtrer par élévation : ignorer si sol/pont différent (croisement figure-8)
        if (Math.abs(kart.y - this.y) > 10) return false;

        const dx = kart.x - this.x;
        const dz = kart.z - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        return dist < this.config.hitRadius + CONFIG.physics.kartRadius;
    }

    destroy() {
        this.active = false;
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
    }
}

// ============================================================
// ITEM MANAGER - Gestion globale des items
// ============================================================

export class ItemManager {
    constructor(scene) {
        this.scene = scene;
        this.itemBoxes = [];
        this.projectiles = [];
        this.obstacles = [];
    }

    // Créer les boîtes d'items sur la piste
    createItemBoxes(track) {
        // Nettoyer les anciennes boîtes
        this.itemBoxes.forEach(box => box.destroy());
        this.itemBoxes = [];

        if (!track.centerPoints || track.centerPoints.length === 0) return;

        const n = track.centerPoints.length;

        // Placer des groupes de 3 boîtes alignées à intervalles réguliers
        const numGroups = 5;
        const boxesPerGroup = 3;
        const spacing = 8; // Espacement entre les boîtes

        for (let i = 0; i < numGroups; i++) {
            const idx = Math.floor((i / numGroups) * n + n * 0.1) % n; // Décalé de 10% pour éviter le départ
            const point = track.centerPoints[idx];

            // Calculer la direction de la piste
            const nextIdx = (idx + 1) % n;
            const next = track.centerPoints[nextIdx];
            const dx = next.x - point.x;
            const dz = next.z - point.z;
            const len = Math.sqrt(dx * dx + dz * dz);

            // Perpendiculaire à la piste
            const perpX = -dz / len;
            const perpZ = dx / len;

            // Elevation via le systeme multi-branches (retourne pont si dans la zone pont)
            // currentY=100 → "closest floor below" prend la surface la plus haute (visible)
            const baseY = (track.get3DElevationAt)
                ? track.get3DElevationAt(point.x, point.z, 100, 99)
                : (point.y || 0);

            // Créer 3 boîtes alignées perpendiculairement
            for (let j = 0; j < boxesPerGroup; j++) {
                // Décalage: -1, 0, +1 multiplié par l'espacement
                const offset = (j - 1) * spacing;
                const x = point.x + perpX * offset;
                const z = point.z + perpZ * offset;

                const box = new ItemBox(this.scene, x, baseY, z);
                this.itemBoxes.push(box);
            }
        }

        console.log(`[ItemManager] Created ${this.itemBoxes.length} item boxes (${numGroups} groups of ${boxesPerGroup})`);
    }

    // Obtenir un item aléatoire selon la position
    getRandomItem(isFirst) {
        const probs = isFirst ? ITEM_PROBABILITIES.first : ITEM_PROBABILITIES.second;
        const totalWeight = probs.reduce((sum, p) => sum + p.weight, 0);
        let random = Math.random() * totalWeight;

        for (const prob of probs) {
            random -= prob.weight;
            if (random <= 0) {
                return prob.type;
            }
        }

        return ITEM_TYPES.PILL_BOOST; // Fallback
    }

    // Vérifier si un kart ramasse une boîte
    checkPickup(kart) {
        for (const box of this.itemBoxes) {
            if (box.checkCollision(kart.x, kart.y, kart.z)) {
                if (box.collect()) {
                    return true;
                }
            }
        }
        return false;
    }

    // Utiliser un item
    // aimBackward = true pour lancer vers l'arrière (balle, missile)
    useItem(type, kart, owner, track, aimBackward = false) {
        const config = ITEM_CONFIG[type];

        switch (type) {
            case ITEM_TYPES.PILL_BOOST:
                // Boost instantané
                kart.boostTime = config.boostDuration;
                kart.boostPower = config.boostPower;
                kart.isItemBoostFlash = true;  // Déclenche le flash visuel
                return { used: true, effect: 'boost' };

            case ITEM_TYPES.BALL:
            case ITEM_TYPES.HOMING_BALL:
                // Lancer un projectile (devant ou derrière selon aimBackward)
                const direction = aimBackward ? -1 : 1;
                const launchAngle = aimBackward ? kart.angle + Math.PI : kart.angle;
                const proj = new Projectile(
                    this.scene,
                    kart.x + Math.sin(kart.angle) * 5 * direction,
                    kart.y,
                    kart.z + Math.cos(kart.angle) * 5 * direction,
                    launchAngle,
                    type,
                    owner
                );
                proj.ownerKart = kart;
                this.projectiles.push(proj);
                return { used: true, effect: 'projectile' };

            case ITEM_TYPES.SLIME:
                // Poser un obstacle derrière
                const obs = new Obstacle(
                    this.scene,
                    kart.x - Math.sin(kart.angle) * 8,  // Plus loin derrière
                    kart.y,
                    kart.z - Math.cos(kart.angle) * 8,
                    type,
                    owner,
                    kart
                );
                this.obstacles.push(obs);

                // Mini boost en lâchant le slime (stratégique)
                kart.boostTime = 20;      // Court boost (~0.3 sec)
                kart.boostPower = 1.15;   // +15% vitesse

                return { used: true, effect: 'obstacle' };

            case ITEM_TYPES.SHIELD:
                // Activer l'étoile (invincibilité + boost via shieldTime)
                kart.shieldTime = config.duration;
                return { used: true, effect: 'shield' };

            case ITEM_TYPES.EMP:
                // Effet global géré par le caller
                return { used: true, effect: 'emp', config: config };
        }

        return { used: false };
    }

    // Mise a jour generique pour N racers
    // racers = tableau de karts (Player et/ou AI)
    // Retourne un tableau d'events : [{ type: 'projectileHit'|'slimeHit', victim, attacker }]
    updateAll(dt, track, racers) {
        // Réutiliser le tableau d'events (clear au lieu de recréer)
        if (!this._updateEvents) this._updateEvents = [];
        const events = this._updateEvents;
        events.length = 0;

        // Mettre à jour les boîtes
        this.itemBoxes.forEach(box => box.update(dt));

        // Mettre à jour les projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];

            // Déterminer la cible pour les projectiles guidés
            let target = null;
            if (proj.type === ITEM_TYPES.HOMING_BALL) {
                // Cibler le racer le plus proche qui n'est pas le lanceur
                let minDist = Infinity;
                for (const racer of racers) {
                    if (racer === proj.ownerKart) continue;
                    const dx = racer.x - proj.x;
                    const dz = racer.z - proj.z;
                    const dist = dx * dx + dz * dz;
                    if (dist < minDist) {
                        minDist = dist;
                        target = racer;
                    }
                }
            }

            proj.update(dt, track, target);

            // Vérifier les collisions avec tous les racers
            if (proj.active) {
                for (const racer of racers) {
                    if (proj.checkHit(racer) && !racer.shieldTime && !(racer.hitImmunity > 0)) {
                        this.applyHit(racer);
                        proj.destroy();
                        events.push({ type: 'projectileHit', victim: racer, attacker: proj.ownerKart });
                        break;
                    }
                }
            }

            if (!proj.active) {
                // Swap-and-pop au lieu de splice (évite GC)
                this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
                this.projectiles.length--;
            }
        }

        // Mettre à jour les obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.update(dt);

            if (obs.active) {
                for (const racer of racers) {
                    if (obs.checkHit(racer) && !racer.shieldTime) {
                        this.applySlowdown(racer, obs.config);
                        obs.destroy();
                        events.push({ type: 'slimeHit', victim: racer, attacker: obs.ownerKart });
                        break;
                    }
                }
            }

            if (!obs.active) {
                // Swap-and-pop au lieu de splice (évite GC)
                this.obstacles[i] = this.obstacles[this.obstacles.length - 1];
                this.obstacles.length--;
            }
        }

        return events;
    }

    // Wrapper retrocompatible : convertit le resultat de updateAll en ancien format
    // Réutilise les mêmes objets pour éviter GC
    update(dt, track, player, ai) {
        if (!this._racersArr) this._racersArr = [player, ai];
        this._racersArr[0] = player;
        this._racersArr[1] = ai;

        const allEvents = this.updateAll(dt, track, this._racersArr);

        if (!this._eventResult) this._eventResult = { playerHitAI: false, aiHitPlayer: false, playerHitSlime: false, aiHitSlime: false };
        const events = this._eventResult;
        events.playerHitAI = false;
        events.aiHitPlayer = false;
        events.playerHitSlime = false;
        events.aiHitSlime = false;

        for (let k = 0; k < allEvents.length; k++) {
            const evt = allEvents[k];
            if (evt.type === 'projectileHit') {
                if (evt.victim === ai && evt.attacker === player) events.playerHitAI = true;
                if (evt.victim === player && evt.attacker === ai) events.aiHitPlayer = true;
            } else if (evt.type === 'slimeHit') {
                if (evt.victim === player) events.playerHitSlime = true;
                if (evt.victim === ai) events.aiHitSlime = true;
            }
        }

        return events;
    }

    // Appliquer un impact (projectile)
    applyHit(kart) {
        // Immunité : ne pas re-hit un kart déjà en spin
        if (kart.spinOut > 0) return;
        kart.speed *= 0.3;
        kart.spinOut = 30; // Frames de spin
        kart.hitImmunity = 60; // ~1s d'immunité après le spin
    }

    // Appliquer un ralentissement (slime)
    applySlowdown(kart, config) {
        kart.speed *= config.slowdownFactor;
        kart.slowdownTime = config.slowdownDuration;
    }

    // Nettoyer tous les items
    clear() {
        this.itemBoxes.forEach(box => box.destroy());
        this.projectiles.forEach(proj => proj.destroy());
        this.obstacles.forEach(obs => obs.destroy());

        this.itemBoxes = [];
        this.projectiles = [];
        this.obstacles = [];
    }
}
