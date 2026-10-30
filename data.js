// お好み焼きマヨ職人: 文言（日英）・お題の下絵・お客さん・段位。処理は game.js
// 座標は「お好み焼きの半径 = 1」。x は右、y は手前（画面の下）

const TAU = Math.PI * 2
const arc = (cx, cy, rx, ry, a0, a1, n = 28) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]) } return p }
const mirror = s => s.map(([x, y]) => [-x, y])
const wave = (x, y0, y1, amp, n = 14) => { const p = []; for (let i = 0; i <= n; i++) { const k = i / n; p.push([x + Math.sin(k * TAU * 1.25) * amp * (0.4 + k), y0 + (y1 - y0) * k]) } return p }

function heart() {
  const p = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * TAU; const x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); p.push([x * 0.048, (y - 2.5) * 0.048]) }
  return [p]
}
function star() { const p = []; for (let k = 0; k <= 10; k++) { const r = k % 2 ? 0.33 : 0.8, a = -Math.PI / 2 + k * Math.PI / 5; p.push([Math.cos(a) * r, Math.sin(a) * r + 0.05]) } return [p] }
function smile() { return [arc(0, 0, 0.72, 0.72, 0, TAU, 40), [[-0.25, -0.32], [-0.25, -0.1]], [[0.25, -0.32], [0.25, -0.1]], arc(0, 0.04, 0.42, 0.36, 0.15 * Math.PI, 0.85 * Math.PI, 16)] }
function cat() {
  const ear = [[-0.56, -0.16], [-0.5, -0.76], [-0.14, -0.4]]
  const wh1 = [[-0.34, 0.2], [-0.86, 0.1]], wh2 = [[-0.34, 0.31], [-0.86, 0.38]]
  return [arc(0, 0.12, 0.62, 0.52, 0, TAU, 40), ear, mirror(ear), [[-0.25, -0.02], [-0.25, 0.1]], [[0.25, -0.02], [0.25, 0.1]],
    arc(-0.09, 0.24, 0.09, 0.08, 0, Math.PI, 10).reverse().concat(arc(0.09, 0.24, 0.09, 0.08, Math.PI, 0, 10).reverse()), wh1, wh2, mirror(wh1), mirror(wh2)]
}
function fuji() {
  return [[[-0.78, 0.5], [-0.25, -0.48], [0.25, -0.48], [0.78, 0.5]],
    [[-0.43, -0.15], [-0.28, -0.02], [-0.14, -0.17], [0, -0.04], [0.14, -0.17], [0.28, -0.02], [0.43, -0.15]],
    arc(0.55, -0.5, 0.15, 0.15, 0, TAU, 20)]
}
function octo() {
  const head = [[-0.46, 0.16]].concat(arc(0, -0.16, 0.5, 0.46, Math.PI * 0.94, Math.PI * 2.06, 30), [[0.46, 0.16]])
  const legs = [-0.4, -0.2, 0, 0.2, 0.4].map(x => wave(x, 0.18, 0.76, 0.07))
  return [head, ...legs, arc(-0.19, -0.14, 0.08, 0.08, 0, TAU, 12), arc(0.19, -0.14, 0.08, 0.08, 0, TAU, 12), arc(0, 0.05, 0.07, 0.06, 0, TAU, 12)]
}
function love() {
  const x = i => -0.82 + i * 0.44
  return [[[x(0), -0.3], [x(0), 0.3], [x(0) + 0.3, 0.3]],
    arc(x(1) + 0.17, 0, 0.17, 0.3, -Math.PI / 2, Math.PI * 1.5, 30),
    [[x(2), -0.3], [x(2) + 0.17, 0.3], [x(2) + 0.34, -0.3]],
    [[x(3) + 0.32, -0.3], [x(3), -0.3], [x(3), 0.3], [x(3) + 0.32, 0.3]], [[x(3), 0], [x(3) + 0.26, 0]]]
}
function tencho() {
  const st = [[0, 0.17], [-0.15, 0.14], [-0.3, 0.19], [-0.37, 0.29]]
  return [arc(0, 0.05, 0.6, 0.6, 0, TAU, 40), [[-0.53, -0.22], [0.53, -0.22]], [[0.53, -0.27], [0.78, -0.44]], [[0.53, -0.18], [0.8, -0.1]],
    [[-0.32, -0.05], [-0.12, -0.05]], [[0.12, -0.05], [0.32, -0.05]], st, mirror(st), [[-0.12, 0.36], [0.12, 0.36]]]
}

