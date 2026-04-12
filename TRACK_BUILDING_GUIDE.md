# Guide de Construction de Circuits - Pills Stadium

## REFERENCE : Le Circuit Ovale

Le circuit ovale est LA REFERENCE. Tout nouveau circuit doit suivre EXACTEMENT la meme structure.

---

## Structure d'un Circuit

```javascript
generateMonCircuit() {
    const { curveRadius, width } = CONFIG.track;
    const halfWidth = width / 2;

    // 1. Position de depart
    this.startX = ...;
    this.startZ = ...;
    this.startAngle = Math.PI;  // Face vers -Z

    // 2. Creer la branche
    const mainBranch = new TrackBranch('mon_circuit', {
        name: 'Mon Circuit',
        layer: 0,
        baseElevation: 0
    });

    // 3. Compteur de segments pour l'elevation
    const totalSegments = 100;  // DOIT correspondre au total reel
    let currentSegment = 0;

    // 4. Helper - TOUJOURS UTILISER CELUI-CI
    const addSegmentWithElevation = (x, z, innerX, innerZ, outerX, outerZ) => {
        const elevation = this.getElevationForSegment(currentSegment, totalSegments);
        mainBranch.addSegment(
            { x, z },
            { x: innerX, z: innerZ },
            { x: outerX, z: outerZ },
            elevation
        );
        currentSegment++;
    };

    // 5. Sections du circuit (voir ci-dessous)
    // ...

    // 6. Finaliser
    mainBranch.generateWaypoints(5);
    this.graph.addBranch(mainBranch);
}
```

---

## Les 4 Types de Sections

### 1. Ligne Droite Verticale (vers -Z)

```javascript
// Ligne droite VERS LE BAS (Z diminue)
// Inner a DROITE (+X), Outer a GAUCHE (-X)
for (let i = 0; i < 20; i++) {
    const t = i / 20;
    const x = POSITION_X;
    const z = START_Z - t * LONGUEUR;
    addSegmentWithElevation(x, z, x + halfWidth, z, x - halfWidth, z);
}
```

### 2. Ligne Droite Verticale (vers +Z)

```javascript
// Ligne droite VERS LE HAUT (Z augmente)
// Inner a GAUCHE (-X), Outer a DROITE (+X)
for (let i = 0; i < 20; i++) {
    const t = i / 20;
    const x = POSITION_X;
    const z = START_Z + t * LONGUEUR;
    addSegmentWithElevation(x, z, x - halfWidth, z, x + halfWidth, z);
}
```

### 3. Demi-Cercle (sens horaire)

```javascript
// Demi-cercle de 180° a 360° (ou 0°)
// Exemple : virage en bas de l'ovale
const centerZ = POSITION_Z_DU_CENTRE;
for (let i = 0; i < 30; i++) {
    const t = i / 30;
    const angle = Math.PI + Math.PI * t;  // 180° a 360°
    const x = Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const innerX = Math.cos(angle) * (radius - halfWidth);
    const innerZ = centerZ + Math.sin(angle) * (radius - halfWidth);
    const outerX = Math.cos(angle) * (radius + halfWidth);
    const outerZ = centerZ + Math.sin(angle) * (radius + halfWidth);
    addSegmentWithElevation(x, z, innerX, innerZ, outerX, outerZ);
}
```

### 4. Demi-Cercle (sens anti-horaire)

```javascript
// Demi-cercle de 0° a 180°
// Exemple : virage en haut de l'ovale
const centerZ = POSITION_Z_DU_CENTRE;
for (let i = 0; i < 30; i++) {
    const t = i / 30;
    const angle = Math.PI * t;  // 0° a 180°
    const x = Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    const innerX = Math.cos(angle) * (radius - halfWidth);
    const innerZ = centerZ + Math.sin(angle) * (radius - halfWidth);
    const outerX = Math.cos(angle) * (radius + halfWidth);
    const outerZ = centerZ + Math.sin(angle) * (radius + halfWidth);
    addSegmentWithElevation(x, z, innerX, innerZ, outerX, outerZ);
}
```

---

## Regles INNER / OUTER

**IMPORTANT** : Inner = cote interieur du virage, Outer = cote exterieur

| Direction | Inner | Outer |
|-----------|-------|-------|
| Vers -Z (bas) | +X (droite) | -X (gauche) |
| Vers +Z (haut) | -X (gauche) | +X (droite) |
| Cercle | radius - halfWidth | radius + halfWidth |

---

