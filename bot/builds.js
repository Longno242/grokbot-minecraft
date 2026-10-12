// Build library. Local coords: u = right of the viewer, v = up (0 = feet level, ground top is v=-1), w = away from the viewer.
// Front of each build faces the viewer. Builders push ops: {fill:[a,b],block,mode} | {set:v,block} | {raw:cmd,late,region}
const { Vec3 } = require('vec3')
const NAMES = { '1,0': 'east', '-1,0': 'west', '0,1': 'south', '0,-1': 'north' }
const rnd = Math.random, ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = arr => arr[Math.floor(rnd() * arr.length)]
const odd = n => n % 2 ? n : n + 1
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const FLOWERS = ['poppy', 'dandelion', 'allium', 'azure_bluet', 'cornflower', 'oxeye_daisy', 'lily_of_the_valley', 'red_tulip', 'pink_tulip', 'orange_tulip', 'white_tulip']
const TALL = ['rose_bush', 'peony', 'lilac', 'sunflower']
const conn = (b, dir) => { const s = /_wall$/.test(b) ? 'low' : 'true'; return dir === 'U' ? `${b}[{R}=${s},{L}=${s}]` : `${b}[{F}=${s},{B}=${s}]` }
function noise2 (seed) { const p = Array.from({ length: 6 }, (_, i) => [Math.sin(seed * (i + 1)) * 1000 % 6.28, 0.05 + 0.1 * i, (seed * 13 * (i + 3)) % 6.28])
  return (x, z) => p.reduce((s, [a, f, b]) => s + Math.sin(x * f + a) * Math.cos(z * f * 1.3 + b), 0) / 3 }

function builder (base, u, d, ops) {
  const nm = v => NAMES[v.x + ',' + v.z]
  const TOK = { F: nm(d.scaled(-1)), B: nm(d), R: nm(u), L: nm(u.scaled(-1)), AU: u.x ? 'x' : 'z', AW: d.x ? 'x' : 'z' }
  const T = s => s.replace(/\{(F|B|R|L|AU|AW)\}/g, (_, k) => TOK[k])
  const W = (a, v, c) => base.plus(u.scaled(Math.round(a))).plus(d.scaled(Math.round(c))).offset(0, Math.round(v), 0)
  const L = {
    ops, T, W,
    box (u1, v1, w1, u2, v2, w2, b, mode) { ops.push({ fill: [W(u1, v1, w1), W(u2, v2, w2)], block: T(b), mode }) },
    set (a, v, c, b) { ops.push({ set: W(a, v, c), block: T(b) }) },
    summon (type, a, v, c, nbt = '') { const p = W(a, v, c); ops.push({ raw: `summon minecraft:${type} ${p.x + 0.5} ${p.y} ${p.z + 0.5}${nbt ? ' ' + nbt : ''}`, late: true }) },
    feature (f, a, v, c) { const p = W(a, v, c); ops.push({ raw: `place feature minecraft:${f} ${p.x} ${p.y} ${p.z}`, late: true, region: [p.offset(-5, -1, -5), p.offset(5, 24, 5)] }) },
    sub (du, dw, flip = false) { return builder(W(du, 0, dw), flip ? u.scaled(-1) : u, flip ? d.scaled(-1) : d, ops) },
    walls (u1, w1, u2, w2, v1, v2, b) { L.box(u1, v1, w1, u2, v2, w1, b); L.box(u1, v1, w2, u2, v2, w2, b); L.box(u1, v1, w1, u1, v2, w2, b); L.box(u2, v1, w1, u2, v2, w2, b) },
    clear (u1, w1, u2, w2, h = 20, ground = 'grass_block') { L.box(u1, 0, w1, u2, h, w2, 'air'); L.box(u1, -1, w1, u2, -1, w2, ground) },
    cyl (cu, cw, r, v1, v2, b, hollow = false) {
      const R = Math.ceil(r + 1)
      for (let a = -R; a <= R; a++) {
        let lo = null, hi = null
        for (let c = -R; c <= R; c++) {
          const dd = Math.hypot(a, c); if (dd > r + 0.5) continue
          if (hollow) { if (dd > r - 1) L.box(cu + a, v1, cw + c, cu + a, v2, cw + c, b) } else { if (lo === null) lo = c; hi = c }
        }
        if (!hollow && lo !== null) L.box(cu + a, v1, cw + lo, cu + a, v2, cw + hi, b)
      }
    },
    sphere (cu, cv, cw, r, b, hollow = false, cond = null) {
      const R = Math.ceil(r + 0.5)
      for (let a = -R; a <= R; a++) for (let v = -R; v <= R; v++) {
        let lo = null, hi = null
        for (let c = -R; c <= R + 1; c++) {
          const dd = Math.hypot(a, v, c)
          const inside = c <= R && dd <= r + 0.5 && (!hollow || dd > r - 1) && (!cond || cond(a, v, c))
          if (inside) { if (lo === null) lo = c; hi = c } else if (lo !== null) { L.box(cu + a, cv + v, cw + lo, cu + a, cv + v, cw + hi, b); lo = null }
        }
      }
    },
    line (a1, v1, c1, a2, v2, c2, b) { const n = Math.max(Math.abs(a2 - a1), Math.abs(v2 - v1), Math.abs(c2 - c1), 1); for (let i = 0; i <= n; i++) { const t = i / n; L.set(a1 + (a2 - a1) * t, v1 + (v2 - v1) * t, c1 + (c2 - c1) * t, b) } },
    gable (u1, u2, w1, w2, v0, stair, fillb, ridge) {
      for (let i = 0; ; i++) {
        const aL = u1 - 1 + i, aR = u2 + 1 - i, v = v0 + i
        if (aL > aR) break
        if (aL === aR) { L.box(aL, v, w1 - 1, aL, v, w2 + 1, ridge || fillb); break }
        L.box(aL, v, w1 - 1, aL, v, w2 + 1, `${stair}[facing={R}]`); L.box(aR, v, w1 - 1, aR, v, w2 + 1, `${stair}[facing={L}]`)
        if (aL + 1 <= aR - 1) { L.box(aL + 1, v, w1, aR - 1, v, w1, fillb); L.box(aL + 1, v, w2, aR - 1, v, w2, fillb) }
      }
    },
    door (a, c, wood, hinge = 'left', v = 0, facing = '{B}') { L.set(a, v, c, `${wood}_door[facing=${facing},half=lower,hinge=${hinge}]`); L.set(a, v + 1, c, `${wood}_door[facing=${facing},half=upper,hinge=${hinge}]`) },
    bed (a, v, c, color, dir = 'B') { const o = { B: [0, 1], F: [0, -1], R: [1, 0], L: [-1, 0] }[dir]; L.set(a, v, c, `${color}_bed[facing={${dir}},part=foot]`); L.set(a + o[0], v, c + o[1], `${color}_bed[facing={${dir}},part=head]`) },
    lineU (u1, u2, v, c, b) { L.box(u1, v, c, u2, v, c, conn(b, 'U')) },
    lineW (a, v, c1, c2, b) { L.box(a, v, c1, a, v, c2, conn(b, 'W')) },
    fenceRect (u1, w1, u2, w2, v, b) { L.lineU(u1, u2, v, w1, b); L.lineU(u1, u2, v, w2, b); L.lineW(u1, v, w1 + 1, w2 - 1, b); L.lineW(u2, v, w1 + 1, w2 - 1, b) },
    lamp (a, c, h = 3, post = 'spruce_fence', light = 'lantern', v0 = 0) { L.box(a, v0, c, a, v0 + h - 1, c, post); L.set(a, v0 + h, c, light) },
    flower (a, c, v = 0) { L.set(a, v, c, pick(FLOWERS)) },
    tall (a, c, f, v = 0) { f = f || pick(TALL); L.set(a, v, c, `${f}[half=lower]`); L.set(a, v + 1, c, `${f}[half=upper]`) },
    pane (b, dir) { return conn(b || 'glass_pane', dir) }
  }
  return L
}
function makeL (entity, off = 4) {
  const dx = -Math.sin(entity.yaw), dz = -Math.cos(entity.yaw)
  const d = Math.abs(dx) > Math.abs(dz) ? new Vec3(Math.sign(dx), 0, 0) : new Vec3(0, 0, Math.sign(dz))
  const u = new Vec3(-d.z, 0, d.x)
  return builder(entity.position.floored().plus(d.scaled(off)), u, d, [])
}
const PU = 'glass_pane[{R}=true,{L}=true]', PW = 'glass_pane[{F}=true,{B}=true]'

// ---------- shared pieces ----------
const PALS = [
  { frame: 'quartz_pillar[axis=y]', glass: 'light_blue_stained_glass', floor: 'smooth_stone', band: 'quartz_block' },
  { frame: 'polished_blackstone', glass: 'gray_stained_glass', floor: 'polished_andesite', band: 'black_concrete' },
  { frame: 'white_concrete', glass: 'cyan_stained_glass', floor: 'smooth_stone', band: 'light_gray_concrete' },
  { frame: 'iron_block', glass: 'glass', floor: 'polished_diorite', band: 'iron_block' },
  { frame: 'polished_deepslate', glass: 'tinted_glass', floor: 'polished_deepslate', band: 'deepslate_tiles' },
  { frame: 'bricks', glass: 'brown_stained_glass', floor: 'spruce_planks', band: 'stone_bricks' },
  { frame: 'smooth_sandstone', glass: 'blue_stained_glass', floor: 'cut_sandstone', band: 'chiseled_sandstone' }]
