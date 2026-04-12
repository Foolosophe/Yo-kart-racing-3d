// ============================================================
// GHOST - Système de fantôme (meilleur temps)
// ============================================================

import { Kart } from './kart.js';

const RECORD_INTERVAL = 50; // Enregistrer toutes les 50ms

export class Ghost {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.recording = [];
        this.bestGhost = null;
        this.isRecording = false;
        this.isPlaying = false;
        this.lastRecordTime = 0;
        this.currentPlayIndex = 0;
    }

    // Créer le mesh fantôme (semi-transparent)
    createMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }

        // Créer un kart avec une couleur différente
        this.mesh = Kart.create(this.scene, 0xffffff);

        // Rendre semi-transparent
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.4;
            }
        });

        this.mesh.visible = false;
    }

    // Commencer l'enregistrement
    startRecording() {
        this.recording = [];
        this.isRecording = true;
        this.lastRecordTime = 0;
    }

    // Enregistrer une frame
    record(player, raceTime) {
        if (!this.isRecording) return;

        // Enregistrer à intervalles réguliers
        if (raceTime - this.lastRecordTime >= RECORD_INTERVAL) {
            this.recording.push({
                t: raceTime,
                x: player.x,
                y: player.y || 0,  // Élévation pour les ponts
                z: player.z,
                angle: player.angle,
                speed: player.speed
            });
            this.lastRecordTime = raceTime;
        }
    }

    // Arrêter l'enregistrement et retourner les données
    stopRecording() {
        this.isRecording = false;
        return this.recording;
    }

    // Charger un fantôme depuis les données sauvegardées
    loadGhost(ghostData) {
        if (!ghostData || ghostData.length === 0) {
            this.bestGhost = null;
            return;
        }
        this.bestGhost = ghostData;

        // Créer le mesh si pas encore fait
        if (!this.mesh) {
            this.createMesh();
        }
    }

    // Commencer la lecture du fantôme
    startPlayback() {
        if (!this.bestGhost || this.bestGhost.length === 0) {
            console.log('[GHOST] Pas de données ghost à jouer');
            this.isPlaying = false;
            if (this.mesh) this.mesh.visible = false;
            return;
        }

        this.isPlaying = true;
        this.currentPlayIndex = 0;

        // Créer le mesh s'il n'existe pas encore
        if (!this.mesh) {
            this.createMesh();
        }

        if (this.mesh) {
            this.mesh.visible = true;
            const first = this.bestGhost[0];
            this.mesh.position.set(first.x, first.y || 0, first.z);
            this.mesh.rotation.y = first.angle;
            console.log(`[GHOST] Lecture démarrée: ${this.bestGhost.length} frames, mesh visible`);
        }
    }

    // Mettre à jour le fantôme pendant la course
    update(raceTime) {
        if (!this.isPlaying || !this.bestGhost || !this.mesh) return;

        // Trouver les deux frames entre lesquelles interpoler
        let prev = null;
        let next = null;

        for (let i = this.currentPlayIndex; i < this.bestGhost.length; i++) {
            if (this.bestGhost[i].t >= raceTime) {
                next = this.bestGhost[i];
                prev = i > 0 ? this.bestGhost[i - 1] : this.bestGhost[0];
                this.currentPlayIndex = Math.max(0, i - 1);
                break;
            }
        }

        // Si on a dépassé la fin du fantôme, le laisser à sa dernière position
        // (le joueur est en avance sur son record — le fantôme reste visible à l'arrivée)
        if (!next) {
            const last = this.bestGhost[this.bestGhost.length - 1];
            this.mesh.position.set(last.x, last.y || 0, last.z);
            this.mesh.rotation.y = last.angle;
            Kart.updateWheelRotation(this.mesh, 0);
            return;
        }

        // Interpolation linéaire entre les deux frames
        if (prev && next && prev.t !== next.t) {
            const t = (raceTime - prev.t) / (next.t - prev.t);

            this.mesh.position.x = prev.x + (next.x - prev.x) * t;
            this.mesh.position.z = prev.z + (next.z - prev.z) * t;

            // Interpolation de l'élévation (pour les ponts)
            const prevY = prev.y || 0;
            const nextY = next.y || 0;
            this.mesh.position.y = prevY + (nextY - prevY) * t;

            // Interpolation d'angle (attention aux wrapping)
            let angleDiff = next.angle - prev.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            this.mesh.rotation.y = prev.angle + angleDiff * t;

            // Rotation des roues basée sur la vitesse interpolée
            const speed = prev.speed + (next.speed - prev.speed) * t;
            Kart.updateWheelRotation(this.mesh, speed);
        }
    }

    // Arrêter la lecture
    stopPlayback() {
        this.isPlaying = false;
        if (this.mesh) {
            this.mesh.visible = false;
        }
    }

    // Réinitialiser
    reset() {
        this.stopRecording();
        this.stopPlayback();
        this.currentPlayIndex = 0;
    }
}
