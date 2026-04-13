// ============================================================
// PARTICLES - Système de particules (avec pool mobile)
// ============================================================

import { CONFIG } from './config.js';

// Pool de particules pré-allouées pour mobile (évite GC pressure)
class ParticlePool {
    constructor(scene, maxSize) {
        this.scene = scene;
        this.maxSize = maxSize;
        this.pool = [];
        this.active = [];

        // Géométries partagées (jamais recréées)
        this._sphereGeo = new THREE.SphereGeometry(0.5, 4, 4);
        this._planeGeo = new THREE.PlaneGeometry(0.6, 1.5);

        // Pré-allouer les particules
        for (let i = 0; i < maxSize; i++) {
            const material = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0
            });
            const mesh = new THREE.Mesh(this._sphereGeo, material);
            mesh.visible = false;
            scene.add(mesh);
            this.pool.push({ mesh, life: 0, velocity: { x: 0, y: 0, z: 0 }, decay: 2, gravity: 0, rotSpeed: 0 });
        }
    }

    spawn(x, y, z, color, velocity, decay = 2, scale = 1, gravity = 0, rotSpeed = 0) {
        let p;
        if (this.pool.length > 0) {
            p = this.pool.pop();
        } else if (this.active.length > 0) {
            // Recycler la plus vieille particule active
            p = this.active.shift();
        } else {
            return null;
        }

        p.mesh.visible = true;
        p.mesh.position.set(x, y, z);
        p.mesh.scale.setScalar(scale);
        p.mesh.material.color.setHex(color);
        p.mesh.material.opacity = 0.7;
        p.mesh.rotation.set(0, 0, 0);
        p.life = 1.0;
        p.velocity.x = velocity.x;
        p.velocity.y = velocity.y;
        p.velocity.z = velocity.z;
        p.decay = decay;
        p.gravity = gravity;
        p.rotSpeed = rotSpeed;

        this.active.push(p);
        return p;
    }

    update(dt) {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i];

            p.mesh.position.x += p.velocity.x;
            p.mesh.position.y += p.velocity.y;
            p.mesh.position.z += p.velocity.z;

            if (p.gravity) p.velocity.y += p.gravity;
            if (p.rotSpeed) {
                p.mesh.rotation.x += p.rotSpeed;
                p.mesh.rotation.z += p.rotSpeed * 0.7;
            }

            p.velocity.y *= 0.95;
            p.life -= dt * p.decay;
            p.mesh.material.opacity = p.life * 0.7;
            p.mesh.scale.setScalar(1 + (1 - p.life) * 0.5);

            if (p.life <= 0) {
                p.mesh.visible = false;
                p.mesh.material.opacity = 0;
                // Swap-and-pop au lieu de splice (évite GC)
                const last = this.active[this.active.length - 1];
                this.active[i] = last;
                this.active.length--;
                this.pool.push(p);
            }
        }
    }

    clear() {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i];
            p.mesh.visible = false;
            p.mesh.material.opacity = 0;
            p.life = 0;
            this.pool.push(p);
        }
        this.active = [];
    }
}

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.speedParticles = [];
        this.trailParticles = [];

        // Détecter mobile et initialiser le pool
        this.isMobile = 'ontouchstart' in window;
        if (this.isMobile) {
            this.mobilePool = new ParticlePool(scene, 30);
        }
    }

    spawnDriftParticle(player) {
        if (!player.isDrifting) return;

        const th = CONFIG.physics.driftBoostThresholds;
        let color;

        if (player.driftTime >= th.purple) {
            color = 0x9b59b6;
        } else if (player.driftTime >= th.orange) {
            color = 0xe67e22;
        } else if (player.driftTime >= th.blue) {
            color = 0x3498db;
        } else {
            color = 0x888888;
        }

        if (this.isMobile) {
            // Mobile : une seule particule via le pool (pas deux)
            const offsetBack = -1.5;
            const offsetSide = (Math.random() > 0.5 ? 1 : -1) * 1.4;
            const px = player.x + Math.sin(player.angle) * offsetBack + Math.cos(player.angle) * offsetSide;
            const pz = player.z + Math.cos(player.angle) * offsetBack - Math.sin(player.angle) * offsetSide;
            this.mobilePool.spawn(px, player.y + 0.3, pz, color, {
                x: (Math.random() - 0.5) * 0.06,
                y: 0.03 + Math.random() * 0.03,
                z: (Math.random() - 0.5) * 0.06
            }, 2.5, 0.8);
            return;
        }

        // Desktop : particules complètes des deux roues
        const wheelOffsets = [-1.4, 1.4];

        wheelOffsets.forEach(offsetSide => {
            const offsetBack = -1.5;

            const particleX = player.x + Math.sin(player.angle) * offsetBack + Math.cos(player.angle) * offsetSide;
            const particleZ = player.z + Math.cos(player.angle) * offsetBack - Math.sin(player.angle) * offsetSide;

            const geometry = new THREE.SphereGeometry(0.4 + Math.random() * 0.4, 6, 6);
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.7
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.position.set(particleX, player.y + 0.3 + Math.random() * 0.2, particleZ);
            this.scene.add(particle);

            this.particles.push({
                mesh: particle,
                life: 1.0,
                velocity: {
                    x: (Math.random() - 0.5) * 0.08,
                    y: 0.03 + Math.random() * 0.04,
                    z: (Math.random() - 0.5) * 0.08
                }
            });
        });
    }

    spawnSpeedParticle(player, camera) {
        const side = (Math.random() - 0.5) * 5;
        const height = 0.3 + Math.random() * 2.5;
        const forward = 10 + Math.random() * 8;

        const trailLength = 1.5 + Math.random() * 2;
        const geometry = new THREE.BoxGeometry(0.06, 0.06, trailLength);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6
        });
        const particle = new THREE.Mesh(geometry, material);
        this.scene.add(particle);

        this.speedParticles.push({
            mesh: particle,
            life: 1.0,
            localSide: side,
            localHeight: height,
            localForward: forward
        });
    }

    spawnTrailParticle(player, isBoosting = false) {
        if (this.isMobile) {
            // Mobile : une seule traînée via le pool
            const offsetSide = (Math.random() > 0.5 ? 1 : -1) * 1.2;
            const offsetBack = -1.8;
            const px = player.x + Math.sin(player.angle) * offsetBack + Math.cos(player.angle) * offsetSide;
            const pz = player.z + Math.cos(player.angle) * offsetBack - Math.sin(player.angle) * offsetSide;
            const color = isBoosting ? 0xff6600 : 0x555555;
            this.mobilePool.spawn(px, 0.2, pz, color, { x: 0, y: 0, z: 0 }, 2.0, 0.6);
            return;
        }

        // Desktop
        const wheelOffsets = [-1.2, 1.2];

        wheelOffsets.forEach(offsetSide => {
            const offsetBack = -1.8;

            const particleX = player.x + Math.sin(player.angle) * offsetBack + Math.cos(player.angle) * offsetSide;
            const particleZ = player.z + Math.cos(player.angle) * offsetBack - Math.sin(player.angle) * offsetSide;

            const color = isBoosting ? (Math.random() > 0.5 ? 0xff6600 : 0x00bbff) : 0x555555;
            const w = isBoosting ? 0.8 : 0.6;
            const h = isBoosting ? 2.0 : 1.5;
            const opacity = isBoosting ? 0.7 : 0.4;

            const geometry = new THREE.PlaneGeometry(w, h);
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity,
                side: THREE.DoubleSide
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.position.set(particleX, 0.1, particleZ);
            particle.rotation.x = -Math.PI / 2;
            particle.rotation.z = -player.angle;
            this.scene.add(particle);

            this.trailParticles.push({
                mesh: particle,
                life: 1.0,
                isBoosting
            });
        });
    }

    // Flammes d'échappement en boost — alignées sur les 2 pots (±0.6, y=0.55, z=-2.2)
    spawnBoostExhaust(player) {
        const exhaustColors = [0xff6600, 0xffaa00, 0xff3300];
        const offsetBack = -2.4;
        const exhaustPipes = [-0.6, 0.6];
        const kartY = (player._renderY !== undefined ? player._renderY : player.y) + (player.jumpHeight || 0);

        if (this.isMobile) {
            // Mobile : une seule flamme, alternance gauche/droite
            this._exhaustSide = (this._exhaustSide || 0) ^ 1;
            const offsetSide = exhaustPipes[this._exhaustSide];
            const color = exhaustColors[Math.floor(Math.random() * exhaustColors.length)];
            this.mobilePool.spawn(
                player.x + Math.sin(player.angle) * offsetBack + Math.cos(player.angle) * offsetSide,
                kartY + 0.55,
                player.z + Math.cos(player.angle) * offsetBack - Math.sin(player.angle) * offsetSide,
                color,
                {
                    x: -Math.sin(player.angle) * 0.1 + (Math.random() - 0.5) * 0.05,
                    y: 0.03,
                    z: -Math.cos(player.angle) * 0.1
                },
                3.0, 0.5
            );
            return;
        }

        // Desktop : une particule par pot d'échappement
        for (let i = 0; i < 2; i++) {
            const color = exhaustColors[Math.floor(Math.random() * exhaustColors.length)];
            const size = 0.2 + Math.random() * 0.2;
            const geometry = new THREE.SphereGeometry(size, 6, 6);
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8
            });
            const particle = new THREE.Mesh(geometry, material);
            const offsetSide = exhaustPipes[i] + (Math.random() - 0.5) * 0.1;
            particle.position.set(
                player.x + Math.sin(player.angle) * offsetBack + Math.cos(player.angle) * offsetSide,
                kartY + 0.55 + Math.random() * 0.15,
                player.z + Math.cos(player.angle) * offsetBack - Math.sin(player.angle) * offsetSide
            );
            this.scene.add(particle);
            this.particles.push({
                mesh: particle,
                life: 1.0,
                velocity: {
                    x: -Math.sin(player.angle) * (0.08 + Math.random() * 0.1) + (Math.random() - 0.5) * 0.05,
                    y: 0.02 + Math.random() * 0.05,
                    z: -Math.cos(player.angle) * (0.08 + Math.random() * 0.1)
                },
                decay: 3.0
            });
        }
    }

    // Étincelles/sparkles autour du kart en boost
    spawnBoostSparkle(player) {
        if (this.isMobile) {
            // Mobile : sparkle via le pool
            const colors = [0xffffff, 0xffdd44, 0xffffaa];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const angle = Math.random() * Math.PI * 2;
            const radius = 1.5 + Math.random() * 1.5;
            this.mobilePool.spawn(
                player.x + Math.cos(angle) * radius,
                player.y + 0.5 + Math.random() * 2,
                player.z + Math.sin(angle) * radius,
                color,
                {
                    x: (Math.random() - 0.5) * 0.08,
                    y: 0.05 + Math.random() * 0.06,
                    z: (Math.random() - 0.5) * 0.08
                },
                4.0, 0.3
            );
            return;
        }

        // Desktop
        const colors = [0xffffff, 0xffdd44, 0xffffaa];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 0.1 + Math.random() * 0.1;
        const geometry = new THREE.SphereGeometry(size, 4, 4);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9
        });
        const particle = new THREE.Mesh(geometry, material);
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.5 + Math.random() * 1.5;
        particle.position.set(
            player.x + Math.cos(angle) * radius,
            player.y + 0.5 + Math.random() * 2,
            player.z + Math.sin(angle) * radius
        );
        this.scene.add(particle);
        this.particles.push({
            mesh: particle,
            life: 1.0,
            velocity: {
                x: (Math.random() - 0.5) * 0.1,
                y: 0.05 + Math.random() * 0.08,
                z: (Math.random() - 0.5) * 0.1
            },
            decay: 4.0
        });
    }

    // A3 - Particules hors-piste (herbe/terre)
    spawnOffTrackParticle(x, y, z, speed) {
        if (speed < 0.3) return;

        const colors = [0x4a9f4a, 0x3d8b3d, 0x6b4226];
        const color = colors[Math.floor(Math.random() * colors.length)];

        if (this.isMobile) {
            this.mobilePool.spawn(x + (Math.random() - 0.5) * 2, y + 0.2, z + (Math.random() - 0.5) * 2, color, {
                x: (Math.random() - 0.5) * 0.1,
                y: 0.05 + Math.random() * 0.08,
                z: (Math.random() - 0.5) * 0.1
            }, 2.5, 0.6);
            return;
        }

        // Desktop
        const size = 0.3 + Math.random() * 0.4;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });

        const particle = new THREE.Mesh(geometry, material);
        const spread = 2;
        particle.position.set(
            x + (Math.random() - 0.5) * spread,
            y + 0.2,
            z + (Math.random() - 0.5) * spread
        );

        this.scene.add(particle);
        this.particles.push({
            mesh: particle,
            life: 1.0,
            velocity: {
                x: (Math.random() - 0.5) * 0.15,
                y: 0.05 + Math.random() * 0.1,
                z: (Math.random() - 0.5) * 0.15
            },
            decay: 2.5
        });
    }

    // A4 - Flammes turbo start
    spawnTurboStartFlames(x, y, z, angle, intensity) {
        const count = intensity > 0.8 ? 20 : 10;

        for (let i = 0; i < count; i++) {
            const colors = [0xff6600, 0xffaa00, 0xff3300];
            const color = colors[Math.floor(Math.random() * colors.length)];

            const size = 0.3 + Math.random() * 0.5 * intensity;
            const geometry = new THREE.SphereGeometry(size, 6, 6);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.9
            });

            const particle = new THREE.Mesh(geometry, material);
            const offsetX = (Math.random() - 0.5) * 3;
            particle.position.set(
                x - Math.sin(angle) * 3 + offsetX,
                y + 0.3 + Math.random() * 0.5,
                z - Math.cos(angle) * 3
            );

            this.scene.add(particle);
            this.particles.push({
                mesh: particle,
                life: 1.0,
                velocity: {
                    x: -Math.sin(angle) * (0.1 + Math.random() * 0.2) + (Math.random() - 0.5) * 0.1,
                    y: 0.05 + Math.random() * 0.15,
                    z: -Math.cos(angle) * (0.1 + Math.random() * 0.2)
                },
                decay: 3.0
            });
        }
    }

    // B4 - Confettis de victoire
    spawnConfetti(x, y, z) {
        const confettiColors = [0xff6b35, 0x3498db, 0x2ecc71, 0xf1c40f, 0xe74c3c, 0x9b59b6];

        for (let i = 0; i < 40; i++) {
            const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
            const w = 0.2 + Math.random() * 0.3;
            const h = 0.4 + Math.random() * 0.6;
            const geometry = new THREE.PlaneGeometry(w, h);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide
            });

            const particle = new THREE.Mesh(geometry, material);
            particle.position.set(
                x + (Math.random() - 0.5) * 10,
                y + 2 + Math.random() * 5,
                z + (Math.random() - 0.5) * 10
            );
            particle.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            this.scene.add(particle);
            this.particles.push({
                mesh: particle,
                life: 1.0,
                velocity: {
                    x: (Math.random() - 0.5) * 0.2,
                    y: 0.1 + Math.random() * 0.15,
                    z: (Math.random() - 0.5) * 0.2
                },
                decay: 0.3,
                gravity: -0.008,
                rotSpeed: (Math.random() - 0.5) * 0.2
            });
        }
    }

    update(dt) {
        // Mobile pool update
        if (this.mobilePool) {
            this.mobilePool.update(dt);
        }

        // Particules de drift + off-track + flammes + confettis (desktop, ou turbo/confetti on both)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            p.mesh.position.x += p.velocity.x;
            p.mesh.position.y += p.velocity.y;
            p.mesh.position.z += p.velocity.z;

            // Gravité (confettis)
            if (p.gravity) {
                p.velocity.y += p.gravity;
            }
            // Rotation (confettis)
            if (p.rotSpeed) {
                p.mesh.rotation.x += p.rotSpeed;
                p.mesh.rotation.z += p.rotSpeed * 0.7;
            }

            p.velocity.y *= 0.95;
            const decayRate = p.decay || 2;
            p.life -= dt * decayRate;
            p.mesh.material.opacity = p.life * 0.8;
            p.mesh.scale.setScalar(1 + (1 - p.life) * 0.5);

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
            }
        }

        // Particules de vitesse (cleanup si existantes)
        for (let i = this.speedParticles.length - 1; i >= 0; i--) {
            const p = this.speedParticles[i];
            p.life -= dt * 3;
            p.mesh.material.opacity = p.life * 0.6;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.speedParticles.splice(i, 1);
            }
        }

        // Traînées sur le sol
        for (let i = this.trailParticles.length - 1; i >= 0; i--) {
            const p = this.trailParticles[i];

            p.life -= dt * 1.5;
            p.mesh.material.opacity = p.life * (p.isBoosting ? 0.7 : 0.4);

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.trailParticles.splice(i, 1);
            }
        }
    }

    clear() {
        // Clear mobile pool
        if (this.mobilePool) {
            this.mobilePool.clear();
        }

        this.particles.forEach(p => {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.particles = [];

        this.speedParticles.forEach(p => {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.speedParticles = [];

        this.trailParticles.forEach(p => {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
        });
        this.trailParticles = [];
    }
}
