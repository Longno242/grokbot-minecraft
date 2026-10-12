// Modern houses built with /fill and /setblock in local coords:
// u = player's right, v = up (0 = feet level), w = away from player. Front wall faces the player.
const { Vec3 } = require('vec3')
const NAMES = { '1,0': 'east', '-1,0': 'west', '0,1': 'south', '0,-1': 'north' }
module.exports = function modernOps (tier, entity) {
  const dx = -Math.sin(entity.yaw), dz = -Math.cos(entity.yaw)
  const d = Math.abs(dx) > Math.abs(dz) ? new Vec3(Math.sign(dx), 0, 0) : new Vec3(0, 0, Math.sign(dz))
  const u = new Vec3(-d.z, 0, d.x)
  const nm = v => NAMES[v.x + ',' + v.z]
  const TOK = { F: nm(d.scaled(-1)), B: nm(d), R: nm(u), L: nm(u.scaled(-1)) }
  const T = s => s.replace(/\{(F|B|R|L)\}/g, (_, k) => TOK[k])
  const off = { simple: 4, normal: 9, advanced: 15 }[tier]
  const base = entity.position.floored().plus(d.scaled(off))
  const W = (a, v, c) => base.plus(u.scaled(a)).plus(d.scaled(c)).offset(0, v, 0)
  const ops = []
  const fill = (u1, v1, w1, u2, v2, w2, block, mode) => ops.push({ fill: [W(u1, v1, w1), W(u2, v2, w2)], block: T(block), mode })
  const set = (a, v, c, block) => ops.push({ set: W(a, v, c), block: T(block) })
  const raw = s => ops.push({ raw: s, late: true })
  const PU = 'glass_pane[{R}=true,{L}=true]', PW = 'glass_pane[{F}=true,{B}=true]'
  const door = (a, c, wood, hinge = 'left', facing = '{B}') => { set(a, 0, c, `${wood}_door[facing=${facing},half=lower,hinge=${hinge}]`); set(a, 1, c, `${wood}_door[facing=${facing},half=upper,hinge=${hinge}]`) }
  const bed = (a, v, c, color) => { set(a, v, c, `${color}_bed[facing={B},part=foot]`); set(a, v, c + 1, `${color}_bed[facing={B},part=head]`) }
  const tree = (a, c, f) => { const p = W(a, 0, c); ops.push({ raw: `place feature minecraft:${f} ${p.x} ${p.y} ${p.z}`, late: true }) }
  const FLOWERS = ['poppy', 'dandelion', 'allium', 'azure_bluet', 'cornflower', 'oxeye_daisy', 'lily_of_the_valley', 'red_tulip', 'pink_tulip']
  let fi = 0; const flower = (a, c) => set(a, 0, c, FLOWERS[fi++ % FLOWERS.length])

  if (tier === 'simple') {
    fill(-6, 0, -3, 6, 6, 10, 'air'); fill(-6, -1, -3, 6, -1, 10, 'grass_block')
    fill(-4, -1, 0, 4, 4, 7, 'white_concrete', 'hollow')
    fill(-3, -1, 1, 3, -1, 6, 'smooth_stone')
    fill(-5, 4, -1, 5, 4, 8, 'white_concrete')
    fill(-3, 2, 0, -1, 2, 0, PU); fill(1, 2, 0, 3, 2, 0, PU); fill(-3, 2, 7, 3, 2, 7, PU)
    fill(-4, 2, 1, -4, 2, 6, PW); fill(4, 2, 1, 4, 2, 6, PW)
    door(0, 0, 'dark_oak')
    set(0, 3, 4, 'lantern[hanging=true]'); set(0, 3, -1, 'lantern[hanging=true]')
    fill(0, -1, -3, 0, -1, -1, 'dirt_path')
    set(-2, 0, 6, 'red_bed[facing={F},part=head]'); set(-2, 0, 5, 'red_bed[facing={F},part=foot]')
    set(2, 0, 6, 'crafting_table'); set(3, 0, 6, 'barrel[facing=up]'); set(3, 0, 1, 'potted_fern')
    return ops
  }
  if (tier === 'normal') {
    fill(-9, 0, -7, 11, 12, 13, 'air'); fill(-9, -1, -7, 11, -1, 13, 'grass_block')
    // ground floor
    fill(-6, -1, 0, 6, 4, 9, 'white_concrete', 'hollow')
    fill(-5, -1, 1, 5, -1, 8, 'polished_andesite')
    fill(-5, 0, 0, 5, 3, 0, 'glass')                    // big front glass wall
    fill(-6, 0, 0, -6, 3, 0, 'stripped_dark_oak_log[axis=y]'); fill(6, 0, 0, 6, 3, 0, 'stripped_dark_oak_log[axis=y]')
    fill(-6, 0, 3, -6, 2, 6, 'glass')
    door(2, 0, 'dark_oak'); door(3, 0, 'dark_oak', 'right')
    // upper floor, offset right and cantilevered toward the front
    fill(-3, 4, -2, 9, 8, 9, 'light_gray_concrete', 'hollow')
    fill(-2, 4, -1, 8, 4, 8, 'spruce_planks')
    fill(-2, 5, -2, 8, 7, -2, 'glass'); fill(9, 5, 0, 9, 7, 7, 'glass'); fill(-3, 5, 2, -3, 7, 6, 'glass')
    fill(-3, 4, -2, 9, 4, -2, 'dark_oak_planks')          // wood fascia under cantilever
    // flat roof with overhang + dark oak trim
    fill(-4, 8, -3, 10, 8, 10, 'dark_oak_planks'); fill(-3, 8, -2, 9, 8, 9, 'white_concrete')
    // stairs ground -> upper
    for (let k = 0; k < 4; k++) set(-2, k, 3 + k, 'spruce_stairs[facing={B}]')
    fill(-2, 4, 3, -2, 4, 7, 'air'); fill(-1, 0, 3, -1, 3, 7, 'air')
    // lights & furniture
    for (const [a, c] of [[-3, 3], [3, 5], [0, 7]]) set(a, 3, c, 'lantern[hanging=true]')
    set(3, 7, 4, 'lantern[hanging=true]'); set(7, 7, 7, 'lantern[hanging=true]')
    fill(1, 0, 5, 3, 0, 5, 'quartz_stairs[facing={B}]'); set(2, 0, 7, 'dark_oak_fence'); set(2, 1, 7, 'white_carpet')
    set(5, 0, 8, 'smoker[facing={F}]'); set(4, 0, 8, 'barrel[facing=up]'); set(3, 0, 8, 'water_cauldron[level=3]')
    bed(6, 5, 6, 'light_gray'); set(5, 5, 8, 'bookshelf'); set(4, 5, 8, 'bookshelf'); set(7, 5, 2, 'potted_red_tulip')
    fill(0, 5, 2, 3, 5, 5, 'gray_carpet')
    // garden
    fill(2, -1, -7, 3, -1, -1, 'dirt_path')
    fill(-9, 0, -7, -9, 0, 12, 'oak_leaves[persistent=true]'); fill(11, 0, -7, 11, 0, 12, 'oak_leaves[persistent=true]')
    for (const [a, c] of [[-7, -5], [-5, -3], [-3, -6], [-1, -4], [5, -5], [7, -3], [9, -6], [6, -2], [-6, -1], [8, -1]]) flower(a, c)
    set(1, 0, -6, 'lantern'); set(4, 0, -6, 'lantern')
    tree(-7, 11, 'birch')
    return ops
  }
  // ---------- advanced villa ----------
  fill(-17, 0, -13, 17, 16, 26, 'air'); fill(-17, -1, -13, 17, -1, 26, 'grass_block')
  // level 1 (living/kitchen)
  fill(-12, -1, 2, 4, 4, 17, 'white_concrete', 'hollow')
  fill(-11, -1, 3, 3, -1, 16, 'smooth_quartz')
  fill(-11, 0, 2, 3, 3, 2, 'glass')                                   // floor-to-ceiling front glass
  fill(-12, 0, 2, -12, 4, 2, 'black_concrete'); fill(4, 0, 2, 4, 4, 2, 'black_concrete'); fill(-12, 4, 2, 4, 4, 2, 'black_concrete')
  fill(-12, 0, 6, -12, 3, 13, 'glass'); fill(-8, 0, 17, 0, 3, 17, 'glass')   // side + back glass toward pool
  door(-4, 2, 'dark_oak'); door(-3, 2, 'dark_oak', 'right')
  // garage wing
  fill(5, -1, 6, 12, 4, 17, 'light_gray_concrete', 'hollow')
  fill(6, -1, 7, 11, -1, 16, 'polished_deepslate'); fill(6, 0, 6, 11, 2, 6, 'air')
  fill(5, 3, 6, 12, 4, 6, 'polished_deepslate')
  set(5, 2, 5, 'lantern'); set(12, 2, 5, 'lantern')
  // level 2 cantilever
  fill(-14, 4, 0, 6, 9, 15, 'white_concrete', 'hollow')
  fill(-13, 4, 1, 5, 4, 14, 'dark_oak_planks')
  fill(-13, 5, 0, 5, 8, 0, 'glass')
  for (const a of [-13, -9, -1, 3]) fill(a, 5, 0, a, 8, 0, 'stripped_dark_oak_log[axis=y]')
  fill(-14, 5, 1, -14, 8, 14, 'tinted_glass'); fill(6, 5, 2, 6, 8, 13, 'glass')
  fill(-14, 4, 0, 6, 4, 0, 'polished_deepslate'); fill(-14, 9, 0, 6, 9, 0, 'polished_deepslate')
  // cantilevered balcony with glass railing
  fill(-10, 4, -4, -2, 4, -1, 'polished_deepslate')
  fill(-10, 5, -4, -2, 5, -4, PU); fill(-10, 5, -3, -10, 5, -1, PW); fill(-2, 5, -3, -2, 5, -1, PW)
  fill(-7, 5, 0, -5, 6, 0, 'air')
  set(-9, 5, -2, 'potted_bamboo'); set(-3, 5, -2, 'dark_oak_stairs[facing={B}]'); set(-4, 5, -2, 'dark_oak_stairs[facing={B}]')
  // rooftop terrace
  fill(-13, 9, 1, 5, 9, 14, 'smooth_quartz')
  fill(-14, 10, 0, 6, 10, 0, 'glass'); fill(-14, 10, 15, 6, 10, 15, 'glass'); fill(-14, 10, 1, -14, 10, 14, 'glass'); fill(6, 10, 1, 6, 10, 14, 'glass')
  fill(-12, 10, 3, -9, 10, 3, 'quartz_stairs[facing={F}]'); set(-10, 10, 5, 'dark_oak_fence'); set(-10, 11, 5, 'white_carpet')
  for (const [a, c] of [[-13, 1], [5, 1], [-13, 14], [5, 14]]) set(a, 10, c, 'lantern')
  set(0, 10, 8, 'potted_azalea_bush'); set(-4, 10, 12, 'potted_cactus')
  for (let k = 0; k < 4; k++) set(4, 5 + k, 14, 'ladder[facing={F}]'); set(4, 9, 14, 'air')
  // stairs level1 -> level2
  for (let k = 0; k < 4; k++) set(-10, k, 8 + k, 'dark_oak_stairs[facing={B}]')
  fill(-10, 4, 8, -10, 4, 12, 'air')
  // hidden lighting: sea lanterns in ceiling (covered by carpet above), glowstone under carpets
  for (const [a, c] of [[-6, 6], [-2, 10], [-6, 13], [1, 6]]) { set(a, 4, c, 'sea_lantern'); set(a, 5, c, 'light_gray_carpet') }
  set(-8, -1, 8, 'glowstone'); set(-4, -1, 12, 'glowstone')
  // level 1 furniture
  fill(-10, 0, 7, -6, 0, 9, 'light_gray_carpet')
  fill(-10, 0, 6, -6, 0, 6, 'quartz_stairs[facing={F}]'); set(-11, 0, 6, 'quartz_slab'); set(-5, 0, 6, 'quartz_slab')
  set(-8, 0, 8, 'black_carpet')
  fill(-4, 0, 11, -3, 0, 11, 'dark_oak_fence'); fill(-4, 1, 11, -3, 1, 11, 'white_carpet')
  set(-5, 0, 11, 'dark_oak_stairs[facing={L}]'); set(-2, 0, 11, 'dark_oak_stairs[facing={R}]')
  set(0, 0, 16, 'smoker[facing={F}]'); set(1, 0, 16, 'barrel[facing=up]'); set(2, 0, 16, 'water_cauldron[level=3]'); set(3, 0, 16, 'smoker[facing={F}]')
  fill(0, 1, 16, 3, 1, 16, 'air'); set(3, 0, 15, 'polished_deepslate_slab'); set(3, 1, 15, 'potted_red_tulip')
  fill(-11, 0, 15, -11, 2, 16, 'bookshelf'); set(-11, 0, 3, 'potted_fern'); set(3, 0, 3, 'potted_fern')
  // level 2 bedrooms
  bed(0, 5, 12, 'white'); bed(2, 5, 12, 'gray'); set(1, 5, 14, 'lantern')
  fill(-13, 5, 10, -13, 7, 14, 'bookshelf'); fill(-1, 5, 9, 3, 5, 11, 'light_blue_carpet')
  set(-8, 5, 13, 'dark_oak_fence'); set(-8, 6, 13, 'potted_white_tulip'); set(-7, 5, 13, 'dark_oak_stairs[facing={B}]')
  // infinity pool behind the house
  fill(-13, -1, 18, 3, -1, 24, 'sea_lantern')
  fill(-12, -3, 19, 2, -3, 23, 'light_blue_concrete'); fill(-12, -2, 19, 2, -1, 23, 'water')
  fill(-12, 0, 18, 2, 0, 18, 'smooth_stone_slab')
  // driveway, path, landscaping
  fill(6, -1, -13, 11, -1, 5, 'gray_concrete'); fill(5, -1, -13, 5, -1, 5, 'polished_andesite'); fill(12, -1, -13, 12, -1, 5, 'polished_andesite')
  fill(-4, -1, -13, -3, -1, 1, 'smooth_stone')
  fill(-17, 0, -13, -17, 0, 26, 'oak_leaves[persistent=true]'); fill(17, 0, -13, 17, 0, 26, 'oak_leaves[persistent=true]')
  fill(-16, 0, -13, 4, 0, -13, 'oak_leaves[persistent=true]'); fill(-4, 0, -13, -3, 0, -13, 'air')
  for (const [a, c] of [[-14, -9], [-9, -7], [-7, -10], [-12, -4], [0, -8], [2, -5], [-1, -11], [-15, -2]]) flower(a, c)
  for (const [a, c] of [[-5, -12], [-2, -12], [-5, -4], [-2, -4]]) set(a, 0, c, 'lantern')
  tree(-14, -10, 'birch'); tree(-9, -9, 'fancy_oak'); tree(14, -9, 'birch'); tree(14, 21, 'oak'); tree(-15, 21, 'cherry'); tree(8, 22, 'birch')
  return ops
}

