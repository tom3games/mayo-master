// お好み焼きマヨ職人 本体。3D は Three.js（vendor/）。文言とデータは data.js、音は snd.js
import * as THREE from './vendor/three.module.js'

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)]
const STEP = 1 / 60, DISHES = 4
const RW = 1.5, TOP = 0.27                      // お好み焼きの半径（ワールド）と上面の高さ
const INK_EXT = 1.45, INK_PX = 1024, PXU = INK_PX / (2 * INK_EXT)
const GEXT = 1.6, GRES = 0.02, GN = Math.round(2 * GEXT / GRES)
const W_BASE = 0.045, W_MIN = 0.028, W_MAX = 0.09
const DWELL_MOVE = 0.006, DWELL_BLOB = 0.5, BLOB_R = 0.095
const TOL0 = 0.02, TOL1 = 0.085
const PH = { arrive: 0.9, order: 0.95, judge: 1.15, react: 2.3 }
const CUST_Z = -2.75, FLOOR_Y = -1.25

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k])
const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3)

const S = {
  lang: 'ja', view: 'title', mode: 'demo', t: 0, frame: 0, rnd: Math.random, seed: 1, dishes: [], di: -1, ph: 'idle', pt: 0,
  mayo: 1, blobs: 0, ink: [], inkLen: 0, doneReq: false, endWhy: null, endT: 0, bot: null, botPlan: null, results: [], result: null, rt: 0, shown: 0,
  quiet: false, tut: false, banner: null, demoR: rng(7), jr: rng(3), mood: 'normal', line: '',
}
const nib = { on: false, u: 0, v: 0, w: W_BASE, dwell: 0, lastU: 0, lastV: 0, any: false }
const inp = { down: false, q: [], id: null }
const T = k => TXT[S.lang][k]
const L = o => o[S.lang]
const isTouch = () => matchMedia('(pointer:coarse)').matches

// ---------- お題の下絵を点に（採点用）
function sampleStrokes(strokes, step = 0.02) {
  const pts = []; let len = 0
  for (const st of strokes) for (let i = 1; i < st.length; i++) {
    const [x0, y0] = st[i - 1], [x1, y1] = st[i], d = Math.hypot(x1 - x0, y1 - y0); len += d
    const n = Math.max(1, Math.ceil(d / step)); for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n])
  }
  return { pts, len }
}
const gi = v => Math.floor((v + GEXT) / GRES)
function distGrid(pts) {
  const N = GN, g = new Float32Array(N * N).fill(1e9), A = 1, B = Math.SQRT2
  for (const [x, y] of pts) { const i = gi(x), j = gi(y); if (i >= 0 && i < N && j >= 0 && j < N) g[j * N + i] = 0 }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = g[j * N + i]; if (i > 0) v = Math.min(v, g[j * N + i - 1] + A)
    if (j > 0) { v = Math.min(v, g[(j - 1) * N + i] + A); if (i > 0) v = Math.min(v, g[(j - 1) * N + i - 1] + B); if (i < N - 1) v = Math.min(v, g[(j - 1) * N + i + 1] + B) }
    g[j * N + i] = v
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    let v = g[j * N + i]; if (i < N - 1) v = Math.min(v, g[j * N + i + 1] + A)
    if (j < N - 1) { v = Math.min(v, g[(j + 1) * N + i] + A); if (i < N - 1) v = Math.min(v, g[(j + 1) * N + i + 1] + B); if (i > 0) v = Math.min(v, g[(j + 1) * N + i - 1] + B) }
    g[j * N + i] = v
  }
  for (let k = 0; k < g.length; k++) g[k] *= GRES
  return g
}
const look = (g, x, y) => { const i = gi(x), j = gi(y); if (i < 0 || j < 0 || i >= GN || j >= GN) return 9; return g[j * GN + i] }
const soft = d => d <= TOL0 ? 1 : d >= TOL1 ? 0 : 1 - (d - TOL0) / (TOL1 - TOL0)
const ORD = {}
for (const [id, o] of Object.entries(ORDERS)) { const sm = sampleStrokes(o.strokes); ORD[id] = { ...o, id, samples: sm.pts, len: sm.len, dt: distGrid(sm.pts) } }

// 採点: 形（下絵をどれだけなぞれたか）・はみ出し（描いた線が下絵の近くにあるか）・量。少しの位置ずれは許す
function scoreDish(id, ink, inkLen, blobs) {
  const o = ORD[id]
  if (ink.length < 6) return { score: 0, cov: 0, prec: 0, amt: 0, ratio: 0, blobs }
  const di = distGrid(ink); let best = null
  for (let ox = -0.12; ox <= 0.1201; ox += 0.04) for (let oy = -0.12; oy <= 0.1201; oy += 0.04) {
    let c = 0; for (const [x, y] of o.samples) c += soft(look(di, x + ox, y + oy)); c /= o.samples.length
    let p = 0; for (const [x, y] of ink) p += soft(look(o.dt, x - ox, y - oy)); p /= ink.length
    const s = Math.pow(c, 0.55) * Math.pow(p, 0.45); if (!best || s > best.s) best = { s, c, p }
  }
  const ratio = inkLen / o.len
  const amt = ratio < 0.7 ? Math.pow(ratio / 0.7, 1.3) : ratio > 1.45 ? Math.max(0.35, 1 - (ratio - 1.45) * 0.9) : 1
  const score = clamp(Math.round(100 * Math.pow(best.s, 1.25) * amt - blobs * 5), 0, 100)
  return { score, cov: best.c, prec: best.p, amt, ratio, blobs }
}

// ---------- 顔（Canvas で描く。3D の顔・アイコン・結果画像で共用）
function drawFace(x, id, mood, size, full) {
  const c = CUSTOMERS[id], k = size / 100
  x.save(); x.scale(k, k); x.lineCap = 'round'; x.lineJoin = 'round'
  if (full) {
    x.fillStyle = '#2a2140'; x.beginPath(); x.arc(50, 50, 50, 0, 7); x.fill()
    if (c.style === 'twin') { x.fillStyle = c.hair; for (const s of [-1, 1]) { x.beginPath(); x.arc(50 + s * 38, 62, 12, 0, 7); x.fill() } }
    x.fillStyle = mood === 'mad' ? mix(c.skin, '#ff5a4a', 0.35) : c.skin; x.beginPath(); x.ellipse(50, 56, 34, 36, 0, 0, 7); x.fill()
    x.fillStyle = c.hair
    if (c.style === 'twin' || c.style === 'hachi') { x.beginPath(); x.ellipse(50, 40, 35, 22, 0, Math.PI, 0); x.fill(); x.fillRect(15, 38, 8, 18); x.fillRect(77, 38, 8, 18) }
    if (c.style === 'bald') { for (const s of [-1, 1]) { x.beginPath(); x.ellipse(50 + s * 32, 52, 7, 10, 0, 0, 7); x.fill() } }
    if (c.style === 'perm') { for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; x.beginPath(); x.arc(50 + Math.cos(a) * 30, 44 + Math.sin(a) * 22, 9, 0, 7); x.fill() } }
    if (c.style === 'cap') { x.fillStyle = '#d7392f'; x.beginPath(); x.ellipse(50, 36, 34, 20, 0, Math.PI, 0); x.fill(); x.fillRect(40, 30, 50, 9) }
    if (c.style === 'hat') { x.fillStyle = '#e8d28a'; x.beginPath(); x.ellipse(50, 30, 46, 10, 0, 0, 7); x.fill(); x.fillRect(28, 8, 44, 22); x.fillStyle = '#2fa585'; x.fillRect(28, 22, 44, 6) }
    if (c.style === 'hachi') { x.fillStyle = '#fff'; x.fillRect(16, 32, 68, 8); x.beginPath(); x.ellipse(86, 34, 7, 5, 0.5, 0, 7); x.fill() }
  }
  const ink = '#2a1a12'
  x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 3.4
  const L2 = (a, b, c2, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke() }
  // 眉
  if (mood === 'mad') { x.lineWidth = 4.5; L2(28, 36, 43, 43); L2(72, 36, 57, 43) }
  else if (mood === 'huh') { L2(29, 37, 42, 36); x.beginPath(); x.moveTo(58, 33); x.quadraticCurveTo(65, 27, 72, 31); x.stroke() }
  else if (mood === 'wow') { x.beginPath(); x.moveTo(29, 33); x.quadraticCurveTo(35, 27, 42, 32); x.moveTo(58, 32); x.quadraticCurveTo(65, 27, 71, 33); x.stroke() }
  else L2(30, 37, 42, 36), L2(58, 36, 70, 37)
  // 目
  x.lineWidth = 3.4
  if (c.shades) {
    x.fillStyle = '#121212'; roundRect(x, 24, 40, 22, 13, 5); x.fill(); roundRect(x, 54, 40, 22, 13, 5); x.fill(); L2(46, 45, 54, 45)
    x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(28, 42, 6, 3); x.fillRect(58, 42, 6, 3); x.fillStyle = ink
    if (mood === 'mad') { x.strokeStyle = '#d7392f'; x.lineWidth = 3; x.beginPath(); x.moveTo(74, 18); x.lineTo(80, 24); x.moveTo(80, 18); x.lineTo(74, 24); x.stroke(); x.strokeStyle = ink }
  } else if (mood === 'wow') {
    for (const ex of [36, 64]) { x.fillStyle = ink; x.beginPath(); x.arc(ex, 46, 7, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(ex - 2, 43.5, 2.6, 0, 7); x.fill(); x.beginPath(); x.arc(ex + 2.5, 48.5, 1.3, 0, 7); x.fill() }
  } else if (mood === 'ok') { x.beginPath(); x.arc(36, 48, 5, Math.PI * 1.1, Math.PI * 1.9); x.moveTo(59, 46); x.arc(64, 48, 5, Math.PI * 1.1, Math.PI * 1.9); x.stroke() }
  else if (mood === 'mad') { x.lineWidth = 4; L2(30, 46, 42, 49); L2(70, 46, 58, 49) }
  else if (mood === 'look') { x.lineWidth = 4; L2(31, 47, 41, 47); L2(59, 47, 69, 47) }
  else if (mood === 'huh') { x.beginPath(); x.arc(36, 47, 3.2, 0, 7); x.fill(); x.beginPath(); x.arc(64, 46, 5, 0, 7); x.lineWidth = 2.6; x.stroke(); x.beginPath(); x.arc(64, 46, 1.6, 0, 7); x.fill() }
  else { x.beginPath(); x.arc(36, 47, 3.6, 0, 7); x.fill(); x.beginPath(); x.arc(64, 47, 3.6, 0, 7); x.fill() }
  // ほっぺ
  if (mood === 'wow' || mood === 'ok' || (id === 'jk' && mood !== 'mad')) { x.fillStyle = 'rgba(255,110,120,.45)'; x.beginPath(); x.ellipse(27, 58, 6, 3.6, 0, 0, 7); x.ellipse(73, 58, 6, 3.6, 0, 0, 7); x.fill() }
  // 口
  x.fillStyle = '#7a1e18'; x.strokeStyle = ink; x.lineWidth = 3
  if (mood === 'wow') { x.beginPath(); x.moveTo(38, 63); x.quadraticCurveTo(50, 84, 62, 63); x.closePath(); x.fill(); x.fillStyle = '#ff8f8f'; x.beginPath(); x.ellipse(50, 73, 6, 3, 0, 0, 7); x.fill() }
  else if (mood === 'ok') { x.beginPath(); x.moveTo(40, 64); x.quadraticCurveTo(50, 73, 60, 64); x.stroke() }
  else if (mood === 'talk') { x.beginPath(); x.ellipse(50, 67, 6, 5, 0, 0, 7); x.fill() }
  else if (mood === 'look') { x.beginPath(); x.ellipse(50, 67, 3, 3, 0, 0, 7); x.fill() }
  else if (mood === 'huh') { x.beginPath(); x.moveTo(40, 68); x.quadraticCurveTo(45, 63, 50, 68); x.quadraticCurveTo(55, 73, 60, 68); x.stroke(); x.fillStyle = '#7fc6ff'; x.beginPath(); x.moveTo(80, 28); x.quadraticCurveTo(74, 40, 80, 42); x.quadraticCurveTo(86, 40, 80, 28); x.fill() }
  else if (mood === 'mad') { x.beginPath(); x.moveTo(36, 72); x.lineTo(40, 62); x.lineTo(60, 62); x.lineTo(64, 72); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.fillRect(41, 62, 18, 3.5) }
  else { x.beginPath(); x.moveTo(43, 66); x.quadraticCurveTo(50, 70, 57, 66); x.stroke() }
  if (c.stache) { x.fillStyle = id === 'jii' ? '#eee' : '#2a2420'; x.beginPath(); x.moveTo(50, 58); x.quadraticCurveTo(38, 54, 30, 63); x.quadraticCurveTo(40, 62, 50, 61); x.quadraticCurveTo(60, 62, 70, 63); x.quadraticCurveTo(62, 54, 50, 58); x.fill() }
  if (mood === 'mad' && !c.shades) { x.strokeStyle = '#d7392f'; x.lineWidth = 3; x.beginPath(); x.moveTo(74, 18); x.quadraticCurveTo(77, 22, 80, 18); x.moveTo(74, 24); x.quadraticCurveTo(77, 20, 80, 24); x.stroke() }
  x.restore()
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath() }
function mix(a, b, k) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join('') }
const faceUrlCache = {}
function faceUrl(id, mood = 'normal') { const key = id + mood; if (!faceUrlCache[key]) { const c = document.createElement('canvas'); c.width = c.height = 128; drawFace(c.getContext('2d'), id, mood, 128, true); faceUrlCache[key] = c.toDataURL() } return faceUrlCache[key] }

