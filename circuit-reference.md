# Guide de Construction de Circuits - Pills Stadium

Reference technique basee sur le circuit Infini (figure-8 avec pont).
Objectif : comprendre chaque systeme pour creer des circuits ambitieux.

---

## 1. ARCHITECTURE D'UN CIRCUIT

### Concept : branche de base + branches superposees

Chaque circuit a une **branche de base** (le sol du monde) et zero ou plusieurs
**branches superposees** (ponts, tunnels, structures elevees).

- **Branche de base** : boucle complete, contient tous les segments pour la navigation
  (waypoints, checkpoints, progression). C'est la surface par defaut du monde.
  Le systeme d'elevation la consulte TOUJOURS, sans filtre de distance.

- **Branche superposee** : section locale qui couvre une structure. Le systeme
  d'elevation ne la consulte que si le kart est a proximite (filtre distance).

Quand les deux surfaces se superposent en XZ (croisement), l'algorithme
"closest floor below" choisit la surface la plus haute SOUS le kart.

### Pipeline de creation

```
generateTrack()
  1. Definir la courbe (getPoint, getTangent)
  2. Calculer l'elevation par segment (relief + structures)
  3. Generer les branches :
     - Branche de base : boucle complete, elevation = relief seulement
     - Branches superposees : sections locales, elevation = structure
     - bridgeZone metadata : indices des segments base qui sont "waypoint-only"
       (exclus de l'elevation, du mesh et des murs — gardes pour la navigation)
  4. syncFromActiveBranch() → centerPoints, innerPoints, outerPoints
  5. createTrackMesh()      → mesh base (skip zone pont) + mesh bridge separe
  6. createWalls()           → murs base (skip zone pont) + murs bridge separes
  7. createCheckpoints()     → 4 checkpoints a 25/50/75/0%
  8. createBoostZones()      → pads de boost
  9. createStartLine()       → damier visuel
  10. buildWallGrid()        → grille spatiale pour collisions (auto au 1er appel)
```

### TrackBranch - Unite de base

Chaque branche contient :
- `segments[]` : points centraux `{x, y, z}` (la "colonne vertebrale")
- `innerPoints[]` : bord gauche de la piste
- `outerPoints[]` : bord droit de la piste
- `waypoints[]` : indices pour la navigation IA (generes tous les N segments)

Le segment 0 = position de depart. Les checkpoints se placent relatifs a cet index.

### TrackGraph - Gestionnaire multi-branches

```javascript
this.graph = new TrackGraph();

// Branche de base (premiere ajoutee = active)
const ground = new TrackBranch('infini_ground', { name: 'Sol', layer: 0 });
this.graph.addBranch(ground);  // → activeBranchId = 'infini_ground'

// Branche superposee
const bridge = new TrackBranch('infini_bridge', { name: 'Pont', layer: 1 });
this.graph.addBranch(bridge);

// Metadata : segments base dans la zone pont (waypoint-only)
this.bridgeZone = { groundStartIdx: 315, groundEndIdx: 435, bridgeSegments: 120 };
```

La branche active (`activeBranchId`) determine `centerPoints` pour la navigation.
Les circuits simples (Oval, Volcan) n'ont qu'une branche — pas de bridgeZone.

---

## 2. COURBE ET GEOMETRIE

### Comment Infini definit sa forme

```javascript
// Lemniscate (figure-8) parametrique
getPoint(tNorm) {
    const t = tNorm * Math.PI * 2;
    const scale = getScale(tNorm);    // Rayon variable par quadrant
    return {
        x: Math.sin(t) * baseRadius * scale,
        z: Math.sin(2 * t) * scaleZ
    };
}
```

**Parametres cles :**
- `baseRadius = 250` : taille du circuit
- `scaleZ = 300` : etirement vertical du "8"
- `totalSegments = 500` : resolution (~4.8m entre segments)

### Virages a difficulte variable

