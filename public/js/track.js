// ============================================================
// TRACK - Génération de la piste
// ============================================================

import { CONFIG } from './config.js';

// ============================================================
// TRACK BRANCH - Une section de piste (sol, pont, etc.)
// ============================================================
export class TrackBranch {
    constructor(id, options = {}) {
        this.id = id;
        this.name = options.name || id;

        // Points de la piste (avec coordonnées 3D)
        this.segments = [];      // { x, y, z } - points centraux
        this.innerPoints = [];   // { x, y, z } - bord intérieur
        this.outerPoints = [];   // { x, y, z } - bord extérieur

        // Waypoints pour le suivi de progression
        this.waypoints = [];     // Indices des segments servant de waypoints

        // Mesh 3D
        this.surfaceMesh = null;       // Mesh de la surface de piste
        this.wallMeshes = [];          // Meshes des murs
        this.collisionSegments = [];   // Segments de collision pour les murs

        // Connexions vers d'autres branches
        this.connections = [];   // { targetBranchId, startSegment, endSegment, type }

        // Propriétés de la branche
        this.layer = options.layer || 0;        // 0 = sol, 1+ = surélevé
        this.baseElevation = options.baseElevation || 0;
    }

    // Ajouter un segment à la branche
    addSegment(center, inner, outer, elevation = null) {
        const y = elevation !== null ? elevation : this.baseElevation;
        this.segments.push({ x: center.x, y: y, z: center.z });
        this.innerPoints.push({ x: inner.x, y: y, z: inner.z });
        this.outerPoints.push({ x: outer.x, y: y, z: outer.z });
    }

    // Obtenir le nombre de segments
    get segmentCount() {
        return this.segments.length;
    }

    // Obtenir un segment par index (avec wrapping pour circuit fermé)
    getSegment(index) {
        const n = this.segments.length;
        if (n === 0) return null;
        const wrappedIndex = ((index % n) + n) % n;
        return {
            center: this.segments[wrappedIndex],
            inner: this.innerPoints[wrappedIndex],
            outer: this.outerPoints[wrappedIndex]
        };
    }

    // Trouver le segment le plus proche d'une position
    findClosestSegment(x, z) {
        let closestIdx = 0;
        let closestDistSq = Infinity;

        // Recherche locale d'abord si on a un index précédent
        const n = this.segments.length;
        const start = this._lastClosestIdx || 0;
        const localRange = 40;

        // Chercher localement
        for (let j = 0; j < localRange && j < n; j++) {
            const i = (start + j) % n;
            const seg = this.segments[i];
            const distSq = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
            if (distSq < closestDistSq) { closestDistSq = distSq; closestIdx = i; }
            const ib = (start - j + n) % n;
            const segB = this.segments[ib];
            const distSqB = (segB.x - x) * (segB.x - x) + (segB.z - z) * (segB.z - z);
            if (distSqB < closestDistSq) { closestDistSq = distSqB; closestIdx = ib; }
        }

        // Fallback complet si la distance locale est trop grande (téléportation, reset)
        if (closestDistSq > 2500) { // > 50 unités
            for (let i = 0; i < n; i++) {
                const seg = this.segments[i];
                const distSq = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
                if (distSq < closestDistSq) { closestDistSq = distSq; closestIdx = i; }
            }
        }

        this._lastClosestIdx = closestIdx;
        return { index: closestIdx, distance: Math.sqrt(closestDistSq) };
    }

    // Générer les waypoints automatiquement (1 waypoint tous les N segments)
    generateWaypoints(interval = 5) {
        this.waypoints = [];
        for (let i = 0; i < this.segments.length; i += interval) {
            this.waypoints.push(i);
        }
    }

    // Nettoyer les ressources 3D
    dispose(scene) {
        if (this.surfaceMesh) {
            scene.remove(this.surfaceMesh);
            if (this.surfaceMesh.geometry) this.surfaceMesh.geometry.dispose();
            if (this.surfaceMesh.material) this.surfaceMesh.material.dispose();
            this.surfaceMesh = null;
        }

        this.wallMeshes.forEach(mesh => {
            scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        this.wallMeshes = [];
        this.collisionSegments = [];
    }
}

// ============================================================
// PIÈCES DE CIRCUIT (LEGOS) - Basées sur le circuit ovale
// ============================================================

/**
 * Curseur de construction - garde la position/direction actuelle
 */
class TrackCursor {
    constructor(x, z, angle, halfWidth) {
        this.x = x;
        this.z = z;
        this.angle = angle;  // En radians, 0 = vers +X, PI/2 = vers +Z
        this.halfWidth = halfWidth;
    }

    // Avancer le curseur
    advance(distance) {
        this.x += Math.cos(this.angle) * distance;
        this.z += Math.sin(this.angle) * distance;
    }

    // Tourner le curseur
    rotate(angleRad) {
        this.angle += angleRad;
    }

    // Obtenir les points inner/outer pour la position actuelle
    getPoints() {
        // Perpendiculaire à la direction (90° à gauche)
        const perpAngle = this.angle + Math.PI / 2;
        return {
            center: { x: this.x, z: this.z },
            inner: {
                x: this.x + Math.cos(perpAngle) * this.halfWidth,
                z: this.z + Math.sin(perpAngle) * this.halfWidth
            },
            outer: {
                x: this.x - Math.cos(perpAngle) * this.halfWidth,
                z: this.z - Math.sin(perpAngle) * this.halfWidth
            }
        };
    }
}

/**
 * Constructeur de pièces - ajoute des segments à une branche
 */
class TrackPieceBuilder {
    constructor(branch, halfWidth, getElevation) {
        this.branch = branch;
        this.halfWidth = halfWidth;
        this.getElevation = getElevation;  // Fonction (segmentIndex) => elevation
        this.cursor = null;
        this.segmentCount = 0;
    }

    // Initialiser le curseur de départ
    start(x, z, angle) {
        this.cursor = new TrackCursor(x, z, angle, this.halfWidth);
        return this;
    }

    /**
     * PIÈCE: Ligne droite
     * COPIÉ EXACTEMENT de l'ovale (sections 1 et 3)
     */
    straight(length, segments, customElevation = null) {
        if (!this.cursor) throw new Error('Cursor not initialized');

        const stepLength = length / segments;

        for (let i = 0; i < segments; i++) {
            const points = this.cursor.getPoints();
            const elevation = customElevation !== null
                ? customElevation
                : this.getElevation(this.segmentCount);

            this.branch.addSegment(
                points.center,
                points.inner,
                points.outer,
                elevation
            );

            this.cursor.advance(stepLength);
            this.segmentCount++;
        }

        return this;
    }

    /**
     * PIÈCE: Virage (arc de cercle)
     * COPIÉ EXACTEMENT de l'ovale (sections 2 et 4)
     * @param radius - Rayon du virage
     * @param angleDeg - Angle en degrés (positif = gauche, négatif = droite)
     * @param segments - Nombre de segments
     */
    curve(radius, angleDeg, segments, customElevation = null) {
        if (!this.cursor) throw new Error('Cursor not initialized');

        const angleRad = angleDeg * Math.PI / 180;
        const direction = angleDeg > 0 ? 1 : -1;  // 1 = gauche, -1 = droite

        // Centre du cercle (perpendiculaire à la direction actuelle)
        const toCenterAngle = this.cursor.angle + (Math.PI / 2) * direction;
        const centerX = this.cursor.x + Math.cos(toCenterAngle) * radius;
        const centerZ = this.cursor.z + Math.sin(toCenterAngle) * radius;

        // Angle de départ sur le cercle (depuis le centre vers le curseur)
        const startAngle = Math.atan2(this.cursor.z - centerZ, this.cursor.x - centerX);

        const innerRadius = radius - this.halfWidth * direction;
        const outerRadius = radius + this.halfWidth * direction;

        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const currentAngle = startAngle + angleRad * t;

            const x = centerX + Math.cos(currentAngle) * radius;
            const z = centerZ + Math.sin(currentAngle) * radius;

            const innerX = centerX + Math.cos(currentAngle) * innerRadius;
            const innerZ = centerZ + Math.sin(currentAngle) * innerRadius;
            const outerX = centerX + Math.cos(currentAngle) * outerRadius;
            const outerZ = centerZ + Math.sin(currentAngle) * outerRadius;

            const elevation = customElevation !== null
                ? (typeof customElevation === 'function' ? customElevation(t) : customElevation)
                : this.getElevation(this.segmentCount);

            this.branch.addSegment(
                { x, z },
                { x: innerX, z: innerZ },
                { x: outerX, z: outerZ },
                elevation
            );

            this.segmentCount++;
        }

        // Mettre à jour le curseur à la position finale
        const endAngle = startAngle + angleRad;
        this.cursor.x = centerX + Math.cos(endAngle) * radius;
        this.cursor.z = centerZ + Math.sin(endAngle) * radius;
        this.cursor.angle += angleRad;

        return this;
    }

    /**
     * PIÈCE: Virage 180° (demi-tour)
     */
    hairpin(radius, segments, direction = 'left', customElevation = null) {
        const angleDeg = direction === 'left' ? 180 : -180;
        return this.curve(radius, angleDeg, segments, customElevation);
    }

    /**
     * PIÈCE: Ligne droite avec pont (monte puis descend)
     */
    bridge(length, segments, maxHeight) {
        if (!this.cursor) throw new Error('Cursor not initialized');

        const stepLength = length / segments;

        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const points = this.cursor.getPoints();

            // Élévation en cloche : monte puis descend
            let elevation;
            if (t < 0.5) {
                elevation = this.getElevation(this.segmentCount) + (maxHeight * (t * 2));
            } else {
                elevation = this.getElevation(this.segmentCount) + (maxHeight * (2 - t * 2));
            }

            this.branch.addSegment(
                points.center,
                points.inner,
                points.outer,
                elevation
            );

            this.cursor.advance(stepLength);
            this.segmentCount++;
        }

        return this;
    }

    // Obtenir la position actuelle du curseur
    getPosition() {
        return { x: this.cursor.x, z: this.cursor.z, angle: this.cursor.angle };
    }

    // Obtenir le nombre de segments créés
    getSegmentCount() {
        return this.segmentCount;
    }
}

// ============================================================
// TRACK BUILDER - Construction de circuits avec API chaînable
// ============================================================
export class TrackBuilder {
    /**
     * Crée un builder pour construire un circuit de manière fluide
     * @param {string} branchId - Identifiant de la branche
     * @param {number} startX - Position X de départ
     * @param {number} startZ - Position Z de départ
     * @param {number} startAngle - Angle de départ (radians, 0 = vers +Z)
     * @param {number} startElevation - Élévation de départ
     * @param {object} options - Options pour la branche (name, layer, etc.)
     */
    constructor(branchId, startX, startZ, startAngle, startElevation, options = {}) {
        this.branch = new TrackBranch(branchId, options);
        this.currentX = startX;
        this.currentZ = startZ;
        this.currentAngle = startAngle;
        this.currentElevation = startElevation;
        this.halfWidth = CONFIG.track.width / 2;
    }

