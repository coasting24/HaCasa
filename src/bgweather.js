// Live weather over the background photo: one photo, and HaCasa itself shows the sky outside. A soft tint follows the
// sun (rosy at dawn, blue-orange at dusk, deep blue at night; weaker while lights burn, so a lit photo stays warm) and
// the current weather lies over it as a quiet animation: rain streaks, falling snow, drifting fog, cloud shadows and the
// odd lightning flash. Works with any photo, the lit one and the living-photo effects included.
// The layer sits next to .bg (not inside it), so rain does not swell with the Ken Burns zoom. Without motion
// (Animations off) the weather stands still; performance mode keeps only the tint.
import { html, nothing } from "lit";

/** dawn / day / dusk / night from sun.sun */
export function sunPhase(hass) {
  const sun = hass.states["sun.sun"]; if (!sun) return "day";
  const el = Number(sun.attributes.elevation);
  if (!Number.isFinite(el)) return sun.state === "below_horizon" ? "night" : "day";
  return el < -6 ? "night" : el < 8 ? (sun.attributes.rising ? "dawn" : "dusk") : "day";
}

/** the weather entity's condition boiled down to what can be drawn */
export function wxKind(cond) {
  const c = cond || "";
  return {
    rain: /rain|pour|lightning-rainy|hail/.test(c) && !/snowy-rainy/.test(c),
    heavy: c === "pouring" || c === "hail",
    snow: /snow/.test(c),
    fog: c === "fog",
    clouds: /cloud|rain|pour|snow|lightning|fog|hail/.test(c),
    storm: /lightning/.test(c),
  };
}

/** the layer over the background; room: the room whose page is shown (null = home) */
export function weatherLayer(p, room) {
  const mode = p.config.bgWeather;
  if (!mode || (mode === "home" && room)) return nothing;
  const phase = sunPhase(p.hass), w = p.home.weather, k = wxKind(w && w.state);
  const lit = room ? room.lightsOn > 0 : p.home.lightsOn.length > 0;
  const calm = !!p.config.perfMode;
  return html`<div class="bgwx ${phase} ${lit ? "lit" : ""}" aria-hidden="true">
    <div class="tint"></div>
    ${calm ? nothing : html`
      ${k.clouds ? html`<div class="clouds"></div>` : nothing}
      ${k.fog ? html`<div class="fog"><i></i><i></i></div>` : nothing}
      ${k.rain ? html`<div class="rain ${k.heavy ? "heavy" : ""}"><i></i><i></i></div>` : nothing}
      ${k.snow ? html`<div class="snow"><i></i><i></i><i></i></div>` : nothing}
      ${k.storm ? html`<div class="flash"></div>` : nothing}`}
  </div>`;
}

// tiles as SVG: thin slanted streaks for rain, soft dots for snow
const rainTile = (n, op) => {
  let d = ""; for (let i = 0; i < n; i++) { const x = (i * 97) % 240, y = (i * 61) % 240, l = 14 + (i * 7) % 16; d += `<line x1='${x}' y1='${y}' x2='${x - 3}' y2='${y + l}'/>`; }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' stroke='white' stroke-opacity='${op}' stroke-width='1.2' stroke-linecap='round'>${d}</svg>`)}")`;
};
const snowTile = (n, r, seed) => {
  let d = ""; for (let i = 0; i < n; i++) { const x = (i * 83 + seed * 37) % 300, y = (i * 131 + seed * 53) % 300; d += `<circle cx='${x}' cy='${y}' r='${(r * (0.6 + ((i * 13) % 7) / 10)).toFixed(1)}'/>`; }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' fill='white' fill-opacity='.85'>${d}</svg>`)}")`;
};

