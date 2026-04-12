# Refactoring Plan — Yo Kart Racing 3D

## Contexte

Audit complet realise le 2026-04-12. Note globale : B+.
Objectif : amener le code a un niveau pro (A) pour un repo public portfolio.
Approche : tests d'abord, refactoring ensuite. Chaque phase est validee par les tests.

Repo : https://github.com/Foolosophe/Yo-kart-racing-3d
Deploiement : https://kart.ydvsystems.com/
Stack : Three.js, ES modules vanilla, Express.js, pas de bundler.

---

## Phase 1 — Setup tests (Vitest)

### Objectif
Installer Vitest, configurer les mocks Three.js, ecrire le premier test pour valider le setup.

### Actions
1. `npm install -D vitest`
2. Creer `vitest.config.js` a la racine (support ES modules, alias pour Three.js mock)
3. Creer `tests/__mocks__/three.js` — mock minimal de THREE (Vector3, Mesh, Scene, etc.)
4. Ajouter scripts dans package.json : `"test": "vitest run"`, `"test:watch": "vitest"`
5. Creer `tests/smoke.test.js` — importer config.js et verifier qu'il exporte CONFIG
6. Lancer `npm test` et confirmer que ca passe
7. Ajouter `tests/` a .gitignore ? Non — les tests DOIVENT etre dans le repo public
8. Commit : "chore: setup Vitest test framework with Three.js mocks"

### Fichiers crees
- `vitest.config.js`
- `tests/__mocks__/three.js`
- `tests/smoke.test.js`

### Fichiers modifies
- `package.json` (scripts + devDependencies)
- `.gitignore` (ajouter `coverage/`)

### Validation
- `npm test` passe avec 1 test vert

---

## Phase 2 — Tests critiques (elevation + items + checkpoints)

### Objectif
Couvrir les bugs du pont figure-8 avec des tests. C'est le filet de securite pour tout le reste.

### Tests a creer

**`tests/elevation.test.js`** (~6 tests)
- get3DElevationAt retourne elevation sol quand currentY est bas au croisement
- get3DElevationAt retourne elevation pont quand currentY est haut au croisement
- get3DElevationAt avec currentY=null ne crash pas
- callerIds differents (0, 1, 2) ne partagent pas le cache
- getClosestTrackPoint retourne position + angle valides
- Interpolation bilineaire retourne des Y coherents sur la rampe

**`tests/items.test.js`** (~6 tests)
- Projectile.checkHit retourne false quand ecart Y > 10
- Projectile.checkHit retourne true quand meme niveau Y
- Obstacle.checkHit retourne false quand ecart Y > 10
- Obstacle.checkHit retourne true quand meme niveau Y
- ItemBox.checkCollision utilise distance 3D (inclut Y)
- getRandomItem respecte les probabilites par position

**`tests/checkpoint.test.js`** (~5 tests)
- checkCheckpoint avance quand le kart est dans la zone au bon Y
- checkCheckpoint refuse quand ecart Y > 4
- checkCheckpoint incremente le tour quand tous les checkpoints sont passes
- checkCheckpoint declenche onFinish au dernier tour
- raceProgress augmente lineairement

### Fichiers crees
- `tests/elevation.test.js`
- `tests/items.test.js`
- `tests/checkpoint.test.js`

### Validation
- `npm test` — ~17 tests verts sur le code ACTUEL (aucune modif de code source)

### Commit
- "test: add critical tests for elevation, items and checkpoints"

---

## Phase 3 — Tests physique + player + AI

### Objectif
Couvrir la physique de conduite et le comportement IA.

### Tests a creer

**`tests/physics.test.js`** (~5 tests)
- checkWallCollision retourne hit:false sans mur proche
- checkWallCollision retourne hit:true avec position corrigee
- checkWallCollision ignore les murs a Y different (filtre +-10)
- checkKartCollision pousse proportionnellement a la vitesse
- Grille spatiale : cellKey retourne des cles uniques

**`tests/player.test.js`** (~7 tests)
- Acceleration augmente la vitesse jusqu'au max
- Freinage reduit la vitesse
- Drift active le compteur de drift frames
- Drift boost se declenche aux seuils (bleu/orange/violet)
- maxYJump clamp empeche les sauts > 1.5 par frame
- Lissage Y asymetrique : rapide en montee (0.7), lent en descente (0.15)
- Mode airborne : gravite appliquee, atterrissage quand Y <= groundY

