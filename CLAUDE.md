# Pills Stadium - Kart Racing Game

## Project
Jeu de kart 3D en Three.js, jouable dans le navigateur (desktop + mobile).
Déployé sur https://kart.ydvsystems.com/

## Stack
- Three.js (WebGL) — rendu 3D
- ES Modules (vanilla JS, pas de bundler)
- HTML/CSS pour le HUD et les menus

## Structure
```
public/
  index.html          — Page principale, contrôles mobiles, meta PWA
  css/style.css       — Styles + media queries mobile
  js/
    main.js           — Point d'entrée
    game.js           — Boucle de jeu, caméra, orchestration
    config.js         — Configuration physique, caméra, piste
    player.js         — Logique joueur (physique, drift, items)
    ai.js             — Intelligence artificielle
    track.js          — Génération circuit (oval + figure-8 infini), élévation 3D, pont
    physics.js        — Collisions murs (grille spatiale) + kart-kart
    input.js          — Clavier, manette, tactile (multi-touch)
    particles.js      — Système de particules (pool, swap-and-pop)
    items.js          — Système d'items (projectiles, obstacles, boosts)
    slipstream.js     — Aspiration
    ghost.js          — Fantôme (replay meilleur tour)
    kart.js           — Modèle 3D kart, ombres, indicateurs
    ui.js             — HUD, menus, résultats, minimap
    audio.js          — Sons (moteur, drift, collisions, items)
    scores.js         — Sauvegarde scores/records (localStorage)
    utils.js          — Utilitaires (formatTime, pointToSegment, etc.)
```

## Deployment
```bash
cd "E:\YdvSystemsProd\jeu_kart\pills-stadium"
scp -r public/* root@46.225.71.188:/var/www/games/kart/
```

## Cache Busting
- `index.html` : `?t=YYYYMMDDx` sur le CSS et main.js
- **NE PAS** mettre de `?v=` sur les imports internes ES modules (casse le cache navigateur)
- Incrémenter la lettre à chaque déploiement

## Mobile Performance (IMPORTANT)
Le jeu a été optimisé pour mobile. Points clés à ne PAS casser :

1. **Camera dtFactor fixe** : `this.isMobile ? 1.0 : Math.min(dt, 0.05) * 60` dans `updateCamera()`.
   Le rAF mobile a un timing irrégulier — ne JAMAIS utiliser le dt variable pour la caméra mobile.

2. **Meshes fusionnés** : piste + murs = 3 meshes avec vertex colors (pas 1500 meshes individuels).
   Ne pas revenir aux meshes individuels par segment.

3. **Grille spatiale collisions** : `physics.js` utilise une grille avec clé numérique.
   Ne pas itérer sur tous les wallSegments.

4. **Zero-allocation** : `pointToSegment` réutilise un singleton, les callbacks sont cached.
   Ne pas créer d'objets dans la game loop.

5. **Fixed timestep mobile** : physique à 60Hz fixe + interpolation visuelle.
   Le dt variable de rAF ne doit affecter que le rendu, pas la physique.

6. **Features désactivées mobile** : screen shake, slipstream, ghost, minimap, emojis,
   ombres dynamiques, wrong way, overtakes, particules hors-piste/trails.
   Les réactiver peut causer des saccades.

## Circuits
- **Oval** : circuit simple avec relief 3D ondulé
- **Infini** : figure-8 (lemniscate) avec pont au croisement (22m d'élévation)

## Contrôles
- **Desktop** : WASD/Flèches + Shift (drift) + Space (item). Support manette.
- **Mobile** : auto-accélération, boutons tactiles gauche/droite/drift/frein/item
- **Split-screen local** : J1=WASD, J2=Flèches, manettes séparées
