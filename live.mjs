// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// 遊びの通し: タイトル → 4皿（台本ボット）→ 結果まで
import { chromium, webkit } from 'playwright'
const URL0 = 'https://tom3games.github.io/mayo-master/'
const out = []
const ID = new RegExp(['tmk', '4men'].join(''), 'i')  // 個人のIDを直接書かない
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__mmReady, null, { timeout: 15000 })
  // 遊びの通し（タイトル → 4皿 → 結果）
  if (name === 'webkit') await p.tap('#bStart'); else await p.click('#bStart')
  const r = await p.evaluate(() => { mm.dbg.pause(true); mm.dbg.quiet(true); mm.dbg.autoplay('normal'); let k = 0; while (mm.S.view !== 'result' && k++ < 60 * 120) mm.dbg.step(1); mm.dbg.step(60 * 5); return mm.S.result && mm.S.result.rank.ja })
  await p.waitForTimeout(600); out.push(`${name}: rank=${r}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(), p = await b.newPage()
for (const u of ['https://github.com/tom3games/mayo-master', 'https://github.com/tom3games/mayo-master/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} personal-id=${ID.test(await p.content()) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
