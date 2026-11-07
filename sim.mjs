// 台本のボットで結果の分布を測る。node sim.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' })
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__mmReady)
const N = Number(process.env.N || 12)
const out = await p.evaluate(N => {
  mm.dbg.pause(true); mm.dbg.quiet(true); const res = {}
  for (const bot of ['good', 'normal', 'sloppy', 'idle']) {
    res[bot] = { avg: [], ranks: {}, per: {} }
    for (let s = 1; s <= N; s++) {
      mm.dbg.autoplay(bot); mm.startGame(s * 7919); let k = 0
      while (mm.S.view !== 'result' && k < 60 * 120) { mm.dbg.step(1); k++ }
      const r = mm.S.result; if (!r) return { err: [bot, s, mm.S.ph, mm.S.di] }
      res[bot].avg.push(r.avg); res[bot].ranks[r.rank.ja] = (res[bot].ranks[r.rank.ja] || 0) + 1
      for (const d of r.dishes) (res[bot].per[d.id] ||= []).push(d.score)
      res[bot].secs = (res[bot].secs || 0) + k / 60 / N
    }
    mm.dbg.autoplay(null)
  }
  return res
}, N)
for (const [k, v] of Object.entries(out)) {
  if (k === 'err') { console.log('ERR', v); continue }
  const a = v.avg, m = a.reduce((x, y) => x + y, 0) / a.length
  console.log(k.padEnd(7), 'mean', m.toFixed(1), 'min', Math.min(...a), 'max', Math.max(...a), 'secs', v.secs.toFixed(1), JSON.stringify(v.ranks))
  console.log('        per', Object.entries(v.per).map(([id, s]) => id + ':' + Math.round(s.reduce((x, y) => x + y, 0) / s.length)).join(' '))
}
console.log('errors', errs.length ? errs.slice(0, 5) : 'none')
await b.close(); server.kill()