// lv: 1=やさしい 2=ふつう 3=むずかしい。draw=描ける秒数、prev=下絵が見える秒数
const ORDERS = {
  heart: { lv: 1, cust: ['jk'], draw: 7, prev: 1.3, strokes: heart(), name: { ja: 'ハート', en: 'Heart' }, say: { ja: 'ハートでおねがいしまーす！', en: 'A heart, pleeease!' },
    huh: { ja: '…これハート？ おしり？', en: '…a heart? Or a butt?' } },
  star: { lv: 1, cust: ['kid'], draw: 7, prev: 1.3, strokes: star(), name: { ja: 'お星さま', en: 'Star' }, say: { ja: 'おほしさま かいて！', en: 'Draw a star!' },
    huh: { ja: '…ヒトデ？', en: '…a starfish?' } },
  smile: { lv: 1, cust: ['kid'], draw: 7, prev: 1.3, strokes: smile(), name: { ja: 'ニコちゃん', en: 'Smiley' }, say: { ja: 'ニコちゃん かいて！', en: 'Draw a smiley face!' },
    huh: { ja: '…なんで泣いてるの？', en: '…why is it crying?' } },
  cat: { lv: 2, cust: ['jk', 'jii'], draw: 9, prev: 1.2, strokes: cat(), name: { ja: 'ネコ', en: 'Cat' }, say: { ja: 'ネコちゃんで！', en: 'A kitty, please!' },
    huh: { ja: '…これ猫？ ジャガイモ？', en: '…is that a cat? A potato?' } },
  fuji: { lv: 2, cust: ['tourist', 'jii'], draw: 9, prev: 1.2, strokes: fuji(), name: { ja: '富士山', en: 'Mt. Fuji' }, say: { ja: '富士山、たのむわ', en: 'Mt. Fuji, please!' },
    huh: { ja: '…富士山？ プリン？', en: '…Mt. Fuji? Or pudding?' } },
  octo: { lv: 2, cust: ['kid'], draw: 9, prev: 1.2, strokes: octo(), name: { ja: 'タコ', en: 'Octopus' }, say: { ja: 'タコさん かいて！', en: 'Draw an octopus!' },
    huh: { ja: '…タコ？ 宇宙人？', en: '…an octopus? An alien?' } },
  love: { lv: 3, cust: ['tourist'], draw: 10, prev: 1.1, strokes: love(), name: { ja: '「LOVE」', en: '"LOVE"' }, say: { ja: 'LOVE って書いて！', en: 'Write "LOVE", please!' },
    huh: { ja: '…LOVE？ LAVA？', en: '…LOVE? LAVA?' } },
  tencho: { lv: 3, cust: ['tencho'], draw: 10, prev: 1.1, strokes: tencho(), shake: 0.03, name: { ja: '店長の顔', en: "Boss's Face" }, say: { ja: 'ワシの顔、描いてみぃ', en: 'Draw MY face. Go on.' },
    huh: { ja: '…ワシ、こんな顔か？', en: '…is that what I look like?' } },
}

