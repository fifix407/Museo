import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
 *  MUSEO VIRTUAL — Ancient Greece & Rome
 *  main.js — Three.js scene + GSAP ScrollTrigger camera
 *
 *  ARCHITECTURE
 *  ────────────
 *  1. Camera follows a CatmullRom spline through the hallway
 *  2. Scroll position → targetProgress (0-1)
 *  3. Lerp smooths currentProgress toward targetProgress each frame
 *  4. Waypoints trigger camera lookAt transitions + info panels
 *  5. Sculptures are procedural geometry (easy to swap for loaded models)
 * ============================================================ */

// ─────────────────────────────────────────────────────────────
//  1. CONFIGURATION
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  hallWidth: 12,
  hallHeight: 8,
  hallLength: 140,
  eyeHeight: 2.5,
  lerpFactor: 0.045,     // Camera smoothing (lower = smoother)
  fogColor: 0x08080f,
  fogDensity: 0.016,
  columnInterval: 10,
  particleCount: 600,
};

// ─────────────────────────────────────────────────────────────
//  2. GLOBAL STATE
// ─────────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let currentProgress = 0;        // Smoothed (lerped) progress
let targetProgress = 0;         // Raw scroll progress
let cameraPath;                  // THREE.CatmullRomCurve3
let currentLookTarget = new THREE.Vector3(0, CONFIG.eyeHeight, -10);
let userLookDirection = 0; // -1 (left), 1 (right), 0 (auto)
let particleSystem;
let particlePositions;
const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const fireLights = []; // Almacena las antorchas para el efecto parpadeo (flickering)
let orbitControls = null;  // OrbitControls — solo activo en modo inspección Est.5
let isOrbitMode = false;   // true cuando OrbitControls está activo en Est.5

// Navegación por estaciones
let currentStation = -1;         // -1 = intro/pasillo
let stationCooldown = false;     // Evita saltar múltiples estaciones en un wheel
const stationLookTarget = new THREE.Vector3(0, 2.5, -10); // LookAt centrado actual


// ─────────────────────────────────────────────────────────────
//  3. EXHIBIT / WAYPOINT DEFINITIONS
//     ★ Edit these to change exhibit positions and text targets
// ─────────────────────────────────────────────────────────────
const EXHIBITS = [
  {
    name: 'Augusto de Prima Porta',
    sculpturePos: new THREE.Vector3(-4.5, 1.1, -25),
    lookTarget: new THREE.Vector3(-4.8, 2.8, -25),
    lookStart: 0.15,
    lookPeak: 0.19,
    lookEnd: 0.25,
    panelId: 'panel-1',
    builder: 'bust',

    modelUrl: 'modelos/agusto.stl',
    loaderType: 'stl',
    modelScale: 0.015,
    scaleMultiplier: 1.25, // 25% más grande
    modelRotationY: Math.PI / 4, // Ángulo de tres cuartos hacia el pasillo
  },
  {
    name: 'Afrodita de Milos',
    sculpturePos: new THREE.Vector3(4.5, 1.1, -45),
    lookTarget: new THREE.Vector3(4.8, 2.8, -45),
    lookStart: 0.30,
    lookPeak: 0.35,
    lookEnd: 0.41,
    panelId: 'panel-2',
    builder: 'venus',

    modelUrl: 'modelos/afrodita.stl',
    loaderType: 'stl',
    modelScale: 0.015,
    modelRotationY: Math.PI * 1.5,
    scaleMultiplier: 1.25, // 25% más grande
  },
  {
    name: 'Ánfora Panatenaica',
    sculpturePos: new THREE.Vector3(-4.5, 1.1, -65),
    lookTarget: new THREE.Vector3(-4.8, 2.8, -65),
    lookStart: 0.45,
    lookPeak: 0.50,
    lookEnd: 0.55,
    panelId: 'panel-3',
    builder: 'amphora',

    modelUrl: 'modelos/jarron.stl',
    loaderType: 'stl',
    modelScale: 0.015,
    modelRotationY: 270 * Math.PI / 180,
  },
  {
    name: 'Zeus',
    sculpturePos: new THREE.Vector3(4.5, 1.1, -85),
    lookTarget: new THREE.Vector3(4.8, 2.8, -85),
    lookStart: 0.60,
    lookPeak: 0.65,
    lookEnd: 0.71,
    panelId: 'panel-4',
    builder: 'bust', // Procedural fallback

    modelUrl: 'modelos/zeus.stl',
    loaderType: 'stl',
    scaleMultiplier: 0.8, // 20% smaller
  },
  {
    name: 'Busto Imperial',
    sculpturePos: new THREE.Vector3(-4.5, 1.1, -105),
    lookTarget: new THREE.Vector3(-4.8, 2.8, -105),
    lookStart: 0.76,
    lookPeak: 0.81,
    lookEnd: 0.86,
    panelId: 'panel-5',
    builder: null, // Borrado el maniquí viejo (procedural fallback)

    modelUrl: 'modelos/adriano.stl',
    loaderType: 'custom_stl',
    modelScale: 0.05,
  },
  {
    name: 'Monumentos Clásicos',
    sculpturePos: new THREE.Vector3(0, 1.1, -125),
    lookTarget: new THREE.Vector3(0, 2.8, -125),
    lookStart: 0.82,
    lookPeak: 0.86,
    lookEnd: 0.90,
    panelId: 'panel-6',
    loaderType: 'monuments',
  },
];


// ─────────────────────────────────────────────────────────────
//  3b. ESTACIONES — Fuente de verdad para navegación + UI dual
//      progressTarget: valor 0-1 del spline donde frena la cámara
// ─────────────────────────────────────────────────────────────
// ESTACIONES — Inicialmente vacío; se pobla desde el backend via loadObrasFromAPI()
let ESTACIONES = [];

// ─────────────────────────────────────────────────────────────
//  3c. API — Cargar obras del backend y mapearlas a ESTACIONES
// ─────────────────────────────────────────────────────────────

/** Mapea el campo 'tipo' del backend al ícono y etiqueta del UI */
function tipoLabel(tipo) {
  if (!tipo) return '&#9651; ESCULTURA';
  switch (tipo.toLowerCase()) {
    case 'pintura':   return '&#9633; PINTURA';
    case 'maqueta':   return '&#9651; MAQUETA';
    default:          return '&#9651; ESCULTURA';
  }
}

/** Construye la línea de fecha/material del cartel */
function fechaLine(obra) {
  const anio = obra.anio != null
    ? (obra.anio < 0 ? `${Math.abs(obra.anio)} a.C.` : `${obra.anio} d.C.`)
    : '';
  const extra = obra.tecnica || obra.material || '';
  return [anio, extra].filter(Boolean).join(' · ');
}

/**
 * Transforma el array plano de 12 obras del backend en el array de 6 estaciones
 * que usa la cámara y el UI del museo.
 * Convención: las obras vienen ordenadas por ID 1-12, en parejas:
 *   - IDs impares  (1, 3, 5, 7, 9, 11)  → escultura/maqueta (lado izq)
 *   - IDs pares    (2, 4, 6, 8, 10, 12) → pintura/maqueta-2 (lado der)
 */
const PROGRESS_TARGETS = [0.19, 0.35, 0.50, 0.65, 0.81, 1.00];

function buildEstacionesFromAPI(obras) {
  const estaciones = [];
  // Ordenar por ID para garantizar el orden correcto
  const sorted = [...obras].sort((a, b) => a.id - b.id);

  for (let i = 0; i < sorted.length - 1; i += 2) {
    const obraA = sorted[i];     // Obra impar → estatua/maqueta
    const obraB = sorted[i + 1]; // Obra par   → pintura/maqueta-2
    const estIdx = i / 2;        // 0..5

    estaciones.push({
      id: estIdx,
      progressTarget: PROGRESS_TARGETS[estIdx] ?? (0.19 + estIdx * 0.16),
      // Guardar referencia directa a la obra del backend (para datos extra)
      _obraEstatua: obraA,
      _obraCuadro: obraB,
      estatua: {
        tipo:  tipoLabel(obraA.tipo),
        titulo: obraA.titulo,
        fecha:  fechaLine(obraA),
        desc:   obraA.descripcion || '',
        extra:  obraA.material || obraA.tecnica || null, // campo condicional
        extraLabel: obraA.tipo === 'pintura' ? 'Técnica' : 'Material',
      },
      cuadro: {
        tipo:  tipoLabel(obraB.tipo),
        titulo: obraB.titulo,
        fecha:  fechaLine(obraB),
        desc:   obraB.descripcion || '',
        extra:  obraB.material || obraB.tecnica || null,
        extraLabel: obraB.tipo === 'pintura' ? 'Técnica' : 'Material',
      },
    });
  }

  return estaciones;
}

