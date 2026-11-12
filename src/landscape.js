// "Landscape" sky for the weather card (config.wxAnim = "landscape"): the illustrated scene of the GlassHome Weather Scene
// widget (its tall "pill" form), laid out for the wide card. The sky of the weather disc (condition colour, temperature
// tint, time-of-day wash, sun ripples, clouds, stars, fog, leaves, lightning, rain, snow, hail), a sun or moon placed by the
// time of day that sets behind the hills, three ridges of weather-tinted land with conifers, hot-air balloons in fair
// weather, a snowman in snow and a street lamp in fog. Drawn once per state as plain SVG (cached), animated with CSS.
import { unsafeHTML } from "lit/directives/unsafe-html.js";

const W = 160, H = 100, HZ = 72;   // viewBox, horizon in % of the height (the pill's low horizon)
const NIGHT = { hi: "oklch(0.44 0.16 292)", lo: "oklch(0.26 0.14 299)", glow: "oklch(0.55 0.19 295 / 0.55)" };
/** condition colours and accessories, as in the widget's visual() */
function visual(c, night) {
  switch (c) {
    case "sunny": return night ? { ...NIGHT, body: "moon", acc: ["stars"] } : { hi: "oklch(0.78 0.11 232)", lo: "oklch(0.62 0.13 246)", glow: "oklch(0.80 0.15 75 / 0.5)", body: "sun", acc: [] };
    case "clear-night": return { ...NIGHT, body: "moon", acc: ["stars"] };
    case "partlycloudy": return night ? { hi: "oklch(0.46 0.13 285)", lo: "oklch(0.30 0.12 292)", glow: NIGHT.glow, body: "moon", acc: ["stars", "clouds"] }
      : { hi: "oklch(0.74 0.10 235)", lo: "oklch(0.58 0.13 250)", glow: "oklch(0.70 0.12 240 / 0.45)", body: "sun", acc: ["clouds"] };
    case "cloudy": return { hi: "oklch(0.72 0.03 250)", lo: "oklch(0.55 0.03 255)", glow: "oklch(0.72 0.02 250 / 0.40)", acc: ["clouds"] };
    case "rainy": return { hi: "oklch(0.66 0.07 220)", lo: "oklch(0.48 0.08 228)", glow: "oklch(0.64 0.09 218 / 0.45)", acc: ["clouds", "rain"] };
    case "pouring": return { hi: "oklch(0.60 0.08 224)", lo: "oklch(0.42 0.09 232)", glow: "oklch(0.58 0.10 222 / 0.5)", acc: ["clouds", "rainHeavy"] };
    case "snowy": return { hi: "oklch(0.80 0.04 275)", lo: "oklch(0.64 0.05 270)", glow: "oklch(0.86 0.05 282 / 0.55)", acc: ["clouds", "snow"], alpha: 74 };
    case "snowy-rainy": return { hi: "oklch(0.72 0.05 252)", lo: "oklch(0.56 0.06 256)", glow: "oklch(0.76 0.06 260 / 0.5)", acc: ["clouds", "snow", "rain"] };
    case "lightning": case "lightning-rainy": return { hi: "oklch(0.44 0.13 285)", lo: "oklch(0.28 0.12 291)", glow: "oklch(0.60 0.21 292 / 0.6)", acc: c === "lightning-rainy" ? ["clouds", "lightning", "rain"] : ["clouds", "lightning"] };
    case "fog": return { hi: "oklch(0.80 0.012 250)", lo: "oklch(0.66 0.012 250)", glow: "oklch(0.82 0.01 250 / 0.35)", acc: ["fog"], alpha: 82 };
    case "hail": return { hi: "oklch(0.78 0.05 235)", lo: "oklch(0.60 0.06 242)", glow: "oklch(0.80 0.06 238 / 0.5)", acc: ["hail"] };
    case "windy": return night ? { ...NIGHT, body: "moon", acc: ["stars", "wind"] } : { hi: "oklch(0.75 0.06 236)", lo: "oklch(0.60 0.08 246)", glow: "oklch(0.80 0.09 232 / 0.42)", body: "sun", acc: ["wind"] };
    case "windy-variant": return night ? { hi: "oklch(0.42 0.06 260)", lo: "oklch(0.28 0.05 265)", glow: NIGHT.glow, acc: ["wind", "clouds"] }
      : { hi: "oklch(0.71 0.04 240)", lo: "oklch(0.56 0.05 248)", glow: "oklch(0.78 0.06 235 / 0.4)", acc: ["wind", "clouds"] };
    default: return { hi: "oklch(0.64 0.10 30)", lo: "oklch(0.46 0.13 28)", glow: "oklch(0.62 0.14 30 / 0.5)", acc: ["clouds", "lightning"] };
  }
}
/** the sky as one stacked background: time-of-day wash, temperature tint, condition colour (the widget's faceBackground, tall form) */
function skyBg(v, phase, tC) {
  const warm = Math.min(1, Math.max(0, (tC - 18) / 17)) * .62, cool = Math.min(1, Math.max(0, (11 - tC) / 22)) * .5, L = [];
  if (phase === "night") L.push("linear-gradient(180deg, oklch(0.15 0.08 288 / 0.72) 0%, oklch(0.23 0.09 285 / 0.56) 58%, oklch(0.31 0.10 282 / 0.44) 100%)");
  else if (phase === "dawn") L.push("linear-gradient(180deg, oklch(0.80 0.09 45 / 0.34) 0%, oklch(0.86 0.09 355 / 0.22) 55%, oklch(0.82 0.10 20 / 0.12) 100%)");
  else if (phase === "dusk") L.push("linear-gradient(180deg, oklch(0.64 0.10 312 / 0.58) 0%, oklch(0.74 0.13 28 / 0.56) 52%, oklch(0.84 0.15 46 / 0.60) 100%)");
  if (warm > 0) L.push(`radial-gradient(125% 95% at 50% ${HZ}%, oklch(0.72 0.17 52 / ${warm.toFixed(3)}), transparent 62%)`);
  if (cool > 0) L.push(`linear-gradient(180deg, oklch(0.94 0.04 232 / ${cool.toFixed(3)}), transparent 58%)`);
  const a = Math.round((v.alpha ?? 42) * .45);   // much more see-through than the widget: the card's glass and the room photo carry the colour, as on every other card
  L.push(`radial-gradient(circle at 32% 24%, color-mix(in srgb, ${v.hi} ${a}%, transparent), color-mix(in srgb, ${v.lo} ${a}%, transparent))`);
  return L.join(", ");
}
/** sun by time of day (x, y in % of the sky): low left at dawn, high on the right by day (where the moon stands at night), low right at dusk, warmer near the horizon */
const SUN = { dawn: [26, 93, "oklch(0.90 0.13 58)", "oklch(0.73 0.19 34)"], dusk: [78, 94, "oklch(0.86 0.15 46)", "oklch(0.65 0.20 27)"], day: [74, 30, "oklch(0.94 0.14 92)", "oklch(0.82 0.18 68)"], night: [74, 30] };   // high on the right; low enough that a wide, flat card (its top is cropped) still shows it whole
/** land tones, far ridge → near (a … e): snow covers it; dawn / dusk / night follow the mood; by day it takes the weather */
function ground(c, phase, snow) {
  const g = (...l) => l.map(x => `oklch(${x})`);
  if (snow) return phase === "night" ? g("0.66 0.015 260", "0.58 0.02 261", "0.50 0.02 262", "0.38 0.025 264", "0.28 0.03 266") : g("0.93 0.008 250", "0.86 0.012 251", "0.78 0.015 252", "0.55 0.02 256", "0.40 0.03 259");
  if (phase === "night") return g("0.32 0.04 274", "0.25 0.04 271", "0.19 0.035 269", "0.14 0.03 267", "0.10 0.025 266");
  if (phase === "dawn") return g("0.70 0.10 355", "0.58 0.12 350", "0.46 0.13 345", "0.36 0.12 340", "0.27 0.11 336");
  if (phase === "dusk") return g("0.67 0.13 40", "0.55 0.14 31", "0.44 0.14 25", "0.34 0.13 20", "0.25 0.12 16");
  switch (c) {
    case "cloudy": case "windy-variant": case "exceptional": return g("0.68 0.08 143", "0.59 0.08 147", "0.50 0.08 151", "0.41 0.07 155", "0.33 0.06 159");
    case "rainy": case "pouring": case "lightning-rainy": case "hail": return g("0.56 0.07 165", "0.48 0.07 172", "0.40 0.06 180", "0.33 0.05 188", "0.26 0.045 196");
    case "fog": return g("0.70 0.03 158", "0.61 0.03 163", "0.52 0.025 168", "0.43 0.02 173", "0.35 0.02 178");
    case "lightning": return g("0.42 0.05 160", "0.35 0.05 166", "0.29 0.045 172", "0.23 0.04 178", "0.18 0.035 184");
    default: return g("0.75 0.13 138", "0.66 0.14 142", "0.56 0.14 146", "0.46 0.13 150", "0.37 0.11 154");
  }
}
const DAY_BALLOONS = [["#ffe3b0", "#e8934a"], ["#ffcdb8", "#df5f47"], ["#c6efe1", "#3fae95"]];
const MOOD_BALLOON = { dawn: ["#ffd3dd", "#e0708e"], dusk: ["#ffd2a3", "#e0673f"], night: ["#cfd3ef", "#7b71b2"] };
const stripes = (id, l, d) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` + [[0, l], [16, l], [17.4, d], [32.6, d], [34, l], [49.3, l], [50.7, d], [66, d], [67.4, l], [82.6, l], [84, d], [100, d]].map(([o, c]) => `<stop offset="${o}%" stop-color="${c}"/>`).join("") + `</linearGradient>`;
/** a striped hot-air balloon of width w with its basket, drifting across (the widget's Balloon) */
function balloon(id, y, w, dur, delay) {
  const hw = w / 2, He = w * 1.05, bw = w * .24, strY = He + w * .015, basY = He + w * .09;
  const drop = `M ${-hw} ${hw} A ${hw} ${hw} 0 0 1 ${hw} ${hw} C ${hw} ${He * .62}, ${hw * .34} ${He * .93}, 0 ${He} C ${-hw * .34} ${He * .93}, ${-hw} ${He * .62}, ${-hw} ${hw} Z`;
  return `<g transform="translate(0 ${y})"><g class="l-drift" style="animation-duration:${dur}s;animation-delay:${delay}s">
    <path d="M ${-bw * .5} ${He - w * .16} L ${bw * .5} ${He - w * .16} L ${bw * .32} ${strY} L ${-bw * .32} ${strY} Z" fill="#5a3a1c"/>
    <path d="${drop}" fill="url(#${id})"/><path d="${drop}" fill="url(#hcl-shade)"/>
    <ellipse cx="${-hw * .34}" cy="${hw * .7}" rx="${hw * .18}" ry="${He * .26}" fill="rgba(255,255,255,.18)"/>
    <line x1="${-bw * .3}" y1="${strY}" x2="${-bw * .24}" y2="${basY}" stroke="#6b4a2e" stroke-width="${w * .02}"/><line x1="${bw * .3}" y1="${strY}" x2="${bw * .24}" y2="${basY}" stroke="#6b4a2e" stroke-width="${w * .02}"/>
    <path d="M ${-bw * .3} ${basY} L ${bw * .3} ${basY} L ${bw * .22} ${basY + w * .1} Q 0 ${basY + w * .14} ${-bw * .22} ${basY + w * .1} Z" fill="#8a5a2c"/></g></g>`;
}
/** lit part of the moon for HA's moon phase (a real terminator), in a ±r box, lit on the right; waning mirrors it */
const MOON_K = { new_moon: .04, waxing_crescent: .27, first_quarter: .5, waxing_gibbous: .73, full_moon: 1, waning_gibbous: .73, last_quarter: .5, waning_crescent: .27 };
function moon(cx, cy, r, phase) {
  const k = MOON_K[phase] ?? 1, rx = r * (1 - 2 * k), lit = `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${Math.abs(rx).toFixed(2)} ${r} 0 0 ${rx > 0 ? 0 : 1} 0 ${-r} Z`;
  const flip = /waning|last/.test(phase) ? ` scale(-1 1)` : "", full = k >= .985;
  return `<g transform="translate(${cx} ${cy})" filter="url(#hcl-mglow)"><circle r="${r}" fill="oklch(0.52 0.03 285)"/>${full ? `<circle r="${r}" fill="url(#hcl-moon)"/>` : `<path d="${lit}" transform="${flip}" fill="url(#hcl-moon)"/>`}
    <circle r="${r - .3}" fill="none" stroke="oklch(0.90 0.05 90 / 0.28)" stroke-width=".5"/></g>`;
}
const cloud = (x, y, s, op, fill = "white") => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${(op * .62).toFixed(2)}" filter="url(#hcl-soft)"><path d="M -13 4 a 7 7 0 0 1 1 -13.8 a 9 9 0 0 1 17 -2 a 7.5 7.5 0 0 1 8 4.5 a 6.5 6.5 0 0 1 -1.5 11.3 z" fill="${fill}"/></g>`;
const tree = (x, y, h, fill) => `<path d="M${x} ${y - h} L${(x - h * .3).toFixed(1)} ${y} L${(x + h * .3).toFixed(1)} ${y} Z" fill="${fill}"/>`;
const ad = (d, dl) => `animation-duration:${d}s;animation-delay:${dl}s`;
/** precipitation scattered over the sky: columns × rows, alternate rows nudged sideways */
const field = (cols, rows) => rows.flatMap((y, ri) => cols.map(x => [x + (ri % 2 ? 9 : 0), y]));

