// ============================================================
// GAME - Boucle de jeu principale
// ============================================================

import { CONFIG, DIFFICULTY } from './config.js';
import { Track } from './track.js';
import { Player } from './player.js';
import { AI } from './ai.js';
import { Physics } from './physics.js';
import { ParticleSystem } from './particles.js';
import { Slipstream } from './slipstream.js';
import { UI } from './ui.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';
import { ScoreManager, getMedalForTime } from './scores.js';
import { Ghost } from './ghost.js';
import { ItemManager, ITEM_TYPES } from './items.js';
import { Kart } from './kart.js';
import { submitScore, fetchLeaderboard } from './leaderboard.js';

export class Game {
    constructor() {
        this.state = 'title'; // title, countdown, racing, paused, finished
        this.lastTime = 0;
        this.raceStartTime = 0;
        
        // Turbo Start
        this.turboStartState = 'waiting';
        this.turboStartWindowStart = 0;

        // Difficulté
        this.difficulty = 'normal';

        // Noms des joueurs
        this.aiName = 'Claudius';
        this.playerName = 'Joueur';

        // Référence à l'interval du countdown (pour éviter memory leak)
        this.countdownInterval = null;

        // Angle lissé de la caméra pour éviter l'effet de rotation
        this.smoothedCameraAngle = Math.PI;

        // Screen shake
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.shakeTime = 0;

        // FOV dynamique
        this.currentFov = CONFIG.camera.fovNormal;

        // Hit-stop (ralenti dramatique)
        this.hitStopTime = 0;
        this.hitStopDuration = 0;
        this.hitStopIntensity = 0.1; // 10% de la vitesse normale

        // Pause
        this.pausedState = null; // État avant la pause (racing ou waiting_finish)
        this.pauseStartTime = 0; // Pour recalculer le chrono
        this.totalPausedTime = 0; // Temps total passé en pause

        this.init();
    }
    
    init() {
        // Renderer
        this.isMobile = 'ontouchstart' in window;
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('gameCanvas'),
            antialias: !this.isMobile,  // Désactivé sur mobile pour les performances
            powerPreference: 'high-performance',  // Forcer le GPU haute performance
            alpha: false  // Pas de transparence canvas (évite compositing overhead)
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
        
        // Scène avec ciel gradient sunset
        this.scene = new THREE.Scene();
        const skyCanvas = document.createElement('canvas');
        skyCanvas.width = 1;
        skyCanvas.height = 256;
        const skyCtx = skyCanvas.getContext('2d');
        const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
        skyGrad.addColorStop(0, '#5b9bd5');     // Bleu profond (haut)
        skyGrad.addColorStop(0.5, '#87ceeb');   // Bleu ciel (milieu)
        skyGrad.addColorStop(1, '#ffd4a0');     // Orange pâle (horizon)
        skyCtx.fillStyle = skyGrad;
        skyCtx.fillRect(0, 0, 1, 256);
        this.scene.background = new THREE.CanvasTexture(skyCanvas);
        this.scene.fog = new THREE.Fog(0x9ad4e8, 100, 400);
        
        // Caméra
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.camera.fovNormal,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // Modules
        this.track = new Track(this.scene);
        this.track.generate();
        
        this.player = new Player(this.scene);
        this.ai = new AI(this.scene);

        // Initialiser la caméra immédiatement à la bonne position
        this.initCameraPosition();

        this.physics = new Physics(this.track);
        this.particles = new ParticleSystem(this.scene);
        this.slipstream = new Slipstream();
        this.ui = new UI();
        this.input = new InputManager();
        this.audio = new AudioManager();
        this.audio.init();
        this.scoreManager = new ScoreManager();
        this.ghost = new Ghost(this.scene);
        this.itemManager = new ItemManager(this.scene);

        // État pour éviter les appuis multiples sur useItem / selectItem
        this.itemUsePressed = false;
        this.selectItemPressed = false;

        // Élément d'avertissement mauvais sens
        this.wrongWayElement = document.getElementById('wrongWayWarning');

        // Détection des dépassements
        this.wasPlayerFirst = true;
        this.overtakeEmojiTimer = 0;

        // Statistiques de course
        this.raceStats = {
            overtakes: [],           // { time: ms, playerOvertook: boolean }
            bestDriftTime: 0,        // En frames
            bestCombo: 0,            // Meilleur combo atteint
            itemsPicked: 0,
            itemsUsed: 0,
            hitsGiven: 0,            // Coups portés à l'IA
            hitsReceived: 0,         // Coups reçus de l'IA
            leadTime: 0,             // Temps passé en tête (en ms)
            totalRaceTime: 0
        };

        // Afficher les records sur l'écran titre
        this.ui.updateTitleScores(this.scoreManager.getAllScores());
        this.ui.updateMenuRecords(this.scoreManager);

        // Synchroniser les clics menu avec l'état gamepad
        this.setupMenuSync();

        // Charger le nom du joueur depuis localStorage
        this.loadPlayerName();
        
        // Events
        this.setupEvents();
        
        // Démarrer la boucle
        this.animate(0);
    }
    
    showMobileControls(show) {
        const controls = document.getElementById('mobileControls');
        if (controls) {
            controls.classList.toggle('visible', show);
        }
    }

