import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { sunPosition, sunDirection, istMs } from './sun.js';
import { buildPlotWorld } from './plotworld.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const isTouch = matchMedia('(pointer: coarse)').matches;
const isSmall = () => innerWidth <= 760;
const loadStep = (pct, txt) => { $('#ldBar').style.width = pct + '%'; if (txt) $('#ldTxt').textContent = txt; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- icons ----------
const P = {
  explore: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  plots: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>',
  nearby: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  amenities: '<path d="M12 3c-4 4-6 7-6 10a6 6 0 0 0 12 0c0-3-2-6-6-10z"/><path d="M12 13v8"/>',
  school: '<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v5"/>',
  hospital: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  train: '<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M8.5 19l-1.5 3M15.5 19l1.5 3"/>',
  mall: '<path d="M5 8h14l-1 13H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  bank: '<path d="M3 9l9-5 9 5H3z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>',
  highway: '<path d="M8 3L4 21M16 3l4 18M12 4v3M12 10v3M12 16v3"/>',
  park: '<path d="M12 3c-4 4-6 7-6 10a6 6 0 0 0 12 0c0-3-2-6-6-10z"/><path d="M12 13v8"/>',
  club: '<path d="M4 20V10l8-6 8 6v10"/><path d="M9 20v-6h6v6"/>',
  temple: '<path d="M12 2v3M8 21V11l4-6 4 6v10M5 21h14M10 21v-4h4v4"/>',
  creche: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 8v7M8 21l4-6 4 6M7 11.5h10"/>',
  track: '<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v4M6 12l3-3 4 1 3 3 3 1"/>',
  gate: '<path d="M4 21V5M20 21V5M4 7h16M8 7v14M12 7v14M16 7v14"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  reset: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  plan: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  person: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7M9 21l3-7 3 7M8 10h8"/>',
  chat: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.5L4 20z"/>',
  aerial: '<path d="M2 16l20-8M7 14l3 6M14 11l2 4"/>',
  villa: '<path d="M2 12l6-5 6 5M4 11v9h8v-9M14 9l4-3 4 3v11h-8"/>',
};
const icon = (k) => `<svg class="ic" viewBox="0 0 24 24">${P[k] || P.nearby}</svg>`;

// ---------- data ----------
loadStep(15, 'Loading layout…');
const bust = () => `?t=${Date.now()}`;
const [project, layout, plotsDoc] = await Promise.all(
  ['project', 'layout', 'plots'].map((f) => fetch(`data/${f}.json${bust()}`).then((r) => r.json())),
);
let plots = {};
const setPlots = (doc) => { plots = {}; for (const p of doc.plots) plots[p.id] = p; };
setPlots(plotsDoc);
const plotList = () => Object.values(plots);
document.querySelectorAll('[data-bind]').forEach((el) => { el.textContent = project[el.dataset.bind] ?? el.textContent; });
document.title = `${project.name} · Interactive Plot Map`;

// ---------- renderer / scene ----------
loadStep(35, 'Marking the plots…');
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
stage.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'labels';
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#cfdbe5', 420, 1600);
const camera = new THREE.PerspectiveCamera(isSmall() ? 52 : 42, innerWidth / innerHeight, 0.25, 6000);
camera.position.set(420, 300, 420);

const sky = new Sky();
sky.scale.setScalar(3000);
scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 4.5; su.rayleigh.value = 1.1; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
const sp = sunPosition(istMs(2026, 2, 21, 9.6), project.lat, project.lng);
const sd = sunDirection(sp);
su.sunPosition.value.set(sd.x, sd.y, sd.z);
const envScene = new THREE.Scene();
const skyEnv = new Sky(); skyEnv.scale.setScalar(3000); skyEnv.material = sky.material; envScene.add(skyEnv);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(envScene).texture;

const sun = new THREE.DirectionalLight('#fff3df', 3.3);
sun.castShadow = true;
const sm = isTouch ? 2048 : 4096;
sun.shadow.mapSize.set(sm, sm);
Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 10, far: 1000 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05;
sun.target.position.set(-10, 0, 0);
sun.position.set(sd.x, sd.y, sd.z).multiplyScalar(450).add(sun.target.position);
scene.add(sun, sun.target, new THREE.HemisphereLight('#dfeaff', '#8d816b', 1.0));

const W = buildPlotWorld(scene, layout, plotList(), project);
loadStep(75, 'Planting the avenue…');

// ---------- controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
const LIMITS = { minDistance: 12, maxDistance: 700, maxPolarAngle: Math.PI * 0.48, minPolarAngle: 0 };
Object.assign(controls, LIMITS, { enableDamping: true, dampingFactor: 0.07, screenSpacePanning: false, rotateSpeed: 0.55, zoomSpeed: 0.9, panSpeed: 0.9 });
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.target.set(-10, 0, 0);
const defaultMouse = { ...controls.mouseButtons };
function setLimits(o = {}) {
  Object.assign(controls, LIMITS, { enablePan: true, enableZoom: true, enableRotate: true }, o);
  controls.mouseButtons = state.plan ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : { ...defaultMouse };
  controls.touches = state.plan ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.screenSpacePanning = !!state.plan;
}

// ---------- state ----------
const sizes = [...new Set(plotList().map((p) => p.cls))].sort((a, b) => {
  const n = (c) => Math.min(...plotList().filter((p) => p.cls === c).map((p) => p.sqyd));
  return n(a) - n(b);
});
const prices = plotList().map((p) => p.price);
const priceMin = Math.floor(Math.min(...prices) / 5e5) * 5e5, priceMax = Math.ceil(Math.max(...prices) / 5e5) * 5e5;
const state = {
  mode: 'explore', selected: null, hover: null, colours: true, homes: false, numbers: true,
  size: 'all', face: 'all', budget: priceMax, corner: false, park: false, avail: true,
  plan: false, stand: null, touring: false, homeFor: null, activeLandmark: null, route: null,
};

const filtersOn = () => state.mode === 'plots';
const matches = (p) => (state.size === 'all' || p.cls === state.size)
  && (state.face === 'all' || p.facing === state.face)
  && p.price <= state.budget && (!state.corner || p.corner) && (!state.park || p.park) && (!state.avail || p.status === 'available');

// ---------- labels ----------
function makeLabel(html, cls, pos, onClick) {
  const el = document.createElement('div');
  el.className = cls; el.innerHTML = html;
  if (onClick) el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick(); });
  const o = new CSS2DObject(el); o.position.copy(pos); scene.add(o); return o;
}
const L = { landmark: [], amenity: [], plot: {}, dims: [] };
for (const lm of project.landmarks) {
  const b = W.beacons.find((x) => x.id === lm.id);
  const o = makeLabel(`<span class="ico">${icon(lm.kind)}</span><span class="lbl-name">${lm.name}</span><em>${lm.km} km</em>`, 'pin', b.top, () => showLandmark(lm.id));
  o.userData.id = lm.id; L.landmark.push(o);
}
for (const a of layout.amenities) {
  const o = makeLabel(`<span class="ico">${icon(a.kind)}</span><span class="lbl-name">${a.name}</span>`, 'pin', V(a.center[0], (a.h || 2) + 5, a.center[1]), () => showAmenity(a.id));
  o.userData.id = a.id; L.amenity.push(o);
}
for (const p of plotList()) {
  const o = makeLabel(p.id, 'plot-tag', V(p.cx, 0.9, p.cz), () => selectPlot(p.id, { fly: false }));
  o.visible = false; L.plot[p.id] = o;
}
function syncPinLabels() {
  const stand = !!state.stand;
  L.landmark.forEach((o) => { o.visible = (state.mode === 'nearby' || state.mode === 'explore') && !state.plan; o.element.classList.toggle('active', o.userData.id === state.activeLandmark); });
  L.amenity.forEach((o) => (o.visible = state.mode === 'amenities' && !stand));
  W.beacons.forEach((b) => { b.beam.visible = b.ring.visible = state.mode === 'nearby' || state.mode === 'explore'; });
}
// plot numbers appear only when the plot is big enough on screen to read
const tmpV = new THREE.Vector3();
function updatePlotLabels() {
  const halfH = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  for (const p of plotList()) {
    const o = L.plot[p.id];
    let show = state.numbers && !state.stand;
    if (show) {
      const d = camera.position.distanceTo(tmpV.set(p.cx, 0, p.cz));
      show = (p.w * halfH) / d > 30 && d < 420;
    }
    o.visible = show;
    if (show) o.element.className = `plot-tag ${state.colours ? p.status : ''}${filtersOn() && !matches(p) ? ' dim' : ''}${state.selected === p.id ? ' sel' : ''}`;
  }
}
function clearDims() { L.dims.forEach((o) => { scene.remove(o); o.element.remove(); }); L.dims = []; }
function showDims(p) {
  clearDims();
  const f = V(p.front[0], 0, p.front[1]), s = V(-p.front[1], 0, p.front[0]), c = V(p.cx, 1.2, p.cz);
  L.dims.push(makeLabel(`${p.w_ft} ft`, 'dim-tag', c.clone().add(f.clone().multiplyScalar(p.d / 2))));
  L.dims.push(makeLabel(`${p.d_ft} ft`, 'dim-tag', c.clone().add(s.clone().multiplyScalar(p.w / 2))));
  L.dims.push(makeLabel(`${p.road} m road`, 'dim-tag road', c.clone().add(f.clone().multiplyScalar(p.d / 2 + Math.min(p.road / 2, 6)))));
}