/** Hace fetch al backend Spring Boot y actualiza ESTACIONES */
async function loadObrasFromAPI() {
  try {
    const res = await fetch('http://localhost:8080/api/obras');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const obras = await res.json();
    ESTACIONES = buildEstacionesFromAPI(obras);
    console.log(`✅ ${obras.length} obras cargadas del backend. ${ESTACIONES.length} estaciones mapeadas.`);
  } catch (err) {
    console.warn('⚠️ No se pudo conectar al backend. Usando datos locales de fallback.', err);
    // Fallback: datos estáticos (los originales hardcodeados)
    ESTACIONES = [
      { id: 0, progressTarget: 0.19,
        estatua: { tipo: '&#9651; ESCULTURA', titulo: 'Augusto de Prima Porta', fecha: 'Siglo I d.C. · Mármol', desc: 'Esta icónica estatua de mármol representa al primer emperador de Roma en una pose de mando.' },
        cuadro:  { tipo: '&#9633; PINTURA',   titulo: 'Centauromaquia Griega',   fecha: 'ca. 447 a.C. · Friso esculpido', desc: 'Friso que ilustra la batalla entre los lápitas y los centauros, representando el triunfo de la civilización sobre la barbarie.' } },
      { id: 1, progressTarget: 0.35,
        estatua: { tipo: '&#9651; ESCULTURA', titulo: 'Afrodita de Milos',       fecha: '130-100 a.C. · Mármol de Paros', desc: 'Tallada entre el 130 y el 100 a.C., esta obra maestra del arte helenístico representa a la diosa griega del amor y la belleza.' },
        cuadro:  { tipo: '&#9633; PINTURA',   titulo: 'Diana Cazadora',           fecha: 'Escuela romana · Fresco s. I d.C.', desc: 'Pintura mural recuperada de una villa romana. Representa a Diana, diosa de la caza y la luna, en plena carrera con su arco listo.' } },
      { id: 2, progressTarget: 0.50,
        estatua: { tipo: '&#9651; ESCULTURA', titulo: 'Ánfora Panatenaica',      fecha: 'ca. 530 a.C. · Cerámica de figuras negras', desc: 'Este ánfora de figuras negras se otorgaba como premio en los Juegos Panatenaicos.' },
        cuadro:  { tipo: '&#9633; PINTURA',   titulo: 'Palas y el Centauro',     fecha: 'S. Botticelli, 1482 · Óleo sobre lienzo', desc: 'Palas Atenea, símbolo de la sabiduría, sujeta por el cabello a un centauro domado.' } },
      { id: 3, progressTarget: 0.65,
        estatua: { tipo: '&#9651; ESCULTURA', titulo: 'Zeus — Rey del Olimpo',   fecha: 'ca. 460 a.C. · Mármol', desc: 'Esta imponente estatua representa a Zeus, el rey de los dioses en la mitología griega.' },
        cuadro:  { tipo: '&#9633; PINTURA',   titulo: 'Templo de Zeus en Olimpia', fecha: 'Grabado arqueológico · Siglo XVIII', desc: 'Reconstitución del Gran Templo de Zeus en Olimpia, una de las Siete Maravillas del Mundo Antiguo.' } },
      { id: 4, progressTarget: 0.81,
        estatua: { tipo: '&#9651; ESCULTURA', titulo: 'Busto Imperial — Adriano', fecha: 'ca. 120 d.C. · Mármol', desc: 'Este busto romano destaca por su realismo del retrato imperial.' },
        cuadro:  { tipo: '&#9633; PINTURA',   titulo: 'El Filósofo Romano',      fecha: 'Fresco pompeyano · ca. 70 d.C.', desc: 'Pintura al fresco recuperada de las ruinas de una villa patricia en Herculano.' } },
      { id: 5, progressTarget: 1.00,
        estatua: { tipo: '&#9651; MAQUETA',   titulo: 'El Partenón de Atenas',   fecha: 'ca. 447 a.C. · Arquitectura Griega', desc: 'Templo consagrado a la diosa Atenea protectora de Atenas.' },
        cuadro:  { tipo: '&#9651; MAQUETA',   titulo: 'El Coliseo Romano',       fecha: '70-80 d.C. · Arquitectura Romana', desc: 'Anfiteatro de la época del Imperio romano, construido en el siglo I.' } },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
//  4. HELPER — smooth-step for eased transitions
// ─────────────────────────────────────────────────────────────
function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────────
//  5. PROCEDURAL TEXTURES
//     Generate marble-like canvas textures at runtime
// ─────────────────────────────────────────────────────────────

/** Generic marble canvas */
function marbleCanvas(w, h, base, veinRGBA, count) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = veinRGBA;
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = Math.random() * 1.8 + 0.3;
    ctx.beginPath();
    const sx = Math.random() * w, sy = Math.random() * h;
    ctx.moveTo(sx, sy);
    for (let j = 0; j < 2; j++) {
      ctx.bezierCurveTo(
        sx + (Math.random() - 0.5) * w * 0.6,
        sy + (Math.random() - 0.5) * h * 0.4,
        sx + (Math.random() - 0.5) * w * 0.8,
        sy + (Math.random() - 0.5) * h * 0.6,
        sx + (Math.random() - 0.5) * w,
        sy + (Math.random() - 0.5) * h * 0.8
      );
    }
    ctx.stroke();
  }
  return c;
}

/** Checkerboard floor with marble veins per tile */
function createFloorTexture() {
  const size = 1024, tile = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');

  const darkTile = '#b8b0a2';
  const lightTile = '#ddd6ca';

  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      const isLight = ((x / tile) + (y / tile)) % 2 === 0;
      ctx.fillStyle = isLight ? lightTile : darkTile;
      ctx.fillRect(x, y, tile, tile);

      // Veins within each tile
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, tile, tile);
      ctx.clip();
      ctx.strokeStyle = 'rgba(140,130,118,0.18)';
      for (let i = 0; i < 3; i++) {
        ctx.lineWidth = Math.random() * 0.8 + 0.2;
        ctx.beginPath();
        ctx.moveTo(x + Math.random() * tile, y + Math.random() * tile);
        ctx.bezierCurveTo(
          x + Math.random() * tile, y + Math.random() * tile,
          x + Math.random() * tile, y + Math.random() * tile,
          x + Math.random() * tile, y + Math.random() * tile
        );
        ctx.stroke();
      }
      ctx.restore();

      // Subtle tile borders
      ctx.strokeStyle = 'rgba(70,65,58,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(CONFIG.hallWidth / 4, CONFIG.hallLength / 4);
  tex.anisotropy = 4;
  return tex;
}

// ─────────────────────────────────────────────────────────────
//  6. HALLWAY CONSTRUCTION
// ─────────────────────────────────────────────────────────────
function buildHallway() {
  const W = CONFIG.hallWidth;
  const H = CONFIG.hallHeight;
  const L = CONFIG.hallLength;
  const centerZ = -L / 2 + 5;          // center the hall on Z

  const textureLoader = new THREE.TextureLoader();

  // ── Floor (Piedra Antigua Procedural) ──
  // 1. Crear un canvas para dibujar la textura de piedra procedural
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Color base de la piedra (Gris carbón oscuro / basalto)
  ctx.fillStyle = '#2b2b2b'; 
  ctx.fillRect(0, 0, 512, 512);

  // Añadir ruido sutil para darle textura rústica de piedra
  for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const size = Math.random() * 1.5;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, size, size);
  }

  // Dibujar las líneas de las uniones de los bloques grandes
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 3;
  // Bloques rectangulares grandes
  ctx.strokeRect(0, 0, 512, 512);
  ctx.beginPath();
  ctx.moveTo(256, 0); ctx.lineTo(256, 512); // Línea vertical al medio
  ctx.moveTo(0, 256); ctx.lineTo(512, 256); // Línea horizontal al medio
  ctx.stroke();

  // 2. Convertir el canvas en textura de Three.js
  const floorTexture = new THREE.CanvasTexture(canvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(2, 10); // Losas grandes y alargas a lo largo del pasillo

  // 3. Crear el material básico con la textura generada
  const floorMat = new THREE.MeshBasicMaterial({
      map: floorTexture,
      side: THREE.DoubleSide
  });
  
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, centerZ);
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Ceiling (Artesonado con profundidad) ──
  const techoImgs = ['img/techo-1.png', 'img/techo-2.png', 'img/techo-3.png'];
  
  // Usamos MeshBasicMaterial para que el fresco resplandezca por sí mismo
  const ceilMats = techoImgs.map(url => {
    const tex = textureLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({
      color: 0x999999, // Atenúa el brillo excesivo simulando un entorno oscuro y antiguo
      map: tex,
      side: THREE.DoubleSide
    });
  });

  const tramoLength = 12; // Segmentos cuadrados de 12x12 (ancho W=12)
  const numTramos = Math.ceil(L / tramoLength);

  // Materiales para la estructura arquitectónica del techo
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xd4ccc0,
    roughness: 0.9,
    metalness: 0.05
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc9a84c,
    roughness: 0.3,
    metalness: 0.5,
    emissive: 0x3d2a00,
    emissiveIntensity: 0.25
  });

  // Parámetros de los escalones (profundidad)
  const steps = 3;
  const stepHeight = 0.5; // Cada nivel sube 0.5m
  const stepWidth = 1.0;  // Cada nivel se adentra 1.0m

  for (let i = 0; i < numTramos; i++) {
    const segmentMat = ceilMats[i % 3];
    const zCenter = 5 - (i * tramoLength) - (tramoLength / 2);
    
    // Grupo para contener todo un tramo de 12x12
    const bayGroup = new THREE.Group();
    bayGroup.position.set(0, H, zCenter);

    let currentW = W;
    let currentL = tramoLength;

    for (let s = 0; s < steps; s++) {
      const yPos = s * stepHeight;
      const nextW = currentW - stepWidth * 2;
      const nextL = currentL - stepWidth * 2;
      
      // 4 barras de BoxGeometry para formar el marco de este escalón
      // Izquierda y Derecha
      const lrGeo = new THREE.BoxGeometry(stepWidth, stepHeight, currentL);
      const left = new THREE.Mesh(lrGeo, frameMat);
      left.position.set(-currentW/2 + stepWidth/2, yPos + stepHeight/2, 0);
      bayGroup.add(left);

      const right = new THREE.Mesh(lrGeo, frameMat);
      right.position.set(currentW/2 - stepWidth/2, yPos + stepHeight/2, 0);
      bayGroup.add(right);

      // Arriba y Abajo (en el eje Z)
      const tbGeo = new THREE.BoxGeometry(nextW, stepHeight, stepWidth);
      const top = new THREE.Mesh(tbGeo, frameMat);
      top.position.set(0, yPos + stepHeight/2, -currentL/2 + stepWidth/2);
      bayGroup.add(top);

      const bottom = new THREE.Mesh(tbGeo, frameMat);
      bottom.position.set(0, yPos + stepHeight/2, currentL/2 - stepWidth/2);
      bayGroup.add(bottom);

      // Moldura dorada en el borde interior superior de cada escalón
      const trimThick = 0.08;
      const trimGeoLR = new THREE.BoxGeometry(trimThick, trimThick, currentL - stepWidth*2 + trimThick*2);
      const trimL = new THREE.Mesh(trimGeoLR, goldMat);
      trimL.position.set(-nextW/2, yPos + stepHeight, 0);
      bayGroup.add(trimL);
      
      const trimR = new THREE.Mesh(trimGeoLR, goldMat);
      trimR.position.set(nextW/2, yPos + stepHeight, 0);
      bayGroup.add(trimR);

      const trimGeoTB = new THREE.BoxGeometry(nextW, trimThick, trimThick);
      const trimT = new THREE.Mesh(trimGeoTB, goldMat);
      trimT.position.set(0, yPos + stepHeight, -nextL/2);
      bayGroup.add(trimT);

      const trimB = new THREE.Mesh(trimGeoTB, goldMat);
      trimB.position.set(0, yPos + stepHeight, nextL/2);
      bayGroup.add(trimB);

      currentW = nextW;
      currentL = nextL;
    }

    // Finalmente, la pintura en el nivel más alto y profundo
    const paintGeo = new THREE.PlaneGeometry(currentW, currentL);
    const paintMesh = new THREE.Mesh(paintGeo, segmentMat);
    paintMesh.rotation.x = Math.PI / 2;
    // Posicionada ligeramente encima del último escalón
    paintMesh.position.set(0, steps * stepHeight + 0.02, 0);
    bayGroup.add(paintMesh);

    // Viga gruesa transversal para separar cada uno de los tramos visualmente
    if (i < numTramos - 1) {
      const vigaGeo = new THREE.BoxGeometry(W, 0.4, 1.2);
      const viga = new THREE.Mesh(vigaGeo, frameMat);
      viga.position.set(0, -0.2, -tramoLength/2);
      bayGroup.add(viga);
      
      // Detalle dorado debajo de la viga
      const vigaGoldGeo = new THREE.BoxGeometry(W, 0.05, 1.22);
      const vigaGold = new THREE.Mesh(vigaGoldGeo, goldMat);
      vigaGold.position.set(0, -0.4, -tramoLength/2);
      bayGroup.add(vigaGold);
    }

    scene.add(bayGroup);
  }

  // ── Walls ──
  const wallCanvas = marbleCanvas(512, 512, '#ece6dc', 'rgba(190,178,160,0.12)', 22);
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(L / 5, 2);
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex, roughness: 0.50, metalness: 0.03
  });

  // Left wall
  const lw = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat);
  lw.rotation.y = Math.PI / 2;
  lw.position.set(-W / 2, H / 2, centerZ);
  lw.receiveShadow = true;
  scene.add(lw);

  // Right wall
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat.clone());
  rw.rotation.y = -Math.PI / 2;
  rw.position.set(W / 2, H / 2, centerZ);
  rw.receiveShadow = true;
  scene.add(rw);

  // Back wall
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat.clone());
  bw.position.set(0, H / 2, -L + 5);
  bw.receiveShadow = true;
  scene.add(bw);


  // Front wall (behind the camera start)
  const fw = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat.clone());
  fw.position.set(0, H / 2, 5);
  fw.rotation.y = Math.PI;
  scene.add(fw);

  // ── Moldings ──
  const moldMat = new THREE.MeshStandardMaterial({
    color: 0xc8bfb0, roughness: 0.30, metalness: 0.05
  });

  // Baseboard - left
  addMolding(-W / 2 + 0.075, 0.12, centerZ, 0.15, 0.24, L, moldMat);
  // Baseboard - right
  addMolding(W / 2 - 0.075, 0.12, centerZ, 0.15, 0.24, L, moldMat);
  // Crown - left
  addMolding(-W / 2 + 0.1, H - 0.1, centerZ, 0.20, 0.20, L, moldMat);
  // Crown - right
  addMolding(W / 2 - 0.1, H - 0.1, centerZ, 0.20, 0.20, L, moldMat);
}