    enterFullscreen() {
        try {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (e) {
            // Fullscreen non supporté, on continue sans
        }
    }

    setupEvents() {
        // Resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Start button
        const startBtn = document.getElementById('startButton');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (this.isMobile) this.enterFullscreen();
                this.startGame();
            });
            startBtn.addEventListener('touchend', (e) => {
                if (this.isMobile) {
                    e.preventDefault();
                    this.enterFullscreen();
                    this.startGame();
                }
            }, { passive: false });
        }
        
        // Restart button
        document.getElementById('restartButton')?.addEventListener('click', () => {
            this.restartGame();
        });
        
        // Menu button
        document.getElementById('menuButton')?.addEventListener('click', () => {
            this.goToMenu();
        });

        // Fullscreen button (mobile)
        document.getElementById('fullscreenButton')?.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.enterFullscreen();
        }, { passive: false });

        // Forfeit button
        document.getElementById('forfeitButton')?.addEventListener('click', () => {
            this.forfeitRace();
        });

        // Stats button
        document.getElementById('statsButton')?.addEventListener('click', () => {
            this.ui.showStats(this.scoreManager.getGlobalStats(), this.scoreManager.getHistory());
        });
        document.getElementById('statsClose')?.addEventListener('click', () => {
            this.ui.hideStats();
        });

        // Pause buttons
        document.getElementById('resumeButton')?.addEventListener('click', () => {
            this.resumeGame();
        });
        document.getElementById('pauseMenuButton')?.addEventListener('click', () => {
            this.resumeGame();
            this.goToMenu();
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR' && (this.state === 'racing' || this.state === 'waiting_finish')) {
                this.respawnOnTrack();
            }

            // Forfait avec F quand l'IA a terminé
            if (e.code === 'KeyF' && this.state === 'waiting_finish') {
                this.forfeitRace();
                return;
            }

            // Pause avec Échap pendant la course
            if (e.code === 'Escape' && (this.state === 'racing' || this.state === 'waiting_finish')) {
                this.pauseGame();
            }
            // Reprendre avec Échap en pause
            if (e.code === 'Escape' && this.state === 'paused') {
                this.resumeGame();
            }

            // Turbo Start
            if ((e.code === 'ArrowUp' || e.code === 'KeyW') && this.state === 'countdown') {
                this.handleTurboStart();
            }

            // Navigation menu avec le clavier
            if (this.state === 'title') {
                // Si le focus est dans le champ nom, laisser la navigation normale
                const nameInput = document.getElementById('playerNameInput');
                if (document.activeElement === nameInput) {
                    if (e.code === 'Enter') {
                        nameInput.blur();
                        this.menuFocus.section = 1; // Passer aux circuits
                        this.updateMenuFromGamepad();
                        e.preventDefault();
                    }
                    return; // Laisser le clavier fonctionner normalement dans l'input
                }

                let changed = false;

                if (e.code === 'ArrowUp') {
                    this.menuFocus.section = Math.max(0, this.menuFocus.section - 1);
                    changed = true;
                    e.preventDefault();
                }
                if (e.code === 'ArrowDown') {
                    this.menuFocus.section = Math.min(4, this.menuFocus.section + 1);
                    changed = true;
                    e.preventDefault();
                }
                if (e.code === 'ArrowLeft') {
                    if (this.menuFocus.section === 1) {
                        this.menuFocus.trackIndex = Math.max(0, this.menuFocus.trackIndex - 1);
                    } else if (this.menuFocus.section === 2) {
                        this.menuFocus.diffIndex = Math.max(0, this.menuFocus.diffIndex - 1);
                    }
                    changed = true;
                    e.preventDefault();
                }
                if (e.code === 'ArrowRight') {
                    if (this.menuFocus.section === 1) {
                        this.menuFocus.trackIndex = Math.min(1, this.menuFocus.trackIndex + 1);
                    } else if (this.menuFocus.section === 2) {
                        this.menuFocus.diffIndex = Math.min(2, this.menuFocus.diffIndex + 1);
                    }
                    changed = true;
                    e.preventDefault();
                }
                if (e.code === 'Enter' || e.code === 'Space') {
                    if (this.menuFocus.section === 0) {
                        // Focus l'input nom
                        document.getElementById('playerNameInput')?.focus();
                    } else if (this.menuFocus.section === 4) {
                        // Ouvrir les stats
                        this.ui.showStats(this.scoreManager.getGlobalStats(), this.scoreManager.getHistory());
                    } else {
                        this.startGame();
                    }
                    e.preventDefault();
                }

                if (changed) {
                    this.updateMenuFromGamepad();
                    this.audio.playMenuNav();
                }
            }
        });
        
        // Mobile turbo start (via bouton drift)
        document.getElementById('btnDrift')?.addEventListener('touchstart', () => {
            if (this.state === 'countdown') {
                this.handleTurboStart();
            }
        });

        // Gamepad buttons state (pour détecter les appuis uniques)
        this.gamepadButtonsPressed = {};

        // Menu navigation state
        this.menuFocus = {
            section: 0,  // 0 = name, 1 = tracks, 2 = difficulty, 3 = start button
            trackIndex: 0,  // 0 = infini
            diffIndex: 1    // 0 = easy, 1 = normal, 2 = hard
        };
        this.menuSections = ['name', 'tracks', 'difficulty', 'start', 'stats'];
        this.trackOptions = ['infini'];
        this.diffOptions = ['easy', 'normal', 'hard'];
    }

    checkGamepadMenu() {
        const gamepads = navigator.getGamepads();
        let gp = null;

        // Trouver une manette connectée
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                gp = gamepads[i];
                break;
            }
        }

        if (!gp) return;

        // Boutons
        const aPressed = gp.buttons[0] && gp.buttons[0].pressed;
        const startPressed = gp.buttons[9] && gp.buttons[9].pressed;
        const confirmPressed = aPressed || startPressed;
        const rtPressed = gp.buttons[7] && gp.buttons[7].value > 0.1;

        // D-pad
        const dpadUp = gp.buttons[12] && gp.buttons[12].pressed;
        const dpadDown = gp.buttons[13] && gp.buttons[13].pressed;
        const dpadLeft = gp.buttons[14] && gp.buttons[14].pressed;
        const dpadRight = gp.buttons[15] && gp.buttons[15].pressed;

        // Détecter les nouveaux appuis
        const wasConfirm = this.gamepadButtonsPressed.confirm;
        const wasRt = this.gamepadButtonsPressed.rt;
        const wasUp = this.gamepadButtonsPressed.dpadUp;
        const wasDown = this.gamepadButtonsPressed.dpadDown;
        const wasLeft = this.gamepadButtonsPressed.dpadLeft;
        const wasRight = this.gamepadButtonsPressed.dpadRight;

        this.gamepadButtonsPressed.confirm = confirmPressed;
        this.gamepadButtonsPressed.rt = rtPressed;
        this.gamepadButtonsPressed.dpadUp = dpadUp;
        this.gamepadButtonsPressed.dpadDown = dpadDown;
        this.gamepadButtonsPressed.dpadLeft = dpadLeft;
        this.gamepadButtonsPressed.dpadRight = dpadRight;

        // Navigation dans le menu titre
        if (this.state === 'title') {
            let changed = false;

            // D-pad haut/bas : changer de section
            if (dpadUp && !wasUp) {
                this.menuFocus.section = Math.max(0, this.menuFocus.section - 1);
                changed = true;
            }
            if (dpadDown && !wasDown) {
                this.menuFocus.section = Math.min(4, this.menuFocus.section + 1);
                changed = true;
            }

            // D-pad gauche/droite : changer l'option dans la section
            if (dpadLeft && !wasLeft) {
                if (this.menuFocus.section === 1) {
                    this.menuFocus.trackIndex = Math.max(0, this.menuFocus.trackIndex - 1);
                } else if (this.menuFocus.section === 2) {
                    this.menuFocus.diffIndex = Math.max(0, this.menuFocus.diffIndex - 1);
                }
                changed = true;
            }
            if (dpadRight && !wasRight) {
                if (this.menuFocus.section === 1) {
                    this.menuFocus.trackIndex = Math.min(1, this.menuFocus.trackIndex + 1);
                } else if (this.menuFocus.section === 2) {
                    this.menuFocus.diffIndex = Math.min(2, this.menuFocus.diffIndex + 1);
                }
                changed = true;
            }

            // Mettre à jour l'UI si changement
            if (changed) {
                this.updateMenuFromGamepad();
                this.audio.playMenuNav();
            }

            // A ou Start : confirmer
            if (confirmPressed && !wasConfirm) {
                if (this.menuFocus.section === 4) {
                    // Ouvrir les stats
                    this.ui.showStats(this.scoreManager.getGlobalStats(), this.scoreManager.getHistory());
                } else if (this.menuFocus.section === 3) {
                    // Sur le bouton start
                    this.startGame();
                } else if (this.menuFocus.section === 0) {
                    // Sur le champ nom, focus l'input
                    document.getElementById('playerNameInput')?.focus();
                } else {
                    // Ailleurs : lancer directement
                    this.startGame();
                }
            }

            // B pour fermer les stats si ouvertes
            const bMenuPressed = gp.buttons[1] && gp.buttons[1].pressed;
            const wasBMenu = this.gamepadButtonsPressed.bMenu;
            this.gamepadButtonsPressed.bMenu = bMenuPressed;
            if (bMenuPressed && !wasBMenu) {
                this.ui.hideStats();
            }
        }
        // Écran de résultats
        else if (this.state === 'finished') {
            const bPressed = gp.buttons[1] && gp.buttons[1].pressed;
            const wasB = this.gamepadButtonsPressed.b;
            this.gamepadButtonsPressed.b = bPressed;
            if (confirmPressed && !wasConfirm) {
                this.restartGame();
            }
            if (bPressed && !wasB) {
                this.goToMenu();
            }
        }
        // Countdown
        else if (this.state === 'countdown') {
            if ((confirmPressed && !wasConfirm) || (rtPressed && !wasRt)) {
                this.handleTurboStart();
            }
        }
        // En attente de fin
        else if (this.state === 'waiting_finish') {
            const xPressed = gp.buttons[2] && gp.buttons[2].pressed;
            const wasX = this.gamepadButtonsPressed.x;
            this.gamepadButtonsPressed.x = xPressed;
            if (xPressed && !wasX) {
                this.forfeitRace();
            }
        }

        // Respawn sur la piste avec Select (button 8) pendant la course
        if (this.state === 'racing' || this.state === 'waiting_finish') {
            const selectPressed = gp.buttons[8] && gp.buttons[8].pressed;
            const wasSelect = this.gamepadButtonsPressed.select;
            this.gamepadButtonsPressed.select = selectPressed;
            if (selectPressed && !wasSelect) {
                this.respawnOnTrack();
            }
        }

        // Pause avec Start (button 9) pendant la course
        const startForPause = gp.buttons[9] && gp.buttons[9].pressed;
        const wasStart = this.gamepadButtonsPressed.start;
        this.gamepadButtonsPressed.start = startForPause;
        if (startForPause && !wasStart) {
            if (this.state === 'racing' || this.state === 'waiting_finish') {
                this.pauseGame();
            } else if (this.state === 'paused') {
                this.resumeGame();
            }
        }
    }

    updateMenuFromGamepad() {
        // Mettre à jour la sélection du circuit
        const trackCards = document.querySelectorAll('.track-card');
        const trackSelect = document.getElementById('trackSelect');
        trackCards.forEach((card, i) => {
            card.classList.toggle('selected', i === this.menuFocus.trackIndex);
        });
        if (trackSelect) {
            trackSelect.value = this.trackOptions[this.menuFocus.trackIndex];
        }

        // Mettre à jour la difficulté
        const diffOptions = document.querySelectorAll('.diff-option');
        const diffSelect = document.getElementById('difficultySelect');
        diffOptions.forEach((opt, i) => {
            opt.classList.toggle('selected', i === this.menuFocus.diffIndex);
        });
        if (diffSelect) {
            diffSelect.value = this.diffOptions[this.menuFocus.diffIndex];
        }

        // Mettre à jour le focus visuel
        this.ui.updateMenuFocus(this.menuFocus.section);
    }

    setupMenuSync() {
        // Synchroniser les clics sur les cards avec l'état du menu
        const trackCards = document.querySelectorAll('.track-card');
        trackCards.forEach((card, index) => {
            card.addEventListener('click', () => {
                this.menuFocus.trackIndex = index;
                this.menuFocus.section = 1;
                this.ui.updateMenuFocus(1);
            });
        });

        // Synchroniser les clics sur les options de difficulté
        const diffOptions = document.querySelectorAll('.diff-option');
        diffOptions.forEach((opt, index) => {
            opt.addEventListener('click', () => {
                this.menuFocus.diffIndex = index;
                this.menuFocus.section = 2;
                this.ui.updateMenuFocus(2);
            });
        });

        // Focus sur le bouton start quand on le survole
        const startBtn = document.getElementById('startButton');
        if (startBtn) {
            startBtn.addEventListener('mouseenter', () => {
                this.menuFocus.section = 3;
                this.ui.updateMenuFocus(3);
            });
        }

        // Focus sur le champ nom quand on clique dessus
        const nameInput = document.getElementById('playerNameInput');
        if (nameInput) {
            nameInput.addEventListener('focus', () => {
                this.menuFocus.section = 0;
                this.ui.updateMenuFocus(0);
            });
        }

        // Initialiser l'audio au premier clic/interaction (requis par les navigateurs)
        const initAudioOnInteraction = () => {
            if (!this.audio.audioContext) {
                this.audio.init();
            }
            document.removeEventListener('click', initAudioOnInteraction);
            document.removeEventListener('keydown', initAudioOnInteraction);
        };
        document.addEventListener('click', initAudioOnInteraction);
        document.addEventListener('keydown', initAudioOnInteraction);
    }

    loadPlayerName() {
        const savedName = localStorage.getItem('pillsStadium_playerName');
        const nameInput = document.getElementById('playerNameInput');
        if (savedName && nameInput) {
            nameInput.value = savedName;
            this.playerName = savedName;
        }
        // Focus automatique sur le champ pseudo s'il est vide
        if (nameInput && !nameInput.value.trim()) {
            setTimeout(() => nameInput.focus(), 300);
        }
    }

    savePlayerName(name) {
        if (name && name.trim()) {
            localStorage.setItem('pillsStadium_playerName', name.trim());
        }
    }

    startGame() {
        // Récupérer le nom du joueur
        const nameInput = document.getElementById('playerNameInput');
        const inputName = nameInput?.value?.trim();
        this.playerName = inputName || 'Joueur';
        this.savePlayerName(this.playerName);

        // Appliquer la difficulté
        this.difficulty = document.getElementById('difficultySelect')?.value || 'normal';
        const diff = DIFFICULTY[this.difficulty];
        CONFIG.ai.maxSpeed = diff.aiMaxSpeed;
        CONFIG.ai.acceleration = diff.aiAcceleration;
        CONFIG.ai.cornerSlowdown = diff.aiCornerSlowdown;

        // Passer la difficulté à l'IA pour les erreurs
        this.ai.difficulty = this.difficulty;

        // Appliquer le circuit sélectionné
        this.selectedTrack = document.getElementById('trackSelect')?.value || 'infini';
        console.log('Starting game with track:', this.selectedTrack, 'difficulty:', this.difficulty);
        this.track.generate(this.selectedTrack);
        this.physics._wallGrid = null; // Invalider la grille de murs + piliers (sera reconstruite au prochain check)
        console.log('Track generated, meshes in scene:', this.scene.children.length);

        // Créer les boîtes d'items
        this.itemManager.createItemBoxes(this.track);

        // Adapter le brouillard, la caméra et l'IA selon le circuit
        if (this.selectedTrack === 'volcan') {
            // Circuit Volcan ~4.8 km - très grand circuit, 3 tours
            CONFIG.race.totalLaps = 3;
            this.scene.fog = new THREE.Fog(0x8B4513, this.isMobile ? 80 : 120, this.isMobile ? 400 : 700);
            this.camera.far = this.isMobile ? 1200 : 2000;
            CONFIG.ai.waypointRadius = 40;
            CONFIG.ai.lookAhead = 10;
        } else if (this.selectedTrack === 'infini') {
            // Circuit ~2.4 km - grand circuit
            CONFIG.race.totalLaps = 5;
            this.scene.fog = new THREE.Fog(0x87ceeb, this.isMobile ? 100 : 150, this.isMobile ? 500 : 800);
            this.camera.far = this.isMobile ? 1000 : 1500;
            // IA adaptée au grand circuit
            CONFIG.ai.waypointRadius = 40;
            CONFIG.ai.lookAhead = 8;
        } else if (this.selectedTrack === 'grand') {
            CONFIG.race.totalLaps = 5;
            this.scene.fog = new THREE.Fog(0x87ceeb, this.isMobile ? 100 : 150, this.isMobile ? 450 : 600);
            this.camera.far = this.isMobile ? 1000 : 1500;
            CONFIG.ai.waypointRadius = 30;
            CONFIG.ai.lookAhead = 6;
        } else {
            // Circuit oval - petit circuit
            CONFIG.race.totalLaps = 5;
            this.scene.fog = new THREE.Fog(0x87ceeb, this.isMobile ? 100 : 150, this.isMobile ? 450 : 600);
            this.camera.far = this.isMobile ? 800 : 1200;
            CONFIG.ai.waypointRadius = 15;
            CONFIG.ai.lookAhead = 3;
        }
        this.camera.updateProjectionMatrix();

        this.ui.hideTitleScreen();

        // Activer le warning portrait (uniquement pendant la course)
        document.getElementById('portraitWarning')?.classList.add('race-active');

        // Afficher le temps cible pour la médaille d'or
        this.ui.setMedalTarget(this.selectedTrack, CONFIG.race.totalLaps);

        this.resetPositions();
        this.startCountdown();
    }
    
    restartGame() {
        clearTimeout(this._resultTimeout);
        this.ui.hideCelebration();
        this.ui.hideResult();
        this.ui.hideRaceFinishedBanner();
        this.player.forfeited = false;
        this.resetPositions();
        this.startCountdown();
    }

    pauseGame() {
        if (this.state !== 'racing' && this.state !== 'waiting_finish') return;
        this.pausedState = this.state;
        this.state = 'paused';
        this.pauseStartTime = Date.now();
        document.getElementById('pauseOverlay')?.classList.add('active');
    }

    resumeGame() {
        if (this.state !== 'paused') return;
        this.totalPausedTime += Date.now() - this.pauseStartTime;
        this.state = this.pausedState;
        this.pausedState = null;
        document.getElementById('pauseOverlay')?.classList.remove('active');
    }

    goToMenu() {
        clearTimeout(this._resultTimeout);
        this.ui.hideCelebration();
        document.getElementById('pauseOverlay')?.classList.remove('active');
        this.ui.hideResult();
        this.ui.hideRaceFinishedBanner();
        this.ui.hideMedalTarget();
        this.ui._cleanupRoulette();
        this.player.forfeited = false;
        this.ui.showTitleScreen();
        this.ui.updateTitleScores(this.scoreManager.getAllScores());
        this.ui.updateMenuRecords(this.scoreManager);
        this.state = 'title';
        if (this.isMobile) this.showMobileControls(false);
        // Désactiver le warning portrait (le menu titre fonctionne en portrait)
        document.getElementById('portraitWarning')?.classList.remove('race-active');
        // Quitter le fullscreen quand on revient au menu
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }

        // Reset menu focus (section 1 = tracks, on évite le champ nom)
        this.menuFocus.section = 1;
        this.ui.updateMenuFocus(1);
    }
    
    resetPositions() {
        this.player.reset(this.track);
        this.player._skipSlope = this.isMobile;
        this.ai.reset(this.track);
        this.ai._skipSlope = this.isMobile;
        this.particles.clear();
        this.slipstream.reset();
        this.ghost.reset();
        // Nettoyer les projectiles et obstacles, mais garder les boîtes
        this.itemManager.projectiles.forEach(p => p.destroy());
        this.itemManager.obstacles.forEach(o => o.destroy());
        this.itemManager.projectiles = [];
        this.itemManager.obstacles = [];
        // Réinitialiser l'angle lissé de la caméra
        this.smoothedCameraAngle = this.player.angle;
        // Reset fixed timestep accumulator
        this._accumulator = 0;
        // Repositionner la caméra immédiatement
        this.initCameraPosition();
        // Réinitialiser la détection de dépassements
        this.wasPlayerFirst = true;
        this.overtakeEmojiTimer = 0;
        this.ui.hidePlayerEmoji();
        this.ui.hideAIEmoji();

        // Réinitialiser les statistiques de course
        this.raceStats = {
            overtakes: [],
            bestDriftTime: 0,
            bestCombo: 0,
            itemsPicked: 0,
            itemsUsed: 0,
            hitsGiven: 0,
            hitsReceived: 0,
            leadTime: 0,
            totalRaceTime: 0
        };
    }

    // Respawn le joueur au point de piste le plus proche (Select / R)
    respawnOnTrack() {
        const trackPoint = this.track.getClosestTrackPoint(
            this.player.x, this.player.z, this.player.y, 0
        );
        if (!trackPoint) return;

        this.player.x = trackPoint.x;
        this.player.z = trackPoint.z;
        this.player.y = trackPoint.y;
        this.player.targetY = trackPoint.y;
        this.player.angle = trackPoint.angle;
        this.player.speed = 0;
        this.player.angularVelocity = 0;
        this.player.airborne = false;
        this.player.airborneVelocityY = 0;

        // Repositionner la caméra derrière le joueur (reset spring-damper angulaire)
        this.smoothedCameraAngle = this.player.angle;
        this._camAngle = this.player.angle;
        this._camAngleVel = 0;
        this.initCameraPosition();
    }

    // Positionne la caméra immédiatement derrière le joueur (sans interpolation)
    initCameraPosition() {
        const cfg = CONFIG.camera;
        const p = this.player;

        // Position derrière le joueur
        this.camera.position.x = p.x - Math.sin(p.angle) * cfg.distance;
        this.camera.position.z = p.z - Math.cos(p.angle) * cfg.distance;
        this.camera.position.y = cfg.height;

        // Regarder devant le joueur
        this.camera.lookAt(
            p.x + Math.sin(p.angle) * cfg.lookAheadDistance,
            1,
            p.z + Math.cos(p.angle) * cfg.lookAheadDistance
        );

        this.camera.fov = cfg.fovNormal;
        this.camera.updateProjectionMatrix();
    }
    
    startCountdown() {
        // Nettoyer l'interval précédent si existant (évite memory leak)
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        this.state = 'countdown';
        if (this.isMobile) this.showMobileControls(true);
        this.turboStartState = 'waiting';
        this.turboStartWindowStart = 0;
        this._countdownStartTime = Date.now();

        let count = 3;
        this.ui.showCountdown(count);
        this.audio.playCountdown(count);

        this.countdownInterval = setInterval(() => {
            count--;

            if (count > 0) {
                this.ui.showCountdown(count);
                this.audio.playCountdown(count);
            } else if (count === 0) {
                this.ui.showCountdown('GO!', '#2ecc40');
                this.audio.playCountdown(0);
                this.turboStartWindowStart = Date.now();
            } else {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
                this.ui.hideCountdown();
                this.applyTurboStartResult();
                this.state = 'racing';
                this.raceStartTime = Date.now();
                this.totalPausedTime = 0;
                this.player.lapStartTime = Date.now();
                this.ai.startRace();
                this.audio.startEngine(); // Démarrer le son moteur

                // Fantôme : charger et démarrer la lecture + enregistrement
                const ghostData = this.scoreManager.getGhost(this.difficulty, this.selectedTrack, CONFIG.race.totalLaps);
                console.log(`[GHOST] Chargement: clé=${this.selectedTrack}_${this.difficulty}_${CONFIG.race.totalLaps}, data=${ghostData ? ghostData.length + ' frames' : 'null'}`);
                this.ghost.loadGhost(ghostData);
                this.ghost.startPlayback();
                this.ghost.startRecording();
            }
        }, 1000);
    }
    
    handleTurboStart() {
        if (this.state !== 'countdown') return;
        if (this.turboStartState !== 'waiting') return;

        const now = Date.now();

        if (this.turboStartWindowStart === 0) {
            // Avant le GO! - trop tôt
            this.turboStartState = 'tooEarly';
            this.ui.showNotification('⚠️ TROP TÔT!');
        } else {
            const timeSinceGo = now - this.turboStartWindowStart;
            // Fenêtre élargie : 0-200ms = perfect, 200-500ms = bon, >500ms = raté
            if (timeSinceGo <= 200) {
                this.turboStartState = 'perfect';
                this.ui.showNotification('🚀 TURBO START PARFAIT!');
            } else if (timeSinceGo <= 500) {
                this.turboStartState = 'good';
                this.ui.showNotification('✨ BON DÉPART!');
            } else {
                this.turboStartState = 'missed';
            }
        }
    }
    
    applyTurboStartResult() {
        if (this.turboStartState === 'perfect') {
            this.player.applyTurboStart();
            this.audio.playBoost();
            this.particles.spawnTurboStartFlames(
                this.player.x, this.player.y, this.player.z, this.player.angle, 1.0
            );
            this.triggerShake(0.8, 10);
        } else if (this.turboStartState === 'good') {
            // Bonus réduit pour un bon départ
            this.player.speed = 1.0;
            this.player.boostTime = 35;
            this.player.boostPower = 1.2;
            this.player.isTurboStartFlash = true;
            this.audio.playBoost();
            this.particles.spawnTurboStartFlames(
                this.player.x, this.player.y, this.player.z, this.player.angle, 0.6
            );
        }
    }

    // Screen shake effect
    triggerShake(intensity, duration) {
        // Ne pas écraser un shake plus fort en cours
        if (intensity > this.shakeIntensity || this.shakeTime <= 0) {
            this.shakeIntensity = intensity;
            this.shakeDuration = duration;
            this.shakeTime = duration;
        }
    }

    // Hit-stop effect (ralenti dramatique)
    triggerHitStop(duration, intensity = 0.1) {
        this.hitStopTime = duration;
        this.hitStopDuration = duration;
        this.hitStopIntensity = intensity;
    }

    updateCamera(dt, input) {
        const cfg = CONFIG.camera;
        const p = this.player;

        // Facteur de temps pour des mouvements fluides indépendants du framerate
        // Sur mobile : FIXE à 1.0 pour éliminer le jitter caméra dû au rAF timing irrégulier
        const dtFactor = this.isMobile ? 1.0 : Math.min(dt || 0.016, 0.05) * 60;
        // dt en secondes réelles pour le spring-damper angulaire
        const dtSec = this.isMobile ? (1 / 60) : Math.min(dt || 0.016, 0.05);

        // Sur l'écran titre ou countdown
        if (this.state === 'title' || this.state === 'countdown') {
            const midX = (this.player.x + this.ai.x) / 2;
            const midZ = (this.player.z + this.ai.z) / 2;
            const midY = (this.player.y + this.ai.y) / 2;

            if (this.state === 'countdown') {
                // B3 - Caméra cinématique : orbite puis transition vers chase cam
                const elapsed = (Date.now() - this._countdownStartTime) / 1000;

                // Position orbitale (vue cinématique)
                const orbitAngle = this.player.angle + Math.PI + Math.sin(elapsed * 0.5) * 0.4;
                const orbitRadius = 18 - elapsed * 1.5;
                const orbitHeight = 8 - elapsed * 0.5;

                const orbitX = midX + Math.sin(orbitAngle) * Math.max(orbitRadius, 10);
                const orbitZ = midZ + Math.cos(orbitAngle) * Math.max(orbitRadius, 10);
                const orbitY = midY + Math.max(orbitHeight, 5);
                const orbitLookX = midX;
                const orbitLookY = midY + 1;
                const orbitLookZ = midZ;
                const orbitFov = 60 - elapsed * 2;

                // Position chase cam (position de course)
                const chaseX = p.x - Math.sin(p.angle) * cfg.distance;
                const chaseZ = p.z - Math.cos(p.angle) * cfg.distance;
                const chaseY = p.y + cfg.height;
                const chaseLookX = p.x + Math.sin(p.angle) * cfg.lookAheadDistance;
                const chaseLookY = p.y + 1;
                const chaseLookZ = p.z + Math.cos(p.angle) * cfg.lookAheadDistance;
                const chaseFov = cfg.fovNormal;

                // Blend : 0-2s orbite pure, 2-4s transition progressive vers chase cam
                const transitionStart = 2.0;
                const transitionDuration = 2.0;
                const rawBlend = Math.max(0, Math.min(1, (elapsed - transitionStart) / transitionDuration));
                // Smoothstep pour une transition fluide
                const blend = rawBlend * rawBlend * (3 - 2 * rawBlend);

                const targetX = orbitX + (chaseX - orbitX) * blend;
                const targetZ = orbitZ + (chaseZ - orbitZ) * blend;
                const targetY = orbitY + (chaseY - orbitY) * blend;

                const lerpFactor = 0.08 * dtFactor;
                this.camera.position.x += (targetX - this.camera.position.x) * lerpFactor;
                this.camera.position.y += (targetY - this.camera.position.y) * lerpFactor;
                this.camera.position.z += (targetZ - this.camera.position.z) * lerpFactor;

                // Blend du point de visée
                const lookX = orbitLookX + (chaseLookX - orbitLookX) * blend;
                const lookY = orbitLookY + (chaseLookY - orbitLookY) * blend;
                const lookZ = orbitLookZ + (chaseLookZ - orbitLookZ) * blend;
                this.camera.lookAt(lookX, lookY, lookZ);

                this.camera.fov = orbitFov + (chaseFov - orbitFov) * blend;
            } else {
                // Titre : vue statique derrière les karts
                const lerpFactor = 0.1 * dtFactor;
                this.camera.position.x += (midX - this.camera.position.x) * lerpFactor;
                this.camera.position.y += (midY + 10 - this.camera.position.y) * lerpFactor;
                this.camera.position.z += (midZ + 20 - this.camera.position.z) * lerpFactor;
                this.camera.lookAt(midX, midY, midZ - 25);
                this.camera.fov = 60;
            }

            this.camera.rotation.z = 0;
            this.currentFov = this.camera.fov;
            this.camera.updateProjectionMatrix();
        } else if (this.state === 'finished') {
            // B4 - Caméra orbite autour du joueur pendant la célébration
            const elapsed = (Date.now() - this.finishTime) / 1000;
            const orbitAngle = p.angle + elapsed * 0.8;
            const radius = 12;

            this.camera.position.x = p.x + Math.sin(orbitAngle) * radius;
            this.camera.position.z = p.z + Math.cos(orbitAngle) * radius;
            this.camera.position.y = p.y + 6;

            this.camera.lookAt(p.x, p.y + 2, p.z);
            this.camera.rotation.z = 0;
            this.camera.fov = 65;
            this.camera.updateProjectionMatrix();
        } else {
            // =====================================================
            // CAMÉRA FIXE SIMPLE - Directement derrière le joueur
            // =====================================================

            // Position caméra : derrière le joueur
            // Sur mobile : caméra proche mais plus haute (vue semi-plongeante)
            const camDist = this.isMobile ? cfg.distance * 0.55 : cfg.distance * 0.6;
            const camHeight = this.isMobile ? cfg.height * 1.2 : cfg.height;

            // Regard arrière : transition lissée 0→1 (Y manette / C clavier)
            if (this._lookBehindFactor === undefined) this._lookBehindFactor = 0;
            const lookBehindTarget = (input && input.lookBehind) ? 1 : 0;
            this._lookBehindFactor += (lookBehindTarget - this._lookBehindFactor) * Math.min(0.2 * dtFactor, 0.8);
            if (this._lookBehindFactor < 0.01) this._lookBehindFactor = 0;
            if (this._lookBehindFactor > 0.99) this._lookBehindFactor = 1;
            const lookBehindAngle = this._lookBehindFactor * Math.PI;

            // Source position/angle : interpolée sur mobile, directe sur desktop
            const kartX = this.isMobile ? (p._renderX ?? p.x) : p.x;
            const kartY = this.isMobile ? (p._renderY ?? p.y) : p.y;
            const kartZ = this.isMobile ? (p._renderZ ?? p.z) : p.z;
            const kartAngle = this.isMobile ? (p._renderAngle ?? p.angle) : p.angle;

            // === SPRING-DAMPER ANGULAIRE (unifié mobile/desktop) ===
            // Intégration semi-implicite Euler en secondes réelles
            if (this._camAngle === undefined) this._camAngle = kartAngle;
            if (this._camAngleVel === undefined) this._camAngleVel = 0;

            let angleDiff = kartAngle - this._camAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const angularAcc = cfg.springK * angleDiff - cfg.damping * this._camAngleVel;
            this._camAngleVel += angularAcc * dtSec;
            this._camAngle += this._camAngleVel * dtSec;

            // Position XZ depuis l'angle lissé (pas de lerp position)
            const camAngle = this._camAngle + lookBehindAngle;
            this.camera.position.x = kartX - Math.sin(camAngle) * camDist;
            this.camera.position.z = kartZ - Math.cos(camAngle) * camDist;

            // Y : comportement original conservé (lerp, pas de spring-damper)
            if (this.isMobile) {
                const targetCamYMobile = kartY + camHeight;
                if (this._smoothCamY === undefined) this._smoothCamY = targetCamYMobile;
                this._smoothCamY += (targetCamYMobile - this._smoothCamY) * Math.min(0.1 * dtFactor, 0.5);
                this.camera.position.y = this._smoothCamY;
            } else {
                const targetCamY = kartY + camHeight;
                const camLerp = Math.min(0.4 * dtFactor, 0.9);
                this.camera.position.y += (targetCamY - this.camera.position.y) * camLerp;
            }

            // Appliquer le screen shake (désactivé sur mobile)
            if (this.shakeTime > 0 && !this.isMobile) {
                const shakeProgress = this.shakeTime / this.shakeDuration;
                const currentIntensity = this.shakeIntensity * shakeProgress; // Fade out

                // Offset aléatoire sur X, Y, Z
                this.camera.position.x += (Math.random() - 0.5) * currentIntensity;
                this.camera.position.y += (Math.random() - 0.5) * currentIntensity * 0.5;
                this.camera.position.z += (Math.random() - 0.5) * currentIntensity;

                this.shakeTime -= dtFactor;
            }

            // Regarder devant (ou derrière) le joueur
            const lookAhead = this.isMobile ? cfg.lookAheadDistance * 0.7 : cfg.lookAheadDistance;
            const baseLookAngle = this._camAngle !== undefined ? this._camAngle : p.angle;
            const lookAngle = baseLookAngle + lookBehindAngle;
            const lookBaseX = this.isMobile ? (p._renderX !== undefined ? p._renderX : p.x) : p.x;
            const lookBaseY = this.isMobile ? (p._renderY !== undefined ? p._renderY : p.y) : p.y;
            const lookBaseZ = this.isMobile ? (p._renderZ !== undefined ? p._renderZ : p.z) : p.z;
            const lookX = lookBaseX + Math.sin(lookAngle) * lookAhead;
            const lookY = lookBaseY + 1.5;
            const lookZ = lookBaseZ + Math.cos(lookAngle) * lookAhead;
            this.camera.lookAt(lookX, lookY, lookZ);

            // Camera roll en virage basé sur la vélocité angulaire du spring-damper
            const rollSource = this._camAngleVel || 0;
            const rollMax = this.isMobile ? 0 : 0.04;
            const rollMult = this.isMobile ? 0 : 25;
            const targetRoll = Math.max(-rollMax, Math.min(rollMax, -rollSource * rollMult));
            const rollLerp = Math.min((this.isMobile ? 0.05 : 0.08) * dtFactor, 0.5);
            this.camera.rotation.z += (targetRoll - this.camera.rotation.z) * rollLerp;

            // FOV dynamique
            {
                let baseFov = cfg.fovNormal;
                if (this.player.currentLap === CONFIG.race.totalLaps - 1) {
                    baseFov = this.isMobile ? cfg.fovNormal : cfg.fovFinalLap;
                }
                const speedRatioFov = Math.min(1, Math.abs(this.player.speed) / CONFIG.physics.maxSpeed);
                const speedFov = baseFov + (this.isMobile ? speedRatioFov * 3 : speedRatioFov * 5);
                const targetFov = (this.player.boostTime > 0 || this.player.shieldTime > 0) ? cfg.fovBoost : speedFov;
                const fovSpeed = (targetFov > this.currentFov) ? 0.15 : 0.05;
                this.currentFov += (targetFov - this.currentFov) * fovSpeed * dtFactor;
                // Mobile : updateProjectionMatrix seulement quand le FOV change significativement
                if (!this.isMobile || Math.abs(this.camera.fov - this.currentFov) > 0.5) {
                    this.camera.fov = this.currentFov;
                    this.camera.updateProjectionMatrix();
                }
            }
        }
    }

    // === SYSTÈME D'ITEMS ===
    updateItems(input) {
        const dt = 1 / 60; // Approximation

        // 1. Vérifier pickup pour le joueur (pas de pickup si roulette en cours)
        if (this.player.currentItem === null && this.player.itemCooldown <= 0 && !this.ui.isRouletteSpinning()) {
            if (this.itemManager.checkPickup(this.player)) {
                // Lancer la roulette - l'item sera choisi quand le joueur appuie sur A
                this.player.itemCooldown = 30;
                this.ui.startItemRoulette((autoItem) => {
                    // Callback si timeout 5s : assigner l'item automatiquement
                    this.player.currentItem = autoItem;
                    this.ui.showNotification(this.getItemName(autoItem));
                });
                this.audio.playPickup && this.audio.playPickup();
                this.raceStats.itemsPicked++;
            }
        }

        // 2. Vérifier pickup pour l'IA
        if (this.ai.currentItem === null && this.ai.itemCooldown <= 0) {
            if (this.itemManager.checkPickup(this.ai)) {
                const isFirst = this.ai.raceProgress >= this.player.raceProgress;
                this.ai.currentItem = this.itemManager.getRandomItem(isFirst);
                this.ai.itemCooldown = 30;
            }
        }

        // 3. Utilisation d'item par le joueur : A (manette) ou Espace (clavier)
        //    Premier appui stoppe la roulette, deuxième appui utilise l'item
        if (input && input.useItem && !this.itemUsePressed) {
            this.itemUsePressed = true;

            // Si la roulette tourne, l'arrêter et obtenir l'item
            if (this.ui.isRouletteSpinning()) {
                const chosenItem = this.ui.stopItemRoulette();
                if (chosenItem) {
                    this.player.currentItem = chosenItem;
                    this.ui.showNotification(this.getItemName(chosenItem));
                }
            }
            // Sinon, utiliser l'item détenu
            else if (this.player.currentItem) {
                const result = this.itemManager.useItem(
                    this.player.currentItem,
                    this.player,
                    'player',
                    this.track,
                    input.aimBackward
                );
                if (result.used) {
                    this.player.currentItem = null;
                    this.raceStats.itemsUsed++;
                    // Reset visée vers l'avant après utilisation
                    if (this.input.isMobile) {
                        this.input.mobileInput.aimBackward = false;
                        const btnUp = document.getElementById('btnUp');
                        const btnDown = document.getElementById('btnDown');
                        if (btnUp) btnUp.classList.add('active');
                        if (btnDown) btnDown.classList.remove('active');
                    }
                    if (result.effect === 'boost') {
                        this.ui.showNotification('BOOST!');
                    } else if (result.effect === 'emp') {
                        // EMP : ralentir l'IA
                        this.ai.speed *= result.config.slowdownFactor;
                        this.ai.slowdownTime = result.config.slowdownDuration;
                        this.ui.showNotification('EMP!');
                        this.ui.triggerFlash('green');
                        this.audio.playHitEnemy && this.audio.playHitEnemy();

                        // Emoji joueur : EMP réussi
                        const empEmojis = ['😈', '💪', '😎', '🤙'];
                        this.ui.showPlayerEmoji(
                            empEmojis[Math.floor(Math.random() * empEmojis.length)],
                            this.player,
                            this.camera
                        );
                        this.overtakeEmojiTimer = 90;
                    }
                }
            }
        }
        if (input && !input.useItem) {
            this.itemUsePressed = false;
        }

        // 5. IA utilise son item (logique stratégique)
        if (this.ai.currentItem && this.ai.shouldUseItem(this.player, this.track)) {
            const result = this.itemManager.useItem(
                this.ai.currentItem,
                this.ai,
                'ai',
                this.track
            );
            if (result.used) {
                this.ai.currentItem = null;
                this.ai.itemHoldTime = 0; // Reset hold time
                if (result.effect === 'emp') {
                    // IA utilise EMP : ralentir le joueur
                    this.player.speed *= result.config.slowdownFactor;
                    this.player.slowdownTime = result.config.slowdownDuration;
                    this.ui.showNotification('EMP!');
                    this.triggerShake(1.0, 12);
                    this.ui.triggerFlash('red');
                }
            }
        }

        // 5. Mettre à jour tous les items actifs
        const itemEvents = this.itemManager.update(dt, this.track, this.player, this.ai);

        // 6. Notifications de collision + screen shake + hit-stop + flash + son
        if (itemEvents.playerHitAI) {
            this.ui.showNotification('TOUCHÉ!');
            this.triggerShake(1.2, 15); // Fort shake - on a touché l'IA
            this.ui.triggerFlash('green'); // Flash vert - positif
            this.audio.playHitEnemy(); // Son satisfaisant

            // Emoji joueur : coup réussi ! (un seul à la fois)
            this.ui.hideAIEmoji();
            const hitEmojis = ['😎', '💪', '😈', '🤙', '🤘'];
            this.ui.showPlayerEmoji(
                hitEmojis[Math.floor(Math.random() * hitEmojis.length)],
                this.player,
                this.camera
            );
            this.overtakeEmojiTimer = 90;

            // Réaction de l'IA
            this.ai.onHit();
            this.audio.playAIHit();

            // Stat: coup porté
            this.raceStats.hitsGiven++;
        }
        if (itemEvents.aiHitPlayer) {
            this.ui.showNotification('OUCH!');
            this.triggerShake(1.5, 20); // Shake très fort - on se fait toucher
            this.ui.triggerFlash('red'); // Flash rouge - négatif
            this.audio.playHurt(); // Son de dégât

            // Emoji IA : elle se moque ! (un seul à la fois)
            this.ui.hidePlayerEmoji();
            const mockEmojis = ['😈', '😏', '🤭', '✌️'];
            this.ui.showAIEmoji(
                mockEmojis[Math.floor(Math.random() * mockEmojis.length)],
                this.ai,
                this.camera
            );
            this.overtakeEmojiTimer = 90;

            // Stat: coup reçu
            this.raceStats.hitsReceived++;
        }
        if (itemEvents.aiHitSlime) {
            this.ui.showNotification(`${this.aiName.toUpperCase()} RALENTI!`);
        }
        if (itemEvents.playerHitSlime) {
            this.triggerShake(0.5, 8); // Petit shake pour le slime
            this.ui.showNotification('SLIME!');
            this.ui.triggerFlash('green');
        }
    }

    getItemName(type) {
        const names = {
            'pill_boost': 'PILULE BOOST',
            'ball': 'BALLE',
            'homing_ball': 'MISSILE',
            'slime': 'SLIME',
            'shield': 'BOUCLIER',
            'emp': 'EMP'
        };
        return names[type] || type;
    }

    // === EFFETS VISUELS IA ===
    updateAIHitEffects() {
        if (!this.ai.mesh) return;

        // Flash rouge sur le kart IA quand touchée
        // Cache les meshes enfants pour éviter traverse() chaque frame
        if (!this._aiMeshChildren) {
            this._aiMeshChildren = [];
            this.ai.mesh.traverse((child) => {
                if (child.isMesh && child.material) this._aiMeshChildren.push(child);
            });
        }

        if (this.ai.hitReaction > 0) {
            const flash = Math.sin(this.ai.hitReaction * 0.5) > 0;
            for (let i = 0; i < this._aiMeshChildren.length; i++) {
                const child = this._aiMeshChildren[i];
                if (flash) {
                    child.material._originalColor = child.material._originalColor || child.material.color.getHex();
                    child.material.color.setHex(0xff3333);
                } else if (child.material._originalColor) {
                    child.material.color.setHex(child.material._originalColor);
                }
            }

            if (this.ai.hitEmoji) {
                this.ui.hidePlayerEmoji();
                this.ui.showAIEmoji(this.ai.hitEmoji, this.ai, this.camera);
            }
        } else {
            for (let i = 0; i < this._aiMeshChildren.length; i++) {
                const child = this._aiMeshChildren[i];
                if (child.material._originalColor) {
                    child.material.color.setHex(child.material._originalColor);
                }
            }
            if (this.overtakeEmojiTimer <= 0) {
                this.ui.hideAIEmoji();
            }
        }
    }

    // === DÉTECTION DES DÉPASSEMENTS ===
    checkOvertakes() {
        // Ne pas détecter au début de la course
        if (this.player.raceTime < 2000) return;

        // Position actuelle
        const isPlayerFirst = this.player.raceProgress >= this.ai.raceProgress;

        // Détecter un changement de position
        if (isPlayerFirst !== this.wasPlayerFirst) {
            // Enregistrer le dépassement pour les stats
            this.raceStats.overtakes.push({
                time: this.player.raceTime,
                playerOvertook: isPlayerFirst
            });

            if (isPlayerFirst) {
                // Le joueur vient de dépasser l'IA — emoji joueur seul
                this.ui.hideAIEmoji();
                const playerEmojis = ['😎', '🤩', '💪', '✌️', '🤙'];
                this.ui.showPlayerEmoji(
                    playerEmojis[Math.floor(Math.random() * playerEmojis.length)],
                    this.player,
                    this.camera
                );
            } else {
                // L'IA vient de dépasser le joueur — emoji IA seul
                this.ui.hidePlayerEmoji();
                const aiEmojis = ['😈', '😏', '🤭', '✌️', '🤙'];
                this.ui.showAIEmoji(
                    aiEmojis[Math.floor(Math.random() * aiEmojis.length)],
                    this.ai,
                    this.camera
                );
            }

            // Timer pour cacher les emojis après un moment
            this.overtakeEmojiTimer = 90; // ~1.5 secondes
        }

        // Tracker le temps passé en tête
        if (isPlayerFirst) {
            this.raceStats.leadTime += 16; // ~16ms par frame
        }

        this.wasPlayerFirst = isPlayerFirst;

        // Timer pour les emojis de dépassement
        if (this.overtakeEmojiTimer > 0) {
            this.overtakeEmojiTimer--;

            // Mettre à jour les positions des emojis pendant qu'ils sont visibles
            // (les emojis bougent avec les karts)
            if (this.overtakeEmojiTimer > 0) {
                // Mise à jour dynamique des positions (optionnel, le CSS anime déjà)
            } else {
                // Cacher les emojis quand le timer expire
                // (sauf si l'IA a une réaction de hit en cours)
                if (!this.ai.hitReaction || this.ai.hitReaction <= 0) {
                    this.ui.hideAIEmoji();
                }
                this.ui.hidePlayerEmoji();
            }
        }
    }

    // === BOOST PADS ===
    checkBoostPads() {
        if (!this.track.isInBoostZone) return;

        const result = this.track.isInBoostZone(this.player.x, this.player.z);

        if (result.inZone) {
            const zone = result.zone;
            const now = performance.now();

            // Initialiser le cooldown tracking si nécessaire
            if (!this._boostPadCooldowns) {
                this._boostPadCooldowns = new Map();
            }

            // Vérifier le cooldown pour cette zone (2 secondes)
            const lastUse = this._boostPadCooldowns.get(zone) || 0;
            if (now - lastUse > 2000) {
                // Appliquer le boost
                this.player.boostTime = result.duration;
                this.player.boostPower = result.power;
                this.player.isItemBoostFlash = true;

                // Effets
                this.audio.playBoostPad();
                this.ui.triggerFlash(); // Flash blanc par défaut
                this.triggerShake(0.3, 5);

                // Marquer le cooldown
                this._boostPadCooldowns.set(zone, now);

                // Notification optionnelle (peut être trop verbeux)
                // this.ui.showNotification('BOOST!');
            }
        }
    }

    // === RAMP / TREMPLIN ===
    checkRampZones() {
        if (!this.track.isInRampZone) return;

        // Joueur
        const playerResult = this.track.isInRampZone(this.player.x, this.player.z);
        if (playerResult.inZone && !this.player.airborne) {
            this.player.launch(playerResult.power);
        }

        // IA
        if (!this.ai.finished) {
            const aiResult = this.track.isInRampZone(this.ai.x, this.ai.z);
            if (aiResult.inZone && !this.ai.airborne) {
                this.ai.launch(aiResult.power);
            }
        }
    }

    // Vérifie si le joueur roule dans le mauvais sens
    checkWrongWay() {
        if (!this.track.centerPoints || this.track.centerPoints.length < 2) return false;

        const p = this.player;
        const n = this.track.centerPoints.length;

        // Recherche locale autour du dernier index connu (pas O(n))
        const start = this._wrongWayIdx || 0;
        let closestIdx = start;
        let closestDistSq = Infinity;
        const searchRange = 20;
        for (let j = 0; j < searchRange && j < n; j++) {
            const i = (start + j) % n;
            const wp = this.track.centerPoints[i];
            const distSq = (p.x - wp.x) * (p.x - wp.x) + (p.z - wp.z) * (p.z - wp.z);
            if (distSq < closestDistSq) { closestDistSq = distSq; closestIdx = i; }
            const ib = (start - j + n) % n;
            const wb = this.track.centerPoints[ib];
            const distSqB = (p.x - wb.x) * (p.x - wb.x) + (p.z - wb.z) * (p.z - wb.z);
            if (distSqB < closestDistSq) { closestDistSq = distSqB; closestIdx = ib; }
        }
        this._wrongWayIdx = closestIdx;

        // Direction vers le prochain waypoint
        const nextIdx = (closestIdx + 3) % n;
        const next = this.track.centerPoints[nextIdx];
        const dx = next.x - p.x;
        const dz = next.z - p.z;
        const trackAngle = Math.atan2(dx, dz);

        // Différence d'angle entre la direction du joueur et la piste
        let angleDiff = p.angle - trackAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Si l'angle est > 120°, le joueur va dans le mauvais sens
        return Math.abs(angleDiff) > (Math.PI * 2 / 3);
    }

    updateWrongWayWarning() {
        if (!this.wrongWayElement) return;

        const isWrongWay = this.checkWrongWay();

        if (isWrongWay && this.player.speed > 0.3) {
            this.wrongWayElement.classList.add('active');
        } else {
            this.wrongWayElement.classList.remove('active');
        }
    }

    animate(time) {
        if (!this._boundAnimate) this._boundAnimate = (t) => this.animate(t);
        requestAnimationFrame(this._boundAnimate);

        let dt = (time - this.lastTime) / 1000;

        // Clamp dt pour éviter les sauts après une pause ou un lag
        if (dt > 0.1) dt = 0.016;

        this.lastTime = time;

        // Hit-stop: ralentir le temps si actif
        if (this.hitStopTime > 0) {
            dt *= this.hitStopIntensity;
            this.hitStopTime -= 1; // Décrémente en frames, pas en temps
        }

        // Vérifier les inputs manette pour le menu
        this.checkGamepadMenu();

        // En pause : ne rien mettre à jour, juste rendre la scène
        if (this.state === 'paused') {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Input accessible par tous les états (caméra, etc.)
        let input = null;

        if (this.state === 'racing' || this.state === 'finished' || this.state === 'waiting_finish') {
            // Input (freinage + dérapage automatique après la victoire)
            // Inputs réutilisés (pas de new objet chaque frame)
            if (!this._brakeInput) {
                this._brakeInput = { accelerate: false, brake: true, drift: true, left: true, right: false, useItem: false, selectItem: false, lookBehind: false, aimBackward: false };
                this._emptyInput = { accelerate: false, brake: false, drift: false, left: false, right: false, useItem: false, selectItem: false, lookBehind: false, aimBackward: false };
            }
            if (this.state === 'finished' && this.player.speed > 0.3) {
                input = this._brakeInput;
            } else if (this.state === 'finished') {
                this.player.speed = 0;
                this.player.angularVelocity = 0;
                input = this._emptyInput;
            } else {
                input = this.input.getInput();
            }

            // Mise à jour du temps (en course ou en attente de fin)
            // Utilise le timestamp RAF converti pour éviter Date.now() en boucle
            if (this.state === 'racing' || this.state === 'waiting_finish') {
                this.player.raceTime = Date.now() - this.raceStartTime - this.totalPausedTime;
            }

            // Callbacks physique (réutilisés, pas recréés chaque frame)
            if (!this._onLapCb) {
                this._onLapCb = (lap) => {
                    if (lap === CONFIG.race.totalLaps - 1) {
                        this.ui.showFinalLap();
                    } else {
                        this.ui.showNotification(`TOUR ${lap + 1}!`);
                    }
                    this.audio.playLap();
                };
                this._onFinishCb = () => {
                    if (this.state === 'racing') {
                        this.onRaceFinish(true);
                    } else if (this.state === 'waiting_finish') {
                        this.onPlayerFinishedAfterAI();
                    }
                };
                this._onAIFinishCb = () => this.onRaceFinish(false);
            }

            // === FIXED TIMESTEP sur mobile (physique à 60Hz fixe + interpolation visuelle) ===
            if (this.isMobile && (this.state === 'racing' || this.state === 'waiting_finish')) {
                const TICK = 1 / 60;
                if (this._accumulator === undefined) this._accumulator = 0;
                this._accumulator += dt;
                // Protection spirale de mort (ex: retour d'onglet)
                if (this._accumulator > 0.1) this._accumulator = TICK;

                // Sauvegarder l'état AVANT les ticks physique (pour interpolation)
                let prevPX = this.player.x, prevPY = this.player.y, prevPZ = this.player.z, prevPA = this.player.angle;
                let prevAX = this.ai.x, prevAY = this.ai.y, prevAZ = this.ai.z, prevAA = this.ai.angle;

                while (this._accumulator >= TICK) {
                    // Sauvegarder l'état du tick N-1 (celui juste avant le dernier tick)
                    prevPX = this.player.x; prevPY = this.player.y; prevPZ = this.player.z; prevPA = this.player.angle;
                    prevAX = this.ai.x; prevAY = this.ai.y; prevAZ = this.ai.z; prevAA = this.ai.angle;

                    // Tick physique joueur (dt fixe)
                    this.player.update(TICK, input, this.track, this.physics, null, this._onLapCb, this._onFinishCb);

                    // Tick physique IA (dt fixe)
                    if (!this.ai.finished) {
                        this.ai._playerHasStar = this.player.shieldTime > 0;
                        this.ai.update(TICK, this.track, this.physics, this.player.raceProgress,
                            this._onAIFinishCb);
                    }

                    this._accumulator -= TICK;
                }

                // Interpolation visuelle : alpha = fraction du tick restante
                const alpha = this._accumulator / TICK;

                // Interpoler la position du joueur (mesh)
                let angleDiffP = this.player.angle - prevPA;
                while (angleDiffP > Math.PI) angleDiffP -= Math.PI * 2;
                while (angleDiffP < -Math.PI) angleDiffP += Math.PI * 2;
                this.player._renderX = prevPX + (this.player.x - prevPX) * alpha;
                this.player._renderY = prevPY + (this.player.y - prevPY) * alpha;
                this.player._renderZ = prevPZ + (this.player.z - prevPZ) * alpha;
                this.player._renderAngle = prevPA + angleDiffP * alpha;
                this.player.mesh.position.set(this.player._renderX, this.player._renderY + this.player.jumpHeight, this.player._renderZ);
                this.player.mesh.rotation.y = this.player._renderAngle;

                // Interpoler la position de l'IA (mesh)
                let angleDiffA = this.ai.angle - prevAA;
                while (angleDiffA > Math.PI) angleDiffA -= Math.PI * 2;
                while (angleDiffA < -Math.PI) angleDiffA += Math.PI * 2;
                this.ai.mesh.position.set(
                    prevAX + (this.ai.x - prevAX) * alpha,
                    prevAY + (this.ai.y - prevAY) * alpha,
                    prevAZ + (this.ai.z - prevAZ) * alpha
                );
                this.ai.mesh.rotation.y = prevAA + angleDiffA * alpha;

            } else {
                // Desktop ou états non-racing : dt variable (inchangé)
                this.player.update(dt, input, this.track, this.physics, null, this._onLapCb, this._onFinishCb);

                if (!this.ai.finished) {
                    this.ai._playerHasStar = this.player.shieldTime > 0;
                    this.ai.update(
                        dt, this.track, this.physics, this.player.raceProgress,
                        this._onAIFinishCb
                    );
                }
            }

            // Screen shake pour collision mur (avec cooldown)
            if (this.player.lastWallCollision) {
                const now = performance.now();
                if (!this._lastWallCollisionTime || now - this._lastWallCollisionTime > 150) {
                    this.triggerShake(0.4, 8);
                    this._lastWallCollisionTime = now;
                }
            }

            // Effets visuels de réaction IA
            this.updateAIHitEffects();

            // Collision entre karts (avec cooldown pour éviter le spam audio)
            if (this.physics.checkKartCollision(this.player, this.ai)) {
                const now = performance.now();
                if (!this._lastCollisionTime || now - this._lastCollisionTime > 200) {
                    // Étoile : l'IA fait un spin quand le joueur la percute
                    if (this.player.shieldTime > 0 && this.ai.spinOut <= 0) {
                        this.ai.speed *= 0.3;
                        this.ai.spinOut = 30;
                        this.ai.hitImmunity = 60;
                        this.audio.playHitEnemy();
                        this.triggerShake(1.0, 12);
                        this.ui.triggerFlash('green');
                        this.ui.hideAIEmoji();
                        const starHitEmojis = ['😈', '💪', '🤩'];
                        this.ui.showPlayerEmoji(
                            starHitEmojis[Math.floor(Math.random() * starHitEmojis.length)],
                            this.player, this.camera
                        );
                        this.overtakeEmojiTimer = 90;
                        this.ai.onHit();
                        this.raceStats.hitsGiven++;
                    } else {
                        this.audio.playCollision();
                        this.triggerShake(0.8, 12);
                    }
                    this._lastCollisionTime = now;
                }
            }

            // Indicateur d'item sur les karts
            Kart.updateItemIndicator(this.player.mesh, this.player.currentItem);
            Kart.updateItemIndicator(this.ai.mesh, this.ai.currentItem);

            // Ombre dynamique (taille selon hauteur + étirement selon vitesse)
            Kart.updateShadow(this.player.mesh, this.player.jumpHeight || 0, this.player.speed, CONFIG.physics.maxSpeed);
            Kart.updateShadow(this.ai.mesh, 0, this.ai.speed, CONFIG.physics.maxSpeed);

            // Slipstream (en course ou en attente de fin)
            if (this.state === 'racing' || this.state === 'waiting_finish') {
                if (!this._slipstreamCb) this._slipstreamCb = (msg) => this.ui.showNotification(msg);
                this.slipstream.update(dt, this.player, this.ai, this._slipstreamCb);

                // Fantôme : enregistrer et mettre à jour
                this.ghost.record(this.player, this.player.raceTime);
                this.ghost.update(this.player.raceTime);

                // === SYSTÈME D'ITEMS ===
                this.updateItems(input);

                // === DÉTECTION MAUVAIS SENS === (throttle sur mobile: 1/4 frames)
                if (!this.isMobile || this._uiFrame % 4 === 0) {
                    this.updateWrongWayWarning();
                }

                // === BOOST PADS === (throttle sur mobile: 1/2 frames)
                if (!this.isMobile || this._uiFrame % 2 === 0) {
                    this.checkBoostPads();
                }

                // === RAMP ZONES ===
                this.checkRampZones();

                // === DÉTECTION DES DÉPASSEMENTS ===
                this.checkOvertakes();
            }

            // Particules de drift
            if (this.player.isDrifting) {
                if (this.isMobile) {
                    // Mobile : spawn réduit via pool (1 sur 3 frames)
                    if ((this._uiFrame || 0) % 3 === 0) {
                        this.particles.spawnDriftParticle(this.player);
                    }
                } else {
                    // Desktop : burst au démarrage du drift
                    if (!this._wasDrifting) {
                        for (let i = 0; i < 5; i++) {
                            this.particles.spawnDriftParticle(this.player);
                        }
                    }
                    this.particles.spawnDriftParticle(this.player);
                }
            }
            this._wasDrifting = this.player.isDrifting;

            // Son de combo drift + tracking stats
            if (this.player.driftCombo > (this._lastDriftCombo || 0)) {
                this.audio.playCombo(this.player.driftCombo);
                if (this.player.driftCombo > this.raceStats.bestCombo) {
                    this.raceStats.bestCombo = this.player.driftCombo;
                }
            }
            this._lastDriftCombo = this.player.driftCombo;

            // Tracker le meilleur temps de drift
            if (this.player.isDrifting && this.player.driftTime > this.raceStats.bestDriftTime) {
                this.raceStats.bestDriftTime = this.player.driftTime;
            }

            // Traînées, exhaust, sparkles, shake
            const speedRatio = Math.abs(this.player.speed) / CONFIG.physics.maxSpeed;
            const isBoosting = this.player.boostTime > 0 || this.player.shieldTime > 0;

            if (this.isMobile) {
                // Mobile : particules réduites via pool
                const trailChance = isBoosting ? 0.2 : 0.1;
                if (speedRatio > 0.6 && Math.random() < trailChance) {
                    this.particles.spawnTrailParticle(this.player, isBoosting);
                }
                if (isBoosting && Math.random() < 0.3) {
                    this.particles.spawnBoostExhaust(this.player);
                }
            } else {
                // Desktop : particules complètes
                const trailChance = isBoosting ? 0.6 : 0.3;
                if (speedRatio > 0.6 && Math.random() < trailChance) {
                    this.particles.spawnTrailParticle(this.player, isBoosting);
                }

                if (isBoosting) {
                    this.particles.spawnBoostExhaust(this.player);
                    if (Math.random() < 0.5) {
                        this.particles.spawnBoostSparkle(this.player);
                    }
                }

                // Micro screen shake continu à haute vitesse
                if (speedRatio > 0.8 && this.shakeTime <= 0) {
                    const shakeIntensity = isBoosting ? 0.15 : (speedRatio - 0.8) * 0.5;
                    this.shakeIntensity = shakeIntensity;
                    this.shakeDuration = 2;
                    this.shakeTime = 2;
                }
            }

            // Particules hors-piste (throttle sur mobile: 1/3 frames)
            if ((!this.isMobile || this._uiFrame % 3 === 0)
                && !this.track.isOnTrack(this.player.x, this.player.z) && this.player.speed > 0.3) {
                const offTrackChance = this.isMobile ? 0.15 : 0.4;
                if (Math.random() < offTrackChance) {
                    this.particles.spawnOffTrackParticle(
                        this.player.x, this.player.y, this.player.z, this.player.speed
                    );
                }
            }
        }

        // Toujours mettre à jour
        this.track.updateBoostPads(performance.now() / 1000);
        this.particles.update(dt);
        this.updateCamera(dt, input);
        // HUD : throttle sur mobile (1 update sur 3)
        this._uiFrame = (this._uiFrame || 0) + 1;
        if (!this.isMobile || this._uiFrame % 3 === 0) {
            this.ui.update(this.player, this.ai, this.slipstream);
        }
        this.ui.drawMinimap(this.track, this.player, this.ai, this.ghost);

        // Son moteur dynamique
        if (this.state === 'racing' || this.state === 'waiting_finish') {
            this.audio.updateEngine(
                this.player.speed,
                CONFIG.physics.maxSpeed,
                this.player.boostTime > 0 || this.player.shieldTime > 0
            );
        }

        this.renderer.render(this.scene, this.camera);
    }
    
    onRaceFinish(playerWon) {
        // Log état de la course au moment du finish
        console.log(`[RACE FINISH] Winner: ${playerWon ? 'PLAYER' : 'AI'}`);
        console.log(`[RACE STATE] Player: lap=${this.player.currentLap}/${CONFIG.race.totalLaps}, cp=${this.player.currentCheckpoint}, progress=${this.player.raceProgress.toFixed(0)}, finished=${this.player.finished}`);
        console.log(`[RACE STATE] AI:     lap=${this.ai.currentLap}/${CONFIG.race.totalLaps}, cp=${this.ai.currentCheckpoint}, progress=${this.ai.raceProgress.toFixed(0)}, finished=${this.ai.finished}`);

        // Si le joueur gagne, afficher les résultats directement
        if (playerWon) {
            this.showFinalResults(true);
            return;
        }

        // Si l'IA gagne et qu'on n'est pas déjà en attente
        if (this.state === 'racing') {
            this.state = 'waiting_finish';
            this.ui.showRaceFinishedBanner(this.aiName);
            this.audio.playFinish(false);

            // Auto-forfait après 60 secondes pour éviter un état bloqué
            this._waitingFinishTimeout = setTimeout(() => {
                if (this.state === 'waiting_finish') {
                    this.forfeitRace();
                }
            }, 60000);
        }
    }

    // Appelé quand le joueur termine après l'IA
    onPlayerFinishedAfterAI() {
        if (this.state !== 'waiting_finish') return;
        if (this._waitingFinishTimeout) { clearTimeout(this._waitingFinishTimeout); this._waitingFinishTimeout = null; }
        this.ui.hideRaceFinishedBanner();
        this.showFinalResults(false);
    }

    // Appelé quand le joueur déclare forfait
    forfeitRace() {
        if (this.state !== 'waiting_finish') return;
        if (this._waitingFinishTimeout) { clearTimeout(this._waitingFinishTimeout); this._waitingFinishTimeout = null; }

        // Capturer le temps exact au moment du forfait (avant le délai d'affichage)
        this.player.forfeited = true;
        this.player.forfeitTime = Date.now() - this.raceStartTime - this.totalPausedTime;
        this.ui.hideRaceFinishedBanner();
        this.showFinalResults(false);
    }

    showFinalResults(playerWon) {
        if (this.state === 'finished') return;

        this.state = 'finished';
        if (this.isMobile) this.showMobileControls(false);
        // Désactiver le portrait warning pour ne pas couvrir les résultats
        document.getElementById('portraitWarning')?.classList.remove('race-active');
        this.finishTime = Date.now();
        this.ui._cleanupRoulette();
        this.audio.stopEngine(); // Arrêter le son moteur

        if (playerWon) {
            this.audio.playFinish(true);
            // B4 - Confettis de victoire !
            this.particles.spawnConfetti(this.player.x, this.player.y, this.player.z);
            setTimeout(() => {
                if (this.state === 'finished') {
                    this.particles.spawnConfetti(this.player.x, this.player.y, this.player.z);
                }
            }, 500);
        }

        // Vérifier si c'est un nouveau record (avant le délai)
        const currentRecord = this.scoreManager.getTrackRecord(this.difficulty, this.selectedTrack, CONFIG.race.totalLaps);
        const isNewRecord = !this.player.forfeited && (!currentRecord.bestTime || this.player.raceTime < currentRecord.bestTime);

        // Bandeau de célébration (visible immédiatement, sans fond noir)
        this.ui.showCelebration(playerWon, isNewRecord);

        // Arrêter l'enregistrement du fantôme (immédiat)
        const ghostData = this.ghost.stopRecording();
        this.ghost.stopPlayback();

        // Délai avant les résultats : laisser confettis + caméra orbitale jouer
        const delay = playerWon ? 3500 : 1200;

        this._resultTimeout = setTimeout(() => {
            if (this.state !== 'finished') return;

            // Masquer le bandeau de célébration
            this.ui.hideCelebration();

            // Temps du joueur (forfait = temps capturé au moment du forfait)
            const playerFinishTime = this.player.forfeited
                ? this.player.forfeitTime
                : this.player.raceTime;

            // Temps de l'IA (null si pas terminé)
            const aiFinishTime = this.ai.finished ? this.ai.raceTime : null;

            // Infos sur où en est l'IA si elle n'a pas fini
            const aiStatus = this.ai.finished
                ? null
                : `Tour ${this.ai.currentLap + 1}/${CONFIG.race.totalLaps}`;

            // Créer le tableau des classements
            const standings = [
                {
                    name: this.player.forfeited ? `${this.playerName} (forfait)` : this.playerName,
                    isPlayer: true,
                    finishTime: playerFinishTime,
                    bestLapTime: this.player.bestLapTime,
                    isWinner: playerWon,
                    didNotFinish: this.player.forfeited
                },
                {
                    name: this.aiName,
                    isPlayer: false,
                    finishTime: aiFinishTime,
                    bestLapTime: this.ai.bestLapTime,
                    isWinner: !playerWon,
                    didNotFinish: !this.ai.finished,
                    status: aiStatus
                }
            ];

            // Calculer la médaille obtenue (AVANT recordRace pour cohérence)
            // Pas de médaille en cas de forfait
            let medal = this.player.forfeited ? null : getMedalForTime(
                this.player.raceTime,
                this.selectedTrack,
                CONFIG.race.totalLaps
            );

            // Si on perd, la médaille max est l'argent (pas d'or sans victoire)
            if (!playerWon && medal === 'gold') {
                medal = 'silver';
            }

            // Récupérer le record précédent AVANT de sauvegarder (pour le delta)
            const previousRecord = this.scoreManager.getTrackRecord(this.difficulty, this.selectedTrack, CONFIG.race.totalLaps);
            const previousBestTime = previousRecord.bestTime;

            // Sauvegarder le score (et le fantôme si nouveau record)
            const result = this.scoreManager.recordRace(
                this.difficulty,
                this.player.raceTime,
                this.player.bestLapTime,
                playerWon,
                ghostData,
                this.selectedTrack,
                CONFIG.race.totalLaps,
                {
                    lapTimes: this.player.lapTimes,
                    playerName: this.playerName,
                    aiName: this.aiName,
                    forfeited: this.player.forfeited,
                    stats: this.raceStats,
                    medal
                }
            );

            // Afficher la médaille
            this.ui.showMedal(medal);

            // Jouer le son de médaille (après un court délai pour l'effet)
            if (medal) {
                setTimeout(() => {
                    this.audio.playMedal(medal);
                }, 400);
            }

            // Jouer le son de nouveau record si applicable
            if (result.newBestRace || result.newMedal || result.newTrackRecord || result.newBestLap) {
                setTimeout(() => {
                    this.audio.playNewRecord();
                }, 1000);
            }

            // Finaliser les stats
            this.raceStats.totalRaceTime = this.player.raceTime;

            // Afficher le résultat avec les infos de record, classements et stats
            const top5 = this.scoreManager.getTop5(this.difficulty, this.selectedTrack, CONFIG.race.totalLaps);
            const globalStats = this.scoreManager.getGlobalStats();
            const trackRecord = this.scoreManager.getTrackRecord(this.difficulty, this.selectedTrack, CONFIG.race.totalLaps);
            this.ui.showResult(playerWon, this.player.raceTime, this.player.bestLapTime, result, standings, {
                stats: this.raceStats,
                previousRecord: previousBestTime,
                playerName: this.playerName,
                aiName: this.aiName,
                lapTimes: this.player.lapTimes,
                top5,
                globalStats,
                trackRecord,
                medal
            });

            // Soumettre les scores au leaderboard global puis afficher
            const lbTrack = this.selectedTrack;
            const lbLaps = CONFIG.race.totalLaps;
            const lbDiff = this.difficulty;

            const submissions = [];

            // Score du joueur (seulement s'il a fini, pas forfait)
            if (!this.player.forfeited) {
                submissions.push(submitScore({
                    track: lbTrack, laps: lbLaps, difficulty: lbDiff,
                    playerName: this.playerName,
                    raceTime: this.player.raceTime,
                    bestLapTime: this.player.bestLapTime
                }));
            }

            // Score de l'IA (si elle a fini)
            if (this.ai.finished && this.ai.raceTime) {
                submissions.push(submitScore({
                    track: lbTrack, laps: lbLaps, difficulty: lbDiff,
                    playerName: this.aiName,
                    raceTime: this.ai.raceTime,
                    bestLapTime: this.ai.bestLapTime,
                    isAI: true
                }));
            }

            // Attendre les soumissions, puis charger le leaderboard complet
            Promise.all(submissions).then(() => {
                return fetchLeaderboard(lbTrack, lbLaps, lbDiff);
            }).then(entries => {
                this.ui.renderGlobalLeaderboard(entries || []);
            }).catch(err => {
                console.warn('[LEADERBOARD] Erreur chaîne:', err);
                this.ui.renderGlobalLeaderboard([]);
            });
        }, delay);
    }
}
