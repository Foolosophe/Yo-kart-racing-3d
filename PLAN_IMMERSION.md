# PILLS STADIUM - Plan d'amelioration immersion (A + B)

> Chaque section contient : description, fichiers, implementation, tests

---

## A. QUICK WINS

---

### A1. FOV dynamique au boost

**Objectif** : Elargir le champ de vision pendant un boost pour renforcer la sensation de vitesse.

**Fichiers a modifier** :
- `js/config.js` : ajouter `fovBoost` dans camera
- `js/game.js` : modifier `updateCamera()` pour lerp le FOV

**Implementation** :

1. Dans `config.js`, ajouter le FOV boost :
```js
camera: {
    // ... existant
    fovNormal: 75,
    fovBoost: 88     // +13 degres pendant le boost
}
```

2. Dans `game.js`, ajouter une propriete `this.currentFov = CONFIG.camera.fovNormal` dans le constructeur.

3. Dans `updateCamera()`, dans le bloc `else` (racing), remplacer la gestion du FOV :
```js
// FOV dynamique : elargir pendant le boost
const targetFov = (this.player.boostTime > 0)
    ? CONFIG.camera.fovBoost
    : CONFIG.camera.fovNormal;

// Lerp progressif (rapide a monter, lent a descendre)
const fovSpeed = (targetFov > this.currentFov) ? 0.15 : 0.05;
this.currentFov += (targetFov - this.currentFov) * fovSpeed * dtFactor;

this.camera.fov = this.currentFov;
this.camera.updateProjectionMatrix();
```

4. Dans le bloc `title/countdown`, forcer `this.currentFov = 60` pour eviter un saut au demarrage.

**Tests** :
- [ ] Lancer une course, ramasser un item boost (pilule) -> le FOV doit s'elargir progressivement
- [ ] Faire un drift boost (bleu, orange, violet) -> le FOV s'elargit pendant la duree du boost
- [ ] Quand le boost se termine -> le FOV revient progressivement a 75
- [ ] Turbo start parfait -> le FOV s'elargit immediatement
- [ ] En pause puis reprise -> le FOV ne saute pas brutalement
- [ ] Sur l'ecran titre -> le FOV reste a 60 (pas de bug visuel)
- [ ] Verifier que `updateProjectionMatrix()` est appele a chaque frame (pas de lag)
- [ ] Tester avec slipstream boost -> FOV s'elargit aussi

---

### A2. Ombre circulaire sous les karts

**Objectif** : Ancrer visuellement les karts au sol avec un "blob shadow" simple et peu couteux.

**Fichiers a modifier** :
- `js/kart.js` : ajouter un disque d'ombre dans `Kart.create()`

**Implementation** :

1. Dans `Kart.create()`, apres la creation du groupe `kart`, ajouter :
```js
// Ombre blob (disque semi-transparent au sol)
const shadowGeo = new THREE.CircleGeometry(2.5, 16);
const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false  // Evite les artefacts de profondeur
});
const shadow = new THREE.Mesh(shadowGeo, shadowMat);
shadow.rotation.x = -Math.PI / 2; // A plat sur le sol
shadow.position.y = -0.45;        // Juste au-dessus du sol
shadow.renderOrder = -1;           // Rendu avant le sol
kart.add(shadow);
kart.userData.shadow = shadow;     // Reference pour mise a jour
```

2. L'ombre est enfant du kart, elle suit automatiquement. Mais il faut qu'elle reste au sol quand le kart saute (drift hop). Dans `player.js`, dans `update()`, apres la mise a jour de `this.mesh.position.y` :
```js
// Garder l'ombre au sol pendant les sauts
if (this.mesh.userData.shadow) {
    this.mesh.userData.shadow.position.y = -(this.mesh.position.y - this.y) - 0.45;
}
```

Note : si le kart est a `y + jumpHeight`, l'ombre doit rester a `y` (sol). Comme le shadow est enfant du mesh, on compense le jumpHeight.