## Elevation Personnalisee (Pont avec Rampe)

Pour ajouter un pont ou croisement avec rampes progressives :

### 1. Section SUR LE PONT (elevation haute)

```javascript
const bridgeHeight = 8;                // Hauteur du pont
const bridgeZone = radius * 0.5;       // Zone d'effet du pont

for (let i = 0; i < 30; i++) {
    const t = i / 30;
    const angle = ...;
    const x = Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;

    // Calculer l'elevation de base
    let elevation = this.getElevationForSegment(currentSegment, totalSegments);

    // PONT : elevation haute avec rampe progressive
    if (Math.abs(z) < bridgeZone) {  // Condition pour le croisement
        const bridgeFactor = 1 - Math.abs(z) / bridgeZone;  // 1 au centre, 0 aux bords
        // Smoothstep pour une rampe douce
        const smoothFactor = bridgeFactor * bridgeFactor * (3 - 2 * bridgeFactor);
        elevation = Math.max(elevation, bridgeHeight * smoothFactor);
    }

    // Utiliser mainBranch.addSegment directement (pas le helper)
    mainBranch.addSegment(
        { x, z },
        { x: innerX, z: innerZ },
        { x: outerX, z: outerZ },
        elevation
    );
    currentSegment++;
}
```

### 2. Section SOUS LE PONT (elevation basse)

```javascript
const underpassZone = radius * 0.5;    // Meme zone que le pont

for (let i = 0; i < 30; i++) {
    const t = i / 30;
    const angle = ...;
    const x = Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;

    // Calculer l'elevation de base
    let elevation = this.getElevationForSegment(currentSegment, totalSegments);

    // SOUS LE PONT : elevation basse avec rampe progressive
    if (Math.abs(z) < underpassZone) {  // Meme condition que le pont
        const underpassFactor = Math.abs(z) / underpassZone;  // 0 au centre, 1 aux bords
        const underpassElevation = elevation * underpassFactor;
        elevation = Math.min(elevation, Math.max(0.2, underpassElevation));
    }

    // Utiliser mainBranch.addSegment directement (pas le helper)
    mainBranch.addSegment(
        { x, z },
        { x: innerX, z: innerZ },
        { x: outerX, z: outerZ },
        elevation
    );
    currentSegment++;
}
```

### Regles pour les Ponts

| Parametre | Valeur recommandee | Description |
|-----------|-------------------|-------------|
| bridgeHeight | 6-10 | Hauteur du pont (permet passage dessous) |
| bridgeZone | radius * 0.4-0.6 | Zone d'effet (rampes + plateau) |
| elevation min | 0.2 | Hauteur minimale sous le pont |

**IMPORTANT** : La difference de hauteur entre pont et passage doit etre >= 6 pour permettre aux karts de passer.

---

## Circuit Ovale (CODE COMPLET)

```javascript
generateOvalTrack() {
    const { straightLength, curveRadius, width } = CONFIG.track;
    const halfLength = straightLength / 2;
    const halfWidth = width / 2;

    this.startX = -curveRadius;
    this.startZ = straightLength / 2;
    this.startAngle = Math.PI;

    const mainBranch = new TrackBranch('oval_main', {
        name: 'Circuit Oval',
        layer: 0,
        baseElevation: 0
    });

    const totalSegments = 100;
    let currentSegment = 0;

    const addSegmentWithElevation = (x, z, innerX, innerZ, outerX, outerZ) => {
        const elevation = this.getElevationForSegment(currentSegment, totalSegments);
        mainBranch.addSegment({ x, z }, { x: innerX, z: innerZ }, { x: outerX, z: outerZ }, elevation);
        currentSegment++;
    };

    // Section 1: Ligne droite gauche (vers -Z) - 20 segments
    for (let i = 0; i < 20; i++) {
        const t = i / 20;
        const x = -curveRadius;
        const z = halfLength - t * straightLength;
        addSegmentWithElevation(x, z, x + halfWidth, z, x - halfWidth, z);
    }

    // Section 2: Demi-cercle bas - 30 segments
    for (let i = 0; i < 30; i++) {
        const t = i / 30;
        const angle = Math.PI + Math.PI * t;
        const x = Math.cos(angle) * curveRadius;
        const z = -halfLength + Math.sin(angle) * curveRadius;
        const innerX = Math.cos(angle) * (curveRadius - halfWidth);
        const innerZ = -halfLength + Math.sin(angle) * (curveRadius - halfWidth);
        const outerX = Math.cos(angle) * (curveRadius + halfWidth);
        const outerZ = -halfLength + Math.sin(angle) * (curveRadius + halfWidth);
        addSegmentWithElevation(x, z, innerX, innerZ, outerX, outerZ);
    }

    // Section 3: Ligne droite droite (vers +Z) - 20 segments
    for (let i = 0; i < 20; i++) {
        const t = i / 20;
        const x = curveRadius;
        const z = -halfLength + t * straightLength;
        addSegmentWithElevation(x, z, x - halfWidth, z, x + halfWidth, z);
    }

    // Section 4: Demi-cercle haut - 30 segments
    for (let i = 0; i < 30; i++) {
        const t = i / 30;
        const angle = Math.PI * t;
        const x = Math.cos(angle) * curveRadius;
        const z = halfLength + Math.sin(angle) * curveRadius;
        const innerX = Math.cos(angle) * (curveRadius - halfWidth);
        const innerZ = halfLength + Math.sin(angle) * (curveRadius - halfWidth);
        const outerX = Math.cos(angle) * (curveRadius + halfWidth);
        const outerZ = halfLength + Math.sin(angle) * (curveRadius + halfWidth);
        addSegmentWithElevation(x, z, innerX, innerZ, outerX, outerZ);
    }

    mainBranch.generateWaypoints(5);
    this.graph.addBranch(mainBranch);
}
```