**`tests/ai.test.js`** (~5 tests)
- Navigation vers le waypoint suivant
- Waypoint Y-aware : ignore les waypoints a Y different
- Rubber banding : accelere si joueur loin devant
- Rubber banding : ralentit si IA loin devant
- Frequence d'erreurs varie par difficulte

### Fichiers crees
- `tests/physics.test.js`
- `tests/player.test.js`
- `tests/ai.test.js`

### Validation
- `npm test` — ~34 tests verts (17 + 17)

### Commit
- "test: add physics, player and AI behavior tests"

---

## Phase 4 — Tests scores + serveur + input

### Objectif
Couvrir la persistence, l'API et les inputs.

### Tests a creer

**`tests/scores.test.js`** (~7 tests)
- Medaille or pour temps < seuil gold
- Medaille argent pour temps < seuil silver
- Pas de medaille au-dela du seuil
- recordRace sauvegarde le meilleur temps
- recordRace ne remplace pas un meilleur temps existant
- Top 5 trie par temps croissant
- Historique limite a 50 entrees

**`tests/server.test.js`** (~6 tests)
- POST /api/leaderboard avec donnees valides → 200
- POST avec temps negatif → 400
- POST avec nom vide → 400
- POST avec bestLapTime > raceTime → 400
- GET /api/leaderboard/:track/:laps/:difficulty → entries triees
- GET avec track inexistant → entries vides

**`tests/input.test.js`** (~8 tests)
- Gamepad A → useItem
- Gamepad X → selectItem
- Gamepad Y → lookBehind
- Gamepad B → drift
- Gamepad RT → accelerate
- Clavier Space → useItem
- Clavier E → selectItem
- Clavier C → lookBehind

### Fichiers crees
- `tests/scores.test.js`
- `tests/server.test.js`
- `tests/input.test.js`

### Validation
- `npm test` — ~55 tests verts (34 + 21). Toute la suite passe.

### Commit
- "test: add scores, server API and input mapping tests"

---

## Phase 5 — Centraliser les magic numbers

### Objectif
Toutes les valeurs hardcodees dans config.js. Un seul endroit pour tout ajuster.

### Constantes a ajouter dans config.js

```javascript
elevation: {
    // ... existant ...
    layerThreshold: 15,         // Y au-dessus duquel on est sur le pont
    maxYJump: 1.5,              // Clamp anti-teleportation par frame
    yFilterRange: 5,            // Filtre Y dans get3DElevationAt
    yLerpUp: 0.7,              // Lissage montee (rapide)
    yLerpDownPlayer: 0.15,     // Lissage descente joueur (doux)
    yLerpDownAI: 0.25,         // Lissage descente IA (doux)
    checkpointYTolerance: 4,   // Tolerance Y pour valider un checkpoint
    surfaceOffset: 0.2         // Offset pour poser le kart SUR la surface
},
items: {
    hitYFilterRange: 10,       // Ecart Y max pour qu'un item touche
    projectileCallerId: 2,     // CallerId dedie aux projectiles (isole du joueur/IA)
    respawnDelay: 180,         // Frames avant respawn d'une item box
    boxSpacing: 8,             // Espacement entre les boites d'un groupe
    boxGroups: 5,              // Nombre de groupes sur le circuit
    boxesPerGroup: 3           // Boites par groupe
},
camera: {
    // ... existant ...
    lookBehindLerpSpeed: 0.2   // Vitesse transition regard arriere
}
```

### Fichiers modifies
- `config.js` — ajout des constantes
- `player.js` — remplacer 15, 1.5, 4, 0.7, 0.15, 0.2 par CONFIG.elevation.*
- `ai.js` — meme chose (15, 1.5, 4, 0.7, 0.25)
- `track.js` — remplacer 5 par CONFIG.elevation.yFilterRange, 0.2 par surfaceOffset
- `items.js` — remplacer 10, 2, 180, 8, 5, 3 par CONFIG.items.*
- `game.js` — remplacer 0.2 lookBehind par CONFIG.camera.lookBehindLerpSpeed

### Validation
- `npm test` — 55 tests verts (aucun changement de comportement)
- Test manuel : une course complete sur Infini

### Commit
- "refactor: centralize all magic numbers into config.js"

---

## Phase 6 — Null checks + error handling

### Objectif
Code defensif. Aucun crash possible sur des cas limites.