**Tests** :
- [ ] Lancer une course -> les deux karts (joueur + IA) ont une ombre circulaire noire au sol
- [ ] L'ombre est visible sur la piste grise et sur l'herbe verte
- [ ] Pendant un drift hop (saut) -> l'ombre reste au sol, le kart monte
- [ ] Sur une zone en elevation (pont) -> l'ombre suit le sol du pont
- [ ] L'ombre ne clignote pas et n'a pas d'artefact Z-fighting
- [ ] Performance : pas de perte de FPS (c'est juste 1 cercle par kart)

---

### A3. Particules hors-piste

**Objectif** : Feedback visuel immediat quand le joueur roule hors de la piste (herbe, terre).

**Fichiers a modifier** :
- `js/particles.js` : ajouter `spawnOffTrackParticle()`
- `js/game.js` : appeler les particules quand le joueur est hors-piste

**Implementation** :

1. Dans `particles.js`, ajouter une nouvelle methode :
```js
spawnOffTrackParticle(x, y, z, speed) {
    if (speed < 0.3) return; // Pas de particules a l'arret

    const colors = [0x4a9f4a, 0x3d8b3d, 0x6b4226]; // Herbe + terre
    const color = colors[Math.floor(Math.random() * colors.length)];

    const size = 0.3 + Math.random() * 0.4;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8
    });

    const particle = new THREE.Mesh(geometry, material);

    // Position : autour des roues arriere avec dispersion
    const spread = 2;
    particle.position.set(
        x + (Math.random() - 0.5) * spread,
        y + 0.2,
        z + (Math.random() - 0.5) * spread
    );

    // Velocite : vers le haut et sur les cotes
    particle.userData = {
        vx: (Math.random() - 0.5) * 0.15,
        vy: 0.05 + Math.random() * 0.1,  // Monte
        vz: (Math.random() - 0.5) * 0.15,
        life: 1.0,
        decay: 2.5  // Disparait vite
    };

    this.scene.add(particle);
    this.particles.push(particle);
}
```

2. Dans `game.js`, dans `animate()`, apres la mise a jour du joueur, ajouter :
```js
// Particules hors-piste
if (!this.track.isOnTrack(this.player.x, this.player.z) && this.player.speed > 0.3) {
    if (Math.random() < 0.4) { // 40% chance par frame = ~24 particules/sec
        this.particles.spawnOffTrackParticle(
            this.player.x, this.player.y, this.player.z, this.player.speed
        );
    }
}
```

**Tests** :
- [ ] Sortir volontairement de la piste -> des mottes de terre/herbe volent autour du kart
- [ ] Rester sur la piste -> aucune particule d'herbe
- [ ] A l'arret hors-piste -> pas de particules (speed < 0.3)
- [ ] A haute vitesse hors-piste -> plus de particules
- [ ] Les particules disparaissent apres ~0.4s (pas d'accumulation)
- [ ] Les couleurs alternent entre vert (herbe) et marron (terre)
- [ ] Performance : pas de chute de FPS meme en roulant longtemps hors-piste

---

### A4. Flash/flammes au turbo start reussi

**Objectif** : Renforcer le feedback visuel d'un turbo start parfait ou bon.

**Fichiers a modifier** :
- `js/particles.js` : ajouter `spawnTurboStartFlames()`
- `js/game.js` : appeler dans `applyTurboStartResult()`
- `js/ui.js` : optionnel, flash deja en place mais peut etre renforce

**Implementation** :

1. Dans `particles.js`, ajouter :
```js
spawnTurboStartFlames(x, y, z, angle, intensity) {
    // intensity: 1.0 = perfect, 0.6 = good
    const count = intensity > 0.8 ? 20 : 10;

    for (let i = 0; i < count; i++) {
        const colors = [0xff6600, 0xffaa00, 0xff3300]; // Orange, jaune, rouge
        const color = colors[Math.floor(Math.random() * colors.length)];

        const size = 0.3 + Math.random() * 0.5 * intensity;
        const geometry = new THREE.SphereGeometry(size, 6, 6);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9
        });

        const particle = new THREE.Mesh(geometry, material);

        // Position : derriere les roues arriere
        const offsetX = (Math.random() - 0.5) * 3;
        particle.position.set(
            x - Math.sin(angle) * 3 + offsetX,
            y + 0.3 + Math.random() * 0.5,
            z - Math.cos(angle) * 3
        );

        // Velocite : vers l'arriere et le haut
        particle.userData = {
            vx: -Math.sin(angle) * (0.1 + Math.random() * 0.2) + (Math.random() - 0.5) * 0.1,
            vy: 0.05 + Math.random() * 0.15,
            vz: -Math.cos(angle) * (0.1 + Math.random() * 0.2),
            life: 1.0,
            decay: 3.0  // Disparait rapidement
        };

        this.scene.add(particle);
        this.particles.push(particle);
    }
}
```

2. Dans `game.js`, `applyTurboStartResult()`, ajouter les flammes :
```js
applyTurboStartResult() {
    if (this.turboStartState === 'perfect') {
        this.player.applyTurboStart();
        this.audio.playBoost();
        this.particles.spawnTurboStartFlames(
            this.player.x, this.player.y, this.player.z, this.player.angle, 1.0
        );
        this.triggerScreenShake(0.8, 10); // Petit shake dramatique
    } else if (this.turboStartState === 'good') {
        this.player.speed = 1.0;
        this.player.boostTime = 20;
        this.player.boostPower = 1.2;
        this.player.isTurboStartFlash = true;
        this.audio.playBoost();
        this.particles.spawnTurboStartFlames(
            this.player.x, this.player.y, this.player.z, this.player.angle, 0.6
        );
    }
}
```

**Tests** :
- [ ] Turbo start parfait (appuyer sur accelerer dans les 200ms apres GO) -> 20 flammes orange/jaune derriere le kart + screen shake
- [ ] Bon depart (200-500ms apres GO) -> 10 flammes, moins intenses, pas de shake
- [ ] Depart rate (> 500ms) -> pas de flammes
- [ ] Depart trop tot (avant GO) -> pas de flammes
- [ ] Les flammes partent vers l'arriere du kart (pas vers l'avant)
- [ ] Les flammes disparaissent en ~0.3s
- [ ] Le flash ecran existant fonctionne toujours en plus des flammes

---

### A5. Notification "DERNIER TOUR" stylisee

**Objectif** : Notification speciale au dernier tour avec animation marquee.

**Fichiers a modifier** :
- `index.html` : ajouter un element dedie au bandeau dernier tour
- `css/style.css` : styles et animation
- `js/ui.js` : methode `showFinalLap()`
- `js/game.js` : appeler `showFinalLap()` au lieu de la notification standard

**Implementation** :

1. Dans `index.html`, ajouter apres le notification div :
```html
<div class="final-lap-banner" id="finalLapBanner">
    <div class="final-lap-text">DERNIER TOUR</div>
</div>
```

2. Dans `style.css` :
```css
.final-lap-banner {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    z-index: 80;
    pointer-events: none;
    opacity: 0;
}

.final-lap-banner.show {
    animation: finalLapAnim 2s ease-out forwards;
}

.final-lap-text {
    font-family: 'Arial Black', sans-serif;
    font-size: 64px;
    font-weight: 900;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 8px;
    text-shadow:
        0 0 20px rgba(255, 107, 53, 0.8),
        0 0 40px rgba(255, 107, 53, 0.6),
        0 0 80px rgba(255, 107, 53, 0.4);
    white-space: nowrap;
}

@keyframes finalLapAnim {
    0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    15%  { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
    30%  { transform: translate(-50%, -50%) scale(1.0); opacity: 1; }
    70%  { transform: translate(-50%, -50%) scale(1.0); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1.0); opacity: 0; }
}
```

3. Dans `ui.js`, ajouter :
```js
showFinalLap() {
    const banner = document.getElementById('finalLapBanner');
    if (!banner) return;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
}
```

4. Dans `game.js`, dans le callback `onLapComplete` (dans `animate()`), quand `player.currentLap === CONFIG.race.totalLaps - 1`, appeler `this.ui.showFinalLap()` au lieu de `this.ui.showNotification('DERNIER TOUR!')`.

Chercher la ligne ou la notification de tour est envoyee. C'est dans le callback qui est passe a `player.update()`. Remplacer :
```js
// Avant
this.ui.showNotification(`TOUR ${lap + 1}!`);

// Apres
if (lap === CONFIG.race.totalLaps - 1) {
    this.ui.showFinalLap();
} else {
    this.ui.showNotification(`TOUR ${lap + 1}!`);
}
```

**Tests** :
- [ ] Arriver au dernier tour -> le bandeau "DERNIER TOUR" apparait en grand au centre de l'ecran
- [ ] L'animation dure ~2s : zoom in -> maintien -> fade out
- [ ] Le texte a un halo orange (text-shadow)
- [ ] Les tours precedents affichent toujours "TOUR X!" en notification normale
- [ ] Le bandeau ne bloque pas le gameplay (pointer-events: none)
- [ ] Si l'IA arrive au dernier tour avant le joueur -> pas de bandeau (c'est le tour du JOUEUR qui compte)
- [ ] Le bandeau ne s'affiche qu'une seule fois (pas a chaque frame)
- [ ] Sur mobile -> le bandeau est visible et pas trop grand (tester responsive)

