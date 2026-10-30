// SNS用サムネ og.png（1200x630）。node og.mjs
// 遊んでいる一番おもしろい場面（ヘタな猫を見たお客さんが「…これ猫？ ジャガイモ？」）＋タイトル＋一言
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' })
await p.addInitScript(() => { try { localStorage.setItem('mm.tut', '1') } catch (e) {} })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__mmReady)
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800)
await p.click('#bStart')
await p.evaluate(() => {
  mm.dbg.pause(true); mm.dbg.quiet(true); mm.dbg.autoplay('sloppy'); mm.S.seed = 3; mm.dbg.setDish('cat', 'jk')
  let k = 0; while (mm.S.ph !== 'judge' && k++ < 60 * 20) mm.dbg.step(1)
  mm.dbg.forceScore(40); while (mm.S.ph !== 'react' && k++ < 60 * 30) mm.dbg.step(1); mm.dbg.step(26)
  mm.S.view = 'og'; mm.dbg.step(1); mm.dbg.cam([1.7, 3.7, 4.7], [1.7, 0.45, -1.15]); mm.dbg.render()
})
await p.addStyleTag({ content: `.hud,#corner,#bDone,#banner,.pop{display:none!important}#order{font-size:30px!important;max-width:380px!important;padding:12px 18px!important}
  body::after{content:'';position:fixed;inset:0 0 0 52%;background:linear-gradient(90deg,rgba(27,20,48,0),rgba(27,20,48,.92) 20%);z-index:30}` })
await p.evaluate(() => { mm.dbg.render(); const o = document.querySelector('#order'); o.style.left = '470px'; o.style.top = '150px' })
await p.evaluate(() => {
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:30px;top:0;bottom:0;width:470px;z-index:31;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px;text-align:center'
  d.innerHTML = `<div style="position:relative;display:flex;gap:8px;width:450px;filter:drop-shadow(0 12px 20px rgba(0,0,0,.5))">
    <div style="position:absolute;left:-12px;right:-12px;top:-10px;height:12px;border-radius:6px;background:linear-gradient(#8a5a2a,#5c3a18)"></div>
    <div style="flex:1;background:linear-gradient(#25336b,#121a40);border-radius:0 0 10px 10px;padding:18px 8px 20px"><div style="font-family:'Zen Maru Gothic';font-weight:900;font-size:26px;letter-spacing:.2em;color:#fff6d8">お好み焼き</div><div style="font-family:'Dela Gothic One';font-size:84px;line-height:1.1;color:#f5c443">マヨ</div></div>
    <div style="flex:1;background:linear-gradient(#25336b,#121a40);border-radius:0 0 10px 10px;padding:18px 8px 20px"><div style="font-size:26px">&nbsp;</div><div style="font-family:'Dela Gothic One';font-size:84px;line-height:1.1;color:#fff">職人</div></div></div>
  <div style="font-family:'Zen Maru Gothic';font-weight:900;font-size:31px;line-height:1.5;color:#fff">お客さんの注文どおりに、<br><span style="color:#f5c443">マヨで絵を描け。</span></div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')