```javascript
s1 = 1.8  // Virage 1 : tres facile (rayon 450m)
s2 = 1.4  // Virage 2 : moyen (rayon 350m)
s3 = 1.0  // Virage 3 : difficile (rayon 250m)
s4 = 0.7  // Virage 4 : tres difficile (rayon 175m)
```

Transition douce entre quadrants via `smoothstep(t) = t*t*(3-2*t)`.

### Tangente analytique (pour les bords de piste)

```javascript
getTangent(tNorm) {
    const t = tNorm * Math.PI * 2;
    const scale = getScale(tNorm);
    const dx = Math.cos(t) * baseRadius * scale;
    const dz = 2 * Math.cos(2 * t) * scaleZ;
    const len = Math.sqrt(dx*dx + dz*dz);
    return { x: dx/len, z: dz/len };
}
```

La perpendiculaire `(-tan.z, tan.x)` donne les bords inner/outer.

### Creer n'importe quelle forme

Pour un nouveau circuit, il suffit de definir `getPoint(tNorm)` et `getTangent(tNorm)` :
- `tNorm` va de 0 a 1 (tour complet)
- La boucle de generation fait le reste :

```javascript
for (let i = 0; i < totalSegments; i++) {
    const tNorm = (startTNorm + i / totalSegments) % 1.0;
    const pt = getPoint(tNorm);
    const tan = getTangent(tNorm);
    const rightX = -tan.z, rightZ = tan.x;  // Perpendiculaire

    branch.addSegment(
        { x: pt.x, z: pt.z },                           // Centre
        { x: pt.x - rightX * halfWidth, z: pt.z - rightZ * halfWidth },  // Inner
        { x: pt.x + rightX * halfWidth, z: pt.z + rightZ * halfWidth },  // Outer
        elevation
    );
}
```

---

## 3. ELEVATION ET RELIEF 3D

### Relief de base (terrain ondule)

```javascript
getElevationForSegment(index, total) {
    const t = index / total;
    return max(0,
        baseHeight                                          // 1m minimum
        + sin(t * 2PI * mainHillFrequency) * mainHillAmplitude  // Collines (~8m)
        + sin(t * 2PI * bumpFrequency) * bumpAmplitude          // Bosses (~1.5m)
        + sin(t * 2PI * 7) * 0.3                               // Micro-detail
    );
}
```

Configurable via `CONFIG.elevation` :
```
baseHeight: 1, mainHillAmplitude: 8, mainHillFrequency: 1,
bumpAmplitude: 1.5, bumpFrequency: 3
```

### Structures elevees (pont d'Infini)

```javascript
getBridgeElevation(tNorm) {
    const distToHalf = Math.abs(tNorm - 0.5);
    if (distToHalf < rampWidth) {  // rampWidth = 0.12 (12% du circuit)
        const rampProgress = 1 - (distToHalf / rampWidth);
        return bridgeHeight * smoothstep(rampProgress);  // bridgeHeight = 12m
    }
    return 0;
}
```

### Combinaison relief + structure

```javascript
if (bridgeY > 0) {
    // Zone du pont : transition douce relief → hauteur fixe 22m
    const bridgeBaseHeight = 10 + bridgeHeight;  // 22m
    const rampFactor = bridgeY / bridgeHeight;   // 0 a 1
    elevation = reliefY * (1 - rampFactor) + bridgeBaseHeight * rampFactor;
} else {
    elevation = reliefY;  // Terrain normal
}
```

**Principe exploitable :** n'importe quelle structure (tunnel, helice, tremplin) peut etre
ajoutee en definissant une fonction `getStructureElevation(tNorm)` et en la combinant
avec le relief de base via interpolation.

### Lookup d'elevation en temps reel (get3DElevationAt)

**Approche "closest floor below"** (inspiree Mario Kart) :
Le Y actuel du kart est la seule source de verite. Pas de branche trackee,
pas de transitions. Purement geometrique.

