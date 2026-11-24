// Real visuals for Music Assistant players: <hcn-eq>, a few thin bars in place of a media card's icon, and <hcn-viz>, an
// optional spectrum across the whole card (config.mediaViz). Music Assistant's "MilkDrop Visualizer" plugin taps the audio
// it decodes for a player and streams it to browsers over a WebSocket on its webserver (/milkdrop_visualizer): 1024 mono
// samples per frame, stamped with the moment they are heard on the server's clock, sent a few seconds ahead, plus beat
// marks and the cover's colours. HaCasa reaches it through the add-on's Home Assistant ingress (an ingress session, like
// HA's own Music Assistant panel, so no token and always over https), lines the frames up with the server clock and runs
// an FFT on the frame that is sounding now (once per frame, whatever shows it).
// One connection per player, shared by everything that shows it; none while nothing shows it, the page is hidden or
// motion is off. Needs an admin (ingress sessions are admin only) and the plugin turned on; otherwise nothing is drawn
// and the card keeps its icon (an element gets the attribute "live" once frames arrive).

const SLUG_RE = /(^|_)music_assistant$/;
const RATE = 44100, N = 1024;

/* ---------- ingress: one session for the page, kept alive like HA's ingress panel does ---------- */
let ingress = null;   // Promise<{ base, hass }>
async function ingressBase(hass) {
  if (!ingress) ingress = (async () => {
    const list = await hass.callWS({ type: "supervisor/api", endpoint: "/addons", method: "get" });
    const addon = (list.addons || []).find(a => SLUG_RE.test(a.slug) && a.state === "started");
    if (!addon) throw new Error("no Music Assistant add-on");
    const info = await hass.callWS({ type: "supervisor/api", endpoint: `/addons/${addon.slug}/info`, method: "get" });
    if (!info.ingress_url) throw new Error("no ingress");
    await newSession(hass);
    return info.ingress_url;
  })().catch(e => { ingress = null; throw e; });
  return ingress;
}
let session = null, keep = null;
async function newSession(hass) {
  const r = await hass.callWS({ type: "supervisor/api", endpoint: "/ingress/session", method: "post" });
  session = r.session;
  document.cookie = `ingress_session=${session};path=/api/hassio_ingress/;SameSite=Strict${location.protocol === "https:" ? ";Secure" : ""}`;
  clearInterval(keep);
  keep = setInterval(async () => {   // HA lets an ingress session lapse after a few minutes without this
    try { await hass.callWS({ type: "supervisor/api", endpoint: "/ingress/validate_session", method: "post", data: { session } }); }
    catch { try { await newSession(hass); } catch { /* next connect tries again */ } }
  }, 60000);
}

/* ---------- FFT: radix-2 with a Hann window, once per frame; bands are log-spaced and read in dB ---------- */
const HANN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
const REV = (() => { const r = new Uint16Array(N), bits = Math.log2(N); for (let i = 0; i < N; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; } return r; })();
const re = new Float32Array(N), im = new Float32Array(N);
/** the power per FFT bin of a frame (cached on it) */
function power(f) {
  if (f.pow) return f.pow;
  const u8 = f.u8;
  for (let i = 0; i < N; i++) { re[REV[i]] = ((u8[i] - 128) / 128) * HANN[i]; im[REV[i]] = 0; }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = -2 * Math.PI / size;
    for (let start = 0; start < N; start += size) for (let k = 0; k < half; k++) {
      const a = step * k, c = Math.cos(a), s = Math.sin(a), i = start + k, j = i + half;
      const tr = c * re[j] - s * im[j], ti = s * re[j] + c * im[j];
      re[j] = re[i] - tr; im[j] = im[i] - ti; re[i] += tr; im[i] += ti;
    }
  }
  const p = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) p[k] = (re[k] * re[k] + im[k] * im[k]) / (N / 4);
  return f.pow = p;
}
/** n log-spaced bands from fMin to fMax, as FFT bin edges */
const edges = (n, fMin, fMax) => Array.from({ length: n + 1 }, (_, i) => Math.max(1, Math.round(fMin * Math.pow(fMax / fMin, i / n) / (RATE / N))));
/** the level in dB of each band for a frame */
function bandsDb(f, e) {
  const p = power(f), out = new Array(e.length - 1);
  for (let b = 0; b < out.length; b++) { let sum = 0, n = 0; for (let k = e[b]; k < Math.max(e[b] + 1, e[b + 1]); k++) { sum += p[k]; n++; } out[b] = 10 * Math.log10(sum / n + 1e-12); }
  return out;
}
/** each band steers itself: its recent peak sinks slowly (~3 dB/s) and the level spans `range` dB below it, so the bass and
    the highs both move although they sit 20-30 dB apart, and a quiet song moves as much as a loud one; quick up, slow down */