---

## B. IMPACT MOYEN

---

### B1. Roulette d'items

**Objectif** : Quand on ramasse une boite, l'icone defile entre les items avant de s'arreter. L'item est deja decide, c'est purement visuel.

**Fichiers a modifier** :
- `js/ui.js` : ajouter `startItemRoulette(finalItem)` et `stopItemRoulette()`
- `css/style.css` : animation de defilement
- `js/game.js` : appeler la roulette lors du pickup

**Implementation** :

1. Dans `ui.js`, ajouter :
```js
startItemRoulette(finalItem, duration = 800) {
    const icons = ['boost', 'ball', 'homing_ball', 'slime', 'shield', 'emp'];
    const allIcons = Object.entries(this.itemIcons);
    let frame = 0;
    const totalFrames = Math.floor(duration / 50); // Changement toutes les 50ms

    // Activer le style "a un item" immediatement
    this.elements.itemBox?.classList.add('has-item', 'roulette');

    this._rouletteInterval = setInterval(() => {
        frame++;
        if (frame >= totalFrames) {
            // Arreter sur l'item final
            clearInterval(this._rouletteInterval);
            this._rouletteInterval = null;
            this.elements.itemIcon.textContent = this.itemIcons[finalItem] || '?';
            this.elements.itemBox?.classList.remove('roulette');
            // Bounce final
            this.elements.itemBox?.classList.add('roulette-done');
            setTimeout(() => {
                this.elements.itemBox?.classList.remove('roulette-done');
            }, 300);
            return;
        }

        // Afficher un item aleatoire (accelere puis ralentit)
        const speed = frame < totalFrames * 0.6 ? 1 : Math.max(1, Math.floor((frame - totalFrames * 0.6) / 3));
        if (frame % speed === 0) {
            const randomIcon = allIcons[Math.floor(Math.random() * allIcons.length)];
            this.elements.itemIcon.textContent = randomIcon[1];
        }
    }, 50);
}
```

