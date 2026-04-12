// ============================================================
// UI - Interface utilisateur
// ============================================================

import { CONFIG } from './config.js';
import { formatTime } from './utils.js';
import { getMedalTimes, getMedalDisplay } from './scores.js';

export class UI {
    constructor() {
        this.elements = {
            titleScreen: document.getElementById('titleScreen'),
            hud: document.getElementById('hud'),
            controlsHelp: document.getElementById('controlsHelp'),
            minimapContainer: document.getElementById('minimapContainer'),
            speedValue: document.getElementById('speedValue'),
            currentLap: document.getElementById('currentLap'),
            raceTime: document.getElementById('raceTime'),
            bestLap: document.getElementById('bestLap'),
            positionValue: document.getElementById('positionValue'),
            driftIndicator: document.getElementById('driftIndicator'),
            slipstreamIndicator: document.getElementById('slipstreamIndicator'),
            countdownOverlay: document.getElementById('countdownOverlay'),
            countdownText: document.getElementById('countdownText'),
            notification: document.getElementById('notification'),
            celebrationBanner: document.getElementById('celebrationBanner'),
            celebrationText: document.getElementById('celebrationText'),
            resultOverlay: document.getElementById('resultOverlay'),
            resultTitle: document.getElementById('resultTitle'),
            resultTime: document.getElementById('resultTime'),
            resultBestLap: document.getElementById('resultBestLap'),
            resultNewRecord: document.getElementById('resultNewRecord'),
            standingsBody: document.getElementById('standingsBody'),
            titleBestTimes: document.getElementById('titleBestTimes'),
            minimapCanvas: document.getElementById('minimapCanvas'),
            // Effets de vitesse
            speedVignette: document.getElementById('speedVignette'),
            speedLinesLeft: document.getElementById('speedLinesLeft'),
            speedLinesRight: document.getElementById('speedLinesRight'),
            chromaticAberration: document.getElementById('chromaticAberration'),
            boostFlash: document.getElementById('boostFlash'),
            heatHaze: document.getElementById('heatHaze'),
            // Item display
            itemDisplay: document.getElementById('itemDisplay'),
            itemBox: document.getElementById('itemBox'),
            itemIcon: document.getElementById('itemIcon'),
            itemRouletteContainer: document.getElementById('itemRouletteContainer'),
            itemRouletteStrip: document.getElementById('itemRouletteStrip'),
            itemHint: document.getElementById('itemHint'),
            // Race finished banner
            raceFinishedBanner: document.getElementById('raceFinishedBanner'),
            bannerText: document.getElementById('bannerText'),
            forfeitButton: document.getElementById('forfeitButton'),
            // Combo drift
            driftCombo: document.getElementById('driftCombo'),
            comboCount: document.getElementById('comboCount'),
            // Medal system
            medalTarget: document.getElementById('medalTarget'),
            resultMedal: document.getElementById('resultMedal'),
            medalEmoji: document.getElementById('medalEmoji'),
            medalLabel: document.getElementById('medalLabel'),
            // AI emoji reaction
            aiEmoji: document.getElementById('aiEmoji'),
            // Player emoji reaction
            playerEmoji: document.getElementById('playerEmoji'),
            // Result stats
            resultDelta: document.getElementById('resultDelta'),
            deltaValue: document.getElementById('deltaValue'),
            resultTimeline: document.getElementById('resultTimeline'),
            timelineTrack: document.getElementById('timelineTrack'),
            legendLead: document.getElementById('legendLead'),
            resultStats: document.getElementById('resultStats'),
            totalLaps: document.getElementById('totalLaps')
        };

        // Synchroniser le nombre de tours depuis la config
        if (this.elements.totalLaps) {
            this.elements.totalLaps.textContent = CONFIG.race.totalLaps;
        }

        // État précédent du combo pour détecter les changements
        this._lastCombo = 0;

        // Icônes des items
        this.itemIcons = {
            'pill_boost': '💊',
            'ball': '🔴',
            'homing_ball': '🎯',
            'slime': '🦠',
            'shield': '🛡️',
            'emp': '⚡'
        };

        this.minimapCtx = this.elements.minimapCanvas?.getContext('2d');

        // Setup menu interactions
        this.setupMenuInteractions();
        this.drawTrackPreviews();
    }

    setupMenuInteractions() {
        // Track card selection
        const trackCards = document.querySelectorAll('.track-card');
        const trackSelect = document.getElementById('trackSelect');

        trackCards.forEach(card => {
            card.addEventListener('click', () => {
                trackCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                if (trackSelect) {
                    trackSelect.value = card.dataset.track;
                }
            });
        });

        // Difficulty selection
        const diffOptions = document.querySelectorAll('.diff-option');
        const diffSelect = document.getElementById('difficultySelect');

        diffOptions.forEach(option => {
            option.addEventListener('click', () => {
                diffOptions.forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                if (diffSelect) {
                    diffSelect.value = option.dataset.diff;
                }
            });
        });
    }

    drawTrackPreviews() {
        // Draw oval track preview
        const ovalCanvas = document.getElementById('previewOval');
        if (ovalCanvas) {
            const ctx = ovalCanvas.getContext('2d');
            this.drawOvalPreview(ctx, ovalCanvas.width, ovalCanvas.height);
        }

        // Draw infini track preview
        const infiniCanvas = document.getElementById('previewInfini');
        if (infiniCanvas) {
            const ctx = infiniCanvas.getContext('2d');
            this.drawInfiniPreview(ctx, infiniCanvas.width, infiniCanvas.height);
        }

        // Draw volcan track preview
        const volcanCanvas = document.getElementById('previewVolcan');
        if (volcanCanvas) {
            const ctx = volcanCanvas.getContext('2d');
            this.drawVolcanPreview(ctx, volcanCanvas.width, volcanCanvas.height);
        }
    }