// ---------- materials ----------
function refresh() {
  for (const p of plotList()) {
    const m = W.plotMesh[p.id];
    let mat;
    if (state.selected === p.id) mat = W.plotMats.selected;
    else if (state.hover === p.id) mat = W.plotMats.hover;
    else if (filtersOn() && !matches(p)) mat = W.plotMats.dim;
    else if (state.colours) mat = W.plotMats[p.status];
    else mat = p.status === 'sold' ? W.plotMats.naturalSold : W.plotMats.natural;
    m.material = mat;
    m.scale.y = state.selected === p.id ? 3 : 1;
  }
  syncPinLabels();
  updatePlotLabels();
}
function syncHomes() {
  for (const p of plotList()) {
    const want = (state.homes && p.status === 'sold') || state.homeFor === p.id;
    W.showHouse(p, want, state.homeFor === p.id);
  }
}

// ---------- camera flights ----------
let tween = null;
function flyTo(pos, target, dur = 1.6) {
  if (tween) tween.res();
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  return new Promise((res) => { tween = { p0, t0, p1: pos.clone(), t1: target.clone(), start: performance.now(), dur: dur * 1000, arc: state.plan ? 0 : Math.min(60, p0.distanceTo(pos) * 0.15), res }; });
}
function stepTween(now) {
  if (!tween) return;
  const k = ease(clamp((now - tween.start) / tween.dur, 0, 1));
  camera.position.lerpVectors(tween.p0, tween.p1, k);
  camera.position.y += Math.sin(k * Math.PI) * tween.arc;
  controls.target.lerpVectors(tween.t0, tween.t1, k);
  if (k >= 1) { const r = tween.res; tween = null; r(); }
}
const planHeight = () => (isSmall() ? 640 : 430);
const VIEWS = {
  aerial: { label: 'Aerial', icon: 'aerial', pos: V(235, 175, 215), target: V(-10, 0, 0) },
  plan: { label: '2D plan', icon: 'plan' },
  entrance: { label: 'Entrance', icon: 'gate', pos: V(150, 2.2, 34), target: V(104, 6, 0), limits: { maxPolarAngle: Math.PI * 0.62 } },
  park: { label: 'Central park', icon: 'park', pos: V(110, 62, 150), target: V(30, 0, 80) },
  villa: { label: 'Villa plots', icon: 'villa', pos: V(-20, 48, -10), target: V(-86, 0, -80) },
  sco: { label: 'Commercial', icon: 'mall', pos: V(170, 40, 110), target: V(100, 0, 50) },
};
async function goView(key) {
  const v = VIEWS[key];
  document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === key));
  if (key === 'plan') return setPlan(true);
  if (state.plan) setPlan(false, false);
  setLimits(v.limits || {});
  await flyTo(v.pos, v.target);
}
function setPlan(on, fly = true) {
  state.plan = on;
  $('#btnPlan').classList.toggle('on', on);
  document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', on ? b.dataset.view === 'plan' : b.classList.contains('active') && b.dataset.view !== 'plan'));
  if (on) {
    exitStand(false);
    setLimits({ minPolarAngle: 0, maxPolarAngle: 0.001, maxDistance: 900 });
    if (fly) flyTo(V(-10, planHeight(), 0.5), V(-10, 0, 0), 1.4);
  } else {
    setLimits();
    if (fly) flyTo(VIEWS.aerial.pos, VIEWS.aerial.target, 1.4);
  }
  syncPinLabels();
}