// お客さん。style は髪型、voice は声の高さ
const CUSTOMERS = {
  jk: { skin: '#f6d2b8', hair: '#2b1d16', shirt: '#2d4c8f', pants: '#2a2f45', style: 'twin', voice: 1.55, name: { ja: '女子高生', en: 'Student' } },
  jii: { skin: '#eec39f', hair: '#ebe7df', shirt: '#7a6440', pants: '#3b3428', style: 'bald', voice: 0.72, stache: true, name: { ja: 'おじいちゃん', en: 'Grandpa' } },
  kowa: { skin: '#d9a57f', hair: '#2e221b', shirt: '#c8383a', pants: '#1e1e22', style: 'perm', voice: 0.6, shades: true, chain: true, name: { ja: 'コワモテ', en: 'Tough Guy' } },
  kid: { skin: '#f7d6bd', hair: '#4a3020', shirt: '#f2b630', pants: '#3a5a9a', style: 'cap', voice: 1.85, name: { ja: 'こども', en: 'Kid' } },
  tourist: { skin: '#f8dcc8', hair: '#e8c45a', shirt: '#2fa585', pants: '#d8c7a2', style: 'hat', voice: 1.2, name: { ja: '観光客', en: 'Tourist' } },
  tencho: { skin: '#e6b48c', hair: '#2a2420', shirt: '#f4f1ea', pants: '#2a2a2e', style: 'hachi', voice: 0.85, stache: true, name: { ja: '店長', en: 'Boss' } },
}
const KOWA_SHAKE = 0.045

// 段位（4皿の平均点）
const RANKS = [
  { min: 90, ja: '十段', en: '10th Dan', tja: 'マヨ人間国宝', ten: 'Living Mayo Treasure', tier: 'gold' },
  { min: 85, ja: '九段', en: '9th Dan', tja: '鉄板の魔術師', ten: 'Griddle Wizard', tier: 'gold' },
  { min: 79, ja: '八段', en: '8th Dan', tja: 'マヨの申し子', ten: 'Born from Mayo', tier: 'gold' },
  { min: 73, ja: '七段', en: '7th Dan', tja: '屋台の看板職人', ten: 'Star of the Stall', tier: 'red' },
  { min: 66, ja: '六段', en: '6th Dan', tja: '行列ができる腕前', ten: 'People Line Up for You', tier: 'red' },
  { min: 58, ja: '五段', en: '5th Dan', tja: 'そこそこの職人', ten: 'Decent Craftsman', tier: 'red' },
  { min: 50, ja: '四段', en: '4th Dan', tja: '見せられる絵', ten: 'Almost Showable', tier: 'red' },
  { min: 42, ja: '三段', en: '3rd Dan', tja: '味でカバー', ten: 'The Taste Will Save It', tier: 'red' },
  { min: 34, ja: '二段', en: '2nd Dan', tja: '雰囲気は伝わる', ten: 'You Get the Vibe', tier: 'red' },
  { min: 26, ja: '初段', en: '1st Dan', tja: 'ギリギリ職人', ten: 'Barely a Pro', tier: 'red' },
  { min: 16, ja: '三級', en: '3rd Kyu', tja: 'マヨの無駄づかい', ten: 'Mayo Waster', tier: 'gray' },
  { min: 6, ja: '九級', en: '9th Kyu', tja: '前衛芸術家', ten: 'Avant-Garde Artist', tier: 'gray' },
  { min: -1, ja: '破門', en: 'Expelled', tja: 'お好み焼きへの冒涜', ten: 'An Insult to Okonomiyaki', tier: 'black' },
]

const LINES = {
  wow: { ja: ['神や…！', '写真撮ってええ？', '食べるのもったいない！', 'プロや…！'], en: ['A god…!', 'Can I take a pic?', "Too pretty to eat!", "You're a pro…!"] },
  ok: { ja: ['おお、まあまあやな', 'うん…伝わる伝わる', 'ギリわかる！', '味はうまそう'], en: ['Hey, not bad', 'Yeah… I get it', 'I can tell. Barely!', 'Looks tasty at least'] },
  mad: { ja: ['マヨ返せ！', 'お好み焼きに謝れ！', 'これはもう事件や', '店長呼んで！'], en: ['Give me back my mayo!', 'Apologize to the okonomiyaki!', 'This is a crime scene', 'Get me the manager!'] },
  none: { ja: '…え、マヨは？', en: '…um, where is the mayo?' },
  blob: { ja: 'この白い塊なに…？', en: 'What is this white lump…?' },
  wowBoss: { ja: 'ワシより男前やないか…', en: "That's handsomer than me…" },
  madBoss: { ja: 'クビや！ 皿洗いからや！', en: "You're fired! Go wash dishes!" },
  kowaSay: { ja: '…{name}、描けや。', en: '…{name}. Draw it. Now.' },
  kowaMad: { ja: 'あぁ？ なめとんのか', en: 'Huh? You messing with me?' },
}