---

## Checklist Nouveau Circuit

- [ ] Position de depart (startX, startZ) sur la piste
- [ ] startAngle correct (Math.PI = vers -Z)
- [ ] totalSegments = somme de tous les segments
- [ ] Utiliser le helper addSegmentWithElevation
- [ ] Inner/Outer corrects selon la direction
- [ ] Cercles : inner = radius - halfWidth, outer = radius + halfWidth
- [ ] Circuit ferme (dernier point proche du premier)
- [ ] generateWaypoints(5) a la fin
- [ ] graph.addBranch(mainBranch) a la fin

---

## Système de Checkpoints et Tours

### Comment ça fonctionne

Les checkpoints sont créés automatiquement par `createCheckpoints()` :
- **Checkpoint 0** (ROUGE) : à 25% du circuit
- **Checkpoint 1** (BLEU) : à 50% du circuit
- **Checkpoint 2** (VERT) : à 75% du circuit
- **Checkpoint 3** (JAUNE) : à 0% = ligne d'arrivée = segment 0

### Règle CRITIQUE : Le segment 0 DOIT être au départ

```javascript
// CORRECT : segments générés à partir de la position de départ
this.startX = ...;  // Position de départ
this.startZ = ...;

for (let i = 0; i < totalSegments; i++) {
    // Le segment 0 est au point de départ
    // Ainsi checkpoint 3 (finish) = segment 0 = départ
}
```

### Pour un circuit paramétrique (comme le figure-8)

```javascript
const startTNorm = 0.75;  // Position de départ sur la courbe

// IMPORTANT : Générer les segments EN COMMENÇANT par startTNorm
for (let i = 0; i < totalSegments; i++) {
    const tNorm = (startTNorm + i / totalSegments) % 1.0;  // Décalage !
    // ...
}
```

### Angle de départ

```javascript
// La tangente donne la direction de la piste
const startTan = getTangent(startTNorm);

// L'angle doit correspondre au mouvement du joueur :
// mouvement = (sin(angle), cos(angle))
// Donc : angle = atan2(tan.x, tan.z)
this.startAngle = Math.atan2(startTan.x, startTan.z);
```

### Ordre de passage pour compléter un tour

1. Départ (segment 0) → currentCheckpoint = 0
2. Passer ROUGE (25%) → currentCheckpoint = 1
3. Passer BLEU (50%) → currentCheckpoint = 2
4. Passer VERT (75%) → currentCheckpoint = 3
5. Passer JAUNE (0%/finish) → currentCheckpoint = 0, currentLap++

---

## Circuit Infini / Figure-8 (CODE COMPLET)

Exemple de circuit paramétrique avec croisement (pont).