    /**
     * Ajoute une ligne droite
     * @param {number} length - Longueur de la ligne droite
     * @param {number} segments - Nombre de segments
     * @param {number} endElevation - Élévation à l'arrivée (ou null pour garder la même)
     * @returns {TrackBuilder} this pour chaînage
     */
    straight(length, segments, endElevation = null) {
        if (endElevation === null) endElevation = this.currentElevation;

        // Calculer le point d'arrivée basé sur l'angle actuel
        const endX = this.currentX + Math.sin(this.currentAngle) * length;
        const endZ = this.currentZ + Math.cos(this.currentAngle) * length;

        this.branch.addStraight(
            this.currentX, this.currentZ,
            endX, endZ,
            segments,
            this.currentElevation, endElevation,
            this.halfWidth
        );

        // Mettre à jour la position courante
        this.currentX = endX;
        this.currentZ = endZ;
        this.currentElevation = endElevation;
        // L'angle reste le même pour une ligne droite

        return this;
    }

    /**
     * Ajoute une courbe
     * @param {number} radius - Rayon de la courbe
     * @param {number} angleDegrees - Angle de la courbe en degrés (positif = droite, négatif = gauche)
     * @param {number} segments - Nombre de segments
     * @param {number} endElevation - Élévation à l'arrivée
     * @returns {TrackBuilder} this pour chaînage
     */
    curve(radius, angleDegrees, segments, endElevation = null) {
        if (endElevation === null) endElevation = this.currentElevation;

        const angleRad = angleDegrees * Math.PI / 180;
        const direction = angleDegrees > 0 ? 1 : -1;

        // Calculer le centre du cercle (perpendiculaire à la direction actuelle)
        // Si on tourne à droite (direction = 1), le centre est à droite
        const perpAngle = this.currentAngle + (Math.PI / 2) * direction;
        const centerX = this.currentX + Math.sin(perpAngle) * radius;
        const centerZ = this.currentZ + Math.cos(perpAngle) * radius;

        // Angle de départ sur le cercle (opposé à la direction vers le centre)
        const startAngleOnCircle = perpAngle + Math.PI;
        const endAngleOnCircle = startAngleOnCircle + angleRad;

        this.branch.addCurve(
            centerX, centerZ, radius,
            startAngleOnCircle, endAngleOnCircle,
            segments,
            this.currentElevation, endElevation,
            direction,
            this.halfWidth
        );

        // Mettre à jour la position et l'angle
        this.currentX = centerX + Math.sin(endAngleOnCircle + Math.PI) * radius;
        this.currentZ = centerZ + Math.cos(endAngleOnCircle + Math.PI) * radius;
        this.currentAngle = this.currentAngle + angleRad;
        this.currentElevation = endElevation;

        return this;
    }

    /**
     * Ajoute un virage en épingle (180°)
     * @param {number} radius - Rayon du virage
     * @param {number} segments - Nombre de segments
     * @param {number} endElevation - Élévation à l'arrivée
     * @param {number} direction - 1 = droite, -1 = gauche
     * @returns {TrackBuilder} this pour chaînage
     */
    hairpin(radius, segments, endElevation = null, direction = 1) {
        // Un hairpin est une courbe de 180°
        return this.curve(radius, 180 * direction, segments, endElevation);
    }

    /**
     * Définit la demi-largeur de la piste pour les prochains segments
     * @param {number} halfWidth - Nouvelle demi-largeur
     * @returns {TrackBuilder} this pour chaînage
     */
    setWidth(halfWidth) {
        this.halfWidth = halfWidth;
        return this;
    }

    /**
     * Obtient la position et l'angle actuels
     * @returns {{x: number, z: number, angle: number, elevation: number}}
     */
    getState() {
        return {
            x: this.currentX,
            z: this.currentZ,
            angle: this.currentAngle,
            elevation: this.currentElevation
        };
    }

    /**
     * Définit manuellement la position actuelle (pour corrections)
     * @param {number} x - Position X
     * @param {number} z - Position Z
     * @param {number} angle - Angle (optionnel)
     * @param {number} elevation - Élévation (optionnel)
     * @returns {TrackBuilder} this pour chaînage
     */
    setPosition(x, z, angle = null, elevation = null) {
        this.currentX = x;
        this.currentZ = z;
        if (angle !== null) this.currentAngle = angle;
        if (elevation !== null) this.currentElevation = elevation;
        return this;
    }

    /**
     * Finalise la construction et retourne la branche
     * @param {number} waypointInterval - Intervalle des waypoints (défaut: 5)
     * @returns {TrackBranch} La branche construite
     */
    build(waypointInterval = 5) {
        this.branch.generateWaypoints(waypointInterval);

        console.log(`[TrackBuilder] Built branch "${this.branch.id}" with ${this.branch.segmentCount} segments`);
        console.log(`[TrackBuilder] Elevation range: ${Math.min(...this.branch.segments.map(s => s.y)).toFixed(2)} to ${Math.max(...this.branch.segments.map(s => s.y)).toFixed(2)}`);

        return this.branch;
    }
}

// ============================================================
// TRACK GRAPH - Graphe de branches interconnectées
// ============================================================
export class TrackGraph {
    constructor() {
        this.branches = new Map();    // id -> TrackBranch
        this.transitions = [];        // Zones de transition entre branches
        this.activeBranchId = null;   // Branche principale active
    }

    // Ajouter une branche
    addBranch(branch) {
        this.branches.set(branch.id, branch);
        if (this.activeBranchId === null) {
            this.activeBranchId = branch.id;
        }
    }

    // Obtenir une branche par ID
    getBranch(id) {
        return this.branches.get(id);
    }

    // Obtenir la branche active
    getActiveBranch() {
        return this.branches.get(this.activeBranchId);
    }

    // Définir la branche active
    setActiveBranch(id) {
        if (this.branches.has(id)) {
            this.activeBranchId = id;
        }
    }

    // Ajouter une transition entre branches
    addTransition(transition) {
        // { id, position: {x, z}, fromBranch, toBranch, fromSegment, toSegment, direction }
        this.transitions.push(transition);
    }

    // Trouver sur quelle branche se trouve une position (x, z)
    // Utilise la branche courante comme indice pour éviter les ambiguïtés
    findBranchAt(x, z, currentBranchId = null) {
        // Si on a une branche courante, vérifier d'abord si on y est toujours
        if (currentBranchId && this.branches.has(currentBranchId)) {
            const currentBranch = this.branches.get(currentBranchId);
            const result = currentBranch.findClosestSegment(x, z);
            if (result.distance < CONFIG.track.width) {
                return { branch: currentBranch, segmentIndex: result.index, distance: result.distance };
            }
        }

        // Sinon, chercher la branche la plus proche
        let bestBranch = null;
        let bestIndex = 0;
        let bestDist = Infinity;

        for (const [id, branch] of this.branches) {
            const result = branch.findClosestSegment(x, z);
            if (result.distance < bestDist) {
                bestDist = result.distance;
                bestBranch = branch;
                bestIndex = result.index;
            }
        }

        return { branch: bestBranch, segmentIndex: bestIndex, distance: bestDist };
    }

    // Nettoyer toutes les branches
    dispose(scene) {
        for (const branch of this.branches.values()) {
            branch.dispose(scene);
        }
        this.branches.clear();
        this.transitions = [];
        this.activeBranchId = null;
    }

    // Obtenir tous les segments de collision de toutes les branches
    getAllCollisionSegments() {
        const allSegments = [];
        for (const branch of this.branches.values()) {
            allSegments.push(...branch.collisionSegments);
        }
        return allSegments;
    }
}

// ============================================================
// TRACK - Classe principale (utilise TrackGraph)
// ============================================================
export class Track {
    constructor(scene) {
        this.scene = scene;
        this.trackType = 'oval';

        // ===== NOUVEAU SYSTÈME: TrackGraph avec branches =====
        this.graph = new TrackGraph();

        // ===== COMPATIBILITÉ: Ces propriétés pointent vers la branche active =====
        // (Seront mises à jour par syncFromActiveBranch())
        this.centerPoints = [];
        this.innerPoints = [];
        this.outerPoints = [];

        this.wallSegments = [];
        this.checkpointZones = [];
        this.boostZones = [];
        this.rampZones = [];    // Zones de tremplin (saut)
        this.trackMeshes = [];  // Pour pouvoir les supprimer lors d'un changement de circuit

        // Système d'élévation pour les ponts (legacy - sera remplacé par branches)
        this.elevatedSegments = [];  // {startIdx, endIdx, height, rampLength}
        this.bridgeHeight = 6;       // Hauteur standard des ponts
        this.rampLength = 10;        // Longueur des rampes (en segments)

        // Données de départ (varient selon le circuit)
        this.startX = 0;
        this.startZ = 0;
        this.startAngle = Math.PI;
    }

    // Synchroniser les propriétés legacy avec la branche active
    syncFromActiveBranch() {
        const branch = this.graph.getActiveBranch();
        if (!branch) return;

        // Convertir les segments 3D en points 2D pour compatibilité
        // Inclure Y pour les circuits avec croisements (figure-8)
        this.centerPoints = branch.segments.map(s => ({ x: s.x, y: s.y, z: s.z }));
        this.innerPoints = branch.innerPoints.map(s => ({ x: s.x, y: s.y, z: s.z }));
        this.outerPoints = branch.outerPoints.map(s => ({ x: s.x, y: s.y, z: s.z }));

        console.log(`[Track] Synced from branch "${branch.id}": ${this.centerPoints.length} segments`);
    }

    // Nettoyer le circuit actuel
    clear() {
        // Supprimer tous les meshes de la scène
        this.trackMeshes.forEach(mesh => {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        });
        this.trackMeshes = [];

        // Nettoyer le TrackGraph
        this.graph.dispose(this.scene);

        // Reset des propriétés legacy
        this.centerPoints = [];
        this.innerPoints = [];
        this.outerPoints = [];
        this.wallSegments = [];
        this.checkpointZones = [];
        this.boostZones = [];
        this.rampZones = [];
        this.elevatedSegments = [];

        // Reset du raycasting
        this.trackSurfaceMeshes = [];
        this.raycaster = null;

        // Reset des caches de recherche locale PER-RACER (évite desync entre circuits et entre joueur/IA)
        this._elevCache = {};
        this._onTrackCache = {};
        this._trackPtCache = {};

    }

