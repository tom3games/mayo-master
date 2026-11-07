// 全項目の自動検証。node verify.mjs（shots/ にスクショを出す）
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
// 空いているポートを自動で取る（並行して他のゲームも検証するため）
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' } })
const PORT = await new Promise(r => server.stdout.on('data', d => { const m = String(d).match(/:(\d+)/); if (m) r(m[1]) }))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}, tutDone = true) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts })
  await ctx.addInitScript(k => { try { localStorage.clear(); if (k) localStorage.setItem('mm.tut', '1') } catch (e) {} }, tutDone)
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__mmReady, null, { timeout: 15000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
// 一画面に収まる（縦スクロールなし・ボタンや吹き出しが画面内・右上の小ボタンと重ならない）
const fit = q => q.evaluate(() => {
  const H = innerHeight, W = innerWidth, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) .order,main:not([hidden]) .tile,main:not([hidden]) .rank,main:not([hidden]) .panel,main:not([hidden]) .noren,main:not([hidden]) .bubble,#corner button')) {
    if (!el.offsetParent || el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1 || r.right > W + 1 || r.left < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom))
  }
  const cr = document.querySelector('#corner').getBoundingClientRect()
  for (const el of document.querySelectorAll('main:not([hidden]) .order,main:not([hidden]) .noren,main:not([hidden]) .rHead,main:not([hidden]) .tile,main:not([hidden]) .gauge')) {
    if (!el.offsetParent || el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (r.left < cr.right && r.right > cr.left && r.top < cr.bottom && r.bottom > cr.top) over.push('corner-overlap:' + (el.id || el.className))
  }
  return { H, over: over.slice(0, 6) }
})
// 吹き出し・帯がお題の範囲（お好み焼きの上）にかぶらない
const noCover = q => q.evaluate(() => {
  const pts = mm.ORD[mm.S.dish.id].samples.map(([u, v]) => mm.uvToScreen(u, v)), bad = []
  for (const id of ['order', 'banner']) { const el = document.getElementById(id); if (el.hidden) continue; const r = (el.querySelector('b') || el).getBoundingClientRect(); const n = pts.filter(p => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom).length; if (n) bad.push(id + ':' + n) }
  return bad
})
const variance3d = p => p.evaluate(() => {
  mm.dbg.render(); const src = document.querySelector('#world'), c = document.createElement('canvas'); c.width = 200; c.height = Math.round(200 * src.height / src.width)
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 3) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
})
// ---- Xでポスト の検査道具
// window.open をスタブして押す → 開いたURLを分解して確かめる
const xStub = async (pg, ns, pub, tag) => {
  await pg.evaluate(() => { window.__opened = []; if (!window.__origOpen) window.__origOpen = window.open; window.open = (...a) => { window.__opened.push(a); return null } })
  const vis = await pg.evaluate(() => { const b = document.querySelector('#bX'), r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, clip: b.scrollWidth > b.clientWidth + 1, bg: getComputedStyle(b).backgroundColor, label: b.textContent.trim(), svg: !!b.querySelector('svg path') } })
  await pg.click('#bX')
  const r = await pg.evaluate(ns => ({ opened: window.__opened, text: window[ns].xText(), url: window[ns].xUrl() }), ns)
  await pg.evaluate(() => { window.open = window.__origOpen })
  expect(r.opened.length === 1, r)
  const [u, target, feat] = r.opened[0], q = new URL(u)
  const text = q.searchParams.get('text'), url = q.searchParams.get('url')
  expect(u.startsWith('https://x.com/intent/post?') && target === '_blank' && /noopener/.test(feat || '') && u === r.url, r.opened[0])
  expect(text === r.text && text.includes(tag) && (text.match(/#/g) || []).length === 1 && url === pub && !/https?:\/\//.test(text), { text, url })
  expect(vis.inView && !vis.clip && vis.svg && vis.bg === 'rgb(0, 0, 0)' && vis.h >= 36, vis)
  return { label: vis.label, text }
}
// 本物のクリックで新しいタブ（popup）が開く。x.com へは出ずにダミーを返す
const xPopup = async (pg, pub) => {
  await pg.context().route(/^https:\/\/x\.com\//, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>x</title>ok' }))
  const [pop] = await Promise.all([pg.waitForEvent('popup', { timeout: 8000 }), pg.click('#bX')])
  await pop.waitForLoadState().catch(() => {})
  const u = new URL(pop.url()); await pop.close()
  expect(u.origin + u.pathname === 'https://x.com/intent/post' && u.searchParams.get('url') === pub && u.searchParams.get('text'), pop.url())
  return u.searchParams.get('text')
}
// 結果画面のボタンの文字が切れていない
const btnClip = pg => pg.evaluate(() => [...document.querySelectorAll('#vResult button')].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 1).map(b => b.id + ':' + b.scrollWidth + '>' + b.clientWidth))
const PUB = 'https://tom3games.github.io/mayo-master/'
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]
// 画面を止めて、描く番まで進める
const toPhase = (p, ph) => p.evaluate(ph => { mm.dbg.pause(true); let k = 0; while (mm.S.ph !== ph && k++ < 60 * 30) mm.dbg.step(1); mm.dbg.render(); return mm.S.ph }, ph)
// 本物のマウスで下絵をなぞる（1フレームに数点ずつ）
async function traceWithMouse(p, opt = {}) {
  const strokes = await p.evaluate(o => mm.ORD[mm.S.dish.id].strokes.map(st => st.map(([u, v]) => mm.uvToScreen(u * (o.sc || 1) + (o.dx || 0), v * (o.sc || 1)))), opt)
  for (const st of strokes) {
    const pts = []; for (let i = 1; i < st.length; i++) { const a = st[i - 1], b = st[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)); for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n]) }
    await p.mouse.move(pts[0][0], pts[0][1]); await p.mouse.down()
    for (let i = 0; i < pts.length; i++) { await p.mouse.move(pts[i][0], pts[i][1]); if (i % 2 === 1) await p.evaluate(() => mm.dbg.step(1)) }
    await p.mouse.up(); await p.evaluate(() => mm.dbg.step(3))
  }
}