function build(c, phase, tC, moonPhase, still) {
  const night = phase === "night", v = visual(c, night), acc = new Set(v.acc), gr = ground(c, phase, acc.has("snow")).map(g => `color-mix(in oklch, color-mix(in srgb, ${g} 66%, ${v.lo}) 55%, oklch(0.74 0.006 250))`);   // the land takes on the sky's colour (one mood) and is half greyed, so it sits quietly in the glass
  const [sx, sy, shi, slo] = SUN[phase] || SUN.day, SX = sx * W / 100, SY = sy * HZ / 100;   // sun in viewBox units
  let s = `<defs><radialGradient id="hcl-sun" cx="38%" cy="36%" r="70%"><stop offset="0" stop-color="${shi}"/><stop offset="1" stop-color="${slo}"/></radialGradient>
    <radialGradient id="hcl-moon" cx="38%" cy="34%" r="72%"><stop offset="0" stop-color="oklch(0.96 0.05 95)"/><stop offset="1" stop-color="oklch(0.84 0.06 90)"/></radialGradient>
    <radialGradient id="hcl-lamp"><stop offset="0" stop-color="rgba(255,214,140,.75)"/><stop offset="1" stop-color="rgba(255,214,140,0)"/></radialGradient>
    <linearGradient id="hcl-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(40,25,10,.34)"/><stop offset=".24" stop-color="rgba(40,25,10,0)"/><stop offset=".76" stop-color="rgba(40,25,10,0)"/><stop offset="1" stop-color="rgba(40,25,10,.34)"/></linearGradient>
    <radialGradient id="hcl-textg" cx="0" cy="0" r="1"><stop offset=".55" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient>
    <mask id="hcl-text" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><rect x="0" y="0" width="80" height="62" fill="url(#hcl-textg)"/></mask>
    <clipPath id="hcl-sky"><path d="M0 0 H${W} V65 C 93 70, 40 66, 0 73 Z"/></clipPath>
    <filter id="hcl-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".45"/></filter>
    <filter id="hcl-mist" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="hcl-mglow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="oklch(0.90 0.09 95)" flood-opacity=".6"/></filter>
    ${(phase === "day" ? DAY_BALLOONS : [0, 1, 2].map(() => MOOD_BALLOON[phase])).map(([l, d], i) => stripes(`hcl-b${i}`, l, d)).join("")}</defs>`;
  // surface shading: ripples radiating from the sun / moon on a clear sky, water bands in heavy weather
  const bands = (yl, yr, amp) => `M -10 ${yl} C 45 ${yl - amp}, 115 ${yr - amp}, ${W + 10} ${yr} L ${W + 10} ${H} L -10 ${H} Z`;
  // everything in the sky ends at the far ridge: the land is see-through, so nothing may show through the hills — the glow
  // and the ripples around the sun / moon included (the glow used to be a CSS layer behind the scene, unclipped)
  s += `<g clip-path="url(#hcl-sky)">`;
  s += `<radialGradient id="hcl-glow" gradientUnits="userSpaceOnUse" cx="${SX}" cy="${SY}" r="${W * 1.2}" gradientTransform="translate(${SX} ${SY}) scale(1 ${(.6 * H / (1.2 * W)).toFixed(4)}) translate(${-SX} ${-SY})"><stop offset="0" stop-color="${v.glow}"/><stop offset=".62" stop-color="transparent"/></radialGradient><rect width="${W}" height="${H}" fill="url(#hcl-glow)"/>`;
  s += `<g class="s-waves">` + (v.body
    ? (c === "sunny" ? [[32, 16, "#fff", .05], [60, 19, "#000", .05], [88, 22, "#000", .07], [120, 26, "#fff", .04]] : [[24, 12, "#fff", .05], [42, 13, "#000", .06], [62, 15, "#fff", .05], [84, 19, "#000", .05], [110, 22, "#fff", .04]])
      .map(([r, w, col, o]) => `<circle cx="${SX}" cy="${SY}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${o}"/>`).join("")
    : `<path d="${bands(31, 37, 9)}" fill="#fff" opacity=".05"/><path d="${bands(43, 48, 9)}" fill="#000" opacity=".07"/><path d="${bands(55, 60, 9)}" fill="#000" opacity=".1"/>`) + `</g>`;
  if (acc.has("stars")) s += `<g fill="#fff">` + [[10, 10], [22, 22], [34, 8], [48, 16], [60, 6], [18, 34], [70, 26], [84, 12], [96, 30], [108, 8], [122, 20], [136, 10], [148, 28], [8, 44], [130, 40], [56, 38]].map(([x, y], i) =>
    `<circle class="s-tw" style="${ad((2.6 + (i % 4) * .7).toFixed(1), ((i % 5) * .4).toFixed(1))}" cx="${x}" cy="${y}" r="${i % 3 ? .55 : .8}" opacity=".85"/>`).join("") + `</g>`;
  // the sun or moon, drawn before the hills so it sets behind them
  // the land is see-through now, so the sky is clipped at the far ridge: a low sun or moon must not shine through the hills
  if (v.body) s += `<g clip-path="url(#hcl-sky)">`;
  if (v.body === "sun") s += `<circle class="s-pulse" cx="${SX}" cy="${SY}" r="11" fill="url(#hcl-sun)" style="filter:drop-shadow(0 0 4px ${slo})"/>`;
  if (v.body === "moon") s += moon(SX, SY, 9.5, moonPhase);
  if (v.body) s += `</g>`;
  // clouds: around the sun's spot on a fair day, spread over the sky otherwise
  const cx = v.body ? Math.max(SX, 70) : 100;   // keep the clouds off the temperature in the top-left corner
  if (acc.has("clouds")) {
    if (c !== "partlycloudy") s += `<g class="s-drift" style="${ad(9, 0)}">${cloud(cx + 18, 25, 1.05, .96)}</g><g class="s-drift" style="${ad(11, .6)}">${cloud(cx - 26, 22, .75, .8, "oklch(0.96 0.01 250)")}</g>`;   // low enough that a wide, flat card (its top is cropped) still shows them whole
    s += `<g class="s-drift" style="${ad(12, 1.3)}">${cloud(cx + 28, 34, .85, .88, "oklch(0.96 0.01 250)")}</g>`;
  }
  if (acc.has("fog")) s += `<g filter="url(#hcl-mist)">` + [[60, 30, 64, 4, "#fff", .16, 8, 0], [96, 44, 72, 5, "oklch(0.5 0.01 250)", .12, 11, .8], [70, 58, 70, 6, "#fff", .2, 9.5, 1.4]].map(([x, y, rx, ry, f, o, d, dl]) =>
    `<ellipse class="s-mist" style="${ad(d, dl)}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" opacity="${o}"/>`).join("") + `</g>`;
  if (acc.has("wind")) s += [[40, 20, 1.1, "oklch(0.66 0.15 138)", 5.2, 0], [70, 34, .9, "oklch(0.71 0.15 78)", 6.4, 1.1], [56, 48, 1.2, "oklch(0.58 0.13 52)", 5.8, 2.3], [100, 26, .8, "oklch(0.68 0.16 128)", 7, .6], [120, 52, 1, "oklch(0.73 0.15 85)", 6, 3]].map(([x, y, k, col, d, dl]) =>
    `<g transform="translate(${x} ${y})"><g class="s-leaf" style="${ad(d, dl)}"><g transform="scale(${k})"><path fill="${col}" d="M0,-3.4 C2.4,-1.8 2.4,1.8 0,3.6 C-2.4,1.8 -2.4,-1.8 0,-3.4 Z"/><path fill="none" stroke="rgb(0 0 0 / .25)" stroke-width=".4" d="M0,-2.8 L0,3.2"/></g></g></g>`).join("");
  if (acc.has("lightning")) s += `<path class="s-bolt" transform="translate(${cx + 6} 40) scale(1.5)" d="M 2 -6 L -4 3 L 0 3 L -2 9 L 6 -1 L 1 -1 Z" fill="oklch(0.90 0.16 95)"/>`;
  s += `</g>`;
  // land: the far ridge is the horizon; ridges recede from light (far) to dark (near), each with a few conifers
  s += `<g class="l-land" opacity=".55"><path d="M0 73 C 40 66, 93 70, ${W} 65 L${W} ${H} L0 ${H} Z" fill="${gr[0]}"/>`;
  if (acc.has("snow")) s += `<g transform="translate(123 69.5) scale(1.3)"><circle cy="-2" r="3.3" fill="#fff"/><circle cy="-6.6" r="2.4" fill="#fff"/><circle cy="-10" r="1.7" fill="#fff"/>
    <ellipse cx="1.3" cy="-2" rx="1.1" ry="2.8" fill="rgba(140,160,190,.28)"/><path d="M -1.6 -8.4 Q 0 -7.6 1.6 -8.4 L 1.4 -7.4 Q 0 -6.7 -1.4 -7.4 Z" fill="#e0604a"/>
    <circle cx="-.6" cy="-10.4" r=".28" fill="#333"/><circle cx=".6" cy="-10.4" r=".28" fill="#333"/><path d="M 0 -10 L 1.7 -9.7 L 0 -9.4 Z" fill="#e8934a"/></g>`;
  if (c === "fog") s += `<g transform="translate(40 71.5) scale(1.3)"><circle class="l-glim" cy="-11.5" r="8" fill="url(#hcl-lamp)" opacity=".3"/><rect x="-.4" y="-10.5" width=".8" height="10.5" fill="${gr[4]}"/>
    <path d="M -1.9 -13.4 L 1.9 -13.4 L 1.3 -10.4 L -1.3 -10.4 Z" fill="${gr[4]}"/><rect x="-1.1" y="-12.9" width="2.2" height="2" rx=".3" fill="#ffdca0"/><rect x="-1.2" y="-13.8" width="2.4" height=".7" rx=".3" fill="${gr[4]}"/></g>`;
  s += `<path d="M0 85 C 53 80, 107 86, ${W} 82 L${W} ${H} L0 ${H} Z" fill="${gr[2]}"/>` + [[16, 84.5, 7], [45, 86.5, 9], [83, 84, 8], [123, 86, 8.5], [152, 83.5, 6.5]].map(([x, y, h]) => tree(x, y, h, gr[3])).join("");
  s += `<path d="M0 95 C 53 91, 107 97, ${W} 93 L${W} ${H} L0 ${H} Z" fill="${gr[3]}"/>` + [[29, 96, 10], [85, 97.5, 11], [133, 95.5, 9]].map(([x, y, h]) => tree(x, y, h, gr[4])).join("");
  s += `</g>`;
  // balloons drift across in fair weather (only while things move)
  if (!still && ["sunny", "partlycloudy", "clear-night"].includes(c)) s += `<g class="l-balloons" opacity=".7" clip-path="url(#hcl-sky)" mask="url(#hcl-text)">${balloon("hcl-b0", 10, 6, 75, -50)}${balloon("hcl-b1", 22, 9, 60, -12)}${balloon("hcl-b2", 38, 14, 48, -30)}</g>`;
  // precipitation over the sky down to the horizon
  s += `<g clip-path="url(#hcl-sky)">`;
  if (acc.has("rain") || acc.has("rainHeavy")) s += `<g stroke="${night ? "oklch(0.8 0.02 250 / 0.6)" : "#fff"}" stroke-width=".8" stroke-linecap="round" opacity=".7">` +
    field(acc.has("rainHeavy") ? [6, 22, 38, 54, 70, 86, 102, 118, 134, 150] : [12, 34, 56, 78, 100, 122, 144], [20, 36, 52]).map(([x, y], i) =>
      `<line class="l-fall" style="${ad((.7 + (i % 3) * .15).toFixed(2), ((i % 5) * .12).toFixed(2))}" x1="${x}" y1="${y}" x2="${x - 3}" y2="${y + 9}"/>`).join("") + `</g>`;
  if (acc.has("snow")) s += `<g fill="#fff" opacity=".92">` + field([12, 34, 56, 78, 100, 122, 144], [18, 34, 50]).map(([x, y], i) =>
    `<circle class="l-snow" style="${ad((3.4 + (i % 4) * .7).toFixed(1), ((i % 5) * .5).toFixed(1))}" cx="${x}" cy="${y}" r="${i % 2 ? .9 : 1.25}"/>`).join("") + `</g>`;
  if (acc.has("hail")) s += `<g fill="#fff" opacity=".95">` + field([14, 38, 62, 86, 110, 134], [22, 40, 56]).map(([x, y], i) =>
    `<circle class="l-fall" style="${ad((.55 + (i % 2) * .1).toFixed(2), ((i % 3) * .1).toFixed(1))}" cx="${x}" cy="${y}" r="1.2"/>`).join("") + `</g>`;
  s += `</g>`;
  return `<div class="wbg wls" style="background:${skyBg(v, phase, tC)}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${s}</svg></div>`;
}

