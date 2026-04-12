# PILLS STADIUM - Plan Multijoueur

> Document de conception - Ne pas implementer avant validation complete

---

## Table des matieres

1. [Architecture actuelle](#1-architecture-actuelle)
2. [PHASE 1 : Multijoueur local split-screen](#2-phase-1--multijoueur-local-split-screen)
3. [PHASE 2 : Multijoueur en ligne](#3-phase-2--multijoueur-en-ligne)
4. [Ordre d'implementation](#4-ordre-dimplementation)
5. [Risques et points d'attention](#5-risques-et-points-dattention)

---

## 1. Architecture actuelle

### Fichiers cles et couplages forts

| Fichier | Lignes | Point de blocage multijoueur |
|---------|--------|------------------------------|
| `game.js` | ~1475 | 1 seul `this.player` + 1 seul `this.ai`, 1 camera, 1 renderer |
| `input.js` | ~215 | `getInput()` unique, melange WASD + Arrows + 1 gamepad |
| `physics.js` | ~97 | `checkKartCollision(player, ai)` hardcode pour 2 entites |
| `items.js` | ~603 | `update(dt, track, player, ai)`, owner = `'player'` ou `'ai'` (strings) |
| `player.js` | ~378 | Classe Player, couleur rouge hardcodee, position de depart fixe |
| `ai.js` | ~460 | Classe AI independante (pas extends Player), waypoints + rubber banding |
| `ui.js` | - | Tous les elements HUD sont des singletons DOM |
| `audio.js` | - | 1 seul son moteur |
| `server.js` | - | Express static, port 3000, pas de WebSocket |

### Flux de course actuel

```
Menu (title) -> startGame() -> Countdown -> Racing -> waiting_finish -> Results
                                  |
                              animate() loop:
                                1. getInput() (unique)
                                2. player.update(dt, input, ...)
                                3. ai.update(dt, track, physics, playerProgress, ...)
                                4. physics.checkKartCollision(player, ai)
                                5. itemManager.update(dt, track, player, ai)
                                6. updateCamera() (suit le player)
                                7. renderer.render(scene, camera) (1 seul rendu)
```

### Format d'input

```js
{
    accelerate: boolean,
    brake: boolean,
    left: boolean,
    right: boolean,
    drift: boolean,
    useItem: boolean,
    aimBackward: boolean
}
```

---

## 2. PHASE 1 : Multijoueur local split-screen

### 2.0 Apercu general

- 2 joueurs humains sur le meme ecran
- Ecran coupe horizontalement (haut = J1, bas = J2)
- Joueur 1 : WASD + Shift(drift) + Space(item) ET/OU manette 1
- Joueur 2 : Fleches + RShift/RCtrl(drift) + Enter/Numpad0(item) ET/OU manette 2
- Pas d'IA en mode 2 joueurs
- Le mode solo existant ne doit PAS etre casse

---

### 2.1 Refactoring de InputManager (`input.js`)

**Probleme** : `getInput()` melange toutes les touches et 1 seul gamepad.

**Solution** : Ajouter `getInputForPlayer(playerIndex)`.

#### Mapping clavier

| Action | Joueur 1 (playerIndex=0) | Joueur 2 (playerIndex=1) |
|--------|--------------------------|--------------------------|
| Accelerer | `KeyW` | `ArrowUp` |
| Freiner | `KeyS` | `ArrowDown` |
| Gauche | `KeyA` | `ArrowLeft` |
| Droite | `KeyD` | `ArrowRight` |
| Drift | `ShiftLeft` | `ShiftRight` ou `ControlRight` |
| Item | `Space` | `Enter` ou `Numpad0` |
| Viser arriere | `KeyS` | `ArrowDown` |

#### Mapping gamepad

- `playerIndex=0` -> `navigator.getGamepads()[0]`
- `playerIndex=1` -> `navigator.getGamepads()[1]`
- Meme mapping de boutons pour les deux (RT, LT, A, B, stick)

#### Modifications

```js
// Nouvelle methode principale
getInputForPlayer(playerIndex) {
    const keyboard = this.getKeyboardInputForPlayer(playerIndex);
    const gamepad = this.getGamepadInputForPlayer(playerIndex);
    return this.mergeInputs(keyboard, gamepad);
}

// Conserver getInput() comme alias pour compatibilite solo
getInput() {
    return this.getInputForPlayer(0);
}

// Tracker tous les gamepads connectes
setupGamepad() {
    // Ecouter gamepadconnected pour TOUS les index
    // Stocker dans this.connectedGamepads = new Set()
}
```

---

### 2.2 Module GameMode (`gameMode.js` - nouveau fichier)

```js
export const GAME_MODES = {
    SOLO: 'solo',           // 1 joueur + 1 IA (mode actuel)
    LOCAL_2P: 'local_2p'    // 2 joueurs locaux, pas d'IA
};

export class GameMode {
    constructor(mode = GAME_MODES.SOLO) {
        this.mode = mode;
    }
    get isSolo()    { return this.mode === GAME_MODES.SOLO; }
    get isLocal2P() { return this.mode === GAME_MODES.LOCAL_2P; }
    get playerCount() { return this.isLocal2P ? 2 : 1; }
    get hasAI()     { return this.isSolo; }
}
```

---

### 2.3 Refactoring de Physics (`physics.js`)

**Probleme** : `checkKartCollision(player, ai)` est une paire hardcodee.

**Solution** : Ajouter `checkAllKartCollisions(racers)` pour N coureurs.

```js
// Nouvelle methode generique
checkAllKartCollisions(racers) {
    const collisions = [];
    for (let i = 0; i < racers.length; i++) {
        for (let j = i + 1; j < racers.length; j++) {
            if (this.checkKartPairCollision(racers[i], racers[j])) {
                collisions.push([i, j]);
            }
        }
    }
    return collisions;
}

// Renommer l'actuelle en interne
checkKartPairCollision(kartA, kartB) {
    // Meme logique que checkKartCollision actuelle
    // Check layer, distance, push, speed reduction
}

// Garder l'ancienne signature comme wrapper
checkKartCollision(player, ai) {
    return this.checkKartPairCollision(player, ai);
}
```

Pour 2 joueurs : 1 seule comparaison par frame (identique a maintenant).
Pour 4 joueurs online : 6 comparaisons par frame (toujours negligeable).

---

### 2.4 Refactoring de ItemManager (`items.js`)

**Probleme** : `update(dt, track, player, ai)` et owner = string `'player'`/`'ai'`.

**Solution** : Passer un tableau de racers et utiliser des references directes.

#### Changements

1. **Owner** : remplacer les strings par une reference au kart proprietaire

```js
// Avant
new Projectile(scene, x, y, z, angle, type, 'player')
// Apres
new Projectile(scene, x, y, z, angle, type, ownerKart)
```

2. **update()** : accepter un tableau de racers

```js
// Avant
update(dt, track, player, ai)
// Apres
update(dt, track, racers)
// racers = [player1, player2] ou [player1, ai]
```

3. **Collision items** : iterer sur tous les racers sauf l'owner

```js
// Pour chaque projectile
for (const racer of racers) {
    if (racer !== projectile.ownerKart && projectile.checkHit(racer)) {
        this.applyHit(racer);
        events.push({ type: 'hit', victim: racer, attacker: projectile.ownerKart });
    }
}
```

4. **getRandomItem()** : la probabilite depend du rang dans la course

```js
// Avant : isFirst (boolean)
// Apres : position (1er, 2eme, etc.) et totalRacers
getRandomItem(position, totalRacers)
```

---

### 2.5 Rendering split-screen (`game.js`)

C'est le changement le plus consequent.

#### Systeme de cameras

```js
// Dans init/startGame
this.cameras = [];
this.cameraStates = []; // smoothedAngle, shake, etc. par camera

if (this.gameMode.isLocal2P) {
    // 2 cameras avec aspect ratio adapte (largeur / demi-hauteur)
    const aspect = window.innerWidth / (window.innerHeight / 2);
    this.cameras[0] = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    this.cameras[1] = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    this.cameraStates = [
        { smoothedAngle: 0, shakeIntensity: 0, shakeDuration: 0, shakeTime: 0 },
        { smoothedAngle: 0, shakeIntensity: 0, shakeDuration: 0, shakeTime: 0 }
    ];
} else {
    // Mode solo : 1 camera plein ecran (comme actuellement)
    this.cameras[0] = new THREE.PerspectiveCamera(75,
        window.innerWidth / window.innerHeight, 0.1, 1000);
    this.cameraStates = [{ smoothedAngle: 0, shakeIntensity: 0, ... }];
}
```

#### Double rendu avec scissor/viewport

```js
// Dans animate(), remplacer le render unique
const w = window.innerWidth;
const h = window.innerHeight;

if (this.gameMode.isLocal2P) {
    this.renderer.setScissorTest(true);

    // Viewport Joueur 1 (moitie HAUTE)
    this.renderer.setViewport(0, h/2, w, h/2);
    this.renderer.setScissor(0, h/2, w, h/2);
    this.updateCameraForPlayer(0);
    this.renderer.render(this.scene, this.cameras[0]);

    // Viewport Joueur 2 (moitie BASSE)
    this.renderer.setViewport(0, 0, w, h/2);
    this.renderer.setScissor(0, 0, w, h/2);
    this.updateCameraForPlayer(1);
    this.renderer.render(this.scene, this.cameras[1]);

    this.renderer.setScissorTest(false);
} else {
    // Mode solo inchange
    this.updateCameraForPlayer(0);
    this.renderer.render(this.scene, this.cameras[0]);
}
```

#### Generalisation de la boucle de jeu

```js
// Remplacer this.player / this.ai par :
this.players = [];  // Joueurs humains (1 ou 2 instances de Player)
this.racers = [];   // Tous les coureurs (players + AI eventuelle)

// Dans startGame() :
if (this.gameMode.isSolo) {
    this.players = [new Player(this.scene, 0xe74c3c)];  // rouge
    this.ai = new AI(this.scene);
    this.racers = [this.players[0], this.ai];
} else if (this.gameMode.isLocal2P) {
    this.players = [
        new Player(this.scene, 0xe74c3c),  // J1 rouge
        new Player(this.scene, 0x3498db)   // J2 bleu
    ];
    this.ai = null;
    this.racers = [...this.players];
}

// Dans animate() :
this.players.forEach((player, i) => {
    const input = this.input.getInputForPlayer(i);
    player.update(dt, input, this.track, this.physics, ...callbacks);
});

if (this.ai && !this.ai.finished) {
    this.ai.update(dt, this.track, this.physics, ...);
}

this.physics.checkAllKartCollisions(this.racers);
this.itemManager.update(dt, this.track, this.racers);
```

#### Camera par joueur

```js
updateCameraForPlayer(playerIndex) {
    const player = this.players[playerIndex];
    const camera = this.cameras[playerIndex];
    const state = this.cameraStates[playerIndex];

    // Meme logique de chase cam qu'actuellement
    // mais utilise player/camera/state specifiques
    state.smoothedAngle += (player.angle - state.smoothedAngle) * smoothing;
    camera.position.set(
        player.x - Math.sin(state.smoothedAngle) * distance,
        player.y + height,
        player.z - Math.cos(state.smoothedAngle) * distance
    );
    camera.lookAt(
        player.x + Math.sin(state.smoothedAngle) * lookAhead,
        player.y + 2,
        player.z + Math.cos(state.smoothedAngle) * lookAhead
    );

    // Screen shake individuel
    if (state.shakeIntensity > 0) { ... }
}
```

---

### 2.6 Player : couleurs et positions parametrables (`player.js`)

```js
// Avant
constructor(scene) {
    this.mesh = Kart.create(scene, 0xe74c3c); // rouge hardcode
}

// Apres
constructor(scene, color = 0xe74c3c) {
    this.mesh = Kart.create(scene, color);
    this.color = color;
}

// Position de depart avec offset
reset(track = null, startOffset = 0) {
    // startOffset permet de decaler lateralement
    // J1 : startOffset = -5 (gauche de la grille)
    // J2 : startOffset = +5 (droite)
    // En solo : startOffset = 0 (centre, comme actuellement)
    if (track && track.startPosition) {
        this.x = track.startPosition.x + startOffset;
        this.z = track.startPosition.z;
        this.angle = track.startPosition.angle;
    }
}
```

Couleurs :
- Joueur 1 : `0xe74c3c` (rouge, actuel)
- Joueur 2 : `0x3498db` (bleu, actuellement l'IA)
- IA (solo) : garder `0x3498db` (bleu)

---

### 2.7 HUD split-screen (`index.html` + `ui.js` + `style.css`)

#### HTML : dupliquer le HUD

```html
<!-- HUD Joueur 1 (moitie haute) -->
<div class="hud hud-p1" id="hud-p1">
    <div class="hud-central">
        <div class="hud-top-row">
            <span class="position-badge-mini" id="positionValue-p1">P1</span>
            <span class="hud-separator">.</span>
            <span class="lap-info">Tour <span id="currentLap-p1">1</span>/3</span>
        </div>
        <div class="hud-time" id="raceTime-p1">0:00.00</div>
    </div>
    <div class="hud-speed">
        <div class="speed-value" id="speedValue-p1">0</div>
        <div class="speed-unit">km/h</div>
    </div>
</div>

<!-- HUD Joueur 2 (moitie basse) - cache par defaut -->
<div class="hud hud-p2" id="hud-p2" style="display:none;">
    <!-- Meme structure, IDs suffixes -p2 -->
</div>

<!-- Ligne de separation -->
<div class="splitscreen-divider" id="splitDivider" style="display:none;"></div>
```

#### CSS

```css
.hud-p1 {
    /* Positionnement dans la moitie haute */
    top: 0;
    height: 50vh;
}
.hud-p2 {
    /* Positionnement dans la moitie basse */
    top: 50vh;
    height: 50vh;
}
.splitscreen-divider {
    position: fixed;
    top: 50%;
    left: 0;
    width: 100%;
    height: 3px;
    background: rgba(255, 255, 255, 0.8);
    z-index: 100;
    transform: translateY(-50%);
}
```

#### UI.js

```js
// Nouvelle methode
setupSplitScreenHUD() {
    document.getElementById('hud').style.display = 'none'; // cacher HUD solo
    document.getElementById('hud-p1').style.display = '';
    document.getElementById('hud-p2').style.display = '';
    document.getElementById('splitDivider').style.display = '';
}

// Mise a jour par joueur
updateHUDForPlayer(playerIndex, player, racers) {
    const suffix = playerIndex === 0 ? '-p1' : '-p2';
    document.getElementById('speedValue' + suffix).textContent = Math.round(speed);
    document.getElementById('currentLap' + suffix).textContent = player.currentLap + 1;
    // ... position, temps, etc.
}
```

#### Effets CSS (speed lines, vignette)

En split-screen, les overlays CSS (speed lines, vignette, flash) doivent etre limites a leur moitie :

```css
/* En mode split-screen */
.splitscreen .speed-effects-p1 { clip-path: inset(0 0 50% 0); }
.splitscreen .speed-effects-p2 { clip-path: inset(50% 0 0 0); }
```

Alternativement, dupliquer les elements d'effets et les positionner dans chaque moitie.

---

### 2.8 Menu : selection du mode (`index.html` + `game.js`)

Ajouter un selecteur avant la selection de circuit :

```html
<div class="mode-selector">
    <div class="mode-option selected" data-mode="solo">
        <span class="mode-label">SOLO</span>
        <span class="mode-desc">vs Claudius</span>
    </div>
    <div class="mode-option" data-mode="local_2p">
        <span class="mode-label">2 JOUEURS</span>
        <span class="mode-desc">Split-screen</span>
    </div>
</div>
```

Comportement selon le mode :
- **Solo** : afficher difficulte + nom joueur vs "CLAUDIUS" (comme maintenant)
- **2 Joueurs** : cacher difficulte, afficher 2 champs de nom (J1 et J2)

Navigation manette : ajouter comme section de menu (avant les circuits).

---

### 2.9 Slipstream 2 joueurs

Generaliser `update(dt, racer, targetRacer, callback)` :
- En solo : joueur peut aspirer l'IA et vice-versa
- En 2P : chaque joueur peut aspirer l'autre
- Creer un objet Slipstream par joueur OU appeler update 2 fois avec les paires inversees

---

### 2.10 Audio 2 joueurs

```js
// Creer un tableau de sons moteur
this.engines = [];

startEngine(playerIndex) {
    // Creer oscillateur + gain pour ce joueur
    // Frequence de base legerement differente pour distinguer
    // J1 : baseFreq = 80, J2 : baseFreq = 85
}

updateEngine(playerIndex, speed, maxSpeed, isBoosting) {
    // Meme logique, appliquee a this.engines[playerIndex]
}
```

Les sons d'items, collisions, etc. restent globaux (pas besoin de les dupliquer).

---

### 2.11 Resultats 2 joueurs

- Titre : "JOUEUR 1 GAGNE !" ou "JOUEUR 2 GAGNE !"
- Tableau des standings avec les 2 joueurs humains
- Timeline : couleur de chaque joueur
- Pas de sauvegarde de score/medaille en mode 2P (ou optionnellement pour les deux)
- Boutons : Rejouer / Menu (manettes des deux joueurs actives)

---

### 2.12 Pause en mode 2 joueurs

- N'importe quel joueur peut mettre en pause (Echap clavier OU Start manette 1 OU Start manette 2)
- La pause arrete tout (les deux viewports)
- L'overlay "PAUSE" s'affiche en plein ecran par-dessus le split-screen
- Boutons : Reprendre / Menu

---

### 2.13 Gestion du resize

```js
window.addEventListener('resize', () => {
    if (this.gameMode.isLocal2P) {
        const aspect = window.innerWidth / (window.innerHeight / 2);
        this.cameras.forEach(cam => {
            cam.aspect = aspect;
            cam.updateProjectionMatrix();
        });
    } else {
        this.cameras[0].aspect = window.innerWidth / window.innerHeight;
        this.cameras[0].updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
});
```

---

### 2.14 Minimap en split-screen

Chaque joueur a sa propre minimap dans sa moitie d'ecran :
- Dupliquer le canvas minimap
- Positionner chaque minimap en bas a droite de chaque viewport
- Les deux affichent la meme piste mais le marqueur "joueur" correspond au joueur du viewport

---

## 3. PHASE 2 : Multijoueur en ligne

### 3.0 Apercu general

- 2 a 4 joueurs en ligne
- Architecture client-authoritative avec validation serveur legere
- Socket.io pour la communication temps reel
- Systeme de salons (creer/rejoindre avec un code)
- Interpolation des joueurs distants
- Un seul viewport plein ecran (pas de split-screen en online)

---

### 3.1 Architecture serveur

#### Dependances

```json
// package.json
{
    "dependencies": {
        "express": "^4.x",
        "socket.io": "^4.x"
    }
}
```

#### Modification de server.js

```js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// Game server
const { GameServer } = require('./server/gameServer.js');
const gameServer = new GameServer(io);

server.listen(3000);
```

---

### 3.2 Fichiers serveur (nouveaux)

#### `server/gameServer.js`

```js
class GameServer {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();           // roomId -> Room
        this.playerSockets = new Map();   // socketId -> { roomId, playerIndex }

        io.on('connection', (socket) => this.onConnection(socket));
    }

    onConnection(socket) {
        socket.on('createRoom', (data) => this.createRoom(socket, data));
        socket.on('joinRoom', (data) => this.joinRoom(socket, data));
        socket.on('leaveRoom', () => this.leaveRoom(socket));
        socket.on('playerReady', () => this.playerReady(socket));
        socket.on('playerInput', (data) => this.onPlayerInput(socket, data));
        socket.on('disconnect', () => this.onDisconnect(socket));
    }

    createRoom(socket, data) {
        const roomId = generateRoomCode(); // 4-6 caracteres alphanumeriques
        const room = new Room(roomId, socket, data);
        this.rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, playerIndex: 0 });
    }

    joinRoom(socket, data) {
        const room = this.rooms.get(data.roomId);
        if (!room || room.isFull() || room.state !== 'lobby') {
            socket.emit('joinError', { message: 'Salle introuvable ou pleine' });
            return;
        }
        const playerIndex = room.addPlayer(socket, data.name);
        socket.join(data.roomId);
        this.io.to(data.roomId).emit('playerJoined', {
            id: socket.id, name: data.name, index: playerIndex
        });
    }

    onPlayerInput(socket, data) {
        const info = this.playerSockets.get(socket.id);
        if (!info) return;
        const room = this.rooms.get(info.roomId);
        if (!room) return;

        // Validation basique
        if (data.state.speed > 3.6) return; // boostMaxSpeed * 1.2

        // Stocker l'etat et broadcaster
        room.updatePlayerState(info.playerIndex, data);

        // Broadcast a tous les autres joueurs de la room
        socket.to(info.roomId).emit('playerState', {
            playerIndex: info.playerIndex,
            timestamp: data.timestamp,
            state: data.state
        });
    }
}
```

#### `server/room.js`

```js
class Room {
    constructor(id, hostSocket, options) {
        this.id = id;
        this.players = [];          // [{ socketId, name, ready, index }]
        this.state = 'lobby';       // lobby | countdown | racing | finished
        this.maxPlayers = options.maxPlayers || 4;
        this.trackId = options.trackId || 'infini';
        this.laps = options.laps || 5;
        this.hostSocketId = hostSocket.id;
        this.disconnectedPlayers = new Map(); // socketId -> { state, timeout }
        this.tickInterval = null;
    }

    addPlayer(socket, name) {
        const index = this.players.length;
        this.players.push({ socketId: socket.id, name, ready: false, index });
        return index;
    }

    isFull() { return this.players.length >= this.maxPlayers; }

    allReady() { return this.players.every(p => p.ready); }

    // Demarrer le tick serveur (30Hz)
    startGameLoop(io) {
        this.state = 'countdown';
        this.tickInterval = setInterval(() => {
            this.broadcastState(io);
        }, 1000 / 30); // 30Hz
    }

    broadcastState(io) {
        // Envoyer l'etat de tous les joueurs a tous
        io.to(this.id).emit('gameState', {
            timestamp: Date.now(),
            players: this.players.map(p => p.lastState || null)
        });
    }

    cleanup() {
        if (this.tickInterval) clearInterval(this.tickInterval);
    }
}
```

---

### 3.3 Protocole reseau

#### Client -> Serveur

| Event | Payload | Frequence |
|-------|---------|-----------|
| `createRoom` | `{ name, trackId, maxPlayers }` | 1x |
| `joinRoom` | `{ roomId, name }` | 1x |
| `leaveRoom` | `{}` | 1x |
| `playerReady` | `{}` | 1x |
| `playerInput` | `{ seq, timestamp, input, state }` | 30Hz |
| `useItem` | `{ type, aimBackward }` | event |
| `playerFinished` | `{ time, lapTimes }` | 1x |
| `chat` | `{ message }` ou `{ emote }` | event |
| `reconnect` | `{ roomId, playerId }` | 1x |

#### Serveur -> Client

| Event | Payload | Frequence |
|-------|---------|-----------|
| `roomCreated` | `{ roomId, playerIndex }` | 1x |
| `joinError` | `{ message }` | 1x |
| `playerJoined` | `{ id, name, index }` | event |
| `playerLeft` | `{ id, name }` | event |
| `allReady` | `{}` | 1x |
| `countdown` | `{ count }` | 4x (3,2,1,GO) |
| `raceStart` | `{ timestamp }` | 1x |
| `playerState` | `{ playerIndex, timestamp, state }` | 30Hz/joueur |
| `gameState` | `{ timestamp, players[] }` | 30Hz |
| `itemPickup` | `{ playerIndex, itemType }` | event |
| `itemUsed` | `{ playerIndex, type, x, z, angle }` | event |
| `playerHit` | `{ victimIndex, attackerIndex, effect }` | event |
| `playerFinished` | `{ playerIndex, time, position }` | event |
| `raceEnd` | `{ standings[] }` | 1x |
| `reconnectState` | `{ fullGameState }` | 1x |

#### Structure de `state` (dans playerInput)

```js
{
    x: float,          // position X
    z: float,          // position Z
    y: float,          // hauteur (elevation)
    angle: float,      // orientation (radians)
    speed: float,      // vitesse actuelle
    lap: int,          // tour actuel
    checkpoint: int,   // checkpoint actuel
    isDrifting: bool,
    boostTime: float,
    currentItem: string|null,
    shieldTime: float,
    spinOut: float,
    finished: bool
}
```

---

### 3.4 Client reseau (`network.js` - nouveau fichier)

```js
export class NetworkManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.roomId = null;
        this.playerIndex = -1;
        this.remotePlayers = new Map(); // playerIndex -> InterpolationBuffer
        this.sendRate = 1000 / 30;      // 30Hz
        this.lastSendTime = 0;
        this.seq = 0;
        this.callbacks = {};            // event handlers
    }

    connect() {
        this.socket = io();
        this.setupHandlers();
        return new Promise((resolve) => {
            this.socket.on('connect', () => {
                this.connected = true;
                resolve();
            });
        });
    }

    // Envoyer l'etat local (rate-limited a 30Hz)
    sendState(input, playerState) {
        const now = performance.now();
        if (now - this.lastSendTime < this.sendRate) return;
        this.lastSendTime = now;

        this.socket.emit('playerInput', {
            seq: this.seq++,
            timestamp: now,
            input,
            state: playerState
        });
    }

    // Creer/rejoindre
    createRoom(name, trackId, maxPlayers) { ... }
    joinRoom(roomId, name) { ... }

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }
}
```

---

### 3.5 Interpolation des joueurs distants

```js
class InterpolationBuffer {
    constructor(delay = 100) {  // 100ms de delai d'interpolation
        this.buffer = [];       // [{ timestamp, state }]
        this.delay = delay;
    }

    addState(timestamp, state) {
        this.buffer.push({ timestamp, state });
        // Garder max 1 seconde de buffer
        while (this.buffer.length > 30) this.buffer.shift();
    }

    getInterpolatedState(currentTime) {
        const renderTime = currentTime - this.delay;

        // Trouver les 2 etats qui encadrent renderTime
        let before = null, after = null;
        for (let i = 0; i < this.buffer.length - 1; i++) {
            if (this.buffer[i].timestamp <= renderTime &&
                this.buffer[i + 1].timestamp >= renderTime) {
                before = this.buffer[i];
                after = this.buffer[i + 1];
                break;
            }
        }

        if (!before || !after) {
            // Extrapolation : utiliser le dernier etat connu
            return this.buffer[this.buffer.length - 1]?.state || null;
        }

        // Interpolation lineaire
        const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
        return {
            x: lerp(before.state.x, after.state.x, t),
            z: lerp(before.state.z, after.state.z, t),
            y: lerp(before.state.y, after.state.y, t),
            angle: lerpAngle(before.state.angle, after.state.angle, t),
            speed: lerp(before.state.speed, after.state.speed, t),
            isDrifting: after.state.isDrifting,
            // ... autres proprietes
        };
    }
}
```

---

### 3.6 RemotePlayer (`remotePlayer.js` - nouveau fichier)

Representation visuelle d'un joueur distant (pas de physique locale, juste de l'interpolation).

```js
import { Kart } from './kart.js';

export class RemotePlayer {
    constructor(scene, color, name) {
        this.scene = scene;
        this.mesh = Kart.create(scene, color);
        this.name = name;
        this.interpolation = new InterpolationBuffer();

        // Proprietes de position (mises a jour par interpolation)
        this.x = 0; this.y = 0; this.z = 0;
        this.angle = 0;
        this.speed = 0;
        this.currentLap = 0;
        this.currentCheckpoint = 0;
        this.finished = false;
        this.raceProgress = 0;

        // Visuels
        this.isDrifting = false;
        this.currentItem = null;
        this.shieldTime = 0;
    }

    receiveState(timestamp, state) {
        this.interpolation.addState(timestamp, state);
        // Mettre a jour les proprietes discretes immediatement
        this.currentLap = state.lap;
        this.currentCheckpoint = state.checkpoint;
        this.finished = state.finished;
        this.currentItem = state.currentItem;
    }

    update(dt) {
        const state = this.interpolation.getInterpolatedState(performance.now());
        if (!state) return;

        this.x = state.x;
        this.z = state.z;
        this.y = state.y;
        this.angle = state.angle;
        this.speed = state.speed;
        this.isDrifting = state.isDrifting;

        // Mise a jour du mesh
        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.angle;
        // Rotation des roues proportionnelle a la vitesse
        Kart.updateWheelRotation(this.mesh, this.speed);
    }

    // raceProgress pour le classement
    get raceProgress() {
        return this.currentLap * 1000 + this.currentCheckpoint * 100;
    }
}
```

---

### 3.7 Integration dans game.js (mode online)

#### Nouveau mode

```js
// Dans gameMode.js
ONLINE: 'online'

get isOnline() { return this.mode === GAME_MODES.ONLINE; }
```

#### Boucle de jeu online

```js
// Dans animate() en mode online :

// 1. Inputs locaux
const input = this.input.getInput();

// 2. Mise a jour du joueur local (physique normale)
this.localPlayer.update(dt, input, this.track, this.physics, ...callbacks);

// 3. Envoyer l'etat au serveur
this.network.sendState(input, {
    x: this.localPlayer.x, z: this.localPlayer.z,
    y: this.localPlayer.y, angle: this.localPlayer.angle,
    speed: this.localPlayer.speed,
    lap: this.localPlayer.currentLap,
    checkpoint: this.localPlayer.currentCheckpoint,
    isDrifting: this.localPlayer.isDrifting,
    boostTime: this.localPlayer.boostTime,
    currentItem: this.localPlayer.currentItem?.type || null,
    shieldTime: this.localPlayer.shieldTime,
    spinOut: this.localPlayer.spinOut,
    finished: this.localPlayer.finished
});

// 4. Mise a jour des joueurs distants (interpolation, pas de physique)
this.remotePlayers.forEach(rp => rp.update(dt));

// 5. Collisions locales (joueur local vs murs uniquement)
// Les collisions kart-kart distants sont visuelles seulement

// 6. Rendu : 1 seule camera, plein ecran (suit le joueur local)
this.updateCameraForPlayer(0);
this.renderer.render(this.scene, this.cameras[0]);
```

---

### 3.8 Lobby UI (`index.html`)

```html
<div class="lobby-overlay" id="lobbyOverlay" style="display:none;">
    <div class="lobby-content">
        <h2>MULTIJOUEUR</h2>

        <!-- Actions initiales -->
        <div class="lobby-actions" id="lobbyActions">
            <button class="lobby-btn primary" id="createRoomBtn">CREER UNE PARTIE</button>
            <div class="lobby-join">
                <input type="text" id="roomCodeInput" placeholder="Code" maxlength="6">
                <button class="lobby-btn" id="joinRoomBtn">REJOINDRE</button>
            </div>
            <button class="lobby-btn secondary" id="quickMatchBtn">MATCH RAPIDE</button>
        </div>

        <!-- Salle d'attente -->
        <div class="room-waiting" id="roomWaiting" style="display:none;">
            <div class="room-code">Code : <span id="roomCode">XXXX</span></div>
            <div class="players-list" id="playersList">
                <!-- Rempli dynamiquement -->
            </div>
            <!-- Host uniquement -->
            <button class="lobby-btn primary" id="startOnlineBtn" style="display:none;">
                LANCER LA COURSE
            </button>
            <button class="lobby-btn secondary" id="leaveRoomBtn">QUITTER</button>
        </div>
    </div>
</div>
```

---

### 3.9 Validation serveur

Le serveur valide les donnees recues pour limiter la triche :

| Validation | Seuil | Action |
|-----------|-------|--------|
| Vitesse max | `speed > boostMaxSpeed * 1.2` (3.6) | Ignorer le paquet |
| Teleportation | distance entre 2 frames > `maxSpeed * 2 * dt` | Ignorer le paquet |
| Items | Le serveur attribue les items (pas le client) | Rejeter si non autorise |
| Checkpoints | Ordre sequentiel obligatoire | Rejeter si saut |
| Frequence | Max 60 paquets/sec par joueur | Rate-limit |

Note : ce n'est PAS un anti-triche complet. Un serveur authoritative serait necessaire pour ca, mais impliquerait de porter toute la physique cote serveur.

---

### 3.10 Reconnexion

```js
// Cote client (network.js)
this.socket.on('disconnect', () => {
    this.connected = false;
    this.showReconnectingUI();
    // Socket.io tente automatiquement la reconnexion
});

this.socket.on('reconnect', () => {
    this.socket.emit('rejoinRoom', { roomId: this.roomId });
});

this.socket.on('rejoinSuccess', (fullState) => {
    // Restaurer les positions de tous les joueurs
    this.hideReconnectingUI();
});
```

```js
// Cote serveur (gameServer.js)
onDisconnect(socket) {
    const info = this.playerSockets.get(socket.id);
    if (!info) return;
    const room = this.rooms.get(info.roomId);

    // Garder le slot pendant 30 secondes
    room.setPlayerDisconnected(info.playerIndex);
    setTimeout(() => {
        if (room.isPlayerStillDisconnected(info.playerIndex)) {
            room.removePlayer(info.playerIndex);
            this.io.to(info.roomId).emit('playerLeft', { index: info.playerIndex });
        }
    }, 30000);
}
```

---

### 3.11 Matchmaking simple

```js
// Cote serveur
quickMatch(socket, data) {
    // Chercher une room publique avec de la place
    for (const [id, room] of this.rooms) {
        if (room.state === 'lobby' && room.isPublic && !room.isFull()) {
            this.joinRoom(socket, { roomId: id, name: data.name });
            return;
        }
    }
    // Aucune room dispo -> en creer une publique
    this.createRoom(socket, { ...data, isPublic: true });
}
```

---

### 3.12 Chat et emotes

- Barre d'emotes rapides dans le lobby et en course
- En course : emotes uniquement (pas de texte), via raccourci clavier ou bouton manette
- Emotes disponibles : les memes que les reactions IA actuelles (avec les memes emojis)
- Affichage : bulle au-dessus du kart pendant 2 secondes

---

## 4. Ordre d'implementation

### Phase 1 - Split-screen local

| Etape | Fichiers | Description | Prerequis |
|-------|----------|-------------|-----------|
| 1.1 | `input.js` | Separation inputs par joueur | - |
| 1.2 | `gameMode.js` (nouveau) | Module de mode de jeu | - |
| 1.3 | `physics.js` | Collisions N-way | - |
| 1.4 | `items.js` | Owner generique | - |
| 1.5 | `game.js` | Split-screen rendering + boucle generalisee | 1.1, 1.2, 1.3, 1.4 |
| 1.6 | `player.js` | Couleurs et positions parametrables | - |
| 1.7 | `index.html`, `ui.js`, `style.css` | HUD duplique + effets par viewport | 1.5 |
| 1.8 | `index.html`, `game.js` | Menu selection de mode | 1.2 |
| 1.9 | `slipstream.js` | Generalisation | 1.5 |
| 1.10 | `audio.js` | 2 sons moteur | 1.5 |
| 1.11 | `game.js`, `ui.js` | Resultats 2P | 1.5 |
| 1.12 | `game.js` | Pause 2P | 1.5 |
| 1.13 | `game.js` | Resize split-screen | 1.5 |
| 1.14 | `ui.js` | Minimap par joueur | 1.5 |

Les etapes 1.1 a 1.4 et 1.6 peuvent etre faites en parallele (pas de dependances).
L'etape 1.5 est le point de convergence critique.
Les etapes 1.7 a 1.14 dependent de 1.5.

### Phase 2 - Online

| Etape | Fichiers | Description | Prerequis |
|-------|----------|-------------|-----------|
| 2.1 | `server.js`, `package.json` | Setup Socket.io | Phase 1 terminee |
| 2.2 | `server/gameServer.js`, `server/room.js` (nouveaux) | Serveur de jeu | 2.1 |
| 2.3 | `network.js` (nouveau) | Client reseau | 2.1 |
| 2.4 | `network.js` | Interpolation buffer | 2.3 |
| 2.5 | `remotePlayer.js` (nouveau) | Joueur distant | 2.4 |
| 2.6 | `index.html`, `ui.js`, `style.css` | Lobby UI | 2.2 |
| 2.7 | `game.js`, `gameMode.js` | Integration mode online | 2.3, 2.5 |
| 2.8 | `server/gameServer.js` | Validation serveur | 2.2 |
| 2.9 | `items.js`, `server/gameServer.js` | Items en reseau | 2.7 |
| 2.10 | `network.js`, `server/gameServer.js` | Reconnexion | 2.7 |
| 2.11 | `server/gameServer.js` | Matchmaking | 2.2 |
| 2.12 | `ui.js`, `network.js` | Chat/emotes | 2.7 |

---

## 5. Risques et points d'attention

### Performance split-screen
- Deux rendus de la meme scene Three.js par frame
- Surveiller le FPS, surtout avec les particules et effets
- Potentiellement reduire la qualite (moins de particules, fog plus agressif) en split-screen
- **Split-screen sur mobile : probablement trop lourd -> desactiver ou ne pas proposer**

### Effets CSS par viewport
- Les overlays CSS (speed lines, vignette, boost flash) sont plein ecran
- En split-screen : utiliser `clip-path` ou dupliquer les elements
- Tester que les effets ne debordent pas dans le viewport de l'autre joueur

### Retrocompatibilite solo
- Chaque modification doit etre testee en solo pour eviter les regressions
- Utiliser des wrappers/aliases pour les anciennes signatures
- Le mode solo doit rester 100% identique a l'experience actuelle

### Latence reseau (Phase 2)
- L'interpolation a 100ms introduit un decalage visible
- Les collisions kart-kart a distance sont approximatives (visuelles seulement)
- Les items utilisent des events discrets (pas d'interpolation) -> plus fiable
- Tester avec latence simulee (tc netem ou similaire)

### Items en reseau
- Le serveur doit valider l'utilisation des items
- Les projectiles sont geres localement par chaque client pour la fluidite
- Les hits sont confirmes par le serveur (le client affiche l'effet immediatement mais attend confirmation)

### Scalabilite
- Socket.io sur un seul serveur Express : 50-100 rooms simultanees max
- Pour plus : Redis adapter pour Socket.io + plusieurs instances
- Pas necessaire pour le lancement initial

### Tauri (app desktop)
- Le mode online necessite un serveur accessible
- En mode Tauri local : le serveur tourne en local, le multijoueur online ne fonctionnera pas
- Afficher un message d'erreur clair si la connexion echoue