### Actions
- player.js / ai.js : `if (onCheckpoint) onCheckpoint(...)` sur tous les callbacks
- player.js / ai.js : verifier `track.centerPoints.length > 0` avant indexation
- scores.js : try-catch sur `JSON.parse(localStorage.getItem(...))` 
- leaderboard.js : afficher un message UI en cas d'erreur reseau (pas juste console.warn)
- game.js : verifier `this.track.checkpointZones` existe et a des elements

### Fichiers modifies
- `player.js`
- `ai.js`
- `scores.js`
- `leaderboard.js`
- `game.js`

### Validation
- `npm test` — 55 tests verts
- Aucun changement de comportement visible

### Commit
- "fix: add defensive null checks and error handling"

---

## Phase 7 — Securite serveur

### Objectif
Proteger l'API leaderboard pour un usage public.

### Actions
1. `npm install express-rate-limit cors`
2. Ajouter rate limiting : 10 POST / 15 minutes par IP
3. Ajouter CORS restreint a `https://kart.ydvsystems.com`
4. Validation coherence : `bestLapTime <= raceTime`
5. Sanitization nom : whitelist `/^[a-zA-Z0-9 \-àéèêëïôùûçÀÉÈ]{1,12}$/`
6. Logging structure des soumissions suspectes (temps, IP, nom, valeurs)

### Fichiers modifies
- `server.js`
- `package.json` (nouvelles dependances)

### Validation
- `npm test` — tests server.test.js verts (mettre a jour les tests pour les nouveaux status codes)
- Test manuel : soumettre un score depuis le jeu
- Test manuel : curl depuis un autre domaine → refuse par CORS

### Commit
- "security: add rate limiting, CORS, input validation on leaderboard API"

---

## Phase 8 — Nettoyage code mort + documentation

### Objectif
Supprimer le code inutile, documenter le code utile.

### Actions — Code mort
- `ai.js` : supprimer `_playerHasStar` (jamais utilise)
- `items.js` : supprimer le champ `owner` string des Projectile/Obstacle (seul `ownerKart` est utilise)
- `particles.js` : remplacer `splice()` par swap-and-pop cote desktop (ligne ~522)

### Actions — Documentation
- `config.js` : commenter chaque parametre (pourquoi cette valeur)
- `track.js` : header expliquant le systeme de couches sol/pont et le cache par callerId
- `input.js` : header avec le mapping complet manette + clavier
- `items.js` : header avec la liste des items et leurs effets
- `physics.js` : documenter la formule cellKey et ses limites (coordonnees -500 a +500)
- Chaque fichier : header 2 lignes (responsabilite + auteur)

### Validation
- `npm test` — 55 tests verts
- Relecture des commentaires

### Commit
- "cleanup: remove dead code, add documentation headers"

---

## Phase 9 — Extraire logique commune Player/AI

### Objectif
Eliminer la duplication entre player.js et ai.js.

### Actions
1. Creer `public/js/racer.js` avec les fonctions partagees :
   - `initRacerState(racer, track, callerId)` — position, Y, items, timers
   - `updateElevation(racer, track, physics, dtFactor, callerId)` — calcul Y, lissage, layer
   - `applyItemEffects(racer, dtFactor)` — shield, slowdown, spinOut, immunity
   - `moveAndCollide(racer, newX, newZ, physics)` — collision murs + deplacement
2. Modifier `player.js` : appeler les fonctions de racer.js au lieu de dupliquer
3. Modifier `ai.js` : meme chose
4. player.js garde : input handling, drift combos, turbo start
5. ai.js garde : waypoints, erreurs, rubber banding, strategie items

### Fichiers crees
- `public/js/racer.js`

### Fichiers modifies
- `public/js/player.js`
- `public/js/ai.js`
- `public/js/main.js` (si import necessaire)

### Validation
- `npm test` — tests player + AI + elevation verts
- Test manuel : 5 tours Infini, verifier que le comportement est identique
- Test manuel : Oval, verifier le relief 3D

### Commit
- "refactor: extract shared racer logic from player.js and ai.js"

---

## Phase 10 — Extraire la camera de game.js

### Objectif
Reduire game.js, isoler la logique camera.

### Actions
1. Creer `public/js/camera-controller.js` :
   - `CameraController` class
   - `update(player, input, dtFactor, isMobile, state)` — toute la logique camera
   - `initPosition(player)` — positionnement initial
   - `setFov(fov)` — gestion FOV dynamique
   - Gestion lookBehind, screen shake, camera roll