// ---------- 3D
const renderer = new THREE.WebGLRenderer({ canvas: $('#world'), antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
scene.background = new THREE.Color('#1b1430'); scene.fog = new THREE.Fog('#1b1430', 10, 30)
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80)
scene.add(new THREE.HemisphereLight('#ffe2c0', '#3a2a50', 1.6))
const key = new THREE.DirectionalLight('#fff1dc', 1.7); key.position.set(2, 8, 5); scene.add(key)
const warm = new THREE.PointLight('#ff9a4a', 9, 9, 1.6); warm.position.set(0, 2.2, -2.2); scene.add(warm)

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o })
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent = scene) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m }

// 床・屋台・通り
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), lam('#2a2230')); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor)
const woodTex = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#8a5a2e'; x.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(60,30,10,${0.1 + Math.random() * 0.2})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const y = Math.random() * h; x.moveTo(0, y); x.bezierCurveTo(w / 3, y + 4, w * 2 / 3, y - 4, w, y + 2); x.stroke() } })
box(7.2, 1.25, 5, lam('#ffffff', { map: woodTex }), 0, FLOOR_Y + 0.6, 0)
const steelTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#34343a'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '20,16,14' : '90,86,90'},${0.05 + Math.random() * 0.12})`; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 22, 2 + Math.random() * 8, Math.random() * 3, 0, 7); x.fill() }
})
const teppan = box(6.2, 0.12, 4.3, new THREE.MeshStandardMaterial({ color: '#ffffff', map: steelTex, roughness: 0.45, metalness: 0.35 }), 0, -0.06, 0)
box(6.4, 0.18, 0.12, lam('#26262b'), 0, 0.02, 2.2); box(6.4, 0.18, 0.12, lam('#26262b'), 0, 0.02, -2.2)
// コテ（ヘラ）
const kote = new THREE.Group(); box(0.7, 0.02, 0.5, new THREE.MeshStandardMaterial({ color: '#c9c9cf', metalness: 0.6, roughness: 0.35 }), 0, 0, 0, kote); box(0.12, 0.08, 0.8, lam('#5a3a1e'), 0, 0.06, 0.6, kote)
kote.position.set(2.45, 0.03, 0.9); kote.rotation.y = -0.4; scene.add(kote)
// ソースの壺とマヨの予備
const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.5, 18), lam('#3a2416')); pot.position.set(-2.5, 0.25, -1.3); scene.add(pot)
const potTop = new THREE.Mesh(new THREE.CircleGeometry(0.28, 18), lam('#1a0c06')); potTop.rotation.x = -Math.PI / 2; potTop.position.set(-2.5, 0.505, -1.3); scene.add(potTop)
// 柱・梁・のれん・ちょうちん
const postMat = lam('#5c3a1c')
for (const s of [-1, 1]) box(0.16, 4.3, 0.16, postMat, s * 3.5, FLOOR_Y + 2.15, -2.55)
box(7.3, 0.18, 0.2, postMat, 0, 2.95, -2.55)
const norenTex = canvasTex(1024, 256, (x, w, h) => { x.fillStyle = '#25336b'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < w; i += 6) x.fillRect(i, 0, 2, h); drawNorenText(x, w, h) })
function drawNorenText(x, w, h) { x.fillStyle = '#fff6d8'; x.font = `150px 'Dela Gothic One','Zen Maru Gothic','Hiragino Sans',sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; const s = 'お好み焼'; for (let i = 0; i < 4; i++) x.fillText(s[i], w * (i + 0.5) / 4, h * 0.52) }
const noren = new THREE.Group(); scene.add(noren)
for (let i = 0; i < 4; i++) {
  const g = new THREE.PlaneGeometry(1.7, 0.95, 1, 4), t = norenTex.clone(); t.needsUpdate = true; t.repeat.set(0.25, 1); t.offset.set(i * 0.25, 0)
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); m.position.set(-2.62 + i * 1.75, 2.42, -2.48); noren.add(m)
}
function chochinTex() { return canvasTex(256, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7a0e0e'); g.addColorStop(0.5, '#ff4a2a'); g.addColorStop(1, '#7a0e0e'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(60,0,0,.5)'; x.lineWidth = 3; for (let y = 12; y < h; y += 18) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke() } x.fillStyle = '#1a0a08'; x.fillRect(0, 0, w, 18); x.fillRect(0, h - 18, w, 18); x.fillStyle = '#ffe9b0'; x.font = `110px 'Dela Gothic One','Zen Maru Gothic','Hiragino Sans',sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('祭', w / 4, h / 2); x.fillText('祭', w * 3 / 4, h / 2) }) }
const chTex = chochinTex(), chochins = []
for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 14), new THREE.MeshBasicMaterial({ map: chTex })); m.scale.y = 1.3; m.position.set(s * 3.05, 2.2, -2.4); scene.add(m); chochins.push(m) }
// 奥の屋台の列（光る提灯の列）
const lampMat = new THREE.MeshBasicMaterial({ color: '#ffb35a' }), lampGeo = new THREE.SphereGeometry(0.16, 8, 6)
const STALL_COL = ['#c8383a', '#2f7fbf', '#e0a020', '#3f9b4a', '#b0408a']
for (let i = 0; i < 9; i++) {
  const x = -16 + i * 4, z = -10 - (i % 2) * 1.5, col = STALL_COL[i % 5]
  box(3.2, 1.6, 2, lam('#4a3020'), x, FLOOR_Y + 0.8, z)
  const aw = box(3.5, 0.12, 2.4, lam(col), x, FLOOR_Y + 2.7, z + 0.2); aw.rotation.x = 0.15
  for (const s of [-1, 1]) box(0.1, 2.7, 0.1, postMat, x + s * 1.6, FLOOR_Y + 1.35, z + 1.1)
  for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(lampGeo, lampMat); l.position.set(x - 1.2 + k * 0.8, FLOOR_Y + 2.45, z + 1.3); scene.add(l) }
}
// 星
{ const g = new THREE.BufferGeometry(), p = []; for (let i = 0; i < 160; i++) { const a = Math.random() * Math.PI - Math.PI, r = 30 + Math.random() * 10; p.push(Math.cos(a) * r, 6 + Math.random() * 18, Math.sin(a) * r - 6) } g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff3c8', size: 0.12, fog: false }))) }

// お好み焼き本体
const topC = document.createElement('canvas'); topC.width = topC.height = 512
function paintTop() {
  const x = topC.getContext('2d'), r = rng(42), W = 512
  const g = x.createRadialGradient(256, 256, 60, 256, 256, 256); g.addColorStop(0, '#d39a52'); g.addColorStop(0.85, '#c07e3c'); g.addColorStop(1, '#8a5222'); x.fillStyle = g; x.fillRect(0, 0, W, W)
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(110,60,20,${0.15 + r() * 0.25})`; x.beginPath(); x.arc(r() * W, r() * W, 3 + r() * 12, 0, 7); x.fill() }
  // ソース（ふちが波打つ）
  x.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, rr = 228 + Math.sin(a * 5) * 7 + Math.sin(a * 11 + 1) * 4; const px = 256 + Math.cos(a) * rr, py = 256 + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py) } x.closePath()
  const sg = x.createRadialGradient(220, 210, 20, 256, 256, 240); sg.addColorStop(0, '#6e3416'); sg.addColorStop(1, '#4a200c'); x.fillStyle = sg; x.fill()
  x.strokeStyle = 'rgba(255,220,180,.18)'; x.lineWidth = 6; for (let i = 0; i < 7; i++) { x.beginPath(); const a = r() * 6, rr = 60 + r() * 140; x.arc(256, 256, rr, a, a + 0.5 + r() * 0.6); x.stroke() }
  for (let i = 0; i < 130; i++) { const a = r() * 7, rr = Math.sqrt(r()) * 222; x.fillStyle = r() < 0.75 ? '#3f8a2a' : '#6fb23a'; x.fillRect(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr, 2 + r() * 3, 2 + r() * 2) }
}
paintTop()
const topTex = new THREE.CanvasTexture(topC); topTex.colorSpace = THREE.SRGBColorSpace
const oko = new THREE.Group(); scene.add(oko)
const okoTop = new THREE.Mesh(new THREE.CircleGeometry(RW, 64), new THREE.MeshLambertMaterial({ map: topTex })); okoTop.rotation.x = -Math.PI / 2; okoTop.position.y = TOP; oko.add(okoTop)
const okoSide = new THREE.Mesh(new THREE.CylinderGeometry(RW, RW * 1.03, TOP, 64, 1, true), lam('#a8682c')); okoSide.position.y = TOP / 2; oko.add(okoSide)
const okoBot = new THREE.Mesh(new THREE.CircleGeometry(RW * 1.03, 48), lam('#6a3a14')); okoBot.rotation.x = Math.PI / 2; okoBot.position.y = 0.002; oko.add(okoBot)
// マヨの層（影・クリーム・表示用）
const mk = () => { const c = document.createElement('canvas'); c.width = c.height = INK_PX; return c }
const shC = mk(), crC = mk(), inkC = mk(), guideC = mk()
const inkTex = new THREE.CanvasTexture(inkC); inkTex.colorSpace = THREE.SRGBColorSpace
const inkPlane = new THREE.Mesh(new THREE.PlaneGeometry(2 * INK_EXT * RW, 2 * INK_EXT * RW), new THREE.MeshBasicMaterial({ map: inkTex, transparent: true, depthWrite: false }))
inkPlane.rotation.x = -Math.PI / 2; inkPlane.position.y = TOP + 0.004; inkPlane.renderOrder = 2; oko.add(inkPlane)
const guideTex = new THREE.CanvasTexture(guideC); guideTex.colorSpace = THREE.SRGBColorSpace
const guidePlane = new THREE.Mesh(inkPlane.geometry, new THREE.MeshBasicMaterial({ map: guideTex, transparent: true, depthWrite: false, opacity: 0 }))
guidePlane.rotation.x = -Math.PI / 2; guidePlane.position.y = TOP + 0.008; guidePlane.renderOrder = 3; oko.add(guidePlane)
let inkDirty = false
const toPx = u => (u + INK_EXT) * PXU

// 湯気
const steamTex = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h) })
const steam = []
for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 })); scene.add(sp); steam.push({ sp, life: 1 + i / 18 * 2.4, max: 2.4, x: 0, z: 0 }) }
function respawnSteam(s, r) {
  const a = r() * Math.PI * 2, rr = RW * (1.05 + r() * 0.9); s.x = Math.cos(a) * rr; s.z = Math.min(1.2, Math.sin(a) * rr * 0.8); if (Math.abs(s.x) > 2.8) s.x *= 0.7
  s.life = 0; s.max = 1.8 + r() * 1.4
}

// マヨのボトル（先がなぞる位置に来る）
const bottle = new THREE.Group(), bottleBody = new THREE.Group(); bottle.add(bottleBody); scene.add(bottle)
const mayoMat = new THREE.MeshLambertMaterial({ color: '#fff0b0', transparent: true, opacity: 0.95 })
const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.85, 18), mayoMat); bb.position.y = 0.62; bottleBody.add(bb)
const bsh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mayoMat); bsh.position.y = 1.04; bottleBody.add(bsh)
const capMat = lam('#d7392f')
const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 14), capMat); bc.position.y = 1.2; bottleBody.add(bc)
const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.18, 18, 1, true), lam('#d7392f')); band.position.y = 0.55; bottleBody.add(band)
const noz = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 10), capMat); noz.rotation.x = Math.PI; noz.position.y = 0.11; bottle.add(noz)
const nozCap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 14), capMat); nozCap.position.y = 0.25; bottle.add(nozCap)
bottle.rotation.set(0.35, 0, -0.45, 'YXZ'); bottle.scale.setScalar(1.05)
const bottlePos = new THREE.Vector3(1.9, 0.9, 1.2), bottleTgt = new THREE.Vector3()

// お客さん（6人を最初に作り、出番の人だけ見せる）
const custs = {}
function makeCustomer(id) {
  const c = CUSTOMERS[id], g = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group()
  const skin = lam(c.skin), shirt = lam(c.shirt), pants = lam(c.pants), hair = lam(c.hair)
  for (const s of [-1, 1]) box(0.24, 0.9, 0.26, pants, s * 0.16, 0.45, 0, g)
  g.add(body); body.position.y = 0.9
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.9, 12), shirt); torso.position.y = 0.45; body.add(torso)
  const arms = []
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.44, 0.8, 0); box(0.15, 0.7, 0.16, shirt, 0, -0.32, 0, a); const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin); hand.position.y = -0.7; a.add(hand); body.add(a); arms.push(a) }
  if (c.chain) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), lam('#e8c040')); ch.rotation.x = Math.PI / 2 - 0.3; ch.position.set(0, 0.84, 0.06); body.add(ch) }
  head.position.y = 1.3; head.scale.setScalar(1.25); body.add(head)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), skin); head.add(skull)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin); e.position.set(s * 0.35, 0, 0); head.add(e) }
  const faceTex = new THREE.CanvasTexture(document.createElement('canvas')); faceTex.image.width = faceTex.image.height = 256; faceTex.colorSpace = THREE.SRGBColorSpace
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.364, 24, 16, Math.PI / 2 - 0.95, 1.9, 0.6, 1.5), new THREE.MeshLambertMaterial({ map: faceTex, transparent: true, depthWrite: false }))
  face.rotation.y = 0; head.add(face)
  const cap = (r, tl) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, tl), hair)
  if (c.style === 'twin' || c.style === 'hachi') { const h = cap(0.38, 1.05); h.rotation.x = -0.25; head.add(h) }
  if (c.style === 'twin') for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), hair); t.scale.y = 1.5; t.position.set(s * 0.44, -0.12, -0.08); head.add(t) }
  if (c.style === 'bald') for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), hair); t.position.set(s * 0.32, 0.02, -0.08); head.add(t) }
  if (c.style === 'perm') for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, t = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hair); t.position.set(Math.cos(a) * 0.27, 0.22 + (i % 2) * 0.06, Math.sin(a) * 0.27 - 0.04); head.add(t) }
  if (c.style === 'perm') { const t = cap(0.37, 0.9); head.add(t) }
  if (c.style === 'cap') { const cg = new THREE.Group(); cg.rotation.x = -0.45; head.add(cg); const k = new THREE.Mesh(new THREE.SphereGeometry(0.385, 20, 10, 0, Math.PI * 2, 0, 1.0), lam('#d7392f')); cg.add(k); box(0.4, 0.03, 0.3, lam('#d7392f'), 0, 0.2, 0.38, cg) }
  if (c.style === 'hat') { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.03, 24), lam('#e8d28a')); br.position.y = 0.2; head.add(br); const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.26, 18), lam('#e8d28a')); cr.position.y = 0.33; head.add(cr); const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.07, 18, 1, true), lam('#2fa585')); bd.position.y = 0.24; head.add(bd) }
  if (c.style === 'hachi') { const t = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.045, 6, 24), lam('#ffffff')); t.rotation.x = Math.PI / 2 + 0.25; t.position.y = 0.14; head.add(t); const kn = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lam('#ffffff')); kn.position.set(0.3, 0.1, -0.24); head.add(kn) }
  g.position.set(-6, FLOOR_Y, CUST_Z); g.visible = false; scene.add(g)
  const o = { id, g, body, head, arms, face, faceTex, skull, skinCol: new THREE.Color(c.skin), mood: '', st: 'off', t: 0, x: -6 }
  setFace(o, 'normal')
  return o
}
function setFace(o, mood) {
  if (o.mood === mood) return; o.mood = mood
  const c = o.faceTex.image, x = c.getContext('2d'); x.clearRect(0, 0, 256, 256); x.save(); x.translate(128, 128); x.scale(1.25, 1.15); x.translate(-128, -128); x.translate(28, 18); drawFace(x, o.id, mood, 200, false); x.restore(); o.faceTex.needsUpdate = true
  o.skull.material.color.copy(o.skinCol).lerp(new THREE.Color('#ff5a4a'), mood === 'mad' ? 0.35 : 0)
}
for (const id of Object.keys(CUSTOMERS)) custs[id] = makeCustomer(id)
let cur = null

// ---------- マヨを描く
function clearInk() { for (const c of [shC, crC, inkC]) c.getContext('2d').clearRect(0, 0, INK_PX, INK_PX); inkDirty = true }
function composeInk() { const x = inkC.getContext('2d'); x.clearRect(0, 0, INK_PX, INK_PX); x.drawImage(shC, 0, 0); x.drawImage(crC, 0, 0); inkTex.needsUpdate = true; inkDirty = false }
function inkSeg(u0, v0, u1, v1, w) {
  const s = shC.getContext('2d'), c = crC.getContext('2d'), W = w * PXU, o = 0.008 * PXU
  s.lineCap = c.lineCap = 'round'
  s.strokeStyle = 'rgba(70,35,10,.5)'; s.lineWidth = W * 1.25; s.beginPath(); s.moveTo(toPx(u0) + o * 0.6, toPx(v0) + o); s.lineTo(toPx(u1) + o * 0.6, toPx(v1) + o); s.stroke()
  c.strokeStyle = '#f7e7b8'; c.lineWidth = W; c.beginPath(); c.moveTo(toPx(u0), toPx(v0)); c.lineTo(toPx(u1), toPx(v1)); c.stroke()
  c.strokeStyle = '#fff8e2'; c.lineWidth = W * 0.62; c.beginPath(); c.moveTo(toPx(u0) - W * 0.06, toPx(v0) - W * 0.1); c.lineTo(toPx(u1) - W * 0.06, toPx(v1) - W * 0.1); c.stroke()
  c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = W * 0.22; c.beginPath(); c.moveTo(toPx(u0) - W * 0.16, toPx(v0) - W * 0.22); c.lineTo(toPx(u1) - W * 0.16, toPx(v1) - W * 0.22); c.stroke()
  inkDirty = true
}
function inkDot(u, v, r) {
  const s = shC.getContext('2d'), c = crC.getContext('2d'), R = r * PXU, X = toPx(u), Y = toPx(v), o = 0.01 * PXU
  s.fillStyle = 'rgba(70,35,10,.5)'; s.beginPath(); s.arc(X + o, Y + o * 1.4, R * 1.12, 0, 7); s.fill()
  const g = c.createRadialGradient(X - R * 0.3, Y - R * 0.35, R * 0.1, X, Y, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#fff6da'); g.addColorStop(1, '#ead6a0')
  c.fillStyle = g; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill(); inkDirty = true
}
function addSamples(u0, v0, u1, v1) {
  const d = Math.hypot(u1 - u0, v1 - v0); S.inkLen += d
  S.segAcc = (S.segAcc || 0) + d
  while (S.segAcc >= 0.02) { S.segAcc -= 0.02; const k = d > 0 ? 1 - S.segAcc / d : 1; S.ink.push([u0 + (u1 - u0) * clamp(k, 0, 1), v0 + (v1 - v0) * clamp(k, 0, 1)]) }
}
function blob(u, v, r, big) {
  inkDot(u, v, r)
  if (big) { const rr = S.jr; for (let k = 0; k < 3; k++) { const a = rr() * 7, d = r * (0.8 + rr() * 0.5); inkDot(u + Math.cos(a) * d, v + Math.sin(a) * d, r * (0.25 + rr() * 0.2)) } }
  S.ink.push([u, v]); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; S.ink.push([u + Math.cos(a) * r * 0.5, v + Math.sin(a) * r * 0.5]) } for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; S.ink.push([u + Math.cos(a) * r, v + Math.sin(a) * r]) }
  S.inkLen += r * 2.5
}
function drawGuide(id) {
  const x = guideC.getContext('2d'); x.clearRect(0, 0, INK_PX, INK_PX); x.lineCap = x.lineJoin = 'round'
  for (const [col, w] of [['rgba(40,20,5,.55)', 0.07], ['rgba(255,255,255,.95)', 0.032]]) {
    x.strokeStyle = col; x.lineWidth = w * PXU
    for (const st of ORD[id].strokes) { x.beginPath(); st.forEach(([u, v], i) => i ? x.lineTo(toPx(u), toPx(v)) : x.moveTo(toPx(u), toPx(v))); x.stroke() }
  }
  guideTex.needsUpdate = true
}

// ---------- 遊びの流れ
function pickDishes(r) {
  const pick = a => a[Math.floor(r() * a.length)]
  const l2 = ['cat', 'fuji', 'octo']; for (let i = l2.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l2[i], l2[j]] = [l2[j], l2[i]] }
  const last = pick(['love', 'tencho'])
  const ids = [pick(['heart', 'star', 'smile']), l2[0], l2[1], last]
  const ds = ids.map(id => ({ id, cust: pick(ORD[id].cust), shake: ORD[id].shake || 0 }))
  const kowaAt = last === 'love' || r() < 0.45 ? 1 + Math.floor(r() * 2) : -1
  if (kowaAt > 0) { ds[kowaAt].cust = 'kowa'; ds[kowaAt].shake = KOWA_SHAKE }
  return ds
}
function startGame(seed) {
  S.seed = seed ?? (Math.random() * 1e9 | 0); S.rnd = rng(S.seed)
  S.dishes = pickDishes(S.rnd); S.results = []; S.result = null; S.di = -1; S.mode = 'play'
  try { S.tut = !localStorage.getItem('mm.tut') } catch (e) { S.tut = true }
  document.body.classList.remove('party', 'gloom')
  go('play'); nextDish()
}
function nextDish() {
  if (S.mode === 'play' && S.di + 1 >= DISHES) return finishGame()
  S.di++
  const d = S.mode === 'play' ? S.dishes[S.di] : demoDish()
  S.dish = d; S.ord = ORD[d.id]
  clearInk(); S.mayo = 1; S.blobs = 0; S.ink = []; S.inkLen = 0; S.segAcc = 0; S.doneReq = false; S.endWhy = null; S.line = ''; S.res = null
  Object.assign(nib, { on: false, dwell: 0, w: W_BASE, any: false }); inp.q.length = 0
  S.jr = rng((S.seed || 1) * 31 + S.di * 977 + 5)
  drawGuide(d.id); guidePlane.material.opacity = 0
  // お客さんの入れ替え
  if (cur && cur.id !== d.cust) { cur.st = 'leave'; cur.t = 0 }
  const nc = custs[d.cust]; nc.st = 'arrive'; nc.t = 0; nc.x = -5.5; nc.g.visible = true; setFace(nc, 'normal'); cur = nc
  S.ph = 'arrive'; S.pt = 0; S.flip = 0
  if (!S.quiet) Snd.sfx('flip')
  S.botPlan = S.bot ? makeBotPlan(S.bot, d) : null
  hudPips(); showOrder(false)
}
let demoN = 0
function demoDish() { const ids = ['heart', 'cat', 'smile', 'fuji', 'star', 'octo', 'love', 'tencho'], id = ids[demoN++ % ids.length]; const o = ORD[id]; return { id, cust: o.cust[0], shake: 0 } }
function setPhase(p) { S.ph = p; S.pt = 0 }

function update() {
  S.frame++; S.t += STEP
  if (S.mode === 'play' || S.mode === 'demo') phaseUpdate()
  if (S.view === 'result') revealUpdate()
  animWorld()
}
function phaseUpdate() {
  S.pt += STEP; const p = S.ph, demo = S.mode === 'demo'
  if (p === 'arrive') {
    if (S.pt >= PH.arrive) {
      if (demo) { setPhase('draw'); S.botPlan = makeBotPlan('good', S.dish); return }
      setPhase('order'); setFace(cur, 'talk'); showOrder(true); if (!S.quiet) Snd.voice(CUSTOMERS[cur.id].voice, 'talk')
    }
  } else if (p === 'order') {
    if (S.pt > 0.5) setFace(cur, 'normal')
    if (S.pt >= PH.order) { setPhase('preview'); if (!S.quiet) Snd.sfx('show'); banner(T('remember'), fmt(S.lang === 'ja' ? '{s}秒' : '{s}s', { s: S.ord.prev.toFixed(1) })) }
  } else if (p === 'preview') {
    const k = S.pt, pv = S.ord.prev
    guidePlane.material.opacity = k < 0.1 ? k / 0.1 : k > pv - 0.18 ? Math.max(0, (pv - k) / 0.18) : 1
    if (S.pt >= pv) {
      guidePlane.material.opacity = 0; setPhase('draw'); banner(T('go')); S.bannerUntil = S.t + 0.6; if (!S.quiet) Snd.sfx('go')
      $('#bDone').disabled = false; $('#timer').classList.add('on')
      if (S.tut && S.di === 0) { $('#tut').hidden = false; $('#tutTxt').textContent = (isTouch() ? T('tutT') : T('tutM')) + '  /  ' + T('tut2') }
      if (S.dish.shake) popAt(T('shaky'), innerWidth / 2, innerHeight * 0.3, true)
    }
  } else if (p === 'draw') {
    if (S.botPlan) botStep()
    drawStep()
    if (demo) { if (S.botPlan && S.botPlan.i >= S.botPlan.f.length) { setPhase('react'); setFace(cur, 'wow') } return }
    const left = S.ord.draw - S.pt
    if (left < 3 && Math.ceil(left) !== Math.ceil(left + STEP) && !S.quiet) Snd.sfx('tick')
    if (S.doneReq) endDraw('done')
    else if (left <= 0) endDraw('time')
    else if (S.mayo <= 0 && !inp.down) endDraw('mayo')
    else if (S.mayo <= 0) { S.endT += STEP; if (S.endT > 0.5) endDraw('mayo') }
  } else if (p === 'judge') {
    if (S.pt > 0.45) guidePlane.material.opacity = Math.min(0.55, (S.pt - 0.45) * 2)
    if (S.pt >= PH.judge) react()
  } else if (p === 'react') {
    if (S.pt >= (demo ? 1.6 : PH.react)) { guidePlane.material.opacity = 0; nextDish() }
  }
}
function endDraw(why) {
  if (nib.on) endStroke()
  inp.down = false; inp.q.length = 0; Snd.squeeze(0)
  S.endWhy = why; setPhase('judge'); $('#bDone').disabled = true; $('#timer').classList.remove('on'); $('#tut').hidden = true
  if (S.tut && S.di === 0) { try { localStorage.setItem('mm.tut', '1') } catch (e) {} S.tut = false }
  banner(why === 'time' ? T('timeUp') : why === 'mayo' ? T('mayoOut') : T('finished'))
  if (!S.quiet) Snd.sfx(why === 'done' ? 'whistle' : 'boto')
  S.res = scoreDish(S.dish.id, S.ink, S.inkLen, S.blobs)
  setFace(cur, 'look'); showOrder(false); popOrder(T('looking'), 'look')
}
function react() {
  const r = S.res, d = S.dish, c = cur.id, pick = a => a[(S.di + S.seed) % a.length]
  let mood = r.score >= 78 ? 'wow' : r.score >= 52 ? 'ok' : r.score >= 28 ? 'huh' : 'mad', line
  if (r.score === 0 && S.ink.length < 6) { mood = 'huh'; line = L(LINES.none) }
  else if (mood === 'wow') line = c === 'tencho' ? L(LINES.wowBoss) : pick(L(LINES.wow))
  else if (mood === 'ok') line = S.blobs >= 2 ? L(LINES.blob) : pick(L(LINES.ok))
  else if (mood === 'huh') line = S.blobs >= 3 ? L(LINES.blob) : L(S.ord.huh)
  else line = c === 'tencho' ? L(LINES.madBoss) : c === 'kowa' ? L(LINES.kowaMad) : pick(L(LINES.mad))
  S.mood = mood; S.line = line
  setFace(cur, mood); cur.st = 'react'; cur.t = 0; cur.react = mood
  popOrder(line, mood)
  if (!S.quiet) { Snd.voice(CUSTOMERS[c].voice, mood); Snd.sfx(mood === 'wow' ? 'cheer' : mood === 'ok' ? 'ding' : mood === 'huh' ? 'cricket' : 'boo', mood === 'ok' ? 8 : 1) }
  S.results.push({ ...r, id: d.id, cust: c, mood, line, snap: snapDish() })
  hudPips()
  setPhase('react')
}
function finishGame() {
  const avg = Math.round(S.results.reduce((a, r) => a + r.score, 0) / S.results.length)
  const ri = RANKS.findIndex(k => avg >= k.min)
  S.result = { avg, ri, rank: RANKS[ri], dishes: S.results }
  S.mode = 'over'; if (cur) { cur.st = 'leave'; cur.t = 0 }
  buildResult(); go('result'); S.rt = 0; S.shown = 0
}

// ---------- 入力（指・マウス）
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), hit = new THREE.Vector3(), ndc = new THREE.Vector2()
function screenToUV(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(plane, hit)) return null; return { u: hit.x / RW, v: hit.z / RW } }
function uvToScreen(u, v) { const p = new THREE.Vector3(u * RW, TOP, v * RW).project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight } }
function onDown(e) {
  if (e.target.closest('button')) return
  e.preventDefault(); Snd.init()
  if (S.ph !== 'draw' || S.mode !== 'play' || S.bot) return
  inp.down = true; inp.id = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId) } catch (er) {}
  const p = screenToUV(e.clientX, e.clientY); if (p) inp.q.push(p)
}
function onMove(e) {
  if (!inp.down || e.pointerId !== inp.id) return
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]
  for (const ev of (evs.length ? evs : [e])) { const p = screenToUV(ev.clientX, ev.clientY); if (p) inp.q.push(p) }
}
function onUp(e) { if (!inp.down || (e.pointerId !== undefined && e.pointerId !== inp.id)) return; inp.down = false; inp.q.push({ up: true }) }

// 1フレーム分のマヨ処理（固定60Hz）
function jitter() {
  const A = S.dish.shake; if (!A) return [0, 0]
  const t = S.pt, r = S.jr
  return [A * (Math.sin(t * 21) * 0.6 + Math.sin(t * 34 + 1.3) * 0.4 + (r() - 0.5) * 0.5), A * (Math.sin(t * 17 + 2) * 0.6 + Math.sin(t * 29 + 0.4) * 0.4 + (r() - 0.5) * 0.5)]
}
function drawStep() {
  const q = inp.q.splice(0), [jx, jy] = jitter(); let moved = 0
  for (const p of q) {
    if (p.up) { endStroke(); continue }
    const u = p.u + jx, v = p.v + jy
    if (!nib.on) { startStroke(u, v); continue }
    const d = Math.hypot(u - nib.u, v - nib.v); if (d < 0.002) continue
    putInk(nib.u, nib.v, u, v); moved += d; nib.u = u; nib.v = v
  }
  if (nib.on) {
    const still = moved < DWELL_MOVE
    // 手の震え: 止まっていても線が揺れる
    if (still && S.dish.shake && S.mayo > 0) { const u = nib.bu + jx, v = nib.bv + jy; putInk(nib.u, nib.v, u, v); nib.u = u; nib.v = v }
    if (!still) { nib.bu = nib.u - jx; nib.bv = nib.v - jy }
    const sp = moved * 60, wt = clamp(0.086 - sp * 0.026, W_MIN, W_MAX); nib.w = lerp(nib.w, wt, 0.25)
    if (still) {
      nib.dwell += STEP
      if (S.mayo > 0) { S.mayo -= 0.05 * STEP; if (nib.dwell > 0.12) inkDot(nib.u, nib.v, Math.min(BLOB_R * 0.7, nib.w * 0.5 + nib.dwell * 0.05)) }
      if (nib.dwell >= DWELL_BLOB && S.mayo > 0) { blob(nib.u, nib.v, BLOB_R, true); S.blobs++; S.mayo -= 0.07; nib.dwell = -0.35; if (!S.quiet) Snd.sfx('boto'); fxText(T('boto'), nib.u, nib.v); cur && (cur.flinch = 0.4) }
    } else nib.dwell = nib.dwell < 0 ? nib.dwell + STEP : 0
    // 残りが少ないとブピッと飛び散る
    if (S.mayo > 0 && S.mayo < 0.18 && S.jr() < 0.022) { for (let k = 0; k < 4; k++) { const a = S.jr() * 7, dd = 0.04 + S.jr() * 0.12, u = nib.u + Math.cos(a) * dd, v = nib.v + Math.sin(a) * dd; inkDot(u, v, 0.012 + S.jr() * 0.02); S.ink.push([u, v]) } S.mayo -= 0.03; if (!S.quiet) Snd.sfx('bupi', 0.7); fxText(T('bupi'), nib.u, nib.v) }
    S.mayo = Math.max(0, S.mayo)
    if (!S.quiet) Snd.squeeze(S.mayo > 0 ? clamp(sp / 2, 0.15, 1) : 0)
  }
}
function startStroke(u, v) {
  if (S.mayo <= 0) return
  nib.on = true; nib.any = true; nib.u = u; nib.v = v; nib.bu = u; nib.bv = v; nib.dwell = 0; nib.w = W_BASE
  $('#tut').hidden = true
  // 絞り始めにブリュッと出ることがある
  if (S.jr() < 0.15) { inkDot(u, v, 0.045); S.ink.push([u, v]); S.mayo -= 0.02; if (!S.quiet) Snd.sfx('bupi', 0.4) } else inkDot(u, v, W_BASE * 0.5)
  S.ink.push([u, v])
}
function endStroke() { nib.on = false; S.segAcc = 0; Snd.squeeze(0) }
function putInk(u0, v0, u1, v1) {
  if (S.mayo <= 0) return
  const R = 1.42; if (Math.hypot(u1, v1) > R || Math.hypot(u0, v0) > R) return
  const d = Math.hypot(u1 - u0, v1 - v0)
  S.mayo -= d * (nib.w / W_BASE) / (1.45 * S.ord.len)
  inkSeg(u0, v0, u1, v1, nib.w); addSamples(u0, v0, u1, v1)
  if (Math.hypot(u1, v1) > 1.02 && S.frame % 6 === 0 && !S.quiet) Snd.sfx('sizzle')
}

// ---------- 台本のボット（上手い／ふつう／雑／何もしない）
const BOTS = {
  good: { sp: 1.5, amp: 0.03, off: 0.06, sc: 0.07, rot: 0.07, skip: 0, pause: 0.05, hold: [0.15, 0.35], mem: 0.04 },
  normal: { sp: 1.3, amp: 0.05, off: 0.12, sc: 0.13, rot: 0.14, skip: 0.15, pause: 0.25, hold: [0.25, 0.7], mem: 0.08 },
  sloppy: { sp: 1.0, amp: 0.1, off: 0.25, sc: 0.3, rot: 0.4, skip: 0.45, pause: 0.5, hold: [0.4, 0.9], mem: 0.2 },
}
function makeBotPlan(kind, d) {
  const f = []; if (kind === 'idle') return { f, i: 0 }
  const P = BOTS[kind], r = rng(S.seed * 7 + S.di * 131 + kind.length * 17), ph = () => r() * 7
  const sc = 1 + (r() * 2 - 1) * P.sc, rot = (r() * 2 - 1) * P.rot, ox = (r() * 2 - 1) * P.off, oy = (r() * 2 - 1) * P.off
  const tf = ([x, y]) => [Math.cos(rot) * x * sc - Math.sin(rot) * y * sc + ox, Math.sin(rot) * x * sc + Math.cos(rot) * y * sc + oy]
  let strokes = ORD[d.id].strokes.filter(() => r() >= P.skip)
  if (kind === 'sloppy') strokes = strokes.concat([[[-0.6 + r() * 0.4, -0.5 + r()], [0.2 + r() * 0.5, -0.3 + r() * 0.8]]])
  if (!strokes.length) strokes = [ORD[d.id].strokes[0]]
  const p1 = ph(), p2 = ph(), p3 = ph(), p4 = ph(); let dist = 0
  for (const st0 of strokes) {
    // 覚え違い: 点ごとに少しずつ形が崩れる
    const st = st0.map(([x, y]) => tf([x + (r() - 0.5) * P.mem, y + (r() - 0.5) * P.mem]))
    const pauseAt = r() < P.pause ? r() : -1; let paused = false
    const pts = []; for (let i = 1; i < st.length; i++) { const [x0, y0] = st[i - 1], [x1, y1] = st[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (P.sp / 60))); for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]) }
    pts.forEach(([x, y], i) => {
      dist += P.sp / 60; const nx = P.amp * (Math.sin(dist * 2.3 + p1) * 0.6 + Math.sin(dist * 6.1 + p2) * 0.4), ny = P.amp * (Math.sin(dist * 2.7 + p3) * 0.6 + Math.sin(dist * 5.3 + p4) * 0.4)
      f.push({ u: x + nx, v: y + ny })
      if (!paused && pauseAt >= 0 && i / pts.length >= pauseAt) { paused = true; const n = Math.round((P.hold[0] + r() * (P.hold[1] - P.hold[0])) * 60); for (let k = 0; k < n; k++) f.push({ u: x + nx, v: y + ny }) }
    })
    f.push({ up: true }); for (let k = 0; k < 8; k++) f.push({ none: true })
  }
  f.push({ done: true })
  return { f, i: 0 }
}
function botStep() {
  const P = S.botPlan; if (P.i >= P.f.length) return
  const e = P.f[P.i++]
  if (e.done) { if (S.mode === 'play') S.doneReq = true; return }
  if (e.none) return
  if (e.up) { inp.down = false; inp.q.push({ up: true }); return }
  inp.down = true; inp.q.push({ u: e.u, v: e.v })
}

// ---------- 演出（お客さん・ボトル・湯気・お好み焼き）
const tmpV = new THREE.Vector3()
function animWorld() {
  const t = S.t
  // お好み焼きを返す（皿の始まり）
  if (S.ph === 'arrive' && S.pt < 0.7) { const k = S.pt / 0.7; oko.position.y = Math.sin(Math.PI * k) * 1.4; oko.rotation.x = k * Math.PI * 2; if (Math.abs(S.pt - 0.7 + STEP) < STEP / 2) burstSteam() }
  else { oko.position.y = 0; oko.rotation.x = 0 }
  // お客さん
  for (const o of Object.values(custs)) {
    if (!o.g.visible) continue; o.t += STEP
    let bob = 0
    if (o.st === 'arrive') { o.x = lerp(-5.5, 0, ease(o.t / PH.arrive)); bob = Math.abs(Math.sin(o.t * 12)) * 0.08; if (o.t >= PH.arrive) o.st = 'idle'; if (!S.quiet && S.frame % 12 === 0) Snd.sfx('step') }
    else if (o.st === 'leave') { o.x += STEP * 8; bob = Math.abs(Math.sin(o.t * 12)) * 0.08; if (o.x > 7) { o.g.visible = false; o.st = 'off' } }
    o.g.position.set(o.x, FLOOR_Y + bob, CUST_Z)
    const hx = S.view === 'play' ? -0.8 : 0
    o.body.rotation.set(0, 0, 0); o.head.rotation.set(hx, 0, 0); o.arms[0].rotation.set(0, 0, 0); o.arms[1].rotation.set(0, 0, 0); o.g.rotation.y = o.st === 'arrive' ? 0.6 : o.st === 'leave' ? -0.6 : 0
    o.body.position.y = 0.9 + Math.sin(t * 2 + o.x) * 0.01
    o.body.visible = !(S.view === 'play' && S.cam && !S.cam.head && innerWidth < innerHeight)  // 縦の小さい画面で頭が HUD に半分隠れるなら出さない（吹き出しに顔を出す）
    if (o === cur && S.ph === 'judge') { o.body.rotation.x = Math.min(0.45, S.pt * 1.2); o.head.rotation.x = hx * 0.6 }
    if (o === cur && (S.ph === 'draw' || S.ph === 'preview')) { o.body.rotation.x = 0.18 + Math.sin(t * 1.3) * 0.04; o.head.rotation.z = Math.sin(t * 0.9) * 0.08 }
    if (o.flinch > 0) { o.flinch -= STEP; o.body.rotation.x = -0.3 * o.flinch / 0.4; o.arms[0].rotation.z = 1.2 * o.flinch; o.arms[1].rotation.z = -1.2 * o.flinch }
    if (o.st === 'react') {
      const k = o.t
      if (o.react === 'wow') { o.g.position.y = FLOOR_Y + Math.abs(Math.sin(k * 9)) * 0.35; o.arms[0].rotation.z = -2.6 + Math.sin(k * 18) * 0.3; o.arms[1].rotation.z = 2.6 - Math.sin(k * 18) * 0.3 }
      else if (o.react === 'ok') { o.head.rotation.x = hx + Math.max(0, Math.sin(k * 8)) * 0.25; o.arms[1].rotation.z = 1.6 + Math.sin(k * 10) * 0.3; o.arms[1].rotation.x = -0.6 }
      else if (o.react === 'huh') { o.head.rotation.z = Math.min(0.45, k * 1.5); o.body.rotation.z = Math.min(0.12, k * 0.4); o.arms[0].rotation.x = -1.2; o.arms[0].rotation.z = -0.4 }
      else { o.g.position.x = o.x + Math.sin(k * 50) * 0.05; o.body.rotation.x = 0.35; o.arms[0].rotation.x = -1.6 + Math.sin(k * 14) * 0.9; o.arms[1].rotation.x = -1.6 - Math.sin(k * 14) * 0.9 }
    }
  }
  // ボトル
  if (S.ph === 'draw' && nib.on) { bottleTgt.set(nib.u * RW, TOP + 0.02, nib.v * RW) }
  else if (S.ph === 'draw') { bottleTgt.set(nib.any ? nib.u * RW : 0.6, TOP + 0.6, nib.any ? nib.v * RW : 0.6) }
  else bottleTgt.set(2.55, TOP + 0.25, 0.1)
  bottlePos.lerp(bottleTgt, S.ph === 'draw' ? 0.6 : 0.12); bottle.position.copy(bottlePos)
  const shake = S.ph === 'draw' && S.dish && S.dish.shake ? S.dish.shake * 0.4 : 0
  bottle.rotation.z = -0.45 + Math.sin(t * 40) * shake * 4; bottle.rotation.x = 0.35 + Math.sin(t * 33) * shake * 3
  const sq = nib.on && S.ph === 'draw' ? 0.86 + Math.sin(t * 30) * 0.02 : 1; bottleBody.scale.set(sq, 1 + (1 - sq) * 0.5, sq)
  mayoMat.opacity = 0.95; bb.scale.y = 1; bottleBody.children[0].material.color.set(S.mayo < 0.15 && S.ph === 'draw' ? '#f2e6c0' : '#fff0b0')
  // 湯気
  for (const s of steam) {
    s.life += STEP; if (s.life >= s.max) respawnSteam(s, S.demoR)
    const k = s.life / s.max; s.sp.position.set(s.x + Math.sin(k * 5 + s.z) * 0.2, 0.1 + k * 1.8, s.z); s.sp.scale.setScalar(0.4 + k * 1.0); s.sp.material.opacity = Math.sin(Math.PI * k) * (S.view === 'play' ? 0.22 : 0.35)
  }
  chochins.forEach((c, i) => { c.rotation.z = Math.sin(t * 1.4 + i) * 0.06 })
  warm.intensity = 9 + Math.sin(t * 7) * 0.6
  if (S.frame % 3 === 0 && !S.quiet) Snd.crackle()
}
function burstSteam() { for (let i = 0; i < 8; i++) { const s = steam[i]; const a = i / 8 * 6.28; s.x = Math.cos(a) * RW * 0.9; s.z = Math.sin(a) * RW * 0.9; s.life = 0; s.max = 1.4 } }

// ---------- 画面（HUD・吹き出し・帯）
function go(v) {
  S.view = v
  for (const id of ['vTitle', 'vHow', 'vPlay', 'vResult']) $('#' + id).hidden = id !== 'v' + v[0].toUpperCase() + v.slice(1)
  if (v === 'title') { S.mode = 'demo'; S.di = -1; S.bot = null; document.body.classList.remove('party', 'gloom'); nextDish() }
  if (v === 'title' || v === 'how') Snd.setTrack('title')
  if (v === 'play') { Snd.setTrack('play'); Snd.ambient(true) }
  if (v === 'result') { Snd.setTrack(null); layoutResult() }
  $('#banner').hidden = true; $('#order').hidden = true
  noren.visible = v !== 'play'
  fitCamera()
}
function hudPips() { $('#pips').innerHTML = Array.from({ length: DISHES }, (_, i) => `<div class="pip ${i < S.results.length ? 'done' : i === S.di ? 'cur' : ''}"></div>`).join('') }
function showOrder(on) {
  const el = $('#order'); if (!on || S.mode !== 'play') { el.hidden = true; return }
  const d = S.dish, o = S.ord
  const say = d.cust === 'kowa' ? fmt(L(LINES.kowaSay), { name: L(o.name) }) : L(o.say)
  el.className = 'order'; el.innerHTML = `${faceTag()}<small>${T('order')}: ${L(o.name)}</small>${say}${d.shake ? `<div class="tag"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8h2l1-4 2 8 1-4h4" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>${T('shaky')}</div>` : ''}`
  el.hidden = false
}
function popOrder(text, mood) {
  if (S.mode !== 'play') return
  const el = $('#order'); el.className = 'order big mood-' + mood; el.innerHTML = faceTag(mood === 'look' ? 'look' : mood); el.append(text); el.hidden = false
}
function faceTag(m = 'talk') { return S.cam && !S.cam.head && cur ? `<i class="fc" style="background-image:url(${faceUrl(cur.id, m)})"></i>` : '' }
function banner(main, sub) { const el = $('#banner'); if (S.mode !== 'play') return; el.innerHTML = `<b>${main}</b>${sub ? `<small>${sub}</small>` : ''}`; el.hidden = false; S.bannerUntil = S.t + 1.0 }
function popAt(text, x, y) { if (S.quiet) return; const d = document.createElement('div'); d.className = 'pop'; d.textContent = text; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 950) }
function fxText(text, u, v) { if (S.mode !== 'play') return; const p = uvToScreen(u, v); popAt(text, p.x, p.y - 20) }
function hudUpdate() {
  if (S.bannerUntil && S.t > S.bannerUntil) { $('#banner').hidden = true; S.bannerUntil = 0 }
  if (S.view !== 'play') return
  $('#bDone').style.visibility = S.ph === 'draw' && !S.bannerUntil ? '' : 'hidden'
  const left = S.ph === 'draw' ? Math.max(0, S.ord.draw - S.pt) : S.ph === 'preview' || S.ph === 'order' || S.ph === 'arrive' ? S.ord.draw : 0
  $('#timerBar').style.transform = `scaleX(${S.ord ? left / S.ord.draw : 0})`; $('#timer').classList.toggle('low', S.ph === 'draw' && left < 3)
  const g = $('#gFill'), h = 32 * clamp(S.mayo, 0, 1); g.setAttribute('y', 9 + 32 - h); g.setAttribute('height', h)
  // 吹き出しはお客さんの頭の上に
  const el = $('#order'); if (!el.hidden && cur) {
    tmpV.set(cur.g.position.x, cur.g.position.y + 3.5, CUST_Z).project(camera)
    const bw = el.offsetWidth / 2 + 8, bh = el.offsetHeight
    let x = (tmpV.x + 1) / 2 * innerWidth, y = (1 - tmpV.y) / 2 * innerHeight
    x = clamp(x, bw, Math.max(bw, innerWidth - bw)); y = clamp(y, 60 + bh, innerHeight * 0.6)
    if (S.cam && !S.cam.head) { if (innerWidth > innerHeight) { const free = (innerWidth - S.cam.px) / 2; x = Math.max(bw, free / 2) } else x = innerWidth / 2; y = 60 + bh }
    el.style.left = x + 'px'; el.style.top = y + 'px'
  }
}

// ---------- 結果
function snapDish() {
  const c = document.createElement('canvas'); c.width = c.height = 360; const x = c.getContext('2d'), E = 1.12
  x.save(); x.beginPath(); x.arc(180, 180, 180, 0, 7); x.clip()
  x.fillStyle = '#34343a'; x.fillRect(0, 0, 360, 360)
  const R = 180 / E; x.drawImage(topC, 180 - R, 180 - R, 2 * R, 2 * R)
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 6; x.beginPath(); x.arc(180, 180, R, 0, 7); x.stroke()
  composeInk(); const s = E * PXU; x.drawImage(inkC, toPx(-E), toPx(-E), 2 * s, 2 * s, 0, 0, 360, 360)
  x.restore()
  return c
}
function stampSvg(r) {
  const col = { gold: '#f5c443', red: '#d7392f', gray: '#8f8aa0', black: '#1a1a1a' }[r.tier], txt = L(r)
  const fs = S.lang === 'ja' ? (txt.length > 2 ? 30 : 38) : 18
  return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="${r.tier === 'black' ? '#fff6d8' : 'rgba(255,246,216,.92)'}" stroke="${col}" stroke-width="7"/><circle cx="50" cy="50" r="36" fill="none" stroke="${col}" stroke-width="2.5"/><text x="50" y="${S.lang === 'ja' ? 63 : 57}" text-anchor="middle" font-family="'Zen Maru Gothic','Hiragino Sans',sans-serif" font-weight="900" font-size="${fs}" fill="${col === '#f5c443' ? '#b8860b' : col}">${txt}</text></svg>`
}
function buildResult() {
  const R = S.result
  $('#grid').innerHTML = R.dishes.map((d, i) => `<div class="tile" data-i="${i}"><div class="lab">${L(ORD[d.id].name)}</div><div class="sc">${fmt(T('pts'), { n: d.score })}</div><div class="cm">${d.line}</div></div>`).join('')
  $$('#grid .tile').forEach((el, i) => el.prepend(R.dishes[i].snap))
  $('#rank').className = 'rank tier-' + R.rank.tier; $('#stamp').innerHTML = stampSvg(R.rank)
  $('#rankN').textContent = L(R.rank); $('#rankT').textContent = '「' + (S.lang === 'ja' ? R.rank.tja : R.rank.ten) + '」'; $('#rankAvg').textContent = fmt(T('resAvg'), { n: R.avg })
  $('#skip').hidden = false; $('.rBtns').style.visibility = 'hidden'
  $('#saveTxt').textContent = canShareFiles() ? T('share') : T('save')
}
function layoutResult() {
  const g = $('#grid'); if (!g) return; g.style.setProperty('--ts', '60px')
  requestAnimationFrame(() => {
    const W = g.clientWidth, H = g.clientHeight; if (!W || !H) return
    const ts = Math.floor(clamp(Math.min((W - 30) / 2, (H - 8) / 2 - 38), 56, 230)); g.style.setProperty('--ts', ts + 'px')
  })
}
function revealUpdate() {
  if (!S.result) return
  S.rt += STEP; const R = S.result
  while (S.shown < R.dishes.length && S.rt >= 0.4 + S.shown * 0.6) { const el = $$('#grid .tile')[S.shown]; el && el.classList.add('on'); if (!S.quiet) Snd.sfx('ding', Math.round(R.dishes[S.shown].score / 10)); S.shown++ }
  if (!S.rolled && S.rt >= 2.9) { S.rolled = true; if (!S.quiet) Snd.sfx('roll', 1) }
  if (!S.stamped && S.rt >= 4.1) {
    S.stamped = true; $('#rank').classList.add('on'); $('.rBtns').style.visibility = ''; $('#skip').hidden = true
    const tier = R.rank.tier; document.body.classList.add(tier === 'gold' ? 'party' : tier === 'red' ? 'mid' : 'gloom')
    if (!S.quiet) { Snd.sfx('slam'); Snd.sfx(tier === 'gold' ? 'cheer' : tier === 'red' ? 'applause' : 'boo', tier === 'red' ? 0.6 : 1) }
    Snd.setTrack(tier === 'gold' || tier === 'red' ? 'win' : 'sad')
  }
}
function skipReveal() { if (S.view !== 'result' || S.stamped) return; S.rt = 4.1; revealUpdate() }

// 結果を1枚の画像に（1080x1350・描いた4皿が全部入る）
async function drawCard() {
  const R = S.result, ja = S.lang === 'ja'
  const txt = [T('titleA'), T('resRank'), L(R.rank), R.rank.tja, R.rank.ten, T('resAvg'), ...R.dishes.map(d => d.line + L(ORD[d.id].name))].join('')
  try { await Promise.all([document.fonts.load(`40px 'Dela Gothic One'`, txt), document.fonts.load(`900 30px 'Zen Maru Gothic'`, txt), document.fonts.load(`700 30px 'Zen Maru Gothic'`, txt)]) } catch (e) {}
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d')
  const DISP = `'Dela Gothic One','Zen Maru Gothic','Hiragino Sans',sans-serif`, BODY = `'Zen Maru Gothic','Hiragino Sans',sans-serif`
  const bg = x.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, '#2a1d4a'); bg.addColorStop(1, '#140e24'); x.fillStyle = bg; x.fillRect(0, 0, 1080, 1350)
  // ちょうちんの光
  for (const [cx, cy] of [[90, 60], [990, 60]]) { const g = x.createRadialGradient(cx, cy, 10, cx, cy, 260); g.addColorStop(0, 'rgba(255,120,60,.45)'); g.addColorStop(1, 'rgba(255,120,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 1080, 400) }
  // のれん
  const nx = 140, nw = 800; x.fillStyle = '#6a4420'; x.fillRect(nx - 20, 30, nw + 40, 16)
  for (let i = 0; i < 2; i++) { x.fillStyle = '#25336b'; roundRect(x, nx + i * (nw / 2 + 6), 46, nw / 2 - 6, 150, 10); x.fill() }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff6d8'
  x.font = `900 30px ${BODY}`; x.fillText(T('titleA'), nx + nw / 4, 96)
  x.font = `82px ${DISP}`; x.fillStyle = '#f5c443'; x.fillText(ja ? 'マヨ' : 'MAYO', nx + nw / 4, 176); x.fillStyle = '#fff'; x.fillText(ja ? '職人' : 'MASTER', nx + nw * 3 / 4, 176)
  // 段位
  const col = { gold: '#f5c443', red: '#d7392f', gray: '#8f8aa0', black: '#1a1a1a' }[R.rank.tier]
  x.save(); x.translate(250, 345); x.rotate(-0.2); x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(0, 0, 112, 0, 7); x.fill(); x.strokeStyle = col; x.lineWidth = 14; x.stroke(); x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 90, 0, 7); x.stroke()
  x.fillStyle = col === '#f5c443' ? '#b8860b' : col; x.font = `900 ${ja ? 84 : 40}px ${BODY}`; x.textBaseline = 'middle'; fitText(x, L(R.rank), 0, 4, 160); x.restore()
  x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff6d8'; x.font = `900 34px ${BODY}`; x.fillText(T('resRank'), 400, 300)
  x.font = `900 92px ${BODY}`; x.fillStyle = R.rank.tier === 'gold' ? '#f5c443' : '#fff'; fitText(x, L(R.rank), 400, 392, 620)
  x.font = `900 38px ${BODY}`; x.fillStyle = '#f5c443'; fitText(x, '「' + (ja ? R.rank.tja : R.rank.ten) + '」', 400, 450, 640)
  x.font = `700 28px ${BODY}`; x.fillStyle = '#d8d0e8'; x.fillText(fmt(T('resAvg'), { n: R.avg }), 404, 494)
  // 4皿
  const gx = [80, 600], gy = [535, 920]
  R.dishes.forEach((d, i) => {
    const X = gx[i % 2], Y = gy[Math.floor(i / 2)], cx = X + 200, cy = Y + 162
    x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 24; x.shadowOffsetY = 10; x.drawImage(d.snap, cx - 150, cy - 150, 300, 300); x.restore()
    // お題の見本（小さく）
    x.save(); x.translate(X + 330, Y + 20); x.fillStyle = 'rgba(20,14,36,.92)'; x.beginPath(); x.arc(30, 30, 38, 0, 7); x.fill(); x.strokeStyle = '#fff6d8'; x.lineWidth = 2; x.stroke()
    x.strokeStyle = '#fff6d8'; x.lineWidth = 2.6; x.lineCap = x.lineJoin = 'round'; for (const st of ORD[d.id].strokes) { x.beginPath(); st.forEach(([u, v], k) => k ? x.lineTo(30 + u * 30, 30 + v * 30) : x.moveTo(30 + u * 30, 30 + v * 30)); x.stroke() } x.restore()
    x.fillStyle = '#25336b'; roundRect(x, X, Y, 210, 46, 23); x.fill(); x.fillStyle = '#fff'; x.font = `900 24px ${BODY}`; x.textAlign = 'center'; fitText(x, L(ORD[d.id].name), X + 105, Y + 32, 190)
    x.save(); x.translate(X + 335, Y + 258); x.rotate(0.14); x.font = `58px ${DISP}`; x.lineWidth = 8; x.strokeStyle = '#24170f'; x.fillStyle = d.score >= 78 ? '#f5c443' : d.score >= 52 ? '#fff' : d.score >= 28 ? '#bcd0ff' : '#ff8b7a'
    x.strokeText(String(d.score), 0, 0); x.fillText(String(d.score), 0, 0); x.font = `900 22px ${BODY}`; x.lineWidth = 5; x.strokeText(ja ? '点' : 'pts', 0, 30); x.fillText(ja ? '点' : 'pts', 0, 30); x.restore()
    // お客さんの一言
    const fy = Y + 322; x.save(); const im = faceImg[d.cust + d.mood]; if (im) x.drawImage(im, X + 4, fy - 4, 56, 56)
    x.fillStyle = '#fff6d8'; roundRect(x, X + 70, fy, 330, 50, 14); x.fill(); x.fillStyle = '#24170f'; x.font = `900 22px ${BODY}`; x.textAlign = 'left'; fitText(x, d.line, X + 84, fy + 33, 304); x.restore()
  })
  x.textAlign = 'right'; x.fillStyle = 'rgba(255,246,216,.75)'; x.font = `900 24px ${BODY}`; x.fillText(T('cardFoot'), 1040, 1330)
  return c
}
const faceImg = {}
function prepFaceImgs() { return Promise.all(S.result.dishes.map(d => new Promise(res => { const k = d.cust + d.mood; if (faceImg[k]) return res(); const im = new Image(); im.onload = () => { faceImg[k] = im; res() }; im.onerror = res; im.src = faceUrl(d.cust, d.mood) }))) }
function fitText(x, s, cx, cy, maxW) { let sz = parseFloat(x.font.match(/(\d+)px/)[1]); const pre = x.font.slice(0, x.font.indexOf(sz + 'px')), fam = x.font.slice(x.font.indexOf('px') + 2); while (x.measureText(s).width > maxW && sz > 12) { sz -= 2; x.font = `${pre}${sz}px${fam}` } x.fillText(s, cx, cy) }
const canShareFiles = () => { try { return !!(navigator.canShare && navigator.share && isTouch() && navigator.canShare({ files: [new File([new Blob(['x'])], 'a.png', { type: 'image/png' })] })) } catch (e) { return false } }
async function cardBlob() { await prepFaceImgs(); const c = await drawCard(); return new Promise(r => c.toBlob(r, 'image/png')) }
async function saveImage() {
  const blob = await cardBlob(); if (!blob) return 'fail'
  const file = new File([blob], 'mayo-master.png', { type: 'image/png' })
  if (canShareFiles()) {
    try { await navigator.share({ files: [file], title: T('title'), text: fmt(T('shareText'), { rank: T('resRank') + ' ' + L(S.result.rank) }) + ' https://tom3games.github.io/mayo-master/' }); toast(T('shared')); return 'shared' }
    catch (e) { if (e && e.name === 'AbortError') return 'abort' }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mayo-master.png'; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(T('saved')); return 'download'
}
function toast(s) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 1600) }