function addMolding(x, y, z, w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  scene.add(m);
}

// ─────────────────────────────────────────────────────────────
//  7. COLUMNS — Doric-style
// ─────────────────────────────────────────────────────────────
function createColumn(x, z) {
  const g = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xede8df, roughness: 0.28, metalness: 0.03
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xd4ccc0, roughness: 0.38, metalness: 0.03
  });

  // ── 1. BASE — Ionic three-part base (Stylobate → Torus → Scotia → Torus) ──

  // Stylobate (square stone slab) — más ancho y grueso
  const stylobate = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.16, 1.45), mat);
  stylobate.position.y = 0.08;
  stylobate.castShadow = true;
  stylobate.receiveShadow = true;
  g.add(stylobate);

  // Plinth (slightly smaller square)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.18, 1.22), mat);
  plinth.position.y = 0.25;
  g.add(plinth);

  // Lower torus (fat ring) — radio incrementado
  const lowerTorus = new THREE.Mesh(
    new THREE.TorusGeometry(0.445, 0.085, 10, 28), mat
  );
  lowerTorus.rotation.x = Math.PI / 2;
  lowerTorus.position.y = 0.47;
  g.add(lowerTorus);

  // Scotia (concave inset — approximated with a smaller cylinder)
  const scotiaTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.375, 0.405, 0.14, 24), accentMat
  );
  scotiaTop.position.y = 0.61;
  g.add(scotiaTop);

  // Upper torus (slightly smaller ring)
  const upperTorus = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.072, 10, 28), mat
  );
  upperTorus.rotation.x = Math.PI / 2;
  upperTorus.position.y = 0.74;
  g.add(upperTorus);

  // ── 2. SHAFT — Fluted cylinder (24 flutes) ──
  const FLUTES = 24;
  const shaftH = 6.20;
  const shaftBaseR = 0.400; // era 0.265 — +50%
  const shaftTopR  = 0.325; // era 0.215 — +50%
  const shaftY = 0.80 + shaftH / 2;

  // Inner solid core
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftTopR * 0.88, shaftBaseR * 0.88, shaftH, 24),
    mat
  );
  core.position.y = shaftY;
  core.castShadow = true;
  g.add(core);

  // Flutes — each is a thin rounded bead sitting on the shaft surface
  for (let i = 0; i < FLUTES; i++) {
    const angle = (i / FLUTES) * Math.PI * 2;
    const fluteR = 0.030; // era 0.022

    const fluteGeo = new THREE.CylinderGeometry(
      fluteR * 0.70,
      fluteR,
      shaftH,
      6
    );
    const flute = new THREE.Mesh(fluteGeo, accentMat);
    const rTop = shaftTopR - fluteR * 0.3;
    const rBot = shaftBaseR - fluteR * 0.3;
    const rMid = (rTop + rBot) / 2;
    flute.position.set(
      Math.cos(angle) * rMid,
      shaftY,
      Math.sin(angle) * rMid
    );
    flute.castShadow = false;
    g.add(flute);
  }

  // Necking — transition ring at top of shaft
  const neckY = 0.80 + shaftH;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftTopR + 0.015, shaftTopR, 0.08, 24), accentMat
  );
  neck.position.y = neckY + 0.04;
  g.add(neck);

  // ── 3. CAPITAL — Ionic style (Ovolo + Volutes + Abacus) ──

  // Echinus / ovolo (curved outward bulge)
  const ovolo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, shaftTopR + 0.015, 0.22, 24), mat
  );
  ovolo.position.y = neckY + 0.11 + 0.11;
  g.add(ovolo);

  // Volute scrolls (pairs of torus — simplified Ionic scrolls)
  const voluteY = neckY + 0.11 + 0.30;
  [
    { x: -0.52, z:  0.0, rx: Math.PI / 2, ry: 0 },
    { x:  0.52, z:  0.0, rx: Math.PI / 2, ry: 0 },
  ].forEach(v => {
    const vol1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.125, 0.040, 8, 20), mat
    );
    vol1.rotation.x = v.rx;
    vol1.position.set(v.x, voluteY, v.z);
    g.add(vol1);
    const vol2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.070, 0.022, 8, 16), accentMat
    );
    vol2.rotation.x = v.rx;
    vol2.position.set(v.x, voluteY + 0.005, v.z);
    g.add(vol2);
  });

  // Flat cushion connecting the two volutes
  const cushion = new THREE.Mesh(
    new THREE.BoxGeometry(1.10, 0.16, 0.38), mat
  );
  cushion.position.y = voluteY;
  g.add(cushion);

  // Abacus — flat top slab
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.13, 0.76), mat);
  abacus.position.y = voluteY + 0.145;
  g.add(abacus);

  // Thin gold line on abacus edge
  const abacusGold = new THREE.Mesh(new THREE.BoxGeometry(1.27, 0.022, 0.78),
    new THREE.MeshStandardMaterial({ color: 0xc9a84c, roughness: 0.3, metalness: 0.5 })
  );
  abacusGold.position.y = voluteY + 0.215;
  g.add(abacusGold);

  g.position.set(x, 0, z);
  return g;
}

function placeColumns() {
  const half = CONFIG.hallWidth / 2;
  const offset = 1.5; // Aumentado de 1.0 a 1.5 para acomodar el mayor volumen y no penetrar la pared
  for (let z = 0; z >= -(CONFIG.hallLength - 10); z -= CONFIG.columnInterval) {
    scene.add(createColumn(-half + offset, z));
    scene.add(createColumn(half - offset, z));
  }
}

// ─────────────────────────────────────────────────────────────
//  8. SCULPTURES — Procedural geometry
//     ★ Replace these builders with loaded GLTF models if desired
// ─────────────────────────────────────────────────────────────

function sculptureMaterial() {
  // Generate a procedural fine marble texture
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f4f0';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(215,208,198,0.3)';
  for (let i = 0; i < 15; i++) {
    ctx.lineWidth = Math.random() * 1.5 + 0.2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, Math.random() * 256);
    ctx.bezierCurveTo(Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);

  return new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.2, metalness: 0.05, color: 0xffffff
  });
}