function sky (L, a0, c0, wd, dp, h, pal) {
  const a1 = a0 + wd - 1, c1 = c0 + dp - 1, ma = Math.floor((a0 + a1) / 2), mc = Math.floor((c0 + c1) / 2)
  L.box(a0, -1, c0, a1, -1, c1, pal.floor)
  L.walls(a0, c0, a1, c1, 0, h - 1, pal.glass)
  for (let a = a0; a <= a1; a += 3) { L.box(a, 0, c0, a, h - 1, c0, pal.frame); L.box(a, 0, c1, a, h - 1, c1, pal.frame) }
  for (let c = c0; c <= c1; c += 3) { L.box(a0, 0, c, a0, h - 1, c, pal.frame); L.box(a1, 0, c, a1, h - 1, c, pal.frame) }
  for (const [a, c] of [[a0, c0], [a1, c0], [a0, c1], [a1, c1]]) L.box(a, 0, c, a, h, c, pal.frame)
  for (let v = 4; v < h; v += 4) { L.box(a0 + 1, v, c0 + 1, a1 - 1, v, c1 - 1, pal.floor); L.walls(a0, c0, a1, c1, v, v, pal.band); L.set(ma, v, mc, 'sea_lantern') }
  L.box(a0, h, c0, a1, h, c1, pal.band); L.walls(a0, c0, a1, c1, h + 1, h + 1, pal.frame)
  L.box(ma - 1, h + 1, mc - 1, ma + 1, h + 3, mc + 1, pal.band)
  const ant = Math.max(2, Math.floor(h / 8)); L.box(ma, h + 4, mc, ma, h + 3 + ant, mc, 'iron_bars'); L.set(ma, h + 4 + ant, mc, 'lightning_rod')
  L.box(ma - 1, 0, c0, ma + 1, 2, c0, 'air'); L.box(ma - 2, 3, c0 - 2, ma + 2, 3, c0 - 1, pal.band); L.set(ma, 2, c0 - 1, 'lantern[hanging=true]')
  L.set(ma, 0, c0 + 2, 'potted_fern'); L.set(ma - 2, 0, c0 + 2, 'potted_bamboo')
}
function cottage (L) {
  L.clear(-6, -3, 6, 10, 12)
  L.box(-4, -1, 0, 4, -1, 6, 'oak_planks')
  L.walls(-4, 0, 4, 6, 0, 3, 'cobblestone'); L.walls(-4, 0, 4, 6, 1, 3, 'oak_planks')
  for (const [a, c] of [[-4, 0], [4, 0], [-4, 6], [4, 6]]) L.box(a, 0, c, a, 3, c, 'oak_log[axis=y]')
  L.gable(-4, 4, 0, 6, 4, 'brick_stairs', 'oak_planks', 'brick_slab')
  L.door(0, 0, 'oak'); L.set(-2, 1, 0, PU); L.set(2, 1, 0, PU); L.set(-4, 1, 3, PW); L.set(4, 1, 3, PW)
  L.box(-3, 4, 3, 3, 4, 3, 'stripped_oak_log[axis={AU}]'); L.set(0, 3, 3, 'lantern[hanging=true]')
  L.bed(3, 0, 4, 'blue'); L.set(-3, 0, 5, 'crafting_table'); L.set(-2, 0, 5, 'furnace[facing={F}]'); L.set(-3, 0, 1, 'chest[facing={R}]')
  L.set(-2, 0, -1, 'potted_red_tulip'); L.set(2, 0, -1, 'composter'); L.box(0, -1, -3, 0, -1, -1, 'dirt_path')
}
function cabin (L) {
  L.clear(-7, -4, 7, 10, 13)
  L.box(-4, -1, -3, 4, -1, 6, 'spruce_planks')
  L.box(-4, 0, 0, 4, 3, 0, 'spruce_log[axis={AU}]'); L.box(-4, 0, 6, 4, 3, 6, 'spruce_log[axis={AU}]')
  L.box(-4, 0, 1, -4, 3, 5, 'spruce_log[axis={AW}]'); L.box(4, 0, 1, 4, 3, 5, 'spruce_log[axis={AW}]')
  for (const [a, c] of [[-4, 0], [4, 0], [-4, 6], [4, 6]]) L.box(a, 0, c, a, 3, c, 'stripped_spruce_log[axis=y]')
  L.gable(-4, 4, 0, 6, 4, 'dark_oak_stairs', 'spruce_planks', 'dark_oak_slab')
  L.door(0, 0, 'spruce'); L.set(-2, 1, 0, PU); L.set(2, 1, 0, PU); L.set(-4, 1, 3, PW); L.set(4, 1, 3, PW)
  L.box(-4, 0, -3, -4, 2, -3, 'spruce_fence'); L.box(4, 0, -3, 4, 2, -3, 'spruce_fence'); L.box(-5, 3, -3, 5, 3, -1, 'spruce_slab')
  L.set(0, 2, -2, 'lantern[hanging=true]'); L.set(-3, 0, -2, 'oak_stairs[facing={B}]'); L.set(3, 0, -2, 'barrel[facing=up]')
  L.box(-6, 0, 3, -5, 9, 4, 'cobblestone'); L.set(-6, 10, 3, 'campfire[lit=true]')
  L.box(-3, 4, 3, 3, 4, 3, 'stripped_spruce_log[axis={AU}]'); L.set(0, 3, 3, 'lantern[hanging=true]')
  L.bed(3, 0, 4, 'red'); L.set(-3, 0, 5, 'furnace[facing={R}]'); L.set(-3, 0, 4, 'smoker[facing={R}]'); L.set(-3, 0, 1, 'crafting_table'); L.set(3, 0, 1, 'chest[facing={L}]')
  L.box(-1, 0, 2, 1, 0, 4, 'brown_carpet')
  L.box(5, 0, 0, 6, 0, 1, 'oak_log[axis={AW}]'); L.set(5, 1, 0, 'oak_log[axis={AW}]')
}
function medieval (L) {
  L.clear(-8, -3, 8, 11, 17)
  L.box(-4, -1, 0, 4, -1, 7, 'cobblestone')
  L.walls(-4, 0, 4, 7, 0, 3, 'stone_bricks'); L.walls(-4, 0, 4, 7, 0, 0, 'cobblestone')
  for (const [a, c] of [[-4, 0], [4, 0], [-4, 7], [4, 7]]) L.box(a, 0, c, a, 3, c, 'oak_log[axis=y]')
  L.box(-5, 4, -1, 5, 4, 8, 'spruce_planks')
  L.walls(-5, -1, 5, 8, 5, 7, 'white_terracotta')
  for (const a of [-5, -2, 2, 5]) { L.box(a, 5, -1, a, 7, -1, 'dark_oak_log[axis=y]'); L.box(a, 5, 8, a, 7, 8, 'dark_oak_log[axis=y]') }
  for (const c of [2, 5]) { L.box(-5, 5, c, -5, 7, c, 'dark_oak_log[axis=y]'); L.box(5, 5, c, 5, 7, c, 'dark_oak_log[axis=y]') }
  L.box(-5, 4, -1, 5, 4, -1, 'dark_oak_log[axis={AU}]'); L.box(-5, 4, 8, 5, 4, 8, 'dark_oak_log[axis={AU}]')
  L.gable(-5, 5, -1, 8, 8, 'spruce_stairs', 'white_terracotta', 'spruce_slab')
  L.door(0, 0, 'spruce')
  for (const a of [-2, 2]) L.set(a, 1, 0, PU)
  L.set(-4, 1, 3, PW); L.set(4, 1, 3, PW)
  for (const a of [-3, 0, 3]) L.set(a, 6, -1, PU)
  L.set(-5, 6, 3, PW); L.set(5, 6, 3, PW)
  L.box(6, 0, 5, 6, 13, 6, 'cobblestone'); L.set(6, 14, 5, 'campfire[lit=true]')
  L.set(0, 3, 3, 'lantern[hanging=true]'); L.set(3, 5, 6, 'lantern')
  L.bed(-3, 5, 5, 'red'); L.set(2, 5, 6, 'bookshelf'); L.set(1, 5, 6, 'lectern[facing={F}]')
  L.set(3, 0, 6, 'furnace[facing={F}]'); L.set(2, 0, 6, 'crafting_table'); L.set(1, 0, 6, 'barrel[facing=up]'); L.set(-3, 0, 6, 'chest[facing={F}]')
  L.box(-1, 0, 2, 1, 0, 4, 'red_carpet')
  for (let v = 0; v <= 4; v++) L.set(-3, v, 1, 'ladder[facing={B}]')
  L.box(0, -1, -3, 0, -1, -1, 'dirt_path'); L.set(-2, 0, -1, 'flowering_azalea'); L.set(2, 0, -1, 'hay_block')
}