class Gain {
  constructor(n, range, curve = 2, fall = 0.82) { this.n = n; this.range = range; this.curve = curve; this.fall = fall; this.peak = new Array(n).fill(null); this.level = new Array(n).fill(0); }
  feed(db) {
    for (let b = 0; b < this.n; b++) {
      this.peak[b] = Math.max(db[b], (this.peak[b] ?? db[b]) - 0.05);
      const lv = Math.min(1, Math.max(0, (db[b] - this.peak[b] + this.range) / this.range)) ** this.curve;
      this.level[b] = lv > this.level[b] ? lv : this.level[b] * this.fall + lv * (1 - this.fall);
    }
  }
  sink(k = 0.85) { for (let b = 0; b < this.n; b++) this.level[b] *= k; }
}

/* ---------- one connection per player ---------- */
class Feed {
  constructor(playerId) { this.playerId = playerId; this.views = new Set(); this.frames = []; this.beats = []; this.offset = null; this.rtt = Infinity; this.ws = null; this.retry = 0; this.timer = null; }
  add(v) { this.views.add(v); if (!this.ws && !this.timer) this.open(v.hass); }
  remove(v) { this.views.delete(v); if (!this.views.size) this.close(); }
  close() { clearTimeout(this.timer); this.timer = null; clearInterval(this.ping); if (this.ws) { try { this.ws.send('{"type":"client/goodbye"}'); } catch { } this.ws.onclose = null; this.ws.close(); } this.ws = null; this.frames = []; this.beats = []; }
  async open(hass) {
    let base; try { base = await ingressBase(hass); } catch { return this.later(hass); }
    if (!this.views.size) return;
    const ws = this.ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${base}milkdrop_visualizer?player=${encodeURIComponent(this.playerId)}`);
    ws.binaryType = "arraybuffer";
    const time = () => ws.readyState === 1 && ws.send(JSON.stringify({ type: "client/time", payload: { client_transmitted: Math.round(performance.now() * 1000) } }));
    ws.onopen = () => { this.retry = 0; this.rtt = Infinity; time(); this.ping = setInterval(time, 4000); };
    ws.onmessage = e => {
      if (typeof e.data === "string") {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === "server/time") {   // keep the offset of the quickest round trip: it is the most exact one
          const now = performance.now() * 1000, rtt = now - m.payload.client_transmitted;
          if (rtt <= this.rtt * 1.5) { this.rtt = Math.min(this.rtt, rtt); this.offset = m.payload.server_received - (m.payload.client_transmitted + now) / 2; }
        } else if (m.type === "stream/clear" || m.type === "stream/end") { this.frames = []; this.beats = []; this.trackGen = (this.trackGen || 0) + 1; }   // a new track or a seek
        else if (m.type === "color" && m.payload) this.color = { ...(this.color || {}), ...m.payload };   // the cover's palette
        return;
      }
      const v = new DataView(e.data), tag = v.getUint8(0), ts = Number(v.getBigInt64(1));
      if (tag === 22 && e.data.byteLength >= 9 + N) { this.frames.push({ ts, u8: new Uint8Array(e.data, 9, N) }); if (this.frames.length > 600) this.frames.splice(0, this.frames.length - 600); }
      else if (tag === 17) { this.beats.push(ts); if (this.beats.length > 64) this.beats.shift(); }
    };
    ws.onclose = () => { clearInterval(this.ping); this.ws = null; this.frames = []; if (this.views.size) this.later(hass, true); };
  }
  later(hass, dropped) {   // back off: 2 s, 4 s … 60 s; a dropped socket may mean the ingress session lapsed
    if (dropped) ingress = null;
    clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = null; if (this.views.size) this.open(hass); }, Math.min(60000, 2000 * 2 ** this.retry++));
  }
  /** the frame sounding now and the last beat heard, on the server's clock; every view of the player reads the same */
  now() {
    if (this.offset == null) return null;
    const t = performance.now() * 1000 + this.offset;
    while (this.frames.length > 1 && this.frames[1].ts <= t) this.frames.shift();
    let f = this.frames[0] && this.frames[0].ts <= t ? this.frames[0] : null;
    if (f && t - f.ts > 200000) f = null;   // nothing current: a gap or a pause
    while (this.beats.length && this.beats[0] <= t) this.lastBeat = this.beats.shift();
    return { f, t, beat: this.lastBeat || 0 };
  }
}
const feeds = new Map();
const feed = id => { if (!feeds.has(id)) feeds.set(id, new Feed(id)); return feeds.get(id); };

/* ---------- shared base: follows the player, connects while shown and visible, reports "live" ---------- */
class Live extends HTMLElement {
  connectedCallback() { this.setup?.(); this.vis = () => this.sync(); document.addEventListener("visibilitychange", this.vis); this.sync(); }
  disconnectedCallback() { document.removeEventListener("visibilitychange", this.vis); this.stop(); }
  set player(id) { if (id === this._player) return; this.stop(); this._player = id; this.sync(); }
  get player() { return this._player; }
  sync() {
    const want = this.isConnected && !!this._player && !!this.hass && document.visibilityState === "visible";
    if (want && !this.feed) { this.feed = feed(this._player); this.feed.add(this); this.quiet = 0; this.seenBeat = 0; this.loop(); }
    else if (!want) this.stop();
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.feed?.remove(this); this.feed = null; this.live(false); }
  live(on) { if (this._live === on) return; this._live = on; this.toggleAttribute("live", on); }
  loop() {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const r = this.feed?.now(); if (!r) return;
      if (r.f) { this.quiet = 0; this.live(true); } else if (++this.quiet > 90) this.live(false);
      const beat = r.beat > this.seenBeat && r.t - r.beat < 150000; if (r.beat > this.seenBeat) this.seenBeat = r.beat;
      this.frame(r.f, beat, r.t);
    };
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(tick);
  }
}

/* ---------- <hcn-eq>: thin lines in the icon's place, drawn like HaCasa's line icons ---------- */
const EQ_EDGES = edges(5, 50, 12000);
export class Equalizer extends Live {
  setup() { if (!this.bars) { this.bars = Array.from({ length: 5 }, () => { const i = document.createElement("i"); this.appendChild(i); return i; }); this.gain = new Gain(5, 15); } }
  frame(f, beat) {
    if (f) this.gain.feed(bandsDb(f, EQ_EDGES)); else if (this.quiet > 30) this.gain.sink();
    for (let b = 0; b < 5; b++) this.bars[b].style.transform = `scaleY(${(0.12 + this.gain.level[b] * 0.88).toFixed(3)})`;
    if (beat) { this.classList.remove("beat"); void this.offsetWidth; this.classList.add("beat"); }
  }
}
if (!customElements.get("hcn-eq")) customElements.define("hcn-eq", Equalizer);

/* ---------- <hcn-viz>: the whole card: a spectrum landscape in the cover's colours, the live waveform drawn
   through it as a thin line, and a glow that breathes with the bass and flares on the beat ---------- */
const VIZ_BANDS = 28, VIZ_EDGES = edges(VIZ_BANDS, 40, 16000);
const rgb = (c, a) => c ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgba(255,255,255,${a})`;
const lighten = c => c ? c.map(v => Math.round(v + (255 - v) * 0.45)) : null;
export class Visualizer extends Live {
  setup() {
    if (this.cv) return;
    this.cv = document.createElement("canvas"); this.appendChild(this.cv); this.ctx = this.cv.getContext("2d");
    this.gain = new Gain(VIZ_BANDS, 18, 1.6, 0.88); this.flash = 0; this.bass = 0;
    this.ro = new ResizeObserver(() => { const r = this.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); this.cv.width = Math.round(r.width * d); this.cv.height = Math.round(r.height * d); this.d = d; });
    this.ro.observe(this);
  }
  frame(f, beat) {
    const { cv, ctx } = this, W = cv.width, H = cv.height; if (!W || !H) return;
    if (f) this.gain.feed(bandsDb(f, VIZ_EDGES)); else if (this.quiet > 30) this.gain.sink(0.9);
    const lv = this.gain.level, col = this.feed?.color || {}, main = col.primary || col.vibrant || null, hi = lighten(col.accent && col.accent.some(v => v > 90) ? col.accent : main);
    this.bass = this.bass * 0.8 + ((lv[0] + lv[1] + lv[2] + lv[3]) / 4) * 0.2;
    if (beat) this.flash = 1; this.flash *= 0.9;
    ctx.clearRect(0, 0, W, H);
    // the glow: low and wide, swelling with the bass
    const g = ctx.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, W * (0.55 + this.bass * 0.25));
    g.addColorStop(0, rgb(main, 0.4 + this.bass * 0.3 + this.flash * 0.25)); g.addColorStop(1, rgb(main, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the landscape: the spectrum as one smooth curve
    const pts = [], n = VIZ_BANDS, base = H, top = H * 0.3;
    const sm = lv.map((v, i) => (lv[Math.max(0, i - 1)] + 2 * v + lv[Math.min(n - 1, i + 1)]) / 4);   // neighbours soften the peaks into hills
    for (let b = 0; b < n; b++) pts.push([W * b / (n - 1), base - (base - top) * sm[b] * (0.45 + 0.55 * (1 - b / n * 0.5))]);   // bass on the left, the highs to the right
    const path = () => { ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const x = (pts[i][0] + pts[i + 1][0]) / 2, y = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], x, y); } ctx.lineTo(W, pts[pts.length - 1][1]); };
    path(); ctx.lineTo(W, base); ctx.closePath();
    const fill = ctx.createLinearGradient(0, top, 0, base); fill.addColorStop(0, rgb(main, 0.55 + this.flash * 0.2)); fill.addColorStop(1, rgb(main, 0.08));
    ctx.fillStyle = fill; ctx.fill();
    path(); ctx.lineWidth = 1.6 * this.d; ctx.strokeStyle = rgb(hi, 0.95); ctx.stroke();
    // the waveform of the frame sounding now: a thin line through the middle
    if (f) {
      const u = f.u8, mid = H * 0.55, amp = H * 0.2, step = 8;
      ctx.beginPath(); for (let i = 0; i < N; i += step) { const x = W * i / (N - step), y = mid + ((u[i] - 128) / 128) * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.lineWidth = 1.2 * this.d; ctx.strokeStyle = rgb(hi, 0.35); ctx.stroke();
    }
  }
  disconnectedCallback() { super.disconnectedCallback(); }
}
if (!customElements.get("hcn-viz")) customElements.define("hcn-viz", Visualizer);

