// ============================================================
// AUDIO - Système audio
// ============================================================

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.enabled = true;

        // Son moteur
        this.engineOsc = null;
        this.engineGain = null;
        this.engineRunning = false;
        this.targetEngineFreq = 60;
        this.currentEngineFreq = 60;
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio not supported');
            this.enabled = false;
        }
    }

    // Son moteur continu
    startEngine() {
        if (!this.enabled || !this.audioContext || this.engineRunning) return;

        try {
            // Oscillateur principal (basse fréquence, son rond)
            this.engineOsc = this.audioContext.createOscillator();
            this.engineGain = this.audioContext.createGain();

            // Sine = son doux et rond
            this.engineOsc.type = 'sine';
            this.engineOsc.frequency.value = 60;

            // Volume modéré
            this.engineGain.gain.value = 0.06;

            this.engineOsc.connect(this.engineGain);
            this.engineGain.connect(this.audioContext.destination);

            this.engineOsc.start();
            this.engineRunning = true;
        } catch (e) {
            // Ignore audio errors
        }
    }

    stopEngine() {
        if (!this.engineRunning || !this.engineOsc) return;

        const osc = this.engineOsc;
        const gain = this.engineGain;
        this.engineRunning = false;
        this.engineOsc = null;
        this.engineGain = null;

        try {
            gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
            osc.stop(this.audioContext.currentTime + 0.15);
        } catch (e) {
            // Assurer que l'oscillateur est bien arrete meme en cas d'erreur
            try { osc.stop(); } catch (_) {}
        }
    }

    updateEngine(speed, maxSpeed, isBoosting) {
        if (!this.engineRunning || !this.engineOsc) return;

        try {
            // Fréquence: 60Hz (arrêt) à 120Hz (max), 150Hz (boost)
            const ratio = Math.abs(speed) / maxSpeed;
            const baseFreq = isBoosting ? 150 : 120;
            this.targetEngineFreq = 60 + ratio * (baseFreq - 60);

            // Lissage doux pour éviter les sauts de fréquence
            this.currentEngineFreq += (this.targetEngineFreq - this.currentEngineFreq) * 0.08;
            this.engineOsc.frequency.value = this.currentEngineFreq;

            // Volume audible, plus fort en boost
            const volume = isBoosting ? 0.1 : 0.06;
            this.engineGain.gain.value = volume;
        } catch (e) {
            // Ignore
        }
    }
    
    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.enabled || !this.audioContext) return;
        
        try {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.type = type;
            osc.frequency.value = frequency;
            gain.gain.value = volume;
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            osc.start();
            osc.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            // Ignore audio errors
        }
    }
    
    playCountdown(number) {
        if (number > 0) {
            this.playTone(440, 0.15);
        } else {
            // GO!
            this.playTone(880, 0.3);
        }
    }
    
    playBoost() {
        this.playTone(600, 0.2, 'square', 0.2);
    }
    
    playLap() {
        this.playTone(660, 0.1);
        setTimeout(() => this.playTone(880, 0.15), 100);
    }
    
    playFinish(isWin) {
        if (isWin) {
            this.playTone(523, 0.15);
            setTimeout(() => this.playTone(659, 0.15), 150);
            setTimeout(() => this.playTone(784, 0.3), 300);
        } else {
            this.playTone(392, 0.2);
            setTimeout(() => this.playTone(330, 0.3), 200);
        }
    }
    
    playCollision() {
        this.playTone(150, 0.1, 'sawtooth', 0.2);
    }

    // Son quand on touche l'IA (satisfaisant)
    playHitEnemy() {
        this.playTone(400, 0.08, 'sine', 0.25);
        setTimeout(() => this.playTone(600, 0.12, 'sine', 0.2), 50);
    }

    // Son quand on se fait toucher (douloureux)
    playHurt() {
        this.playTone(200, 0.15, 'sawtooth', 0.2);
        setTimeout(() => this.playTone(150, 0.2, 'sawtooth', 0.15), 80);
    }

    // Son de combo drift (monte avec le niveau)
    playCombo(level) {
        // Fréquence qui monte avec le combo: 440, 523, 659, 784, 880...
        const frequencies = [440, 523, 659, 784, 880, 988, 1047];
        const freq = frequencies[Math.min(level - 1, frequencies.length - 1)];
        this.playTone(freq, 0.1, 'sine', 0.2);
    }

    // Son de boost pad (whoosh ascendant)
    playBoostPad() {
        // Son "whoosh" avec sweep de fréquence
        if (!this.enabled || !this.audioContext) return;

        try {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();

            osc.connect(gain);
            gain.connect(this.audioContext.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.15);

            gain.gain.setValueAtTime(0.25, this.audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.25);

            osc.start();
            osc.stop(this.audioContext.currentTime + 0.25);
        } catch (e) {
            // Ignore
        }
    }

    // ============================================================
    // SONS DE MÉDAILLES
    // ============================================================

    // Médaille de bronze (son simple, 2 notes)
    playMedalBronze() {
        this.playTone(330, 0.15, 'sine', 0.25); // Mi
        setTimeout(() => this.playTone(392, 0.2, 'sine', 0.25), 150); // Sol
    }

    // Médaille d'argent (son moyen, 3 notes ascendantes)
    playMedalSilver() {
        this.playTone(392, 0.12, 'sine', 0.25); // Sol
        setTimeout(() => this.playTone(494, 0.12, 'sine', 0.25), 120); // Si
        setTimeout(() => this.playTone(587, 0.2, 'sine', 0.25), 240); // Ré
    }

    // Médaille d'or (fanfare satisfaisante, 4 notes)
    playMedalGold() {
        if (!this.enabled || !this.audioContext) return;

        // Accord majeur triomphant
        this.playTone(523, 0.15, 'sine', 0.3); // Do
        setTimeout(() => this.playTone(659, 0.15, 'sine', 0.3), 100); // Mi
        setTimeout(() => this.playTone(784, 0.15, 'sine', 0.3), 200); // Sol
        setTimeout(() => this.playTone(1047, 0.35, 'sine', 0.35), 300); // Do aigu (tenu)
    }

    // Son de nouveau record personnel (sparkle + whoosh)
    playNewRecord() {
        if (!this.enabled || !this.audioContext) return;

        try {
            // Effet "sparkle" montant
            const frequencies = [880, 1109, 1319, 1568, 1760];
            frequencies.forEach((freq, i) => {
                setTimeout(() => {
                    this.playTone(freq, 0.08, 'sine', 0.2);
                }, i * 60);
            });

            // Note finale brillante
            setTimeout(() => {
                this.playTone(2093, 0.3, 'sine', 0.25);
            }, 350);
        } catch (e) {
            // Ignore
        }
    }

    // Jouer le son correspondant à une médaille
    playMedal(medal) {
        switch (medal) {
            case 'gold':
                this.playMedalGold();
                break;
            case 'silver':
                this.playMedalSilver();
                break;
            case 'bronze':
                this.playMedalBronze();
                break;
        }
    }

    // ============================================================
    // SONS DE MENU
    // ============================================================

    // Son de navigation menu (petit bip discret)
    playMenuNav() {
        this.playTone(600, 0.05, 'sine', 0.15);
    }

    // Son de confirmation menu
    playMenuConfirm() {
        this.playTone(800, 0.08, 'sine', 0.2);
        setTimeout(() => this.playTone(1000, 0.1, 'sine', 0.2), 60);
    }

    // Son quand l'IA est touchée (différent du joueur)
    playAIHit() {
        // Son descendant "ouch" synthétique
        this.playTone(500, 0.1, 'square', 0.15);
        setTimeout(() => this.playTone(350, 0.15, 'square', 0.12), 80);
    }
}