// ---------- カメラ（どの画面の形でもお好み焼きが大きく収まる）
const RIM = Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * RW * 1.06, TOP, Math.sin(a) * RW * 1.06) })
const HEAD = new THREE.Vector3(0, FLOOR_Y + 3.45, CUST_Z)
function fitCamera() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false)
  const land = w > h, shortLand = land && h < 560, v = new THREE.Vector3()
  const side = (S.view === 'title' || S.view === 'how') && shortLand
  camera.clearViewOffset(); camera.aspect = (side ? w * 0.5 : w) / h; camera.updateProjectionMatrix()
  if (S.view === 'play') {
    const pitch = 1.02, dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch))
    const topN = 1 - 2 * (land ? 52 : 132) / h, botN = -1 + 2 * (shortLand ? 10 : 86) / h, sideN = 1 - 2 * 8 / w
    const maxD = Math.min(640, w - 16)
    const tryFit = withHead => {
      for (let d = 4; d < 40; d += 0.1) for (let sz = -2.4; sz <= 1.001; sz += 0.1) {
        const Lk = new THREE.Vector3(0, TOP, sz); camera.position.copy(Lk).addScaledVector(dir, d); camera.lookAt(Lk); camera.updateMatrixWorld()
        let ok = true, minX = 9, maxX = -9
        for (const p of RIM) { v.copy(p).project(camera); if (Math.abs(v.x) > sideN || v.y > topN || v.y < botN) { ok = false; break } minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x) }
        if (ok && withHead) { v.copy(HEAD).project(camera); if (v.y > 1 - 2 * 140 / h || v.y < -1) ok = false }
        if (ok && (maxX - minX) / 2 * w <= (withHead ? Math.min(maxD, h * 0.6) : maxD)) return { d, sz, px: (maxX - minX) / 2 * w }
      }
      return null
    }
    const a = tryFit(false), b = tryFit(true), f = b && a && b.px >= Math.min(a.px * (a.px < 420 ? 0.9 : 0.65), 420) ? b : a
    const Lk = new THREE.Vector3(0, TOP, f.sz); camera.position.copy(Lk).addScaledVector(dir, f.d); camera.lookAt(Lk); camera.updateMatrixWorld()
    S.cam = { d: f.d, sz: f.sz, px: Math.round(f.px), head: f === b, bpx: b && Math.round(b.px) }
  } else {
    const pitch = 0.36, dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)), Lk = new THREE.Vector3(0, 0.75, -1.3)
    const pts = [new THREE.Vector3(-RW, TOP, RW), new THREE.Vector3(RW, TOP, RW), new THREE.Vector3(-1.4, 1.75, CUST_Z), new THREE.Vector3(1.4, 1.75, CUST_Z)]
    const title = S.view === 'title' || S.view === 'how'
    const top = title ? (land ? (side ? 0.62 : 0.5) : 0.4) : 0.9, bot = title ? (land ? (side ? -0.8 : -0.55) : -0.36) : -0.9
    const xl = -0.94, xr = 0.94
    let d = 3; for (; d < 40; d += 0.05) { camera.position.copy(Lk).addScaledVector(dir, d); camera.lookAt(Lk); camera.updateMatrixWorld(); if (pts.every(p => { v.copy(p).project(camera); return v.x > xl && v.x < xr && v.y < top && v.y > bot })) break }
    if (side) { camera.setViewOffset(w * 0.5, h, 0, 0, w, h); camera.updateProjectionMatrix() }
  }
}

