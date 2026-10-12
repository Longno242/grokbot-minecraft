const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const collectBlock = require('mineflayer-collectblock').plugin
const pvp = require('mineflayer-pvp').plugin
const { Vec3 } = require('vec3')
const http = require('http')
const B = require('./builds')
const HOST = process.env.MC_HOST || 'localhost', PORT = +(process.env.MC_PORT || 25565)
const NAME = process.env.MC_NAME || 'GrokBot', VERSION = '26.1', HTTP_PORT = 3001
const MAX_BUILD = 200000, MAX_TERRAIN = 500000, WATCH_MAX = 6000, FILL_MAX = 32768
let bot, mcData, guardPos = null, guardPlayer = null, busy = false, building = false, cancelBuild = false
let mode = 'watch', speed = 8
const undoStack = []

function createBot () {
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: NAME, version: VERSION })
  bot.loadPlugin(pathfinder); bot.loadPlugin(collectBlock); bot.loadPlugin(pvp)
  bot.once('spawn', () => {
    mcData = require('minecraft-data')(bot.version)
    const mv = new Movements(bot); mv.allow1by1towers = true
    bot.pathfinder.setMovements(mv)
    console.log('Spawned as', bot.username, 'mode', bot.game.gameMode); bot.chat('GrokBot online. Say "help" or "list".')
  })
  bot.on('chat', (user, msg) => { if (user !== bot.username) handle(msg, user).catch(e => reply('Error: ' + e.message)) })
  bot.on('messagestr', m => { if (/Unknown or incomplete|permission|not loaded|Too many blocks|Incorrect argument|Invalid/i.test(m)) console.log('SERVER:', m) })
  bot.on('death', () => { console.log('Died'); bot.pvp.stop(); bot.pathfinder.setGoal(null) })
  bot.on('health', autoEat)
  bot.on('physicsTick', guardTick)
  bot.on('kicked', r => console.log('Kicked:', JSON.stringify(r)))
  bot.on('error', e => console.log('Error:', e.message))
  bot.on('end', r => { building = false; console.log('Disconnected (' + r + '), reconnecting in 5s'); setTimeout(createBot, 5000) })
}
function reply (t) { console.log('>', t); try { bot.chat(String(t).slice(0, 250)) } catch {} }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const creative = () => bot.game.gameMode === 'creative'
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const HOSTILE = e => e && (e.type === 'hostile' || e.kind === 'Hostile mobs') && e.name !== 'enderman'
function nearestHostile (pos, r = 16) { return bot.nearestEntity(e => HOSTILE(e) && e.position.distanceTo(pos || bot.entity.position) < r) }
async function autoEat () {
  if (busy || creative() || bot.food >= 16 || !mcData) return
  const food = bot.inventory.items().find(i => mcData.foodsByName && mcData.foodsByName[i.name])
  if (!food) return
  busy = true
  try { await bot.equip(food, 'hand'); await bot.consume() } catch {} finally { busy = false }
}
function guardTick () {
  if (!guardPos && !guardPlayer) return
  const p = guardPlayer ? bot.players[guardPlayer]?.entity : null
  const center = p ? p.position : guardPos
  if (!center) return
  const mob = nearestHostile(center, 12)
  if (mob) { if (bot.pvp.target !== mob) bot.pvp.attack(mob) }
  else if (!bot.pvp.target && !bot.pathfinder.isMoving() && bot.entity.position.distanceTo(center) > 3)
    bot.pathfinder.setGoal(new goals.GoalNear(center.x, center.y, center.z, 2))
}
function stopAll () { guardPos = guardPlayer = null; cancelBuild = true; bot.pvp.stop(); bot.pathfinder.setGoal(null); try { bot.collectBlock.cancelTask() } catch {} }
const isNum = s => /^-?\d+(\.\d+)?$/.test(s)
function parseArgs (a) { const nums = a.filter(isNum).map(Number); const words = a.filter(x => !isNum(x)); return { nums, name: words.join('_').toLowerCase() } }
function blockName (name, def) {
  if (!name) return def
  name = name.replace(/^minecraft:/, '').replace(/[\s-]+/g, '_')
  if (mcData.blocksByName[name]) return name
  for (const alt of [name + 's', name.replace(/s$/, ''), name + '_block', name + '_planks']) if (mcData.blocksByName[alt]) return alt
  throw new Error('Unknown block: ' + name)
}
async function give (name) {
  const Item = require('prismarine-item')(bot.registry)
  const it = mcData.itemsByName[name]; if (!it) throw new Error('No item for ' + name)
  if (creative()) await bot.creative.setInventorySlot(36, new Item(it.id, 64))
  else await cmd(`give @s ${name} 64`)
  await sleep(300)
  const have = bot.inventory.items().find(i => i.name === name)
  if (have) await bot.equip(have, 'hand')
}
async function collect (names, n) {
  const ids = names.map(x => mcData.blocksByName[x]?.id).filter(x => x !== undefined)
  if (!ids.length) return reply('Unknown block: ' + names.join(','))
  let got = 0
  while (got < n) {
    const blk = bot.findBlock({ matching: ids, maxDistance: 64 })
    if (!blk) { reply('No more found nearby.'); break }
    if (creative()) { await bot.pathfinder.goto(new goals.GoalLookAtBlock(blk.position, bot.world)); await bot.dig(blk) } else await bot.collectBlock.collect(blk)
    got++
  }
  reply(`${creative() ? 'Broke' : 'Collected'} ${got} block(s).`)
}
async function cmd (c) { bot.chat('/' + c); await sleep(15) }
const P = v => `${v.x} ${v.y} ${v.z}`
const F = (x1, y1, z1, x2, y2, z2, block, mode) => ({ fill: [new Vec3(x1, y1, z1), new Vec3(x2, y2, z2)], block, mode })
const S = (x, y, z, block) => ({ set: new Vec3(x, y, z), block })
function viewer (user) { const pl = user ? bot.players[user]?.entity : null; return pl || bot.entity }
function ahead (user, dist) {
  const e = viewer(user); const base = e.position.floored()
  return base.offset(Math.round(-Math.sin(e.yaw) * dist), 0, Math.round(-Math.cos(e.yaw) * dist))
}
// structures
function structOps (kind, o, n, blk) {
  switch (kind) {
    case 'tower': { const h = n[0] || 10; return [F(o.x, o.y, o.z, o.x, o.y + h - 1, o.z, blk)] }
    case 'wall': { const len = n[0] || 7, h = n[1] || 3; return [F(o.x, o.y, o.z, o.x + len - 1, o.y + h - 1, o.z, blk)] }
    case 'platform': { const w = n[0] || 7, l = n[1] || w; return [F(o.x, o.y - 1, o.z, o.x + w - 1, o.y - 1, o.z + l - 1, blk)] }
    case 'pyramid': { const s = n[0] || 7, out = []
      for (let i = 0; 2 * i < s; i++) out.push(F(o.x + i, o.y + i, o.z + i, o.x + s - 1 - i, o.y + i, o.z + s - 1 - i, blk)); return out }
    case 'sphere': { const r = n[0] || 4, c = o.offset(r, r, r), out = []
      for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) { const d = Math.hypot(x, y, z); if (d <= r + 0.5 && d > r - 0.5) out.push(S(c.x + x, c.y + y, c.z + z, blk)) }
      return out }
  }
}
function houseOps (o, blk) {
  const x2 = o.x + 6, z2 = o.z + 6, y = o.y, mx = o.x + 3, mz = o.z + 3
  const roofBlk = blk === 'oak_planks' ? 'spruce_planks' : blk, ops = []
  ops.push(F(o.x, y - 1, o.z, x2, y - 1, z2, blk))            // floor
  ops.push(F(o.x, y, o.z, x2, y + 3, z2, blk, 'hollow'))       // walls (hollow box)
  ops.push(F(o.x + 1, y + 3, o.z + 1, x2 - 1, y + 3, z2 - 1, 'air')) // open top layer inside
  ops.push(F(mx, y, o.z, mx, y + 1, o.z, 'air'))              // door gap
  for (const [x, z] of [[o.x, mz], [x2, mz], [mx, z2], [o.x + 1, o.z], [x2 - 1, o.z]]) ops.push(S(x, y + 1, z, 'glass'))
  for (let i = 0; i <= 4; i++) ops.push(F(o.x - 1 + i, y + 4 + i, o.z - 1 + i, x2 + 1 - i, y + 4 + i, z2 + 1 - i, roofBlk, i < 4 ? 'outline' : undefined))
  ops.push(S(mx, y + 2, mz, 'lantern'))
  return ops
}