**Algorithme :**
```
1. Pour chaque branche du graphe :
   a. _findClosestSurfaceSegment : trouver le segment surface le plus proche en XZ
      (exclut les segments "waypoint-only" de la branche de base dans la zone pont)
   b. Branche de base : TOUJOURS incluse (pas de filtre distance)
      Branches superposees : incluses seulement si distSq < 900 (30 unites)
   c. _interpolateElevation : interpolation bilineaire sur le quad → candidat Y

2. Selection du candidat :
   - 1 seul candidat → retourner directement
   - Plusieurs candidats (croisement) → "closest floor below" :
     Prendre le Y le plus haut qui est SOUS le kart (currentY + 2m de marge)
   - Pas de currentY (items, init) → prendre le plus bas (sol)
```

**Pourquoi base sans filtre distance** : la branche de base est le sol du monde.
Elle doit TOUJOURS repondre, meme si le kart est sur une structure superposee.
Sinon, si les deux branches sont trop loin → aucun candidat → chute a Y=0.

**_findClosestSurfaceSegment** — recherche par branche :
```
1. Recherche locale : ±80 segments depuis le cache (rapide, O(160))
   Exclut les segments waypoint-only (bridgeZone dans la branche de base)
2. Fallback complet si bestDist > 400 (20 unites) : scan de tous les segments
```

**_interpolateElevation** — interpolation bilineaire sur quad :
```
1. Trouver le segment le plus proche (bestIdx)
2. Former un quad avec le voisin le plus proche (prev ou next)
3. Projeter le point sur les axes du quad (along + perp)
4. Interpoler les 4 coins : yA, yB inner/outer
5. Resultat = lerp(lerp(innerA, outerA, s), lerp(innerB, outerB, s), t) + 0.2
```

**Cache par racer ET par branche** : `_elevCache[callerId_branchId]`
Joueur = callerId 0, IA = callerId 1. Chaque combinaison kart+branche a son propre
index cache. Empeche la pollution entre karts et entre branches.

**getSlopeAt** : signature `(x, z, angle, callerId, currentY)`.
Passe callerId et currentY aux 4 appels internes de get3DElevationAt.
Joueur passe callerId=0, IA passe callerId=1. Evite la pollution du cache de pente.

### Anti-teleportation (fix figure-8)

```javascript
const maxYJump = 1.5;  // 1.5m max par frame
this.targetY = clamp(rawTargetY, this.y - maxYJump, this.y + maxYJump);
```

Les rampes normales changent ~0.3m/frame. Un saut > 1.5m = erreur de lookup au croisement.

### Lissage Y asymetrique

```javascript
const ySpeed = yDiff > 0
    ? Math.min(0.7 * dtFactor, 1.0)   // Montee : suivi rapide (evite s'enfoncer dans la rampe)
    : Math.min(0.15 * dtFactor, 0.5); // Descente : lissage doux (pas de chute brutale)
```

---

## 4. SYSTEME DE LAYERS (MULTI-NIVEAUX)

### Comment ca fonctionne

```
Layer 0 : sol (Y < 15m)
Layer 1 : pont/eleve (Y > 15m)
```

Chaque kart a `this.currentLayer` mis a jour chaque frame :
```javascript
this.currentLayer = this.y > 15 ? 1 : 0;
```

### Murs filtrés par elevation

Les murs stockent leur elevation :
```javascript
wallSegment = { x1, z1, x2, z2, elevation, layer }
// layer = elevation > 15 ? 1 : 0
```

La collision mur filtre par proximite d'elevation (±10m) :
```javascript
if (playerY !== null && seg.elevation !== undefined) {
    if (Math.abs(playerY - seg.elevation) > 10) continue;
}
```

**Resultat** : un kart au sol (Y~5m) ignore les murs du pont (elev~22m),
et un kart sur le pont ignore les murs au sol. Plus flexible qu'un filtre layer binaire.

### Murs base vs murs bridge

