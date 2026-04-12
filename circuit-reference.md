# Guide de Construction de Circuits - Pills Stadium

Reference technique basee sur le circuit Infini (figure-8 avec pont).
Objectif : comprendre chaque systeme pour creer des circuits ambitieux.

---

## 1. ARCHITECTURE D'UN CIRCUIT

### Pipeline de creation

```
generateTrack()
  1. Definir la courbe (getPoint, getTangent)
  2. Calculer l'elevation par segment (relief + structures)
  3. Generer les segments (center, inner, outer + Y)
  4. Creer la branche TrackBranch
  5. syncFromActiveBranch() → centerPoints, innerPoints, outerPoints
  6. createTrackMesh()      → mesh 3D fusionne (1 seul draw call)
  7. createWalls()           → murs avec layers + collision segments
  8. createCheckpoints()     → 4 checkpoints a 25/50/75/0%
  9. createBoostZones()      → pads de boost
  10. createStartLine()      → damier visuel
  11. buildWallGrid()        → grille spatiale pour collisions (auto au 1er appel)
```

### TrackBranch - Unite de base

Chaque circuit est une `TrackBranch` contenant :
- `segments[]` : points centraux `{x, y, z}` (la "colonne vertebrale")
- `innerPoints[]` : bord gauche de la piste
- `outerPoints[]` : bord droit de la piste
- `waypoints[]` : indices pour la navigation IA (generes tous les N segments)

Le segment 0 = position de depart. Les checkpoints se placent relatifs a cet index.

### TrackGraph - Gestionnaire multi-branches

```javascript
this.graph = new TrackGraph();
const branch = new TrackBranch('id', { name: 'Mon Circuit', layer: 0 });
// ... ajouter segments ...
this.graph.addBranch(branch);
```

Supporte plusieurs branches (prevu pour futurs circuits multi-chemins).

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

**3 phases de recherche :**
1. **Locale** : ±60 segments depuis le cache (rapide, O(120))
2. **Fallback avec filtre Y** : scan complet mais ignore les segments a ±8m de currentY
3. **Fallback sans filtre Y** : scan complet sans restriction (dernier recours)

**Seuil de fallback** : `bestDist > 400` (20 unites) → passe au scan complet.

**Interpolation bilineaire sur quad :**
```
1. Trouver le segment le plus proche (bestIdx)
2. Former un quad avec le voisin le plus proche (prev ou next)
3. Projeter le point sur les axes du quad (along + perp)
4. Interpoler les 4 coins : yA, yB inner/outer
5. Resultat = lerp(lerp(innerA, outerA, s), lerp(innerB, outerB, s), t)
```

**Cache par racer** : `_elevCache[callerId]` — chaque kart a son propre index cache.
Joueur = callerId 0, IA = callerId 1. Supporte N racers.

### Anti-teleportation (fix figure-8)

```javascript
const maxYJump = 3;  // 3m max par frame
this.targetY = clamp(rawTargetY, this.y - maxYJump, this.y + maxYJump);
```

Les rampes normales changent ~0.3m/frame. Un saut > 3m = erreur de lookup au croisement.

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

### Murs filtrés par layer

Les murs stockent leur layer :
```javascript
wallSegment = { x1, z1, x2, z2, elevation, layer }
// layer = elevation > 15 ? 1 : 0
```

La collision mur filtre par layer du kart :
```javascript
if (layer !== null && seg.layer !== undefined && seg.layer !== layer) {
    continue;  // Ignorer les murs de l'autre layer
}
```

**Resultat** : un kart au sol traverse les murs du pont, et inversement.

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

**Filtre Y** : `if (|kart.y - cp.y| > 4) return;`
Empeche de valider un checkpoint au mauvais niveau (sol vs pont).

### Comptage des tours

```
checkpoints: 0 → 1 → 2 → 3 → retour a 0 = +1 tour
Sequentiel strict : impossible de sauter un checkpoint.
currentLap >= CONFIG.race.totalLaps → course terminee.
```

### Pour des circuits complexes

Points d'attention :
- Le checkpoint a 25% et 75% d'Infini tombe au croisement (meme XZ, Y differents)
- Le filtre Y (tolerance 4m) les distingue correctement
- L'anti-teleportation Y empeche le kart de sauter au mauvais niveau

---

## 6. MURS ET COLLISIONS

### Generation des murs

Pour chaque segment, 2 murs (inner + outer) avec :
- 3 faces : exterieur, interieur, dessus (18 vertices par mur)
- Hauteur : 3 unites au-dessus de la surface
- Layer calcule depuis l'elevation moyenne

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
if (Math.abs(target.y - this.y) > 4) {
    // Scan en avant pour trouver un waypoint au meme Y
    for (offset = 1; offset <= lookAhead; offset++) { ... }
}
```

### Avancement des waypoints

```javascript
if (distXZ < 15 && distY < 4) {
    currentWaypoint = (currentWaypoint + 1) % n;
}
```

Double condition : proche en XZ (15m) ET au bon niveau Y (4m).

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

Tout le circuit = 1 seul BufferGeometry :
- 2 triangles par segment (quad center)
- Vertex colors calcules depuis la hauteur (gris clair en haut, fonce en bas)
- 1 draw call au lieu de 500

Murs = 2 meshes fusionnes (inner + outer).

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
this.y = track.get3DElevationAt(this.x, this.z) || 0;
```