// ── Roman Classical Pedestal ──
function createPedestal() {
  const g = new THREE.Group();

  // Main dimensions — bigger than before
  const W = 1.20, H = 1.30, D = 1.20;

  // ── Materials ──
  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xddd7ce, roughness: 0.30, metalness: 0.04
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc9a84c, roughness: 0.30, metalness: 0.55, emissive: 0x3d2a00, emissiveIntensity: 0.12
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x8a7e6e, roughness: 0.55, metalness: 0.05
  });

  // ── 1. Stylobate — thick square bottom step ──
  const stylobate = new THREE.Mesh(new THREE.BoxGeometry(W + 0.30, 0.10, D + 0.30), marbleMat);
  stylobate.position.y = 0.05;
  stylobate.castShadow = true;
  stylobate.receiveShadow = true;
  g.add(stylobate);

  // ── 2. Lower torus molding (echinus) ──
  const lowerTorus = new THREE.Mesh(new THREE.BoxGeometry(W + 0.18, 0.08, D + 0.18), marbleMat);
  lowerTorus.position.y = 0.14;
  g.add(lowerTorus);

  // Gold accent line at base
  const baseGold = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, 0.025, D + 0.16), goldMat);
  baseGold.position.y = 0.225;
  g.add(baseGold);

  // ── 3. Main body (dado) ──
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.42, D), marbleMat);
  body.position.y = 0.25 + (H - 0.42) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // ── 4. Pilasters on each face (flat vertical strips) ──
  const pilW = 0.09, pilH = H - 0.46, pilD = 0.06;
  const pilMat = marbleMat.clone();
  pilMat.color.set(0xeae4da);
  [
    // Front face — 2 pilasters
    { x: -(W / 2 - 0.05), z: D / 2 + 0.01, ry: 0 },
    { x:  (W / 2 - 0.05), z: D / 2 + 0.01, ry: 0 },
    // Back face
    { x: -(W / 2 - 0.05), z: -(D / 2 + 0.01), ry: Math.PI },
    { x:  (W / 2 - 0.05), z: -(D / 2 + 0.01), ry: Math.PI },
    // Left face
    { x: -(W / 2 + 0.01), z: -(D / 2 - 0.05), ry: Math.PI / 2 },
    { x: -(W / 2 + 0.01), z:  (D / 2 - 0.05), ry: Math.PI / 2 },
    // Right face
    { x:  (W / 2 + 0.01), z: -(D / 2 - 0.05), ry: -Math.PI / 2 },
    { x:  (W / 2 + 0.01), z:  (D / 2 - 0.05), ry: -Math.PI / 2 },
  ].forEach(p => {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(pilW, pilH, pilD), pilMat);
    pil.position.set(p.x, 0.25 + pilH / 2, p.z);
    pil.rotation.y = p.ry;
    g.add(pil);
  });

  // ── 5. Frieze band (horizontal middle strip) ──
  const friezeMat = new THREE.MeshStandardMaterial({
    color: 0xcec6bb, roughness: 0.40, metalness: 0.04
  });
  const frieze = new THREE.Mesh(new THREE.BoxGeometry(W + 0.01, 0.12, D + 0.01), friezeMat);
  const friezeY = 0.25 + (H - 0.42) * 0.52;
  frieze.position.y = friezeY;
  g.add(frieze);

  // Gold line above and below frieze
  [-0.065, 0.065].forEach(dy => {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.018, D + 0.02), goldMat);
    gl.position.y = friezeY + dy;
    g.add(gl);
  });

  // Repeating meander/key pattern on frieze (simplified as small boxes)
  const keyMat = goldMat;
  const keyCount = 10;
  const spacing = (W - 0.12) / keyCount;
  for (let i = 0; i < keyCount; i++) {
    const kx = -W / 2 + 0.06 + spacing * (i + 0.5);
    // Front
    const k1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.015), keyMat);
    k1.position.set(kx, friezeY, D / 2 + 0.01);
    g.add(k1);
    // Back
    const k2 = k1.clone();
    k2.position.z = -(D / 2 + 0.01);
    g.add(k2);
  }
  const keyCountSide = 10;
  const spacingS = (D - 0.12) / keyCountSide;
  for (let i = 0; i < keyCountSide; i++) {
    const kz = -D / 2 + 0.06 + spacingS * (i + 0.5);
    const k3 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.04), keyMat);
    k3.position.set(W / 2 + 0.01, friezeY, kz);
    g.add(k3);
    const k4 = k3.clone();
    k4.position.x = -(W / 2 + 0.01);
    g.add(k4);
  }

  // ── 6. Upper cornice ──
  const corniceY = 0.25 + (H - 0.42);
  const cornice1 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, 0.025, D + 0.16), goldMat);
  cornice1.position.y = corniceY + 0.012;
  g.add(cornice1);

  const cornice2 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.10, 0.07, D + 0.10), marbleMat);
  cornice2.position.y = corniceY + 0.06;
  g.add(cornice2);

  const cornice3 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.22, 0.06, D + 0.22), marbleMat);
  cornice3.position.y = corniceY + 0.115;
  g.add(cornice3);

  // Final top slab (abacus) where sculpture rests
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(W + 0.14, 0.07, D + 0.14), marbleMat);
  abacus.position.y = corniceY + 0.165;
  g.add(abacus);

  return g;
}


// ── Full Statue (Emperor Augustus of Prima Porta) ──
function createBust() {
  const g = new THREE.Group();
  const mat = sculptureMaterial();

  // Torso (Coraza/Breastplate)
  const torsoGeo = new THREE.CylinderGeometry(0.18, 0.15, 0.5, 16);
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.position.y = 1.0;
  torso.castShadow = true;
  g.add(torso);

  // Breastplate details (relief hint)
  const relief = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 12, Math.PI), mat);
  relief.position.set(0, 1.05, 0.17);
  relief.rotation.x = Math.PI / 2;
  g.add(relief);

  // Pteruges (Leather skirt straps)
  const skirtGeo = new THREE.ConeGeometry(0.22, 0.3, 16);
  const skirt = new THREE.Mesh(skirtGeo, mat);
  skirt.position.y = 0.65;
  skirt.castShadow = true;
  g.add(skirt);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.6, 12);

  // Right Leg (straight, bearing weight)
  const rightLeg = new THREE.Mesh(legGeo, mat);
  rightLeg.position.set(-0.08, 0.3, 0);
  rightLeg.castShadow = true;
  g.add(rightLeg);

  // Left Leg (relaxed, slightly back)
  const leftLeg = new THREE.Mesh(legGeo, mat);
  leftLeg.position.set(0.08, 0.3, -0.1);
  leftLeg.rotation.x = -0.1;
  leftLeg.castShadow = true;
  g.add(leftLeg);

  // Right Arm (Commanding pose, raised)
  const upperArmGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.3, 12);
  const rUpperArm = new THREE.Mesh(upperArmGeo, mat);
  rUpperArm.position.set(-0.25, 1.1, 0.1);
  rUpperArm.rotation.z = Math.PI / 4;
  rUpperArm.rotation.x = Math.PI / 6;
  rUpperArm.castShadow = true;
  g.add(rUpperArm);

  const lowerArmGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.3, 12);
  const rLowerArm = new THREE.Mesh(lowerArmGeo, mat);
  rLowerArm.position.set(-0.35, 1.3, 0.2);
  rLowerArm.rotation.z = Math.PI / 3;
  rLowerArm.rotation.x = Math.PI / 4;
  rLowerArm.castShadow = true;
  g.add(rLowerArm);

  // Left Arm (holding spear/baton, draped)
  const lArm = new THREE.Mesh(upperArmGeo, mat);
  lArm.position.set(0.25, 1.0, 0);
  lArm.rotation.z = -Math.PI / 8;
  lArm.castShadow = true;
  g.add(lArm);

  const lLowerArm = new THREE.Mesh(lowerArmGeo, mat);
  lLowerArm.position.set(0.3, 0.8, 0.1);
  lLowerArm.rotation.x = Math.PI / 4;
  lLowerArm.castShadow = true;
  g.add(lLowerArm);

  // Toga drape over left arm
  const drapeGeo = new THREE.TorusGeometry(0.15, 0.04, 8, 16, Math.PI);
  const drape = new THREE.Mesh(drapeGeo, mat);
  drape.position.set(0.25, 0.9, 0);
  drape.rotation.y = Math.PI / 2;
  drape.rotation.z = -Math.PI / 4;
  drape.castShadow = true;
  g.add(drape);

  const drapedCloth = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 12), mat);
  drapedCloth.position.set(0.25, 0.5, 0);
  drapedCloth.castShadow = true;
  g.add(drapedCloth);

  // Head and Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 12), mat);
  neck.position.y = 1.28;
  neck.castShadow = true;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), mat);
  head.scale.set(0.85, 1.1, 0.9);
  head.position.y = 1.4;
  head.castShadow = true;
  g.add(head);

  // Hair (classic Augustus locks)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  hair.position.y = 1.42;
  hair.rotation.x = -0.1;
  g.add(hair);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 1.39, 0.12);
  g.add(nose);

  // Cupid on Dolphin (at right leg - signature of Prima Porta)
  const dolphin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), mat);
  dolphin.position.set(-0.15, 0.1, 0.1);
  dolphin.rotation.x = Math.PI / 2;
  dolphin.castShadow = true;
  g.add(dolphin);

  const cupidBody = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat);
  cupidBody.position.set(-0.15, 0.25, 0.1);
  cupidBody.castShadow = true;
  g.add(cupidBody);

  const cupidHead = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat);
  cupidHead.position.set(-0.15, 0.35, 0.1);
  cupidHead.castShadow = true;
  g.add(cupidHead);

  // Scale and position the entire statue
  g.scale.set(1.4, 1.4, 1.4);
  // Base offset adjustment since we changed the geometry's Y center
  g.position.y = -0.1;

  return g;
}

// ── Venus (Aphrodite of Milos) ──
function createVenus() {
  const g = new THREE.Group();
  const mat = sculptureMaterial();

  // Full body silhouette via LatheGeometry
  const body = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.055, 0.03),
    new THREE.Vector2(0.045, 0.10),
    new THREE.Vector2(0.060, 0.30),  // calves
    new THREE.Vector2(0.050, 0.50),  // knees
    new THREE.Vector2(0.075, 0.72),  // thighs
    new THREE.Vector2(0.100, 0.88),  // hips
    new THREE.Vector2(0.110, 0.95),
    new THREE.Vector2(0.085, 1.08),  // waist
    new THREE.Vector2(0.100, 1.22),  // ribs
    new THREE.Vector2(0.095, 1.38),  // bust
    new THREE.Vector2(0.072, 1.48),  // upper chest
    new THREE.Vector2(0.065, 1.53),  // shoulders
    new THREE.Vector2(0.038, 1.58),  // neck
    new THREE.Vector2(0.034, 1.62),
    new THREE.Vector2(0.056, 1.68),  // jaw
    new THREE.Vector2(0.060, 1.74),  // face
    new THREE.Vector2(0.052, 1.82),  // forehead
    new THREE.Vector2(0.001, 1.88),  // crown
  ];
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(body, 28), mat);
  mesh.castShadow = true;
  g.add(mesh);

  // Hair bun
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), mat);
  bun.position.set(0, 1.87, -0.02);
  g.add(bun);

  // Draped fabric hint (half torus around hips)
  const drape = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.015, 6, 16, Math.PI),
    mat
  );
  drape.position.set(0, 0.92, 0);
  drape.rotation.x = Math.PI / 2;
  drape.rotation.z = Math.PI / 4;
  g.add(drape);

  // Scale to ~1.5m tall
  g.scale.set(1.65, 1.65, 1.65);
  return g;
}

// ── Amphora (Panathenaic) ──
function createAmphora() {
  const g = new THREE.Group();

  // Terracotta body
  const terracotta = new THREE.MeshStandardMaterial({
    color: 0xc06030, roughness: 0.55, metalness: 0.02
  });

  const profile = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.07, 0.02),
    new THREE.Vector2(0.11, 0.05),
    new THREE.Vector2(0.09, 0.08),
    new THREE.Vector2(0.16, 0.25),
    new THREE.Vector2(0.20, 0.42),  // max width
    new THREE.Vector2(0.18, 0.58),
    new THREE.Vector2(0.13, 0.72),  // shoulder
    new THREE.Vector2(0.07, 0.82),
    new THREE.Vector2(0.050, 0.88),  // neck
    new THREE.Vector2(0.045, 0.93),
    new THREE.Vector2(0.060, 0.96),  // lip
    new THREE.Vector2(0.075, 0.98),
    new THREE.Vector2(0.065, 1.00),
    new THREE.Vector2(0.045, 1.01),
  ];
  const vase = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), terracotta);
  vase.castShadow = true;
  g.add(vase);

  // Handles
  const handleMat = terracotta;
  const handleGeo = new THREE.TorusGeometry(0.07, 0.012, 8, 14, Math.PI);
  const h1 = new THREE.Mesh(handleGeo, handleMat);
  h1.position.set(0.14, 0.78, 0);
  h1.rotation.z = Math.PI / 5;
  h1.rotation.y = Math.PI / 2;
  g.add(h1);

  const h2 = new THREE.Mesh(handleGeo, handleMat);
  h2.position.set(-0.14, 0.78, 0);
  h2.rotation.z = -Math.PI / 5;
  h2.rotation.y = Math.PI / 2;
  g.add(h2);

  // Decorative black bands
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x121210, roughness: 0.45, metalness: 0.05
  });
  [0.30, 0.54, 0.70].forEach(y => {
    const r = profile.reduce((best, p) => {
      return Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best;
    });
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(r.x + 0.003, 0.005, 6, 20), bandMat
    );
    band.position.y = y;
    band.rotation.x = Math.PI / 2;
    g.add(band);
  });

  // Scale
  g.scale.set(1.6, 1.6, 1.6);
  return g;
}