// ---------- ループ（固定60Hz。時計は performance.now）
let acc = 0, lastT = performance.now(), paused = false, fpsN = 0, fpsT = performance.now(), fps = 0
function render() { if (inkDirty) composeInk(); renderer.render(scene, camera) }
function frame() {
  const now = performance.now(); let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.25) dt = 0.25
  if (!paused) { acc += dt; let n = 0; while (acc >= STEP && n < 8) { update(); acc -= STEP; n++ } if (n === 8) acc = 0 }
  hudUpdate(); render(); Snd.tick()
  fpsN++; if (now - fpsT > 1000) { fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now }
  requestAnimationFrame(frame)
}

// ---------- 言語
function applyLang() {
  document.documentElement.lang = S.lang
  for (const el of $$('[data-t]')) { const v = TXT[S.lang][el.dataset.t]; if (v !== undefined) el.textContent = v }
  $('#how2').textContent = isTouch() ? T('how2T') : T('how2M')
  $('#langTxt').textContent = T('lang')
  const flaps = $$('.noren .b'); flaps[0].innerHTML = `<span>${S.lang === 'ja' ? 'マヨ' : 'MAYO'}</span>`; flaps[1].textContent = S.lang === 'ja' ? '職人' : 'MASTER'
  document.title = T('title')
  if (S.view === 'result' && S.result) { buildResult(); for (let i = 0; i < S.shown; i++) $$('#grid .tile')[i].classList.add('on'); if (S.stamped) { $('#rank').classList.add('on'); $('.rBtns').style.visibility = ''; $('#skip').hidden = true } layoutResult() }
  if (S.view === 'play' && S.ph !== 'react' && S.ph !== 'judge') showOrder(S.ph !== 'arrive')
}

