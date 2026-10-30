// 音（素材なし・WebAudio）。祭り囃子の BGM と、鉄板・マヨ・お客さんの声
// 使い方: 最初のタップで Snd.init()、画面切替で Snd.setTrack('名前')、ループで毎フレーム Snd.tick()、検証は Snd.played と Snd.level()
// ---------- 音（素材なし。WebAudio で全部鳴らす）
const Snd = {
  ctx: null, muted: false, next: 0, step: 0, track: null, want: null, switchAt: 0, played: {}, lastBrush: 0,
  TEMPO: { title: 132, play: 112, win: 138, sad: 72 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      this.ctx = new AC()
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
      this.an = this.ctx.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(this.ctx.destination)
      this.bgm = this.ctx.createGain(); this.bgm.gain.value = 0.0001; this.bgm.connect(this.master)
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, len)
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      if (this.want) { const w = this.want; this.want = null; this.setTrack(w) }
      if (this.wantAmb) this.ambient(true)
    } catch (e) { this.ctx = null }
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7 },
  tone(f, t0, dur, type = 'square', vol = 0.2, dest, f2) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.02)
  },
  noise(t0, dur, vol, freq, type = 'highpass', dest, q) {
    if (!this.ctx) return; const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq; if (q) f.Q.value = q
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02)
  },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
  mtof: m => 440 * Math.pow(2, (m - 69) / 12),
  mark(n) { this.played[n] = (this.played[n] || 0) + 1 },
  setTrack(name) {
    if (this.want === name) return
    this.want = name; if (!this.ctx) return
    const now = this.ctx.currentTime, g = this.bgm.gain
    g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(0.0001, now + 0.25)
    this.switchAt = now + 0.27
  },
  tick() {
    if (!this.ctx) return; const c = this.ctx
    if (this.switchAt && c.currentTime >= this.switchAt) {
      this.track = this.want; this.step = 0; this.next = c.currentTime + 0.05; this.switchAt = 0
      const g = this.bgm.gain; g.cancelScheduledValues(c.currentTime); g.setValueAtTime(0.0001, c.currentTime); g.linearRampToValueAtTime(0.26, c.currentTime + 0.35)
      if (this.track) this.mark('bgm:' + this.track)
    }
    if (!this.track || this.switchAt) return
    const spb = 60 / this.TEMPO[this.track] / 4
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05
    while (this.next < c.currentTime + 0.25) { this['p_' + this.track](this.step, this.next); this.next += spb; this.step++ }
  },
  kick(t, v = 0.7) { this.tone(150, t, 0.16, 'sine', v, this.bgm, 42) },
  clap(t, v = 0.2) { for (const d of [0, 0.012, 0.024]) this.noise(t + d, 0.09, v, 1500, 'bandpass', this.bgm) },
  hat(t, v = 0.06, open) { this.noise(t, open ? 0.12 : 0.03, v, 8000, 'highpass', this.bgm) },
  bass(n, t, dur = 0.18, vol = 0.45, type = 'triangle') { this.tone(this.mtof(n), t, dur, type, vol, this.bgm) },
  pad(n, t, dur, vol = 0.04) { this.tone(this.mtof(n), t, dur, 'sine', vol, this.bgm); this.tone(this.mtof(n) * 2.005, t, dur * 0.6, 'sine', vol * 0.3, this.bgm) },
  stab(ns, t, dur = 0.14, vol = 0.04) {
    if (!this.ctx) return; const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain()
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(600, t + dur)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    for (const n of ns) for (const d of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.mtof(n); o.detune.value = d; o.connect(f); o.start(t); o.stop(t + dur + 0.02) }
    f.connect(g); g.connect(this.bgm)
  },
  // 祭り囃子（太鼓と笛。ヨナ抜きっぽい音階）
  flute(n, t, dur, vol = 0.06) {
    if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain()
    o.type = 'sine'; o.frequency.value = this.mtof(n); l.frequency.value = 5.5; lg.gain.value = this.mtof(n) * 0.012; l.connect(lg); lg.connect(o.frequency)
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g); g.connect(this.bgm); o.start(t); l.start(t); o.stop(t + dur + 0.02); l.stop(t + dur + 0.02)
    this.noise(t, 0.05, vol * 0.4, 2500, 'bandpass', this.bgm, 2)
  },
  taiko(t, v = 0.7) { this.tone(110, t, 0.35, 'sine', v, this.bgm, 55); this.noise(t, 0.08, v * 0.25, 400, 'lowpass', this.bgm) },
  shime(t, v = 0.12) { this.tone(520, t, 0.06, 'triangle', v, this.bgm, 380); this.noise(t, 0.03, v * 0.6, 3000, 'bandpass', this.bgm, 3) },
  kane(t, v = 0.05) { this.tone(1760, t, 0.18, 'square', v * 0.4, this.bgm); this.tone(2637, t, 0.12, 'sine', v, this.bgm) },
  p_title(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s === 0 || s === 6 || s === 10) this.taiko(t, s ? 0.45 : 0.7)
    if (s % 2 === 1) this.shime(t, s % 4 === 3 ? 0.12 : 0.06)
    if (s === 4 || s === 12) this.kane(t)
    const root = [50, 50, 55, 57][bar]; if (s === 0 || s === 8) this.bass(root - 12, t, 0.3, 0.28, 'triangle')
    const mel = [[74, -1, 76, 79, -1, 76, 74, -1], [71, -1, 74, -1, 76, -1, -1, -1], [79, -1, 81, 79, 76, -1, 74, 76], [74, -1, 71, -1, 69, -1, -1, -1]]
    if (s % 2 === 0) { const n = mel[bar][s / 2]; if (n > 0) this.flute(n, t, 0.28, 0.05) }
  },
  p_play(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s === 0 || s === 8) this.taiko(t, 0.4); if (s % 4 === 2) this.shime(t, 0.05); if (s === 12) this.kane(t, 0.03)
    const root = [50, 48, 45, 47][bar]; if (s === 0) this.bass(root - 12, t, 0.5, 0.22, 'triangle'); if (s === 10) this.bass(root - 5, t, 0.25, 0.18, 'triangle')
    const mel = [69, 71, 74, 76, 74, 71, 69, 67]
    if (s === 6 || s === 14) this.flute(mel[(bar * 2 + (s === 14)) % 8] + 12, t, 0.3, 0.03)
  },
  p_win(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4
    if (s % 4 === 0) this.taiko(t, 0.6); if (s % 2 === 1) this.shime(t, 0.09); if (s % 8 === 4) this.kane(t, 0.06)
    const mel = [[79, 81, 83, 86, 83, 81, 79, -1], [81, 83, 86, 88, 86, -1, 83, -1], [86, 83, 81, 79, 81, 83, 81, -1], [79, -1, 76, -1, 79, -1, -1, -1]]
    if (s % 2 === 0) { const n = mel[bar][s / 2]; if (n > 0) this.flute(n, t, 0.24, 0.05) }
    if (s === 0) this.bass([43, 45, 47, 43][bar], t, 0.6, 0.3)
  },
  p_sad(i, t) {
    const bar = Math.floor(i / 12) % 4, s = i % 12
    const ch = [[57, 60, 64], [57, 62, 65], [56, 59, 64], [57, 60, 64]][bar], root = [33, 38, 40, 33][bar]
    if (s === 0) this.bass(root, t, 0.8, 0.3, 'sine'); if (s === 4 || s === 8) for (const n of ch) this.tone(this.mtof(n), t, 0.4, 'triangle', 0.02, this.bgm)
    const mel = [[76, 74, 72], [74, 72, 69], [71, 69, 68], [69, -1, -1]][bar]
    if (s % 4 === 0) { const n = mel[s / 4]; if (n > 0) this.flute(n - 12, t, 0.5, 0.05) }
  },
  // 鉄板のジュージュー（ずっと鳴る）と、マヨを絞る音（速さで変わる）
  ambient(on) {
    if (!this.ctx) { this.wantAmb = on; return }
    if (on && !this.amb) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
      s.buffer = this.noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.7; g.gain.value = 0.035
      s.connect(f); f.connect(g); g.connect(this.master); s.start(); this.amb = { s, g }
      const s2 = c.createBufferSource(), f2 = c.createBiquadFilter(), g2 = c.createGain()
      s2.buffer = this.noiseBuf; s2.loop = true; f2.type = 'lowpass'; f2.frequency.value = 700; g2.gain.value = 0.0001
      s2.connect(f2); f2.connect(g2); g2.connect(this.master); s2.start(); this.sq = { s: s2, g: g2, f: f2 }
    } else if (!on && this.amb) { try { this.amb.s.stop(); this.sq.s.stop() } catch (e) {} this.amb = null; this.sq = null }
  },
  squeeze(v) { if (!this.sq) return; const t = this.ctx.currentTime; this.sq.g.gain.setTargetAtTime(v > 0 ? 0.05 + v * 0.12 : 0.0001, t, 0.03); this.sq.f.frequency.setTargetAtTime(500 + v * 900, t, 0.05); if (v > 0) this.mark('squeeze') },
  crackle() { if (!this.ctx || !this.amb) return; const t = this.ctx.currentTime; if (Math.random() < 0.25) this.noise(t + Math.random() * 0.1, 0.012, 0.05 + Math.random() * 0.08, 5000, 'highpass') },
  // お客さんの声（母音っぽいフィルタの付いたノコギリ波）
  voice(pitch, kind) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime; this.mark('voice:' + kind)
    const plans = { talk: [[1, 1.15, 0.09], [1.1, 0.95, 0.08], [0.95, 1.05, 0.1]], wow: [[1.2, 1.9, 0.5]], huh: [[1, 1.0, 0.25], [1.0, 1.35, 0.35]], mad: [[0.9, 0.6, 0.18], [1.1, 0.7, 0.3]], ok: [[1, 1.2, 0.18], [1.2, 1.0, 0.2]] }[kind] || [[1, 1, 0.1]]
    let s = t
    for (const [a, b, d] of plans) {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), base = 180 * pitch
      o.type = 'sawtooth'; o.frequency.setValueAtTime(base * a, s); o.frequency.exponentialRampToValueAtTime(base * b, s + d)
      f.type = 'bandpass'; f.frequency.value = kind === 'mad' ? 900 : 1300; f.Q.value = 3
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(kind === 'mad' ? 0.5 : 0.35, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + d)
      o.connect(f); f.connect(g); g.connect(this.master); o.start(s); o.stop(s + d + 0.02); s += d * 0.9
    }
  },
  // 効果音
  sfx(name, v = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime; this.mark(name)
    switch (name) {
      case 'tap': this.tone(880, t, 0.06, 'triangle', 0.12 * v); break
      case 'boto': this.tone(160, t, 0.22, 'sine', 0.7, null, 45); this.noise(t, 0.25, 0.35, 600, 'lowpass'); this.tone(420, t + 0.03, 0.12, 'triangle', 0.15, null, 120); break
      case 'bupi': { const o = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(70, t + 0.18); f.type = 'lowpass'; f.frequency.value = 500
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.22); this.noise(t, 0.12, 0.15 * v, 900, 'bandpass'); break }
      case 'flip': this.noise(t, 0.25, 0.08, 1200, 'bandpass', null, 1.5); this.tone(300, t, 0.2, 'triangle', 0.08, null, 700); this.tone(120, t + 0.42, 0.15, 'sine', 0.5, null, 60); this.noise(t + 0.42, 0.3, 0.12, 3000, 'highpass'); break
      case 'show': this.tone(1320, t, 0.12, 'sine', 0.12); this.tone(1760, t + 0.06, 0.25, 'sine', 0.1); break
      case 'go': this.tone(660, t, 0.08, 'square', 0.08); this.tone(990, t + 0.08, 0.2, 'square', 0.08); break
      case 'tick': this.tone(1500, t, 0.03, 'square', 0.04); break
      case 'whistle': this.tone(2200, t, 0.5, 'sine', 0.12, null, 2000); this.tone(2600, t, 0.5, 'sine', 0.05); break
      case 'roll': for (let k = 0; k < 30 * v; k++) this.noise(t + k * 0.04, 0.05, 0.05 + k * 0.004, 1800, 'bandpass'); break
      case 'ding': { const f = 440 * Math.pow(2, (v - 5) / 8); this.tone(f, t, 0.5, 'triangle', 0.3); this.tone(f * 2, t + 0.06, 0.4, 'sine', 0.15); break }
      case 'slam': this.tone(90, t, 0.5, 'sine', 0.8, null, 40); this.noise(t, 0.3, 0.3, 2000, 'lowpass'); break
      case 'boo': for (let k = 0; k < 9; k++) { const f = 105 + Math.random() * 40; this.tone(f, t + Math.random() * 0.2, 1.4, 'sawtooth', 0.04, null, f * 0.7) } this.noise(t, 1.4, 0.12, 500, 'lowpass'); break
      case 'applause': for (let k = 0; k < 90 * v; k++) this.noise(t + Math.random() * 2.2 * v, 0.03, 0.08, 1800 + Math.random() * 2000, 'bandpass', null, 0.8); break
      case 'cheer': this.noise(t, 1.6, 0.14, 1200, 'bandpass', null, 0.6); for (let k = 0; k < 4; k++) { const s = t + k * 0.3; this.tone(1800, s, 0.3, 'sine', 0.05, null, 2600) } break
      case 'cricket': for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) this.tone(4200, t + k * 0.5 + j * 0.05, 0.03, 'sine', 0.05); break
      case 'sizzle': this.noise(t, 0.5, 0.12, 4500, 'highpass'); break
      case 'step': this.tone(140, t, 0.06, 'sine', 0.15, null, 90); break
    }
  },
}

