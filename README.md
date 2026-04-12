# 🏎️ Pills Stadium

Jeu de course de karts 3D inspiré de Mario Kart, développé en JavaScript avec Three.js.

## 🎮 Fonctionnalités

- **Course contre l'IA** - Affrontez un adversaire contrôlé par l'ordinateur
- **3 niveaux de difficulté** - Facile, Normal, Difficile
- **Système de drift** - Drift avec boost à 3 niveaux (bleu, orange, violet)
- **Turbo Start** - Appuyez au bon moment au départ pour un boost
- **Slipstream** - Roulez derrière l'adversaire pour un bonus de vitesse
- **Collision entre karts** - Physique réaliste de collision
- **Rubber Banding** - L'IA s'adapte à votre position
- **Particules de drift** - Effets visuels colorés
- **FOV dynamique** - Sensation de vitesse augmentée
- **Support mobile** - Joystick tactile et boutons

## 🚀 Installation

```bash
# Cloner le projet
git clone <repo-url>
cd pills-stadium

# Installer les dépendances
npm install

# Démarrer le serveur
npm start
```

Le jeu sera accessible sur `http://localhost:3000`

## 🎹 Contrôles

### Clavier
| Touche | Action |
|--------|--------|
| ↑ / W | Accélérer |
| ↓ / S | Freiner / Marche arrière |
| ← / A | Tourner à gauche |
| → / D | Tourner à droite |
| SHIFT | Drift |
| R | Reset position |

### Mobile
- **Joystick gauche** - Direction
- **Bouton A** - Accélérer
- **Bouton B** - Freiner
- **Bouton D** - Drift

## 📁 Structure du projet

```
pills-stadium/
├── package.json          # Configuration npm
├── server.js             # Serveur Express
├── README.md             # Documentation
└── public/
    ├── index.html        # Page HTML principale
    ├── css/
    │   └── style.css     # Styles
    └── js/
        ├── main.js       # Point d'entrée
        ├── game.js       # Boucle de jeu principale
        ├── config.js     # Configuration
        ├── utils.js      # Fonctions utilitaires
        ├── input.js      # Gestion des entrées
        ├── track.js      # Génération de la piste
        ├── kart.js       # Modèle 3D du kart
        ├── player.js     # Logique du joueur
        ├── ai.js         # Intelligence artificielle
        ├── physics.js    # Physique et collisions
        ├── particles.js  # Système de particules
        ├── slipstream.js # Système d'aspiration
        ├── ui.js         # Interface utilisateur
        └── audio.js      # Système audio
```

## 🛠️ Technologies

- **Three.js** - Rendu 3D WebGL
- **Express** - Serveur HTTP
- **ES6 Modules** - Architecture modulaire
- **Web Audio API** - Sons

## 🏗️ DÉVELOPPEMENT EN COURS - Système de ponts

### État actuel (19 janvier 2026)

Le système de ponts/passages surélevés est en cours d'implémentation pour le circuit "Grand Prix".

#### ✅ Ce qui fonctionne :
- **Circuit Grand Prix** : 414 segments, tracé complexe avec chicane
- **Mesh du pont** : La surface surélevée est créée correctement (hauteur = 6 unités)
- **Calcul d'élévation** : `getSegmentElevation()` retourne les bonnes valeurs (rampes progressives avec smoothStep)
- **Murs surélevés** : Les murs du pont sont positionnés à la bonne hauteur
- **Piliers** : Support visuel sous le pont
- **Propriété Y** : Player et AI ont une coordonnée Y pour l'élévation

#### ❌ Problème à résoudre :
- **Le joueur/IA ne monte pas sur le pont** quand ils conduisent sur la chicane
- La fonction `getElevationAtWithLayer()` ne détecte pas correctement l'entrée sur la rampe

#### 🔍 Cause identifiée :
La chicane (segments 284-314, surélevée) et la piste principale (segment ~32, au sol) se croisent au même point géographique (x≈0, z≈-10). La fonction `getClosestSegmentIndex()` retourne le segment de la piste principale au lieu de la chicane car il est spatialement plus proche.

#### 📋 Prochaine étape :
Implémenter un **suivi de waypoints pour le joueur** (similaire à l'IA avec `currentWaypoint`) pour déterminer sur quel segment du circuit le joueur se trouve réellement, au lieu de deviner basé uniquement sur la position (x, z).

#### 📁 Fichiers concernés :
- `track.js` : `getElevationAtWithLayer()`, `getClosestSegmentForLayer()`, `getSegmentElevation()`
- `player.js` : Mise à jour de `this.y` basée sur l'élévation
- `ai.js` : Idem pour l'IA
- `physics.js` : Collision par couche (`layer`)

#### 🧪 Pour tester :
1. Sélectionner "Grand Prix"
2. Ouvrir la console (F12)
3. Conduire jusqu'à la chicane (après la longue ligne droite, tourner à gauche)
4. Observer si des logs "Player elevation: targetY=..." apparaissent

---

## 📜 Licence

MIT License - YdvSystems
