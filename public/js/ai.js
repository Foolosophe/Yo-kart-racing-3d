// ============================================================
// AI - Intelligence artificielle
// ============================================================

import { CONFIG } from './config.js';
import { Kart } from './kart.js';

export class AI {
    constructor(scene) {
        this.scene = scene;
        this.mesh = Kart.create(scene, 0x3498db);
        this.reset();
    }
    
    reset(track) {
        // Utiliser la position de départ du circuit si disponible
        if (track && track.startX !== undefined) {
            this.x = track.startX + 5;
            this.z = track.startZ + 18;  // À côté du joueur, légèrement derrière
            this.angle = track.startAngle;
        } else {
            const { curveRadius, straightLength } = CONFIG.track;
            this.x = -curveRadius + 5;
            this.z = straightLength / 2 + 18;
            this.angle = Math.PI;
        }

        // Élévation initiale selon le terrain
        if (track && track.is3DReliefEnabled && track.is3DReliefEnabled()) {
            this.y = track.get3DElevationAt(this.x, this.z, null, 1);
            this.targetY = this.y;
        } else {
            this.y = 0;
            this.targetY = 0;
        }
        this.previousAngle = Math.PI;
        this.tilt = 0;
        this.pitch = 0;      // Inclinaison avant/arrière (pentes)
        this.slopeRoll = 0;  // Inclinaison latérale due aux pentes
        this.speed = 0;
        this.currentCheckpoint = 0;
        this.currentLap = 0;
        this.currentWaypoint = 0;
        this.raceProgress = 0;
        this.raceTime = 0;
        this.lapStartTime = 0;
        this.bestLapTime = null;
        this.finished = false;
        this.prevX = this.x;
        this.prevZ = this.z;
        this.currentLayer = 0;  // 0 = sol, 1 = pont

        // Système airborne (tremplin)
        this.airborne = false;
        this.airborneVelocityY = 0;

        // Système d'items
        this.currentItem = null;      // Item actuellement possédé
        this.shieldTime = 0;          // Temps restant de bouclier
        this.slowdownTime = 0;        // Temps restant de ralentissement
        this.spinOut = 0;             // Temps restant de spin (touché par projectile)
        this.itemCooldown = 0;        // Cooldown avant pouvoir reprendre un item
        this.itemHoldTime = 0;        // Temps depuis réception de l'item (délai réflexion)

        // Système d'erreurs
        this.mistakeTimer = 0;        // Timer avant prochaine erreur
        this.mistakeActive = false;   // Erreur en cours
        this.mistakeDuration = 0;     // Durée de l'erreur actuelle
        this.mistakeType = null;      // Type d'erreur: 'late_brake', 'bad_line', 'oversteer'
        this.resetMistakeTimer();

        // Réaction quand touchée
        this.hitReaction = 0;         // Timer pour l'effet visuel
        this.hitEmoji = null;         // Emoji à afficher

        if (track) {
            this.currentWaypoint = track.findStartingWaypoint(this.x, this.z);
        }

        // Mettre à jour la position du mesh 3D
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.angle;
    }
    