2. Dans `style.css`, ajouter :
```css
.item-box.roulette .item-icon {
    animation: rouletteFlash 0.1s infinite alternate;
}

@keyframes rouletteFlash {
    from { transform: scale(1); }
    to   { transform: scale(1.1); }
}

.item-box.roulette-done {
    animation: rouletteBounce 0.3s ease-out;
}

@keyframes rouletteBounce {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.3); }
    100% { transform: scale(1); }
}
```

3. Dans `game.js`, dans `updateItems()`, quand le joueur ramasse un item :
```js
// Avant
this.player.currentItem = this.itemManager.getRandomItem(isFirst);

// Apres
const item = this.itemManager.getRandomItem(isFirst);
this.player.currentItem = item;
this.ui.startItemRoulette(item);
```

Note : pendant la roulette, le joueur ne peut pas utiliser l'item (c'est deja le cas car `currentItem` est set immediatement, mais la roulette est juste visuelle).

Pas de roulette pour l'IA (on ne voit pas son HUD).

**Tests** :
- [ ] Ramasser une boite d'items -> les icones defilent rapidement pendant ~800ms
- [ ] Le defilement ralentit progressivement vers la fin
- [ ] L'item final affiche s'arrete sur le bon item (celui qui a ete attribue)
- [ ] Un petit bounce visuel au moment ou l'item final est revele
- [ ] Pendant la roulette, on peut quand meme utiliser l'item (le currentItem est deja attribue)
- [ ] Ramasser un 2eme item pendant la roulette -> pas de bug (l'ancienne roulette est clearee)
- [ ] L'IA ramassant un item -> pas de roulette visible (normal)
- [ ] Performance : l'interval est bien clear quand la roulette se termine
- [ ] En pause pendant la roulette -> la roulette continue au retour (acceptable)

---

### B2. Item visible sur le kart 3D

**Objectif** : Afficher un indicateur visuel au-dessus du kart quand il tient un item.

**Fichiers a modifier** :
- `js/kart.js` : ajouter un mesh indicateur d'item
- `js/game.js` : mettre a jour l'indicateur selon l'item detenu

**Implementation** :

1. Dans `kart.js`, dans `Kart.create()`, ajouter apres la creation du kart :
```js
// Indicateur d'item (sphere flottante au-dessus du kart)
const indicatorGeo = new THREE.SphereGeometry(0.6, 12, 12);
const indicatorMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0
});
const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
indicator.position.y = 3.5; // Au-dessus du casque
kart.add(indicator);
kart.userData.itemIndicator = indicator;
```

2. Ajouter une methode statique dans `Kart` :
```js
static updateItemIndicator(kart, item) {
    const indicator = kart.userData.itemIndicator;
    if (!indicator) return;

    if (!item) {
        indicator.material.opacity = 0;
        return;
    }

    // Couleurs par type d'item
    const colors = {
        'pill_boost': 0x00ff88,
        'ball': 0xff4444,
        'homing_ball': 0xff0000,
        'slime': 0x44ff44,
        'shield': 0xffff00,
        'emp': 0x8844ff
    };

    indicator.material.color.setHex(colors[item] || 0xffffff);
    indicator.material.opacity = 0.8;

    // Rotation + bob
    indicator.rotation.y += 0.05;
    indicator.position.y = 3.5 + Math.sin(Date.now() * 0.005) * 0.3;
}
```

3. Dans `game.js`, dans `animate()`, apres la mise a jour du joueur et de l'IA :
```js
// Indicateur d'item sur les karts
Kart.updateItemIndicator(this.player.mesh, this.player.currentItem);
Kart.updateItemIndicator(this.ai.mesh, this.ai.currentItem);
```

**Tests** :
- [ ] Ramasser un item -> une sphere coloree apparait au-dessus du kart du joueur
- [ ] Chaque type d'item a la bonne couleur (vert=boost, rouge=ball, etc.)
- [ ] La sphere tourne et monte/descend legerement (bob)
- [ ] Utiliser l'item -> la sphere disparait
- [ ] L'IA avec un item -> sphere visible au-dessus de son kart aussi
- [ ] Bouclier actif -> la sphere est jaune
- [ ] La sphere ne genere pas d'ombre/artefact
- [ ] Quand l'item est utilise (projectile lance) -> la sphere disparait immediatement
- [ ] Apres un spinOut, si le joueur a perdu son item -> la sphere disparait

---

### B3. Camera cinematique au countdown

**Objectif** : Plan plus dynamique pendant le countdown, avec rotation autour des karts et snap au GO.

**Fichiers a modifier** :
- `js/game.js` : modifier `updateCamera()` dans le bloc `title/countdown`

**Implementation** :

Remplacer le bloc title/countdown dans `updateCamera()` :

```js
if (this.state === 'title' || this.state === 'countdown') {
    const midX = (this.player.x + this.ai.x) / 2;
    const midZ = (this.player.z + this.ai.z) / 2;
    const midY = (this.player.y + this.ai.y) / 2;

    if (this.state === 'countdown') {
        // Camera qui orbite lentement autour des karts
        const elapsed = (Date.now() - this._countdownStartTime) / 1000; // secondes
        const orbitAngle = this.player.angle + Math.PI + Math.sin(elapsed * 0.5) * 0.4;
        const orbitRadius = 18 - elapsed * 1.5; // Se rapproche progressivement
        const orbitHeight = 8 - elapsed * 0.5;  // Descend legerement

        const targetX = midX + Math.sin(orbitAngle) * Math.max(orbitRadius, 10);
        const targetZ = midZ + Math.cos(orbitAngle) * Math.max(orbitRadius, 10);
        const targetY = midY + Math.max(orbitHeight, 5);

        const lerpFactor = 0.08 * dtFactor;
        this.camera.position.x += (targetX - this.camera.position.x) * lerpFactor;
        this.camera.position.y += (targetY - this.camera.position.y) * lerpFactor;
        this.camera.position.z += (targetZ - this.camera.position.z) * lerpFactor;

        this.camera.lookAt(midX, midY + 1, midZ);

        // FOV : leger zoom in pendant le countdown
        this.camera.fov = 60 - elapsed * 2; // 60 -> ~52
    } else {
        // Titre : vue statique derriere les karts
        const lerpFactor = 0.1 * dtFactor;
        this.camera.position.x += (midX - this.camera.position.x) * lerpFactor;
        this.camera.position.y += (midY + 10 - this.camera.position.y) * lerpFactor;
        this.camera.position.z += (midZ + 20 - this.camera.position.z) * lerpFactor;
        this.camera.lookAt(midX, midY, midZ - 25);
        this.camera.fov = 60;
    }

    this.camera.updateProjectionMatrix();
}
```

Il faut aussi sauvegarder le timestamp du debut du countdown. Dans `startCountdown()`, ajouter :
```js
this._countdownStartTime = Date.now();
```

Au moment du "GO!" (quand `this.state` passe a `'racing'`), la camera va naturellement transitionner vers la chase cam grace au lerp existant dans le bloc racing.

**Tests** :
- [ ] Lancer une course -> pendant le 3-2-1, la camera tourne lentement autour des karts
- [ ] La camera se rapproche progressivement des karts
- [ ] Le FOV se resserre legerement (zoom in subtil)
- [ ] Au "GO!" -> la camera transition en douceur vers la chase cam (pas de snap brutal)
- [ ] Sur l'ecran titre -> la vue reste statique (pas d'orbite)
- [ ] Redemarrer une course (Rejouer) -> le countdown cinematique refonctionne
- [ ] Pas de bug si le joueur appuie trop tot (turbo start "trop tot") pendant l'orbite