const PIXEL = {
  creeper: { p: { G: 'lime_concrete', g: 'green_concrete', B: 'black_concrete' }, rows: ['GgGGGgGG', 'GGgGGGgG', 'GBBGgBBG', 'gBBGGBBG', 'GGgBBGGg', 'GgBBBBGG', 'GGBBBBgG', 'GgBGGBGG'] },
  heart: { p: { R: 'red_concrete', r: 'red_terracotta', W: 'white_concrete' }, rows: ['.RR...RR.', 'RWRR.RRrR', 'RWRRRRRrR', 'RRRRRRRrR', '.RRRRRrR.', '..RRRrR..', '...RrR...', '....R....'] },
  smiley: { p: { Y: 'yellow_concrete', B: 'black_concrete' }, rows: ['..YYYYYY..', '.YYYYYYYY.', 'YYBYYYYBYY', 'YYBYYYYBYY', 'YYYYYYYYYY', 'YBYYYYYYBY', 'YYBYYYYBYY', 'YYYBBBBYYY', '.YYYYYYYY.', '..YYYYYY..'] },
  sword: { p: { W: 'cyan_concrete', L: 'light_blue_concrete', B: 'brown_concrete', S: 'dark_oak_planks' }, rows: ['..........WW', '.........WLW', '........WLW.', '.......WLW..', '......WLW...', '.....WLW....', '.B..WLW.....', '..BWLW......', '..BBW.......', '.SBBB.......', 'S..B........', 'SS..........'] },
  pig: { p: { P: 'pink_concrete', D: 'pink_terracotta', B: 'black_concrete', W: 'white_concrete' }, rows: ['PPPPPPPP', 'PPPPPPPP', 'PWBPPBWP', 'PPPPPPPP', 'PPDDDDPP', 'PPDBBDPP', 'PPDDDDPP', 'PPPPPPPP'] },
  diamond: { p: { C: 'cyan_terracotta', L: 'light_blue_concrete', W: 'white_concrete' }, rows: ['..CCCC..', '.CLLLLC.', 'CLWLLLLC', 'CLLLLLLC', '.CLLLLC.', '..CLLC..', '...CC...'] },
  mushroom: { p: { R: 'red_concrete', W: 'white_concrete', S: 'white_terracotta', B: 'black_concrete' }, rows: ['...RRRR...', '.RRWWRRRR.', 'RRWWWWRWWR', 'RRRWWRRWWR', 'RRRRRRRRRR', '.RSSSSSSR.', '..SBSSBS..', '..SSSSSS..', '...SSSS...'] }
}
function pixelart (L, n, name) {
  const art = PIXEL[name] || PIXEL.creeper, s = clamp(n[0] || 2, 1, 6), H = art.rows.length, Wd = art.rows[0].length
  L.box(-Math.ceil(Wd * s / 2) - 1, 0, 0, Math.ceil(Wd * s / 2) + 1, H * s + 1, 1, 'air')
  art.rows.forEach((row, r) => {
    const v = (H - 1 - r) * s
    let i = 0
    while (i < Wd) {
      const ch = row[i]; let j = i; while (j + 1 < Wd && row[j + 1] === ch) j++
      if (ch !== '.') { const a0 = i * s - Math.floor(Wd * s / 2); L.box(a0, v, 1, a0 + (j - i + 1) * s - 1, v + s - 1, 1, art.p[ch]) }
      i = j + 1
    }
  })
}
function statue (L, n, name) {
  const s = clamp(n[0] || 1, 1, 4)
  const U = (u1, v1, c1, u2, v2, c2, b) => L.box(u1 * s, 1 + v1 * s, c1 * s + 2, (u2 + 1) * s - 1, 1 + (v2 + 1) * s - 1, (c2 + 1) * s - 1 + 2, b)
  L.box(-6 * s, 0, -2 + 2, 6 * s, 17 * s + 2, 6 * s + 2, 'air')
  L.box(-5 * s - 1, 0, -s + 1, 5 * s, 0, 5 * s + 2, 'polished_andesite')
  if (name === 'creeper') {
    U(-2, 0, -1, 1, 2, 0, 'green_concrete'); U(-2, 0, 3, 1, 2, 4, 'green_concrete')
    U(-2, 3, 1, 1, 10, 2, 'lime_concrete'); U(-2, 11, 0, 1, 14, 3, 'lime_concrete')
    U(-2, 12, 0, -2, 13, 0, 'black_concrete'); U(1, 12, 0, 1, 13, 0, 'black_concrete'); U(-1, 10, 0, 0, 12, 0, 'black_concrete')
    U(-1, 6, 1, -1, 6, 1, 'green_concrete'); U(0, 8, 2, 0, 8, 2, 'green_concrete')
  } else if (name === 'golem') {
    U(-2, 0, 1, -1, 4, 2, 'iron_block'); U(0, 0, 1, 1, 4, 2, 'iron_block')
    U(-3, 5, 0, 2, 10, 3, 'iron_block'); U(-5, 2, 1, -4, 10, 2, 'iron_block'); U(3, 2, 1, 4, 10, 2, 'iron_block')
    U(-1, 11, 0, 0, 13, 2, 'iron_block'); U(-1, 12, 0, -1, 12, 0, 'red_concrete'); U(0, 12, 0, 0, 12, 0, 'red_concrete')
    U(-2, 7, 0, 1, 8, 0, 'moss_block'); U(3, 2, 0, 3, 2, 0, 'red_concrete')
  } else {
    U(-2, 0, 1, 1, 5, 2, 'blue_concrete'); U(-2, 0, 1, 1, 0, 2, 'gray_concrete')
    U(-2, 6, 1, 1, 11, 2, 'cyan_concrete')
    U(-4, 6, 1, -3, 11, 2, 'white_terracotta'); U(2, 6, 1, 3, 11, 2, 'white_terracotta'); U(-4, 10, 1, -3, 11, 2, 'cyan_concrete'); U(2, 10, 1, 3, 11, 2, 'cyan_concrete')
    U(-2, 12, 0, 1, 15, 3, 'white_terracotta'); U(-2, 15, 0, 1, 15, 3, 'brown_concrete'); U(-2, 12, 3, 1, 14, 3, 'brown_concrete')
    U(-2, 14, 0, -2, 14, 3, 'brown_concrete'); U(1, 14, 0, 1, 14, 3, 'brown_concrete')
    U(-2, 13, 0, -2, 13, 0, 'white_concrete'); U(-1, 13, 0, -1, 13, 0, 'blue_concrete'); U(0, 13, 0, 0, 13, 0, 'blue_concrete'); U(1, 13, 0, 1, 13, 0, 'white_concrete')
    U(-1, 12, 0, 0, 12, 0, 'brown_terracotta')
  }
}
function ship (L, n, pirate) {
  const len = clamp(n[0] || 28, 16, 80), mw = Math.max(3, Math.round(len / 7))
  const hull = pirate ? 'dark_oak_planks' : 'oak_planks', trim = pirate ? 'black_concrete' : 'spruce_planks', deck = pirate ? 'spruce_planks' : 'birch_planks', sail = pirate ? 'black_wool' : 'white_wool'
  L.clear(-mw - 7, -7, mw + 7, len + 6, 34)
  L.box(-mw - 6, -3, -6, mw + 6, -1, len + 5, 'water')
  const hw = w => { const t = w / (len - 1); return Math.max(1, Math.round(mw * Math.sqrt(Math.min(1, t * 3.2)) * (t > 0.92 ? 0.85 : 1))) }
  for (let w = 0; w < len; w++) {
    const H = hw(w)
    for (let v = -2; v <= 1; v++) {
      const lh = Math.max(0, H - (1 - v))
      if (v === -2) L.box(-lh, v, w, lh, v, w, hull)
      else { if (lh >= 2) L.box(-lh + 1, v, w, lh - 1, v, w, 'air'); L.set(-lh, v, w, v === 0 ? trim : hull); L.set(lh, v, w, v === 0 ? trim : hull) }
    }
    L.box(-H, 2, w, H, 2, w, deck); L.set(-H, 2, w, hull); L.set(H, 2, w, hull)
    if (w < len - 6) { L.set(-H, 3, w, conn('spruce_fence', 'W')); L.set(H, 3, w, conn('spruce_fence', 'W')) }
  }
  L.line(0, 3, -1, 0, 6, -5, 'spruce_fence')
  const s0 = len - 6
  for (let w = s0; w < len; w++) { const H = hw(w); L.set(-H, 3, w, hull); L.set(H, 3, w, hull); L.set(-H, 4, w, hull); L.set(H, 4, w, hull); L.box(-H, 5, w, H, 5, w, deck); L.set(-H, 6, w, conn('spruce_fence', 'W')); L.set(H, 6, w, conn('spruce_fence', 'W')) }
  const Hs = hw(s0); L.box(-Hs, 3, s0, Hs, 4, s0, hull); L.door(0, s0, 'spruce', 'left', 3); L.set(-2, 4, s0, PU); L.set(2, 4, s0, PU)
  L.box(-Hs, 3, len - 1, Hs, 4, len - 1, hull); L.set(0, 4, len - 1, PU)
  L.set(0, 6, len - 3, 'spruce_fence'); L.set(0, 7, len - 3, 'spruce_trapdoor[facing={F},half=bottom,open=true]')
  L.set(-Hs, 7, s0, 'lantern'); L.set(Hs, 7, s0, 'lantern'); L.set(0, 4, s0 + 2, 'lantern[hanging=true]')
  const masts = pirate ? [Math.round(len * 0.25), Math.round(len * 0.5), Math.round(len * 0.72)] : [Math.round(len * 0.3), Math.round(len * 0.6)]
  masts.forEach((m, i) => {
    const mh = 14 + (i === 1 ? 6 : 0) + Math.round(len / 10)
    L.box(0, 3, m, 0, 3 + mh, m, 'spruce_log[axis=y]')
    L.box(-mw - 1, 1 + mh, m, mw + 1, 1 + mh, m, 'spruce_log[axis={AU}]'); L.box(-mw, 7, m, mw, 7, m, 'spruce_log[axis={AU}]')
    L.box(-mw, 8, m - 1, mw, mh, m - 1, sail)
    L.box(1, 2 + mh, m, 3, 3 + mh, m, pirate ? 'black_wool' : pick(['blue_wool', 'red_wool']))
    if (pirate && i === 1) { const rows = ['.WWW.', 'WBWBW', 'WWWWW', '.WWW.', '.W.W.'], vc = Math.round((8 + mh) / 2) + 2
      rows.forEach((row, r) => [...row].forEach((ch, k) => { if (ch === 'W') L.set(k - 2, vc - r, m - 1, 'white_wool') }))
      L.box(-1, mh - 2, m - 1, 1, mh - 2, m + 1, 'spruce_planks'); L.fenceRect(-1, m - 1, 1, m + 1, mh - 1, 'spruce_fence') }
  })
  if (pirate) {
    for (let w = 6; w < len - 7; w += 4) { const H = hw(w); L.set(-H, 1, w, 'black_concrete'); L.set(-H - 1, 1, w, 'black_concrete'); L.set(H, 1, w, 'black_concrete'); L.set(H + 1, 1, w, 'black_concrete') }
    L.set(0, 3, len - 9, 'chest[facing={F}]'); L.set(1, 3, len - 9, 'gold_block'); L.set(-1, 3, len - 9, 'barrel[facing=up]')
  } else { L.set(0, 3, len - 9, 'barrel[facing=up]'); L.set(1, 3, len - 9, 'chest[facing={F}]') }
  L.summon('parrot', 0, 4, masts[0])
}
function lighthouse (L, n) {
  const h = clamp(n[0] || 24, 10, 120), cc = 7
  L.clear(-9, -2, 9, 16, h + 12)
  L.cyl(0, cc, 7, -1, -1, 'stone'); L.cyl(0, cc, 7, 0, 0, 'mossy_cobblestone', true); L.cyl(0, cc, 5, 0, 0, 'stone_bricks')
  for (let v = 1; v <= h; v++) L.cyl(0, cc, 4, v, v, Math.floor((v - 1) / 3) % 2 ? 'red_concrete' : 'white_concrete', true)
  L.door(0, cc - 4, 'spruce', 'left', 1); L.set(0, 3, cc - 4, 'white_concrete')
  for (let v = 1; v <= h + 1; v++) L.set(0, v, cc + 3, 'ladder[facing={F}]')
  for (let v = 6; v < h; v += 6) { L.set(-4, v, cc, 'glass_pane[{F}=true,{B}=true]'); L.set(4, v, cc, 'glass_pane[{F}=true,{B}=true]') }
  L.cyl(0, cc, 6, h + 1, h + 1, 'smooth_stone'); L.cyl(0, cc, 6, h + 2, h + 2, 'iron_bars', true); L.set(0, h + 1, cc + 3, 'ladder[facing={F}]')
  L.cyl(0, cc, 3, h + 2, h + 4, 'glass', true); L.box(0, h + 2, cc, 0, h + 3, cc, 'sea_lantern'); L.set(-1, h + 2, cc, 'glowstone'); L.set(1, h + 2, cc, 'glowstone')
  L.cyl(0, cc, 4, h + 5, h + 5, 'red_concrete'); L.cyl(0, cc, 2.5, h + 6, h + 6, 'red_concrete'); L.cyl(0, cc, 1, h + 7, h + 7, 'red_concrete'); L.set(0, h + 8, cc, 'lightning_rod')
}
function windmill (L) {
  const cc = 6
  L.clear(-12, -3, 12, 14, 30)
  L.cyl(0, cc, 5, -1, -1, 'spruce_planks')
  for (let v = 0; v <= 14; v++) { const r = 5 - Math.floor(v / 5); L.cyl(0, cc, r, v, v, v < 5 ? 'stone_bricks' : 'white_terracotta', true) }
  L.box(0, 0, cc - 5, 0, 1, cc - 4, 'air'); L.door(0, cc - 5, 'spruce')
  for (const v of [6, 11]) { L.set(-(5 - Math.floor(v / 5)), v, cc, PW); L.set(5 - Math.floor(v / 5), v, cc, PW) }
  for (let k = 0; k < 4; k++) L.cyl(0, cc, 3.5 - k, 15 + k, 15 + k, 'dark_oak_planks')
  const hv = 11, front = cc - 3
  L.box(0, hv, front - 2, 0, hv, front, 'spruce_log[axis={AW}]'); L.set(0, hv, front - 3, 'dark_oak_log[axis={AW}]')
  for (const [du, dv] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let k = 1; k <= 9; k++) {
      L.set(du * k, hv + dv * k, front - 3, du ? 'stripped_spruce_log[axis={AU}]' : 'stripped_spruce_log[axis=y]')
      if (k >= 3) for (let s = 1; s <= 2; s++) L.set(du * k + dv * s, hv + dv * k - du * s, front - 3, 'white_wool')
    }
  }
  L.box(-7, 0, -2, -5, 1, 0, 'hay_block[axis=y]'); L.set(5, 0, -1, 'barrel[facing=up]'); L.box(0, -1, -3, 0, -1, cc - 6, 'dirt_path')
  L.box(6, -1, 0, 11, -1, 8, 'farmland[moisture=7]'); L.box(6, 0, 0, 11, 0, 8, 'wheat[age=7]'); L.box(8, -1, 0, 8, -1, 8, 'water'); L.box(8, 0, 0, 8, 0, 8, 'air')
}
function bridge (L, n) {
  const len = clamp(n[0] || 30, 10, 200), H = Math.min(6, Math.max(2, Math.floor(len / 6)))
  L.clear(-7, -1, 7, len + 1, H + 8)
  L.box(-7, -3, 4, 7, -1, len - 4, 'water')
  for (let w = 0; w <= len; w++) {
    const v = Math.round(H * Math.sin(Math.PI * w / len))
    L.box(-2, v - 1, w, 2, v - 1, w, 'stone_bricks'); L.box(-1, v - 1, w, 1, v - 1, w, 'spruce_planks')
    L.set(-3, v - 1, w, 'stone_bricks'); L.set(3, v - 1, w, 'stone_bricks')
    L.set(-3, v, w, 'stone_brick_wall[{F}=low,{B}=low,up=true]'); L.set(3, v, w, 'stone_brick_wall[{F}=low,{B}=low,up=true]')
    if (w % 6 === 0) { L.set(-3, v + 1, w, 'lantern'); L.set(3, v + 1, w, 'lantern') }
    if (v >= 3 && w % 8 === 4) L.box(-2, -3, w, 2, v - 2, w, 'stone_bricks')
  }
}
function temple (L, n) {
  const s = clamp(odd(n[0] || 21), 13, 61), h = (s - 1) / 2, levels = Math.floor((h - 2) / 2)
  L.clear(-h - 3, -3, h + 3, s + 3, levels * 2 + 10)
  for (let k = 0; k < levels; k++) { const hf = h - 2 * k; L.box(-hf, 2 * k, h - hf, hf, 2 * k + 1, h + hf, k % 2 ? 'mossy_stone_bricks' : 'stone_bricks'); L.walls(-hf, h - hf, hf, h + hf, 2 * k + 1, 2 * k + 1, 'chiseled_stone_bricks') }
  for (let k = 0; k < 30; k++) { const v = ri(0, levels * 2 - 1), hf = h - 2 * Math.floor(v / 2); L.set(pick([-hf, hf]), v, h + ri(-hf, hf), 'cracked_stone_bricks') }
  for (let v = 0; v < levels * 2; v++) L.box(-1, v, v - 1, 1, v, v - 1, 'stone_brick_stairs[facing={B}]')
  const tv = levels * 2
  L.walls(-2, h - 2, 2, h + 2, tv, tv + 3, 'chiseled_stone_bricks'); L.box(-3, tv + 4, h - 3, 3, tv + 4, h + 3, 'smooth_sandstone'); L.box(-1, tv + 5, h - 1, 1, tv + 5, h + 1, 'gold_block')
  L.box(0, tv, h - 2, 0, tv + 1, h - 2, 'air'); L.set(0, tv, h + 1, 'gold_block'); L.set(-1, tv + 3, h, 'soul_lantern[hanging=true]'); L.set(1, tv + 3, h, 'soul_lantern[hanging=true]')
  for (const [a, c] of [[-h, 0], [h, 0], [-h, s - 1], [h, s - 1]]) L.set(a, 2, c, 'soul_campfire[lit=true]')
  L.set(-2, tv, h - 3, 'soul_lantern'); L.set(2, tv, h - 3, 'soul_lantern')
}
function pagoda (L, n) {
  const floors = clamp(n[0] || 5, 2, 9), cc = 9
  L.clear(-12, -4, 12, 20, floors * 5 + 10)
  L.box(-8, -1, cc - 8, 8, 0, cc + 8, 'polished_andesite'); L.box(-1, -1, -4, 1, -1, cc - 9, 'gravel')
  for (let f = 0; f < floors; f++) {
    const hf = 6 - Math.min(f, 4), v0 = 1 + f * 5
    if (f > 0) L.box(-hf, v0 - 1, cc - hf, hf, v0 - 1, cc + hf, 'dark_oak_planks')
    L.walls(-hf + 1, cc - hf + 1, hf - 1, cc + hf - 1, v0, v0 + 2, 'white_terracotta')
    for (const a of [-hf + 1, 0, hf - 1]) for (const c of [cc - hf + 1, cc, cc + hf - 1]) if (a !== 0 || c !== cc) L.box(a, v0, c, a, v0 + 2, c, 'red_concrete')
    L.box(0, v0, cc - hf + 1, 0, v0 + 1, cc - hf + 1, f === 0 ? 'air' : PU); L.box(-hf + 1, v0 + 1, cc, -hf + 1, v0 + 1, cc, PW); L.box(hf - 1, v0 + 1, cc, hf - 1, v0 + 1, cc, PW); L.set(0, v0 + 1, cc + hf - 1, PU)
    L.box(-hf - 1, v0 + 3, cc - hf - 1, hf + 1, v0 + 3, cc + hf + 1, 'deepslate_tile_slab[type=bottom]')
    L.box(-hf, v0 + 4, cc - hf, hf, v0 + 4, cc + hf, 'deepslate_tiles')
    for (const a of [-hf - 1, hf + 1]) for (const c of [cc - hf - 1, cc + hf + 1]) { L.set(a, v0 + 4, c, 'deepslate_tile_slab[type=bottom]'); L.set(a, v0 + 2, c, 'lantern[hanging=true]') }
    L.set(0, v0 + 2, cc, 'lantern[hanging=true]')
  }
  L.door(0, cc - 5, 'dark_oak', 'left', 1)
  const vt = 1 + floors * 5; L.box(0, vt, cc, 0, vt + 1, cc, 'gold_block'); L.box(0, vt + 2, cc, 0, vt + 5, cc, 'iron_chain[axis=y]'); L.set(0, vt + 6, cc, 'gold_block')
  for (const a of [-10, 10]) { L.box(a, 0, 1, a, 1, 1, 'stone_bricks'); L.set(a, 2, 1, 'lantern'); L.feature('cherry', a, 0, cc + 4) }
}
function farm (L) {
  L.clear(-12, -3, 22, 28, 12)
  L.box(-8, -1, 0, 8, -1, 12, 'farmland[moisture=7]')
  for (const a of [-5, 0, 5]) L.box(a, -1, 0, a, -1, 12, 'water')
  L.box(-8, 0, 0, -6, 0, 12, 'wheat[age=7]'); L.box(-4, 0, 0, -1, 0, 12, 'carrots[age=7]'); L.box(1, 0, 0, 4, 0, 12, 'potatoes[age=7]'); L.box(6, 0, 0, 8, 0, 12, 'beetroots[age=3]')
  for (const a of [-5, 0, 5]) L.box(a, 0, 0, a, 0, 12, 'air')
  L.fenceRect(-9, -1, 9, 13, 0, 'oak_fence'); L.set(-2, 0, -1, 'oak_fence_gate[facing={F}]')
  L.box(-11, 0, 6, -11, 1, 6, 'oak_fence'); L.set(-11, 2, 6, 'carved_pumpkin[facing={F}]'); L.set(-12, 1, 6, 'oak_fence'); L.set(-10, 1, 6, 'oak_fence')
  L.box(-5, -1, 16, 5, -1, 26, 'spruce_planks'); L.walls(-5, 16, 5, 26, 0, 4, 'red_terracotta')
  for (const [a, c] of [[-5, 16], [5, 16], [-5, 26], [5, 26]]) L.box(a, 0, c, a, 4, c, 'stripped_spruce_log[axis=y]')
  L.box(-5, 4, 16, 5, 4, 16, 'white_terracotta'); L.box(-1, 0, 16, 1, 3, 16, 'air'); L.gable(-5, 5, 16, 26, 5, 'dark_oak_stairs', 'red_terracotta', 'dark_oak_slab')
  L.box(-4, 0, 23, -2, 1, 25, 'hay_block[axis=y]'); L.set(4, 0, 25, 'composter'); L.set(3, 0, 25, 'water_cauldron[level=3]'); L.set(4, 0, 24, 'chest[facing={L}]'); L.set(0, 3, 21, 'lantern[hanging=true]')
  L.box(0, -1, 13, 0, -1, 15, 'dirt_path')
  L.fenceRect(11, 0, 21, 12, 0, 'oak_fence'); L.set(16, 0, 0, 'oak_fence_gate[facing={F}]'); L.box(12, -1, 10, 14, -1, 10, 'water'); L.box(18, 0, 10, 20, 0, 11, 'hay_block[axis=y]')
  for (const [t, k] of [['cow', 3], ['sheep', 3], ['pig', 2], ['chicken', 4]]) for (let i = 0; i < k; i++) L.summon(t, ri(12, 20), 0, ri(1, 9))
  L.lamp(-10, -2); L.lamp(10, -2)
}
function village (L, n) {
  const cnt = clamp(n[0] || 6, 2, 12), per = Math.ceil(cnt / 2), sp = 18, span = per * sp, x0 = -Math.floor(span / 2) + sp / 2
  L.clear(-span / 2 - 10, -4, span / 2 + 12, 34, 18)
  const kinds = [medieval, cabin, cottage]
  let i = 0
  for (let row = 0; row < 2; row++) for (let j = 0; j < per && i < cnt; j++, i++) {
    const a = x0 + j * sp; kinds[i % 3](row === 0 ? L.sub(a, 10, true) : L.sub(a, 18))
  }
  L.box(-span / 2 - 8, 0, 12, span / 2 + 8, 6, 16, 'air'); L.box(-span / 2 - 8, -1, 12, span / 2 + 8, -1, 16, 'dirt_path'); L.box(-span / 2 - 8, -1, 14, span / 2 + 8, -1, 14, 'gravel')
  for (let j = 0; j < per; j++) { const a = x0 + j * sp; L.box(a, -1, 11, a, -1, 11, 'dirt_path'); L.box(a, -1, 17, a, -1, 17, 'dirt_path'); L.lamp(a + 4, 12, 3); L.lamp(a - 4, 16, 3) }
  const wx = span / 2 + 9
  L.walls(wx - 1, 13, wx + 1, 15, 0, 0, 'cobblestone'); L.box(wx, -3, 14, wx, 0, 14, 'water')
  for (const [a, c] of [[wx - 1, 13], [wx + 1, 13], [wx - 1, 15], [wx + 1, 15]]) L.box(a, 1, c, a, 2, c, 'oak_fence')
  L.box(wx - 1, 3, 13, wx + 1, 3, 15, 'oak_slab')
  for (let k = 0; k < cnt; k++) L.summon('villager', x0 + (k % per) * sp + 3, 0, 14)
  L.summon('iron_golem', wx - 3, 0, 14); L.summon('cat', 0, 0, 13)
}
function road (L, n) {
  const len = clamp(n[0] || 60, 8, 300)
  L.box(-6, 0, 0, 6, 6, len, 'air')
  L.box(-3, -1, 0, 3, -1, len, 'gray_concrete'); L.box(-5, -1, 0, -4, -1, len, 'smooth_stone'); L.box(4, -1, 0, 5, -1, len, 'smooth_stone')
  for (let w = 0; w <= len; w += 4) L.box(0, -1, w, 0, -1, Math.min(len, w + 1), 'yellow_concrete')
  for (let w = 2; w <= len; w += 10) { L.lamp(-6, w, 4, 'stone_brick_wall'); L.lamp(6, w + 5 <= len ? w + 5 : w, 4, 'stone_brick_wall') }
  for (let k = -3; k <= 3; k += 2) L.box(k, -1, len - 3, k, -1, len - 1, 'white_concrete')
}
function fountain (L) {
  const cc = 8
  L.clear(-9, -1, 9, 17, 10)
  L.cyl(0, cc, 8, -1, -1, 'polished_andesite'); L.cyl(0, cc, 5, -2, -1, 'prismarine_bricks'); L.cyl(0, cc, 4, 0, 0, 'water'); L.cyl(0, cc, 5, 0, 0, 'quartz_block', true)
  L.box(0, 0, cc, 0, 3, cc, 'quartz_pillar[axis=y]'); L.cyl(0, cc, 2, 4, 4, 'quartz_block', true); L.set(0, 4, cc, 'quartz_pillar[axis=y]')
  for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.set(a, 4, cc + c, 'water')
  L.set(0, 5, cc, 'sea_lantern'); L.set(0, 6, cc, 'water')
  L.box(-1, 0, 0, 1, 0, 0, 'oak_stairs[facing={F}]'); L.box(-1, 0, 2 * cc, 1, 0, 2 * cc, 'oak_stairs[facing={B}]'); L.box(-8, 0, cc - 1, -8, 0, cc + 1, 'oak_stairs[facing={L}]'); L.box(8, 0, cc - 1, 8, 0, cc + 1, 'oak_stairs[facing={R}]')
  for (const [a, c] of [[-6, 2], [6, 2], [-6, 14], [6, 14]]) L.lamp(a, c, 3, 'dark_oak_fence')
  for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2; L.flower(Math.round(Math.cos(t) * 7), cc + Math.round(Math.sin(t) * 7), 0) }
}
function garden (L, n) {
  const s = clamp(odd(n[0] || 19), 11, 41), h = (s - 1) / 2, e = s - 1
  L.clear(-h - 1, -1, h + 1, e + 1, 10)
  L.walls(-h, 0, h, e, 0, 1, 'azalea_leaves[persistent=true]')
  L.box(-2, 0, 0, 2, 2, 0, 'flowering_azalea_leaves[persistent=true]'); L.box(-1, 0, 0, 1, 1, 0, 'air')
  L.box(-1, -1, 0, 1, -1, e - 1, 'dirt_path'); L.box(-h + 1, -1, h - 1, h - 1, -1, h + 1, 'dirt_path')
  for (const sa of [-1, 1]) for (const sc of [-1, 1]) {
    const a1 = sa * 2, a2 = sa * (h - 1), c1 = sc < 0 ? 1 : h + 2, c2 = sc < 0 ? h - 2 : e - 1
    if (sa < 0 && sc > 0) { const qa = Math.round((a1 + a2) / 2), qc = Math.round((c1 + c2) / 2); L.cyl(qa, qc, Math.max(1.5, (h - 4) / 2), -1, -1, 'water'); L.set(qa, 0, qc, 'lily_pad'); continue }
    for (let a = Math.min(a1, a2); a <= Math.max(a1, a2); a++) for (let c = c1; c <= c2; c++) {
      if ((a + c) % 4 === 0) L.tall(a, c); else L.flower(a, c)
    }
    L.feature(pick(['azalea_tree', 'birch', 'cherry']), a2, 0, sc < 0 ? c1 : c2)
  }
  L.set(0, -1, h, 'grass_block'); L.set(0, 0, h, 'flowering_azalea')
  L.lamp(-2, 2, 2, 'dark_oak_fence'); L.lamp(2, 2, 2, 'dark_oak_fence'); L.lamp(-2, e - 2, 2, 'dark_oak_fence'); L.lamp(2, e - 2, 2, 'dark_oak_fence')
  L.set(-2, 0, h - 3, 'oak_stairs[facing={L}]'); L.set(2, 0, h - 3, 'oak_stairs[facing={R}]'); L.set(-2, 0, h + 3, 'oak_stairs[facing={L}]'); L.set(2, 0, h + 3, 'oak_stairs[facing={R}]')
}
function maze (L, n, name) {
  const s = clamp(odd(n[0] || 21), 9, 81), h = (s - 1) / 2
  let wall = name || 'oak_leaves'; if (/_leaves$/.test(wall)) wall += '[persistent=true]'
  const g = Array.from({ length: s }, () => Array(s).fill(true)), cells = (s - 1) / 2
  const stack = [[0, 0]], seen = new Set(['0,0']); g[1][1] = false
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cells && ny < cells && !seen.has(nx + ',' + ny))
    if (!nb.length) { stack.pop(); continue }
    const [nx, ny, dx, dy] = pick(nb); seen.add(nx + ',' + ny)
    g[2 * x + 1 + dx][2 * y + 1 + dy] = false; g[2 * nx + 1][2 * ny + 1] = false; stack.push([nx, ny])
  }
  g[1][0] = false; g[s - 2][s - 1] = false
  L.clear(-h - 1, -1, h + 1, s, 5)
  for (let x = 0; x < s; x++) { let y = 0; while (y < s) { if (!g[x][y]) { y++; continue } let y2 = y; while (y2 + 1 < s && g[x][y2 + 1]) y2++; L.box(x - h, 0, y, x - h, 2, y2, wall); y = y2 + 1 } }
  L.set(1 - h, -1, 0, 'gold_block'); L.set(s - 2 - h, -1, s - 1, 'diamond_block'); L.set(s - 2 - h, 0, s, 'chest[facing={F}]'); L.set(s - 1 - h, 3, s - 1, 'lantern')
}