// ── Place loaded mesh into the scene, auto-scale & center ──
function placeLoadedMesh(object, ex, fallbackSculpture) {
  const mat = sculptureMaterial();

  // Apply marble material to all meshes
  if (object.isMesh) {
    object.material = mat;
    object.castShadow = true;
    object.receiveShadow = true;
  }
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = mat;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Centrar la geometría perfectamente antes de cualquier rotación
  object.traverse((child) => {
    if (child.isMesh && child.geometry) {
      child.geometry.center();
    }
  });

  // STL files from most 3D software use Z-up axis; Three.js uses Y-up.
  // Rotating -90° on X puts the figure upright.
  if (ex.loaderType === 'stl') {
    object.rotation.x = -Math.PI / 2;
  }

  // Auto-scale to 2.7 units tall (or wide) using bounding box
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  let scaleFactor = maxDim > 0 ? 2.7 / maxDim : 1;
  
  if (ex.scaleMultiplier) {
    scaleFactor *= ex.scaleMultiplier;
  }
  object.scale.multiplyScalar(scaleFactor);

  // Lift so bottom sits exactly at y=0 (apoya perfecto sobre la base)
  const box3 = new THREE.Box3().setFromObject(object);
  object.position.y -= box3.min.y;

  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.position.set(ex.sculpturePos.x, 1.33, ex.sculpturePos.z);
  // Por defecto rotar las obras hacia el centro del pasillo (90 grados) en lugar de perfil
  wrapper.rotation.y = ex.modelRotationY !== undefined
    ? ex.modelRotationY
    : (ex.sculpturePos.x < 0 ? Math.PI / 2 : -Math.PI / 2);
  scene.add(wrapper);

  if (fallbackSculpture) scene.remove(fallbackSculpture);
  console.log(`✅ Modelo colocado: ${ex.modelUrl}`);
}

// ── Custom 3MF parser (no dependency on Three's broken ThreeMFLoader) ──
async function load3MF(url) {
  const JSZip = (await import('https://unpkg.com/jszip@3.10.1/dist/jszip.min.js?module=true')).default
    || window.JSZip;
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Find the main model file
  let modelXml = null;
  for (const filename of Object.keys(zip.files)) {
    if (filename.endsWith('.model')) {
      modelXml = await zip.files[filename].async('string');
      break;
    }
  }
  if (!modelXml) throw new Error('No .model file found inside 3MF');

  const parser = new DOMParser();
  const doc = parser.parseFromString(modelXml, 'text/xml');

  const group = new THREE.Group();
  const meshEls = doc.querySelectorAll('mesh');

  meshEls.forEach((meshEl) => {
    const vertices = [];
    const indices = [];

    meshEl.querySelectorAll('vertices > vertex').forEach((v) => {
      vertices.push(
        parseFloat(v.getAttribute('x')),
        parseFloat(v.getAttribute('y')),
        parseFloat(v.getAttribute('z'))
      );
    });

    meshEl.querySelectorAll('triangles > triangle').forEach((t) => {
      indices.push(
        parseInt(t.getAttribute('v1')),
        parseInt(t.getAttribute('v2')),
        parseInt(t.getAttribute('v3'))
      );
    });

    if (vertices.length === 0 || indices.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo);
    group.add(mesh);
  });

  return group;
}

// ── Generic Loader for External Models ──
function loadExternalModel(ex, fallbackSculpture) {
  if (ex.loaderType === '3mf') {
    load3MF(ex.modelUrl)
      .then((object) => placeLoadedMesh(object, ex, fallbackSculpture))
      .catch((err) => {
        console.warn(`⚠️ Error cargando 3MF "${ex.modelUrl}":`, err);
      });
    return;
  }

  let loader;
  if (ex.loaderType === 'obj') loader = new OBJLoader();
  else if (ex.loaderType === 'stl') loader = new STLLoader();

  if (!loader) return;

  loader.load(
    ex.modelUrl,
    (object) => {
      let mesh = object;
      if (ex.loaderType === 'stl') {
        mesh = new THREE.Mesh(object);
      }
      placeLoadedMesh(mesh, ex, fallbackSculpture);
    },
    undefined,
    (error) => {
      console.warn(`⚠️ No se encontró "${ex.modelUrl}". Mostrando fallback.`, error);
    }
  );
}

// ── Place all exhibits ──
function placeExhibits() {
  const builders = { bust: createBust, venus: createVenus, amphora: createAmphora };

  // Helper para crear vitrina y cinta de seguridad
  function createSecurityDisplay(x, z) {
    const g = new THREE.Group();
    
    // 1. Vitrina de vidrio (urna alta y cerrada)
    // Pedestal tiene 1.33m de alto; la vitrina mide 3.8m de alto.
    // Centro del cubo = 1.33 + 3.8/2 = 3.23
    const GLASS_HEIGHT = 3.8;
    const PEDESTAL_TOP = 1.33;
    const glassGeo = new THREE.BoxGeometry(2.5, GLASS_HEIGHT, 2.5);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xddeeff,   // tinte celeste milimétrico para que las caras sean visibles
      transparent: true,
      opacity: 0.35,
      roughness: 0.12,
      metalness: 0.05,
      transmission: 0.6,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, PEDESTAL_TOP + GLASS_HEIGHT / 2, 0); // Base del cubo apoya exactamente sobre la mesa
    g.add(glass);

    // Luz interna — cuelga del techo de la vitrina para iluminar la maqueta desde arriba
    const internalLight = new THREE.PointLight(0xffeedd, 2.5, 6);
    internalLight.position.set(0, PEDESTAL_TOP + GLASS_HEIGHT - 0.3, 0);
    g.add(internalLight);

    // 2. Postes de seguridad
    const poleHeight = 0.9;
    const poleRadius = 0.05; // Más grueso
    const poleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.1 }); // Dorado cromado
    
    // Separación de los postes (rodeando el pedestal ampliado)
    const d = 1.6; 
    const positions = [
      new THREE.Vector3(-d, 0, -d),
      new THREE.Vector3(d, 0, -d),
      new THREE.Vector3(d, 0, d),
      new THREE.Vector3(-d, 0, d)
    ];
    
    positions.forEach(p => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p.x, poleHeight / 2, p.z);
      pole.castShadow = true;
      g.add(pole);
    });

    // 3. Cintas rojas de contención (Tubos curvados gruesos)
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.8 }); // Rojo oscuro
    for (let i = 0; i < 4; i++) {
      const p1 = positions[i];
      const p2 = positions[(i + 1) % 4];
      
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(p1.x, poleHeight - 0.05, p1.z),
        new THREE.Vector3((p1.x + p2.x) / 2, poleHeight - 0.35, (p1.z + p2.z) / 2),
        new THREE.Vector3(p2.x, poleHeight - 0.05, p2.z)
      );
      const ropeGeo = new THREE.TubeGeometry(curve, 20, 0.04, 12, false); // Radio 0.04 (más grueso)
      const rope = new THREE.Mesh(ropeGeo, ropeMat);
      g.add(rope);
    }

    g.position.set(x, 0, z);
    scene.add(g);
  }

  EXHIBITS.forEach(ex => {
    if (ex.loaderType === 'monuments') {
      const loader = new STLLoader();
      const material = sculptureMaterial();
      
      // Pedestal 1 (Partenón) - Izquierda
      const ped1 = createPedestal();
      ped1.scale.set(2.0, 1.0, 2.0); // Base doblemente ancha y profunda
      ped1.position.set(-3.5, 0, ex.sculpturePos.z);
      scene.add(ped1);

      loader.load('modelos/partenon.stl', function(geometry) {
        const mesh = new THREE.Mesh(geometry, material);
        const mockEx = {
          loaderType: 'stl',
          modelUrl: 'modelos/partenon.stl',
          sculpturePos: new THREE.Vector3(-3.5, 1.1, ex.sculpturePos.z),
          modelRotationY: Math.PI / 2, // Apunta al centro del pasillo
          scaleMultiplier: 2.2 / 2.7 // Reducido de 3.0 a 2.2 para que entre perfecto en la vitrina de 2.5
        };
        placeLoadedMesh(mesh, mockEx, null);
      });

      // Agregar seguridad y vitrina al Partenón
      createSecurityDisplay(-3.5, ex.sculpturePos.z);

      // Pedestal 2 (Coliseo) - Derecha
      const ped2 = createPedestal();
      ped2.scale.set(2.0, 1.0, 2.0); // Base doblemente ancha y profunda
      ped2.position.set(3.5, 0, ex.sculpturePos.z);
      scene.add(ped2);

      loader.load('modelos/coliseo.stl', function(geometry) {
        const mesh = new THREE.Mesh(geometry, material);
        const mockEx = {
          loaderType: 'stl',
          modelUrl: 'modelos/coliseo.stl',
          sculpturePos: new THREE.Vector3(3.5, 1.1, ex.sculpturePos.z),
          modelRotationY: -Math.PI / 2, // Apunta al centro del pasillo
          scaleMultiplier: 2.2 / 2.7 // Reducido de 3.0 a 2.2 para que entre perfecto
        };
        placeLoadedMesh(mesh, mockEx, null);
      });
      
      // Agregar seguridad y vitrina al Coliseo
      createSecurityDisplay(3.5, ex.sculpturePos.z);
      return; // Skip normal logic
    }

    // Pedestal Normal
    const pedestal = createPedestal();
    pedestal.position.copy(ex.sculpturePos);
    pedestal.position.y = 0;
    scene.add(pedestal);

    let sculpture = null;
    
    if (ex.builder) {
      // Procedural Sculpture (Fallback provisional)
      sculpture = builders[ex.builder]();
      sculpture.position.set(ex.sculpturePos.x, 1.33, ex.sculpturePos.z);
      // Slight angle toward hallway center
      sculpture.rotation.y = ex.sculpturePos.x < 0 ? Math.PI / 7 : -Math.PI / 7;
      scene.add(sculpture);
    }

    if (ex.loaderType === 'custom_stl') {
      // Cargar archivo STL real usando STLLoader
      const loader = new STLLoader();
      loader.load(ex.modelUrl, function (geometry) {
        // 1. Centrar la geometría y pararla (Y-up) directamente en sus vértices
        geometry.center();
        geometry.rotateX(-Math.PI / 2);

        // Usamos exactamente el mismo material procedural de mármol que tienen las demás esculturas
        const material = sculptureMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        // 3. Subirlo un poco más en Y (a 1.80) para compensar el nuevo tamaño y que apoye perfecto
        mesh.position.set(ex.sculpturePos.x, 1.80, ex.sculpturePos.z);
        
        // 2. Hacerlo más grande (triple de 0.005) para tener mayor presencia
        mesh.scale.set(0.015, 0.015, 0.015);
        
        // Rotación normal en Y: Math.PI / 2 lo hace mirar directamente hacia el centro del pasillo (+X)
        mesh.rotation.y = Math.PI / 2;
        
        // Sombras
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        scene.add(mesh);
        console.log(`✅ Modelo STL custom colocado: ${ex.modelUrl}`);
      });
    } else {
      // Try loading external model
      loadExternalModel(ex, sculpture);
    }
  });
}