---

### B4. Celebration de victoire

**Objectif** : Quand le joueur gagne, confettis + camera orbitale + petit delai avant l'ecran de resultats.

**Fichiers a modifier** :
- `js/particles.js` : ajouter `spawnConfetti()`
- `js/game.js` : modifier `showFinalResults()` pour ajouter une phase celebration
- `css/style.css` : delai d'apparition du result overlay

**Implementation** :

1. Dans `particles.js`, ajouter :
```js
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

        particle.userData = {
            vx: (Math.random() - 0.5) * 0.2,
            vy: 0.1 + Math.random() * 0.15, // Monte d'abord
            vz: (Math.random() - 0.5) * 0.2,
            gravity: -0.008,     // Puis retombe
            rotSpeed: (Math.random() - 0.5) * 0.2,
            life: 1.0,
            decay: 0.3           // Lent (dure ~3s)
        };

        this.scene.add(particle);
        this.particles.push(particle);
    }
}
```

2. Modifier `particles.update()` pour supporter la gravite :
Dans la boucle de mise a jour des particules, apres `p.position.y += d.vy` :
```js
if (d.gravity) {
    d.vy += d.gravity; // Appliquer la gravite
}
if (d.rotSpeed) {
    p.rotation.x += d.rotSpeed;
    p.rotation.z += d.rotSpeed * 0.7;
}
```