function castle (L, n) {
  const s = clamp(odd(n[0] || 25), 19, 61), h = (s - 1) / 2, e = s - 1
  L.clear(-h - 6, -6, h + 6, e + 6, 24)
  L.box(-h - 5, -3, -5, h + 5, -1, e + 5, 'water')
  L.box(-h - 1, -3, -1, h + 1, -2, e + 1, 'dirt'); L.box(-h - 1, -1, -1, h + 1, -1, e + 1, 'grass_block')
  L.walls(-h, 0, h, e, 0, 7, 'stone_bricks'); L.walls(-h, 0, h, e, 0, 1, 'mossy_stone_bricks')
  L.walls(-h + 1, 1, h - 1, e - 1, 6, 6, 'stone_brick_slab[type=top]')
  for (let i = -h; i <= h; i += 2) { L.set(i, 8, 0, 'stone_bricks'); L.set(i, 8, e, 'stone_bricks') }
  for (let i = 0; i <= e; i += 2) { L.set(-h, 8, i, 'stone_bricks'); L.set(h, 8, i, 'stone_bricks') }
  for (const [a, c] of [[-h, 0], [h, 0], [-h, e], [h, e]]) {
    L.cyl(a, c, 3, 0, 11, 'stone_bricks', true); L.cyl(a, c, 1.4, 0, 11, 'air'); L.cyl(a, c, 3, 11, 11, 'spruce_planks'); L.cyl(a, c, 3, 12, 12, 'stone_brick_wall', true)
    for (let k = 0; k < 5; k++) L.cyl(a, c, 3.5 - k * 0.8, 13 + k, 13 + k, 'dark_prismarine')
    L.box(a, 18, c, a, 20, c, 'spruce_fence'); L.box(a + 1, 19, c, a + 2, 20, c, 'red_wool')
  }
  L.box(-1, 0, 0, 1, 3, 0, 'air'); L.lineU(-1, 1, 3, 0, 'iron_bars')
  L.box(-1, -1, -5, 1, -1, -1, 'spruce_planks'); L.lineW(-2, 0, -5, -1, 'spruce_fence'); L.lineW(2, 0, -5, -1, 'spruce_fence')
  L.set(-2, 2, -1, 'wall_torch[facing={F}]'); L.set(2, 2, -1, 'wall_torch[facing={F}]')
  const k1 = e - 10, k2 = e - 3
  L.box(-1, -1, 1, 1, -1, k1 - 1, 'dirt_path')
  L.walls(-4, k1, 4, k2, 0, 14, 'stone_bricks'); L.box(-3, -1, k1 + 1, 3, -1, k2 - 1, 'polished_andesite')
  L.box(-3, 5, k1 + 1, 3, 5, k2 - 1, 'spruce_planks'); L.box(-3, 10, k1 + 1, 3, 10, k2 - 1, 'spruce_planks'); L.box(-4, 14, k1, 4, 14, k2, 'stone_bricks')
  for (let i = -4; i <= 4; i += 2) { L.set(i, 15, k1, 'stone_bricks'); L.set(i, 15, k2, 'stone_bricks') }
  for (let i = k1; i <= k2; i += 2) { L.set(-4, 15, i, 'stone_bricks'); L.set(4, 15, i, 'stone_bricks') }
  for (let v = 0; v <= 14; v++) L.set(3, v, k2 - 1, 'ladder[facing={F}]')
  L.door(0, k1, 'dark_oak')
  for (const v of [2, 7, 12]) { L.set(-2, v, k1, PU); L.set(2, v, k1, PU) }
  L.set(-3, 9, k1 - 1, 'red_wall_banner[facing={F}]'); L.set(3, 9, k1 - 1, 'red_wall_banner[facing={F}]')
  L.set(0, 4, k1 + 3, 'lantern[hanging=true]'); L.set(0, 9, k1 + 3, 'lantern[hanging=true]')
  L.box(0, 0, k1 + 1, 0, 0, k2 - 3, 'red_carpet'); L.set(0, 0, k2 - 2, 'dark_oak_stairs[facing={B}]'); L.set(-1, 0, k2 - 2, 'gold_block'); L.set(1, 0, k2 - 2, 'gold_block')
  L.lamp(-4, 4); L.lamp(4, 4); L.box(-h + 2, 0, 3, -h + 4, 1, 5, 'hay_block[axis=y]'); L.set(h - 3, 0, 3, 'anvil[facing={R}]'); L.set(h - 3, 0, 5, 'barrel[facing=up]'); L.set(h - 4, 0, 4, 'grindstone[face=floor,facing={F}]')
  L.summon('horse', -h + 3, 0, 7)
}
function stadium (L, n) {
  const a = clamp(n[0] || 24, 12, 60), b = Math.max(8, Math.round(a * 0.65)), T = 7, A = a + T + 2, B = b + T + 2, cc = B + 1
  L.box(-A - 1, 0, cc - B - 1, A + 1, T + 13, cc + B + 1, 'air'); L.box(-A - 1, -1, cc - B - 1, A + 1, -1, cc + B + 1, 'grass_block')
  for (let x = -A; x <= A; x++) for (let z = -B; z <= B; z++) {
    const e = Math.sqrt((x / a) ** 2 + (z / b) ** 2)
    if (e <= 1) {
      const line = Math.sqrt((x / (a - 1)) ** 2 + (z / (b - 1)) ** 2) > 1 || x === 0 || Math.abs(Math.hypot(x, z) - 5) < 0.5
      if (line) L.set(x, -1, cc + z, 'white_concrete')
    } else {
      const k = Math.floor((e - 1) * b)
      if (k < T) { if (k > 0) L.box(x, 0, cc + z, x, k - 1, cc + z, 'smooth_stone'); L.set(x, k, cc + z, k % 2 ? 'red_concrete' : 'white_concrete') } else if (k === T) L.box(x, 0, cc + z, x, T + 1, cc + z, 'stone_bricks')
    }
  }
  L.box(-1, 0, cc - B - 1, 1, 2, cc - b + 1, 'air'); L.box(-1, -1, cc - B - 1, 1, -1, cc - b, 'smooth_stone')
  for (const sx of [-1, 1]) { const x = sx * (a - 2); L.box(x, 0, cc - 3, x, 3, cc - 3, 'white_concrete'); L.box(x, 0, cc + 3, x, 3, cc + 3, 'white_concrete'); L.box(x, 3, cc - 3, x, 3, cc + 3, 'white_concrete') }
  for (const [x, z] of [[-A + 1, -B + 3], [A - 1, -B + 3], [-A + 1, B - 3], [A - 1, B - 3]]) { L.box(x, 0, cc + z, x, T + 10, cc + z, 'iron_block'); L.box(x - 1, T + 11, cc + z - 1, x + 1, T + 11, cc + z + 1, 'sea_lantern') }
  L.box(-5, T + 2, cc + B - 1, 5, T + 6, cc + B - 1, 'black_concrete'); L.box(-3, T + 4, cc + B - 2, -2, T + 4, cc + B - 2, 'glowstone'); L.box(2, T + 4, cc + B - 2, 3, T + 4, cc + B - 2, 'glowstone')
}
function rollercoaster (L, n) {
  const a = clamp(n[0] || 30, 16, 80), b = Math.max(10, Math.round(a * 0.6)), u0 = -Math.floor(a / 2), c0 = 4
  L.clear(u0 - 4, 0, u0 + a + 4, c0 + b + 4, 22)
  const pts = []
  for (let x = u0; x < u0 + a; x++) pts.push([x, c0])
  for (let z = c0; z < c0 + b; z++) pts.push([u0 + a, z])
  for (let x = u0 + a; x > u0; x--) pts.push([x, c0 + b])
  for (let z = c0 + b; z > c0; z--) pts.push([u0, z])
  const N = pts.length, corner = i => { const p = pts[(i - 1 + N) % N], q = pts[(i + 1) % N]; return p[0] !== q[0] && p[1] !== q[1] }
  const h = pts.map((_, i) => Math.round(2 + 11 * Math.max(0, Math.sin(2 * Math.PI * i / N)) + 3 * Math.max(0, Math.sin(6 * Math.PI * i / N + 1))))
  for (let i = 0; i < 4; i++) h[i] = 1
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < N; i++) if (corner(i)) { const m = Math.min(h[(i - 1 + N) % N], h[i], h[(i + 1) % N]); h[(i - 1 + N) % N] = h[i] = h[(i + 1) % N] = m }
    for (let i = 1; i < N; i++) h[i] = clamp(h[i], h[i - 1] - 1, h[i - 1] + 1)
    for (let i = N - 1; i >= 0; i--) h[i] = clamp(h[i], h[(i + 1) % N] - 1, h[(i + 1) % N] + 1)
  }
  const powered = pts.map((_, i) => !corner(i) && !corner((i + 1) % N) && !corner((i - 1 + N) % N) && (h[(i + 1) % N] > h[i] || i % 5 === 0))
  pts.forEach(([x, z], i) => { if (h[i] >= 2) L.box(x, 0, z, x, h[i] - 2, z, 'spruce_fence'); L.set(x, h[i] - 1, z, powered[i] ? 'redstone_block' : 'smooth_stone') })
  pts.forEach(([x, z], i) => L.set(x, h[i], z, powered[i] ? 'powered_rail' : 'rail'))
  L.box(u0 + 1, 0, c0 - 2, u0 + 6, 0, c0 - 1, 'smooth_stone_slab'); L.lamp(u0, c0 - 2, 3, 'dark_oak_fence'); L.lamp(u0 + 7, c0 - 2, 3, 'dark_oak_fence')
  L.summon('minecart', pts[2][0], h[2], pts[2][1])
}
function car (L, n, name) {
  const col = name && /^[a-z_]+$/.test(name) ? name : pick(['red', 'blue', 'yellow', 'lime', 'orange', 'white', 'black'])
  const body = `${col}_concrete`
  L.box(-3, 0, -1, 3, 4, 9, 'air')
  L.box(-2, 1, 0, 2, 2, 7, body); L.box(-2, 3, 2, 2, 3, 5, 'black_stained_glass'); L.box(-2, 4, 2, 2, 4, 5, body)
  L.box(-1, 2, 3, 1, 3, 4, 'air'); L.box(-1, 2, 3, 1, 2, 3, 'quartz_stairs[facing={B}]'); L.box(-1, 2, 4, 1, 2, 4, 'quartz_stairs[facing={B}]')
  for (const [a, c] of [[-2, 1], [2, 1], [-2, 6], [2, 6]]) { L.set(a, 0, c, 'black_concrete'); L.set(a, 1, c, 'black_concrete') }
  L.set(-2, 1, 0, 'sea_lantern'); L.set(2, 1, 0, 'sea_lantern'); L.set(-2, 1, 7, 'redstone_block'); L.set(2, 1, 7, 'redstone_block')
  L.box(-1, 1, 0, 1, 1, 0, 'iron_bars[{R}=true,{L}=true]'); L.box(-1, 1, 7, 1, 1, 7, 'polished_blackstone')
}
function plane (L, n) {
  const len = clamp(n[0] || 28, 16, 80), cy = 4, mid = Math.round(len * 0.42), span = Math.round(len / 2)
  L.clear(-span - 2, -1, span + 2, len + 2, 14)
  for (let w = 0; w < len; w++) {
    const r = w < 3 ? w * 0.7 : w > len - 7 ? Math.max(0.7, 2 * (len - 1 - w) / 6) : 2, up = w > len - 7 ? Math.round((w - (len - 7)) / 3) : 0
    const R = Math.ceil(r)
    for (let a = -R; a <= R; a++) for (let v = -R; v <= R; v++) { const dd = Math.hypot(a, v); if (dd <= r + 0.4) L.set(a, cy + v + up, w, dd > r - 0.8 ? (v < 0 ? 'light_gray_concrete' : 'white_concrete') : 'air') }
    if (w > 4 && w < len - 7 && w % 2 === 0) { L.set(-R, cy + 1, w, 'light_blue_stained_glass'); L.set(R, cy + 1, w, 'light_blue_stained_glass') }
  }
  L.box(-1, cy + 1, 1, 1, cy + 2, 3, 'black_stained_glass'); L.set(0, cy, 0, 'light_gray_concrete')
  for (let k = 0; k < 4; k++) { const ext = span - k * 2; L.box(-ext, cy - 1, mid + k, ext, cy - 1, mid + k, 'light_gray_concrete'); L.set(-ext, cy - 1, mid + k, 'red_concrete'); L.set(ext, cy - 1, mid + k, 'lime_concrete') }
  for (const sx of [-1, 1]) { const x = sx * Math.round(span / 2); L.box(x, cy - 2, mid - 1, x, cy - 2, mid + 2, 'iron_block'); L.set(x, cy - 2, mid - 2, 'black_concrete') }
  for (let k = 0; k < 5; k++) L.box(0, cy + 2 + Math.round((len - 7) / 3), len - 6 + k, 0, cy + 3 + k, len - 6 + k, 'red_concrete')
  L.box(-5, cy + 2, len - 4, 5, cy + 2, len - 2, 'light_gray_concrete')
  for (const sx of [-3, 3]) { L.box(sx, 1, mid + 1, sx, cy - 2, mid + 1, 'iron_bars'); L.set(sx, 0, mid + 1, 'black_concrete') }
  L.box(0, 1, 3, 0, cy - 3, 3, 'iron_bars'); L.set(0, 0, 3, 'black_concrete')
}
function rocket (L, n) {
  const h = clamp(n[0] || 30, 12, 150), cc = 9
  L.clear(-11, -1, 11, 20, h + 12, 'gray_concrete')
  L.cyl(0, cc, 9, -1, -1, 'gray_concrete'); L.cyl(0, cc, 9, -1, -1, 'yellow_concrete', true)
  L.cyl(0, cc, 2, 0, 0, 'polished_blackstone'); L.set(0, 0, cc, 'magma_block'); L.set(1, 0, cc, 'shroomlight'); L.set(-1, 0, cc, 'shroomlight')
  for (let v = 1; v <= h; v++) L.cyl(0, cc, 3, v, v, v % 10 === 0 ? 'black_concrete' : v > h - 4 ? 'red_concrete' : 'white_concrete', true)
  for (const v of [h - 8, h - 14]) for (const [a, c] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) L.set(a, v, cc + c, 'light_blue_stained_glass')
  for (let k = 0; k < 7; k++) { const r = 3 - k * 0.5; if (r < 0) break; L.cyl(0, cc, r, h + 1 + k, h + 1 + k, 'red_concrete') }
  L.set(0, h + 8, cc, 'lightning_rod')
  for (const [du, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let r = 4; r <= 6; r++) L.box(du * r, 1, cc + dc * r, du * r, 1 + (7 - r) * 2, cc + dc * r, 'red_concrete')
  L.box(6, 0, 4, 8, h - 2, 6, 'iron_bars', 'outline')
  for (const v of [Math.round(h / 3), Math.round(2 * h / 3)]) L.box(4, v, 5, 5, v, 5, 'iron_block')
  for (let v = 0; v < h - 2; v++) L.set(7, v, 3, 'ladder[facing={F}]')
}
function treehouse (L) {
  const cc = 7
  L.clear(-9, -1, 9, 18, 26)
  L.box(-1, 0, 6, 0, 15, 7, 'oak_log[axis=y]')
  for (const [a, c] of [[-2, 6], [1, 7], [-1, 8], [0, 5]]) L.set(a, 0, c, 'oak_wood')
  L.box(-5, 9, 2, 4, 9, 11, 'oak_planks')
  L.walls(-3, 4, 2, 9, 10, 13, 'spruce_planks'); L.gable(-3, 2, 4, 9, 14, 'spruce_stairs', 'spruce_planks', 'spruce_slab')
  L.box(-1, 10, 4, -1, 11, 4, 'air'); L.door(-1, 4, 'spruce', 'left', 10); L.set(1, 11, 4, PU); L.set(-3, 11, 7, PW); L.set(2, 11, 7, PW)
  L.lineU(-5, 4, 10, 2, 'oak_fence'); L.lineU(-5, 4, 10, 11, 'oak_fence'); L.lineW(-5, 10, 3, 10, 'oak_fence'); L.lineW(4, 10, 3, 10, 'oak_fence')
  L.box(-2, 10, 2, -1, 10, 2, 'air')
  for (let v = 0; v <= 9; v++) L.set(-1, v, 5, 'ladder[facing={F}]')
  L.sphere(-0.5, 19, cc, 6, 'oak_leaves[persistent=true]', false, (a, v, c) => v > -3)
  for (const [a, c] of [[-5, 2], [4, 2], [-5, 11], [4, 11]]) L.set(a, 8, c, 'lantern[hanging=true]')
  L.bed(1, 10, 6, 'lime'); L.set(-2, 10, 8, 'chest[facing={R}]'); L.set(-2, 10, 5, 'crafting_table')
  L.box(3, 8, 9, 3, 6, 9, 'iron_chain[axis=y]'); L.set(3, 5, 9, 'oak_slab')
}
function igloo (L) {
  const cc = 6
  L.clear(-7, -2, 7, 13, 8)
  L.cyl(0, cc, 4, -1, -1, 'packed_ice'); L.sphere(0, 0, cc, 5, 'snow_block', true, (a, v) => v >= 0)
  L.box(-1, 0, -1, 1, 2, 1, 'snow_block'); L.box(0, 0, -1, 0, 1, 2, 'air')
  L.cyl(0, cc, 3, 0, 0, 'white_carpet'); L.set(0, 0, 0, 'air'); L.set(0, 0, 1, 'air')
  L.set(-5, 1, cc, 'ice'); L.set(5, 1, cc, 'ice'); L.set(0, 4, cc, 'ice')
  L.bed(2, 0, cc, 'light_blue'); L.set(-2, 0, cc + 2, 'furnace[facing={R}]'); L.set(-2, 0, cc - 1, 'soul_lantern'); L.set(0, 0, cc + 3, 'chest[facing={F}]')
  L.cyl(0, cc, 7, -1, -1, 'snow_block', true)
}
function snowman (L, n) {
  const s = clamp(n[0] || 1, 1, 5), r1 = 4 * s, r2 = 3 * s, r3 = 2 * s, cc = r1 + 2
  const v1 = r1 - 1, v2 = v1 + r1 + r2 - s, v3 = v2 + r2 + r3 - s
  L.clear(-r1 - 6 * s, 0, r1 + 6 * s, 2 * r1 + 4, v3 + r3 + 4 * s + 2, 'snow_block')
  L.sphere(0, v1, cc, r1, 'snow_block'); L.sphere(0, v2, cc, r2, 'snow_block'); L.sphere(0, v3, cc, r3, 'snow_block')
  const ef = cc - r3, bf = cc - r2
  L.set(-s, v3 + Math.ceil(s / 2), ef, 'coal_block'); L.set(s, v3 + Math.ceil(s / 2), ef, 'coal_block'); L.box(0, v3, ef - 1, 0, v3, ef - 2 * s, 'orange_concrete')
  for (let k = -1; k <= 1; k++) L.set(0, v2 + k * s, bf, 'coal_block')
  for (const sx of [-1, 1]) L.line(sx * r2, v2 + s, cc, sx * (r2 + 4 * s), v2 + 3 * s, cc, 'stripped_spruce_wood')
  L.cyl(0, cc, r3 + 1, v3 + r3, v3 + r3, 'black_concrete'); L.cyl(0, cc, r3 - 0.5, v3 + r3 + 1, v3 + r3 + 2 * s, 'black_concrete'); L.cyl(0, cc, r3 - 0.5, v3 + r3 + 1, v3 + r3 + 1, 'red_concrete', true)
  L.cyl(0, cc, r3 + 0.6, v2 + r2 - s, v2 + r2 - s, 'red_wool', true)
}
function gianttree (L, n, name) {
  const h = clamp(n[0] || 32, 16, 120), wood = ['oak', 'spruce', 'birch', 'dark_oak', 'jungle', 'acacia', 'cherry', 'mangrove'].includes(name) ? name : 'oak'
  const log = `${wood}_log[axis=y]`, bark = `${wood}_wood`, leaves = `${wood}_leaves[persistent=true]`, cc = 14
  L.clear(-16, -2, 16, 30, h + 16)
  for (let v = 0; v <= h; v++) L.cyl(0, cc, 3.5 - 2.5 * v / h, v, v, log)
  for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2; L.line(0, 1, cc, Math.round(Math.cos(t) * 7), -1, cc + Math.round(Math.sin(t) * 7), bark) }
  for (let k = 0; k < 8; k++) {
    const t = k / 8 * Math.PI * 2 + rnd() * 0.5, v0 = Math.round(h * (0.45 + rnd() * 0.4)), L2 = ri(6, 10)
    const ex = Math.round(Math.cos(t) * L2), ez = Math.round(Math.sin(t) * L2), ev = v0 + ri(3, 5)
    L.line(0, v0, cc, ex, ev, cc + ez, bark); L.sphere(ex, ev + 1, cc + ez, ri(3, 5), leaves)
  }
  L.sphere(0, h + 2, cc, 7, leaves)
  L.set(0, 1, cc - 4, 'lantern'); L.summon('bee', 0, h - 2, cc)
}
function waterfall (L, n) {
  const h = clamp(n[0] || 16, 6, 60), hw = 10, c1 = 10, c2 = 20
  L.clear(-hw - 4, -2, hw + 4, c2 + 3, h + 14)
  L.box(-hw, 0, c1, hw, h - 1, c2, 'stone'); L.box(-hw, h - 3, c1, hw, h - 2, c2, 'dirt'); L.box(-hw, h - 1, c1, hw, h - 1, c2, 'grass_block')
  for (let k = 0; k < 80; k++) L.set(ri(-hw, hw), ri(0, h - 4), c1, pick(['mossy_cobblestone', 'andesite', 'cobblestone', 'mossy_stone_bricks', 'tuff']))
  for (let k = 0; k < 6; k++) { const a = pick([ri(-hw, -3), ri(3, hw)]); L.box(a, 0, c1 - 1, a, ri(2, h - 4), c1 - 1, 'stone') }
  L.box(-1, h - 1, c1, 1, h - 1, c2 - 2, 'water')
  L.box(-5, -3, 2, 5, -1, c1 - 1, 'water'); L.box(-6, -1, 1, 6, -1, 1, 'mossy_cobblestone'); L.box(-6, -1, 2, -6, -1, c1 - 1, 'mossy_cobblestone'); L.box(6, -1, 2, 6, -1, c1 - 1, 'mossy_cobblestone')
  for (let k = 0; k < 14; k++) { const a = pick([ri(-hw, -3), ri(3, hw)]); L.set(a, ri(2, h - 2), c1 - 1, 'vine[{B}=true]') }
  for (let k = 0; k < 3; k++) L.set(ri(-4, 4), 0, ri(3, 6), 'lily_pad')
  L.feature('oak', -7, h, c1 + 5); L.feature('birch', 6, h, c1 + 6); L.feature('oak', -3, h, c2 - 1)
}
function canyon (L, n) {
  const len = clamp(n[0] || 60, 20, 200), H = 18, K = 22
  const strata = ['terracotta', 'orange_terracotta', 'red_terracotta', 'yellow_terracotta', 'white_terracotta', 'brown_terracotta', 'light_gray_terracotta', 'orange_terracotta', 'red_terracotta']
  L.box(-K - 6, 0, 0, K + 6, H + 3, len, 'air')
  for (let c = 0; c <= len; c++) {
    const off = Math.round(4 * Math.sin(c / 11)), f = 1 + 0.3 * Math.sin(c / 7 + 1)
    L.box(off - 2, -3, c, off + 2, -1, c, 'water'); L.box(off - 5, -1, c, off - 3, -1, c, 'red_sand'); L.box(off + 3, -1, c, off + 5, -1, c, 'red_sand')
    for (const side of [-1, 1]) {
      const ht = k => Math.min(H, Math.round((k - 5) * 1.6 * f))
      for (let v = 0; v < H; v++) { let kmin = 6; while (kmin <= K && ht(kmin) <= v) kmin++; if (kmin > K) break; L.box(off + side * kmin, v, c, off + side * K, v, c, strata[Math.floor(v / 2) % strata.length]) }
      if (rnd() < 0.15) { const k = ri(8, K); L.set(off + side * k, ht(k), c, rnd() < 0.5 ? 'dead_bush' : 'cactus') }
    }
  }
}
function desert (L, n) {
  const s = clamp(n[0] || 40, 16, 120), r = Math.floor(s / 2), cc = r + 2, nz = noise2(rnd() * 100), top = {}
  L.box(-r, 0, 2, r, 12, cc + r, 'air')
  for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) {
    const d = Math.hypot(a, c) / r * (1 + 0.15 * nz(a, c)); if (d >= 1) continue
    const dune = Math.max(0, Math.round((3 * nz(a * 0.7 + 5, c * 0.7) + 1.5) * (1 - d))); top[a + ',' + c] = dune
    L.box(a, -3, cc + c, a, dune - 1, cc + c, 'sand')
  }
  const keys = Object.keys(top), cacti = []
  for (let k = 0; k < 40 && cacti.length < Math.round(s / 3); k++) { const [a, c] = pick(keys).split(',').map(Number); if (Math.hypot(a, c) > r * 0.85 || cacti.some(([x, z]) => Math.abs(x - a) < 3 && Math.abs(z - c) < 3)) continue; cacti.push([a, c]); L.box(a, top[a + ',' + c], cc + c, a, top[a + ',' + c] + ri(0, 2), cc + c, 'cactus') }
  for (let k = 0; k < Math.round(s / 2.5); k++) { const [a, c] = pick(keys).split(',').map(Number); if (!cacti.some(([x, z]) => Math.abs(x - a) < 2 && Math.abs(z - c) < 2)) L.set(a, top[a + ',' + c], cc + c, 'dead_bush') }
  const px = Math.round(r * 0.4), pc = cc + Math.round(r * 0.3), t0 = top[px + ',' + (pc - cc)] || 0
  for (let k = 0; k < 5; k++) L.box(px - 4 + k, t0 + k, pc - 4 + k, px + 4 - k, t0 + k, pc + 4 - k, k === 4 ? 'chiseled_sandstone' : k % 2 ? 'cut_sandstone' : 'sandstone')
  const ox = -Math.round(r * 0.4), oc = cc - Math.round(r * 0.2)
  L.cyl(ox, oc, 5, 0, 6, 'air'); L.cyl(ox, oc, 5, -1, -1, 'grass_block'); L.cyl(ox, oc, 3, -2, -1, 'water')
  for (const [dx, dz] of [[4, 0], [-3, 3]]) { const x = ox + dx, z = oc + dz; L.box(x, 0, z, x, 5, z, 'jungle_log[axis=y]'); L.set(x, 6, z, 'jungle_leaves[persistent=true]'); for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.line(x, 6, z, x + 3 * ex, 5, z + 3 * ez, 'jungle_leaves[persistent=true]') }
  L.summon('camel', ox + 2, 0, oc - 4); L.summon('rabbit', px, 0, pc - 7)
}
function mushroomforest (L, n) {
  const cnt = clamp(n[0] || 12, 3, 60), R = Math.round(Math.sqrt(cnt) * 5) + 4, cc = R + 2
  L.box(-R, 0, cc - R, R, 22, cc + R, 'air'); L.cyl(0, cc, R, -1, -1, 'mycelium')
  for (let k = 0; k < cnt; k++) {
    const a = ri(-R + 5, R - 5), c = cc + ri(-R + 5, R - 5); if (Math.hypot(a, c - cc) > R - 5) continue
    const red = rnd() < 0.5, h = ri(5, 13), big = h > 9
    if (big) L.box(a, 0, c, a + 1, h, c + 1, 'mushroom_stem'); else L.box(a, 0, c, a, h, c, 'mushroom_stem')
    if (red) { const r = big ? 5 : 3; L.sphere(a, h, c, r, 'red_mushroom_block', true, (x, y) => y >= 0); L.set(a - 1, h, c, 'shroomlight') } else { const r = big ? 6 : 4; L.cyl(a, c, r, h + 1, h + 1, 'brown_mushroom_block'); L.cyl(a, c, r - 2, h + 2, h + 2, 'brown_mushroom_block'); L.set(a, h, c - 1, 'shroomlight') }
  }
  for (let k = 0; k < cnt * 3; k++) L.set(ri(-R + 2, R - 2), 0, cc + ri(-R + 2, R - 2), pick(['red_mushroom', 'brown_mushroom']))
  L.summon('mooshroom', 0, 0, cc); L.summon('mooshroom', 2, 0, cc + 1)
}
function crystalcave (L, n) {
  const r = clamp(n[0] || 12, 7, 30), cc = r + 3
  L.box(-r - 2, 0, cc - r - 2, r + 2, r + 2, cc + r + 2, 'air')
  const up = (a, v) => v >= -1
  L.sphere(0, 0, cc, r + 1, 'smooth_basalt', true, up); L.sphere(0, 0, cc, r, 'calcite', true, up); L.sphere(0, 0, cc, r - 1, 'amethyst_block', true, up)
  L.cyl(0, cc, r - 1.5, -1, -1, 'tuff')
  for (let k = 0; k < r * 4; k++) { const t = rnd() * Math.PI * 2, p = rnd() * Math.PI / 2, rr = r - 1; L.set(Math.round(rr * Math.cos(t) * Math.cos(p)), Math.round(rr * Math.sin(p)), cc + Math.round(rr * Math.sin(t) * Math.cos(p)), pick(['budding_amethyst', 'sea_lantern', 'glowstone', 'budding_amethyst'])) }
  for (let k = 0; k < r * 3; k++) { const a = ri(-r + 3, r - 3), c = ri(-r + 3, r - 3), q = (r - 1.5) ** 2 - a * a - c * c; if (q < 1) continue; L.set(a, Math.floor(Math.sqrt(q)), cc + c, pick(['amethyst_cluster[facing=down]', 'pointed_dripstone[vertical_direction=down,thickness=tip]'])) }
  for (let k = 0; k < r * 3; k++) { const a = ri(-r + 3, r - 3), c = ri(-r + 3, r - 3); if (Math.hypot(a, c) < r - 3) L.set(a, 0, cc + c, pick(['amethyst_cluster[facing=up]', 'large_amethyst_bud[facing=up]', 'medium_amethyst_bud[facing=up]'])) }
  for (let k = 0; k < 5; k++) { const a = ri(-r + 4, r - 4), c = ri(-r + 4, r - 4), ht = ri(2, Math.min(7, r - 3)); L.box(a, 0, cc + c, a, ht, cc + c, 'amethyst_block'); L.set(a, ht + 1, cc + c, 'amethyst_cluster[facing=up]') }
  L.cyl(3, cc + 3, 2, -2, -1, 'water'); L.set(3, -2, cc + 3, 'sea_lantern')
  L.box(-1, 0, cc - r - 2, 1, 2, cc - r + 2, 'air'); L.set(-2, 1, cc - r - 2, 'soul_lantern'); L.set(2, 1, cc - r - 2, 'soul_lantern')
}
function floatingislands (L, n) {
  const cnt = clamp(n[0] || 5, 1, 20), R = 8 + cnt * 4, nz = noise2(rnd() * 100)
  for (let k = 0; k < cnt; k++) {
    const a = ri(-R, R), c = ri(8, 2 * R), v = ri(14, 34), r = ri(4, 8)
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = Math.hypot(x, z) / r * (1 + 0.2 * nz(x + k * 10, z)); if (d >= 1) continue
      const depth = Math.max(1, Math.round((1 - d) * r * 1.4 + 1.5 * nz(z, x + k)))
      if (depth > 3) L.box(a + x, v - depth, c + z, a + x, v - 3, c + z, 'stone')
      if (depth >= 2) L.box(a + x, Math.max(v - 2, v - depth + 1), c + z, a + x, v - 1, c + z, 'dirt')
      L.set(a + x, v, c + z, 'grass_block')
    }
    L.feature(pick(['oak', 'birch', 'fancy_oak', 'cherry', 'azalea_tree']), a, v + 1, c)
    for (let f = 0; f < 4; f++) L.flower(a + ri(-r + 2, r - 2), c + ri(-r + 2, r - 2), v + 1)
    if (k === 0) L.set(a + r - 2, v, c, 'water')
    L.set(a, v - Math.round(r * 1.2), c, 'glowstone')
  }
}
function city (L, n) {
  const size = clamp(n[0] || 64, 30, 120), blk = 22, rd = 6, k = Math.max(1, Math.floor(size / blk)), half = Math.floor((k * blk + rd) / 2)
  const W0 = -half, ext = k * blk + rd - 1
  L.box(W0, -1, 0, W0 + ext, -1, ext, 'smooth_stone')
  for (let i = 0; i <= k; i++) {
    const p = i * blk
    L.box(W0, 0, p, W0 + ext, 8, p + rd - 1, 'air'); L.box(W0 + p, 0, 0, W0 + p + rd - 1, 8, ext, 'air')
    L.box(W0, -1, p, W0 + ext, -1, p + rd - 1, 'gray_concrete'); L.box(W0 + p, -1, 0, W0 + p + rd - 1, -1, ext, 'gray_concrete')
    for (let q = 0; q <= ext; q += 4) { L.set(W0 + q, -1, p + 2, 'yellow_concrete'); L.set(W0 + p + 2, -1, q, 'yellow_concrete') }
  }
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const a0 = W0 + j * blk + rd, c0 = i * blk + rd, lot = blk - rd
    if (rnd() < 0.2) {
      L.box(a0, 0, c0, a0 + lot - 1, 30, c0 + lot - 1, 'air'); L.box(a0, -1, c0, a0 + lot - 1, -1, c0 + lot - 1, 'grass_block')
      for (let t = 0; t < 3; t++) L.feature(pick(['oak', 'birch', 'cherry']), a0 + ri(2, lot - 3), 0, c0 + ri(2, lot - 3))
      L.cyl(a0 + lot / 2, c0 + lot / 2, 2, -1, -1, 'water'); L.lamp(a0 + 1, c0 + 1, 3, 'dark_oak_fence')
    } else {
      const h = ri(14, 24 + size / 2), w = ri(9, lot - 3), d = ri(9, lot - 3)
      L.box(a0, 0, c0, a0 + lot - 1, h + 12, c0 + lot - 1, 'air')
      sky(L, a0 + Math.floor((lot - w) / 2), c0 + Math.floor((lot - d) / 2), w, d, h, pick(PALS))
    }
    L.lamp(a0, c0, 4, 'polished_blackstone_wall'); L.lamp(a0 + lot - 1, c0 + lot - 1, 4, 'polished_blackstone_wall')
  }
}