2. Modifier `game.js` : remplacer updateCamera() par `this.cameraController.update()`
3. Deplacer les proprietes camera de Game vers CameraController :
   - `smoothedCameraAngle`, `_smoothCamAngle`, `_smoothCamY`
   - `_lookBehindFactor`, `shakeIntensity`, `shakeDuration`, `shakeTime`
   - `currentFov`

### Fichiers crees
- `public/js/camera-controller.js`

### Fichiers modifies
- `public/js/game.js`

### Validation
- Test manuel : camera fluide en course, regard arriere, screen shake, orbite fin de course
- `npm test` verts

### Commit
- "refactor: extract CameraController from game.js"

---

## Phase 11 — Extraire les stats de course

### Objectif
Isoler la collecte de stats dans un module dedie.

### Actions
1. Creer `public/js/race-stats.js` :
   - `RaceStats` class
   - `reset()`
   - `recordOvertake(time, playerOvertook)`
   - `recordHit(type, attacker, victim)`
   - `recordItem(action)` — picked, used
   - `getSummary()` — retourne l'objet stats pour l'ecran de resultats
2. Modifier `game.js` : remplacer `this.raceStats = { ... }` par `this.raceStats = new RaceStats()`

### Fichiers crees
- `public/js/race-stats.js`

### Fichiers modifies
- `public/js/game.js`

### Validation
- `npm test` verts
- Test manuel : ecran de resultats affiche les bonnes stats

### Commit
- "refactor: extract RaceStats from game.js"

---

## Phase 12 — Decouper ui.js

### Objectif
Reduire ui.js de 1414 lignes a ~400 lignes (facade).

### Actions
1. Creer `public/js/ui-hud.js` — HUD en course (temps, position, vitesse, drift, items)
2. Creer `public/js/ui-menus.js` — ecran titre, stats overlay, resultats
3. Creer `public/js/ui-notifications.js` — bandeaux, toasts, emojis, celebration
4. `ui.js` devient une facade qui instancie et delegue aux 3 sous-modules
5. L'API publique de UI ne change pas (game.js continue d'appeler `this.ui.showResult()`, etc.)

### Fichiers crees
- `public/js/ui-hud.js`
- `public/js/ui-menus.js`
- `public/js/ui-notifications.js`

### Fichiers modifies
- `public/js/ui.js`

### Validation
- Test manuel complet : titre, course, HUD, items, resultats, stats
- `npm test` verts

### Commit
- "refactor: split ui.js into hud, menus and notifications modules"

---

## Phase 13 — Decouper track.js

### Objectif
Reduire track.js de 2361 lignes. Separer la generation de la geometrie.

### Actions
1. Creer `public/js/track-graph.js` — TrackBranch, TrackCursor, TrackPieceBuilder, TrackGraph
2. `track.js` garde uniquement la classe Track :
   - generate() (appelle les builders)
   - get3DElevationAt() (queries)
   - getClosestTrackPoint()
   - Checkpoints, boost zones, ramp zones

### Fichiers crees
- `public/js/track-graph.js`

### Fichiers modifies
- `public/js/track.js`

### Validation
- `npm test` — tests elevation verts
- Test manuel : generation Infini + Oval, relief, pont, checkpoints

### Commit
- "refactor: extract track graph classes from track.js"

---

## Resume des phases

| Phase | Quoi | Tests avant | Tests apres | Risque |
|-------|------|-------------|-------------|--------|
| 1 | Setup Vitest | 0 | 1 | Nul |
| 2 | Tests critiques | 1 | 17 | Nul |
| 3 | Tests physique/player/AI | 17 | 34 | Nul |
| 4 | Tests scores/serveur/input | 34 | 55 | Nul |
| 5 | Centraliser magic numbers | 55 | 55 | Faible |
| 6 | Null checks | 55 | 55 | Nul |
| 7 | Securite serveur | 55 | 55+ | Modere |
| 8 | Code mort + docs | 55 | 55 | Faible |
| 9 | Extraire racer.js | 55 | 55 | Modere |
| 10 | Extraire camera | 55 | 55 | Modere |
| 11 | Extraire race-stats | 55 | 55 | Faible |
| 12 | Decouper ui.js | 55 | 55 | Modere |
| 13 | Decouper track.js | 55 | 55 | Modere |

Note cible apres phase 13 : **A**
