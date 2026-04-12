// ============================================================
// PLAYER - Logique du joueur
// ============================================================

import { CONFIG } from './config.js';
import { Kart } from './kart.js';

export class Player {
    constructor(scene, color = 0xe74c3c) {
        this.scene = scene;
        this.color = color;
        this.mesh = Kart.create(scene, color);
        this.reset();
    }
    
    reset(track = null) {
        // Utiliser la position de départ du circuit si disponible
        if (track) {
            this.x = track.startX - 5;
            this.z = track.startZ + 15;  // AVANT la ligne de départ
            this.angle = track.startAngle;
        } else {
            const { curveRadius, straightLength } = CONFIG.track;
            this.x = -curveRadius - 5;
            this.z = straightLength / 2 + 15;
            this.angle = Math.PI;
        }

        // Élévation initiale selon le terrain
        if (track && track.is3DReliefEnabled && track.is3DReliefEnabled()) {
            this.y = track.get3DElevationAt(this.x, this.z, null, 0);
            this.targetY = this.y;
        } else {
            this.y = 0;
            this.targetY = 0;
        }
        this.angularVelocity = 0;  // Vitesse de rotation avec inertie
        this.tilt = 0;  // Inclinaison latérale (virage style Mario Kart)
        this.pitch = 0; // Inclinaison avant/arrière (pentes)
        this.slopeRoll = 0; // Inclinaison latérale due aux pentes
        this.jumpHeight = 0;  // Hauteur du saut de drift
        this.jumpVelocity = 0;  // Vélocité verticale
        this.speed = 0;
        this.isDrifting = false;
        this.driftTime = 0;
        this.driftDirection = 0;
        this.boostTime = 0;
        this.boostPower = 1;
        this.isTurboStartFlash = false;
        this.isItemBoostFlash = false;
        this.currentCheckpoint = 0;
        this.currentLap = 0;
        this.prevX = this.x;
        this.prevZ = this.z;
        this.raceProgress = 0;
        this.raceTime = 0;
        this.lapStartTime = 0;
        this.bestLapTime = null;
        this.lapTimes = [];
        this.finished = false;
        this.currentLayer = 0;  // 0 = sol, 1 = pont

        // Système d'items
        this.currentItem = null;      // Item actuellement possédé
        this.shieldTime = 0;          // Temps restant de bouclier
        this.slowdownTime = 0;        // Temps restant de ralentissement
        this.spinOut = 0;             // Temps restant de spin (touché par projectile)
        this.itemCooldown = 0;        // Cooldown avant pouvoir reprendre un item
        this.hitImmunity = 0;         // Immunité après avoir été touché

        // Système de combo drift
        this.driftCombo = 0;          // Nombre de drifts consécutifs avec boost
        this.comboTimer = 0;          // Timer pour reset du combo (si pas de drift pendant X frames)
        this.lastDriftBoostLevel = 0; // 0=rien, 1=bleu, 2=orange, 3=violet

        // Système airborne (tremplin)
        this.airborne = false;
        this.airborneVelocityY = 0;

        // Mettre à jour la position du mesh 3D
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.angle;
    }
    