Pour les circuits avec structures superposees :
- **Murs base** : generes pour tous les segments SAUF la zone pont (bridgeZone skip)
- **Murs bridge** : generes separement depuis la branche superposee
- Chaque set a ses propres elevations → le filtre ±10m distingue automatiquement

### Kart-kart collision entre layers

```javascript
if (kartA.currentLayer !== kartB.currentLayer) {
    return false;  // Pas de collision entre niveaux differents
}
```

### Pour plus de 2 layers

Le systeme supporte deja N layers (layer est un nombre, pas un boolean).
Pour un circuit a 3 niveaux : sol=0, mezzanine=1, pont=2.
Il faut juste ajuster les seuils dans player.js et ai.js.

---

## 5. CHECKPOINTS ET TOURS

### Placement automatique

```javascript
// 4 checkpoints equi-repartis
indices = [floor(n*0.25), floor(n*0.50), floor(n*0.75), 0];

checkpoint = {
    x, z, y,      // Position 3D
    nx, nz,        // Direction (tangente normalisee)
    width,         // Largeur de la zone de detection
    index          // Index du segment
}
```

### Detection (joueur)

```javascript
perpDist = |cross(kart-cp, normal)|     // Distance laterale
alongDist = |dot(kart-cp, normal)|      // Distance le long de la piste

if (perpDist < width/2 && alongDist < 4) {
    // Checkpoint valide !
}
```

**Filtre Y** : `if (|kart.y - cp.y| > 25) return;`
Tolerance large (25m) pour les circuits avec pont. Les checkpoints utilisent le Y
de la branche de base (sol). Un kart sur le pont (Y=22m) passe un checkpoint au sol
(Y=5m) — la difference de 17m est dans la tolerance.
L'anti-teleportation Y et le "closest floor below" empechent les abus.

### Comptage des tours

```
checkpoints: 0 → 1 → 2 → 3 → retour a 0 = +1 tour
Sequentiel strict : impossible de sauter un checkpoint.
currentLap >= CONFIG.race.totalLaps → course terminee.
```

### Pour des circuits complexes

Points d'attention :
- Le checkpoint a 50% d'Infini tombe pres de la zone pont
- La tolerance Y de 25m permet au kart sur le pont OU au sol de valider
- La progression sequentielle (0→1→2→3→0) empeche de sauter des checkpoints
- L'anti-teleportation Y empeche le kart de sauter au mauvais niveau

---

## 6. MURS ET COLLISIONS

### Generation des murs

**Murs de la branche de base** : pour chaque segment (hors bridgeZone), 2 murs
(inner + outer) avec :
- 3 faces : exterieur, interieur, dessus (18 vertices par mur)
- Hauteur : 3 unites au-dessus de la surface
- Elevation moyenne stockee pour le filtre collision

**Murs des branches superposees** : generes separement avec la meme structure,
mais depuis les innerPoints/outerPoints de la branche superposee.
Layer = 1 pour les murs bridge.

### Grille spatiale (collisions rapides)

```javascript
_wallGridSize = 40;  // Cellules de 40x40 unites
_cellKey(cx, cz) = (cx + 500) * 10000 + (cz + 500);
```

- Supporte des circuits de -20000 a +20000 unites
- Query : 3x3 cellules autour du kart (9 cellules max)
- Lazy init : construit au premier appel de collision

### Resolution de collision

```javascript
// Trouver le mur le plus proche
for each segment in neighboring cells:
    dist = pointToSegment(kartPos, segStart, segEnd)
    if dist < kartRadius → collision !

// Repousser le kart hors du mur
normal = normalize(kartPos - closestPoint)
overlap = radius - dist + 0.5  // 0.5 = buffer
newPos = kartPos + normal * overlap
speed *= 0.95  // Perte de vitesse
```

---

## 7. NAVIGATION IA

### Waypoints

```javascript
branch.generateWaypoints(5);  // 1 waypoint tous les 5 segments = 100 waypoints
```

L'IA suit les waypoints avec `lookAhead = 3` (vise 3 waypoints devant).

### Gestion multi-niveaux

