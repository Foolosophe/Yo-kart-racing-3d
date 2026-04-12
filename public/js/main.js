// ============================================================
// MAIN - Point d'entrée de l'application
// ============================================================

import { Game } from './game.js';

// Démarrer le jeu quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏎️ Pills Stadium - Initialisation...');
    window.game = new Game();
    console.log('🏎️ Pills Stadium - Prêt !');
});