    update(dt, input, track, physics, onCheckpoint, onLapComplete, onFinish) {
        
        const cfg = CONFIG.physics;
        const delta = Math.min(dt, 0.05);
        const dtFactor = delta * 60;

        // === EFFETS D'ITEMS ===
        // Décrementer les timers
        if (this.shieldTime > 0) this.shieldTime -= dtFactor;
        if (this.slowdownTime > 0) this.slowdownTime -= dtFactor;
        if (this.hitImmunity > 0) this.hitImmunity -= dtFactor;
        if (this.itemCooldown > 0) this.itemCooldown -= dtFactor;

        // Combo drift timer - reset si trop longtemps sans drift
        if (this.comboTimer > 0) {
            this.comboTimer -= dtFactor;
            if (this.comboTimer <= 0 && !this.isDrifting) {
                this.driftCombo = 0;
                this.lastDriftBoostLevel = 0;
            }
        }

        // Spin out (touché par projectile) - 360° exact pour garder la direction
        const isSpinning = this.spinOut > 0;
        if (isSpinning) {
            // 360° exact sur 30 frames (2*PI / 30 ≈ 0.209 rad/frame)
            const spinSpeed = (Math.PI * 2) / 30;
            this.spinOut -= dtFactor;
            this.angle += spinSpeed * dtFactor;
            this.speed *= 0.97; // Ralentit moins (était 0.95)
        }

        // Vitesse max (réduite par EMP)
        const effectiveMaxSpeed = this.slowdownTime > 0 ? cfg.maxSpeed * 0.4 : cfg.maxSpeed;
        const effectiveBoostMax = this.slowdownTime > 0 ? cfg.boostMaxSpeed * 0.4 : cfg.boostMaxSpeed;

        // Accélération / Freinage (désactivé pendant spin)
        if (!isSpinning && input.accelerate) {
            if (this.shieldTime > 0) {
                // Étoile : +25% vitesse max, accélération x1.8
                const starSpeed = cfg.maxSpeed * 1.25;
                if (this.speed < starSpeed) {
                    this.speed = Math.min(this.speed + cfg.acceleration * 1.8 * dtFactor, starSpeed);
                }
            } else {
                const ratio = Math.abs(this.speed) / effectiveMaxSpeed;
                let accel = cfg.acceleration * (1 - ratio * cfg.accelerationCurve) * dtFactor;
                const isBoosting = this.boostTime > 0;
                if (isBoosting) accel *= this.boostPower;
                this.speed = Math.min(this.speed + accel, isBoosting ? effectiveBoostMax : effectiveMaxSpeed);
            }
        }
        
        if (!isSpinning && input.brake) {
            if (this.speed > 0.1) {
                this.speed = Math.max(0, this.speed - cfg.brakeForce * dtFactor);
            } else {
                this.speed = Math.max(-cfg.reverseMaxSpeed, this.speed - cfg.acceleration * 0.5 * dtFactor);
            }
        }

        // Direction avec inertie angulaire (désactivé pendant spin)
        let targetAngularVel = 0;
        if (!isSpinning && Math.abs(this.speed) > 0.1) {
            let turn = cfg.turnSpeed;
            if (Math.abs(this.speed) > cfg.turnSpeedThreshold) {
                const f = (Math.abs(this.speed) - cfg.turnSpeedThreshold) / (cfg.maxSpeed - cfg.turnSpeedThreshold);
                turn = cfg.turnSpeed - (cfg.turnSpeed - cfg.turnSpeedAtHighSpeed) * Math.min(f, 1);
            }
            if (this.isDrifting) turn *= cfg.driftTurnMultiplier;
            const dir = this.speed >= 0 ? 1 : -1;
            if (input.left) targetAngularVel = turn * dir;
            if (input.right) targetAngularVel = -turn * dir;

        }

        // Inertie : la vitesse angulaire converge progressivement vers la cible
        // Plus lisse pendant le drift pour un feeling plus fluide
        const inertiaFactor = this.isDrifting ? 0.08 : 0.15;
        this.angularVelocity += (targetAngularVel - this.angularVelocity) * inertiaFactor;
        this.angle += this.angularVelocity * dtFactor;

        // Drift
        // Pour DÉMARRER un drift : drift + vitesse + direction
        // Pour MAINTENIR un drift : drift + vitesse (peut arrêter de tourner)
        if (input.drift && Math.abs(this.speed) > 1) {
            if (!this.isDrifting && (input.left || input.right)) {
                // Démarrer le drift
                this.isDrifting = true;
                this.driftDirection = input.left ? 1 : -1;
                this.driftTime = 0;
                this.driftIntensity = 0; // Intensité progressive du drift
                // Hop au déclenchement du drift (style Mario Kart)
                this.jumpVelocity = 0.25;
            }
            if (this.isDrifting) {
                // Continuer le drift tant que B est maintenu
                this.driftTime += dtFactor;
                // Intensité du drift monte progressivement (0 → 1 en ~30 frames)
                this.driftIntensity = Math.min(1, (this.driftIntensity || 0) + 0.03 * dtFactor);
                this.angle += cfg.driftAngleAdd * this.driftDirection * this.driftIntensity * dtFactor;
            }
        } else if (this.isDrifting) {
            // Relâcher B = fin du drift + boost
            this.triggerDriftBoost();
            this.isDrifting = false;
            this.driftTime = 0;
            this.driftIntensity = 0;
        }

        // Physique du saut
        this.jumpHeight += this.jumpVelocity;
        this.jumpVelocity -= 0.02;  // Gravité
        if (this.jumpHeight < 0) {
            this.jumpHeight = 0;
            this.jumpVelocity = 0;
        }
        
        // Friction & Boost
        this.speed *= Math.pow(this.isDrifting ? cfg.driftFriction : cfg.friction, dtFactor);
        if (this.boostTime > 0) this.boostTime -= dtFactor;

        // Effet de gravité sur les pentes (utilise le pitch calculé précédemment)
        // Descente = pitch > 0 = accélère, Montée = pitch < 0 = ralentit
        if (CONFIG.elevation && CONFIG.elevation.gravityEffect && this.pitch !== 0) {
            const gravityForce = this.pitch * CONFIG.elevation.gravityEffect * Math.abs(this.speed) * dtFactor * 60;
            this.speed += gravityForce;
        }
        
        // Pénalité hors-piste (désactivée en l'air)
        if (!this.airborne && !track.isOnTrack(this.x, this.z, 0)) {
            this.speed *= Math.pow(0.95, dtFactor);
        }

        // Boost zones gérées dans game.js pour les effets visuels/sonores

        // Sauvegarder position précédente
        this.prevX = this.x;
        this.prevZ = this.z;

        // Nouvelle position
        const newX = this.x + Math.sin(this.angle) * this.speed * dtFactor;
        const newZ = this.z + Math.cos(this.angle) * this.speed * dtFactor;

        // Collision murs (simple)
        const collision = physics.checkWallCollision(newX, newZ, cfg.kartRadius, this.targetY);

        if (collision.hit) {
            this.speed *= cfg.wallSpeedRetain;
        }
        this.lastWallCollision = collision.hit; // Exposer l'état pour le screen shake
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

                // Vérifier l'atterrissage : le terrain sous le kart
                const groundY = track.get3DElevationAt(this.x, this.z, this.y, 0);
                if (this.y <= groundY && this.airborneVelocityY < 0) {
                    // Atterrissage
                    this.y = groundY;
                    this.targetY = groundY;
                    this.airborne = false;
                    this.airborneVelocityY = 0;
                }
            } else {
                // === AU SOL : comportement normal ===

                // Anti-tunneling : throttlé sur mobile (1/3 frames)
                if (!this._skipSlope || this._elevFrame % 3 === 0) {
                    const trackInfo = track.getClosestTrackPoint(this.x, this.z, this.y, 0);
                    if (trackInfo && trackInfo.dist > CONFIG.track.width / 2 + 5) {
                        const pullStrength = 0.3;
                        this.x += (trackInfo.x - this.x) * pullStrength;
                        this.z += (trackInfo.z - this.z) * pullStrength;
                        this.speed *= 0.9;
                    }
                }

                // Élévation TOUJOURS recalculée
                const rawTargetY = track.get3DElevationAt(this.x, this.z, this.y, 0);

                // Anti-téléportation au croisement figure-8
                const maxYJump = 1.5;
                this.targetY = Math.max(this.y - maxYJump, Math.min(this.y + maxYJump, rawTargetY));

                // Lissage du Y — rapide en montée (évite de s'enfoncer dans la rampe), doux en descente
                const yDiff = this.targetY - this.y;
                const ySpeed = yDiff > 0
                    ? Math.min(0.7 * dtFactor, 1.0)   // Montée : suivi rapide
                    : Math.min(0.15 * dtFactor, 0.5); // Descente : lissage doux
                this.y += yDiff * ySpeed;
            }