const BUILDS = {
  castle: { args: '[size]', desc: 'castle: walls, towers, moat, keep', off: 7, fn: castle },
  medieval: { args: '', desc: 'medieval timber house', off: 4, fn: medieval },
  cabin: { args: '', desc: 'log cabin with porch', off: 5, fn: cabin },
  cottage: { args: '', desc: 'small brick-roof cottage', off: 4, fn: cottage },
  skyscraper: { args: '[height] [width]', desc: 'glass tower', off: 6, fn: (L, n) => { const h = clamp(n[0] || 40, 8, 250), w = clamp(n[1] || 11, 5, 31); L.clear(-Math.ceil(w / 2) - 3, -3, Math.ceil(w / 2) + 3, w + 3, h + 12, 'smooth_stone'); sky(L, -Math.floor(w / 2), 0, w, w, h, pick(PALS)) } },
  lighthouse: { args: '[height]', desc: 'striped lighthouse', off: 3, fn: lighthouse },
  windmill: { args: '', desc: 'windmill with sails and wheat', off: 4, fn: windmill },
  bridge: { args: '[length]', desc: 'arched stone bridge over water', off: 2, fn: bridge },
  pixelart: { args: '<creeper|heart|smiley|sword|pig|diamond|mushroom> [scale]', desc: 'pixel art wall', off: 3, fn: pixelart },
  statue: { args: '<steve|creeper|golem> [scale]', desc: 'blocky statue', off: 3, fn: statue },
  ship: { args: '[length]', desc: 'sailing ship on water', off: 5, fn: (L, n) => ship(L, n, false) },
  pirateship: { args: '[length]', desc: 'pirate ship with cannons', off: 5, fn: (L, n) => ship(L, n, true) },
  temple: { args: '[size]', desc: 'stepped jungle temple', off: 3, fn: temple },
  pagoda: { args: '[floors]', desc: 'Japanese pagoda', off: 4, fn: pagoda },
  farm: { args: '', desc: 'crops, barn and animals', off: 3, fn: farm },
  village: { args: '[houses]', desc: 'houses, road, well, villagers', off: 4, fn: village },
  road: { args: '[length]', desc: 'road with lamps', off: 1, fn: road },
  fountain: { args: '', desc: 'plaza fountain', off: 2, fn: fountain },
  garden: { args: '[size]', desc: 'hedge garden with flowers and pond', off: 2, fn: garden },
  maze: { args: '[size] [block]', desc: 'random maze', off: 2, fn: maze },
  stadium: { args: '[size]', desc: 'arena with stands and lights', off: 2, fn: stadium },
  rollercoaster: { args: '[size]', desc: 'rail loop with hills and a cart', off: 2, fn: rollercoaster },
  car: { args: '[color]', desc: 'car', off: 3, fn: car },
  plane: { args: '[length]', desc: 'airliner', off: 3, fn: plane },
  rocket: { args: '[height]', desc: 'rocket on a launch pad', off: 3, fn: rocket },
  treehouse: { args: '', desc: 'treehouse with ladder', off: 3, fn: treehouse },
  igloo: { args: '', desc: 'igloo', off: 3, fn: igloo },
  snowman: { args: '[scale]', desc: 'giant snowman', off: 3, fn: snowman },
  gianttree: { args: '[height] [wood]', desc: 'giant tree', off: 3, fn: gianttree, terrain: true },
  waterfall: { args: '[height]', desc: 'cliff with waterfall and pool', off: 2, fn: waterfall, terrain: true },
  canyon: { args: '[length]', desc: 'striped mesa canyon with river', off: 2, fn: canyon, terrain: true },
  desert: { args: '[size]', desc: 'dunes, cacti, oasis, pyramid', off: 2, fn: desert, terrain: true },
  mushroomforest: { args: '[count]', desc: 'giant mushrooms on mycelium', off: 2, fn: mushroomforest, terrain: true },
  crystalcave: { args: '[radius]', desc: 'amethyst geode cave', off: 2, fn: crystalcave, terrain: true },
  floatingislands: { args: '[count]', desc: 'sky islands', off: 2, fn: floatingislands, terrain: true },
  city: { args: '[size]', desc: 'skyscrapers, roads, parks', off: 3, fn: city, terrain: true }
}
const ALIASES = { medievalhouse: 'medieval', logcabin: 'cabin', tower_block: 'skyscraper', pixel: 'pixelart', pirate: 'pirateship', boat: 'ship', japanesepagoda: 'pagoda', arena: 'stadium', coaster: 'rollercoaster', rollercoastertrack: 'rollercoaster', airplane: 'plane', aeroplane: 'plane', jet: 'plane', spaceship: 'rocket', bigtree: 'gianttree', mesa: 'canyon', mushrooms: 'mushroomforest', mushroom: 'mushroomforest', crystal: 'crystalcave', geode: 'crystalcave', cave: 'crystalcave', floating: 'floatingislands', skyislands: 'floatingislands', floatingisland: 'floatingislands', town: 'village', street: 'road', labyrinth: 'maze' }
const resolve = s => BUILDS[s] ? s : ALIASES[s] || null
module.exports = { BUILDS, resolve, makeL }