// ---------- selection / card ----------
const inr = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);
const statusLabel = { available: 'Available', hold: 'On hold', sold: 'Sold' };
const plotFrame = (p) => {
  const c = V(p.cx, 0, p.cz), f = V(p.front[0], 0, p.front[1]), s = V(-p.front[1], 0, p.front[0]);
  return { c, f, s };
};
function selectPlot(id, { fly = true } = {}) {
  const p = plots[id]; if (!p) return;
  stopTour();
  if (state.homeFor && state.homeFor !== id) state.homeFor = null;
  state.selected = id;
  refresh(); syncHomes(); renderResults(); showDims(p); showCard(p);
  if (fly && !state.stand) {
    const { c, f, s } = plotFrame(p);
    if (state.plan) flyTo(V(p.cx, 120, p.cz + 0.5), c, 1.2);
    else {
      const k = clamp(Math.max(p.w, p.d) / 18, 1, 2) * (isSmall() ? 1.5 : 1);
      flyTo(c.clone().add(f.clone().multiplyScalar(38 * k)).add(s.clone().multiplyScalar(22 * k)).add(V(0, 32 * k, 0)), c, 1.3);
    }
  }
}
function clearSelection() {
  state.selected = null;
  if (state.homeFor) { state.homeFor = null; syncHomes(); }
  $('#card').hidden = true;
  clearDims(); refresh(); renderResults();
}
function showCard(p) {
  $('#cId').textContent = p.type === 'commercial' ? `SCO ${p.id.split('-')[1]}` : `Plot ${p.id}`;
  const b = $('#cStatus'); b.textContent = statusLabel[p.status]; b.className = `badge ${p.status}`;
  const feats = [];
  if (p.corner) feats.push(`${p.corner} corner`);
  if (p.park) feats.push('Park facing');
  if (p.road >= 18 || p.side_road >= 18) feats.push(`${Math.max(p.road, p.side_road)} m road`);
  if (p.type === 'villa') feats.push('Villa plot');
  if (p.type === 'commercial') feats.push('Commercial');
  $('#cFeat').innerHTML = feats.map((f) => `<span>${f}</span>`).join('');
  $('#cFeat').hidden = !feats.length;
  $('#cGrid').innerHTML = [
    ['Plot size', `${p.sqyd} sq yd`], ['Dimensions', `${p.w_ft} × ${p.d_ft} ft`],
    ['Facing', p.facing], ['Front road', `${p.road} m wide`],
    project.showPrices ? ['Rate*', `₹${p.rate.toLocaleString('en-IN')}/yd²`] : ['Block', p.block],
    project.showPrices ? ['Price*', inr(p.price)] : ['Price', 'On request'],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#cHome').innerHTML = `${icon('home')}<span>${state.homeFor === p.id ? 'Hide sample home' : p.type === 'commercial' ? 'See a sample building here' : 'See a home on this plot'}</span>`;
  $('#cStand').innerHTML = `${icon('person')}<span>Stand in front of the plot</span>`;
  const msg = encodeURIComponent(`Hi, I'm interested in plot ${p.id} (${p.sqyd} sq yd, ${p.facing} facing) at ${project.name}. Please share details.`);
  const num = (project.whatsapp || '').replace(/\D/g, '');
  $('#cEnquire').href = num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
  $('#cEnquire').innerHTML = `${icon('chat')}<span>${p.status === 'sold' ? 'Ask about similar plots' : 'Enquire on WhatsApp'}</span>`;
  $('#cFine').hidden = !project.showPrices;
  $('#card').hidden = false;
  if (isSmall()) $('#panel').classList.add('collapsed');
}
$('#cClose').innerHTML = icon('close');
$('#cClose').addEventListener('click', clearSelection);
$('#cHome').addEventListener('click', () => {
  const p = plots[state.selected]; if (!p) return;
  state.homeFor = state.homeFor === p.id ? null : p.id;
  syncHomes(); showCard(p);
  if (state.homeFor) {
    const h = W.houses.get(p.id);
    toast(`Sample ${h.userData.floors === 2 ? 'G+1' : `G+${h.userData.floors - 1}`} home · about ${h.userData.builtUp.toLocaleString('en-IN')} sq ft built-up`);
    if (state.plan) setPlan(false, false);
    const { c, f, s } = plotFrame(p);
    flyTo(c.clone().add(f.clone().multiplyScalar(26)).add(s.clone().multiplyScalar(16)).add(V(0, 15, 0)), c.clone().add(V(0, 4, 0)), 1.3);
  }
});
$('#cStand').addEventListener('click', () => state.selected && standAt(state.selected));

async function standAt(id) {
  const p = plots[id]; if (!p) return;
  if (state.plan) setPlan(false, false);
  const { c, f, s } = plotFrame(p);
  state.stand = id;
  setLimits({ maxPolarAngle: Math.PI * 0.62, minDistance: 1, maxDistance: 80 });
  const eye = c.clone().add(f.clone().multiplyScalar(p.d / 2 + Math.min(p.road * 0.55, 7))).add(s.clone().multiplyScalar(p.w * 0.9)).setY(1.7);
  // clear trees standing between the viewer and the plot
  const ax = eye.x, az = eye.z, bx = p.cx, bz = p.cz, abx = bx - ax, abz = bz - az, ab2 = abx * abx + abz * abz;
  W.hideTrees((x, z) => {
    const t = clamp(((x - ax) * abx + (z - az) * abz) / ab2, -0.3, 1);
    return Math.hypot(x - (ax + abx * t), z - (az + abz * t)) < 6.5;
  });
  await flyTo(eye, c.clone().setY(1.2), 1.8);
  if (state.stand !== id) return;
  $('#standTxt').textContent = `In front of ${p.id} · ${p.road} m road · ${p.facing} facing`;
  $('#standBar').hidden = false;
  if (isSmall()) $('#card').hidden = true;
  refresh();
}
function exitStand(fly = true) {
  if (!state.stand) return;
  state.stand = null;
  W.hideTrees(null);
  $('#standBar').hidden = true;
  setLimits();
  refresh();
  if (fly) goView('aerial');
}
$('#standBack').addEventListener('click', () => exitStand(true));

// ---------- filters + results ----------
function renderCounts() {
  const c = { available: 0, hold: 0, sold: 0 };
  for (const p of plotList()) c[p.status]++;
  $('#counts').innerHTML = [['available', 'Available'], ['hold', 'On hold'], ['booked', 'Sold', 'sold']]
    .map(([cls, l, k]) => `<div class="count ${cls}"><b>${c[k || cls]}</b><span>${l}</span></div>`).join('');
}
function chipRow(el, items, key) {
  el.innerHTML = items.map(([v, l]) => `<button class="chip${state[key] === v ? ' active' : ''}" data-v="${v}">${l}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state[key] = b.dataset.v;
    el.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
    refresh(); renderResults();
  };
}
chipRow($('#sizeChips'), [['all', 'All'], ...sizes.map((s) => [s, s.replace(' sq yd', ' yd²')])], 'size');
chipRow($('#faceChips'), [['all', 'Any'], ...[...new Set(plotList().map((p) => p.facing))].sort().map((f) => [f, f])], 'face');
const budget = $('#budget');
Object.assign(budget, { min: priceMin, max: priceMax, step: 5e5, value: priceMax });
const budgetLbl = () => { $('#budgetLbl').textContent = state.budget >= priceMax ? '· any' : `· up to ${inr(state.budget)}`; };
budgetLbl();
budget.addEventListener('input', () => { state.budget = +budget.value; budgetLbl(); refresh(); renderResults(); });
for (const [id, key] of [['#fCorner', 'corner'], ['#fPark', 'park'], ['#fAvail', 'avail']]) {
  $(id).addEventListener('change', (e) => { state[key] = e.target.checked; refresh(); renderResults(); });
}
const ord = { available: 0, hold: 1, sold: 2 };
function renderResults() {
  const list = plotList().filter(matches).sort((a, b) => ord[a.status] - ord[b.status] || a.price - b.price);
  $('#matchCount').textContent = `· ${list.length} of ${plotList().length}`;
  $('#results').innerHTML = list.length ? list.slice(0, 80).map((p) => `
    <button class="res${state.selected === p.id ? ' sel' : ''}" data-id="${p.id}"><i class="${p.status}"></i>
      <span><b>${p.id}</b> · ${p.sqyd} yd²<br><span>${p.facing}${p.corner ? ' · corner' : ''}${p.park ? ' · park' : ''}</span></span>
      <em>${project.showPrices ? inr(p.price) : ''}</em></button>`).join('')
    : '<div class="res-empty">No plots match. Try widening the filters.</div>';
}
$('#results').addEventListener('click', (e) => { const b = e.target.closest('.res'); if (b) { exitStand(false); selectPlot(b.dataset.id); } });

// ---------- routes / amenities ----------
const routeTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d'); g.fillStyle = '#2b5cff'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#cfe0ff'; g.fillRect(0, 0, 26, 8);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function clearRoute() {
  if (state.route) { scene.remove(state.route); state.route.geometry.dispose(); state.route.material.dispose(); state.route = null; }
  state.activeLandmark = null;
  document.querySelectorAll('#nearList .li').forEach((b) => b.classList.remove('active'));
}
function showLandmark(id) {
  const lm = project.landmarks.find((l) => l.id === id); if (!lm) return;
  stopTour(); exitStand(false); if (state.plan) setPlan(false, false);
  if (state.mode !== 'nearby') setMode('nearby');
  clearRoute();
  state.activeLandmark = id;
  document.querySelectorAll('#nearList .li').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  const pts = lm.route.map(([x, z]) => V(x, 0.7, z));
  const path = new THREE.CurvePath(); let len = 0;
  for (let i = 0; i < pts.length - 1; i++) { path.add(new THREE.LineCurve3(pts[i], pts[i + 1])); len += pts[i].distanceTo(pts[i + 1]); }
  const tex = routeTex.clone(); tex.needsUpdate = true; tex.repeat.set(len / 7, 1);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(8, Math.round(len / 3)), 1.1, 8, false), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false }));
  mesh.renderOrder = 9; scene.add(mesh); state.route = mesh;
  syncPinLabels();
  const box = new THREE.Box3().setFromPoints([...pts, V(lm.pos[0], 0, lm.pos[1]), V(-10, 0, 0)]);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const ext = Math.max(size.x, size.z, 160);
  const dist = Math.min(680, ((ext * 0.55) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05);
  flyTo(c.clone().add(V(0.3, 0.82, 0.5).normalize().multiplyScalar(dist)), V(c.x, 0, c.z), 1.8);
  toast(`${lm.name} · ${lm.km} km · about ${lm.min} min drive`);
}
function showAmenity(id) {
  const a = layout.amenities.find((x) => x.id === id); if (!a) return;
  stopTour(); exitStand(false); if (state.plan) setPlan(false, false);
  if (state.mode !== 'amenities') setMode('amenities');
  document.querySelectorAll('#amenList .li').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  const t = V(a.center[0], (a.h || 0) * 0.3, a.center[1]);
  return flyTo(t.clone().add(V(...a.cam)), t, 1.5);
}

// ---------- tour ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function startTour() {
  if (state.touring) return stopTour();
  exitStand(false); clearSelection(); clearRoute(); if (state.plan) setPlan(false, false);
  state.touring = true;
  $('#btnTour').classList.add('playing'); $('#btnTour span:last-child').textContent = 'Stop tour';
  const homesBefore = state.homes;
  const shots = [
    () => goView('aerial'),
    () => flyTo(V(-10, planHeight(), 0.5), V(-10, 0, 0), 3),
    () => flyTo(VIEWS.park.pos, VIEWS.park.target, 3),
    async () => { state.homes = true; $('#tgHomes').checked = true; syncHomes(); await flyTo(V(40, 26, -60), V(-10, 0, -30), 3.2); },
    () => flyTo(VIEWS.villa.pos, VIEWS.villa.target, 3),
    () => flyTo(VIEWS.sco.pos, VIEWS.sco.target, 3),
    async () => { setLimits(VIEWS.entrance.limits); await flyTo(VIEWS.entrance.pos, VIEWS.entrance.target, 3); },
    async () => { setLimits(); state.homes = homesBefore; $('#tgHomes').checked = homesBefore; syncHomes(); await flyTo(V(-230, 150, 220), V(-10, 0, 0), 3.2); },
  ];
  while (state.touring) {
    for (const s of shots) {
      if (!state.touring) break;
      controls.autoRotate = false;
      await s();
      if (!state.touring) break;
      controls.autoRotate = !tourNoRotate(); controls.autoRotateSpeed = 0.5;
      await wait(2600);
    }
  }
}
const tourNoRotate = () => controls.maxPolarAngle < 0.01;
function stopTour() {
  if (!state.touring) return;
  state.touring = false; controls.autoRotate = false; setLimits();
  $('#btnTour').classList.remove('playing'); $('#btnTour span:last-child').textContent = 'Start presentation tour';
}

// ---------- UI ----------
const MODES = [['explore', 'Explore'], ['plots', 'Plots'], ['nearby', 'Nearby'], ['amenities', 'Amenities']];
$('#dock').innerHTML = MODES.map(([k, l]) => `<button data-mode="${k}" class="${k === 'explore' ? 'active' : ''}">${icon(k)}<span>${l}</span></button>`).join('');
$('#dock').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mode === state.mode) { $('#panel').classList.toggle('collapsed'); return; }
  setMode(b.dataset.mode);
});
function setMode(mode) {
  const prev = state.mode;
  state.mode = mode;
  document.querySelectorAll('#dock button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.panel section').forEach((s) => s.classList.toggle('active', s.dataset.panel === mode));
  $('#panel').classList.remove('collapsed'); $('#panel').scrollTop = 0;
  if (isSmall()) $('#card').hidden = true;
  if (prev === 'nearby' && mode !== 'nearby') clearRoute();
  refresh();
}
$('#viewGrid').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button class="view-btn${k === 'aerial' ? ' active' : ''}" data-view="${k}">${icon(v.icon)}<span>${v.label}</span></button>`).join('');
$('#viewGrid').addEventListener('click', (e) => { const b = e.target.closest('.view-btn'); if (!b) return; stopTour(); exitStand(false); goView(b.dataset.view); });
$('#btnTour').addEventListener('click', startTour);
$('#tgColours').addEventListener('change', (e) => { state.colours = e.target.checked; refresh(); });
$('#tgHomes').addEventListener('change', (e) => { state.homes = e.target.checked; syncHomes(); if (state.homes) toast('Sample homes on sold plots: how the colony will look once built'); });
$('#tgNumbers').addEventListener('change', (e) => { state.numbers = e.target.checked; updatePlotLabels(); });

const all = plotList();
$('#facts').innerHTML = [
  [all.length, 'Plots'], [`${layout.area_acres} ac`, 'Township area'],
  [`${Math.min(...all.map((p) => p.sqyd))}–${Math.max(...all.map((p) => p.sqyd))}`, 'Plot sizes (sq yd)'],
  [layout.amenities.length, 'Amenities'],
].map(([b, s]) => `<div class="fact"><b>${b}</b><span>${s}</span></div>`).join('');

$('#nearList').innerHTML = project.landmarks.map((l) => `
  <button class="li" data-id="${l.id}"><span class="ico">${icon(l.kind)}</span>
  <span class="txt"><b>${l.name}</b><span>${cap(l.kind === 'train' ? 'transit' : l.kind)}</span></span>
  <span class="km">${l.km} km<span>${l.min} min</span></span></button>`).join('');
$('#nearList').addEventListener('click', (e) => { const b = e.target.closest('.li'); if (b) showLandmark(b.dataset.id); });
$('#amenList').innerHTML = layout.amenities.map((a) => `
  <button class="li" data-id="${a.id}"><span class="ico">${icon(a.kind)}</span>
  <span class="txt"><b>${a.name}</b><span>${a.desc}</span></span></button>`).join('');
$('#amenList').addEventListener('click', (e) => { const b = e.target.closest('.li'); if (b) showAmenity(b.dataset.id); });

$('#btnPlan').innerHTML = icon('plan');
$('#btnPlan').addEventListener('click', () => { stopTour(); setPlan(!state.plan); });
$('#btnReset').innerHTML = icon('reset');
$('#btnReset').addEventListener('click', () => { stopTour(); exitStand(false); clearSelection(); clearRoute(); setMode('explore'); goView('aerial'); });
$('#btnFull').innerHTML = icon('full');
$('#btnFull').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Full screen is not available here'));
});
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const houseMeshes = () => { const out = []; W.houses.forEach((g) => g.traverse((o) => o.isMesh && out.push(o))); return out; };
function pick(x, y) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...W.pickables, ...houseMeshes()], false);
  for (const h of hits) {
    if (h.object.userData.kind === 'plot') return h.object.userData.id;
    let o = h.object; while (o && !o.userData.builtUp) o = o.parent;
    if (o) { for (const [id, g] of W.houses) if (g === o) return id; }
  }
  return null;
}
let down = null, lastInput = performance.now();
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
  down = null;
  if (moved > 7 || dt > 600 || state.stand) return;
  const id = pick(e.clientX, e.clientY);
  if (id) selectPlot(id, { fly: false });
  else if (state.selected) clearSelection();
});
let hoverQ = false;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || down || hoverQ) return;
  hoverQ = true;
  requestAnimationFrame(() => {
    hoverQ = false;
    const id = state.stand ? null : pick(e.clientX, e.clientY);
    renderer.domElement.style.cursor = id ? 'pointer' : '';
    if (id !== state.hover) { state.hover = id; refresh(); }
  });
});
const markInput = () => { lastInput = performance.now(); if (controls.autoRotate && !state.touring) controls.autoRotate = false; };
['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, markInput, { passive: true }));
controls.addEventListener('start', () => { if (tween) { const r = tween.res; tween = null; r(); } stopTour(); });

// ---------- live inventory ----------
async function poll() {
  try {
    const doc = await fetch('data/plots.json' + bust()).then((r) => r.json());
    const changed = doc.plots.filter((p) => plots[p.id] && plots[p.id].status !== p.status);
    if (changed.length) {
      setPlots(doc); renderCounts(); renderResults(); refresh(); syncHomes();
      if (state.selected) showCard(plots[state.selected]);
      const c = changed[0];
      toast(changed.length === 1 ? `Plot ${c.id} is now ${statusLabel[c.status].toLowerCase()}` : `${changed.length} plots updated`);
    }
    const n = new Date();
    $('#liveTxt').textContent = `Live · synced ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  } catch { $('#liveTxt').textContent = 'Offline · last known'; }
}
setInterval(poll, (project.pollSeconds || 30) * 1000);

// ---------- loop ----------
const clock = new THREE.Clock();
const needle = $('#compass .needle');
const sph = new THREE.Spherical();
let viewOff = 0, viewOffY = 0, lblTimer = 0;
function frame(now) {
  const dt = Math.min(clock.getDelta(), 0.1);
  stepTween(now);
  const panelOpen = !isSmall() && !$('#panel').classList.contains('collapsed');
  const wantX = panelOpen ? -(352 + 14) / 2 : 0;
  let wantY = 0;
  if (isSmall()) {
    if (!$('#card').hidden) wantY = innerHeight * 0.26;
    else if (!$('#panel').classList.contains('collapsed')) wantY = innerHeight * 0.2;
  }
  if (Math.abs(viewOff - wantX) > 0.5 || Math.abs(viewOffY - wantY) > 0.5) {
    const k = Math.min(1, dt * 8);
    viewOff += (wantX - viewOff) * k; viewOffY += (wantY - viewOffY) * k;
    camera.setViewOffset(innerWidth, innerHeight, viewOff, viewOffY, innerWidth, innerHeight);
  }
  if (!state.touring && !state.stand && !state.plan && !tween && now - lastInput > 45000 && !controls.autoRotate) {
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
  }
  controls.update();
  if (!state.stand && camera.position.y < 1.2) camera.position.y = 1.2;
  const t = controls.target;
  t.x = clamp(t.x, -380, 380); t.z = clamp(t.z, -380, 380); t.y = clamp(t.y, 0, 40);
  W.updateCars(dt);
  if (state.route) state.route.material.map.offset.x -= dt * 1.6;
  if ((lblTimer += dt) > 0.15) { lblTimer = 0; updatePlotLabels(); }
  sph.setFromVector3(camera.position.clone().sub(t));
  needle.style.transform = `rotate(${(sph.theta * 180) / Math.PI}deg)`;
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let wasSmall = isSmall();
addEventListener('resize', () => {
  if (wasSmall !== isSmall()) { wasSmall = isSmall(); $('#panel').classList.toggle('collapsed', wasSmall); }
  camera.aspect = innerWidth / innerHeight;
  camera.fov = isSmall() ? 52 : 42;
  camera.setViewOffset(innerWidth, innerHeight, viewOff, viewOffY, innerWidth, innerHeight);
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- go ----------
renderCounts(); renderResults(); refresh(); poll();
loadStep(100, 'Ready');
requestAnimationFrame(frame);
if (isSmall()) $('#panel').classList.add('collapsed');
setTimeout(() => { $('#loader').classList.add('done'); flyTo(VIEWS.aerial.pos, VIEWS.aerial.target, 3.2); }, 350);
window.__plots = { scene, camera, controls, W, state, get plots() { return plots; }, selectPlot, setPlan, standAt, showLandmark, setMode };