// ---------- terrain ----------
function noise2 (seed) { const p = Array.from({ length: 6 }, (_, i) => [Math.sin(seed * (i + 1)) * 1000 % 6.28, 0.05 + 0.1 * i, (seed * 13 * (i + 3)) % 6.28])
  return (x, z) => p.reduce((s, [a, f, b]) => s + Math.sin(x * f + a) * Math.cos(z * f * 1.3 + b), 0) / 3 } // ~ -1..1
function columns (c, r, heightFn, layerFn) { // heightFn(dx,dz)-> h (0 = skip); layerFn(h,i,dx,dz)-> block at layer i (0-based from ground)
  const ops = []
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const h = Math.round(heightFn(dx, dz)); if (h <= 0) continue
    const x = c.x + dx, z = c.z + dz, y0 = c.y
    let start = 0
    for (let i = 0; i <= h; i++) { // merge runs of same block
      const b = i < h ? layerFn(h, i, dx, dz) : null
      if (i === h || b !== layerFn(h, start, dx, dz)) {
        const blk = layerFn(h, start, dx, dz)
        ops.push(i - 1 === start ? S(x, y0 + start, z, blk) : F(x, y0 + start, z, x, y0 + i - 1, z, blk)); start = i
      }
    }
  }
  return ops
}
const TREES = { oak: 'oak', birch: 'birch', spruce: 'spruce', pine: 'pine', jungle: 'jungle_tree', acacia: 'acacia', dark_oak: 'dark_oak', cherry: 'cherry', big_oak: 'fancy_oak', fancy_oak: 'fancy_oak', mangrove: 'mangrove', mega_spruce: 'mega_spruce', azalea: 'azalea_tree' }
function treeOp (x, y, z, type) { const f = TREES[type] || 'oak'; return [S(x, y - 1, z, 'grass_block'), { raw: `place feature minecraft:${f} ${x} ${y} ${z}` }] }
function terrainOps (kind, user, n, name) {
  const seed = Math.random() * 100, nz = noise2(seed), rnd = Math.random
  const size = n[0]
  switch (kind) {
    case 'mountain': { const s = size || 40, r = Math.floor(s / 2), H = Math.round(s * 0.6), c = ahead(user, r + 4)
      return columns(c, r, (dx, dz) => { const d = Math.hypot(dx, dz) / r * (1 + 0.25 * nz(dx, dz)); return d >= 1 ? 0 : H * Math.pow(1 - d, 1.6) * (0.85 + 0.3 * nz(dz * 1.7, dx * 1.7)) },
        (h, i) => { const top = i === h - 1; if (h > H * 0.62 && i >= h - 2) return 'snow_block'; if (h > H * 0.4) return i >= h - 1 && h < H * 0.5 ? 'grass_block' : (i % 7 === 3 ? 'andesite' : 'stone'); return top ? 'grass_block' : i >= h - 3 ? 'dirt' : 'stone' }) }
    case 'hill': { const s = size || 30, r = Math.floor(s / 2), H = Math.max(3, Math.round(s / 5)), c = ahead(user, r + 4)
      return columns(c, r, (dx, dz) => { const d = Math.hypot(dx, dz) / r * (1 + 0.15 * nz(dx, dz)); return d >= 1 ? 0 : H * (Math.cos(d * Math.PI) + 1) / 2 }, (h, i) => i === h - 1 ? 'grass_block' : 'dirt') }
    case 'volcano': { const s = size || 40, r = Math.floor(s / 2), H = Math.round(s * 0.55), cr = Math.max(2, Math.round(r * 0.22)), c = ahead(user, r + 4)
      const ops = columns(c, r, (dx, dz) => { const d = Math.hypot(dx, dz); const dd = d / r * (1 + 0.15 * nz(dx, dz)); if (dd >= 1) return 0; const h = H * (1 - dd) * (0.9 + 0.2 * nz(dz, dx)); return d < cr ? H * 0.75 : h },
        (h, i, dx, dz) => { const d = Math.hypot(dx, dz); if (d < cr && i >= h - 2) return 'lava'; if (d < cr + 1.5 && i >= h - 2) return 'magma_block'; const v = nz(dx * 2 + i, dz * 2); return v > 0.3 ? 'basalt' : v < -0.3 ? 'blackstone' : 'stone' })
      return ops }
    case 'lake': { const s = size || 20, r = Math.floor(s / 2), c = ahead(user, r + 4), y = c.y - 1, ops = [], minY = -63
      for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) {
        const d = Math.hypot(dx, dz) / r * (1 + 0.25 * nz(dx, dz)); const x = c.x + dx, z = c.z + dz
        if (d < 1) { const depth = Math.max(1, Math.round(3 * (1 - d))); const bot0 = Math.max(minY, y - depth + 1); ops.push(F(x, bot0, z, x, y, z, 'water')); ops.push(S(x, bot0 - 1, z, d > 0.6 ? 'sand' : 'gravel')) }
        else if (d < 1.2) ops.push(S(x, y, z, 'sand'))
      }
      return ops }
    case 'river': { const len = size || 60, e = viewer(user), dir = new Vec3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)), side = new Vec3(-dir.z, 0, dir.x)
      const start = e.position.floored().plus(dir.scaled(4)), y = start.y - 1, ops = [], done = new Set()
      for (let t = 0; t < len; t += 0.5) { const off = 5 * Math.sin(t / 9 + seed) + 2 * nz(t, 0); const w = 2 + Math.round(1 + nz(0, t))
        for (let s2 = -w - 1; s2 <= w + 1; s2++) { const p = start.plus(dir.scaled(t)).plus(side.scaled(off + s2)).floored(); const k = p.x + ',' + p.z; if (done.has(k)) continue; done.add(k)
          if (Math.abs(s2) <= w) { ops.push(F(p.x, Math.max(-63, y - 1), p.z, p.x, y, p.z, 'water')); ops.push(S(p.x, Math.max(-64, y - 2), p.z, 'gravel')) } else ops.push(S(p.x, y, p.z, 'sand')) } }
      // shore cells may have been overwritten by water later; water wins
      return ops.sort((a, b) => (a.block === 'sand' ? 0 : 1) - (b.block === 'sand' ? 0 : 1)) }
    case 'island': { const s = size || 30, R = Math.floor(s / 2), r = Math.floor(R * 0.6), c = ahead(user, R + 4), y = c.y - 1, ops = []
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { const d = Math.hypot(dx, dz) / R * (1 + 0.15 * nz(dx, dz)); if (d < 1) ops.push(F(c.x + dx, Math.max(-63, y - 2), c.z + dz, c.x + dx, y, c.z + dz, 'water')) }
      const H = Math.max(3, Math.round(r / 2))
      ops.push(...columns(c.offset(0, -3, 0), r, (dx, dz) => { const d = Math.hypot(dx, dz) / r * (1 + 0.2 * nz(dz, dx)); return d >= 1 ? 0 : 3 + H * Math.pow(1 - d, 0.8) }, (h, i) => i === h - 1 ? (h < 5 ? 'sand' : 'grass_block') : h < 5 ? 'sand' : 'dirt'))
      for (let k = 0; k < Math.max(1, Math.round(r / 4)); k++) { const a = rnd() * 6.28, d = rnd() * r * 0.4, x = c.x + Math.round(Math.cos(a) * d), z = c.z + Math.round(Math.sin(a) * d)
        ops.push({ raw: `place feature minecraft:${rnd() < 0.5 ? 'oak' : 'birch'} ${x} ${y + H + 3} ${z}`, late: true }) }
      return ops }
    case 'tree': { const o = ahead(user, 4); return treeOp(o.x, o.y, o.z, name || 'oak') }
    case 'forest': { const cnt = Math.min(size || 15, 200), R = Math.round(Math.sqrt(cnt) * 4), c = ahead(user, R + 3), ops = [], types = name ? [name] : ['oak', 'oak', 'birch', 'fancy_oak', 'spruce']
      for (let k = 0; k < cnt; k++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * R; ops.push(...treeOp(c.x + Math.round(Math.cos(a) * d), c.y, c.z + Math.round(Math.sin(a) * d), types[k % types.length])) }
      return ops }
  }
}