            // Layer dynamique selon l'élévation (pour collisions murs pont)
            // Utiliser targetY (pas le Y lissé) pour réagir plus vite aux changements de niveau
            this.currentLayer = this.targetY > 15 ? 1 : 0;
        } else if (track.getElevationAtWithLayer) {
            // Legacy: système de ponts avec couches
            this.targetY = track.getElevationAtWithLayer(this.x, this.z, this.y);
            this.y += (this.targetY - this.y) * 0.15;
            this.currentLayer = this.y > 1.5 ? 1 : 0;
        }

        // Mise à jour mesh 3D (avec élévation + hauteur du saut)
        this.mesh.position.set(this.x, this.y + this.jumpHeight, this.z);
        this.mesh.rotation.y = this.angle;

        // Inclinaison selon la pente du terrain (désactivé sur mobile : 4x boucles O(n) par frame)
        if (!this._skipSlope && track.is3DReliefEnabled && track.is3DReliefEnabled() && track.getSlopeAt) {
            const slope = track.getSlopeAt(this.x, this.z, this.angle);
            // Transition douce vers l'inclinaison cible
            this.pitch += (slope.pitch - this.pitch) * 0.15;
            this.slopeRoll += (slope.roll - this.slopeRoll) * 0.15;
        }

        // Appliquer le pitch (inclinaison avant/arrière due aux pentes)
        this.mesh.rotation.x = this.pitch;

        // Tilt style Mario Kart (inclinaison dans les virages)
        // Plus fort pendant le drift
        const tiltMultiplier = this.isDrifting ? 12 : 8;
        const targetTilt = -this.angularVelocity * tiltMultiplier;
        this.tilt += (targetTilt - this.tilt) * 0.2;  // Lissage

        // Combiner le tilt de virage avec l'inclinaison latérale de la pente
        this.mesh.rotation.z = this.tilt + this.slopeRoll;

        Kart.updateWheelRotation(this.mesh, this.speed);
        Kart.updateFrontWheelSteering(this.mesh, -this.angularVelocity * 12);
        
        // Checkpoints (seulement si pas fini)
        if (!this.finished) {
            this.checkCheckpoint(track.checkpointZones, onCheckpoint, onLapComplete, onFinish);

            // Progress
            this.raceProgress = this.currentLap * 1000 + this.currentCheckpoint * 100 +
                physics.getDistanceToNextCheckpoint(this, track.checkpointZones);
        }
    }
    
    checkCheckpoint(checkpointZones, onCheckpoint, onLapComplete, onFinish) {
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

        if (perpDist < cp.width / 2 && alongDist < 4) {
            this.currentCheckpoint++;
            if (onCheckpoint) onCheckpoint(this.currentCheckpoint);

            if (this.currentCheckpoint >= checkpointZones.length) {
                this.currentCheckpoint = 0;
                this.currentLap++;

                // Temps du tour
                const lapTime = Date.now() - this.lapStartTime;
                this.lapTimes.push(lapTime);
                if (!this.bestLapTime || lapTime < this.bestLapTime) {
                    this.bestLapTime = lapTime;
                }
                this.lapStartTime = Date.now();

                if (onLapComplete) onLapComplete(this.currentLap);

                if (this.currentLap >= CONFIG.race.totalLaps) {
                    this.finished = true;
                    if (onFinish) onFinish();
                }
            }
        }
    }
    
    // Déclencher un saut de tremplin
    launch(power) {
        if (this.airborne) return; // Déjà en l'air
        if (Math.abs(this.speed) < CONFIG.ramp.minSpeedToLaunch) return; // Trop lent
        this.airborne = true;
        this.airborneVelocityY = power || CONFIG.ramp.launchPower;
    }

    triggerDriftBoost() {
        const th = CONFIG.physics.driftBoostThresholds;
        const dur = CONFIG.physics.driftBoostDurations;
        const pow = CONFIG.physics.driftBoostPowers;

        let boostLevel = 0; // 0=rien, 1=bleu, 2=orange, 3=violet

        if (this.driftTime >= th.purple) {
            boostLevel = 3;
            this.boostTime = dur.purple;
            this.boostPower = pow.purple;
        } else if (this.driftTime >= th.orange) {
            boostLevel = 2;
            this.boostTime = dur.orange;
            this.boostPower = pow.orange;
        } else if (this.driftTime >= th.blue) {
            boostLevel = 1;
            this.boostTime = dur.blue;
            this.boostPower = pow.blue;
        }

        // Système de combo
        if (boostLevel > 0) {
            this.driftCombo++;
            this.comboTimer = 120; // ~2 secondes pour enchaîner le prochain drift
            this.lastDriftBoostLevel = boostLevel;

            // Bonus de combo: +5% puissance et +10% durée par combo (max +50%)
            const comboMultiplier = Math.min(1 + (this.driftCombo - 1) * 0.05, 1.5);
            const durationMultiplier = Math.min(1 + (this.driftCombo - 1) * 0.1, 1.5);

            this.boostPower *= comboMultiplier;
            this.boostTime *= durationMultiplier;
        } else {
            // Drift raté = reset du combo
            this.driftCombo = 0;
            this.lastDriftBoostLevel = 0;
        }
    }
    
    applyTurboStart() {
        this.speed = 1.5;
        this.boostTime = 65;
        this.boostPower = 1.4;
        this.isTurboStartFlash = true;
    }
}