```javascript
// Si le waypoint cible est a un Y tres different, chercher le suivant au bon niveau
// Tolerance large (25m) pour circuits avec pont (waypoint sol Y=5, kart pont Y=22)
if (Math.abs(target.y - this.y) > 25) {
    // Scan en avant pour trouver un waypoint au meme Y
    for (offset = 1; offset <= lookAhead; offset++) { ... }
}
```

Les waypoints viennent de la branche de base (sol). Sur le pont, le kart est a Y=22
mais les waypoints au croisement sont a Y=5. La tolerance de 25m permet a l'IA de
continuer a naviguer sans se bloquer. Le systeme d'elevation (closest floor below)
gere la hauteur reelle du kart independamment des waypoints.

### Avancement des waypoints

```javascript
if (distXZ < waypointRadius && distY < 25) {
    currentWaypoint = (currentWaypoint + 1) % n;
}
```

Double condition : proche en XZ ET tolerance Y large pour structures superposees.

### Detection de virages

```javascript
// Regarde 10 waypoints plus loin
farAngleDiff = |angle vers waypoint lointain - angle courant|
if (farAngleDiff > 0.5 rad) {
    targetSpeed *= 0.7;  // Ralentit de 30% en virage
}
```

### Rubber banding

```javascript
progressDiff = playerProgress - aiProgress;
if (progressDiff > 50) {
    // Joueur devant → IA accelere (+15% max)
    targetSpeed *= 1 + min(progressDiff/500, 0.15);
} else if (progressDiff < -50) {
    // IA devant → IA ralentit (-10% max)
    targetSpeed *= 1 - min(abs(progressDiff)/500, 0.10);
}
```

### Systeme d'erreurs (humanisation)

3 types d'erreurs aleatoires :
- `oversteer` : tourne 1.8x trop (perd le controle)
- `bad_line` : bruit directionnel (zigzag)
- `late_brake` : ignore le ralentissement en virage

Frequence ajustee par difficulte (facile: 8-15s, difficile: 30-45s).

---

## 8. CAMERA ET RENDU

### Camera chase (course)

```javascript
camX = kart.x - sin(angle) * camDistance
camY = kart.y + camHeight  // 8m au-dessus
camZ = kart.z - cos(angle) * camDistance
lookAt(kart.x + sin(angle) * lookAhead, kart.y + 1.5, ...)
```

La camera suit l'elevation du kart naturellement.

### Mesh fusionne (performance)

**Branche de base** = 1 BufferGeometry fusionne :
- 2 triangles par segment (quad center)
- Skip les segments bridgeZone (waypoint-only, pas de surface physique)
- Vertex colors calcules depuis la hauteur (gris clair en haut, fonce en bas)

**Branches superposees** = 1 BufferGeometry par branche :
- Mesh separe avec ses propres vertex colors (gris-bleu pour le pont)
- Piliers generes automatiquement tous les 10 segments (si Y > 5m)

**Murs** = 2 meshes fusionnes par branche (inner + outer).
Total pour Infini : 2 meshes surface + 4 meshes murs + piliers.

### Minimap

- Canvas 2D 180x130px
- Projection XZ uniquement (pas de Y)
- Calcule les bornes du circuit automatiquement
- Points : joueur (rouge 5px), IA (bleu 5px), fantome (blanc 4px)

### Particules