Suivent le terrain en temps reel. Pas de filtrage par layer actuellement.

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
| Filtre Y elevation | ±8m | Empeche le lookup de sauter de layer |
| Anti-teleportation | 3m/frame max | Empeche les sauts Y brusques |
| Checkpoint Y | ±4m | Valide seulement au bon niveau |
| Waypoint IA Y | ±4m | IA avance seulement au bon niveau |
| Waypoint IA XZ | 15m rayon | Distance pour valider un waypoint |
| Checkpoint joueur along | 4 unites | Profondeur zone de detection |
| Checkpoint IA along | 2 unites | Plus strict que le joueur |
| Fallback elevation | 400 (20m) dist² | Declenche scan complet |
| Recherche locale | ±60 segments | Rayon du cache |

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

- **Croisements** : le systeme de layers + filtre Y gere les intersections
- **Elevation variable** : interpolation bilineaire precise sur tout le circuit
- **Multi-niveaux** : layers 0/1 avec murs et collisions filtres
- **IA adaptative** : navigation Y-aware, rubber banding, erreurs humaines
- **Anti-teleportation** : empeche les sauts entre niveaux au croisement
- **Caches par racer** : chaque kart a son propre contexte (pas d'interference)
- **Grille spatiale** : collisions O(1) quelle que soit la complexite du circuit

### Checklist complete pour creer un nouveau circuit

Un circuit ne se resume PAS a "deux fonctions". Voici TOUT ce qu'il faut definir,
en prenant Infini comme modele. Chaque etape est necessaire.

#### A. Geometrie de la courbe
- `getPoint(tNorm)` : position XZ sur la courbe (0→1 = tour complet)
- `getTangent(tNorm)` : derivee analytique (direction + perpendiculaire pour les bords)
- Parametres de forme : rayon, echelle, facteurs de courbure par section
- Si virages a difficulte variable : `getScale(tNorm)` avec transitions smoothstep

#### B. Elevation et structures
- `getElevationForSegment(index, total)` : relief de base (collines, bosses)
  - Config : baseHeight, mainHillAmplitude/Frequency, bumpAmplitude/Frequency
- `getStructureElevation(tNorm)` : chaque structure 3D (pont, tunnel, rampe, helice...)
  - Definir : position sur le circuit (tNorm centre), largeur de rampe (rampWidth)
  - Definir : hauteur de la structure, methode de blend avec le relief
- Logique de combinaison relief + structures :
  ```
  if (structureY > 0) {
      elevation = blend(reliefY, structureHeight, rampFactor);
  } else {
      elevation = reliefY;
  }
  ```

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

#### F. Systeme de layers et collisions
- Les murs calculent leur layer depuis l'elevation moyenne : `layer = avgElev > 15 ? 1 : 0`
- Les karts calculent leur layer : `currentLayer = this.y > 15 ? 1 : 0`
- Les collisions kart-kart sont filtrees par layer
- **Si le circuit a plus de 2 niveaux** : il faut etendre le calcul de layer
  (actuellement c'est un simple seuil a 15m, pas N niveaux)
- **Si une structure est plus basse que 15m** : les murs du sol et de la structure
  auront la meme layer → collisions incorrectes. Il faut ajuster le seuil.

#### G. Anti-teleportation et caches
- `maxYJump = 3` dans player.js et ai.js : cap le changement de Y par frame
  - Suffisant si les rampes font < 3m de denivele par segment (~4.8m horizontal)
  - Si pente > 60% (3m vertical / 4.8m horizontal), augmenter maxYJump
- `maxYDiff = 8` dans get3DElevationAt : filtre Y pour le cache d'elevation
  - Doit etre > la hauteur max du relief (~10m) mais < la difference entre niveaux
  - Si niveaux plus proches (ex: mezzanine a 12m), reduire maxYDiff
- `_elevCache`, `_trackPtCache`, `_onTrackCache` : par callerId (0=joueur, 1=IA)
  - Pour N racers, utiliser callerId 0 a N-1
- `searchRange = 60` segments : rayon de recherche locale
  - Si segments plus petits ou circuit plus tortueux, augmenter
- `fallback threshold = 400` (20m dist²) : declenche scan complet
  - Plus le circuit est compact (beaucoup de virages serres), plus ce seuil doit etre bas

#### H. Tests a effectuer apres creation
1. Faire 5 tours complets : les checkpoints comptent correctement ?
2. Passer chaque croisement/structure : teleportation Y ?
3. L'IA complete 5 tours sans se bloquer ?
4. Collision murs correcte a chaque niveau ?
5. Boost pads et items fonctionnent sur les sections elevees ?
6. Camera fluide dans les changements d'elevation rapides ?
7. Minimap affiche le circuit correctement (proportions XZ) ?

### Exemples de circuits ambitieux

**Double croisement** : deux points ou la piste se croise
- 2 fonctions `getBridgeElevation` centrees a des tNorm differents
- 2 seuils de layer differents OU 3 layers (sol=0, pont1=1, pont2=2)
- Verifier que les checkpoints a 25/50/75% evitent les croisements

**Helice / tire-bouchon** : la piste monte en spirale
- `elevation = spiralHeight * tNorm` avec rotation du centre
- Risque : l'anti-teleportation (3m/frame) peut bloquer si la pente est trop raide
- Solution : augmenter maxYJump ou allonger la spirale

**Circuit en 8 avec tunnel** : passer SOUS le pont
- Le pont est la section elevee (layer 1), le passage dessous est au sol (layer 0)
- C'est exactement ce que fait Infini — le systeme gere deja ce cas

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