const TXT = {
  ja: {
    title: 'お好み焼きマヨ職人', titleA: 'お好み焼き', titleB: 'マヨ職人', sub: 'お客さんの注文どおりに、マヨで絵を描け。',
    host: '店長', hostLine: '今日からマヨ担当や。注文の下絵は一瞬しか見せへんで。よう覚えて描くんやぞ。',
    start: '屋台に立つ', how: '遊び方', back: 'もどる', again: 'もう一回焼く', save: '結果画像を保存', share: '結果画像をシェア', toTitle: 'タイトル',
    howTitle: '遊び方',
    how1: '注文の下絵が一瞬だけ出て消える。形を覚える',
    how2T: '指でなぞってマヨを絞る。お好み焼きからはみ出さない', how2M: 'マウスでドラッグしてマヨを絞る。お好み焼きからはみ出さない',
    how3: '止まるとボトッと塊が落ちる。マヨは減っていく',
    how4: '形・はみ出し・量で採点。4皿の平均で段位が決まる',
    howNote: '手がプルプル震える注文もある。描けたら「できた」',
    dish: '{n}皿目', remember: 'おぼえて！', go: '描け！', timeUp: '時間切れ！', mayoOut: 'マヨ切れ！', done: 'できた', finished: 'できた！',
    shaky: '手がプルプル…', boto: 'ボトッ', bupi: 'ブピッ', mayo: 'マヨ',
    tutT: '指でなぞってマヨを絞る', tutM: 'ドラッグしてマヨを絞る', tut2: '止まるとボトッ',
    looking: 'じーっ…',
    resHead: '本日の作品', resRank: 'マヨ職人', resAvg: '平均 {n}点', pts: '{n}点', order: 'お題',
    shape: '形', out: 'はみ出し', amount: '量', tapSkip: 'タップで飛ばす',
    cardFoot: 'tom3games.github.io/mayo-master', saved: '画像を保存しました', shared: 'シェアしました', lang: 'EN',
    noren: 'お好み焼', shareText: 'お好み焼きマヨ職人で「{rank}」でした',
  },
  en: {
    title: 'MAYO MASTER', titleA: 'Okonomiyaki', titleB: 'MAYO MASTER', sub: 'Draw what the customer orders. In mayonnaise.',
    host: 'Boss', hostLine: "You're on mayo duty. The sketch only flashes for a moment, so remember it and draw!",
    start: 'Start Cooking', how: 'How to Play', back: 'Back', again: 'Cook Again', save: 'Save Result Image', share: 'Share Result Image', toTitle: 'Title',
    howTitle: 'How to Play',
    how1: 'The sketch flashes for a moment, then vanishes. Remember it',
    how2T: 'Trace with your finger to squeeze mayo. Stay on the pancake', how2M: 'Drag the mouse to squeeze mayo. Stay on the pancake',
    how3: 'Stop moving and a big blob drops. Mayo runs out',
    how4: 'Scored on shape, overflow and amount. 4 dishes decide your rank',
    howNote: 'Some orders make your hands shake. Hit "Done" when finished',
    dish: 'Dish {n}', remember: 'Remember!', go: 'Draw!', timeUp: "Time's up!", mayoOut: 'Out of mayo!', done: 'Done', finished: 'Done!',
    shaky: 'Shaky hands…', boto: 'SPLOT', bupi: 'PFFT', mayo: 'MAYO',
    tutT: 'Trace to squeeze mayo', tutM: 'Drag to squeeze mayo', tut2: 'Stop = blob',
    looking: 'staring…',
    resHead: "Today's Works", resRank: 'MAYO MASTER', resAvg: 'Avg {n} pts', pts: '{n} pts', order: 'Order',
    shape: 'Shape', out: 'Overflow', amount: 'Amount', tapSkip: 'Tap to skip',
    cardFoot: 'tom3games.github.io/mayo-master', saved: 'Image saved', shared: 'Shared', lang: '日本語',
    noren: 'お好み焼', shareText: 'I got "{rank}" in MAYO MASTER',
  },
}