// ================= build engine =================
const FLAT = y => y <= -64 ? 'bedrock' : y <= -62 ? 'dirt' : y === -61 ? 'grass_block' : 'air'
const baseName = b => b.split('[')[0]
function curName (x, y, z) { const b = bot.blockAt(new Vec3(x, y, z)); return b ? b.name : FLAT(y) }
const volOf = o => o.fill ? (Math.abs(o.fill[0].x - o.fill[1].x) + 1) * (Math.abs(o.fill[0].y - o.fill[1].y) + 1) * (Math.abs(o.fill[0].z - o.fill[1].z) + 1) : 1
function boxOf (o) { const [a, b] = o.fill; return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)] }
function splitOps (ops) {
  const out = []
  const push = (x1, y1, z1, x2, y2, z2, block, mode) => {
    const v = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1)
    if (v <= FILL_MAX) return out.push(F(x1, y1, z1, x2, y2, z2, block, mode))
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1
    if (dx >= dy && dx >= dz) { const m = x1 + (dx >> 1); push(x1, y1, z1, m, y2, z2, block, mode); push(m + 1, y1, z1, x2, y2, z2, block, mode) } else if (dy >= dz) { const m = y1 + (dy >> 1); push(x1, y1, z1, x2, m, z2, block, mode); push(x1, m + 1, z1, x2, y2, z2, block, mode) } else { const m = z1 + (dz >> 1); push(x1, y1, z1, x2, y2, m, block, mode); push(x1, y1, m + 1, x2, y2, z2, block, mode) }
  }
  for (const o of ops) {
    if (!o.fill || volOf(o) <= FILL_MAX) { out.push(o); continue }
    const [x1, y1, z1, x2, y2, z2] = boxOf(o)
    if (o.mode === 'hollow' || o.mode === 'outline') {
      if (o.mode === 'hollow' && x2 - x1 > 1 && y2 - y1 > 1 && z2 - z1 > 1) push(x1 + 1, y1 + 1, z1 + 1, x2 - 1, y2 - 1, z2 - 1, 'air')
      push(x1, y1, z1, x2, y1, z2, o.block); push(x1, y2, z1, x2, y2, z2, o.block); push(x1, y1, z1, x1, y2, z2, o.block); push(x2, y1, z1, x2, y2, z2, o.block); push(x1, y1, z1, x2, y2, z1, o.block); push(x1, y1, z2, x2, y2, z2, o.block)
    } else push(x1, y1, z1, x2, y2, z2, o.block, o.mode === 'keep' ? 'keep' : undefined)
  }
  return out
}
function toCmd (o) {
  if (o.raw) return o.raw
  if (o.set) return `setblock ${P(o.set)} ${o.block}`
  return `fill ${P(o.fill[0])} ${P(o.fill[1])} ${o.block}${o.mode ? ' ' + o.mode : ''}`
}
function raster (ops) {
  const map = new Map(), raws = []
  for (const o of ops) {
    if (o.raw) { raws.push(o); continue }
    if (o.set) { map.set(`${o.set.x},${o.set.y},${o.set.z}`, o.block); continue }
    const [x1, y1, z1, x2, y2, z2] = boxOf(o)
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) {
      const k = `${x},${y},${z}`, shell = x === x1 || x === x2 || y === y1 || y === y2 || z === z1 || z === z2
      if (o.mode === 'hollow') map.set(k, shell ? o.block : 'air')
      else if (o.mode === 'outline') { if (shell) map.set(k, o.block) } else if (o.mode === 'keep') { if (!map.has(k) || map.get(k) === 'air') map.set(k, o.block) } else map.set(k, o.block)
    }
  }
  return { map, raws }
}
function mergeRuns (entries) { // entries: [x,y,z,block]
  entries.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0])
  const out = []; let cur = null
  for (const [x, y, z, b] of entries) {
    if (cur && cur.y === y && cur.z === z && cur.b === b && cur.x2 === x - 1 && x - cur.x1 < 256) cur.x2 = x
    else { if (cur) out.push(F(cur.x1, y === cur.y ? cur.y : cur.y, cur.z, cur.x2, cur.y, cur.z, cur.b)); cur = { x1: x, x2: x, y, z, b } }
  }
  if (cur) out.push(F(cur.x1, cur.y, cur.z, cur.x2, cur.y, cur.z, cur.b))
  return out.map(o => (o.fill[0].x === o.fill[1].x ? S(o.fill[0].x, o.fill[0].y, o.fill[0].z, o.block) : o))
}
async function sendBatch (ops) {
  let vol = 0, cnt = 0
  for (const o of ops) {
    if (cancelBuild) break
    bot.chat('/' + toCmd(o)); vol += volOf(o); cnt++
    if (cnt >= 40 || vol >= 60000) { await sleep(vol >= 60000 ? 120 : 50); cnt = 0; vol = 0 }
  }
  await sleep(50)
}
const DEFER = /hanging=true|ladder|torch|vine|_button|lever|banner|carpet|rail|lily_pad|_door|_bed|dripstone|amethyst_cluster|_bud|lantern|potted_|flower_pot|^water|^lava|campfire|chain|sea_pickle|poppy|dandelion|allium|bluet|cornflower|daisy|lily_of_the_valley|tulip|rose_bush|peony|lilac|sunflower|_mushroom$|dead_bush|wheat|carrots|potatoes|beetroots|cactus|sapling|azalea$|fern$|short_grass|trapdoor|lightning_rod|snow\[/
let heldName = null
function holdItem (b) {
  const nm = baseName(b); if (nm === heldName || !creative()) return
  const it = mcData.itemsByName[nm]; if (!it) return
  heldName = nm; const Item = require('prismarine-item')(bot.registry)
  bot.creative.setInventorySlot(36, new Item(it.id, 1)).catch(() => {})
}
async function watchBlocks (solids) {
  const main = solids.filter(e => !DEFER.test(e[3])), late = solids.filter(e => DEFER.test(e[3]))
  main.sort((a, b) => a[1] - b[1] || a[0] - b[0] || (a[0] % 2 ? b[2] - a[2] : a[2] - b[2]))
  bot.creative.startFlying()
  let n = 0
  for (const [x, y, z, blk] of [...main, ...late]) {
    if (cancelBuild) break
    const target = new Vec3(x + 0.5, y + 0.5, z + 0.5), me = bot.entity.position
    if (me.distanceTo(target) > 4.5 || (me.y < y + 1.5 && Math.abs(me.x - target.x) < 1 && Math.abs(me.z - target.z) < 1)) { bot.chat(`/tp @s ${x + 0.5} ${y + 2} ${z - 0.5}`); await sleep(40) }
    holdItem(blk)
    bot.lookAt(target, true).catch(() => {}); bot.swingArm()
    bot.chat(`/setblock ${x} ${y} ${z} ${blk}`)
    n++
    await sleep(1000 / speed)
  }
  return n
}
async function watchLayers (solids) {
  const layers = new Map()
  for (const e of solids) { if (!layers.has(e[1])) layers.set(e[1], []); layers.get(e[1]).push(e) }
  bot.creative.startFlying()
  for (const y of [...layers.keys()].sort((a, b) => a - b)) {
    if (cancelBuild) break
    const L = layers.get(y); const cx = L.reduce((s, e) => s + e[0], 0) / L.length, cz = L.reduce((s, e) => s + e[2], 0) / L.length
    bot.chat(`/tp @s ${cx.toFixed(1)} ${y + 3} ${cz.toFixed(1)}`); await sleep(40)
    bot.lookAt(new Vec3(cx, y, cz), true).catch(() => {}); bot.swingArm()
    await sendBatch(mergeRuns(L.map(e => [...e])))
    await sleep(Math.max(80, 2000 / speed))
  }
}
async function execute (ops, label, { cap, terrain }) {
  if (building) return reply('Already building - say stop first.')
  ops = [...ops.filter(o => !o.late), ...ops.filter(o => o.late)]
  const vol = ops.reduce((s, o) => s + (o.raw ? 0 : volOf(o)), 0)
  if (vol > cap) return reply(`Too big: ~${vol} blocks (cap ${cap}). Use a smaller size.`)
  building = true; cancelBuild = false
  const t0 = Date.now()
  try {
    const { map, raws } = raster(ops)
    const snap = new Map(), bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    const note = (x, y, z) => { const k = `${x},${y},${z}`; if (!snap.has(k)) snap.set(k, curName(x, y, z)); bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.min(bb[2], z); bb[3] = Math.max(bb[3], x); bb[4] = Math.max(bb[4], y); bb[5] = Math.max(bb[5], z) }
    for (const k of map.keys()) { const [x, y, z] = k.split(',').map(Number); note(x, y, z) }
    for (const r of raws) {
      if (r.region) { const [a, c] = r.region; for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) for (let z = a.z; z <= c.z; z++) note(x, y, z) }
      const m = r.raw.match(/ (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/); if (m && !r.region) note(Math.floor(+m[1]), Math.floor(+m[2]), Math.floor(+m[3]))
    }
    undoStack.push({ label, snap, bb }); if (undoStack.length > 5) undoStack.shift()
    const solids = [], airs = []
    for (const [k, blk] of map) {
      const [x, y, z] = k.split(',').map(Number), was = snap.get(k)
      if (blk === 'air') { if (was !== 'air' && was !== 'cave_air') airs.push([x, y, z, 'air']) } else if (baseName(blk) !== was || blk.includes('[')) solids.push([x, y, z, blk])
    }
    let how = 'fast'
    if (mode === 'watch') how = terrain || solids.length > WATCH_MAX ? 'layers' : 'blocks'
    reply(`Building ${label}: ${solids.length} blocks to place (${how === 'blocks' ? `watch mode, ${speed}/s, ~${Math.ceil(solids.length / speed)}s` : how === 'layers' ? 'watch mode, layer by layer' : 'fast mode'}).`)
    if (how === 'fast') await sendBatch(splitOps(ops.filter(o => !o.raw)))
    else {
      await sendBatch(mergeRuns(airs))
      if (how === 'blocks') await watchBlocks(solids); else await watchLayers(solids)
    }
    for (const r of raws) { if (cancelBuild) break; bot.chat('/' + r.raw); await sleep(how === 'blocks' ? 1000 / speed : 30) }
  } finally { building = false; try { bot.creative.stopFlying() } catch {} }
  reply(`${cancelBuild ? 'Stopped' : 'Done'}: ${label} in ${Math.round((Date.now() - t0) / 1000)}s. ("undo" removes it)`)
}
async function undo () {
  if (building) return reply('Busy - say stop first.')
  const u = undoStack.pop(); if (!u) return reply('Nothing to undo.')
  building = true; cancelBuild = false
  try {
    const entries = []; for (const [k, b] of u.snap) { const [x, y, z] = k.split(',').map(Number); entries.push([x, y, z, b]) }
    const byName = {}; for (const e of entries) byName[e[3]] = (byName[e[3]] || 0) + 1
    reply(`Undoing ${u.label} (${entries.length} blocks)...`)
    const restore = mergeRuns(entries.filter(e => e[3] === 'air')).concat(mergeRuns(entries.filter(e => e[3] !== 'air')))
    await sendBatch(restore)
    const [x1, y1, z1, x2, y2, z2] = u.bb
    if (isFinite(x1)) bot.chat(`/kill @e[type=!player,x=${x1},y=${y1},z=${z1},dx=${x2 - x1},dy=${y2 - y1 + 2},dz=${z2 - z1}]`)
  } finally { building = false }
  reply(`Undone: ${u.label}.`)
}
async function clearArea (r, user) {
  if (building) return reply('Busy - say stop first.')
  r = clamp(r || 20, 1, 96)
  const p = viewer(user).position.floored()
  building = true; cancelBuild = false
  try {
    reply(`Clearing radius ${r} around ${p.x} ${p.z} (flat ground restored, cannot be undone)...`)
    const ops = splitOps([F(p.x - r, -60, p.z - r, p.x + r, Math.min(319, -60 + Math.max(64, 2 * r)), p.z + r, 'air'), F(p.x - r, -61, p.z - r, p.x + r, -61, p.z + r, 'grass_block'), F(p.x - r, -63, p.z - r, p.x + r, -62, p.z + r, 'dirt')])
    await sendBatch(ops)
    bot.chat(`/kill @e[type=!player,x=${p.x},y=${p.y},z=${p.z},distance=..${r + 2}]`)
  } finally { building = false }
  reply('Cleared.')
}
const TERRAIN = ['mountain', 'hill', 'lake', 'tree', 'forest', 'river', 'volcano', 'island']
const OLD = ['house', 'modern', 'tower', 'wall', 'pyramid', 'platform', 'sphere', ...TERRAIN]
function resolveKind (words) {
  for (let k = Math.min(3, words.length); k >= 1; k--) {
    const cand = words.slice(0, k).join('').toLowerCase()
    if (k === 1 && OLD.includes(cand)) return [cand, 1]
    const r = B.resolve(cand); if (r) return [r, k]
  }
  return [null, 0]
}
async function handleBuild (a, user) {
  if (user && !bot.players[user]?.entity) { await cmd(`tp @s ${user}`); await sleep(1500) }
  const words = []; for (const x of a) { if (isNum(x)) break; words.push(x) }
  const [kind, used] = resolveKind(words)
  if (!kind) return reply('Unknown build. Say "list" to see everything I can build.')
  const rest = a.slice(used), { nums, name } = parseArgs(rest)
  if (kind === 'modern') { const t = (rest[0] || 'normal').toLowerCase(); if (!['simple', 'normal', 'advanced'].includes(t)) return reply('build modern simple|normal|advanced'); return execute(require('./modern')(t, viewer(user)), 'modern ' + t + ' house', { cap: MAX_BUILD }) }
  if (TERRAIN.includes(kind)) return execute(terrainOps(kind, user, nums, name), kind, { cap: MAX_TERRAIN, terrain: true })
  if (OLD.includes(kind)) {
    const o = ahead(user, 3)
    if (kind === 'house') return execute(houseOps(o, blockName(name, 'oak_planks')), 'house', { cap: MAX_BUILD })
    const def = kind === 'platform' || kind === 'pyramid' ? 'stone' : 'oak_planks'
    return execute(structOps(kind, o, nums, blockName(name, def)), kind, { cap: MAX_BUILD })
  }
  const d = B.BUILDS[kind]; const L = B.makeL(viewer(user), d.off || 4)
  d.fn(L, nums, name)
  return execute(L.ops, kind, { cap: d.terrain ? MAX_TERRAIN : MAX_BUILD, terrain: !!d.terrain })
}
function listBuilds () {
  const lines = ['Structures: house [block], modern simple|normal|advanced, tower/wall/pyramid/platform/sphere <block> <size>, fill x1 y1 z1 x2 y2 z2 <block>']
  lines.push('Terrain: mountain|hill|lake|volcano|island <size>, river <len>, tree [type], forest <n> [type]')
  let cur = 'More: '
  for (const [k, d] of Object.entries(B.BUILDS)) { const t = `${k}${d.args ? ' ' + d.args : ''}, `; if ((cur + t).length > 240) { lines.push(cur); cur = '' } cur += t }
  lines.push(cur.replace(/, $/, ''))
  lines.push(`Mode: ${mode} (mode watch|fast), speed ${speed}/s (speed <n>), undo, clear <radius>, stop`)
  return lines
}

async function handle (msg, user) {
  const [cmd0, ...a] = msg.trim().split(/\s+/); const c = (cmd0 || '').toLowerCase()
  const pl = user ? bot.players[user]?.entity : null
  switch (c) {
    case 'help':
      reply('Move: come, follow, stop, goto x y z, fly [h], land | Items: give <block>, inv | Fight: attack, guard | mine <block> [n], chop [n], say <text>')
      reply('Build: build <thing> [options] - say "list" for all builds | mode watch|fast | speed <blocks/s> | undo | clear <radius>')
      return
    case 'list': case 'builds': for (const l of listBuilds()) { reply(l); await sleep(200) } return
    case 'mode': if (!['watch', 'fast'].includes((a[0] || '').toLowerCase())) return reply(`Mode is ${mode}. Use: mode watch | mode fast`); mode = a[0].toLowerCase(); return reply(`Build mode: ${mode}`)
    case 'speed': { const n = +a[0]; if (!(n > 0)) return reply(`Speed is ${speed} blocks/s. Use: speed <1-200>`); speed = clamp(n, 1, 200); return reply(`Watch speed: ${speed} blocks/s`) }
    case 'undo': return undo()
    case 'clear': return clearArea(+a[0] || 20, user)
    case 'come': if (!pl) { if (user) { await cmd(`tp @s ${user}`); return reply('Here!') } return reply("I can't see you.") } stopAll()
      if (creative()) { await cmd(`tp @s ${user}`); return reply('Here!') }
      bot.pathfinder.setGoal(new goals.GoalNear(pl.position.x, pl.position.y, pl.position.z, 1)); return reply('Coming!')
    case 'follow': if (!pl) return reply("I can't see you."); stopAll()
      bot.pathfinder.setGoal(new goals.GoalFollow(pl, 2), true); return reply('Following ' + user)
    case 'stop': stopAll(); return reply('Stopped.')
    case 'mine': { const { nums, name } = parseArgs(a); if (!name) return reply('Usage: mine <block> [n]'); return collect([blockName(name)], nums[0] || 1) }
    case 'chop': return collect(Object.keys(mcData.blocksByName).filter(x => x.endsWith('_log')), +a[0] || 5)
    case 'attack': { const m = nearestHostile(null, 24); if (!m) return reply('No hostile mobs nearby.'); bot.pvp.attack(m); return reply('Attacking ' + m.name) }
    case 'guard': stopAll(); if (pl) guardPlayer = user; else guardPos = bot.entity.position.clone(); return reply('Guarding ' + (pl ? user : 'this spot'))
    case 'goto': { const [x, y, z] = a.map(Number); if ([x, y, z].some(isNaN)) return reply('Usage: goto x y z'); stopAll()
      if (creative()) { await cmd(`tp @s ${x + 0.5} ${y} ${z + 0.5}`); return reply('Arrived.') }
      bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z)); return reply(`Going to ${x} ${y} ${z}`) }
    case 'inv': { const it = bot.inventory.items(); return reply(it.length ? it.map(i => `${i.name} x${i.count}`).join(', ') : 'Inventory empty.') }
    case 'give': { const n = blockName(parseArgs(a).name, 'stone'); await give(n); return reply('Holding ' + n) }
    case 'build': return handleBuild(a, user)
    case 'fill': { const { nums, name } = parseArgs(a); if (nums.length < 6) return reply('Usage: fill x1 y1 z1 x2 y2 z2 <block>')
      const [x1, y1, z1, x2, y2, z2] = nums; return execute([F(x1, y1, z1, x2, y2, z2, blockName(name, 'stone'))], 'fill', { cap: MAX_BUILD }) }
    case 'fly': { if (!creative()) return reply('Fly needs creative.'); bot.creative.startFlying(); const p = bot.entity.position; await cmd(`tp @s ${p.x} ${p.y + (+a[0] || 10)} ${p.z}`); return reply('Flying.') }
    case 'land': bot.creative.stopFlying(); return reply('Landing.')
    case 'say': return bot.chat(a.join(' '))
    case 'serverstop': return cmd('stop')
  }
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost'); const c = u.searchParams.get('c'); const as = u.searchParams.get('user') || null
  if (u.pathname === '/status') { const p = bot?.entity?.position; return res.end(JSON.stringify({ mode, speed, pos: p, building, undo: undoStack.map(x => x.label) }) + '\n') }
  if (u.pathname === '/block') { const b = bot.blockAt(new Vec3(+u.searchParams.get('x'), +u.searchParams.get('y'), +u.searchParams.get('z'))); return res.end((b ? b.name : 'unloaded') + '\n') }
  if (u.pathname === '/count') {
    const q = k => +u.searchParams.get(k); const cnt = {}
    for (let x = Math.min(q('x1'), q('x2')); x <= Math.max(q('x1'), q('x2')); x++) for (let y = Math.min(q('y1'), q('y2')); y <= Math.max(q('y1'), q('y2')); y++) for (let z = Math.min(q('z1'), q('z2')); z <= Math.max(q('z1'), q('z2')); z++) { const b = bot.blockAt(new Vec3(x, y, z)); const n = b ? b.name : 'unloaded'; cnt[n] = (cnt[n] || 0) + 1 }
    return res.end(JSON.stringify(cnt) + '\n') }
  if (u.pathname !== '/cmd' || !c) { res.writeHead(400); return res.end('use /cmd?c=<command>[&user=<player>], /status, /block?x=&y=&z=, /count?x1..z2\n') }
  handle(c, as).catch(e => reply('Error: ' + e.message)); res.end('ok: ' + c + '\n')
}).listen(HTTP_PORT, '127.0.0.1', () => console.log('HTTP control on http://localhost:' + HTTP_PORT + '/cmd?c=...'))
createBot()