export const weatherStyles = `
  .bgwx{position:absolute;inset:0;pointer-events:none;overflow:hidden}   /* no z-index: a stacking context would cut the tint off from the photo it blends with */
  .bgwx>div{position:absolute;inset:0}
  /* time of day: a tint in soft light over the photo and its wash */
  .bgwx .tint{transition:opacity 4s ease,background 4s ease;opacity:0}
  .bgwx.dawn .tint{opacity:1;background:linear-gradient(to bottom,rgba(255,140,175,.42),rgba(255,180,130,.30) 60%,rgba(255,205,160,.18));mix-blend-mode:soft-light}
  .bgwx.dusk .tint{opacity:1;background:linear-gradient(to bottom,rgba(30,55,150,.55),rgba(110,80,150,.30) 55%,rgba(255,130,50,.32));mix-blend-mode:soft-light}
  .bgwx.night .tint{opacity:1;background:linear-gradient(to bottom,rgb(40,62,140),rgb(70,90,160) 70%,rgb(90,105,170));mix-blend-mode:multiply}
  .bgwx.night.lit .tint{opacity:.7}
  .bgwx.dusk.lit .tint,.bgwx.dawn.lit .tint{opacity:.75}
  /* clouds: a grey veil with slow drifting shadows */
  .bgwx .clouds{background:radial-gradient(40% 30% at 20% 30%,rgba(30,35,45,.40),transparent 70%),radial-gradient(35% 25% at 70% 20%,rgba(30,35,45,.34),transparent 70%),radial-gradient(45% 35% at 55% 70%,rgba(30,35,45,.28),transparent 70%),rgba(120,128,140,.16);
    inset:0 -40% 0 -40%;animation:wxDrift 90s linear infinite alternate}
  /* fog: two wide bands of mist drifting at different speeds */
  .bgwx .fog i{position:absolute;inset:-10% -50%;background:radial-gradient(50% 40% at 30% 60%,rgba(235,238,242,.38),transparent 70%),radial-gradient(45% 35% at 75% 40%,rgba(235,238,242,.30),transparent 70%);filter:blur(18px);animation:wxDrift 70s ease-in-out infinite alternate}
  .bgwx .fog i+i{inset:10% -50% -10%;opacity:.8;animation-duration:110s;animation-direction:alternate-reverse}
  /* rain: two layers of streaks falling at different speeds (taller than the screen, moved by transform) */
  .bgwx .rain i{position:absolute;left:-10%;right:-10%;top:-240px;bottom:0;background-image:${rainTile(22, .34)};animation:wxFall .55s linear infinite}
  .bgwx .rain i+i{background-image:${rainTile(14, .22)};background-size:180px 180px;animation-duration:.8s;opacity:.8}
  .bgwx .rain.heavy i{background-image:${rainTile(40, .42)}}
  .bgwx .rain{background:rgba(60,70,90,.12)}
  /* snow: three layers of flakes, near ones big and quick, far ones small and slow, swaying */
  .bgwx .snow i{position:absolute;left:-10%;right:-10%;top:-300px;bottom:0;background-image:${snowTile(18, 2.6, 1)};animation:wxSnow 9s linear infinite}
  .bgwx .snow i:nth-child(2){background-image:${snowTile(26, 1.6, 2)};background-size:220px 220px;animation-duration:14s;opacity:.8}
  .bgwx .snow i:nth-child(3){background-image:${snowTile(36, 1, 3)};background-size:160px 160px;animation-duration:22s;opacity:.6}
  /* lightning: a rare double flash */
  .bgwx .flash{background:rgba(230,235,255,.0);animation:wxFlash 11s infinite}
  @keyframes wxDrift{from{transform:translateX(-6%)}to{transform:translateX(6%)}}
  @keyframes wxFall{from{transform:translate(0,0)}to{transform:translate(-30px,240px)}}
  @keyframes wxSnow{0%{transform:translate(0,0)}25%{transform:translate(14px,75px)}50%{transform:translate(-6px,150px)}75%{transform:translate(12px,225px)}100%{transform:translate(0,300px)}}
  @keyframes wxFlash{0%,91%,100%{background:rgba(230,235,255,0)}92%{background:rgba(230,235,255,.35)}93%{background:rgba(230,235,255,.05)}94.5%{background:rgba(230,235,255,.28)}96%{background:rgba(230,235,255,0)}}
  /* Animations off: weather stands still */
  :host(.still) .bgwx *{animation:none!important}
`;