/* ---------- <hcn-milk>: a small MilkDrop of its own (five styles: tunnel, vortex, nebula, star flight, kaleidoscope). MilkDrop's look comes from feedback: every image is the last one,
   slightly zoomed, turned or shifted and a little faded, with the sound drawn on top, so the sound leaves trails, tunnels
   and swirls. Done here on a plain 2D canvas at 240 × 150 px (scaled up softly by the browser), at most 30 frames a
   second, no WebGL, no library: light enough for an old wall tablet. The styles (parameter sets) take turns every few
   minutes and on a new track, sliding from one to the next; the bass drives zoom and turn, beats kick, the cover gives
   the colours. ---------- */
const MW = 240, MH = 150, STYLES = {
  tunnel: { zoom: 1.045, bassZoom: 0.05, rot: 0.004, drift: 0, fade: 0.9, wave: "ring" },
  vortex: { zoom: 1.012, bassZoom: 0.02, rot: 0.022, drift: 0, fade: 0.93, wave: "rays" },
  nebula: { zoom: 0.996, bassZoom: 0.01, rot: -0.003, drift: 1.2, fade: 0.95, wave: "line" },
  pulse:  { zoom: 1.0, bassZoom: 0.03, rot: 0.001, drift: 0, fade: 0.86, wave: "stars", kick: 0.12 },
  kaleido: { zoom: 1.006, bassZoom: 0.012, rot: 0.012, drift: 0, fade: 0.9, wave: "kaleido" },   // star flight: needs no beats to look its own
};
const STYLE_KEYS = Object.keys(STYLES), NUM = ["zoom", "bassZoom", "rot", "drift", "fade", "kick"];
export class Milk extends Live {
  setup() {
    if (this.cv) return;
    this.cv = document.createElement("canvas"); this.cv.width = MW; this.cv.height = MH; this.appendChild(this.cv);
    this.ctx = this.cv.getContext("2d"); this.tmp = document.createElement("canvas"); this.tmp.width = MW; this.tmp.height = MH; this.tctx = this.tmp.getContext("2d");
    this.gain = new Gain(VIZ_BANDS, 18, 1.4, 0.85); this.bass = 0; this.kickV = 0; this.dir = 1; this.last = 0; this.phase = 0;
    this.pick(STYLE_KEYS[Math.floor(Math.random() * STYLE_KEYS.length)], true);
  }
  /** move to a style; the numbers slide there over ~2 s, the waveform shape switches at once (the trails hide the cut) */
  pick(key, now) {
    this.style = key; this.until = performance.now() + (150 + Math.random() * 120) * 1000;
    const t = STYLES[key]; this.target = { kick: 0, ...t };
    if (now || !this.p) this.p = { ...this.target }; this.wave = t.wave;
  }
  frame(f, beat, t) {
    const now = performance.now(); if (now - this.last < 32) return; this.last = now;   // ~30 fps
    if (now > this.until) this.pick(STYLE_KEYS.filter(k => k !== this.style)[Math.floor(Math.random() * (STYLE_KEYS.length - 1))]);
    const trk = this.feed?.trackGen; if (trk != null && trk !== this.trk) { if (this.trk != null) this.pick(STYLE_KEYS.filter(k => k !== this.style)[Math.floor(Math.random() * (STYLE_KEYS.length - 1))]); this.trk = trk; }
    for (const k of NUM) this.p[k] += ((this.target[k] ?? 0) - (this.p[k] ?? 0)) * 0.03;
    if (f) this.gain.feed(bandsDb(f, VIZ_EDGES)); else if (this.quiet > 30) this.gain.sink(0.9);
    const lv = this.gain.level, P = this.p;
    this.bass = this.bass * 0.7 + ((lv[0] + lv[1] + lv[2] + lv[3]) / 4) * 0.3;
    if (beat) { this.kickV = 1; if (Math.random() < 0.25) this.dir *= -1; }
    this.kickV *= 0.85; this.phase += 0.01;
    const col = this.feed?.color || {}, c1 = col.primary || col.vibrant || [180, 200, 255], c2 = lighten(col.accent && col.accent.some(v => v > 90) ? col.accent : c1) || [255, 255, 255];
    const { ctx, tctx } = this;
    // feedback: the last image, zoomed / turned / drifted and faded
    tctx.clearRect(0, 0, MW, MH); tctx.drawImage(this.cv, 0, 0);
    ctx.clearRect(0, 0, MW, MH);
    const z = P.zoom + P.bassZoom * this.bass + (P.kick || 0) * this.kickV, r = P.rot * this.dir * (1 + this.bass);
    ctx.save(); ctx.globalAlpha = P.fade;
    ctx.translate(MW / 2 + Math.sin(this.phase * 1.3) * P.drift, MH / 2 + Math.cos(this.phase) * P.drift); ctx.rotate(r); ctx.scale(z, z); ctx.translate(-MW / 2, -MH / 2);
    ctx.drawImage(this.tmp, 0, 0); ctx.restore();
    // the sound on top
    ctx.globalCompositeOperation = "lighter"; ctx.lineWidth = 1.3; ctx.lineJoin = "round";
    ctx.strokeStyle = rgb(this.kickV > 0.5 ? c2 : c1, 0.55 + this.kickV * 0.35);
    const u = f?.u8, cx = MW / 2, cy = MH / 2;
    if (u) {
      ctx.beginPath();
      if (this.wave === "ring") {
        const R = MH * (0.16 + this.bass * 0.12);
        for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2, s = (u[(i % 128) * 8] - 128) / 128, rr = R * (1 + s * 0.45); i ? ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        ctx.closePath();
      } else if (this.wave === "rays") {
        const n = VIZ_BANDS * 2, R0 = MH * 0.08;
        for (let i = 0; i < n; i++) { const b = i < VIZ_BANDS ? i : n - 1 - i, a = i / n * Math.PI * 2 + this.phase, L = R0 + MH * 0.42 * lv[b]; ctx.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); }
      } else if (this.wave === "kaleido") {
        // kaleidoscope: one stretch of the waveform, bent into an arc, drawn eight times around the centre (four turns,
        // each with its mirror image); the turn and the feedback grow it into a symmetric, slowly turning pattern
        const R0 = MH * 0.06, R1 = MH * (0.38 + this.bass * 0.12), seg = 48;
        for (let m = 0; m < 8; m++) {
          const base = (m >> 1) * Math.PI / 2 + this.phase * 0.6, flip = m & 1 ? -1 : 1;
          for (let i = 0; i < seg; i++) {
            const k = i / (seg - 1), s0 = (u[i * 16] - 128) / 128, rr = R0 + (R1 - R0) * k, a = base + flip * (k * 0.6 + s0 * 0.35);
            const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
        }
      } else if (this.wave === "stars") {
        // star flight: sparks leave the centre from the bands that are loud, faster with the bass; each draws the stretch it
        // covered this frame, which the feedback turns into warp streaks
        const st = this.stars || (this.stars = []);
        for (let b = 0; b < VIZ_BANDS && st.length < 140; b++) if (lv[b] > 0.35 && Math.random() < lv[b] * 0.5) st.push({ a: Math.random() * Math.PI * 2, r: 2 + Math.random() * 6, v: 0.03 + b / VIZ_BANDS * 0.04 });
        const sp = 1 + this.bass * 1.8 + this.kickV;
        for (let i = st.length - 1; i >= 0; i--) {
          const q = st[i], r0 = q.r; q.r *= 1 + q.v * sp; q.r += 0.4 * sp;
          if (q.r > MW * 0.75) { st.splice(i, 1); continue; }
          const ca = Math.cos(q.a), sa = Math.sin(q.a); ctx.moveTo(cx + ca * r0, cy + sa * r0); ctx.lineTo(cx + ca * q.r, cy + sa * q.r);
        }
      } else {
        const amp = MH * (0.18 + this.bass * 0.15);
        for (let i = 0; i < 128; i++) { const x = MW * i / 127, y = cy + ((u[i * 8] - 128) / 128) * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}
if (!customElements.get("hcn-milk")) customElements.define("hcn-milk", Milk);

export const eqStyles = `
  hcn-eq{display:none;align-items:flex-end;justify-content:space-between;width:26px;height:28px;margin:4px 0 0 4px}
  hcn-eq[live]{display:flex}
  hcn-eq i{width:2.5px;height:100%;border-radius:2px;background:currentColor;transform-origin:bottom;transform:scaleY(.12);will-change:transform}
  hcn-eq.beat i{animation:eqBeat .18s ease-out}
  @keyframes eqBeat{from{opacity:.55}to{opacity:1}}
  .card .i:has(hcn-eq[live])>:not(hcn-eq){display:none}
  hcn-viz{position:absolute;inset:0;z-index:-1;border-radius:inherit;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .8s ease}
  hcn-viz[live]{opacity:1}
  hcn-viz canvas{width:100%;height:100%;display:block}
  hcn-milk{position:absolute;inset:0;z-index:-1;border-radius:inherit;overflow:hidden;pointer-events:none;opacity:0;transition:opacity 1.2s ease}
  hcn-milk[live]{opacity:.9}
  hcn-milk canvas{width:100%;height:100%;display:block;filter:saturate(1.2)}
`;