// ---------- 起動
function boot() {
  try { const l = localStorage.getItem('mm.lang'); S.lang = l || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en') } catch (e) { S.lang = (navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en' }
  try { if (localStorage.getItem('mm.mute') === '1') { Snd.muted = true; $('#icOn').hidden = true; $('#icOff').hidden = false } } catch (e) {}
  for (const el of $$('[data-face]')) el.style.backgroundImage = `url(${faceUrl(el.dataset.face)})`
  applyLang()
  const on = (id, fn) => $(id).addEventListener('click', e => { Snd.init(); fn(e) })
  on('#bStart', () => { Snd.sfx('tap'); startGame() })
  on('#bHowStart', () => { Snd.sfx('tap'); startGame() })
  on('#bHow', () => { Snd.sfx('tap'); go('how') })
  on('#bHowBack', () => { Snd.sfx('tap'); go('title') })
  on('#bAgain', () => { Snd.sfx('tap'); S.rolled = S.stamped = false; startGame() })
  on('#bSave', () => saveImage())
  on('#bTitle', () => { Snd.sfx('tap'); S.rolled = S.stamped = false; Snd.ambient(false); go('title') })
  on('#bDone', () => { if (S.ph === 'draw' && S.mode === 'play') S.doneReq = true })
  on('#bLang', () => { S.lang = S.lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('mm.lang', S.lang) } catch (e) {} applyLang() })
  on('#bMute', () => { Snd.setMute(!Snd.muted); $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted; try { localStorage.setItem('mm.mute', Snd.muted ? '1' : '0') } catch (e) {} })
  const vp = $('#vPlay')
  vp.addEventListener('pointerdown', onDown); vp.addEventListener('pointermove', onMove)
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) vp.addEventListener(n, onUp)
  $('#vResult').addEventListener('pointerdown', e => { if (!e.target.closest('button')) skipReveal() })
  window.addEventListener('keydown', e => { if ((e.code === 'Enter' || e.code === 'Space') && S.view === 'play' && S.ph === 'draw') { e.preventDefault(); S.doneReq = true } })
  window.addEventListener('resize', () => { fitCamera(); if (S.view === 'result') layoutResult() })
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); acc = 0 })
  document.fonts?.ready.then(() => { const x = norenTex.image.getContext('2d'); x.fillStyle = '#25336b'; x.fillRect(0, 0, 1024, 256); x.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 1024; i += 6) x.fillRect(i, 0, 2, 256); drawNorenText(x, 1024, 256); noren.children.forEach(m => m.material.map.needsUpdate = true) })
  go('title')
  requestAnimationFrame(frame)
  window.__mmReady = true
}

// 検証用の窓口
window.mm = {
  S, ORD, RANKS, startGame, go, scoreDish, drawCard, saveImage, fitCamera, skipReveal, custs, nib, inp, uvToScreen, screenToUV, Snd, cardBlob,
  setLang: l => { S.lang = l; applyLang() },
  dbg: {
    pause: v => { paused = v; acc = 0; lastT = performance.now() },
    step: n => { for (let i = 0; i < n; i++) update(); hudUpdate() },
    render: () => render(),
    autoplay: m => { S.bot = m },
    fps: () => fps,
    quiet: v => { S.quiet = v },
    // 指を台本どおりに動かす（u,v はお好み焼きの座標）
    stroke: pts => { inp.down = true; for (const [u, v] of pts) inp.q.push({ u, v }) },
    up: () => { inp.down = false; inp.q.push({ up: true }) },
    setTimeLeft: s => { S.pt = S.ord.draw - s },
    setDish: (id, cust, shake = 0) => { S.dishes[S.di] = { id, cust, shake }; S.di--; nextDish() },
    forceScore: n => { if (S.res) S.res.score = n },
    cam: (p, l) => { camera.position.set(...p); camera.lookAt(...l); camera.updateMatrixWorld() },
  },
}
boot()
