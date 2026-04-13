// ============================================================
// KART - Modèle 3D du kart
// ============================================================

export class Kart {
    static create(scene, color = 0xe74c3c) {
        const group = new THREE.Group();

        // === CORPS PROFILE (4 pièces) ===
        const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 });

        // Nez avant — étroit et bas
        const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.2), bodyMat);
        nose.position.set(0, 0.45, 2.0);
        group.add(nose);

        // Corps central
        const bodyCenter = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 2.5), bodyMat);
        bodyCenter.position.set(0, 0.55, 0.2);
        group.add(bodyCenter);

        // Arrière — plus large et surélevé
        const bodyRear = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 1.2), bodyMat);
        bodyRear.position.set(0, 0.65, -1.5);
        group.add(bodyRear);

        // Plancher
        const floor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 4.2), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.8 }));
        floor.position.set(0, 0.25, 0.1);
        group.add(floor);

        // === COCKPIT (bords surélevés + pare-brise) ===
        const cockpitDarkMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        seat.position.set(0, 0.95, -0.2);
        group.add(seat);

        const cockpitRimGeo = new THREE.BoxGeometry(0.15, 0.4, 1.8);
        const rimLeft = new THREE.Mesh(cockpitRimGeo, cockpitDarkMat);
        rimLeft.position.set(-0.9, 1.1, -0.2);
        group.add(rimLeft);

        const rimRight = new THREE.Mesh(cockpitRimGeo, cockpitDarkMat);
        rimRight.position.set(0.9, 1.1, -0.2);
        group.add(rimRight);

        const rimBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.15), cockpitDarkMat);
        rimBack.position.set(0, 1.1, -1.1);
        group.add(rimBack);

        // Pare-brise semi-transparent
        const windshield = new THREE.Mesh(
            new THREE.PlaneGeometry(1.6, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        );
        windshield.position.set(0, 1.2, 0.7);
        windshield.rotation.x = -0.3;
        group.add(windshield);

        // === GARDE-BOUES (4) ===
        const fenderGeo = new THREE.BoxGeometry(0.6, 0.12, 1.0);
        const fenderMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.3, roughness: 0.6 });
        [
            { x: -1.4, z: 1.3 },
            { x: 1.4, z: 1.3 },
            { x: -1.475, z: -1.3 },
            { x: 1.475, z: -1.3 }
        ].forEach(pos => {
            const fender = new THREE.Mesh(fenderGeo, fenderMat);
            fender.position.set(pos.x, 0.85, pos.z);
            group.add(fender);
        });

        // === AILERON ARRIERE ===
        const spoilerMat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 });

        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.5), spoilerMat);
        spoiler.position.set(0, 1.5, -2.1);
        group.add(spoiler);

        const spoilerLegGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
        [-1.3, 1.3].forEach(x => {
            const leg = new THREE.Mesh(spoilerLegGeo, spoilerMat);
            leg.position.set(x, 1.25, -2.1);
            group.add(leg);
        });

        // === ECHAPPEMENTS (2 cylindres) ===
        const exhaustGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.6, 8);
        const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 });
        [-0.6, 0.6].forEach(x => {
            const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
            exhaust.position.set(x, 0.55, -2.2);
            exhaust.rotation.x = Math.PI / 2;
            group.add(exhaust);
        });

        // === BANDES LATERALES (accent couleur) ===
        const stripGeo = new THREE.BoxGeometry(0.05, 0.2, 3.5);
        const stripMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, metalness: 0.4, roughness: 0.5 });
        [-1.53, 1.53].forEach(x => {
            const strip = new THREE.Mesh(stripGeo, stripMat);
            strip.position.set(x, 0.6, 0.2);
            group.add(strip);
        });

        // === ROUES (inchangées) ===
        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const wheelPositions = [
            { x: -1.4, z: 1.3, name: 'wheel0' },
            { x: 1.4, z: 1.3, name: 'wheel1' },
            { x: -1.4, z: -1.3, name: 'wheel2' },
            { x: 1.4, z: -1.3, name: 'wheel3' }
        ];

        const hubcapGeo = new THREE.CircleGeometry(0.3, 8);
        const hubcapMat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 });

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, 0.5, pos.z);
            wheel.name = pos.name;
            group.add(wheel);

            // Enjoliveur côté extérieur
            const hubcap = new THREE.Mesh(hubcapGeo, hubcapMat);
            hubcap.position.set(pos.x > 0 ? pos.x + 0.21 : pos.x - 0.21, 0.5, pos.z);
            hubcap.rotation.y = pos.x > 0 ? Math.PI / 2 : -Math.PI / 2;
            group.add(hubcap);
        });

        // === PILOTE ===
        // Torse
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
        torso.position.set(0, 1.25, -0.3);
        group.add(torso);

        // Tête
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffcc99 }));
        head.position.set(0, 1.65, -0.3);
        group.add(head);

        // Casque
        const helmet = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color })
        );
        helmet.position.set(0, 1.7, -0.3);
        group.add(helmet);

        // Visière
        const visor = new THREE.Mesh(
            new THREE.PlaneGeometry(0.6, 0.25),
            new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
        );
        visor.position.set(0, 1.6, 0.05);
        visor.rotation.x = 0.2;
        group.add(visor);

        // === OMBRE (inchangée) ===
        const shadowTexture = Kart.createShadowTexture();
        const shadowGeo = new THREE.CircleGeometry(2.5, 32);
        const shadowMat = new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            opacity: 1,
            depthWrite: false
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.02;
        shadow.renderOrder = -1;
        group.add(shadow);
        group.userData.shadow = shadow;

        // Indicateur d'item (sphère flottante au-dessus du kart)
        const indicatorGeo = new THREE.SphereGeometry(0.6, 12, 12);
        const indicatorMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0
        });
        const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
        indicator.position.y = 3.5;
        group.add(indicator);
        group.userData.itemIndicator = indicator;

        scene.add(group);
        return group;
    }
    
    static updateWheelRotation(kartGroup, speed) {
        // Cache les références aux roues pour éviter getObjectByName chaque frame
        if (!kartGroup.userData._wheels) {
            kartGroup.userData._wheels = [];
            for (let i = 0; i < 4; i++) {
                kartGroup.userData._wheels.push(kartGroup.getObjectByName('wheel' + i));
            }
        }
        const wheels = kartGroup.userData._wheels;
        for (let i = 0; i < 4; i++) {
            if (wheels[i]) wheels[i].rotation.x += speed * 0.5;
        }
    }

    // Couleurs des items (hoistées hors du hot path)
    static _itemColors = {
        'pill_boost': 0x00ff88,
        'ball': 0xff4444,
        'homing_ball': 0xff0000,
        'slime': 0x44ff44,
        'shield': 0xffff00,
        'emp': 0x8844ff
    };

    static updateItemIndicator(kartGroup, item) {
        const indicator = kartGroup.userData.itemIndicator;
        if (!indicator) return;

        if (!item) {
            indicator.material.opacity = 0;
            return;
        }

        const colors = Kart._itemColors;

        indicator.material.color.setHex(colors[item] || 0xffffff);
        indicator.material.opacity = 0.8;
        indicator.rotation.y += 0.05;
        indicator.position.y = 3.5 + Math.sin(Date.now() * 0.005) * 0.3;
    }

    static createShadowTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(canvas);
    }

    static updateShadow(kartGroup, jumpHeight, speed, maxSpeed) {
        const shadow = kartGroup.userData.shadow;
        if (!shadow) return;

        // Hauteur : ombre s'agrandit et palit quand le kart saute
        const heightFactor = Math.min(jumpHeight / 5, 1);
        const scaleFromHeight = 1 + heightFactor * 0.8;
        const opacityFromHeight = 1 - heightFactor * 0.7;

        // Vitesse : étirer l'ombre vers l'avant (scale.y = forward après rotation -PI/2)
        const speedRatio = Math.abs(speed) / maxSpeed;
        const stretch = 1 + speedRatio * 0.3;

        shadow.scale.set(scaleFromHeight, scaleFromHeight * stretch, scaleFromHeight);
        shadow.material.opacity = opacityFromHeight;

        // Garder l'ombre au sol pendant les sauts
        shadow.position.y = -jumpHeight + 0.02;
    }

    static updateFrontWheelSteering(kartGroup, steerAngle) {
        const maxSteer = 0.4;
        const clampedSteer = Math.max(-maxSteer, Math.min(maxSteer, steerAngle));

        // Utiliser le cache des roues
        if (!kartGroup.userData._wheels) {
            kartGroup.userData._wheels = [];
            for (let i = 0; i < 4; i++) {
                kartGroup.userData._wheels.push(kartGroup.getObjectByName('wheel' + i));
            }
        }
        const wheels = kartGroup.userData._wheels;
        if (wheels[0]) wheels[0].rotation.y = clampedSteer;
        if (wheels[1]) wheels[1].rotation.y = clampedSteer;
    }
}
