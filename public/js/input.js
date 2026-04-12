// ============================================================
// INPUT - Gestion des entrées clavier et mobile
// ============================================================

export class InputManager {
    constructor() {
        this.keys = {};
        this.mobileInput = {
            accelerate: false,
            brake: false,
            left: false,
            right: false,
            drift: false,
            useItem: false,
            selectItem: false,
            lookBehind: false,
            aimBackward: false
        };
        this.joystickActive = false;
        this.joystickX = 0;
        this.joystickY = 0;

        // Gamepad (supporte plusieurs manettes)
        this.gamepadIndex = null; // Retrocompat : premiere manette detectee
        this.connectedGamepads = new Set();
        this.gamepadDeadzone = 0.15;

        // Stocker les références aux handlers pour pouvoir les retirer
        this.handlers = {
            keydown: null,
            keyup: null,
            touchHandlers: []
        };

        this.setupKeyboard();
        this.setupMobile();
        this.setupGamepad();
    }

    setupKeyboard() {
        // Créer des handlers nommés pour pouvoir les retirer plus tard
        this.handlers.keydown = (e) => {
            this.keys[e.code] = true;
        };
        this.handlers.keyup = (e) => {
            this.keys[e.code] = false;
        };

        document.addEventListener('keydown', this.handlers.keydown);
        document.addEventListener('keyup', this.handlers.keyup);
    }
    