// ─────────────────────────────────────────────────────────────
//  9. LIGHTING — Dramatic claroscuro
// ─────────────────────────────────────────────────────────────
function setupLighting() {
  // Very dim ambient (deep warm)
  scene.add(new THREE.AmbientLight(0x1a1520, 0.25));

  // Soft hemisphere for general fill
  const hemi = new THREE.HemisphereLight(0xd4c8b0, 0x0a0a18, 0.3);
  scene.add(hemi);

  // Spotlights on each exhibit — key dramatic lighting
  EXHIBITS.forEach(ex => {
    const spot = new THREE.SpotLight(0xffe4b5, 3.5, 18, Math.PI / 5.5, 0.6, 1.2);
    // Position above and slightly in front
    spot.position.set(
      ex.sculpturePos.x * 0.6,    // offset toward center
      CONFIG.hallHeight - 0.5,
      ex.sculpturePos.z + 1
    );
    spot.target.position.set(
      ex.sculpturePos.x,
      1.5,
      ex.sculpturePos.z
    );
    spot.castShadow = true;
    spot.shadow.mapSize.width = 1024;
    spot.shadow.mapSize.height = 1024;
    spot.shadow.bias = -0.0005;
    scene.add(spot);
    scene.add(spot.target);

    // Subtle rim/back light for depth
    const rim = new THREE.PointLight(0xffd49e, 0.8, 8, 2);
    rim.position.set(
      ex.sculpturePos.x + (ex.sculpturePos.x < 0 ? -1.5 : 1.5),
      3,
      ex.sculpturePos.z - 1
    );
    scene.add(rim);
  });

  // ── Antorchas en paredes para las estatuas y maquetas ──
  EXHIBITS.forEach(ex => {
    if (ex.loaderType === 'monuments') {
      // Las maquetas están en el centro Z, agregar luz en ambas paredes
      const wallXRight = CONFIG.hallWidth / 2 - 0.05;
      const wallXLeft = -CONFIG.hallWidth / 2 + 0.05;
      
      createTorch(wallXLeft, 3.5, ex.sculpturePos.z - 2.5, 1);
      createTorch(wallXLeft, 3.5, ex.sculpturePos.z + 2.5, 1);
      createTorch(wallXRight, 3.5, ex.sculpturePos.z - 2.5, -1);
      createTorch(wallXRight, 3.5, ex.sculpturePos.z + 2.5, -1);
      return;
    }

    // Si la estatua está en x positivo, la pared correspondiente es la derecha
    const isRight = ex.sculpturePos.x > 0;
    const wallX = isRight ? CONFIG.hallWidth / 2 - 0.05 : -CONFIG.hallWidth / 2 + 0.05;
    const faceDir = isRight ? -1 : 1; // Hacia el pasillo
    // Flanquear la estatua a los lados en Z
    createTorch(wallX, 3.5, ex.sculpturePos.z - 2.5, faceDir);
    createTorch(wallX, 3.5, ex.sculpturePos.z + 2.5, faceDir);
  });
  
  // ── Antorchas de Respiro (Tramo 4 vacío en Z = -115) ──
  const wallXRight = CONFIG.hallWidth / 2 - 0.05;
  const wallXLeft = -CONFIG.hallWidth / 2 + 0.05;
  createTorch(wallXLeft, 3.5, -115, 1);
  createTorch(wallXRight, 3.5, -115, -1);
}

/** Antorcha de pared con fuego procedimental */
function createTorch(x, y, z, faceDir) {
  const g = new THREE.Group();
  
  // Soporte (Cilindro oscuro de metal forjado)
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.8 });
  const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.4, 8), matMetal);
  bracket.rotation.z = faceDir < 0 ? Math.PI / 6 : -Math.PI / 6;
  g.add(bracket);
  
  // Base agarrada a la pared
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.15), matMetal);
  base.position.set(faceDir < 0 ? 0.1 : -0.1, -0.15, 0);
  g.add(base);

  // Llama (Cono emisivo simulando fuego)
  const matFlame = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 8), matFlame);
  const flameOffsetX = faceDir < 0 ? -0.1 : 0.1;
  flame.position.set(flameOffsetX, 0.25, 0);
  g.add(flame);

  g.position.set(x, y, z);
  scene.add(g);

  // Luz cálida (PointLight)
  const baseInt = 1.2; // Reducido para luz más tenue y mística
  const pLight = new THREE.PointLight(0xff7722, baseInt, 6, 2); // Distancia reducida a 6 para confinar la luz
  pLight.position.set(x + flameOffsetX, y + 0.3, z);
  
  // CRÍTICO: Desactivamos el castShadow de las antorchas. 
  // 20 pointLights emitiendo sombras saturan los "MAX_TEXTURE_IMAGE_UNITS(16)" del Fragment Shader
  pLight.castShadow = false; 
  
  scene.add(pLight);

  // Guardar para el flickering
  fireLights.push({ light: pLight, baseIntensity: baseInt, phase: Math.random() * Math.PI * 2 });
}

// ─────────────────────────────────────────────────────────────
// 10. CAMERA PATH — CatmullRom spline through the hallway
//     Dense control points near exhibits → camera slows there
// ─────────────────────────────────────────────────────────────
function setupCameraPath() {
  const E = CONFIG.eyeHeight;
  cameraPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, E, 4),     // start
    new THREE.Vector3(0, E, 0),
    new THREE.Vector3(0, E, -10),
    // ─ approach exhibit 1 (left wall z=-25)
    new THREE.Vector3(-0.35, E, -20),
    new THREE.Vector3(-0.50, E, -25),  // ← near exhibit 1
    new THREE.Vector3(-0.35, E, -30),
    // ─ approach exhibit 2 (right wall z=-45)
    new THREE.Vector3(0.35, E, -40),
    new THREE.Vector3(0.50, E, -45),   // ← near exhibit 2
    new THREE.Vector3(0.35, E, -50),
    // ─ approach exhibit 3 (left wall z=-65)
    new THREE.Vector3(-0.35, E, -60),
    new THREE.Vector3(-0.50, E, -65),  // ← near exhibit 3
    new THREE.Vector3(-0.35, E, -70),
    // ─ approach exhibit 4 (right wall z=-85)
    new THREE.Vector3(0.35, E, -80),
    new THREE.Vector3(0.50, E, -85),   // ← near exhibit 4
    new THREE.Vector3(0.35, E, -90),
    // ─ approach exhibit 5 (left wall z=-105)
    new THREE.Vector3(-0.35, E, -100),
    new THREE.Vector3(-0.50, E, -105), // ← near exhibit 5
    new THREE.Vector3(-0.35, E, -110),
    // ─ empty bay (Tramo 4 respiro)
    new THREE.Vector3(0, E, -115),
    // ─ FINAL STOP at exhibit 6 (monuments at z=-125)
    new THREE.Vector3(0, E, -120),
    new THREE.Vector3(0, E, -125), // El recorrido muere exactamente aquí
  ], false, 'catmullrom', 0.5);

  // Set initial camera position
  const startPos = cameraPath.getPoint(0);
  camera.position.copy(startPos);
  currentLookTarget.set(0, E, startPos.z - 10);
  camera.lookAt(currentLookTarget);
}