    update(dt, track, physics, playerProgress, onFinish) {
        if (this.finished) return;

        const cfg = CONFIG.ai;
        const delta = Math.min(dt, 0.05);
        const dtFactor = delta * 60;

        // === EFFETS D'ITEMS ===
        if (this.shieldTime > 0) this.shieldTime -= dtFactor;
        if (this.slowdownTime > 0) this.slowdownTime -= dtFactor;
        if (this.hitImmunity > 0) this.hitImmunity -= dtFactor;
        if (this.itemCooldown > 0) this.itemCooldown -= dtFactor;
        if (this.currentItem) this.itemHoldTime += dtFactor;

        // === RÉACTION HIT ===
        if (this.hitReaction > 0) this.hitReaction -= dtFactor;

        // Spin out - 360° exact pour garder la direction
        if (this.spinOut > 0) {
            const spinSpeed = (Math.PI * 2) / 30;
            this.spinOut -= dtFactor;
            this.angle += spinSpeed * dtFactor;
            this.speed *= 0.97;
            // Continue quand même pour update position/mesh
        }

        // === SYSTÈME D'ERREURS ===
        if (!this.mistakeActive) {
            this.mistakeTimer -= dtFactor;
            if (this.mistakeTimer <= 0) {
                this.triggerMistake();
            }
        } else {
            this.mistakeDuration -= dtFactor;
            if (this.mistakeDuration <= 0) {
                this.mistakeActive = false;
                this.mistakeType = null;
                this.resetMistakeTimer();
            }
        }
        
        // Trouver le waypoint cible (en tenant compte du niveau Y pour les croisements)
        const n = track.centerPoints.length;
        let targetWaypoint = (this.currentWaypoint + cfg.lookAhead) % n;
        let target = track.centerPoints[targetWaypoint];

        // Si le waypoint cible est à un Y très différent, chercher le prochain waypoint au bon niveau
        if (target.y !== undefined && Math.abs(target.y - this.y) > 4) {
            for (let offset = 1; offset <= cfg.lookAhead; offset++) {
                const testIdx = (this.currentWaypoint + offset) % n;
                const testWp = track.centerPoints[testIdx];
                if (testWp.y === undefined || Math.abs(testWp.y - this.y) <= 4) {
                    targetWaypoint = testIdx;
                    target = testWp;
                    break;
                }
            }
        }

        // Calculer l'angle vers la cible
        const dx = target.x - this.x;
        const dz = target.z - this.z;
        const targetAngle = Math.atan2(dx, dz);

        // Différence d'angle
        let angleDiff = targetAngle - this.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Tourner vers la cible (avec erreurs possibles)
        let turnAmount = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), cfg.turnSpeed * dtFactor);

        // Appliquer les erreurs
        if (this.mistakeActive) {
            switch (this.mistakeType) {
                case 'oversteer':
                    // Tourne trop, dépasse la cible
                    turnAmount *= 1.8;
                    break;
                case 'bad_line':
                    // Ajoute du bruit à la direction
                    turnAmount += (Math.random() - 0.5) * 0.03 * dtFactor;
                    break;
                case 'late_brake':
                    // Géré dans la section vitesse
                    break;
            }
        }

        this.angle += turnAmount;

        // Calculer si on est dans un virage (même logique Y)
        let lookAheadFar = (this.currentWaypoint + 10) % n;
        let farTarget = track.centerPoints[lookAheadFar];
        if (farTarget.y !== undefined && Math.abs(farTarget.y - this.y) > 4) {
            farTarget = target; // Fallback sur le target proche
        }
        const farDx = farTarget.x - this.x;
        const farDz = farTarget.z - this.z;
        const farAngle = Math.atan2(farDx, farDz);
        let farAngleDiff = Math.abs(farAngle - this.angle);
        while (farAngleDiff > Math.PI) farAngleDiff = Math.PI * 2 - farAngleDiff;
        
        // Vitesse cible
        let targetSpeed = cfg.maxSpeed;
        if (farAngleDiff > 0.5) {
            targetSpeed = cfg.maxSpeed * cfg.cornerSlowdown;
        }

        // Erreur: freinage tardif - ne ralentit pas dans les virages
        if (this.mistakeActive && this.mistakeType === 'late_brake') {
            targetSpeed = cfg.maxSpeed; // Ignore le ralentissement
        }
        
        // RUBBER BANDING
        const progressDiff = playerProgress - this.raceProgress;
        if (progressDiff > 50 && !this._playerHasStar) {
            // Joueur devant → IA accélère (désactivé si le joueur a l'étoile)
            const boost = Math.min(progressDiff / 500, 0.15);
            targetSpeed *= (1 + boost);
        } else if (progressDiff < -50) {
            // IA devant → IA ralentit
            const slow = Math.min(Math.abs(progressDiff) / 500, 0.10);
            targetSpeed *= (1 - slow);
        }
        
        // Étoile : boost de vitesse
        if (this.shieldTime > 0) {
            targetSpeed *= 1.3;
        }

        // EMP : plafonner la vitesse pendant le ralentissement
        if (this.slowdownTime > 0) {
            targetSpeed *= 0.4;
        }

        // Accélérer / Décélérer
        if (this.speed < targetSpeed) {
            this.speed = Math.min(this.speed + cfg.acceleration * dtFactor, targetSpeed);
        } else {
            this.speed = Math.max(this.speed - cfg.acceleration * 2 * dtFactor, targetSpeed);
        }

        // Effet de gravité sur les pentes
        // Descente = pitch > 0 = accélère, Montée = pitch < 0 = ralentit
        if (CONFIG.elevation && CONFIG.elevation.gravityEffect && this.pitch !== 0) {
            const gravityForce = this.pitch * CONFIG.elevation.gravityEffect * Math.abs(this.speed) * dtFactor * 60;
            this.speed += gravityForce;
        }

        // Sauvegarder position précédente
        this.prevX = this.x;
        this.prevZ = this.z;

        // Nouvelle position
        const newX = this.x + Math.sin(this.angle) * this.speed * dtFactor;
        const newZ = this.z + Math.cos(this.angle) * this.speed * dtFactor;

        // Collision murs (simple)
        const collision = physics.checkWallCollision(newX, newZ, CONFIG.physics.kartRadius, this.targetY);

        if (collision.hit) {
            this.speed *= CONFIG.physics.wallSpeedRetain;
        }
        this.x = collision.x;
        this.z = collision.z;

        // Mise à jour de l'élévation
        if (track.is3DReliefEnabled && track.is3DReliefEnabled()) {
            this._elevFrame = (this._elevFrame || 0) + 1;

            if (this.airborne) {
                // === EN L'AIR : physique de projectile ===
                const rampCfg = CONFIG.ramp;
                this.airborneVelocityY -= rampCfg.gravity * dtFactor;
                this.y += this.airborneVelocityY * dtFactor;

                const groundY = track.get3DElevationAt(this.x, this.z, this.y, 1);
                if (this.y <= groundY && this.airborneVelocityY < 0) {
                    this.y = groundY;
                    this.targetY = groundY;
                    this.airborne = false;
                    this.airborneVelocityY = 0;
                }
            } else {
                // === AU SOL : comportement normal ===

                // Anti-tunneling : throttlé sur mobile (1/3 frames)
                if (!this._skipSlope || this._elevFrame % 3 === 0) {
                    const trackInfo = track.getClosestTrackPoint(this.x, this.z, this.y, 1);
                    if (trackInfo && trackInfo.dist > CONFIG.track.width / 2 + 5) {
                        const pullStrength = 0.3;
                        this.x += (trackInfo.x - this.x) * pullStrength;
                        this.z += (trackInfo.z - this.z) * pullStrength;
                        this.speed *= 0.9;
                    }
                }

                // Élévation TOUJOURS recalculée pour éviter les sauts Y
                const rawTargetY = track.get3DElevationAt(this.x, this.z, this.y, 1);

                // Anti-téléportation au croisement figure-8
                const maxYJump = 1.5;
                this.targetY = Math.max(this.y - maxYJump, Math.min(this.y + maxYJump, rawTargetY));

                // Lissage du Y — rapide en montée (évite de s'enfoncer dans la rampe), doux en descente
                const yDiff = this.targetY - this.y;
                const ySpeed = yDiff > 0
                    ? Math.min(0.7 * dtFactor, 1.0)   // Montée : suivi rapide
                    : Math.min(0.25 * dtFactor, 1.0); // Descente : lissage doux
                this.y += yDiff * ySpeed;
            }

            // Layer dynamique selon l'élévation (pour collisions murs pont)
            this.currentLayer = this.targetY > 15 ? 1 : 0;  // Seuil entre sol (0-10m) et pont (22m)
        } else if (track.getElevationAtWithLayer) {
            // Legacy: système de ponts avec couches
            this.targetY = track.getElevationAtWithLayer(this.x, this.z, this.y);
            this.y += (this.targetY - this.y) * 0.15;
            this.currentLayer = this.y > 1.5 ? 1 : 0;
        }

        // Mise à jour waypoint (avec vérification Y pour circuits qui se croisent)
        const wp = track.centerPoints[this.currentWaypoint];
        const distXZ = Math.sqrt((this.x - wp.x) ** 2 + (this.z - wp.z) ** 2);
        const distY = wp.y !== undefined ? Math.abs(this.y - wp.y) : 0;
        // Avancer seulement si proche en XZ ET au même niveau Y (tolérance 8 unités)
        if (distXZ < cfg.waypointRadius && distY < 4) {
            this.currentWaypoint = (this.currentWaypoint + 1) % track.centerPoints.length;
        }

        // Mise à jour mesh 3D
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.angle;

        // Inclinaison selon la pente du terrain (désactivé sur mobile via _skipSlope)
        if (!this._skipSlope && track.is3DReliefEnabled && track.is3DReliefEnabled() && track.getSlopeAt) {
            const slope = track.getSlopeAt(this.x, this.z, this.angle);
            this.pitch += (slope.pitch - this.pitch) * 0.15;
            this.slopeRoll += (slope.roll - this.slopeRoll) * 0.15;
        }

        // Appliquer le pitch (inclinaison avant/arrière due aux pentes)
        this.mesh.rotation.x = this.pitch;

        // Tilt style Mario Kart
        const angularVel = this.angle - this.previousAngle;
        const targetTilt = -angularVel * 8;
        this.tilt += (targetTilt - this.tilt) * 0.2;

        // Combiner le tilt de virage avec l'inclinaison latérale de la pente
        this.mesh.rotation.z = this.tilt + this.slopeRoll;
        this.previousAngle = this.angle;

        Kart.updateWheelRotation(this.mesh, this.speed);
        Kart.updateFrontWheelSteering(this.mesh, -angularVel * 12);
        
        // Checkpoints
        this.checkCheckpoint(track.checkpointZones, onFinish);
        
        // Progress
        this.raceProgress = this.currentLap * 1000 + this.currentCheckpoint * 100 + 
            physics.getDistanceToNextCheckpoint(this, track.checkpointZones);
    }
    
    checkCheckpoint(checkpointZones, onFinish) {
        // Protection contre index hors limites
        if (!checkpointZones || this.currentCheckpoint >= checkpointZones.length) return;

        const cp = checkpointZones[this.currentCheckpoint];
        if (!cp) return;

        // Distance au checkpoint
        const tx = this.x - cp.x;
        const tz = this.z - cp.z;

        // Vérifier le niveau Y (pour circuits avec croisements comme le figure-8)
        const yDiff = cp.y !== undefined ? Math.abs(this.y - cp.y) : 0;
        if (yDiff > 4) return; // Pas au bon niveau (sol vs pont)

        // Détection simple : dans la zone du checkpoint
        const perpDist = Math.abs(tx * cp.nz - tz * cp.nx);
        const alongDist = Math.abs(tx * cp.nx + tz * cp.nz);

        if (perpDist < cp.width / 2 && alongDist < 2) {
            this.currentCheckpoint++;

            if (this.currentCheckpoint >= checkpointZones.length) {
                this.currentCheckpoint = 0;
                this.currentLap++;

                // Temps du tour
                const lapTime = Date.now() - this.lapStartTime;
                if (!this.bestLapTime || lapTime < this.bestLapTime) {
                    this.bestLapTime = lapTime;
                }
                this.lapStartTime = Date.now();

                if (this.currentLap >= CONFIG.race.totalLaps) {
                    this.finished = true;
                    this.raceTime = Date.now() - this.raceStartTime;
                    if (onFinish) onFinish();
                }
            }
        }
    }

    // Démarre le chronomètre (appelé au début de la course)
    startRace() {
        this.raceStartTime = Date.now();
        this.lapStartTime = Date.now();
    }

    // ============================================================
    // SYSTÈME D'ERREURS
    // ============================================================

    resetMistakeTimer() {
        // Fréquence des erreurs selon la difficulté (en frames, 60fps)
        const difficulty = this.difficulty || 'normal';
        const ranges = {
            easy: { min: 480, max: 900 },      // 8-15 secondes
            normal: { min: 900, max: 1500 },   // 15-25 secondes
            hard: { min: 1800, max: 2700 }     // 30-45 secondes
        };
        const range = ranges[difficulty] || ranges.normal;
        this.mistakeTimer = range.min + Math.random() * (range.max - range.min);
    }

    // Déclencher un saut de tremplin
    launch(power) {
        if (this.airborne) return;
        if (Math.abs(this.speed) < CONFIG.ramp.minSpeedToLaunch) return;
        this.airborne = true;
        this.airborneVelocityY = power || CONFIG.ramp.launchPower;
    }

    triggerMistake() {
        const difficulty = this.difficulty || 'normal';

        // Types d'erreurs possibles
        const mistakeTypes = ['late_brake', 'bad_line', 'oversteer'];
        this.mistakeType = mistakeTypes[Math.floor(Math.random() * mistakeTypes.length)];

        // Durée selon difficulté (plus longue = plus pénalisante)
        const durations = {
            easy: { min: 40, max: 80 },
            normal: { min: 25, max: 50 },
            hard: { min: 15, max: 30 }
        };
        const dur = durations[difficulty] || durations.normal;
        this.mistakeDuration = dur.min + Math.random() * (dur.max - dur.min);
        this.mistakeActive = true;
    }

    // ============================================================
    // ITEMS STRATÉGIQUES
    // ============================================================

    shouldUseItem(player, track) {
        if (!this.currentItem) return false;

        // Attendre un délai après réception (0.5-2 secondes)
        if (this.itemHoldTime < 30 + Math.random() * 90) return false;

        const distToPlayer = Math.sqrt((this.x - player.x) ** 2 + (this.z - player.z) ** 2);
        const playerAhead = player.raceProgress > this.raceProgress;
        const playerBehind = player.raceProgress < this.raceProgress;
        const progressDiff = Math.abs(player.raceProgress - this.raceProgress);

        // Angle vers le joueur
        const angleToPlayer = Math.atan2(player.x - this.x, player.z - this.z);
        let angleDiff = Math.abs(angleToPlayer - this.angle);
        while (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        const playerInFront = angleDiff < 0.5; // ~30°

        // Vérifier si on est en ligne droite (peu de virage à venir)
        const n = track.centerPoints.length;
        const farWaypoint = (this.currentWaypoint + 15) % n;
        const farTarget = track.centerPoints[farWaypoint];
        const farAngle = Math.atan2(farTarget.x - this.x, farTarget.z - this.z);
        let farAngleDiff = Math.abs(farAngle - this.angle);
        while (farAngleDiff > Math.PI) farAngleDiff = Math.PI * 2 - farAngleDiff;
        const isOnStraight = farAngleDiff < 0.3;

        switch (this.currentItem) {
            case 'pill_boost':
                // Utiliser en ligne droite OU si en retard
                return isOnStraight || (playerAhead && progressDiff > 30);

            case 'ball':
                // Joueur devant + dans l'axe + proche
                return playerAhead && playerInFront && distToPlayer < 50;

            case 'homing_ball':
                // Joueur devant + écart significatif
                return playerAhead && progressDiff > 20;

            case 'slime':
                // Joueur derrière et proche
                return playerBehind && distToPlayer < 35;

            case 'shield':
                // Joueur derrière avec un item (préventif) OU joueur proche
                return (playerBehind && player.currentItem && distToPlayer < 40) || distToPlayer < 20;

            case 'emp':
                // Joueur proche peu importe la position
                return distToPlayer < 45;

            default:
                return Math.random() < 0.01; // Fallback aléatoire
        }
    }

    // ============================================================
    // RÉACTION QUAND TOUCHÉE
    // ============================================================

    onHit() {
        this.hitReaction = 60; // 1 seconde d'effet
        const emojis = ['😭', '🥺', '😱', '😵‍💫'];
        this.hitEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    }
}