    setupGamepad() {
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Manette connectée:', e.gamepad.id, '(index', e.gamepad.index + ')');
            this.connectedGamepads.add(e.gamepad.index);
            // Retrocompat : garder la premiere manette comme gamepadIndex
            if (this.gamepadIndex === null) {
                this.gamepadIndex = e.gamepad.index;
            }
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Manette déconnectée:', e.gamepad.id);
            this.connectedGamepads.delete(e.gamepad.index);
            if (this.gamepadIndex === e.gamepad.index) {
                // Prendre la prochaine manette disponible ou null
                this.gamepadIndex = this.connectedGamepads.size > 0
                    ? this.connectedGamepads.values().next().value
                    : null;
            }
        });
    }

    // Lire le gamepad a un index specifique
    getGamepadInputAt(gpIndex) {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[gpIndex];
        if (!gp) return null;

        const stickX = Math.abs(gp.axes[0]) > this.gamepadDeadzone ? gp.axes[0] : 0;
        const stickY = Math.abs(gp.axes[1]) > this.gamepadDeadzone ? gp.axes[1] : 0;

        const rtButton = gp.buttons[7] ? gp.buttons[7].value : 0;
        const ltButton = gp.buttons[6] ? gp.buttons[6].value : 0;
        const aButton = gp.buttons[0] ? gp.buttons[0].pressed : false;
        const bButton = gp.buttons[1] ? gp.buttons[1].pressed : false;
        const xButton = gp.buttons[2] ? gp.buttons[2].pressed : false;
        const yButton = gp.buttons[3] ? gp.buttons[3].pressed : false;

        return {
            accelerate: rtButton > 0.1,
            brake: ltButton > 0.1,
            left: stickX < -this.gamepadDeadzone,
            right: stickX > this.gamepadDeadzone,
            drift: bButton,
            useItem: aButton,
            selectItem: xButton,
            lookBehind: yButton,
            aimBackward: stickY > 0.5
        };
    }

    // Retrocompat : lire la premiere manette connectee
    getGamepadInput() {
        if (this.gamepadIndex === null) return null;
        return this.getGamepadInputAt(this.gamepadIndex);
    }

    // Mapping clavier par joueur
    // playerIndex 0 : WASD + ShiftLeft + Space
    // playerIndex 1 : Arrows + ShiftRight/ControlRight + Enter/Numpad0
    getKeyboardInputForPlayer(playerIndex) {
        if (playerIndex === 0) {
            return {
                accelerate: this.keys['KeyW'],
                brake: this.keys['KeyS'],
                left: this.keys['KeyA'],
                right: this.keys['KeyD'],
                drift: this.keys['ShiftLeft'],
                useItem: this.keys['Space'],
                selectItem: this.keys['KeyE'],
                lookBehind: this.keys['KeyC'],
                aimBackward: this.keys['KeyS']
            };
        } else {
            return {
                accelerate: this.keys['ArrowUp'],
                brake: this.keys['ArrowDown'],
                left: this.keys['ArrowLeft'],
                right: this.keys['ArrowRight'],
                drift: this.keys['ShiftRight'] || this.keys['ControlRight'],
                useItem: this.keys['Enter'] || this.keys['Numpad0'],
                selectItem: this.keys['NumpadDecimal'],
                lookBehind: this.keys['Numpad3'],
                aimBackward: this.keys['ArrowDown']
            };
        }
    }

    // Input pour un joueur specifique (clavier split + gamepad dedie)
    getInputForPlayer(playerIndex) {
        const kb = this.getKeyboardInputForPlayer(playerIndex);
        const gp = this.getGamepadInputAt(playerIndex); // gamepad 0 -> J1, gamepad 1 -> J2

        return {
            accelerate: kb.accelerate || (gp && gp.accelerate),
            brake: kb.brake || (gp && gp.brake),
            left: kb.left || (gp && gp.left),
            right: kb.right || (gp && gp.right),
            drift: kb.drift || (gp && gp.drift),
            useItem: kb.useItem || (gp && gp.useItem),
            selectItem: kb.selectItem || (gp && gp.selectItem),
            lookBehind: kb.lookBehind || (gp && gp.lookBehind),
            aimBackward: kb.aimBackward || (gp && gp.aimBackward)
        };
    }

    setupMobile() {
        this.isMobile = 'ontouchstart' in window;

        // Boutons mobiles avec multi-touch
        const buttons = [
            { id: 'btnLeft', key: 'left' },
            { id: 'btnRight', key: 'right' },
            { id: 'btnDrift', key: 'drift' },
            { id: 'btnBrake', key: 'brake' },
            { id: 'btnItem', key: 'useItem' }
        ];

        buttons.forEach(({ id, key }) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.mobileInput[key] = true;
                    btn.classList.add('active');
                }, { passive: false });
                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.mobileInput[key] = false;
                    btn.classList.remove('active');
                }, { passive: false });
                btn.addEventListener('touchcancel', () => {
                    this.mobileInput[key] = false;
                    btn.classList.remove('active');
                });
            }
        });

        // Flèche bas : toggle visée arrière (1 tap = arrière, reset auto après lancement item)
        const btnUp = document.getElementById('btnUp');
        const btnDown = document.getElementById('btnDown');
        // Par défaut : visée avant (haut actif visuellement)
        if (btnUp) btnUp.classList.add('active');
        if (btnDown) {
            btnDown.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.mobileInput.aimBackward = true;
                btnDown.classList.add('active');
                if (btnUp) btnUp.classList.remove('active');
            }, { passive: false });
        }

        // Empêcher le scroll/zoom sur le canvas
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
            canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        }
    }
    
    getInput() {
        // Réutiliser le même objet pour éviter la GC pressure
        if (!this._cachedInput) {
            this._cachedInput = {
                accelerate: false, brake: false, left: false, right: false,
                drift: false, useItem: false, selectItem: false,
                lookBehind: false, aimBackward: false
            };
        }
        const out = this._cachedInput;

        if (this.isMobile) {
            // Mobile : auto-accélération, boutons tactiles
            out.accelerate = !this.mobileInput.brake;
            out.brake = this.mobileInput.brake;
            out.left = this.mobileInput.left;
            out.right = this.mobileInput.right;
            out.drift = this.mobileInput.drift;
            out.useItem = this.mobileInput.useItem;
            out.selectItem = this.mobileInput.selectItem;
            out.lookBehind = this.mobileInput.lookBehind;
            out.aimBackward = this.mobileInput.aimBackward;
            return out;
        }

        // Gamepad input
        const gpInput = this.getGamepadInput();
        out.accelerate = this.keys['ArrowUp'] || this.keys['KeyW'] || (gpInput && gpInput.accelerate);
        out.brake = this.keys['ArrowDown'] || this.keys['KeyS'] || (gpInput && gpInput.brake);
        out.left = this.keys['ArrowLeft'] || this.keys['KeyA'] || (gpInput && gpInput.left);
        out.right = this.keys['ArrowRight'] || this.keys['KeyD'] || (gpInput && gpInput.right);
        out.drift = this.keys['ShiftLeft'] || this.keys['ShiftRight'] || (gpInput && gpInput.drift);
        out.useItem = this.keys['Space'] || (gpInput && gpInput.useItem);
        out.selectItem = this.keys['KeyE'] || (gpInput && gpInput.selectItem);
        out.lookBehind = this.keys['KeyC'] || (gpInput && gpInput.lookBehind);
        out.aimBackward = this.keys['ArrowDown'] || this.keys['KeyS'] || (gpInput && gpInput.aimBackward);
        return out;
    }
    
    isKeyPressed(code) {
        return this.keys[code] === true;
    }

    // Nettoyer les event listeners (à appeler si l'InputManager est recréé)
    destroy() {
        if (this.handlers.keydown) {
            document.removeEventListener('keydown', this.handlers.keydown);
        }
        if (this.handlers.keyup) {
            document.removeEventListener('keyup', this.handlers.keyup);
        }
        // Reset des états
        this.keys = {};
        this.mobileInput = {
            accelerate: false,
            brake: false,
            left: false,
            right: false,
            drift: false,
            useItem: false,
            selectItem: false,
            lookBehind: false,
            aimBackward: false
        };
    }
}