// ─────────────────────────────────────────────────────────────
// 11. DUST PARTICLES — atmospheric floating motes
// ─────────────────────────────────────────────────────────────
function createDustParticles() {
  const count = CONFIG.particleCount;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const W = CONFIG.hallWidth * 0.8;
  const H = CONFIG.hallHeight;
  const L = CONFIG.hallLength;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * W;       // X
    positions[i * 3 + 1] = Math.random() * H;               // Y
    positions[i * 3 + 2] = -Math.random() * L + 5;          // Z
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlePositions = positions;

  const mat = new THREE.PointsMaterial({
    color: 0xffe8c0,
    size: 0.025,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

function updateDustParticles(dt) {
  if (!particlePositions) return;
  const count = CONFIG.particleCount;
  for (let i = 0; i < count; i++) {
    // Gentle upward drift + slight horizontal sway
    particlePositions[i * 3] += Math.sin(Date.now() * 0.0003 + i) * 0.001;
    particlePositions[i * 3 + 1] += dt * 0.04;
    particlePositions[i * 3 + 2] += Math.cos(Date.now() * 0.0002 + i) * 0.0005;

    // Wrap around if above ceiling
    if (particlePositions[i * 3 + 1] > CONFIG.hallHeight) {
      particlePositions[i * 3 + 1] = 0;
    }
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────
// 12. NAVEGACIÓN POR ESTACIONES — Teclado, wheel y scroll
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// 12. NAVEGACIÓN Y CONTROLES (Scroll lineal + Mirar a los lados)
// ─────────────────────────────────────────────────────────────
function setupControls() {
  function enterOrbitMode(maquetaX, maquetaZ) {
    if (!orbitControls) return;
    const maquetaCenter = new THREE.Vector3(maquetaX, 2.2, maquetaZ);
    orbitControls.target.copy(maquetaCenter);
    orbitControls.enabled = true;
    isOrbitMode = true;
    // Bloquear el scroll mientras orbitamos (no queremos avanzar en el pasillo)
    document.getElementById('scroll-spacer').style.pointerEvents = 'none';
  }

  function exitOrbitMode() {
    if (!orbitControls) return;
    orbitControls.enabled = false;
    isOrbitMode = false;
    document.getElementById('scroll-spacer').style.pointerEvents = '';
  }

  function lookAtSide(dir) {
    // Si hace click en la misma dirección, se deselecciona (mira al frente)
    if (dir === userLookDirection) {
      dir = 0;
    }
    
    if (dir === 0) {
      userLookDirection = 0;
      exitOrbitMode();
      return;
    }

    // 1. Encontrar la estación más cercana según la posición actual (Z)
    const clampedP = Math.max(0, Math.min(1, currentProgress));
    let nearest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < ESTACIONES.length; i++) {
      const diff = Math.abs(clampedP - ESTACIONES[i].progressTarget);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = i;
      }
    }
    
    // Fijar la estación y su posición ideal
    currentStation = nearest;
    const targetP = ESTACIONES[nearest].progressTarget;

    // 2. Alineación Automática (Snap Z)
    const scrollH = document.body.scrollHeight - window.innerHeight;
    const targetScrollY = targetP * scrollH;
    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });

    // Iniciar rotación y acercamiento
    userLookDirection = dir;

    // 3. Si es la Estación 5 (maquetas): activar OrbitControls apuntando a la maqueta elegida
    if (nearest === 5) {
      const maquetaX = dir < 0 ? -3.5 : 3.5; // izq = Partenón, der = Coliseo
      enterOrbitMode(maquetaX, -125);
    } else {
      exitOrbitMode();
    }
  }

  // ―― Wheel y Touch: Desbloquear y volver al frente al scrollear ――
  window.addEventListener('wheel', (e) => {
    if (userLookDirection !== 0) {
      userLookDirection = 0;
      exitOrbitMode();
    }
  }, { passive: true });
  
  window.addEventListener('touchmove', (e) => {
    if (userLookDirection !== 0) {
      userLookDirection = 0;
      exitOrbitMode();
    }
  }, { passive: true });

  // ―― Teclado: flechas arr/aba ――
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      lookAtSide(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      lookAtSide(1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'w' || e.key === 's') {
      if (userLookDirection !== 0) { userLookDirection = 0; exitOrbitMode(); }
    }
  });

  // ―― Botones en pantalla: Actuar como toggle para mirar a los lados ――
  const btnLeft = document.getElementById('btn-look-left');
  const btnRight = document.getElementById('btn-look-right');
  if (btnLeft) btnLeft.onclick = () => lookAtSide(-1);
  if (btnRight) btnRight.onclick = () => lookAtSide(1);
  
  // Botones de nav de estaciones (legacy/coexistentes)
  const btnNext = document.getElementById('btn-station-next');
  const btnPrev = document.getElementById('btn-station-prev');
  if (btnPrev) btnPrev.onclick = () => lookAtSide(-1);
  if (btnNext) btnNext.onclick = () => lookAtSide(1);

  // ―― Scroll lineal con GSAP (solo avanza en Z) ――
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.create({
    trigger: '#scroll-spacer',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.8,
    onUpdate: function (self) {
      targetProgress = self.progress;
    },
  });
}

// ─────────────────────────────────────────────────────────────
// 13. CAMERA UPDATE — Lerp + LookAt transitions
// ─────────────────────────────────────────────────────────────
function updateCamera() {
  // ── Lerp progress ──
  currentProgress += (targetProgress - currentProgress) * CONFIG.lerpFactor;

  // ── Posición en el spline ──
  const clampedP = Math.max(0, Math.min(1, currentProgress));
  const camPos = cameraPath.getPoint(clampedP);
  const bobY = Math.sin(clampedP * Math.PI * 30) * 0.012;

  // Si estamos en modo orbita Est.5, OrbitControls ya mueve la cámara
  if (isOrbitMode) return;

  // 1. Deducir la estación más cercana según el progreso actual (solo si caminamos libremente)
  if (userLookDirection === 0) {
    let nearest = -1;
    let minDiff = 0.05; // Margen para considerar que "estamos en" una estación
    for (let i = 0; i < ESTACIONES.length; i++) {
      if (Math.abs(clampedP - ESTACIONES[i].progressTarget) < minDiff) {
        nearest = i;
        break;
      }
    }
    currentStation = nearest;
  }

  // 2. Encuadre de la cámara (Posición)
  let targetCamX = userLookDirection * -3.0; 
  let targetCamY = camPos.y + bobY;

  const isLookingAtStatue = (currentStation >= 0 && currentStation < 5) && 
                            ((userLookDirection < 0 && EXHIBITS[currentStation].sculpturePos.x < 0) || 
                             (userLookDirection > 0 && EXHIBITS[currentStation].sculpturePos.x > 0));

  if (currentStation === 5 && userLookDirection !== 0) {
    targetCamX = 0; 
    targetCamY = CONFIG.eyeHeight + 1.8; // Perspectiva aérea
  } else if (isLookingAtStatue) {
    targetCamY = 2.6; // Elevar cámara a la altura del rostro/ojos de las estatuas
  }

  const currentX = camera.position.x;
  const nextX = currentX + (targetCamX - currentX) * 0.05;
  
  const currentY = camera.position.y;
  const nextY = currentY + (targetCamY - currentY) * 0.05;

  camera.position.set(nextX, nextY, camPos.z);

  // 3. Dirección por defecto: hacia adelante al fondo del pasillo
  const tangent = cameraPath.getTangent(clampedP);
  const forwardTarget = tempVec.copy(camera.position).add(
    tangent.multiplyScalar(10)
  );
  
  let activeTarget = forwardTarget;

  // 4. Si el usuario decide mirar a los lados (Encuadre Cinematográfico)
  if (userLookDirection !== 0) {
    const forward = new THREE.Vector3().copy(tangent).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    
    if (currentStation === 5) {
      // PERSPECTIVA AÉREA para maquetas arquitectónicas
      const maquetaX = userLookDirection < 0 ? -3.5 : 3.5;
      activeTarget = new THREE.Vector3(maquetaX * 0.5, 2.5, -125);
    } else if (isLookingAtStatue) {
      // Encuadre directo y centrado para estatuas
      const ex = EXHIBITS[currentStation];
      activeTarget = new THREE.Vector3().copy(ex.sculpturePos);
      activeTarget.y = 2.4; // Altura del pecho/rostro
      
      // Offset X para desplazar la estatua hacia el lado libre de la pantalla (lejos de la UI)
      activeTarget.x += userLookDirection * 2.0; 
    } else {
      // Encuadre cinematográfico normal para pinturas
      const offsetZ = 5.0; 
      activeTarget = new THREE.Vector3().copy(camera.position)
        .addScaledVector(right, userLookDirection * 10)
        .addScaledVector(forward, offsetZ);
      activeTarget.y = CONFIG.eyeHeight;
    }
  }

  // 5. Suavizado (Lerp) hacia el objetivo donde queremos mirar
  currentLookTarget.lerp(activeTarget, 0.06);
  camera.lookAt(currentLookTarget);
}

function updateUI() {
  // ── Progress bar ──
  const pct = Math.max(0, Math.min(100, currentProgress * 100));
  document.getElementById('progress-bar').style.width = pct + '%';

  // ── Title overlay fade ──
  const titleEl = document.getElementById('title-overlay');
  if (currentProgress > 0.04) {
    titleEl.classList.add('hidden');
  } else {
    titleEl.classList.remove('hidden');
  }

  // ── UI Dinámica según selección ──
  const ps = document.getElementById('station-panel-sculpture');
  const pc = document.getElementById('station-panel-painting');

  // Si estamos cerca de una estación y el usuario gira la cabeza a un lado
  if (currentStation !== -1 && userLookDirection !== 0) {
    const est = ESTACIONES[currentStation];
    const exhibitData = EXHIBITS[currentStation];
    
    // Determinamos si la estatua de esta estación está a la derecha (x > 0)
    const isStatueRight = exhibitData.sculpturePos.x > 0;
    
    // ¿El usuario está mirando hacia el mismo lado donde está la estatua?
    // userLookDirection: 1 (Derecha), -1 (Izquierda)
    const lookingAtStatue = (userLookDirection === 1 && isStatueRight) || (userLookDirection === -1 && !isStatueRight);

    if (lookingAtStatue) { 
      // Vemos la ESTATUA / MAQUETA 1
      if (ps) {
        const data = est.estatua;
        ps.querySelector('.sp-tipo').innerHTML     = data.tipo || '&#9651; ESCULTURA';
        ps.querySelector('.sp-numero').textContent = `${ est.id + 1 } / ${ ESTACIONES.length }`;
        ps.querySelector('.sp-titulo').textContent = data.titulo;
        ps.querySelector('.sp-fecha').textContent  = data.fecha;
        ps.querySelector('.sp-desc').textContent   = data.desc || '';
        // Campo condicional: técnica (pinturas) o material (esculturas/maquetas)
        let extraEl = ps.querySelector('.sp-extra');
        if (!extraEl) {
          extraEl = document.createElement('p');
          extraEl.className = 'sp-extra';
          ps.querySelector('.sp-content').appendChild(extraEl);
        }
        extraEl.textContent = data.extra ? `${data.extraLabel || 'Material'}: ${data.extra}` : '';
        ps.classList.add('visible');
      }
      if (pc) pc.classList.remove('visible');
    } else { 
      // Vemos la PINTURA / MAQUETA 2
      if (pc) {
        const data = est.cuadro;
        pc.querySelector('.sp-tipo').innerHTML     = data.tipo || '&#9633; PINTURA';
        pc.querySelector('.sp-titulo').textContent = data.titulo;
        pc.querySelector('.sp-fecha').textContent  = data.fecha;
        pc.querySelector('.sp-desc').textContent   = data.desc || '';
        // Campo condicional: técnica o material
        let extraEl = pc.querySelector('.sp-extra');
        if (!extraEl) {
          extraEl = document.createElement('p');
          extraEl.className = 'sp-extra';
          pc.querySelector('.sp-content').appendChild(extraEl);
        }
        extraEl.textContent = data.extra ? `${data.extraLabel || 'Técnica'}: ${data.extra}` : '';
        pc.classList.add('visible');
      }
      if (ps) ps.classList.remove('visible');
    }
  } else {
    // Si camina al frente o no está en una estación, ocultar ambas
    if (ps) ps.classList.remove('visible');
    if (pc) pc.classList.remove('visible');
  }

  // ── Indicador de nav dots (opcional) ──
  const nav = document.getElementById('station-nav-indicator');
  if (nav) {
    nav.querySelectorAll('.nav-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentStation);
    });
  }

  // ── Paneles legacy — ocultarlos siempre ──
  for (let i = 1; i <= 5; i++) {
    const p = document.getElementById(`panel-${i}`);
    if (p) p.classList.remove('visible');
  }
}

