// ============================================================
// KART - Modèle 3D du kart
// ============================================================

export class Kart {
    static create(scene, color = 0xe74c3c) {
        const group = new THREE.Group();

        // Corps principal
        const bodyGeo = new THREE.BoxGeometry(3, 0.8, 4.5);
        const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.7 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.6;
        group.add(body);

        // Cockpit
        const cockpitGeo = new THREE.BoxGeometry(2, 0.6, 2);
        const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
        cockpit.position.set(0, 1.1, -0.3);
        group.add(cockpit);

        // Aileron arrière
        const spoilerGeo = new THREE.BoxGeometry(3.2, 0.1, 0.4);
        const spoilerMat = new THREE.MeshStandardMaterial({ color });
        const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
        spoiler.position.set(0, 1.4, -2);
        group.add(spoiler);

        const spoilerLegsGeo = new THREE.BoxGeometry(0.15, 0.5, 0.15);
        [-1.3, 1.3].forEach(x => {
            const leg = new THREE.Mesh(spoilerLegsGeo, spoilerMat);
            leg.position.set(x, 1.15, -2);
            group.add(leg);
        });

        // Roues
        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const wheelPositions = [
            { x: -1.4, z: 1.3, name: 'wheel0' },
            { x: 1.4, z: 1.3, name: 'wheel1' },
            { x: -1.4, z: -1.3, name: 'wheel2' },
            { x: 1.4, z: -1.3, name: 'wheel3' }
        ];

        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos.x, 0.5, pos.z);
            wheel.name = pos.name;
            group.add(wheel);
        });

        // Pilote
        const headGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc99 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 1.7, -0.3);
        group.add(head);

        // Casque
        const helmetGeo = new THREE.SphereGeometry(0.45, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const helmetMat = new THREE.MeshStandardMaterial({ color });
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.set(0, 1.75, -0.3);
        group.add(helmet);

        // Ombre avec dégradé radial (opaque au centre, transparent aux bords)
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
        shadow.position.y = -0.45;
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
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
        gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.25)');
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
        shadow.position.y = -jumpHeight - 0.45;
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