```javascript
generateInfiniTrack() {
    const { width } = CONFIG.track;
    const halfWidth = width / 2;

    // Configuration du circuit
    const baseRadius = 250;     // Rayon de base
    const scaleZ = 300;         // Amplitude en Z
    const bridgeHeight = 6;     // Hauteur du pont
    const rampWidth = 0.12;     // 12% du circuit pour les rampes
    const totalSegments = 500;

    // Échelles des 4 virages (difficulté croissante)
    const s1 = 1.8, s2 = 1.4, s3 = 1.0, s4 = 0.7;

    // Fonctions utilitaires
    const smoothstep = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;

    const getScale = (tNorm) => {
        if (tNorm < 0.25) return lerp(s4, s1, smoothstep(tNorm / 0.25));
        if (tNorm < 0.5) return lerp(s1, s2, smoothstep((tNorm - 0.25) / 0.25));
        if (tNorm < 0.75) return lerp(s2, s3, smoothstep((tNorm - 0.5) / 0.25));
        return lerp(s3, s4, smoothstep((tNorm - 0.75) / 0.25));
    };

    // Formule de la lemniscate (figure-8)
    const getPoint = (tNorm) => {
        const t = tNorm * Math.PI * 2;
        const scale = getScale(tNorm);
        const x = Math.sin(t) * baseRadius * scale;
        const z = Math.sin(2 * t) * scaleZ;

        // Élévation pour le pont (autour de tNorm = 0.5)
        let y = 0;
        const distToHalf = Math.abs(tNorm - 0.5);
        if (distToHalf < rampWidth) {
            const rampProgress = 1 - (distToHalf / rampWidth);
            y = bridgeHeight * smoothstep(rampProgress);
        }
        return { x, y, z };
    };

    // Tangente (dérivée analytique)
    const getTangent = (tNorm) => {
        const t = tNorm * Math.PI * 2;
        const scale = getScale(tNorm);
        const dx = Math.cos(t) * baseRadius * scale;
        const dz = 2 * Math.cos(2 * t) * scaleZ;
        const len = Math.sqrt(dx * dx + dz * dz);
        return { x: dx / len, z: dz / len };
    };

    // Position de départ (loin du croisement)
    const startTNorm = 0.75;
    const startPt = getPoint(startTNorm);
    const startTan = getTangent(startTNorm);

    this.startX = startPt.x;
    this.startZ = startPt.z;
    this.startAngle = Math.atan2(startTan.x, startTan.z);  // Direction de la tangente

    const mainBranch = new TrackBranch('infini_main', { name: 'Circuit Infini', layer: 0 });

    // IMPORTANT : Générer les segments EN COMMENÇANT par startTNorm
    for (let i = 0; i < totalSegments; i++) {
        const tNorm = (startTNorm + i / totalSegments) % 1.0;  // Décalage !
        const pt = getPoint(tNorm);
        const tan = getTangent(tNorm);

        // Perpendiculaire via produit vectoriel
        const rightX = -tan.z;
        const rightZ = tan.x;

        mainBranch.addSegment(
            { x: pt.x, z: pt.z },
            { x: pt.x - rightX * halfWidth, z: pt.z - rightZ * halfWidth },
            { x: pt.x + rightX * halfWidth, z: pt.z + rightZ * halfWidth },
            pt.y
        );
    }

    mainBranch.generateWaypoints(5);
    this.graph.addBranch(mainBranch);
}
```

---

## Circuits avec Croisements (Ponts)

Pour les circuits qui se croisent (comme le figure-8), des règles supplémentaires s'appliquent :

### 1. Inclure Y dans centerPoints

```javascript
// Dans syncFromBranch() - déjà fait automatiquement
this.centerPoints = branch.segments.map(s => ({ x: s.x, y: s.y, z: s.z }));
```

### 2. Filtrage par niveau Y

Les fonctions suivantes doivent ignorer les segments à un niveau Y très différent :
- `get3DElevationAt(x, z, currentY)` - passer le Y actuel
- `getClosestTrackPoint(x, z, playerY)` - passer le Y actuel

### 3. Tolérance Y

```javascript
const maxYDiff = bridgeHeight / 2;  // Ex: pont à 6m → tolérance de 3m
if (Math.abs(segment.y - playerY) > maxYDiff) {
    continue;  // Ignorer ce segment
}
```

### 4. Couches pour collisions murs

```javascript
// Dans player.js et ai.js
this.currentLayer = this.y > 3.0 ? 1 : 0;  // Seuil à mi-hauteur du pont
```

---

## Ajouter au Jeu

1. Ajouter la fonction `generateMonCircuit()` dans la classe Track
2. Modifier `generate()` :
```javascript
if (trackType === 'mon_circuit') {
    this.generateMonCircuit();
}
```
3. Ajouter l'option dans index.html :
```html
<option value="mon_circuit">Mon Circuit</option>
```