- Drift/boost : spawn a `kart.y + offset`
- Trails : hardcode a Y=0.1 (ne suit pas l'elevation — a corriger pour circuits eleves)
- Off-track : spawn a la position du kart

---

## 9. ITEMS ET PROJECTILES

### Projectiles (missiles, etc.)

```javascript
this.y = track.get3DElevationAt(this.x, this.z, this.y, 2) || 0;
```

Suivent le terrain en temps reel avec callerId=2 (cache dedie).
Passent `this.y` comme currentY → "closest floor below" les garde sur le bon niveau.
Le filtre Y dans checkHit (|kart.y - projectile.y| > 10) empeche les hits cross-level.

### Boost pads

Position et elevation recuperees depuis le segment de la branche :
```javascript
const closest = branch.findClosestSegment(def.x, def.z);
elevation = branch.segments[closest.index].y + 0.1;
```

### Obstacles (slime)

Deposes a `kart.y` — position Y fixe apres depot. Si deposes sur une rampe,
ils restent a la hauteur de depot (pas de mise a jour dynamique).

---

## 10. VALEURS CLES POUR LA CONCEPTION

### Dimensions

| Element | Valeur | Impact |
|---------|--------|--------|
| Largeur piste | 80 unites | Espace de manoeuvre, detection off-track |
| Rayon kart | 2.5 unites | Collision murs et karts |
| Rayon collision kart-kart | 5.0 unites | = 2 * kartRadius |
| Hauteur murs | 3 unites | Au-dessus de la surface |
| Grille collision | 40 unites/cellule | Taille max d'un mur |
| Segments Infini | 500 | ~4.8m entre segments |

### Tolerances et seuils

| Systeme | Seuil | Fonction |
|---------|-------|----------|
| Layer sol/pont | Y > 15m | Determine la layer du kart |
| Closest floor below | currentY + 2m | Marge pour accepter une surface au-dessus du kart |
| Anti-teleportation | 1.5m/frame max | Empeche les sauts Y brusques |
| Checkpoint Y | ±25m | Tolerance large (pont Y=22 vs sol Y=5 = diff 17) |
| Waypoint IA Y | ±25m | Idem checkpoints |
| Waypoint IA XZ | waypointRadius (40 Infini) | Distance pour valider un waypoint |
| Checkpoint joueur along | 4 unites | Profondeur zone de detection |
| Checkpoint IA along | 2 unites | Plus strict que le joueur |
| Overlay distance | 900 (30m) dist² | Seuil pour branches superposees |
| Fallback segment search | 400 (20m) dist² | Declenche scan complet dans une branche |
| Recherche locale | ±80 segments | Rayon du cache par branche |
| Mur collision Y | ±10m | Ignore les murs trop loin en elevation |
| Projectile/obstacle hit Y | ±10m | Ignore les hits cross-level |

### Vitesses

| Parametre | Valeur |
|-----------|--------|
| Joueur max | 2.2 |
| Joueur boost | 3.3 |
| IA (normal) | 2.0 |
| IA (hard) | 2.3 |
| Distance/frame a 2.2 | ~2.2 unites |
| Distance/frame a 3.3 | ~3.3 unites |

---

## 11. EXPLOITER CES SYSTEMES POUR DES CIRCUITS AMBITIEUX

### Ce qui fonctionne deja

- **Croisements** : "closest floor below" gere les intersections purement par geometrie
- **Elevation variable** : interpolation bilineaire precise sur tout le circuit
- **Multi-niveaux** : branche base + branches superposees, murs et collisions filtres par elevation
- **IA adaptative** : navigation Y-aware (tolerance 25m), rubber banding, erreurs humaines
- **Anti-teleportation** : 1.5m/frame max + lissage Y asymetrique
- **Caches par racer ET par branche** : pas d'interference entre karts ni entre branches
- **Grille spatiale** : collisions O(1) quelle que soit la complexite du circuit
- **Architecture base/overlay** : le sol repond toujours, les structures sont locales

### Checklist complete pour creer un nouveau circuit

Un circuit ne se resume PAS a "deux fonctions". Voici TOUT ce qu'il faut definir,
en prenant Infini comme modele. Chaque etape est necessaire.

#### A. Geometrie de la courbe
- `getPoint(tNorm)` : position XZ sur la courbe (0→1 = tour complet)
- `getTangent(tNorm)` : derivee analytique (direction + perpendiculaire pour les bords)
- Parametres de forme : rayon, echelle, facteurs de courbure par section
- Si virages a difficulte variable : `getScale(tNorm)` avec transitions smoothstep

#### B. Elevation et structures (architecture base/overlay)
- **Branche de base** : boucle complete, elevation = relief seulement
  - `getElevationForSegment(index, total)` : collines, bosses
  - Config : baseHeight, mainHillAmplitude/Frequency, bumpAmplitude/Frequency
  - Les segments dans la zone de la structure gardent `reliefY` (waypoint-only)
- **Branche(s) superposee(s)** : sections locales pour chaque structure
  - `getStructureElevation(tNorm)` : definir la rampe + plateau
  - Elevation = blend(reliefY, structureHeight, rampFactor)
  - Generer les segments SEULEMENT ou structureY > 0
- **bridgeZone metadata** : identifier les segments base qui sont waypoint-only
  ```javascript
  this.bridgeZone = {
      groundStartIdx: firstIdx,   // Premier segment base dans la zone structure
      groundEndIdx: lastIdx,      // Dernier segment base dans la zone structure
      bridgeSegments: count       // Nombre de segments dans la branche superposee
  };
  ```
  Ces segments sont exclus de : elevation, mesh surface, murs.
  Ils sont gardes pour : waypoints IA, checkpoints, progression, isOnTrack.

#### C. Configuration du circuit
- `startTNorm` : position de depart (choisir loin des croisements et structures)
- `totalSegments` : resolution du circuit (500 = ~4.8m/segment sur Infini)
  - Plus de segments = plus precis mais plus lourd (mesh, murs, lookups)
  - Ajuster selon la longueur du circuit
- `width` : largeur de piste (80 par defaut, peut varier par section si besoin)
- Seuil de layer : `Y > 15 ? 1 : 0` — a adapter si les structures sont plus basses/hautes
  - Ce seuil est hardcode dans player.js, ai.js ET createWalls()

#### D. Placement des elements
- **Boost pads** : definir les positions (tNorm) et parametres (power, duration)
  - Infini : 4 boosts a 15%, 40%, 65%, 90%
  - Eviter de placer sur les croisements ou zones de transition Y
- **Checkpoints** : places automatiquement a 25%, 50%, 75%, 0% du circuit
  - VERIFIER que ces positions ne tombent pas a un endroit problematique
  - Sur Infini : 25% = croisement sol, 75% = croisement pont → le filtre Y les distingue
  - Si le circuit a plusieurs croisements, verifier que chaque checkpoint a un Y unique
- **Item boxes** : placement dans createItemBoxes (items.js)
- **Ligne de depart** : generee automatiquement a startTNorm

#### E. IA et navigation
- `branch.generateWaypoints(interval)` : espacement des waypoints
  - Infini : interval=5 → 100 waypoints pour 500 segments
  - Plus de waypoints = navigation plus precise mais lookAhead doit etre ajuste
- Verifier que les waypoints aux croisements ont des Y corrects
  - L'IA ignore les waypoints a ±4m de son Y courant
  - Si une structure fait < 8m de haut, l'IA pourrait confondre les niveaux
- Le rubber banding (±15%/10% vitesse) est global, pas par circuit
- Les erreurs IA (oversteer, bad_line, late_brake) sont par difficulte, pas par circuit

#### F. Murs, collisions et multi-niveaux
- **Mesh base** : skip les segments bridgeZone (pas de surface ni murs fantomes)
- **Mesh overlay** : genere separement depuis la branche superposee
- Les murs stockent leur `elevation` (moyenne des 2 segments du mur)
- Collision mur : filtre par proximite Y (±10m), pas par layer binaire
- Les karts calculent `currentLayer = this.y > 15 ? 1 : 0` (pour kart-kart collision)
- Les collisions kart-kart sont filtrees par layer
- **Invalidation wallGrid** : apres chaque `track.generate()`, mettre `physics._wallGrid = null`
  (la grille est lazy-init, elle se reconstruit au prochain checkWallCollision)

#### G. Anti-teleportation et caches
- `maxYJump = 1.5` dans player.js et ai.js : cap le changement de Y par frame
  - Suffisant si les rampes font < 1.5m de denivele par segment (~4.8m horizontal)
  - Si pente > 30%, augmenter maxYJump
- Lissage Y asymetrique : montee rapide (0.7), descente douce (0.15/0.25)
- `_elevCache` : par `callerId_branchId` (ex: "0_infini_ground", "1_infini_bridge")
  - Joueur = callerId 0, IA = callerId 1, projectiles = callerId 2
  - Chaque combinaison kart+branche a son propre index cache
- `_trackPtCache`, `_onTrackCache` : par callerId (0=joueur, 1=IA)
- `searchRange = 80` segments : rayon de recherche locale par branche
- `fallback threshold = 400` (20m dist²) : declenche scan complet dans une branche
- `overlayMaxDistSq = 900` (30m dist²) : seuil pour branches superposees dans get3DElevationAt
  - NE S'APPLIQUE PAS a la branche de base (elle repond toujours)
- `clear()` reset tous les caches + bridgeZone a chaque changement de circuit

#### H. Tests a effectuer apres creation
1. Console sans erreurs au chargement
2. Faire 5 tours complets : checkpoints comptent correctement ?
3. Passage sous la structure : fluide, pas d'enfoncement ?
4. Passage sur la structure : fluide, rampe lisse ?
5. L'IA complete 5 tours sans blocage ?
6. Items et boosts fonctionnent au croisement et sur la structure ?
7. Collision murs correcte a chaque niveau (sol ET structure) ?
8. Kart au bord de la piste : pas de chute d'elevation ?
9. Camera fluide dans les changements d'elevation rapides ?
10. Autres circuits (Oval, Volcan) : pas de regression ?

### Exemples de circuits ambitieux

**Double croisement** : deux points ou la piste se croise
- 2 branches superposees, chacune avec sa propre `getBridgeElevation`
- 2 zones bridgeZone dans la branche de base (ou etendre la structure a un seul bridgeZone)
- Le "closest floor below" gere N surfaces superposees automatiquement
- Verifier que les checkpoints a 25/50/75% restent accessibles

**Helice / tire-bouchon** : la piste monte en spirale
- `elevation = spiralHeight * tNorm` avec rotation du centre
- Risque : l'anti-teleportation (1.5m/frame) peut bloquer si la pente est trop raide
- Solution : augmenter maxYJump ou allonger la spirale

**Circuit en 8 avec tunnel** : passer SOUS le pont
- Branche de base = sol complet (relief seulement)
- Branche superposee = pont (rampe + plateau)
- bridgeZone marque les segments base dans la zone pont comme waypoint-only
- "closest floor below" choisit automatiquement sol ou pont selon le Y du kart
- C'est exactement ce que fait Infini

**Sections de largeur variable** : retrecissements
- Varier `halfWidth` dans la boucle de generation selon tNorm
- Impact : la detection off-track utilise CONFIG.track.width global
  → il faut soit passer a une largeur par segment, soit utiliser la largeur min

**Tremplin / saut** : section ou le kart decolle
- Rampe raide puis chute d'elevation → le kart garde son Y (inertie du lissage Y)
- Le systeme `jumpHeight` + `jumpVelocity` dans player.js gere l'animation
- Risque : l'IA ne gere pas les sauts, elle suivra le terrain au lieu de voler

**Circuit urbain avec virages a 90°** : angles droits
- Reduire le nombre de segments dans les virages pour des angles plus vifs
- Ou utiliser une courbe parametrique avec des transitions brusques
- Impact IA : `lookAhead = 3` peut ne pas suffire pour anticiper un 90°, augmenter

**Piste sur flanc de montagne** : elevation constante montante
- `elevation = maxHeight * tNorm` (monte progressivement sur tout le tour)
- Le point de depart/arrivee aura un "saut" d'elevation → gerer avec une rampe de retour
- L'anti-teleportation capera ce saut si > 3m → prevoir une descente progressive