    generate(trackType = 'oval') {
        console.log('Generating track:', trackType);
        this.clear();
        this.trackType = trackType;

        if (trackType === 'volcan') {
            this.generateVolcanTrack();
        } else if (trackType === 'infini') {
            this.generateInfiniTrack();
        } else {
            this.generateOvalTrack();
        }

        // Synchroniser les propriétés legacy avec la branche active
        this.syncFromActiveBranch();

        console.log('Track points generated:', this.centerPoints.length);
        console.log('Elevated segments:', this.elevatedSegments.length);
        console.log('Graph branches:', this.graph.branches.size);

        this.createTrackMesh();
        this.createWalls();
        this.createCheckpoints();
        this.createStartLine();
        this.createBoostZones();
        this.createEnvironment();

        // Initialiser le raycasting pour le suivi du terrain 3D
        this.initRaycasting();

        console.log('=== TRACK GENERATION COMPLETE ===');
        console.log('Track type:', this.trackType);
        console.log('Total track meshes:', this.trackMeshes.length);
        console.log('Total wall segments:', this.wallSegments.length);
        console.log('Total checkpoints:', this.checkpointZones.length);
        console.log('Total boost zones:', this.boostZones.length);
        console.log('Elevated segments:', this.elevatedSegments.length);
        console.log('Active branch:', this.graph.activeBranchId);
        console.log('Raycasting meshes:', this.trackSurfaceMeshes ? this.trackSurfaceMeshes.length : 0);
        console.log('================================');
    }

    // ============================================================
    // PROFIL D'ÉLÉVATION 3D
    // ============================================================

    // Calculer l'élévation pour un segment donné (0 à totalSegments-1)
    getElevationForSegment(segmentIndex, totalSegments) {
        const elevConfig = CONFIG.elevation;

        // Si le relief est désactivé, retourner 0
        if (!elevConfig || !elevConfig.enabled) {
            return 0;
        }

        // Position normalisée sur le circuit (0 à 1)
        const t = segmentIndex / totalSegments;

        // Composante 1: Colline principale (monte d'un côté, descend de l'autre)
        const mainHill = Math.sin(t * Math.PI * 2 * elevConfig.mainHillFrequency)
                        * elevConfig.mainHillAmplitude;

        // Composante 2: Petites bosses ondulantes
        const bumps = Math.sin(t * Math.PI * 2 * elevConfig.bumpFrequency)
                     * elevConfig.bumpAmplitude;

        // Composante 3: Légère variation supplémentaire pour plus de naturel
        const microDetail = Math.sin(t * Math.PI * 2 * 7) * 0.3;

        // Combinaison avec hauteur de base (pour éviter les valeurs négatives)
        const elevation = elevConfig.baseHeight + mainHill + bumps + microDetail;

        return Math.max(0, elevation);  // Ne jamais aller sous 0
    }

    // Circuit ovale original - utilise le nouveau système de branches avec relief 3D
    generateOvalTrack() {
        const { straightLength, curveRadius, width } = CONFIG.track;
        const halfLength = straightLength / 2;
        const halfWidth = width / 2;

        // Position de départ
        this.startX = -curveRadius;
        this.startZ = straightLength / 2;
        this.startAngle = Math.PI;

        // Créer la branche principale pour le circuit oval
        const mainBranch = new TrackBranch('oval_main', {
            name: 'Circuit Oval - Principal',
            layer: 0,
            baseElevation: 0
        });

        // Nombre total de segments (pour calculer le profil d'élévation)
        const totalSegments = 150;  // 30 + 45 + 30 + 45
        let currentSegment = 0;

        // Helper pour ajouter un segment à la branche avec élévation
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

        // Section 1: Ligne droite gauche (vers le bas) - 30 segments
        // C'est ici que commence la MONTÉE
        for (let i = 0; i < 30; i++) {
            const t = i / 30;
            const x = -curveRadius;
            const z = halfLength - t * straightLength;
            addSegmentWithElevation(x, z, x + halfWidth, z, x - halfWidth, z);
        }

        // Section 2: Demi-cercle bas - 45 segments
        // Point HAUT du circuit
        for (let i = 0; i < 45; i++) {
            const t = i / 45;
            const angle = Math.PI + Math.PI * t;
            const x = Math.cos(angle) * curveRadius;
            const z = -halfLength + Math.sin(angle) * curveRadius;
            const innerX = Math.cos(angle) * (curveRadius - halfWidth);
            const innerZ = -halfLength + Math.sin(angle) * (curveRadius - halfWidth);
            const outerX = Math.cos(angle) * (curveRadius + halfWidth);
            const outerZ = -halfLength + Math.sin(angle) * (curveRadius + halfWidth);
            addSegmentWithElevation(x, z, innerX, innerZ, outerX, outerZ);
        }

        // Section 3: Ligne droite droite (vers le haut) - 30 segments
        // C'est ici que commence la DESCENTE
        for (let i = 0; i < 30; i++) {
            const t = i / 30;
            const x = curveRadius;
            const z = -halfLength + t * straightLength;
            addSegmentWithElevation(x, z, x - halfWidth, z, x + halfWidth, z);
        }

        // Section 4: Demi-cercle haut - 45 segments
        // Point BAS du circuit
        for (let i = 0; i < 45; i++) {
            const t = i / 45;
            const angle = Math.PI * t;
            const x = Math.cos(angle) * curveRadius;
            const z = halfLength + Math.sin(angle) * curveRadius;
            const innerX = Math.cos(angle) * (curveRadius - halfWidth);
            const innerZ = halfLength + Math.sin(angle) * (curveRadius - halfWidth);
            const outerX = Math.cos(angle) * (curveRadius + halfWidth);
            const outerZ = halfLength + Math.sin(angle) * (curveRadius + halfWidth);
            addSegmentWithElevation(x, z, innerX, innerZ, outerX, outerZ);
        }

        // Générer les waypoints pour le suivi de position
        mainBranch.generateWaypoints(5);

        // Ajouter la branche au graphe
        this.graph.addBranch(mainBranch);

        // Log des élévations pour debug
        console.log(`[generateOvalTrack] Created branch "${mainBranch.id}" with ${mainBranch.segmentCount} segments`);
        console.log(`[generateOvalTrack] Elevation range: min=${Math.min(...mainBranch.segments.map(s => s.y)).toFixed(2)}, max=${Math.max(...mainBranch.segments.map(s => s.y)).toFixed(2)}`);
    }

    // ============================================================
    // CIRCUIT INFINI - Figure 8 avec formule paramétrique
    // Basé sur la lemniscate : x = sin(t) * R, z = sin(2t) * scaleZ
    // Référence : circuit-figure8-technical-doc.md
    // Distance : ~9.5 km
    // ============================================================
    generateInfiniTrack() {
        const { width } = CONFIG.track;
        const halfWidth = width / 2;

        // Configuration du circuit (~2.4 km par tour)
        const baseRadius = 250;
        const scaleZ = 300;
        const bridgeHeight = 12;    // 12 mètres au-dessus du sol (hauteur fixe)
        const rampWidth = 0.12;     // 12% du circuit

        // Échelles des 4 virages (difficulté croissante)
        const s1 = 1.8;   // Virage 1 : très facile (rayon ~1800m)
        const s2 = 1.4;   // Virage 2 : moyen (rayon ~1400m)
        const s3 = 1.0;   // Virage 3 : difficile (rayon ~1000m)
        const s4 = 0.7;   // Virage 4 : très difficile (rayon ~700m)

        // Nombre de segments (déclaré ici pour être accessible dans getPoint)
        const totalSegments = 500;

        // Fonctions utilitaires
        const smoothstep = (t) => t * t * (3 - 2 * t);
        const lerp = (a, b, t) => a + (b - a) * t;

        // Fonction pour obtenir l'échelle à une position donnée
        const getScale = (tNorm) => {
            if (tNorm < 0.25) {
                return lerp(s4, s1, smoothstep(tNorm / 0.25));
            } else if (tNorm < 0.5) {
                return lerp(s1, s2, smoothstep((tNorm - 0.25) / 0.25));
            } else if (tNorm < 0.75) {
                return lerp(s2, s3, smoothstep((tNorm - 0.5) / 0.25));
            } else {
                return lerp(s3, s4, smoothstep((tNorm - 0.75) / 0.25));
            }
        };

        // Fonction pour calculer un point sur la courbe (XZ seulement)
        const getPoint = (tNorm) => {
            const t = tNorm * Math.PI * 2;
            const scale = getScale(tNorm);
            const x = Math.sin(t) * baseRadius * scale;
            const z = Math.sin(2 * t) * scaleZ;
            return { x, z };
        };

        // Fonction pour calculer l'élévation du pont
        const getBridgeElevation = (tNorm) => {
            const distToHalf = Math.abs(tNorm - 0.5);
            if (distToHalf < rampWidth) {
                const rampProgress = 1 - (distToHalf / rampWidth);
                return bridgeHeight * smoothstep(rampProgress);
            }
            return 0;
        };

        // Fonction pour calculer la tangente (dérivée analytique)
        const getTangent = (tNorm) => {
            const t = tNorm * Math.PI * 2;
            const scale = getScale(tNorm);

            // Dérivées : dx/dt = cos(t) * R * scale, dz/dt = 2 * cos(2t) * scaleZ
            const dx = Math.cos(t) * baseRadius * scale;
            const dz = 2 * Math.cos(2 * t) * scaleZ;

            // Normaliser
            const len = Math.sqrt(dx * dx + dz * dz);
            return { x: dx / len, z: dz / len };
        };

        // Position de départ : tNorm = 0.75 (boucle droite, loin du croisement)
        // segment 0 = position de départ
        const startTNorm = 0.75;
        const startPt = getPoint(startTNorm);
        const startTan = getTangent(startTNorm);

        this.startX = startPt.x;
        this.startZ = startPt.z;
        // Angle pour que le joueur avance dans la direction de la tangente
        this.startAngle = Math.atan2(startTan.x, startTan.z);

        // Créer la branche
        const mainBranch = new TrackBranch('infini_main', {
            name: 'Circuit Infini',
            layer: 0,
            baseElevation: 0
        });

        // Générer les segments EN COMMENÇANT par la position de départ
        // Ainsi segment 0 = départ, et les checkpoints à 25%, 50%, 75% sont dans l'ordre
        for (let i = 0; i < totalSegments; i++) {
            // Décaler tNorm pour commencer au point de départ
            const tNorm = (startTNorm + i / totalSegments) % 1.0;
            const pt = getPoint(tNorm);
            const tan = getTangent(tNorm);

            // Élévation = relief 3D (comme Oval) + pont
            const reliefY = this.getElevationForSegment(i, totalSegments);
            const bridgeY = getBridgeElevation(tNorm);

            // Sur le pont : élévation FIXE à 12m AU-DESSUS du relief max (~10m)
            // Pour garantir le passage en dessous
            let elevation;
            if (bridgeY > 0) {
                // Zone du pont : hauteur fixe = relief_max (10) + bridgeHeight (12) = 22m
                // Avec rampe progressive
                const bridgeBaseHeight = 10 + bridgeHeight;  // 22m au sommet
                const rampFactor = bridgeY / bridgeHeight;   // 0 à 1
                elevation = reliefY * (1 - rampFactor) + bridgeBaseHeight * rampFactor;
            } else {
                elevation = reliefY;
            }

            // Perpendiculaire : rotation 90° de la tangente
            const rightX = -tan.z;
            const rightZ = tan.x;

            // Points gauche (inner) et droit (outer) de la piste
            const leftX = pt.x - rightX * halfWidth;
            const leftZ = pt.z - rightZ * halfWidth;
            const rightPtX = pt.x + rightX * halfWidth;
            const rightPtZ = pt.z + rightZ * halfWidth;

            mainBranch.addSegment(
                { x: pt.x, z: pt.z },
                { x: leftX, z: leftZ },
                { x: rightPtX, z: rightPtZ },
                elevation
            );
        }

        // Générer les waypoints
        mainBranch.generateWaypoints(5);

        // Ajouter la branche au graphe
        this.graph.addBranch(mainBranch);

        console.log(`[Infini] Figure-8 créé : ${mainBranch.segmentCount} segments`);
        console.log(`[Infini] Dimensions: X=${(baseRadius * s1 * 2).toFixed(0)}, Z=${(scaleZ * 2).toFixed(0)}`);
        console.log(`[Infini] Départ: (${this.startX.toFixed(1)}, ${this.startZ.toFixed(1)})`);
        console.log(`[Infini] Elevation range: min=${Math.min(...mainBranch.segments.map(s => s.y)).toFixed(2)}, max=${Math.max(...mainBranch.segments.map(s => s.y)).toFixed(2)}`);
    }