3. Dans `game.js`, modifier `showFinalResults()` :
```js
showFinalResults(playerWon) {
    if (this.state === 'finished') return;
    this.state = 'finished';
    this.finishTime = Date.now();
    this.audio.stopEngine();

    if (playerWon) {
        this.audio.playFinish(true);
        // Confettis !
        this.particles.spawnConfetti(this.player.x, this.player.y, this.player.z);
        // Deuxieme salve decalee
        setTimeout(() => {
            this.particles.spawnConfetti(this.player.x, this.player.y, this.player.z);
        }, 500);
    }

    // Delai avant d'afficher les resultats (laisser la celebration)
    const delay = playerWon ? 2000 : 500;
    setTimeout(() => {
        this._showResultsUI(playerWon);
    }, delay);
}
```

Extraire la logique d'affichage des resultats existante dans `_showResultsUI(playerWon)` (tout ce qui etait apres `this.audio.stopEngine()` dans l'ancien `showFinalResults`).

4. Camera de celebration : dans `updateCamera()`, quand `this.state === 'finished'` :
```js
if (this.state === 'finished') {
    // Camera qui orbite autour du joueur pendant la celebration
    const elapsed = (Date.now() - this.finishTime) / 1000;
    const orbitAngle = this.player.angle + elapsed * 0.8; // Rotation lente
    const radius = 12;

    this.camera.position.x = this.player.x + Math.sin(orbitAngle) * radius;
    this.camera.position.z = this.player.z + Math.cos(orbitAngle) * radius;
    this.camera.position.y = this.player.y + 6;

    this.camera.lookAt(this.player.x, this.player.y + 2, this.player.z);
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
}
```