const browser = await chromium.launch()
const p = await open(browser, {}, false)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある（og:image は ?v= 付きの公開URL）', async () => {
  const r = await p.evaluate(() => ({ has: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(document.querySelector('meta[name="twitter:card"]')?.content === 'summary_large_image'), img: document.querySelector('meta[property="og:image"]').content, url: document.querySelector('meta[property="og:url"]').content }))
  expect(r.has.every(Boolean) && r.img === 'https://tom3games.github.io/mayo-master/og.png?v=1' && r.url === 'https://tom3games.github.io/mayo-master/', JSON.stringify(r))
})
await t('og.png が 1200x630', async () => { const r = await p.evaluate(async () => { const im = new Image(); im.src = 'og.png'; await im.decode(); return [im.naturalWidth, im.naturalHeight] }); expect(r[0] === 1200 && r[1] === 630, r); return r })
await t('タイトルの3D（屋台）が描けている', async () => { await p.waitForTimeout(1500); const v = await variance3d(p); expect(v > 200, v); return v })
await t('タイトルで手本のマヨが描かれていく（デモ）', async () => { const r = await p.evaluate(() => ({ ph: mm.S.ph, mode: mm.S.mode, ink: mm.S.ink.length })); expect(r.mode === 'demo' && r.ink > 10, JSON.stringify(r)); return r })
await t('初回はチュートリアル（指／ドラッグの案内）が出て、描くと消える', async () => {
  await p.click('#bStart'); await toPhase(p, 'draw')
  const shown = await p.evaluate(() => !document.querySelector('#tut').hidden && document.querySelector('#tutTxt').textContent)
  const c = await p.evaluate(() => mm.uvToScreen(0, 0)); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 30, c.y); await p.evaluate(() => mm.dbg.step(2)); await p.mouse.up()
  const hid = await p.evaluate(() => document.querySelector('#tut').hidden)
  expect(shown && /ドラッグ/.test(shown) && hid, JSON.stringify({ shown, hid })); return shown
})
await p.close()