    drawOvalPreview(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        const cx = w / 2;
        const cy = h / 2;
        const rx = w * 0.4;
        const ry = h * 0.35;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    drawInfiniPreview(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        const cx = w / 2;
        const cy = h / 2;
        const size = Math.min(w, h) * 0.35;

        // Draw figure 8 / infinity symbol
        ctx.beginPath();
        for (let t = 0; t <= Math.PI * 2; t += 0.05) {
            const x = cx + size * Math.sin(t);
            const y = cy + size * 0.5 * Math.sin(2 * t);
            if (t === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();
    }

    drawVolcanPreview(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        // Dessiner un tracé simplifié : lacets + saut
        ctx.beginPath();
        // Départ en bas au centre
        ctx.moveTo(w * 0.5, h * 0.9);
        // Vers la gauche (approche montagne)
        ctx.lineTo(w * 0.2, h * 0.75);
        // Lacets (zigzag)
        ctx.lineTo(w * 0.1, h * 0.6);
        ctx.lineTo(w * 0.35, h * 0.5);
        ctx.lineTo(w * 0.1, h * 0.4);
        ctx.lineTo(w * 0.35, h * 0.3);
        // Sommet
        ctx.lineTo(w * 0.5, h * 0.1);
        ctx.lineTo(w * 0.7, h * 0.1);
        // Canyon (ligne pointillée implicite par le tracé)
        ctx.lineTo(w * 0.85, h * 0.25);
        // Descente
        ctx.lineTo(w * 0.8, h * 0.5);
        ctx.lineTo(w * 0.7, h * 0.7);
        ctx.lineTo(w * 0.5, h * 0.9);
        ctx.stroke();

        // Marquer le canyon avec un petit gap
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(w * 0.85, h * 0.25);
        ctx.lineTo(w * 0.88, h * 0.35);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ============================================================
    // EMOJI RÉACTION IA
    // ============================================================

    showAIEmoji(emoji, ai, camera) {
        if (!this.elements.aiEmoji) return;

        // Projeter la position 3D de l'IA sur l'écran 2D
        const vector = new THREE.Vector3(ai.x, ai.y + 6, ai.z);
        vector.project(camera);

        // Convertir en coordonnées écran
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

        // Vérifier si l'IA est devant la caméra
        if (vector.z > 1) {
            this.elements.aiEmoji.classList.remove('active');
            return;
        }

        this.elements.aiEmoji.textContent = emoji;
        this.elements.aiEmoji.style.left = x + 'px';
        this.elements.aiEmoji.style.top = y + 'px';
        this.elements.aiEmoji.classList.add('active');
    }

    hideAIEmoji() {
        if (this.elements.aiEmoji) {
            this.elements.aiEmoji.classList.remove('active');
        }
    }

    showPlayerEmoji(emoji, player, camera) {
        if (!this.elements.playerEmoji) return;

        // Projeter la position 3D du joueur sur l'écran 2D
        const vector = new THREE.Vector3(player.x, player.y + 6, player.z);
        vector.project(camera);

        // Convertir en coordonnées écran
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

        // Vérifier si le joueur est devant la caméra
        if (vector.z > 1) {
            this.elements.playerEmoji.classList.remove('active');
            return;
        }

        this.elements.playerEmoji.textContent = emoji;
        this.elements.playerEmoji.style.left = x + 'px';
        this.elements.playerEmoji.style.top = y + 'px';
        this.elements.playerEmoji.classList.add('active');
    }

    hidePlayerEmoji() {
        if (this.elements.playerEmoji) {
            this.elements.playerEmoji.classList.remove('active');
        }
    }

    updateMenuFocus(section) {
        // section: 0 = name, 1 = tracks, 2 = difficulty, 3 = start, 4 = stats

        // Retirer le focus de tous les éléments
        document.querySelectorAll('.player-name-input').forEach(el => el.classList.remove('focused'));
        document.querySelectorAll('.track-cards').forEach(el => el.classList.remove('focused'));
        document.querySelectorAll('.difficulty-slider').forEach(el => el.classList.remove('focused'));
        document.querySelectorAll('.start-btn').forEach(el => el.classList.remove('focused'));
        document.querySelectorAll('.stats-btn').forEach(el => el.classList.remove('focused'));

        // Ajouter le focus à la section active
        if (section === 0) {
            document.querySelector('.player-name-input')?.classList.add('focused');
        } else if (section === 1) {
            document.querySelector('.track-cards')?.classList.add('focused');
        } else if (section === 2) {
            document.querySelector('.difficulty-slider')?.classList.add('focused');
        } else if (section === 3) {
            document.querySelector('.start-btn')?.classList.add('focused');
        } else if (section === 4) {
            document.querySelector('.stats-btn')?.classList.add('focused');
        }
    }

    updateMenuRecords(scoreManager) {
        const laps = CONFIG.race.totalLaps;

        const updateCard = (track, medalId, recordId) => {
            const record = scoreManager.getTrackRecord('normal', track, laps);
            const medalEl = document.getElementById(medalId);
            const recordEl = document.getElementById(recordId);
            if (!medalEl || !recordEl) return;

            if (record.medal) {
                const display = getMedalDisplay(record.medal);
                medalEl.textContent = display.emoji;
                medalEl.style.display = '';
            } else {
                medalEl.style.display = 'none';
            }
            if (record.bestTime) {
                recordEl.textContent = formatTime(record.bestTime);
                recordEl.style.display = '';
            } else {
                recordEl.style.display = 'none';
            }
        };

        updateCard('oval', 'medalOval', 'recordOval');
        updateCard('infini', 'medalInfini', 'recordInfini');
        updateCard('volcan', 'medalVolcan', 'recordVolcan');
    }
    
    showTitleScreen() {
        this.elements.titleScreen.classList.remove('hidden');
        this.elements.hud.style.display = 'none';
        this.elements.controlsHelp.style.display = 'none';
        this.elements.minimapContainer.style.display = 'none';
    }

    hideTitleScreen() {
        this.elements.titleScreen.classList.add('hidden');
        this.elements.hud.style.display = 'block';
        this.elements.controlsHelp.style.display = 'block';
        this.elements.minimapContainer.style.display = 'block';
    }
    
    update(player, ai, slipstream) {
        // Vitesse — seulement si changée
        const speed = Math.round(Math.abs(player.speed) * 100);
        if (speed !== this._lastSpeed) {
            this.elements.speedValue.textContent = speed;
            this._lastSpeed = speed;
        }

        // Tour — seulement si changé
        const lap = Math.min(player.currentLap + 1, CONFIG.race.totalLaps);
        if (lap !== this._lastLap) {
            this.elements.currentLap.textContent = lap;
            this._lastLap = lap;
        }

        // Temps
        const timeStr = formatTime(player.raceTime);
        if (timeStr !== this._lastTimeStr) {
            this.elements.raceTime.textContent = timeStr;
            this._lastTimeStr = timeStr;
        }

        // Meilleur tour — seulement si changé
        if (player.bestLapTime !== this._lastBestLap) {
            if (player.bestLapTime) {
                this.elements.bestLap.textContent = 'Best: ' + formatTime(player.bestLapTime);
                this.elements.bestLap.style.color = '#2ecc40';
            } else {
                this.elements.bestLap.textContent = '';
            }
            this._lastBestLap = player.bestLapTime;
        }

        // Position — seulement si changée
        const pos = this.getPosition(player, ai);
        if (pos !== this._lastPos) {
            this.elements.positionValue.textContent = pos === 1 ? 'P1' : 'P2';
            this.elements.positionValue.className = 'position-badge-mini' + (pos === 2 ? ' second' : '');
            this._lastPos = pos;
        }
        
        // Indicateur de drift
        this.updateDriftIndicator(player);

        // Combo drift
        this.updateCombo(player);

        // Indicateur de slipstream
        this.updateSlipstreamIndicator(slipstream);

        // Effets de vitesse (style F-Zero)
        this.updateSpeedEffects(player);

        // Affichage de l'item actuel
        this.updateItemDisplay(player);

        // Dernier tour - teinte rouge tension (cache les éléments parents)
        const isFinalLap = player.currentLap === CONFIG.race.totalLaps - 1;
        if (!this._hudCentral) {
            this._hudCentral = this.elements.currentLap?.closest('.hud-central');
            this._hudSpeed = this.elements.speedValue?.closest('.hud-speed');
        }
        if (this._hudCentral) this._hudCentral.classList.toggle('final-lap', isFinalLap);
        if (this._hudSpeed) this._hudSpeed.classList.toggle('final-lap', isFinalLap);
    }
    
    getPosition(player, ai) {
        if (player.finished && !ai.finished) return 1;
        if (ai.finished && !player.finished) return 2;
        return player.raceProgress >= ai.raceProgress ? 1 : 2;
    }
    
    updateDriftIndicator(player) {
        const th = CONFIG.physics.driftBoostThresholds;
        const di = this.elements.driftIndicator;

        // Cache les éléments .fill (évite querySelector chaque frame)
        if (!this._driftFills) {
            this._driftFills = [
                di.children[0].querySelector('.fill'),
                di.children[1].querySelector('.fill'),
                di.children[2].querySelector('.fill')
            ];
        }

        if (player.isDrifting) {
            di.classList.add('active');
            this._driftFills[0].style.width = Math.min(player.driftTime / th.blue, 1) * 100 + '%';
            this._driftFills[1].style.width = (player.driftTime >= th.blue ? Math.min((player.driftTime - th.blue) / (th.orange - th.blue), 1) * 100 : 0) + '%';
            this._driftFills[2].style.width = (player.driftTime >= th.orange ? Math.min((player.driftTime - th.orange) / (th.purple - th.orange), 1) * 100 : 0) + '%';
        } else {
            di.classList.remove('active');
        }
    }

    updateCombo(player) {
        const combo = this.elements.driftCombo;
        const count = this.elements.comboCount;

        if (!combo || !count) return;

        // Afficher le combo seulement si > 1
        if (player.driftCombo > 1) {
            combo.classList.add('active');
            count.textContent = `x${player.driftCombo}`;

            // Pulse quand le combo augmente
            if (player.driftCombo > this._lastCombo) {
                combo.classList.remove('pulse');
                void combo.offsetWidth; // Force reflow
                combo.classList.add('pulse');
            }

            // Couleur selon le niveau de combo
            combo.classList.remove('combo-2', 'combo-3', 'combo-4', 'combo-5');
            if (player.driftCombo >= 5) {
                combo.classList.add('combo-5');
            } else if (player.driftCombo >= 4) {
                combo.classList.add('combo-4');
            } else if (player.driftCombo >= 3) {
                combo.classList.add('combo-3');
            } else {
                combo.classList.add('combo-2');
            }
        } else {
            combo.classList.remove('active', 'combo-2', 'combo-3', 'combo-4', 'combo-5');
        }

        this._lastCombo = player.driftCombo;
    }

    updateSlipstreamIndicator(slipstream) {
        const si = this.elements.slipstreamIndicator;

        // Cache le .fill (évite querySelector chaque frame)
        if (!this._slipFill) this._slipFill = si.querySelector('.fill');

        if (slipstream.charge > 10) {
            si.classList.add('active');
            this._slipFill.style.width = slipstream.charge + '%';
        } else {
            si.classList.remove('active');
        }
    }

    updateSpeedEffects(player) {
        // Sur mobile : désactiver les effets de vitesse (overlays CSS coûteux)
        if (this._isMobile === undefined) this._isMobile = 'ontouchstart' in window;
        if (this._isMobile) return;
        const maxSpeed = CONFIG.physics.maxSpeed;
        const boostMaxSpeed = CONFIG.physics.boostMaxSpeed;
        const speed = Math.abs(player.speed);

        // Calculer l'intensité (0 à 1) basée sur la vitesse
        // Commence à 40% de la vitesse max, plein effet à vitesse max
        const threshold = maxSpeed * 0.4;
        const intensity = Math.max(0, Math.min(1, (speed - threshold) / (maxSpeed - threshold)));

        // Détecter si on est en boost (item ou turbo start)
        const isBoosting = player.boostTime > 0;

        // Intensité boost (encore plus fort pendant le boost)
        const boostIntensity = isBoosting ? Math.min(1, speed / boostMaxSpeed) : intensity;

        // Vignette - progressive avec la vitesse, plus intense pendant le boost
        if (this.elements.speedVignette) {
            const vignetteOpacity = isBoosting ? 0.7 : intensity * 0.6;
            this.elements.speedVignette.style.opacity = vignetteOpacity;
        }

        // Chromatic aberration - progressive dès 40% vitesse
        if (this.elements.chromaticAberration) {
            const chromaOpacity = isBoosting ? 0.9 : intensity * 0.8;
            this.elements.chromaticAberration.style.opacity = chromaOpacity;
        }

        // Lignes de vitesse - progressives dès 70% vitesse, plein effet en boost
        if (this.elements.speedLinesLeft) {
            const speedLineThreshold = maxSpeed * 0.7;
            const lineIntensity = Math.max(0, Math.min(1, (speed - speedLineThreshold) / (maxSpeed - speedLineThreshold)));
            const lineOpacity = isBoosting ? 0.8 : lineIntensity * 0.5;
            this.elements.speedLinesLeft.style.opacity = lineOpacity;
        }
        if (this.elements.speedLinesRight) {
            const speedLineThreshold = maxSpeed * 0.7;
            const lineIntensity = Math.max(0, Math.min(1, (speed - speedLineThreshold) / (maxSpeed - speedLineThreshold)));
            const lineOpacity = isBoosting ? 0.8 : lineIntensity * 0.5;
            this.elements.speedLinesRight.style.opacity = lineOpacity;
        }

        // Heat haze - subtile distorsion à haute vitesse
        if (this.elements.heatHaze) {
            const hazeThreshold = maxSpeed * 0.75;
            if (speed > hazeThreshold) {
                const hazeIntensity = Math.min(1, (speed - hazeThreshold) / (maxSpeed - hazeThreshold));
                this.elements.heatHaze.style.opacity = hazeIntensity * 0.4;
                this.elements.heatHaze.classList.add('active');
            } else {
                this.elements.heatHaze.style.opacity = 0;
                this.elements.heatHaze.classList.remove('active');
            }
        }

        // Flash au Turbo Start ou au boost item
        if (this.elements.boostFlash && (player.isTurboStartFlash || player.isItemBoostFlash)) {
            this.elements.boostFlash.classList.remove('active');
            void this.elements.boostFlash.offsetWidth; // Force reflow
            this.elements.boostFlash.classList.add('active');
            player.isTurboStartFlash = false;
            player.isItemBoostFlash = false;
        }
    }

    // Flash écran coloré (green = positif, red = négatif)
    triggerFlash(color = 'default') {
        if (!this.elements.boostFlash) return;

        // Retirer toutes les classes de couleur
        this.elements.boostFlash.classList.remove('active', 'green', 'red');
        void this.elements.boostFlash.offsetWidth; // Force reflow

        // Ajouter la classe de couleur si spécifiée
        if (color === 'green' || color === 'red') {
            this.elements.boostFlash.classList.add(color);
        }

        this.elements.boostFlash.classList.add('active');
    }

    startItemRoulette(onAutoStop = null) {
        // Nettoyer une roulette précédente
        this._cleanupRoulette();

        const strip = this.elements.itemRouletteStrip;
        if (!strip) return;

        // Construire la bande : 6 items x 8 répétitions pour un scroll fluide
        const items = Object.entries(this.itemIcons);
        const repeats = 8;
        strip.innerHTML = '';
        for (let r = 0; r < repeats; r++) {
            items.forEach(([key, icon]) => {
                const span = document.createElement('span');
                span.className = 'roulette-item';
                span.textContent = icon;
                span.dataset.item = key;
                strip.appendChild(span);
            });
        }

        const itemHeight = 64;
        const cycleHeight = items.length * itemHeight;
        const centerOffset = (70 - itemHeight) / 2;

        this.elements.itemBox?.classList.add('has-item', 'roulette');
        this.elements.itemDisplay?.classList.add('has-item');
        if (this.elements.itemHint) {
            this.elements.itemHint.textContent = 'APPUIE A';
        }

        // État de la roulette
        this._roulette = {
            running: true,
            items: items,
            itemHeight: itemHeight,
            cycleHeight: cycleHeight,
            centerOffset: centerOffset,
            position: 0,
            animId: null,
            timeoutId: null,
            onAutoStop: onAutoStop
        };

        const r = this._roulette;
        const speed = 5;

        const animate = () => {
            if (!r.running) return;
            r.position -= speed;
            if (r.position < 0) {
                r.position += cycleHeight;
            }
            strip.style.transform = `translateY(${-r.position + centerOffset}px)`;
            r.animId = requestAnimationFrame(animate);
        };
        r.animId = requestAnimationFrame(animate);

        // Timeout 5s
        r.timeoutId = setTimeout(() => {
            if (!r.running) return;
            const chosenItem = this.stopItemRoulette();
            if (chosenItem && r.onAutoStop) {
                r.onAutoStop(chosenItem);
            }
        }, 5000);
    }

    _cleanupRoulette() {
        if (!this._roulette) return;
        const r = this._roulette;
        r.running = false;
        if (r.animId) cancelAnimationFrame(r.animId);
        if (r.timeoutId) clearTimeout(r.timeoutId);
        this._roulette = null;
        this.elements.itemBox?.classList.remove('roulette', 'roulette-done');
        if (this.elements.itemHint) {
            this.elements.itemHint.textContent = 'ESPACE';
        }
    }

    stopItemRoulette() {
        const r = this._roulette;
        if (!r || !r.running) return null;

        // Stopper l'animation
        r.running = false;
        if (r.animId) cancelAnimationFrame(r.animId);
        if (r.timeoutId) clearTimeout(r.timeoutId);

        // Déterminer l'item le plus proche du centre de la box
        // La box fait 70px, un item 64px, le centre visuel est à position + 0 (le translateY = -position + centerOffset)
        // L'item centré est celui dont l'index * itemHeight est le plus proche de position
        const rawIndex = Math.round(r.position / r.itemHeight);
        const indexInCycle = ((rawIndex % r.items.length) + r.items.length) % r.items.length;
        const chosenItem = r.items[indexInCycle];

        // Snapper visuellement sur cet item exactement
        const strip = this.elements.itemRouletteStrip;
        if (strip) {
            const snapPos = indexInCycle * r.itemHeight;
            strip.style.transform = `translateY(${-snapPos + r.centerOffset}px)`;
        }

        // Transition : garder le visuel roulette 300ms puis basculer vers l'icône statique
        this._rouletteTransition = true;
        setTimeout(() => {
            this._rouletteTransition = false;
            this._roulette = null;
            this.elements.itemBox?.classList.remove('roulette');
            this.elements.itemBox?.classList.add('roulette-done');
            if (this.elements.itemIcon) {
                this.elements.itemIcon.textContent = chosenItem[1];
            }
            if (this.elements.itemHint) {
                this.elements.itemHint.textContent = 'ESPACE';
            }
            setTimeout(() => {
                this.elements.itemBox?.classList.remove('roulette-done');
            }, 300);
        }, 300);

        return chosenItem[0];
    }

    isRouletteSpinning() {
        return !!(this._roulette && this._roulette.running);
    }

    updateItemDisplay(player) {
        if (!this.elements.itemBox || !this.elements.itemIcon || !this.elements.itemDisplay) return;

        // Ne pas toucher à l'affichage si la roulette tourne ou est en transition
        if (this._roulette || this._rouletteTransition) return;

        if (player.currentItem && player.currentItem !== 'none') {
            this.elements.itemDisplay.classList.add('has-item');
            this.elements.itemBox.classList.add('has-item');
            this.elements.itemIcon.textContent = this.itemIcons[player.currentItem] || '?';

            // Ajouter classe spécifique pour la couleur
            this.elements.itemBox.className = 'item-box has-item ' + player.currentItem;
        } else {
            this.elements.itemDisplay.classList.remove('has-item');
            this.elements.itemBox.classList.remove('has-item');
            this.elements.itemBox.className = 'item-box';
            this.elements.itemIcon.textContent = '';
        }

        // Effet visuel si bouclier actif
        if (player.shieldTime > 0) {
            this.elements.itemBox.classList.add('shield-active');
        } else {
            this.elements.itemBox.classList.remove('shield-active');
        }
    }

    showCountdown(number, color = '#fff') {
        this.elements.countdownOverlay.classList.add('active');
        this.elements.countdownText.textContent = number;
        this.elements.countdownText.style.color = color;
    }
    
    hideCountdown() {
        this.elements.countdownOverlay.classList.remove('active');
    }
    
    showFinalLap() {
        const banner = document.getElementById('finalLapBanner');
        if (!banner) return;
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show');
    }

    showNotification(text) {
        const n = this.elements.notification;
        n.textContent = text;
        n.classList.remove('show');
        void n.offsetWidth; // Force reflow
        n.classList.add('show');
    }
    
    showResult(isWin, time, bestLapTime, recordResult, standings = null, extraData = null) {
        // Ambiance visuelle selon la performance
        const overlay = this.elements.resultOverlay;
        overlay.classList.remove('result-gold', 'result-silver', 'result-bronze', 'result-loss');
        overlay.classList.add('active');

        // Appliquer la teinte de fond basée sur la médaille
        if (extraData?.medal) {
            overlay.classList.add(`result-${extraData.medal}`);
        } else if (!isWin) {
            overlay.classList.add('result-loss');
        }

        this.elements.resultTitle.textContent = isWin ? '🏆 1ER!' : '2ÈME';
        this.elements.resultTitle.className = 'result-title ' + (isWin ? 'win' : 'lose');

        // Afficher le delta vs record
        this.renderDelta(time, extraData?.previousRecord);

        // Afficher la timeline des dépassements
        if (extraData?.stats) {
            this.renderTimeline(extraData.stats, extraData.playerName, extraData.aiName);
            this.renderStats(extraData.stats);

            // Marqueurs de tours sur la timeline
            if (extraData.lapTimes && extraData.lapTimes.length > 1 && extraData.stats.totalRaceTime) {
                const timelineBar = document.querySelector('.timeline-bar');
                if (timelineBar) {
                    let cumulative = 0;
                    for (let i = 0; i < extraData.lapTimes.length - 1; i++) {
                        cumulative += extraData.lapTimes[i];
                        const pct = (cumulative / extraData.stats.totalRaceTime) * 100;
                        const marker = document.createElement('div');
                        marker.className = 'timeline-lap-marker';
                        marker.style.left = `${pct}%`;
                        timelineBar.appendChild(marker);
                    }
                }
            }
        }

        // Générer le tableau des classements
        if (this.elements.standingsBody && standings && standings.length > 0) {
            this.renderStandings(standings);
        }

        // Afficher les splits par tour
        if (extraData?.lapTimes) {
            this.renderLapTimes(extraData.lapTimes);
        }

        // Afficher le top 5
        if (extraData?.top5) {
            this.renderTop5(extraData.top5);
        }

        // Afficher si nouveau record ou nouvelle médaille
        if (this.elements.resultNewRecord && recordResult) {
            const messages = [];

            if (recordResult.newMedal) {
                messages.push('<div class="record-msg record-medal">🏅 NOUVELLE MÉDAILLE!</div>');
            }
            if (recordResult.newTrackRecord) {
                messages.push('<div class="record-msg record-best">⭐ NOUVEAU RECORD!</div>');
            } else if (recordResult.newBestRace) {
                messages.push('<div class="record-msg record-best">⭐ NOUVEAU RECORD COURSE!</div>');
            }
            if (recordResult.newBestLap) {
                messages.push('<div class="record-msg record-lap">🔥 MEILLEUR TOUR!</div>');
            }

            if (messages.length > 0) {
                this.elements.resultNewRecord.innerHTML = messages.join('');
                this.elements.resultNewRecord.classList.add('visible-records');
            } else {
                this.elements.resultNewRecord.classList.remove('visible-records');
            }
        }

        // L'apparition progressive est gérée par CSS animations (result-overlay.active .result-section)
    }

    renderDelta(currentTime, previousRecord) {
        const deltaValue = document.getElementById('deltaValue');
        const deltaLabel = document.querySelector('.result-delta .delta-label');
        const resultDelta = document.getElementById('resultDelta');

        if (!deltaValue || !resultDelta) return;

        if (!previousRecord) {
            deltaValue.textContent = 'Premier temps!';
            deltaValue.className = 'delta-value no-record';
            deltaLabel.style.display = 'none';
        } else {
            const delta = currentTime - previousRecord;
            const sign = delta >= 0 ? '+' : '-';
            deltaValue.textContent = `${sign}${formatTime(Math.abs(delta))}`;
            deltaValue.className = 'delta-value ' + (delta < 0 ? 'negative' : 'positive');
            deltaLabel.style.display = 'block';
        }
    }

    renderTimeline(stats, playerName, aiName) {
        const timelineTrack = document.getElementById('timelineTrack');
        const legendLead = document.getElementById('legendLead');

        if (!timelineTrack || !stats.totalRaceTime) return;

        // Calculer les segments basés sur les dépassements
        const segments = [];
        let lastTime = 0;
        let playerLeading = true; // Le joueur commence devant (position grille)

        // Ajouter les segments basés sur les dépassements
        stats.overtakes.forEach(overtake => {
            if (overtake.time > lastTime) {
                segments.push({
                    start: lastTime,
                    end: overtake.time,
                    isPlayer: playerLeading
                });
                lastTime = overtake.time;
                playerLeading = overtake.playerOvertook;
            }
        });

        // Ajouter le dernier segment jusqu'à la fin
        segments.push({
            start: lastTime,
            end: stats.totalRaceTime,
            isPlayer: playerLeading
        });

        // Générer le HTML des segments
        let html = '';
        segments.forEach(seg => {
            const widthPercent = ((seg.end - seg.start) / stats.totalRaceTime) * 100;
            if (widthPercent < 0.5) return; // Ignorer les segments trop petits
            const className = seg.isPlayer ? 'player' : 'ai';
            html += `<div class="timeline-segment ${className}" style="width: ${widthPercent}%"></div>`;
        });

        timelineTrack.innerHTML = html;

        // Mettre à jour la légende
        if (legendLead) {
            const leadPercent = Math.round((stats.leadTime / stats.totalRaceTime) * 100);
            legendLead.textContent = `En tête: ${leadPercent}%`;
            legendLead.style.color = leadPercent >= 50 ? '#2ecc40' : '#e74c3c';
        }
    }

    renderStats(stats) {
        // Drift stats
        const statBestDrift = document.getElementById('statBestDrift');
        const statBestCombo = document.getElementById('statBestCombo');

        if (statBestDrift) {
            // Convertir frames en secondes (60fps)
            const driftSeconds = (stats.bestDriftTime / 60).toFixed(1);
            statBestDrift.textContent = `${driftSeconds}s`;
            if (stats.bestDriftTime > 120) { // Plus de 2 secondes
                statBestDrift.classList.add('highlight');
            }
        }

        if (statBestCombo) {
            statBestCombo.textContent = stats.bestCombo > 0 ? `x${stats.bestCombo}` : '-';
            if (stats.bestCombo >= 3) {
                statBestCombo.classList.add('highlight');
            }
        }

        // Item stats
        const statItems = document.getElementById('statItems');
        const statHits = document.getElementById('statHits');

        if (statItems) {
            statItems.textContent = `${stats.itemsUsed}/${stats.itemsPicked}`;
        }

        if (statHits) {
            statHits.textContent = `${stats.hitsGiven}/${stats.hitsReceived}`;
            if (stats.hitsGiven > stats.hitsReceived) {
                statHits.classList.add('highlight');
            }
        }
    }

    renderLapTimes(lapTimes) {
        const container = document.getElementById('lapsList');
        if (!container || !lapTimes || lapTimes.length === 0) return;

        const bestLap = Math.min(...lapTimes);
        let html = '';
        lapTimes.forEach((time, i) => {
            const isBest = time === bestLap;
            html += `<div class="lap-entry${isBest ? ' best' : ''}">
                <span class="lap-num">T${i + 1}</span>
                <span class="lap-time">${formatTime(time)}</span>
                ${isBest ? '<span class="lap-badge">BEST</span>' : ''}
            </div>`;
        });
        container.innerHTML = html;
    }

    renderTop5(top5) {
        const container = document.getElementById('top5List');
        if (!container) return;

        if (!top5 || top5.length === 0) {
            container.innerHTML = '<div class="top5-empty">Aucun temps</div>';
            return;
        }

        let html = '';
        top5.forEach((entry, i) => {
            const date = new Date(entry.date);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
            const medalEmoji = entry.medal === 'gold' ? '🥇' : entry.medal === 'silver' ? '🥈' : '🥉';
            html += `<div class="top5-entry${i === 0 ? ' first' : ''}">
                <span class="top5-rank">#${i + 1}</span>
                <span class="top5-time">${formatTime(entry.time)}</span>
                <span class="top5-medal">${medalEmoji}</span>
                <span class="top5-date">${dateStr}</span>
            </div>`;
        });
        container.innerHTML = html;
    }

    renderTrackRecords(trackRecord) {
        const container = document.getElementById('trackRecords');
        if (!container) {
            // Créer le conteneur s'il n'existe pas
            const top5Container = document.getElementById('top5List');
            if (!top5Container) return;
            const div = document.createElement('div');
            div.id = 'trackRecords';
            div.className = 'track-records';
            top5Container.parentElement.appendChild(div);
        }

        const target = document.getElementById('trackRecords');
        if (!trackRecord.bestTime && !trackRecord.bestLap) {
            target.innerHTML = '';
            return;
        }

        let html = '<div class="track-records-title">RECORDS DU CIRCUIT</div>';

        if (trackRecord.bestTime) {
            const holder = trackRecord.recordHolder || 'Joueur';
            html += `<div class="track-record-entry">
                <span class="record-label">Record</span>
                <span class="record-value">${formatTime(trackRecord.bestTime)}</span>
                <span class="record-holder">par ${holder}</span>
            </div>`;
        }

        if (trackRecord.bestLap) {
            const lapHolder = trackRecord.bestLapHolder || 'Joueur';
            html += `<div class="track-record-entry">
                <span class="record-label">Meilleur tour</span>
                <span class="record-value">${formatTime(trackRecord.bestLap)}</span>
                <span class="record-holder">par ${lapHolder}</span>
            </div>`;
        }

        target.innerHTML = html;
    }

    countryToFlag(cc) {
        if (!cc || cc.length !== 2) return '';
        const base = 0x1F1E6 - 65;
        return String.fromCodePoint(cc.charCodeAt(0) + base, cc.charCodeAt(1) + base);
    }

    renderGlobalLeaderboard(entries) {
        const container = document.getElementById('leaderboardList');
        if (!container) return;

        if (!entries || entries.length === 0) {
            container.innerHTML = '<div class="leaderboard-empty">Aucun temps enregistré</div>';
            return;
        }

        const podiumEmojis = ['🥇', '🥈', '🥉'];
        let html = '';
        entries.forEach((entry, i) => {
            const rank = i + 1;
            const emoji = podiumEmojis[i] || `${rank}.`;
            const aiClass = entry.isAI ? ' is-ai' : '';
            const podiumClass = rank <= 3 ? ` podium-${rank}` : '';
            const icon = entry.isAI ? '🤖' : this.countryToFlag(entry.country) || '🏁';

            html += `<div class="lb-entry${podiumClass}${aiClass}">
                <span class="lb-rank">${emoji}</span>
                <span class="lb-icon">${icon}</span>
                <span class="lb-name">${entry.name}</span>
                <span class="lb-time">${formatTime(entry.raceTime)}</span>
            </div>`;
        });
        container.innerHTML = html;
    }

    renderStandings(standings) {
        // standings: [{name, isPlayer, finishTime, bestLapTime, isWinner, didNotFinish, status}]
        // Trier par: gagnant d'abord, puis par temps
        const sorted = [...standings].sort((a, b) => {
            // Le gagnant est toujours premier
            if (a.isWinner && !b.isWinner) return -1;
            if (!a.isWinner && b.isWinner) return 1;
            // Ceux qui ont fini avant ceux qui n'ont pas fini
            if (!a.didNotFinish && b.didNotFinish) return -1;
            if (a.didNotFinish && !b.didNotFinish) return 1;
            // Sinon trier par temps
            const timeA = a.finishTime || Infinity;
            const timeB = b.finishTime || Infinity;
            return timeA - timeB;
        });

        const leaderTime = sorted[0]?.finishTime || 0;

        let html = '';
        sorted.forEach((racer, index) => {
            const position = index + 1;
            const posClass = position <= 3 ? `pos-${position}` : 'pos-other';
            const rowClass = racer.isPlayer ? 'player-row' : '';
            const winnerClass = position === 1 ? 'winner-row' : '';

            // Temps affiché
            let timeText;
            if (racer.didNotFinish && racer.status) {
                timeText = `<span class="dnf-status">${racer.status}</span>`;
            } else if (racer.didNotFinish) {
                timeText = '<span class="dnf-status">DNF</span>';
            } else {
                timeText = formatTime(racer.finishTime);
            }

            // Calcul de l'écart
            let gapText = '';
            if (position === 1) {
                gapText = '<span class="gap-text leader">VAINQUEUR</span>';
            } else if (racer.didNotFinish) {
                gapText = '<span class="gap-text dnf">--</span>';
            } else {
                const gap = racer.finishTime - leaderTime;
                gapText = `<span class="gap-text">+${formatTime(gap)}</span>`;
            }

            html += `
                <tr class="${rowClass} ${winnerClass}">
                    <td class="col-pos">
                        <span class="position-badge ${posClass}">${position}</span>
                    </td>
                    <td class="col-name">${racer.name}</td>
                    <td class="col-time">${timeText}</td>
                    <td class="col-best">${racer.bestLapTime ? formatTime(racer.bestLapTime) : '--:--.--'}</td>
                    <td class="col-gap">${gapText}</td>
                </tr>
            `;
        });

        this.elements.standingsBody.innerHTML = html;
    }

    updateTitleScores(allScores) {
        if (!this.elements.titleBestTimes) return;

        const difficulties = ['easy', 'normal', 'hard'];
        const labels = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

        let html = '';
        for (const diff of difficulties) {
            const scores = allScores[diff];
            if (scores && (scores.bestRaceTime || scores.bestLapTime)) {
                html += `<div class="best-time-row">`;
                html += `<span class="diff-label">${labels[diff]}</span>`;
                if (scores.bestRaceTime) {
                    html += `<span class="time-value">Course: ${formatTime(scores.bestRaceTime)}</span>`;
                }
                if (scores.bestLapTime) {
                    html += `<span class="time-value">Tour: ${formatTime(scores.bestLapTime)}</span>`;
                }
                if (scores.wins > 0) {
                    html += `<span class="wins-value">${scores.wins}/${scores.races} victoires</span>`;
                }
                html += `</div>`;
            }
        }

        this.elements.titleBestTimes.innerHTML = html || '<p class="no-records">Aucun record enregistré</p>';
    }
    
    showCelebration(isWin, isNewRecord = false) {
        const banner = this.elements.celebrationBanner;
        const text = this.elements.celebrationText;
        if (!banner || !text) return;

        let label = isWin ? 'VICTOIRE!' : '2EME';
        if (isNewRecord) label += '\nNOUVEAU RECORD!';
        text.textContent = label;
        text.className = 'celebration-text ' + (isWin ? 'win' : 'lose') + (isNewRecord ? ' new-record' : '');
        banner.classList.remove('fade-out');
        banner.classList.add('active');
    }

    hideCelebration() {
        const banner = this.elements.celebrationBanner;
        if (!banner) return;
        banner.classList.add('fade-out');
        banner.classList.remove('active');
    }

    hideResult() {
        const overlay = this.elements.resultOverlay;
        overlay.classList.remove('active', 'result-gold', 'result-silver', 'result-bronze', 'result-loss');
        if (this.elements.resultBestLap) {
            this.elements.resultBestLap.style.display = 'none';
        }
        if (this.elements.resultNewRecord) {
            this.elements.resultNewRecord.classList.remove('visible-records');
            this.elements.resultNewRecord.innerHTML = '';
        }
        if (this.elements.standingsBody) {
            this.elements.standingsBody.innerHTML = '';
        }
        // Cacher la médaille
        this.hideMedal();

        // Reset laps & top5
        const lapsList = document.getElementById('lapsList');
        if (lapsList) lapsList.innerHTML = '';
        const top5List = document.getElementById('top5List');
        if (top5List) top5List.innerHTML = '';

        // Reset leaderboard
        const lbList = document.getElementById('leaderboardList');
        if (lbList) lbList.innerHTML = '<div class="leaderboard-loading">Chargement...</div>';

        // Reset timeline
        const timelineTrack = document.getElementById('timelineTrack');
        if (timelineTrack) {
            timelineTrack.innerHTML = '';
        }
        // Reset lap markers
        document.querySelectorAll('.timeline-lap-marker').forEach(m => m.remove());

        // Reset stats highlight classes
        const statElements = document.querySelectorAll('.stat-value');
        statElements.forEach(el => el.classList.remove('highlight'));
    }

    showRaceFinishedBanner(winnerName) {
        if (this.elements.raceFinishedBanner) {
            this.elements.bannerText.textContent = `${winnerName} a terminé !`;
            this.elements.raceFinishedBanner.classList.add('active');
        }
    }

    hideRaceFinishedBanner() {
        if (this.elements.raceFinishedBanner) {
            this.elements.raceFinishedBanner.classList.remove('active');
        }
    }

    // ============================================================
    // SYSTÈME DE MÉDAILLES
    // ============================================================

    // Afficher le temps cible pour la médaille d'or
    setMedalTarget(trackType, laps) {
        if (!this.elements.medalTarget) return;

        const { gold } = getMedalTimes(trackType, laps);
        const goldFormatted = formatTime(gold);

        this.elements.medalTarget.innerHTML = `🥇 &lt; ${goldFormatted}`;
        this.elements.medalTarget.style.display = 'block';
    }

    // Cacher le temps cible
    hideMedalTarget() {
        if (this.elements.medalTarget) {
            this.elements.medalTarget.style.display = 'none';
        }
    }

    // Afficher la médaille obtenue dans les résultats
    showMedal(medal) {
        if (!this.elements.resultMedal || !this.elements.medalEmoji || !this.elements.medalLabel) {
            return;
        }

        if (!medal) {
            this.elements.resultMedal.classList.add('none');
            return;
        }

        const display = getMedalDisplay(medal);

        // Retirer les classes précédentes
        this.elements.resultMedal.classList.remove('none', 'gold', 'silver', 'bronze');
        this.elements.resultMedal.classList.add(medal);

        // Mettre à jour le contenu
        this.elements.medalEmoji.textContent = display.emoji;
        this.elements.medalLabel.textContent = `MÉDAILLE ${display.label}`;
        this.elements.medalLabel.style.color = display.color;

        // Forcer le redémarrage de l'animation
        this.elements.resultMedal.style.animation = 'none';
        void this.elements.resultMedal.offsetWidth;
        this.elements.resultMedal.style.animation = '';
    }

    // Cacher la médaille
    hideMedal() {
        if (this.elements.resultMedal) {
            this.elements.resultMedal.classList.add('none');
        }
    }

    showStats(globalStats, history) {
        const overlay = document.getElementById('statsOverlay');
        if (!overlay) return;

        // Stats globales
        const globalContainer = document.getElementById('statsGlobal');
        if (globalContainer && globalStats) {
            const winRate = globalStats.totalRaces > 0
                ? Math.round((globalStats.totalWins / globalStats.totalRaces) * 100) : 0;
            const totalMinutes = Math.round(globalStats.totalPlayTime / 60000);

            globalContainer.innerHTML = `
                <div class="global-stat"><div class="stat-number">${globalStats.totalRaces}</div><div class="stat-desc">Courses</div></div>
                <div class="global-stat"><div class="stat-number">${globalStats.totalWins}</div><div class="stat-desc">Victoires</div></div>
                <div class="global-stat"><div class="stat-number">${winRate}%</div><div class="stat-desc">Win rate</div></div>
                <div class="global-stat"><div class="stat-number">${globalStats.bestWinStreak}</div><div class="stat-desc">Meilleure serie</div></div>
                <div class="global-stat"><div class="stat-number">${totalMinutes}m</div><div class="stat-desc">Temps de jeu</div></div>
                <div class="global-stat"><div class="stat-number">${globalStats.totalOvertakes}</div><div class="stat-desc">Depassements</div></div>
                <div class="global-stat"><div class="stat-number">${globalStats.totalItemsUsed}</div><div class="stat-desc">Items utilises</div></div>
                <div class="global-stat"><div class="stat-number">${globalStats.totalHitsGiven}</div><div class="stat-desc">Coups donnes</div></div>
                <div class="global-stat"><div class="stat-number">${globalStats.currentWinStreak}</div><div class="stat-desc">Serie en cours</div></div>
            `;
        }

        // Historique
        const historyContainer = document.getElementById('statsHistory');
        if (historyContainer) {
            if (!history || history.length === 0) {
                historyContainer.innerHTML = '<div class="history-empty">Aucune course enregistree</div>';
            } else {
                let html = '';
                history.forEach(entry => {
                    const date = new Date(entry.date);
                    const dateStr = `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                    const isWin = entry.position === 1;
                    const medalEmoji = entry.medal === 'gold' ? '🥇' : entry.medal === 'silver' ? '🥈' : entry.medal === 'bronze' ? '🥉' : '';
                    const trackName = entry.track === 'oval' ? 'Stadium' : 'Infini';

                    html += `<div class="history-entry ${isWin ? 'win' : 'loss'}">
                        <span class="history-pos ${isWin ? 'p1' : 'p2'}">P${entry.position}</span>
                        <span class="history-track">${trackName}</span>
                        <span class="history-time">${entry.forfeited ? 'Forfait' : formatTime(entry.raceTime)}</span>
                        <span class="history-medal">${medalEmoji}</span>
                        <span class="history-date">${dateStr}</span>
                    </div>`;
                });
                historyContainer.innerHTML = html;
            }
        }

        overlay.classList.add('active');
    }

    hideStats() {
        const overlay = document.getElementById('statsOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    drawMinimap(track, player, ai, ghost = null) {
        if (!this.minimapCtx) return;

        const c = this.minimapCtx;
        const w = 180, h = 130;

        c.fillStyle = 'rgba(30,30,40,0.95)';
        c.fillRect(0, 0, w, h);

        // Calculer les limites
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        track.centerPoints.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });

        const pad = 15;
        const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
        const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
        const oz = (h - (maxZ - minZ) * scale) / 2 - minZ * scale;

        // Dessiner la piste
        c.strokeStyle = '#444';
        c.lineWidth = 3;
        c.beginPath();
        track.centerPoints.forEach((p, i) => {
            const sx = p.x * scale + ox;
            const sz = p.z * scale + oz;
            if (i === 0) c.moveTo(sx, sz);
            else c.lineTo(sx, sz);
        });
        c.closePath();
        c.stroke();

        // Fantôme (point blanc semi-transparent)
        if (ghost && ghost.isPlaying && ghost.mesh && ghost.mesh.visible) {
            c.fillStyle = 'rgba(255, 255, 255, 0.5)';
            c.beginPath();
            c.arc(ghost.mesh.position.x * scale + ox, ghost.mesh.position.z * scale + oz, 4, 0, Math.PI * 2);
            c.fill();
        }

        // Joueur
        c.fillStyle = '#e74c3c';
        c.beginPath();
        c.arc(player.x * scale + ox, player.z * scale + oz, 5, 0, Math.PI * 2);
        c.fill();

        // IA
        c.fillStyle = '#3498db';
        c.beginPath();
        c.arc(ai.x * scale + ox, ai.z * scale + oz, 5, 0, Math.PI * 2);
        c.fill();
    }
}