**Tests** :
- [ ] Gagner une course -> confettis colores explosent autour du kart
- [ ] Les confettis montent puis retombent (gravite)
- [ ] Les confettis tournent sur eux-memes (rotation)
- [ ] 2 salves de confettis (t=0 et t=500ms)
- [ ] La camera orbite lentement autour du kart pendant ~2s
- [ ] L'ecran de resultats apparait apres ~2s de celebration
- [ ] Perdre une course -> pas de confettis, resultats apres 500ms seulement
- [ ] Les confettis disparaissent progressivement (pas d'accumulation)
- [ ] La celebration fonctionne sur les deux circuits (oval et infini)
- [ ] Forfait -> pas de confettis (le joueur a perdu)

---

### B5. FOV + camera au dernier tour

**Objectif** : Augmenter la tension au dernier tour avec une camera legerement plus serree.

**Fichiers a modifier** :
- `js/config.js` : ajouter `fovFinalLap`
- `js/game.js` : modifier la cible FOV selon le tour

**Implementation** :

1. Dans `config.js` :
```js
camera: {
    // ... existant
    fovNormal: 75,
    fovBoost: 88,
    fovFinalLap: 72  // Plus serre au dernier tour
}
```

2. Dans `game.js`, dans `updateCamera()`, modifier le calcul de `targetFov` (dans le bloc A1) :
```js
// FOV dynamique
let baseFov = CONFIG.camera.fovNormal;

// Dernier tour : FOV plus serre (tension)
if (this.player.currentLap === CONFIG.race.totalLaps - 1) {
    baseFov = CONFIG.camera.fovFinalLap;
}

const targetFov = (this.player.boostTime > 0)
    ? CONFIG.camera.fovBoost
    : baseFov;

const fovSpeed = (targetFov > this.currentFov) ? 0.15 : 0.05;
this.currentFov += (targetFov - this.currentFov) * fovSpeed * dtFactor;
```

**Tests** :
- [ ] Tours 1 a 4 -> FOV normal a 75
- [ ] Arriver au tour 5 (dernier) -> le FOV se resserre a 72 progressivement
- [ ] Boost au dernier tour -> le FOV passe a 88 (le boost domine)
- [ ] Fin du boost au dernier tour -> retour a 72 (pas a 75)
- [ ] L'effet est subtil mais perceptible (3 degres de difference)
- [ ] Combiner avec A5 (bandeau DERNIER TOUR) -> les deux effets fonctionnent ensemble

---

## Ordre d'implementation recommande

Les ameliorations sont independantes. Ordre suggere par facilite :

| Ordre | ID | Description | Risque |
|-------|-----|------------|--------|
| 1 | A1 | FOV dynamique boost | Faible |
| 2 | A2 | Ombre karts | Faible |
| 3 | A5 | Bandeau dernier tour | Faible |
| 4 | B5 | FOV dernier tour | Faible (etend A1) |
| 5 | A3 | Particules hors-piste | Faible |
| 6 | A4 | Flammes turbo start | Faible |
| 7 | B1 | Roulette items | Moyen (interval) |
| 8 | B2 | Item visible kart 3D | Faible |
| 9 | B3 | Camera countdown | Moyen (transition) |
| 10 | B4 | Celebration victoire | Moyen (refactor showFinalResults) |

---

## Checklist globale post-implementation

- [ ] Toutes les ameliorations fonctionnent sur le circuit STADIUM (oval)
- [ ] Toutes les ameliorations fonctionnent sur le circuit INFINI
- [ ] Pas de regression sur le gameplay existant (vitesse, drift, items, checkpoints)
- [ ] Pas de chute de FPS notable (tester 60fps stable)
- [ ] Le mode pause fonctionne toujours correctement avec les nouveaux effets
- [ ] L'ecran de resultats affiche toujours les bonnes stats
- [ ] La sauvegarde des scores fonctionne toujours
- [ ] Le fantome (ghost) fonctionne toujours
- [ ] La manette fonctionne toujours pour tous les menus et en course
- [ ] Les controles mobiles fonctionnent toujours
- [ ] Resize de la fenetre -> pas de bug visuel
- [ ] Faire 3 courses completes d'affilee sans bug