    // ============================================================
    // CIRCUIT VOLCAN - Montagne volcanique avec lacets et canyon
    // ============================================================
    generateVolcanTrack() {
        const { width } = CONFIG.track;
        const halfWidth = width / 2;
        const totalSegments = 1000;

        // === Catmull-Rom interpolation ===
        const catmullRom = (p0, p1, p2, p3, t) => {
            const t2 = t * t, t3 = t2 * t;
            return {
                x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
                y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
                z: 0.5 * ((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)
            };
        };
        const catmullRomDeriv = (p0, p1, p2, p3, t) => {
            const t2 = t * t;
            return {
                x: 0.5 * ((-p0.x+p2.x) + (4*p0.x-10*p1.x+8*p2.x-2*p3.x)*t + (-3*p0.x+9*p1.x-9*p2.x+3*p3.x)*t2),
                z: 0.5 * ((-p0.z+p2.z) + (4*p0.z-10*p1.z+8*p2.z-2*p3.z)*t + (-3*p0.z+9*p1.z-9*p2.z+3*p3.z)*t2)
            };
        };

        // === Points de contrôle du circuit ===
        // Layout: départ sud → lacets ouest (montée) → sommet nord → canyon est → descente → retour
        const cp = [
            // SECTION 1: DÉPART & SORTIE DE VALLÉE
            {x: 0, z: 0, y: 2},               // 0: Ligne de départ
            {x: -100, z: 60, y: 3},            // 1: Départ vers l'ouest
            {x: -220, z: 160, y: 5},           // 2: Grande courbe d'approche
            {x: -300, z: 300, y: 8},           // 3: Pied de la montagne

            // SECTION 2: LACETS SERRÉS (montée)
            // Lacet 1 : virage serré à droite
            {x: -380, z: 420, y: 13},          // 4: Ligne droite montante
            {x: -460, z: 500, y: 17},          // 5: Entrée lacet 1
            {x: -470, z: 570, y: 20},          // 6: Apex lacet 1
            {x: -400, z: 600, y: 22},          // 7: Sortie lacet 1

            // Lacet 2 : virage serré à gauche
            {x: -280, z: 640, y: 25},          // 8: Traversée
            {x: -200, z: 710, y: 28},          // 9: Entrée lacet 2
            {x: -190, z: 780, y: 31},          // 10: Apex lacet 2
            {x: -260, z: 810, y: 33},          // 11: Sortie lacet 2

            // Virage doux 1 (respiration)
            {x: -360, z: 870, y: 36},          // 12: Courbe douce

            // Lacet 3 : virage serré à droite
            {x: -450, z: 950, y: 39},          // 13: Entrée lacet 3
            {x: -470, z: 1030, y: 42},         // 14: Apex lacet 3
            {x: -400, z: 1060, y: 44},         // 15: Sortie lacet 3

            // Lacet 4 : virage serré à gauche
            {x: -280, z: 1100, y: 46},         // 16: Traversée
            {x: -200, z: 1160, y: 48},         // 17: Entrée lacet 4
            {x: -190, z: 1230, y: 50},         // 18: Apex lacet 4
            {x: -260, z: 1260, y: 51},         // 19: Sortie lacet 4

            // SECTION 3: SOMMET VOLCANIQUE
            // Virage doux 2 vers le sommet
            {x: -340, z: 1340, y: 53},         // 20: Courbe vers sommet
            {x: -250, z: 1430, y: 55},         // 21: Approche sommet
            {x: -100, z: 1480, y: 57},         // 22: Plateau volcanique
            {x: 80, z: 1500, y: 58},           // 23: Sommet - point culminant
            {x: 250, z: 1470, y: 57},          // 24: Descente du sommet
            {x: 380, z: 1390, y: 55},          // 25: Vers le canyon

            // SECTION 4: TREMPLIN & CANYON
            {x: 430, z: 1300, y: 53},          // 26: Approche rampe
            {x: 450, z: 1230, y: 58},          // 27: RAMPE (montée finale avant saut!)

            // Canyon (le kart vole au-dessus)
            {x: 465, z: 1140, y: 6},           // 28: Fond du canyon
            {x: 470, z: 1060, y: 4},           // 29: Point le plus bas du ravin

            // Atterrissage
            {x: 460, z: 980, y: 44},           // 30: Plateforme d'atterrissage
            {x: 440, z: 920, y: 42},           // 31: Stabilisation post-saut

            // SECTION 5: DESCENTE RAPIDE (côté est)
            {x: 400, z: 790, y: 36},           // 32: Grande courbe rapide
            {x: 370, z: 650, y: 28},           // 33: Descente continue
            {x: 340, z: 510, y: 21},           // 34: Section haute vitesse
            {x: 290, z: 380, y: 15},           // 35: Approche vallée
            {x: 220, z: 260, y: 10},           // 36: Bas de la descente
            {x: 140, z: 150, y: 5},            // 37: Retour en vallée
            {x: 60, z: 60, y: 3},              // 38: Bouclage vers départ
        ];

        const n = cp.length;

        // === Fonctions d'interpolation ===
        const getPoint = (tNorm) => {
            const t = ((tNorm % 1) + 1) % 1;
            const idx = t * n;
            const i = Math.floor(idx) % n;
            const f = idx - Math.floor(idx);
            return catmullRom(cp[(i-1+n)%n], cp[i], cp[(i+1)%n], cp[(i+2)%n], f);
        };

        const getTangent = (tNorm) => {
            const t = ((tNorm % 1) + 1) % 1;
            const idx = t * n;
            const i = Math.floor(idx) % n;
            const f = idx - Math.floor(idx);
            const d = catmullRomDeriv(cp[(i-1+n)%n], cp[i], cp[(i+1)%n], cp[(i+2)%n], f);
            const len = Math.sqrt(d.x * d.x + d.z * d.z);
            if (len < 0.001) return { x: 0, z: 1 };
            return { x: d.x / len, z: d.z / len };
        };

        // === Position de départ ===
        const startPt = getPoint(0);
        const startTan = getTangent(0);
        this.startX = startPt.x;
        this.startZ = startPt.z;
        this.startAngle = Math.atan2(startTan.x, startTan.z);

        // === Créer la branche ===
        const mainBranch = new TrackBranch('volcan_main', {
            name: 'Circuit Volcan',
            layer: 0,
            baseElevation: 0
        });

        // === Générer les segments ===
        for (let i = 0; i < totalSegments; i++) {
            const tNorm = i / totalSegments;
            const pt = getPoint(tNorm);
            const tan = getTangent(tNorm);

            const rightX = -tan.z;
            const rightZ = tan.x;

            mainBranch.addSegment(
                { x: pt.x, z: pt.z },
                { x: pt.x - rightX * halfWidth, z: pt.z - rightZ * halfWidth },
                { x: pt.x + rightX * halfWidth, z: pt.z + rightZ * halfWidth },
                pt.y
            );
        }

        // Waypoints pour l'IA (tous les 5 segments)
        mainBranch.generateWaypoints(5);
        this.graph.addBranch(mainBranch);

        // === Zone de tremplin ===
        // Le tremplin est au point de contrôle 27 (tNorm ≈ 27/39 ≈ 0.692)
        this.rampZones = [];
        const rampTNorm = 27 / n;
        const rampPt = getPoint(rampTNorm);
        const rampTan = getTangent(rampTNorm);
        const rampAngle = Math.atan2(rampTan.x, rampTan.z);
        this.rampZones.push({
            x: rampPt.x,
            z: rampPt.z,
            width: 90,
            length: 30,
            angle: rampAngle,
            power: 1.5
        });

        console.log(`[Volcan] Circuit créé : ${mainBranch.segmentCount} segments`);
        console.log(`[Volcan] Départ: (${this.startX.toFixed(1)}, ${this.startZ.toFixed(1)})`);
        console.log(`[Volcan] Elevation range: min=${Math.min(...mainBranch.segments.map(s => s.y)).toFixed(2)}, max=${Math.max(...mainBranch.segments.map(s => s.y)).toFixed(2)}`);
        console.log(`[Volcan] Ramp zone at: (${rampPt.x.toFixed(1)}, ${rampPt.z.toFixed(1)})`);
    }

    createTrackMesh() {
        // Utiliser la branche active pour le nouveau système 3D
        const branch = this.graph.getActiveBranch();
        const use3DRelief = branch && branch.segments.length > 0;

        const n = this.centerPoints.length;
        console.log('Creating track mesh with', n, 'segments', use3DRelief ? '(3D relief enabled)' : '(legacy mode)');

        // Vérifier que les points sont valides
        if (n === 0 || !this.innerPoints || !this.outerPoints) {
            console.error('Track points not initialized!');
            return;
        }

        // === MERGED GEOMETRY : tous les quads dans un seul buffer ===
        // 6 vertices par segment (2 triangles), 3 composantes (x,y,z)
        const allVertices = new Float32Array(n * 6 * 3);
        const allColors = new Float32Array(n * 6 * 3);
        let vertexOffset = 0;
        let validSegments = 0;

        const maxY3D = use3DRelief
            ? (CONFIG.elevation.baseHeight + CONFIG.elevation.mainHillAmplitude + CONFIG.elevation.bumpAmplitude)
            : 1;

        for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;

            if (!this.innerPoints[i] || !this.outerPoints[i] ||
                !this.innerPoints[next] || !this.outerPoints[next]) {
                continue;
            }

            let y1, y2;
            if (use3DRelief) {
                y1 = branch.segments[i].y + 0.1;
                y2 = branch.segments[next].y + 0.1;
            } else {
                const elevation1 = this.getSegmentElevation(i) || 0;
                const elevation2 = this.getSegmentElevation(next) || 0;
                y1 = 0.1 + elevation1;
                y2 = 0.1 + elevation2;
            }

            if (isNaN(y1) || isNaN(y2)) continue;

            const innerY1 = use3DRelief ? branch.innerPoints[i].y + 0.1 : y1;
            const innerY2 = use3DRelief ? branch.innerPoints[next].y + 0.1 : y2;
            const outerY1 = use3DRelief ? branch.outerPoints[i].y + 0.1 : y1;
            const outerY2 = use3DRelief ? branch.outerPoints[next].y + 0.1 : y2;

            // Vérifier NaN
            if (isNaN(innerY1) || isNaN(innerY2) || isNaN(outerY1) || isNaN(outerY2)) continue;

            const off = validSegments * 18; // 6 vertices * 3 components

            // Triangle 1: inner1, outer1, inner2
            allVertices[off]     = this.innerPoints[i].x;
            allVertices[off + 1] = innerY1;
            allVertices[off + 2] = this.innerPoints[i].z;
            allVertices[off + 3] = this.outerPoints[i].x;
            allVertices[off + 4] = outerY1;
            allVertices[off + 5] = this.outerPoints[i].z;
            allVertices[off + 6] = this.innerPoints[next].x;
            allVertices[off + 7] = innerY2;
            allVertices[off + 8] = this.innerPoints[next].z;

            // Triangle 2: outer1, outer2, inner2
            allVertices[off + 9]  = this.outerPoints[i].x;
            allVertices[off + 10] = outerY1;
            allVertices[off + 11] = this.outerPoints[i].z;
            allVertices[off + 12] = this.outerPoints[next].x;
            allVertices[off + 13] = outerY2;
            allVertices[off + 14] = this.outerPoints[next].z;
            allVertices[off + 15] = this.innerPoints[next].x;
            allVertices[off + 16] = innerY2;
            allVertices[off + 17] = this.innerPoints[next].z;

            // Couleur per-vertex (RGB)
            let r, g, b;
            if (use3DRelief) {
                const avgY = (y1 + y2) / 2;
                const heightRatio = Math.min(avgY / maxY3D, 1);
                const baseGray = (0x40 + Math.floor(heightRatio * 0x30)) / 255;
                const stripe = (Math.floor(i / 5) % 2 === 0 ? 0x10 : 0x00) / 255;
                r = g = b = baseGray + stripe;
            } else {
                const isOnBridge = y1 > 0.6;
                if (isOnBridge) {
                    r = 0x66 / 255; g = 0x66 / 255; b = 0x88 / 255;
                } else {
                    const gray = (Math.floor(i / 5) % 2 === 0 ? 0x55 : 0x4a) / 255;
                    r = g = b = gray;
                }
            }
            for (let v = 0; v < 6; v++) {
                allColors[off + v * 3]     = r;
                allColors[off + v * 3 + 1] = g;
                allColors[off + v * 3 + 2] = b;
            }

            validSegments++;
        }

        // Créer un seul mesh avec toute la piste
        const trackGeo = new THREE.BufferGeometry();
        // Trim les buffers au nombre réel de segments valides
        trackGeo.setAttribute('position', new THREE.BufferAttribute(allVertices.slice(0, validSegments * 18), 3));
        trackGeo.setAttribute('color', new THREE.BufferAttribute(allColors.slice(0, validSegments * 18), 3));
        trackGeo.computeVertexNormals();

        const trackMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.9,
            side: THREE.DoubleSide
        });
        const trackMesh = new THREE.Mesh(trackGeo, trackMat);
        this.scene.add(trackMesh);
        this.trackMeshes.push(trackMesh);

        console.log('Track surface: 1 merged mesh (' + validSegments + ' segments, ' + (validSegments * 2) + ' triangles) — was ' + n + ' individual meshes');

        // Sol (herbe)
        const groundSize = this.trackType === 'infini' ? 1200 : 500;
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a9f4a, roughness: 1 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        this.scene.add(ground);
        this.trackMeshes.push(ground);
    }

    // Créer les piliers de soutien pour les ponts
    createBridgePillars() {
        if (!this.elevatedSegments || this.elevatedSegments.length === 0) {
            return;
        }

        for (const bridge of this.elevatedSegments) {
            // Placer des piliers tous les 10 segments sur le pont
            const ramp = this.rampLength || 8;
            for (let i = bridge.startIdx + ramp; i <= bridge.endIdx - ramp; i += 10) {
                if (i >= this.centerPoints.length) continue;

                const p = this.centerPoints[i];
                if (!p) continue;

                const elevation = this.getSegmentElevation(i) || 0;

                if (elevation > 1) {
                    // Pilier
                    const pillarGeo = new THREE.CylinderGeometry(1.5, 2, elevation, 8);
                    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
                    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
                    pillar.position.set(p.x, elevation / 2, p.z);
                    this.scene.add(pillar);
                    this.trackMeshes.push(pillar);
                }
            }
        }
    }
    
    createWalls() {
        const { wallHeight, wallThickness } = CONFIG.track;
        this.wallSegments = [];
        const n = this.centerPoints.length;

        // Utiliser la branche active pour le nouveau système 3D
        const branch = this.graph.getActiveBranch();
        const use3DRelief = branch && branch.segments.length > 0;

        console.log('Creating walls for', n, 'segments', use3DRelief ? '(3D relief)' : '(legacy)');

        const halfW = wallThickness / 2;
        const maxY3D = use3DRelief ? (CONFIG.elevation.baseHeight + CONFIG.elevation.mainHillAmplitude) : 1;

        const createMergedWalls = (points, branchPoints, isInner) => {
            // Chaque mur = un quad (4 vertices formant 2 triangles) × 4 faces visibles
            // Simplifié : on utilise des quads avant/arrière (face la plus visible)
            // Pour des murs fins, 2 faces suffisent (intérieur + extérieur)
            const wallVertices = [];
            const wallColors = [];

            for (let i = 0; i < n; i++) {
                const next = (i + 1) % n;
                const p1 = points[i];
                const p2 = points[next];

                if (!p1 || !p2) continue;

                let elevation1, elevation2;
                if (use3DRelief && branchPoints && branchPoints[i] && branchPoints[next]) {
                    elevation1 = branchPoints[i].y;
                    elevation2 = branchPoints[next].y;
                } else {
                    elevation1 = this.getSegmentElevation(i) || 0;
                    elevation2 = this.getSegmentElevation(next) || 0;
                }

                const avgElevation = (elevation1 + elevation2) / 2;
                const layer = avgElevation > 15 ? 1 : 0;

                // Segment pour collision (inchangé)
                this.wallSegments.push({
                    x1: p1.x, z1: p1.z,
                    x2: p2.x, z2: p2.z,
                    elevation: avgElevation,
                    layer: layer
                });

                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const len = Math.sqrt(dx * dx + dz * dz);
                if (len < 0.1) continue;

                // Normal perpendiculaire au mur (pour l'épaisseur)
                const nx = -dz / len * halfW;
                const nz = dx / len * halfW;

                const y1Bot = avgElevation;
                const y1Top = avgElevation + wallHeight;

                // Face extérieure (2 triangles)
                wallVertices.push(
                    p1.x + nx, y1Bot, p1.z + nz,
                    p2.x + nx, y1Bot, p2.z + nz,
                    p1.x + nx, y1Top, p1.z + nz,
                    p2.x + nx, y1Bot, p2.z + nz,
                    p2.x + nx, y1Top, p2.z + nz,
                    p1.x + nx, y1Top, p1.z + nz
                );
                // Face intérieure (2 triangles, winding inversé)
                wallVertices.push(
                    p1.x - nx, y1Bot, p1.z - nz,
                    p1.x - nx, y1Top, p1.z - nz,
                    p2.x - nx, y1Bot, p2.z - nz,
                    p2.x - nx, y1Bot, p2.z - nz,
                    p1.x - nx, y1Top, p1.z - nz,
                    p2.x - nx, y1Top, p2.z - nz
                );
                // Face du dessus (2 triangles)
                wallVertices.push(
                    p1.x - nx, y1Top, p1.z - nz,
                    p1.x + nx, y1Top, p1.z + nz,
                    p2.x - nx, y1Top, p2.z - nz,
                    p2.x - nx, y1Top, p2.z - nz,
                    p1.x + nx, y1Top, p1.z + nz,
                    p2.x + nx, y1Top, p2.z + nz
                );

                // Couleur
                let r, g, b;
                if (use3DRelief) {
                    const heightRatio = Math.min(avgElevation / maxY3D, 1);
                    if (isInner) {
                        r = (0x99 + Math.floor(heightRatio * 0x44)) / 255;
                        g = 0x22 / 255;
                        b = 0x22 / 255;
                    } else {
                        const gray = (0xbb + Math.floor(heightRatio * 0x33)) / 255;
                        r = g = b = gray;
                    }
                } else {
                    if (layer === 1) {
                        if (isInner) { r = 0x99/255; g = 0x44/255; b = 0xaa/255; }
                        else { r = 0xaa/255; g = 0xaa/255; b = 0xcc/255; }
                    } else {
                        if (isInner) { r = 0xcc/255; g = 0x33/255; b = 0x33/255; }
                        else { r = 0xee/255; g = 0xee/255; b = 0xee/255; }
                    }
                }
                // 18 vertices (3 faces × 6 vertices)
                for (let v = 0; v < 18; v++) {
                    wallColors.push(r, g, b);
                }
            }

            if (wallVertices.length === 0) return;

            const wallGeo = new THREE.BufferGeometry();
            wallGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallVertices), 3));
            wallGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wallColors), 3));
            wallGeo.computeVertexNormals();

            const wallMat = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.7
            });
            const wallMesh = new THREE.Mesh(wallGeo, wallMat);
            this.scene.add(wallMesh);
            this.trackMeshes.push(wallMesh);

            console.log((isInner ? 'Inner' : 'Outer') + ' walls: 1 merged mesh (' + (wallVertices.length / 3) + ' vertices)');
        };

        // Passer les points 3D de la branche pour les murs
        const branchInner = use3DRelief ? branch.innerPoints : null;
        const branchOuter = use3DRelief ? branch.outerPoints : null;

        createMergedWalls(this.innerPoints, branchInner, true);
        createMergedWalls(this.outerPoints, branchOuter, false);
    }
    
    createCheckpoints() {
        const n = this.centerPoints.length;
        const { width } = CONFIG.track;

        // Checkpoints à 25%, 50%, 75% du circuit + ligne d'arrivée à 0% (segment 0)
        // IMPORTANT: segment 0 DOIT être à la position de départ pour que ça fonctionne
        const indices = [Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), 0];

        this.checkpointZones = indices.map((idx, cpIndex) => {
            const curr = this.centerPoints[idx];
            const next = this.centerPoints[(idx + 1) % n];
            const dx = next.x - curr.x;
            const dz = next.z - curr.z;
            const len = Math.sqrt(dx * dx + dz * dz);

            return {
                x: curr.x,
                y: curr.y || 0,
                z: curr.z,
                nx: dx / len,
                nz: dz / len,
                width: width,
                index: idx
            };
        });
    }
    
    createStartLine() {
        const { width } = CONFIG.track;

        // Trouver l'élévation au point de départ
        const branch = this.graph.getActiveBranch();
        let startElevation = 0;

        if (branch && branch.segments.length > 0) {
            // Trouver le segment le plus proche du point de départ
            const result = branch.findClosestSegment(this.startX, this.startZ);
            startElevation = branch.segments[result.index].y;
        }

        // Damier à la position de départ
        const checkerSize = 4;
        const cols = Math.ceil(width / checkerSize);
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < 2; r++) {
                const isWhite = (c + r) % 2 === 0;
                const geo = new THREE.PlaneGeometry(checkerSize, checkerSize);
                const mat = new THREE.MeshBasicMaterial({ color: isWhite ? 0xffffff : 0x000000 });
                const tile = new THREE.Mesh(geo, mat);
                tile.rotation.x = -Math.PI / 2;
                tile.position.set(
                    this.startX + (c - cols / 2 + 0.5) * checkerSize,
                    startElevation + 0.15,  // Légèrement au-dessus de la piste
                    this.startZ + r * checkerSize
                );
                this.scene.add(tile);
                this.trackMeshes.push(tile);
            }
        }
    }

    createBoostZones() {
        // Définir les zones de boost selon le type de circuit
        const boostPadDefinitions = this.getBoostPadDefinitions();

        for (const def of boostPadDefinitions) {
            // Trouver le segment le plus proche pour obtenir l'élévation
            const branch = this.graph.getActiveBranch();
            let elevation = 1;
            let trackAngle = def.angle;

            if (branch) {
                const closest = branch.findClosestSegment(def.x, def.z);
                if (closest.index >= 0 && closest.index < branch.segments.length) {
                    elevation = branch.segments[closest.index].y + 0.1;

                    // Calculer l'angle de la piste à cet endroit
                    const nextIdx = (closest.index + 1) % branch.segments.length;
                    const curr = branch.segments[closest.index];
                    const next = branch.segments[nextIdx];
                    trackAngle = Math.atan2(next.x - curr.x, next.z - curr.z);
                }
            }

            // Créer la zone de boost
            const zone = {
                x: def.x,
                z: def.z,
                y: elevation,
                angle: trackAngle,
                width: def.width || 25,
                length: def.length || 15,
                power: def.power || 1.5,
                duration: def.duration || 60
            };
            this.boostZones.push(zone);

            // Créer le visuel 3D
            this.createBoostPadMesh(zone);
        }
    }

    getBoostPadDefinitions() {
        // Utiliser les centerPoints et innerPoints/outerPoints pour placer les pads
        const center = this.centerPoints;
        const inner = this.innerPoints;
        const outer = this.outerPoints;

        if (!center || center.length < 20) {
            return [];
        }

        const total = center.length;
        const pads = [];

        // Helper pour créer un pad avec offset (0 = centre, -1 = intérieur, 1 = extérieur)
        const createPad = (idx, offset, power = 1.5) => {
            const c = center[idx];
            const i = inner[idx];
            const o = outer[idx];

            // Interpoler entre intérieur et extérieur selon l'offset
            const t = (offset + 1) / 2; // -1..1 -> 0..1
            const x = i.x + (o.x - i.x) * t;
            const z = i.z + (o.z - i.z) * t;

            return { x, z, width: 18, length: 12, power };
        };

        if (this.trackType === 'volcan') {
            // Circuit Volcan - boost pads sur les sections droites
            pads.push(createPad(Math.floor(total * 0.05), 0, 1.5));       // Sortie départ
            pads.push(createPad(Math.floor(total * 0.30), 0.3, 1.55));    // Entre lacets 2 et 3
            pads.push(createPad(Math.floor(total * 0.55), 0, 1.6));       // Plateau sommet
            pads.push(createPad(Math.floor(total * 0.65), -0.3, 1.7));    // Avant le tremplin (boost pour le saut!)
            pads.push(createPad(Math.floor(total * 0.85), 0.4, 1.55));    // Descente rapide

        } else if (this.trackType === 'infini') {
            // Circuit Infini - identifier les sections droites
            // Les diagonales sont approximativement aux indices:
            // Diagonale montante: ~12-18% et ~62-68%
            // Diagonale descendante: ~37-43% et ~87-93%

            pads.push(createPad(Math.floor(total * 0.15), 0.5, 1.55));    // Diagonale 1, droite
            pads.push(createPad(Math.floor(total * 0.40), -0.5, 1.55));   // Diagonale 2, gauche
            pads.push(createPad(Math.floor(total * 0.65), 0, 1.55));      // Diagonale 3, centre
            pads.push(createPad(Math.floor(total * 0.90), -0.3, 1.55));   // Diagonale 4, légèrement gauche

        } else {
            // Circuit Oval - uniquement sur les lignes droites
            // Section 1: 0-20 (ligne droite gauche)
            // Section 3: 50-70 (ligne droite droite)

            // Ligne droite gauche - 2 pads
            pads.push(createPad(5, 0.6, 1.5));    // Début, côté extérieur
            pads.push(createPad(15, -0.4, 1.6)); // Fin, côté intérieur (plus puissant)

            // Ligne droite droite - 2 pads
            pads.push(createPad(55, -0.5, 1.5));  // Début, côté intérieur
            pads.push(createPad(65, 0.5, 1.6));  // Fin, côté extérieur (plus puissant)
        }

        return pads;
    }

    createBoostPadMesh(zone) {
        const { x, z, y, angle, width, length } = zone;

        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = angle; // Orienter dans le sens de la piste

        // === BASE DÉGRADÉ CHAUD ===
        // Fond sombre orangé
        const baseGeo = new THREE.PlaneGeometry(width, length);
        const baseMat = new THREE.MeshBasicMaterial({
            color: 0x331800,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide
        });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.rotation.x = -Math.PI / 2;
        base.position.y = 0.02;
        group.add(base);

        // Lueur centrale orange
        const glowGeo = new THREE.PlaneGeometry(width * 0.7, length * 0.8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.03;
        group.add(glow);

        // === 3 CHEVRONS SIMPLES ===
        const chevronCount = 3;
        const chevronSpacing = length / (chevronCount + 1);

        for (let i = 0; i < chevronCount; i++) {
            const progress = i / (chevronCount - 1); // 0 à 1
            const chevron = this.createChevron(width * 0.55, progress);
            chevron.position.z = -length / 2 + chevronSpacing * (i + 1);
            chevron.position.y = 0.06;
            group.add(chevron);
        }

        // Stocker références
        zone.mesh = group;
        zone.glowMesh = glow;

        this.scene.add(group);
        this.trackMeshes.push(group);
    }

    createChevron(width, progress) {
        // Chevron simple et élégant (juste le contour)
        const shape = new THREE.Shape();
        const w = width / 2;
        const h = width * 0.3;
        const t = width * 0.08; // Épaisseur du trait

        // Forme de V ouvert (chevron)
        shape.moveTo(-w, -h);
        shape.lineTo(-w + t * 1.2, -h);
        shape.lineTo(0, h - t);
        shape.lineTo(w - t * 1.2, -h);
        shape.lineTo(w, -h);
        shape.lineTo(0, h);
        shape.closePath();

        const geo = new THREE.ShapeGeometry(shape);

        // Dégradé orange → jaune selon la position
        // progress 0 = orange foncé, progress 1 = jaune vif
        const hue = 0.08 - progress * 0.03; // 0.08 (orange) → 0.05 (orange-jaune)
        const lightness = 0.5 + progress * 0.15; // Plus lumineux vers l'avant
        const color = new THREE.Color().setHSL(hue, 1, lightness);

        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.PI;

        return mesh;
    }
    
    // Pulse lumineux sur les boost pads
    updateBoostPads(time) {
        for (const zone of this.boostZones) {
            if (zone.glowMesh) {
                zone.glowMesh.material.opacity = 0.15 + Math.sin(time * 3) * 0.15;
            }
        }
    }

    createEnvironment() {
        // Arbres décoratifs - positions adaptées selon le circuit
        let treePositions;

        if (this.trackType === 'volcan') {
            // Circuit Volcan : rochers volcaniques au lieu d'arbres
            treePositions = [
                // Autour de la vallée (sud)
                {x: -200, z: -100}, {x: 200, z: -100},
                {x: -350, z: 100}, {x: 350, z: 100},
                // Flanc ouest (entre les lacets)
                {x: -550, z: 400}, {x: -550, z: 700},
                {x: -550, z: 1000}, {x: -100, z: 500},
                {x: -100, z: 900},
                // Flanc est (descente)
                {x: 550, z: 600}, {x: 550, z: 900},
                {x: 500, z: 1200},
                // Autour du sommet
                {x: -200, z: 1550}, {x: 200, z: 1550},
                {x: 400, z: 1500}, {x: -400, z: 1450}
            ];
        } else if (this.trackType === 'infini') {
            // Circuit Infini : dimensions ~900x600, figure-8
            // Placer les arbres à l'EXTÉRIEUR des deux boucles
            treePositions = [
                // Coins extérieurs (très loin)
                { x: -550, z: -400 }, { x: 550, z: -400 },
                { x: -550, z: 400 }, { x: 550, z: 400 },
                // Côtés extérieurs
                { x: -600, z: 0 }, { x: 600, z: 0 },
                { x: 0, z: -450 }, { x: 0, z: 450 },
                // Entre les coins
                { x: -500, z: -200 }, { x: 500, z: -200 },
                { x: -500, z: 200 }, { x: 500, z: 200 },
                // Rangée supplémentaire lointaine
                { x: -650, z: -300 }, { x: 650, z: -300 },
                { x: -650, z: 300 }, { x: 650, z: 300 }
            ];
        } else {
            // Circuit Oval : dimensions ~400x670 (après agrandissement)
            treePositions = [
                // Côtés extérieurs (au-delà des murs)
                { x: -280, z: 0 }, { x: 280, z: 0 },
                { x: 0, z: -420 }, { x: 0, z: 420 },
                // Diagonales
                { x: -250, z: -300 }, { x: 250, z: 300 },
                { x: -250, z: 300 }, { x: 250, z: -300 },
                // Supplémentaires le long des droites
                { x: -280, z: -150 }, { x: 280, z: -150 },
                { x: -280, z: 150 }, { x: 280, z: 150 }
            ];
        }

        treePositions.forEach(pos => {
            // Tronc
            const trunkGeo = new THREE.CylinderGeometry(1, 1.5, 8, 8);
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.9 });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.set(pos.x, 4, pos.z);
            this.scene.add(trunk);
            this.trackMeshes.push(trunk);

            // Feuillage
            const leavesGeo = new THREE.ConeGeometry(6, 12, 8);
            const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2ECC71, roughness: 0.8 });
            const leaves = new THREE.Mesh(leavesGeo, leavesMat);
            leaves.position.set(pos.x, 14, pos.z);
            this.scene.add(leaves);
            this.trackMeshes.push(leaves);
        });

        // Lumières
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        this.trackMeshes.push(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(50, 100, 50);
        this.scene.add(sun);
        this.trackMeshes.push(sun);
    }

    // Vérifier si un point est dans une zone boost (rectangle orienté)
    isInBoostZone(x, z) {
        // Réutiliser l'objet résultat (évite GC)
        if (!this._boostZoneResult) this._boostZoneResult = { inZone: false, power: 0, duration: 0, zone: null };
        const result = this._boostZoneResult;

        for (const zone of this.boostZones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            const cos = Math.cos(zone.angle);
            const sin = Math.sin(zone.angle);
            const localX = dx * cos + dz * sin;
            const localZ = -dx * sin + dz * cos;
            const halfWidth = zone.width / 2;
            const halfLength = zone.length / 2;

            if (Math.abs(localX) < halfWidth && Math.abs(localZ) < halfLength) {
                result.inZone = true;
                result.power = zone.power;
                result.duration = zone.duration;
                result.zone = zone;
                return result;
            }
        }
        result.inZone = false;
        return result;
    }
    
    // Vérifier si un point est dans une zone de tremplin (rectangle orienté)
    isInRampZone(x, z) {
        if (!this._rampZoneResult) this._rampZoneResult = { inZone: false, power: 0, zone: null };
        const result = this._rampZoneResult;

        for (const zone of this.rampZones) {
            const dx = x - zone.x;
            const dz = z - zone.z;
            const cos = Math.cos(zone.angle);
            const sin = Math.sin(zone.angle);
            const localX = dx * cos + dz * sin;
            const localZ = -dx * sin + dz * cos;
            const halfWidth = zone.width / 2;
            const halfLength = zone.length / 2;

            if (Math.abs(localX) < halfWidth && Math.abs(localZ) < halfLength) {
                result.inZone = true;
                result.power = zone.power;
                result.zone = zone;
                return result;
            }
        }
        result.inZone = false;
        return result;
    }

    isOnTrack(x, z, callerId = 0) {
        const halfW = CONFIG.track.width / 2;
        const thresholdSq = halfW * halfW;
        let minDistSq = Infinity;

        // Recherche spatiale optimisée : cache par racer
        const n = this.centerPoints.length;
        if (!this._onTrackCache) this._onTrackCache = {};
        const start = this._onTrackCache[callerId] || 0;
        const searchRadius = 60;

        let bestCacheIdx = start;

        // D'abord chercher localement
        for (let j = 0; j < searchRadius && j < n; j++) {
            const i = (start + j) % n;
            const p = this.centerPoints[i];
            const distSq = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                bestCacheIdx = i;
            }
            // Chercher aussi en arrière
            const ib = (start - j + n) % n;
            const pb = this.centerPoints[ib];
            const distSqB = (x - pb.x) * (x - pb.x) + (z - pb.z) * (z - pb.z);
            if (distSqB < minDistSq) {
                minDistSq = distSqB;
                bestCacheIdx = ib;
            }
        }

        // Fallback complet si la recherche locale n'a rien trouvé de proche
        if (minDistSq > thresholdSq * 4) {
            for (let i = 0; i < n; i++) {
                const p = this.centerPoints[i];
                const distSq = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    bestCacheIdx = i;
                }
            }
        }

        this._onTrackCache[callerId] = bestCacheIdx;
        return minDistSq < thresholdSq;
    }
    
    findStartingWaypoint(x, z) {
        let closestWaypoint = 0;
        let closestDistSq = Infinity;

        for (let i = 0; i < this.centerPoints.length; i++) {
            const p = this.centerPoints[i];
            const distSq = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestWaypoint = i;
            }
        }

        return (closestWaypoint + 1) % this.centerPoints.length;
    }

    // ============================================================
    // NOUVEAU SYSTÈME D'ÉLÉVATION 3D (basé sur les branches)
    // ============================================================

    // Obtenir l'élévation 3D à une position (x, z)
    // Utilise une interpolation bilinéaire sur les quads de la piste
    get3DElevationAt(x, z, currentY = null, callerId = 0) {
        const branch = this.graph.getActiveBranch();
        if (!branch || branch.segments.length === 0) {
            return this.getElevationAt(x, z);
        }

        const n = branch.segments.length;
        const maxYDiff = 5; // Assez large pour le relief (0-10m) mais sépare sol/pont (22m)

        // Recherche LOCALE autour du dernier index connu — cache par racer
        if (!this._elevCache) this._elevCache = {};
        if (!this._elevCache[callerId]) this._elevCache[callerId] = 0;
        const start = this._elevCache[callerId];
        const searchRange = 60;
        let bestIdx = start;
        let bestDist = Infinity;

        for (let j = 0; j < searchRange && j < n; j++) {
            const i = (start + j) % n;
            const seg = branch.segments[i];
            if (currentY !== null && Math.abs(seg.y - currentY) > maxYDiff) continue;
            const dist = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }

            const ib = (start - j + n) % n;
            const segB = branch.segments[ib];
            if (currentY !== null && Math.abs(segB.y - currentY) > maxYDiff) continue;
            const distB = (segB.x - x) * (segB.x - x) + (segB.z - z) * (segB.z - z);
            if (distB < bestDist) { bestDist = distB; bestIdx = ib; }
        }

        // Fallback : recherche COMPLETE si la locale n'a rien trouvé de proche
        // Seuil bas (400 = 20 unités) pour détecter vite les sauts au croisement figure-8
        if (bestDist > 400) {
            let fallbackIdx = bestIdx;
            let fallbackDist = bestDist;
            // Passe 1 : avec filtre Y
            for (let i = 0; i < n; i++) {
                const seg = branch.segments[i];
                if (currentY !== null && Math.abs(seg.y - currentY) > maxYDiff) continue;
                const dist = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
                if (dist < fallbackDist) { fallbackDist = dist; fallbackIdx = i; }
            }
            // Passe 2 : sans filtre Y si toujours rien de proche
            if (fallbackDist > 400) {
                for (let i = 0; i < n; i++) {
                    const seg = branch.segments[i];
                    const dist = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
                    if (dist < fallbackDist) { fallbackDist = dist; fallbackIdx = i; }
                }
            }
            bestIdx = fallbackIdx;
            bestDist = fallbackDist;
        }

        this._elevCache[callerId] = bestIdx;

        // ÉTAPE 2: Déterminer le segment courant et suivant pour l'interpolation
        // Vérifier si le point est plus proche du segment précédent ou suivant
        const prevIdx = (bestIdx - 1 + n) % n;
        const nextIdx = (bestIdx + 1) % n;

        const prevSeg = branch.segments[prevIdx];
        const nextSeg = branch.segments[nextIdx];
        const prevDist = (prevSeg.x - x) ** 2 + (prevSeg.z - z) ** 2;
        const nextDist = (nextSeg.x - x) ** 2 + (nextSeg.z - z) ** 2;

        // Choisir le quad entre bestIdx et son voisin le plus proche
        let segA, segB;
        if (prevDist < nextDist) {
            segA = prevIdx;
            segB = bestIdx;
        } else {
            segA = bestIdx;
            segB = nextIdx;
        }

        // ÉTAPE 3: Récupérer les 4 coins du quad (segment A vers segment B)
        const innerA = branch.innerPoints[segA];
        const outerA = branch.outerPoints[segA];
        const innerB = branch.innerPoints[segB];
        const outerB = branch.outerPoints[segB];

        // ÉTAPE 4: Calculer la position relative dans le quad
        // Direction le long de la piste (de A vers B)
        const alongX = (innerB.x + outerB.x) / 2 - (innerA.x + outerA.x) / 2;
        const alongZ = (innerB.z + outerB.z) / 2 - (innerA.z + outerA.z) / 2;
        const alongLen = Math.sqrt(alongX * alongX + alongZ * alongZ);

        if (alongLen < 0.001) {
            // Segment dégénéré, retourner l'élévation du centre
            return branch.segments[bestIdx].y;
        }

        // Direction perpendiculaire (inner vers outer)
        const perpX = outerA.x - innerA.x;
        const perpZ = outerA.z - innerA.z;
        const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);

        // Vecteur du point A au point (x, z)
        const centerA_x = (innerA.x + outerA.x) / 2;
        const centerA_z = (innerA.z + outerA.z) / 2;
        const toPointX = x - centerA_x;
        const toPointZ = z - centerA_z;

        // Projection sur l'axe "along" (t = 0 à 1 le long du segment)
        let t = (toPointX * alongX + toPointZ * alongZ) / (alongLen * alongLen);
        t = Math.max(0, Math.min(1, t)); // Clamp entre 0 et 1

        // Projection sur l'axe "perp" (s = -0.5 à 0.5, -0.5 = inner, 0.5 = outer)
        let s = (toPointX * perpX + toPointZ * perpZ) / (perpLen * perpLen);
        s = Math.max(-0.5, Math.min(0.5, s)); // Clamp
        s += 0.5; // Convertir en 0 à 1 (0 = inner, 1 = outer)

        // ÉTAPE 5: Interpolation bilinéaire de l'élévation
        // Élévations aux 4 coins
        const yInnerA = innerA.y;
        const yOuterA = outerA.y;
        const yInnerB = innerB.y;
        const yOuterB = outerB.y;

        // Interpolation: d'abord le long de la piste, puis latéralement
        const yA = yInnerA * (1 - s) + yOuterA * s;  // Élévation interpolée au segment A
        const yB = yInnerB * (1 - s) + yOuterB * s;  // Élévation interpolée au segment B
        const y = yA * (1 - t) + yB * t;             // Élévation finale

        // Ajouter un offset pour que le kart soit SUR la surface (pas dedans)
        // La surface visuelle est à Y + 0.1, donc on ajoute 0.2 pour être légèrement au-dessus
        return y + 0.2;
    }

    // Initialiser le système d'élévation 3D
    initRaycasting() {
        // Note: Le raycasting a été remplacé par une interpolation bilinéaire
        // qui est plus fiable. Cette fonction est conservée pour la compatibilité.

        const branch = this.graph.getActiveBranch();
        if (!branch || branch.segments.length === 0) {
            console.warn('[init3D] No branch or segments');
            return;
        }

        // Test du système d'élévation au point de départ
        const testY = this.get3DElevationAt(this.startX, this.startZ);
        console.log(`[Track] 3D elevation at start (${this.startX}, ${this.startZ}): Y = ${testY.toFixed(2)}`);

        // Afficher les stats d'élévation
        const elevations = branch.segments.map(s => s.y);
        const minY = Math.min(...elevations);
        const maxY = Math.max(...elevations);
        console.log(`[Track] Elevation range: ${minY.toFixed(2)} to ${maxY.toFixed(2)}`);
    }

    // Trouver le point le plus proche sur la piste (pour anti-tunneling)
    getClosestTrackPoint(x, z, playerY = null, callerId = 0) {
        const branch = this.graph.getActiveBranch();
        if (!branch || branch.segments.length === 0) {
            return null;
        }

        // Recherche LOCALE autour du dernier index — cache par racer
        if (!this._trackPtCache) this._trackPtCache = {};
        if (!this._trackPtCache[callerId]) this._trackPtCache[callerId] = 0;
        const n = branch.segments.length;
        const start = this._trackPtCache[callerId];
        const searchRange = 60;
        let closestIdx = start;
        let closestDist = Infinity;
        const maxYDiff = 5;

        for (let j = 0; j < searchRange && j < n; j++) {
            const i = (start + j) % n;
            const seg = branch.segments[i];
            if (playerY !== null && Math.abs(seg.y - playerY) > maxYDiff) continue;
            const dist = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
            if (dist < closestDist) { closestDist = dist; closestIdx = i; }

            const ib = (start - j + n) % n;
            const segB = branch.segments[ib];
            if (playerY !== null && Math.abs(segB.y - playerY) > maxYDiff) continue;
            const distB = (segB.x - x) * (segB.x - x) + (segB.z - z) * (segB.z - z);
            if (distB < closestDist) { closestDist = distB; closestIdx = ib; }
        }

        // Fallback complet si trop loin (seuil bas pour figure-8)
        if (closestDist > 400) {
            let fallbackIdx = closestIdx;
            let fallbackDist = closestDist;
            for (let i = 0; i < n; i++) {
                const seg = branch.segments[i];
                if (playerY !== null && Math.abs(seg.y - playerY) > maxYDiff) continue;
                const dist = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
                if (dist < fallbackDist) { fallbackDist = dist; fallbackIdx = i; }
            }
            if (fallbackDist > 400) {
                for (let i = 0; i < n; i++) {
                    const seg = branch.segments[i];
                    const dist = (seg.x - x) * (seg.x - x) + (seg.z - z) * (seg.z - z);
                    if (dist < fallbackDist) { fallbackDist = dist; fallbackIdx = i; }
                }
            }
            closestDist = fallbackDist;
            closestIdx = fallbackIdx;
        }

        this._trackPtCache[callerId] = closestIdx;

        // Réutiliser l'objet résultat (évite GC)
        if (!this._trackPtResult) this._trackPtResult = { x: 0, z: 0, y: 0, dist: 0, angle: 0 };
        const center = branch.segments[closestIdx];
        const nextCenter = branch.segments[(closestIdx + 1) % n];
        this._trackPtResult.x = center.x;
        this._trackPtResult.z = center.z;
        this._trackPtResult.y = center.y;
        this._trackPtResult.dist = Math.sqrt(closestDist);
        this._trackPtResult.angle = Math.atan2(nextCenter.x - center.x, nextCenter.z - center.z);
        return this._trackPtResult;
    }

    // Vérifier si le relief 3D est actif
    is3DReliefEnabled() {
        const branch = this.graph.getActiveBranch();
        return branch && branch.segments.length > 0 && CONFIG.elevation && CONFIG.elevation.enabled;
    }

    // Calculer la pente du terrain à une position (x, z) dans une direction (angle)
    // Retourne { pitch, roll } en radians
    getSlopeAt(x, z, angle) {
        // Réutiliser l'objet résultat (évite GC)
        if (!this._slopeResult) this._slopeResult = { pitch: 0, roll: 0 };

        const branch = this.graph.getActiveBranch();
        if (!branch || branch.segments.length === 0) {
            this._slopeResult.pitch = 0;
            this._slopeResult.roll = 0;
            return this._slopeResult;
        }

        const sampleDist = 3;
        const sinA = Math.sin(angle), cosA = Math.cos(angle);

        // Élévations aux 4 points (get3DElevationAt utilise maintenant le cache local)
        const frontY = this.get3DElevationAt(x + sinA * sampleDist, z + cosA * sampleDist);
        const backY = this.get3DElevationAt(x - sinA * sampleDist, z - cosA * sampleDist);
        const leftY = this.get3DElevationAt(x + cosA * sampleDist, z - sinA * sampleDist);
        const rightY = this.get3DElevationAt(x - cosA * sampleDist, z + sinA * sampleDist);

        this._slopeResult.pitch = Math.atan2(backY - frontY, sampleDist * 2);
        this._slopeResult.roll = Math.atan2(leftY - rightY, sampleDist * 2);
        return this._slopeResult;
    }

    // ============================================================
    // SYSTÈME D'ÉLÉVATION (PONTS) - Legacy
    // ============================================================

    // Trouver l'index du segment le plus proche
    getClosestSegmentIndex(x, z) {
        let closestIdx = 0;
        let closestDist = Infinity;

        for (let i = 0; i < this.centerPoints.length; i++) {
            const p = this.centerPoints[i];
            const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
            if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    // Trouver le segment le plus proche EN TENANT COMPTE de la couche actuelle
    // Si elevated=true, cherche un segment surélevé. Sinon, cherche un segment au sol.
    getClosestSegmentForLayer(x, z, wantElevated) {
        let closestIdx = 0;
        let closestDist = Infinity;

        for (let i = 0; i < this.centerPoints.length; i++) {
            const p = this.centerPoints[i];
            const segmentElevation = this.getSegmentElevation(i);
            const isElevated = segmentElevation > 0.5;

            // Filtrer par couche
            if (wantElevated !== isElevated) continue;

            const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
            if (dist < closestDist) {
                closestDist = dist;
                closestIdx = i;
            }
        }

        return { idx: closestIdx, dist: closestDist };
    }

    // Vérifier si un segment est sur un pont
    isSegmentOnBridge(segmentIndex) {
        for (const bridge of this.elevatedSegments) {
            if (segmentIndex >= bridge.startIdx && segmentIndex <= bridge.endIdx) {
                return true;
            }
        }
        return false;
    }

    // Obtenir l'élévation d'un segment (avec rampes progressives)
    getSegmentElevation(segmentIndex) {
        // Sécurité: si pas de ponts définis, retourner 0
        if (!this.elevatedSegments || this.elevatedSegments.length === 0) {
            return 0;
        }

        // Sécurité: index valide
        if (segmentIndex < 0 || segmentIndex >= this.centerPoints.length) {
            return 0;
        }

        for (const bridge of this.elevatedSegments) {
            // Vérifier si le segment est dans la zone du pont
            if (segmentIndex < bridge.startIdx || segmentIndex > bridge.endIdx) {
                continue;
            }

            const ramp = this.rampLength || 8;
            const bridgeHeight = bridge.height || this.bridgeHeight || 4;
            const midStart = bridge.startIdx + ramp;
            const midEnd = bridge.endIdx - ramp;

            // Sur le pont principal (plateau)
            if (segmentIndex >= midStart && segmentIndex <= midEnd) {
                return bridgeHeight;
            }

            // Rampe montante
            if (segmentIndex >= bridge.startIdx && segmentIndex < midStart) {
                const progress = (segmentIndex - bridge.startIdx) / ramp;
                return bridgeHeight * this.smoothStep(progress);
            }

            // Rampe descendante
            if (segmentIndex > midEnd && segmentIndex <= bridge.endIdx) {
                const progress = (bridge.endIdx - segmentIndex) / ramp;
                return bridgeHeight * this.smoothStep(progress);
            }
        }

        return 0; // Au sol
    }

    // Fonction de lissage pour les rampes (évite les transitions brusques)
    smoothStep(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        return t * t * (3 - 2 * t);
    }

    // Obtenir l'élévation à une position (x, z) avec interpolation
    getElevationAt(x, z) {
        const idx = this.getClosestSegmentIndex(x, z);
        return this.getSegmentElevation(idx);
    }

    // Obtenir l'élévation à une position, en tenant compte de la couche actuelle
    // Utilise currentY pour maintenir la continuité (éviter les sauts entre couches)
    getElevationAtWithLayer(x, z, currentY) {
        // Déterminer si on est actuellement sur le pont ou au sol
        const isCurrentlyElevated = currentY > 1.0;

        // Chercher le segment le plus proche sur notre couche actuelle
        const sameLayerResult = this.getClosestSegmentForLayer(x, z, isCurrentlyElevated);

        // Chercher aussi sur l'autre couche pour détecter les transitions
        const otherLayerResult = this.getClosestSegmentForLayer(x, z, !isCurrentlyElevated);

        // Si on est surélevé
        if (isCurrentlyElevated) {
            // Vérifier si on est encore proche d'un segment surélevé
            if (sameLayerResult.dist < 50) {
                return this.getSegmentElevation(sameLayerResult.idx);
            }
            // Sinon, on quitte le pont -> descendre
            return 0;
        }

        // Si on est au sol
        // Vérifier si on entre sur une rampe
        for (const bridge of this.elevatedSegments) {
            const ramp = this.rampLength || 10;

            // Chercher si on est proche du DÉBUT d'une rampe (entrée du pont)
            for (let i = bridge.startIdx; i < bridge.startIdx + ramp; i++) {
                if (i >= this.centerPoints.length) continue;
                const p = this.centerPoints[i];
                const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
                if (dist < 15) {  // Proche de la rampe d'entrée
                    return this.getSegmentElevation(i);
                }
            }

            // Chercher si on est proche de la FIN d'une rampe (sortie du pont)
            for (let i = bridge.endIdx - ramp; i <= bridge.endIdx; i++) {
                if (i >= this.centerPoints.length) continue;
                const p = this.centerPoints[i];
                const dist = Math.sqrt((p.x - x) ** 2 + (p.z - z) ** 2);
                if (dist < 15) {  // Proche de la rampe de sortie
                    return this.getSegmentElevation(i);
                }
            }
        }

        // Pas sur une rampe -> rester au sol
        return 0;
    }

    // Obtenir les infos de couche pour la collision
    getLayerInfo(x, z, currentY) {
        const idx = this.getClosestSegmentIndex(x, z);
        const elevation = this.getSegmentElevation(idx);

        // Déterminer sur quelle couche on est
        const isOnBridge = currentY > 1.5;
        const bridgeExists = elevation > 0;

        return {
            segmentIndex: idx,
            elevation: elevation,
            isOnBridge: isOnBridge,
            bridgeExistsHere: bridgeExists,
            // Couche: 0 = sol, 1 = pont
            layer: isOnBridge ? 1 : 0
        };
    }
}
