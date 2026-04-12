// ============================================================
// CONFIG - Configuration du jeu
// ============================================================

export const CONFIG = {
    physics: {
        acceleration: 0.048,
        accelerationCurve: 0.65,
        maxSpeed: 2.2,
        boostMaxSpeed: 3.3,
        reverseMaxSpeed: 0.8,
        brakeForce: 0.06,
        friction: 0.992,
        driftFriction: 0.992,
        turnSpeed: 0.032,
        turnSpeedAtHighSpeed: 0.022,
        turnSpeedThreshold: 1.5,
        driftTurnMultiplier: 1.5,
        driftAngleAdd: 0.018,
        driftBoostThresholds: { blue: 20, orange: 40, purple: 65 },
        driftBoostDurations: { blue: 50, orange: 80, purple: 120 },
        driftBoostPowers: { blue: 1.25, orange: 1.45, purple: 1.7 },
        kartRadius: 2.5,
        wallPushStrength: 1.0,
        wallSpeedRetain: 0.95       // Moins de perte de vitesse sur les murs (style arcade)
    },
    
    ai: {
        maxSpeed: 2.0,
        acceleration: 0.04,
        turnSpeed: 0.04,
        lookAhead: 3,
        cornerSlowdown: 0.7,
        waypointRadius: 15
    },
    
    track: {
        straightLength: 350,
        curveRadius: 120,
        width: 80,
        wallHeight: 3,
        wallThickness: 2
    },

    // Configuration du relief 3D
    elevation: {
        enabled: true,              // Activer/désactiver le relief
        baseHeight: 1,              // Hauteur minimum (évite d'être sous le sol)
        mainHillAmplitude: 8,       // Amplitude de la colline principale
        mainHillFrequency: 1,       // Nombre de collines par tour
        bumpAmplitude: 1.5,         // Amplitude des petites bosses
        bumpFrequency: 3,           // Nombre de bosses par tour
        smoothness: 0.8,            // Facteur de lissage
        gravityEffect: 0            // Désactivé - l'inclinaison visuelle suffit (style Mario Kart)
    },
    
    camera: {
        distance: 10,           // Distance derrière le kart (style MK)
        height: 4,              // Hauteur au-dessus du kart (plus bas, plus immersif)
        lookAheadDistance: 6,   // Distance du point de visée devant le kart
        smoothing: 0.2,
        fovNormal: 75,          // FOV légèrement plus large
        fovBoost: 92,           // FOV élargi pendant le boost (+17°)
        fovFinalLap: 72         // FOV resserré au dernier tour (tension)
    },
    
    // Système de tremplin / saut
    ramp: {
        launchPower: 0.6,       // Vélocité verticale au décollage
        gravity: 0.025,         // Gravité pendant le vol
        minSpeedToLaunch: 1.0   // Vitesse minimum pour décoller
    },

    race: {
        totalLaps: 5
    }
};

export const DIFFICULTY = {
    easy: {
        aiMaxSpeed: 1.7,
        aiAcceleration: 0.032,
        aiCornerSlowdown: 0.55,
        label: '🟢 Facile'
    },
    normal: {
        aiMaxSpeed: 2.0,
        aiAcceleration: 0.040,
        aiCornerSlowdown: 0.65,
        label: '🟡 Normal'
    },
    hard: {
        aiMaxSpeed: 2.3,
        aiAcceleration: 0.048,
        aiCornerSlowdown: 0.75,
        label: '🔴 Difficile'
    }
};