/** dawn / day / dusk / night from sun.sun (elevation and rising), else the clock — as the widget does */
export function phaseOf(sun) {
  const el = Number(sun?.attributes?.elevation);
  if (sun?.state === "below_horizon") return "night";
  if (Number.isFinite(el)) return el < 0 ? "night" : el < 8 ? (sun?.attributes?.rising ? "dawn" : "dusk") : "day";
  const h = new Date().getHours();
  return h < 6 || h >= 21 ? "night" : h < 8 ? "dawn" : h < 17 ? "day" : "dusk";
}
const CACHE = new Map();
/** the landscape behind the weather card; tC in °C (only steps of 2° change the tint, so it is rebuilt rarely) */
export function landscape(cond, phase, tC, moonPhase, still, ns = "hcl") {
  const k = `${cond}|${phase}|${Math.round(tC / 2)}|${moonPhase}|${still}|${ns}`;   // ns: prefix of the SVG ids, so two scenes in one shadow root (card + popup) keep their own gradients
  if (!CACHE.has(k)) { if (CACHE.size > 40) CACHE.clear(); const svg = build(cond, phase, Math.round(tC / 2) * 2, moonPhase, still); CACHE.set(k, unsafeHTML(ns === "hcl" ? svg : svg.replaceAll("hcl-", ns + "-"))); }
  return CACHE.get(k);
}
export const landscapeStyles = `
  .wls{overflow:hidden}
  .wls svg{position:absolute;inset:0;width:100%;height:100%;display:block}
  .wls .s-waves{animation:s-waves 14s ease-in-out infinite}
  .wls .s-tw{animation:w-tw 3s ease-in-out infinite}
  .wls .s-drift{animation:s-drift 9s ease-in-out infinite}
  .wls .s-mist{animation:s-mist 9s ease-in-out infinite alternate}
  .wls .s-leaf{transform-origin:0 0;animation:s-leaf 6s linear infinite}
  .wls .s-bolt{animation:s-flash 3.2s ease-in-out infinite}
  .wls .s-pulse{transform-box:fill-box;transform-origin:center;animation:s-pulse 4.5s ease-in-out infinite}
  .wls .l-fall{animation:l-fall .8s linear infinite}
  .wls .l-snow{animation:l-snow 4s linear infinite}
  .wls .l-drift{animation:l-drift 60s linear infinite}
  .wls .l-glim{animation:l-glim 3.2s ease-in-out infinite}
  @keyframes l-fall{from{transform:translateY(-6px)}to{transform:translateY(9px)}}
  @keyframes l-snow{0%{transform:translate(-1.5px,-8px)}50%{transform:translate(1.5px,1px)}100%{transform:translate(-1.5px,10px)}}
  @keyframes l-drift{0%{transform:translate(-20px,0) rotate(0deg)}25%{transform:translate(30px,-3px) rotate(3deg)}50%{transform:translate(80px,2px) rotate(-3deg)}75%{transform:translate(130px,-2px) rotate(3deg)}100%{transform:translate(185px,0) rotate(0deg)}}
  @keyframes l-glim{0%,100%{opacity:.22}50%{opacity:.5}}
  :host(.still) .wls *{animation:none!important}
`;