// ─────────────────────────────────────────────────────────────
// 15. WALL DECORATIONS — Niches & relief panels
// ─────────────────────────────────────────────────────────────
function addWallDecorations() {
  const W = CONFIG.hallWidth / 2;
  const mat = new THREE.MeshStandardMaterial({
    color: 0xddd6ca, roughness: 0.45, metalness: 0.03
  });

  // Columns at: z = 0, -10, -20, -30, -40, -50, -60, -70, -80
  // Exhibits at: 
  // - Augusto: z = -25 (Left wall)
  // - Afrodita: z = -45 (Right wall)
  // - Jarrón: z = -65 (Left wall)
  // We place frames at every bay midpoint (-5, -15, -25...) but skip the walls occupied by exhibits.
  const framePositions = [
    // 1. Estación Gladiador (Pared Derecha - Horizontal) -> Centauromaquia
    // Original w: 3.8, h: 2.7 (Escalado x1.4)
    { x:  W - 0.05, z: -25, side: -1, img: 'img/centauromaquia-griega.png', w: 5.3, h: 3.8, y: 4.0 },
    // 2. Cuarta Estación (Pared Izquierda - Vertical) -> Diana
    // Original w: 2.2, h: 3.2 (Escalado x1.4)
    { x: -W + 0.05, z: -45, side: 1,  img: 'img/diana-cazadora.png',        w: 3.1, h: 4.5, y: 4.2 },
    // 3. Fondo del Pasillo (Vertical - el más imponente) -> Palas y Centauro
    // Original w: 2.6, h: 3.9 (Escalado x1.4)
    { x:  W - 0.05, z: -65, side: -1, img: 'img/palas-y-centauro.png',      w: 3.6, h: 5.5, y: 4.4 },
    // 4. Estación Zeus (Pared Izquierda - Horizontal) -> Templo Griego
    // Original w: 3.8, h: 2.8 (Escalado x1.4)
    { x: -W + 0.05, z: -85, side: 1,  img: 'img/templo-griego.png',         w: 5.3, h: 3.9, y: 4.0 },
    // 5. Estación Adriano (Pared Derecha - Vertical) -> Filósofo Romano
    // Original w: 2.2, h: 3.2 (Escalado x1.4)
    { x:  W - 0.05, z: -105, side: -1, img: 'img/filosofo-romano.png',      w: 3.1, h: 4.5, y: 4.2 }
  ];

  const textureLoader = new THREE.TextureLoader();

  framePositions.forEach((fp) => {
    // ── MATERIALES INDEPENDIENTES ──
    // Crear un material ÚNICO por cada marco para no saturar las unidades de textura (samplers)
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c, roughness: 0.45, metalness: 0.25
    });

    // Create a unique material for each frame canvas
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xddd6ca, 
      roughness: 0.45, 
      metalness: 0.03,
      side: THREE.DoubleSide
    });

    // Cargar la textura específica de este cuadro
    textureLoader.load(
      fp.img,
      (texture) => {
        // Enhance image display
        texture.colorSpace = THREE.SRGBColorSpace;
        panelMat.map = texture;
        panelMat.color.set(0xffffff); // Remove beige tint
        panelMat.roughness = 0.2;     // Make it slightly glossy like a painting/glass
        
        // Agregar material emisivo para que se vea iluminado desde adentro
        panelMat.emissive = new THREE.Color(0x444444);
        panelMat.emissiveMap = texture; // Que el brillo respete los colores del cuadro
        
        panelMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        // Fallback silently
      }
    );

    // Panel: usa fp.y como altura de colgado para centrar cuadros grandes
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(fp.w, fp.h), panelMat
    );
    panel.position.set(fp.x + fp.side * 0.02, fp.y, fp.z);
    panel.rotation.y = fp.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(panel);

    // Marco dorado: se adapta automáticamente a las nuevas dimensiones
    const fW = fp.w, fH = fp.h, fT = 0.05, fD = 0.05;
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(fW + fT * 2, fT, fD), frameMat);
    topFrame.position.set(0, fH / 2 + fT / 2, 0);

    const botFrame = new THREE.Mesh(new THREE.BoxGeometry(fW + fT * 2, fT, fD), frameMat);
    botFrame.position.set(0, -fH / 2 - fT / 2, 0);

    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(fT, fH + fT * 2, fD), frameMat);
    leftFrame.position.set(-fW / 2 - fT / 2, 0, 0);

    const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(fT, fH + fT * 2, fD), frameMat);
    rightFrame.position.set(fW / 2 + fT / 2, 0, 0);

    const frameGroup = new THREE.Group();
    frameGroup.add(topFrame, botFrame, leftFrame, rightFrame);
    frameGroup.position.set(fp.x + fp.side * 0.04, fp.y, fp.z);
    frameGroup.rotation.y = fp.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(frameGroup);

    // ── ILUMINACIÓN PARA EL CUADRO ──
    // Foco situado arriba y un poco hacia el centro del pasillo
    const spotLight = new THREE.SpotLight(0xffeedd, 90); // Intensidad fuertemente aumentada para mayor contraste
    spotLight.position.set(fp.x + fp.side * 2.5, fp.y + 4.5, fp.z);
    spotLight.angle = Math.PI / 4.5;
    spotLight.penumbra = 0.4;
    spotLight.decay = 1.4;
    spotLight.distance = 25;
    spotLight.castShadow = true;
    
    // Apuntar exactamente al centro del panel
    spotLight.target = panel;
    scene.add(spotLight);

    // ── Antorchas flanqueando el cuadro ──
    const gap = fp.w / 2 + 0.7; // Distancia a los lados del cuadro (ancho + margen)
    createTorch(fp.x, fp.y - 0.2, fp.z - gap, fp.side);
    createTorch(fp.x, fp.y - 0.2, fp.z + gap, fp.side);
  });
}

// ─────────────────────────────────────────────────────────────
// 16. ANIMATION LOOP
// ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const now = Date.now();

  updateCamera();
  updateUI();
  updateDustParticles(dt);

  // OrbitControls activos solo en modo inspección de maqueta (Est.5)
  if (isOrbitMode && orbitControls) orbitControls.update();

  // Parpadeo de antorchas (Flickering)
  fireLights.forEach(f => {
    // Oscilación lenta y suave proporcional a la intensidad baja (0.3 de oscilación, 0.15 de ruido)
    f.light.intensity = f.baseIntensity + Math.sin(now * 0.003 + f.phase) * 0.3 + Math.random() * 0.15;
  });

  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────
// 17. RESIZE HANDLER
// ─────────────────────────────────────────────────────────────
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─────────────────────────────────────────────────────────────
// 18. INIT — wire everything up
// ─────────────────────────────────────────────────────────────
function init() {
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.fogColor);
  scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

  // Camera
  camera = new THREE.PerspectiveCamera(
    62, // Aumentado para un plano más amplio y menos "teleobjetivo"
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );

  // Renderer
  const canvas = document.getElementById('museum-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  clock = new THREE.Clock();

  // Build the world
  buildHallway();
  placeColumns();
  placeExhibits();
  addWallDecorations();
  setupLighting();
  setupCameraPath();
  createDustParticles();

  // Navegación (controles de scroll lineal y botones para mirar a los lados)
  setupControls();

  // ── Cargar obras del backend (async, no bloquea el renderizado) ──
  loadObrasFromAPI();

  // OrbitControls — creados pero deshabilitados; solo se habilitan en Est.5 inspección
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.enableZoom = true;
  orbitControls.minDistance = 2.5;
  orbitControls.maxDistance = 10;
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; // No pasa del suelo
  orbitControls.enabled = false; // Off por defecto, solo activo en modo inspección

  // Handle resizing
  window.addEventListener('resize', onResize);

  // Hide loading screen after a short delay
  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('hidden');
  }, 2200);

  // Start loop
  animate();
}

// ─────────────────────────────────────────────────────────────
// 🚀 GO
// ─────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ─────────────────────────────────────────────────────────────
// LÓGICA DEL MENÚ ÍNDICE (Patrón Strategy via API)
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btnPintura = document.getElementById('btn-filter-pintura');
  const btnEscultura = document.getElementById('btn-filter-escultura');
  const indexList = document.getElementById('index-list');

  async function loadIndex(tipo) {
    if (!indexList) return;
    
    // Verificar si el botón ya estaba activo (para cerrarlo)
    const isActive = (tipo === 'pintura' && btnPintura && btnPintura.classList.contains('active')) ||
                     (tipo === 'escultura' && btnEscultura && btnEscultura.classList.contains('active'));

    // Resetear clases activas en todos los botones
    if (btnPintura) btnPintura.classList.remove('active');
    if (btnEscultura) btnEscultura.classList.remove('active');

    // Si ya estaba activo, lo cerramos volviendo al estado inicial y salimos
    if (isActive) {
      indexList.innerHTML = '<li><span class="index-empty">Seleccioná una categoría...</span></li>';
      return;
    }

    // Si no estaba activo, lo marcamos como activo
    if (tipo === 'pintura' && btnPintura) btnPintura.classList.add('active');
    if (tipo === 'escultura' && btnEscultura) btnEscultura.classList.add('active');

    // Filtrado local usando la variable global ESTACIONES
    let obrasFiltradas = [];
    
    // Recolectar todas las obras cargadas en las estaciones
    ESTACIONES.forEach(est => {
      if (est.estatua) obrasFiltradas.push(est.estatua);
      if (est.cuadro) obrasFiltradas.push(est.cuadro);
    });

    // Aplicar el filtro de forma local (simulando el patrón strategy localmente)
    obrasFiltradas = obrasFiltradas.filter(obra => {
      if (tipo === 'pintura') {
        return obra.tipo.includes('PINTURA');
      } else if (tipo === 'escultura') {
        return obra.tipo.includes('ESCULTURA') || obra.tipo.includes('MAQUETA');
      }
      return false;
    });
    
    indexList.innerHTML = ''; // Limpiar lista
    
    if (obrasFiltradas.length === 0) {
      indexList.innerHTML = '<li><span class="index-empty">No hay obras de este tipo.</span></li>';
      return;
    }

    obrasFiltradas.forEach(obra => {
      const li = document.createElement('li');
      // Icono dependiendo del tipo
      const icono = tipo === 'pintura' ? '&#9633;' : '&#9651;';
      li.innerHTML = `<span style="color:#c9a84c; margin-right:6px; font-size:0.7rem;">${icono}</span> ${obra.titulo}`;
      indexList.appendChild(li);
    });
  }

  // Asignar eventos a los botones
  if (btnPintura) {
    btnPintura.addEventListener('click', () => loadIndex('pintura'));
  }
  if (btnEscultura) {
    btnEscultura.addEventListener('click', () => loadIndex('escultura'));
  }
});