// 通しで遊ぶ（本物のマウスでなぞる）
const q = await open(browser)
await t('マウスで4皿なぞって通しで遊べる（なぞれば高得点・結果が出る）', async () => {
  await q.click('#bStart'); const scores = []
  for (let i = 0; i < 4; i++) {
    await toPhase(q, 'draw'); if (i === 0) await q.screenshot({ path: `${ROOT}/shots/play-draw-start.png` })
    await traceWithMouse(q)
    if (i === 1) { await q.evaluate(() => mm.dbg.render()); await q.screenshot({ path: `${ROOT}/shots/play-traced.png` }) }
    await q.click('#bDone'); await q.evaluate(() => mm.dbg.step(2))
    await toPhase(q, 'react'); await q.evaluate(() => mm.dbg.step(30)); if (i === 1) { await q.evaluate(() => mm.dbg.render()); await q.screenshot({ path: `${ROOT}/shots/play-react-good.png` }) }
    scores.push(await q.evaluate(() => mm.S.results.at(-1).score + ':' + mm.S.results.at(-1).id))
  }
  await q.evaluate(() => { let k = 0; while (mm.S.view !== 'result' && k++ < 60 * 10) mm.dbg.step(1) })
  const r = await q.evaluate(() => ({ view: mm.S.view, n: mm.S.result.dishes.length, avg: mm.S.result.avg }))
  expect(r.view === 'result' && r.n === 4 && scores.every(s => +s.split(':')[0] >= 60), JSON.stringify({ r, scores })); return { scores, avg: r.avg }
})
await t('結果発表: 段位は発表まで見せない → ハンコが押される', async () => {
  const before = await q.evaluate(() => ({ rank: document.querySelector('#rank').classList.contains('on'), btn: getComputedStyle(document.querySelector('.rBtns')).visibility }))
  await q.evaluate(() => mm.dbg.step(60 * 2)); await q.evaluate(() => mm.dbg.render()); await q.screenshot({ path: `${ROOT}/shots/result-reveal.png` })
  await q.evaluate(() => mm.dbg.step(60 * 3)); await q.waitForTimeout(600)
  const after = await q.evaluate(() => ({ rank: document.querySelector('#rank').classList.contains('on'), n: document.querySelector('#rankN').textContent, tiles: document.querySelectorAll('#grid .tile.on').length, btn: getComputedStyle(document.querySelector('.rBtns')).visibility }))
  await q.screenshot({ path: `${ROOT}/shots/result-final.png` })
  expect(!before.rank && before.btn === 'hidden' && after.rank && after.tiles === 4 && after.btn === 'visible' && after.n, JSON.stringify({ before, after })); return after.n
})
await t('結果の皿の絵（描いたマヨ）が見える', async () => {
  const v = await q.evaluate(() => [...document.querySelectorAll('#grid canvas')].map(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let w = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 225 && d[i + 1] > 210 && d[i + 2] > 150) w++; return w }))
  expect(v.length === 4 && v.every(n => n > 200), v); return v
})
await t('結果画像（1080x1350・4皿入り）を保存できる', async () => {
  const dl = q.waitForEvent('download'); await q.click('#bSave'); const d = await dl
  const path = `${ROOT}/shots/card.png`; await d.saveAs(path); const size = statSync(path).size
  const dim = await q.evaluate(async () => { const c = await mm.drawCard(); return [c.width, c.height] })
  expect(d.suggestedFilename() === 'mayo-master.png' && size > 80000 && dim[0] === 1080 && dim[1] === 1350, JSON.stringify({ f: d.suggestedFilename(), size, dim })); return { size }
})
await t('Xでポスト: 日本語（ボタンが見える・x.com/intent/post・本文に段位と称号とハッシュタグ・url=公開URL）', async () => {
  const r = await xStub(q, 'mm', PUB, '#お好み焼きマヨ職人')
  const n = await q.evaluate(() => [document.querySelector('#rankN').textContent, document.querySelector('#rankT').textContent.replace(/[「」]/g, '')])
  expect(r.label === 'Xでポスト' && r.text.includes(n[0]) && r.text.includes(n[1]), { r, n }); return r.text
})
await t('Xでポスト: 本物のクリックで新しいタブが開く', async () => { const tx = await xPopup(q, PUB); expect(/#お好み焼きマヨ職人/.test(tx), tx); return tx.length })
await t('結果画面で言語を切り替えると皿の一言・皿の名前・段位・称号まで全部切り替わる（日→英→日）', async () => {
  const grab = () => q.evaluate(() => ({ cm: [...document.querySelectorAll('#grid .cm')].map(e => e.textContent), lab: [...document.querySelectorAll('#grid .lab')].map(e => e.textContent), want: mm.S.result.dishes.map(d => d.lineO), all: [...document.querySelectorAll('#vResult *')].filter(e => e.offsetParent && !e.children.length).map(e => e.textContent.trim()).filter(Boolean).join(' | ') }))
  const ja = await grab(); await q.click('#bLang'); await q.waitForTimeout(150); const en = await grab()
  await q.screenshot({ path: ROOT + '/shots/result-en-switched.png' })
  await q.click('#bLang'); await q.waitForTimeout(150); const back = await grab()
  const JP = /[ぁ-んァ-ン一-龥「」]/
  expect(ja.cm.every((c, i) => c === ja.want[i].ja) && ja.cm.every(c => JP.test(c)), ja)
  expect(en.cm.every((c, i) => c === en.want[i].en) && !JP.test(en.all), en)
  expect(back.cm.join() === ja.cm.join() && back.lab.join() === ja.lab.join(), back)
  return en.cm
})
await t('Xでポスト: 英語', async () => {
  await q.click('#bLang')
  const r = await xStub(q, 'mm', PUB, '#MayoMaster')
  const n = await q.evaluate(() => document.querySelector('#rankN').textContent)
  await q.screenshot({ path: ROOT + '/shots/result-en-x.png' })
  await q.click('#bLang')
  expect(r.label === 'Post on X' && r.text.includes(n) && !/[ぁ-んァ-ン一-龥]/.test(r.text), { r, n }); return r.text
})
await t('もう一回ですぐ遊べる', async () => { await q.click('#bAgain'); const r = await q.evaluate(() => ({ v: mm.S.view, di: mm.S.di, ph: mm.S.ph, ink: mm.S.ink.length, res: mm.S.results.length })); expect(r.v === 'play' && r.di === 0 && r.ink === 0 && r.res === 0, JSON.stringify(r)); return r })
await t('通しでエラーなし', async () => { expect(q.errs.length === 0, q.errs.join('|')) })
await q.close()

// 採点・境界
const s = await open(browser)
const runBot = (bot, seed) => s.evaluate(([bot, seed]) => { mm.dbg.pause(true); mm.dbg.quiet(true); mm.dbg.autoplay(bot); mm.startGame(seed); let k = 0; while (mm.S.view !== 'result' && k++ < 60 * 120) mm.dbg.step(1); mm.dbg.autoplay(null); mm.dbg.quiet(false); const r = mm.S.result; return { avg: r.avg, rank: r.rank.ja, scores: r.dishes.map(d => d.score), ids: r.dishes.map(d => d.id), custs: r.dishes.map(d => d.cust), secs: Math.round(k / 60) } }, [bot, seed])
await t('同じ種と同じ手なら同じ点（採点の再現性）', async () => { const a = await runBot('normal', 4242), b = await runBot('normal', 4242); delete a.secs; delete b.secs; expect(JSON.stringify(a) === JSON.stringify(b), JSON.stringify([a, b])); return a })
const dist = {}
await t('台本のボットで分布（上手い＞ふつう＞雑＞何もしない。最初から難しい）', async () => {
  for (const bot of ['good', 'normal', 'sloppy', 'idle']) { dist[bot] = []; for (let i = 1; i <= 8; i++) dist[bot].push(await runBot(bot, i * 7919)) }
  const m = b => Math.round(dist[b].reduce((a, r) => a + r.avg, 0) / dist[b].length * 10) / 10
  const top = dist.good.filter(r => r.rank === '十段').length, ranks = b => dist[b].map(r => r.rank).join(' ')
  const out = { good: m('good'), normal: m('normal'), sloppy: m('sloppy'), idle: m('idle'), goodTop: top, rGood: ranks('good'), rNormal: ranks('normal'), rSloppy: ranks('sloppy'), secs: dist.good[0].secs }
  expect(out.good >= 72 && out.good <= 90 && out.normal >= 40 && out.normal <= 65 && out.sloppy < 35 && out.idle === 0 && dist.idle.every(r => r.rank === '破門'), JSON.stringify(out)); return out
})
await t('1回は60秒前後（台本ボット・何もしない時）', async () => { const g = dist.good.map(r => r.secs), i = dist.idle.map(r => r.secs); expect(Math.max(...g) <= 62 && Math.min(...g) >= 40 && Math.max(...i) <= 66, JSON.stringify({ g, i })); return { good: g[0], idle: i[0] } })
await t('毎回4皿・手がプルプルの皿が1皿以上ある', async () => {
  const all = [...dist.good, ...dist.normal]; const ok = all.every(r => r.ids.length === 4 && (r.ids.includes('tencho') || r.custs.includes('kowa')))
  expect(ok, JSON.stringify(all.slice(0, 3))); return true
})
await t('何も描かない → 0点で「…え、マヨは？」', async () => { const r = await s.evaluate(() => { mm.dbg.quiet(true); mm.startGame(5); let k = 0; while (mm.S.ph !== 'react' && k++ < 60 * 30) mm.dbg.step(1); return { sc: mm.S.results[0].score, line: mm.S.results[0].line, why: mm.S.endWhy } }); expect(r.sc === 0 && r.why === 'time' && /マヨは/.test(r.line), JSON.stringify(r)); return r })
const scen = fn => s.evaluate(fn)
await t('止まって絞るとボトッ（塊）が落ちて減点', async () => {
  const r = await scen(() => { mm.dbg.quiet(true); mm.startGame(11); let k = 0; while (mm.S.ph !== 'draw' && k++ < 900) mm.dbg.step(1)
    mm.dbg.stroke([[0, 0]]); for (let i = 0; i < 60 * 1.6; i++) { mm.dbg.stroke([[0, 0]]); mm.dbg.step(1) } mm.dbg.up(); mm.dbg.step(1); return { blobs: mm.S.blobs, mayo: +mm.S.mayo.toFixed(2) } })
  expect(r.blobs >= 2 && r.mayo < 0.9, JSON.stringify(r)); return r
})
await t('絞りすぎるとマヨ切れで終わる', async () => {
  const r = await scen(() => { mm.dbg.quiet(true); mm.startGame(12); let k = 0; while (mm.S.ph !== 'draw' && k++ < 900) mm.dbg.step(1)
    let a = 0; while (mm.S.ph === 'draw' && a < 60 * 12) { const u = Math.sin(a * 0.05) * 0.8, v = Math.cos(a * 0.071) * 0.8; mm.dbg.stroke([[u, v]]); mm.dbg.step(1); a++ } return { why: mm.S.endWhy, mayo: mm.S.mayo, t: Math.round(a / 6) / 10 } })
  expect(r.why === 'mayo' && r.mayo === 0, JSON.stringify(r)); return r
})
await t('お好み焼きの外に描くと低い点（はみ出し）', async () => {
  const r = await scen(() => { mm.dbg.quiet(true); mm.startGame(13); let k = 0; while (mm.S.ph !== 'draw' && k++ < 900) mm.dbg.step(1)
    for (let a = 0; a < 200; a++) { const ang = a / 200 * 6.283; mm.dbg.stroke([[Math.cos(ang) * 1.25, Math.sin(ang) * 1.25]]); mm.dbg.step(1) } mm.dbg.up(); mm.S.doneReq = true; let j = 0; while (mm.S.ph !== 'react' && j++ < 300) mm.dbg.step(1); return mm.S.results[0].score })
  expect(r < 20, r); return r
})
await t('手がプルプルの皿は、まっすぐ引いても線が揺れる', async () => {
  const r = await scen(() => { mm.dbg.quiet(true); mm.startGame(21); mm.S.dishes[0].shake = 0.045; mm.S.di = -1; mm.S.results = []
    mm.dbg.step(1); let k = 0; while (mm.S.ph !== 'draw' && k++ < 900) mm.dbg.step(1)
    const base = mm.S.ink.length; for (let a = 0; a <= 60; a++) { mm.dbg.stroke([[-0.6 + a * 0.02, 0]]); mm.dbg.step(1) } mm.dbg.up(); mm.dbg.step(1)
    const ys = mm.S.ink.slice(base).map(p => p[1]); return { shake: mm.S.dish.shake, dev: +Math.max(...ys.map(Math.abs)).toFixed(3) } })
  expect(r.shake > 0 && r.dev > 0.02, JSON.stringify(r)); return r
})
await t('残り時間ゼロで時間切れ', async () => { const r = await scen(() => { mm.dbg.quiet(true); mm.startGame(14); let k = 0; while (mm.S.ph !== 'draw' && k++ < 900) mm.dbg.step(1); mm.dbg.setTimeLeft(0.05); mm.dbg.step(5); return mm.S.endWhy }); expect(r === 'time', r) })
await t('採点の境界（空・下絵そのもの）', async () => {
  const r = await scen(() => { const o = mm.ORD.cat; return { empty: mm.scoreDish('cat', [], 0, 0).score, exact: mm.scoreDish('cat', o.samples, o.len, 0).score, shifted: mm.scoreDish('cat', o.samples.map(([x, y]) => [x + 0.1, y - 0.08]), o.len, 0).score, wrong: mm.scoreDish('cat', mm.ORD.love.samples, mm.ORD.love.len, 0).score, blobs: mm.scoreDish('cat', o.samples, o.len, 3).score } })
  expect(r.empty === 0 && r.exact >= 98 && r.shifted >= 90 && r.wrong < 30 && r.blobs === r.exact - 15, JSON.stringify(r)); return r
})
await t('採点・境界でエラーなし', async () => { expect(s.errs.length === 0, s.errs.join('|')) })
await s.close()

// 音
const a = await open(browser)
await t('音: BGM・鉄板・マヨ・声・ボトッが鳴り、エラーなし', async () => {
  await a.evaluate(() => mm.dbg.autoplay('normal')); await a.click('#bStart')
  await a.waitForTimeout(13000)
  const r = await a.evaluate(() => ({ played: mm.Snd.played, st: mm.Snd.ctx && mm.Snd.ctx.state, fps: Math.round(mm.dbg.fps()) }))
  await a.evaluate(() => { mm.Snd.sfx('boto'); mm.Snd.sfx('bupi'); mm.Snd.sfx('slam'); mm.Snd.voice(1, 'mad') })
  const keys = Object.keys(r.played)
  expect((r.st === 'running' && keys.includes('bgm:play') || r.st === 'suspended') && keys.includes('squeeze') && keys.some(k => k.startsWith('voice:')) && keys.includes('flip') && a.errs.length === 0, JSON.stringify(r) + a.errs.join('|')); return { keys: keys.length, fps: r.fps }
})
await t('ミュートで音量が0', async () => { await a.click('#bMute'); const m = await a.evaluate(() => mm.Snd.master.gain.value); await a.click('#bMute'); expect(m === 0, m) })
await a.close()

// 英語
const e = await open(browser)
await t('英語表示（タイトル・遊び方・プレイ・結果に日本語が残らない）', async () => {
  await e.click('#bLang'); const jp = /[぀-ヿ一-鿿]/
  const tt = await e.evaluate(() => document.querySelector('#vTitle').innerText + ' ' + document.querySelector('#bMute').innerText); await e.screenshot({ path: `${ROOT}/shots/en-title.png` })
  await e.click('#bHow'); const ht = await e.evaluate(() => document.querySelector('#vHow').innerText); await e.screenshot({ path: `${ROOT}/shots/en-how.png` })
  await e.click('#bHowStart'); await toPhase(e, 'preview'); const pt = await e.evaluate(() => document.querySelector('#vPlay').innerText)
  await e.evaluate(() => { mm.dbg.autoplay('sloppy'); mm.dbg.quiet(true); mm.startGame(77); let k = 0; while (mm.S.view !== 'result' && k++ < 60 * 120) mm.dbg.step(1); mm.dbg.step(60 * 5); mm.dbg.quiet(false) }); await e.waitForTimeout(600)
  const rt = await e.evaluate(() => document.querySelector('#vResult').innerText); await e.screenshot({ path: `${ROOT}/shots/en-result.png` })
  const card = await e.evaluate(async () => { const c = await mm.drawCard(); return c.width })
  const bad = [tt, ht, pt, rt].filter(x => jp.test(x)).map(x => x.match(/.{0,8}[぀-ヿ一-鿿].{0,8}/)[0])
  expect(!bad.length && card === 1080 && e.errs.length === 0, JSON.stringify(bad) + e.errs.join('|')); return rt.slice(0, 60).replace(/\n/g, ' / ')
})
await e.close()

// 6サイズ × 全画面
for (const [w, h, name] of SIZES) {
  const v = await open(browser, { viewport: { width: w, height: h } })
  const views = {}; await v.waitForTimeout(400)
  views.title = await fit(v); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await v.click('#bHow'); views.how = await fit(v); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await v.click('#bHowBack')
  await v.evaluate(() => mm.dbg.autoplay('normal')); await v.click('#bStart')
  await toPhase(v, 'preview'); await v.evaluate(() => mm.dbg.step(30)); views.preview = await fit(v); const c1 = await noCover(v); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-preview.png` })
  await toPhase(v, 'draw'); await v.evaluate(() => mm.dbg.step(200)); views.draw = await fit(v); const c2 = await noCover(v); await v.evaluate(() => mm.dbg.render()); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-draw.png` })
  await toPhase(v, 'react'); await v.evaluate(() => mm.dbg.step(40)); views.react = await fit(v); await v.evaluate(() => mm.dbg.render()); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-react.png` })
  await v.evaluate(() => { mm.dbg.quiet(true); let k = 0; while (mm.S.view !== 'result' && k++ < 60 * 120) mm.dbg.step(1); mm.dbg.step(60 * 5) }); await v.waitForTimeout(700)
  views.result = await fit(v); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  const clipJa = await btnClip(v)
  await v.click('#bLang'); await v.waitForTimeout(200); views.resultEn = await fit(v); const clipEn = await btnClip(v); await v.screenshot({ path: `${ROOT}/shots/fit-${name}-result-en.png` }); await v.click('#bLang'); await v.waitForTimeout(400)
  await t(`${name}: 結果画面のボタンの文字が切れない（日英）`, async () => { expect(!clipJa.length && !clipEn.length, [clipJa, clipEn]) })
  for (const [vn, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${vn}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: 吹き出し・帯がお題にかぶらない`, async () => { expect(!c1.length && !c2.length, JSON.stringify([c1, c2])) })
  await t(`${name}: 結果の皿が見える大きさ`, async () => { const ts = await v.evaluate(() => document.querySelector('#grid canvas').getBoundingClientRect().width); expect(ts >= 70, ts); return Math.round(ts) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(v); expect(o.sw <= o.W && !o.bad.length && !v.errs.length, JSON.stringify(o) + v.errs.join('|')) })
  await v.close()
}
await browser.close()

// WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで開始 → 指でなぞるとマヨが出る → 結果まで', async () => {
  await wp.tap('#bStart'); await toPhase(wp, 'draw')
  const r = await wp.evaluate(() => {
    const vp = document.querySelector('#vPlay'), st = mm.ORD[mm.S.dish.id].strokes[0], ev = (type, x, y) => vp.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true }))
    const pts = st.map(([u, v]) => mm.uvToScreen(u, v)); ev('pointerdown', pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) { ev('pointermove', pts[i].x, pts[i].y); mm.dbg.step(1) }
    ev('pointerup', pts.at(-1).x, pts.at(-1).y); mm.dbg.step(1); const ink = mm.S.ink.length
    mm.dbg.quiet(true); mm.S.doneReq = true; let k = 0; while (mm.S.view !== 'result' && k++ < 60 * 120) mm.dbg.step(1); mm.dbg.step(60 * 5)
    return { ink, view: mm.S.view, first: mm.S.result.dishes[0].score }
  })
  await wp.waitForTimeout(600); await wp.screenshot({ path: `${ROOT}/shots/webkit-result.png` })
  expect(r.ink > 20 && r.view === 'result' && r.first > 0, JSON.stringify(r)); return r
})
await t('WebKit: 3Dが描けている', async () => { const v = await variance3d(wp); expect(v > 200, v); return v })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
