// <hcn-eq>: a real equalizer for Music Assistant players. Music Assistant's "MilkDrop Visualizer" plugin taps the audio it
// decodes for a player and streams it to browsers over a WebSocket on its webserver (/milkdrop_visualizer): 1024 mono
// samples per frame, stamped with the moment they are heard on the server's clock, sent a few seconds ahead, plus beat
// marks. HaCasa reaches it through the add-on's Home Assistant ingress (an ingress session, like HA's own Music Assistant
// panel, so no token and always over https), lines the frames up with the server clock, runs an FFT on the frame that is
// sounding now and draws a few bars from it.
// One connection per player, shared by every bar set that shows it; none while nothing shows it, the page is hidden or
// motion is off. Needs an admin (ingress sessions are admin only) and the plugin turned on; otherwise the element stays
// empty and the card keeps its icon (the element reports "live" once frames arrive).

const SLUG_RE = /(^|_)music_assistant$/;
const BARS = 5, F_MIN = 50, F_MAX = 12000, RATE = 44100, N = 1024, RANGE = 15;

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

/* ---------- FFT: radix-2, in place, with a Hann window; the bars are log-spaced bands in dB ---------- */
const HANN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
const REV = (() => { const r = new Uint16Array(N), bits = Math.log2(N); for (let i = 0; i < N; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; } return r; })();
const re = new Float32Array(N), im = new Float32Array(N);
const EDGES = Array.from({ length: BARS + 1 }, (_, i) => Math.max(1, Math.round(F_MIN * Math.pow(F_MAX / F_MIN, i / BARS) / (RATE / N))));
/** the level in dB of each bar's band for one frame of uint8 samples (0x80 = silence) */
function bands(u8) {
  for (let i = 0; i < N; i++) { re[REV[i]] = ((u8[i] - 128) / 128) * HANN[i]; im[REV[i]] = 0; }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = -2 * Math.PI / size;
    for (let start = 0; start < N; start += size) for (let k = 0; k < half; k++) {
      const a = step * k, c = Math.cos(a), s = Math.sin(a), i = start + k, j = i + half;
      const tr = c * re[j] - s * im[j], ti = s * re[j] + c * im[j];
      re[j] = re[i] - tr; im[j] = im[i] - ti; re[i] += tr; im[i] += ti;
    }
  }
  const out = new Array(BARS);
  for (let b = 0; b < BARS; b++) {
    let sum = 0, n = 0;
    for (let k = EDGES[b]; k < Math.max(EDGES[b] + 1, EDGES[b + 1]); k++) { sum += re[k] * re[k] + im[k] * im[k]; n++; }
    out[b] = 10 * Math.log10(sum / n / (N / 4) + 1e-12);
  }
  return out;
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
        } else if (m.type === "stream/clear" || m.type === "stream/end") { this.frames = []; this.beats = []; }
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
  /** the frame sounding now and whether a beat just fell, on the server's clock */
  now() {
    if (this.offset == null) return null;
    const t = performance.now() * 1000 + this.offset;
    let f = null; while (this.frames.length && this.frames[0].ts <= t) f = this.frames.shift();
    if (f && t - f.ts > 200000) f = null;   // nothing current: a gap or a pause
    let beat = false; while (this.beats.length && this.beats[0] <= t) { beat = t - this.beats.shift() < 120000 || beat; }
    return { f, beat };
  }
}
const feeds = new Map();
const feed = id => { if (!feeds.has(id)) feeds.set(id, new Feed(id)); return feeds.get(id); };

/* ---------- the bars ---------- */
export class Equalizer extends HTMLElement {
  connectedCallback() {
    if (!this.bars) { this.bars = Array.from({ length: BARS }, () => { const i = document.createElement("i"); this.appendChild(i); return i; }); this.level = new Array(BARS).fill(0); this.peak = new Array(BARS).fill(null); }
    this.vis = () => this.sync(); document.addEventListener("visibilitychange", this.vis); this.sync();
  }
  disconnectedCallback() { document.removeEventListener("visibilitychange", this.vis); this.stop(); }
  set player(id) { if (id === this._player) return; this.stop(); this._player = id; this.sync(); }
  get player() { return this._player; }
  sync() {
    const want = this.isConnected && !!this._player && !!this.hass && document.visibilityState === "visible";
    if (want && !this.feed) { this.feed = feed(this._player); this.feed.add(this); this.loop(); }
    else if (!want) this.stop();
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.feed?.remove(this); this.feed = null; this.live(false); }
  live(on) { if (this._live === on) return; this._live = on; this.toggleAttribute("live", on); this.dispatchEvent(new CustomEvent("live", { detail: on, bubbles: true, composed: true })); }
  loop() {
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const r = this.feed?.now(); if (!r) return;
      if (r.f) {
        this.quiet = 0; this.live(true);
        // each band steers itself: its recent peak sinks slowly (~3 dB/s), the bar spans the RANGE dB below it, so the bass
        // and the highs both move although they sit 20 dB apart, and a quiet song moves as much as a loud one
        const db = bands(r.f.u8);
        for (let b = 0; b < BARS; b++) {
          this.peak[b] = Math.max(db[b], (this.peak[b] ?? db[b]) - 0.05);
          const lv = Math.min(1, Math.max(0, (db[b] - this.peak[b] + RANGE) / RANGE)) ** 2;
          this.level[b] = lv > this.level[b] ? lv : this.level[b] * 0.82 + lv * 0.18;
        }
      }
      else if (++this.quiet > 30) { for (let b = 0; b < BARS; b++) this.level[b] *= 0.85; if (this.quiet > 90) this.live(false); }
      for (let b = 0; b < BARS; b++) this.bars[b].style.transform = `scaleY(${(0.08 + this.level[b] * 0.92).toFixed(3)})`;
      if (r.beat) { this.classList.remove("beat"); void this.offsetWidth; this.classList.add("beat"); }
    };
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(tick);
  }
}
if (!customElements.get("hcn-eq")) customElements.define("hcn-eq", Equalizer);

export const eqStyles = `
  hcn-eq{display:none;align-items:flex-end;gap:3px;width:36px;height:30px}
  hcn-eq[live]{display:flex}
  hcn-eq i{flex:1;height:100%;border-radius:2px;background:currentColor;transform-origin:bottom;transform:scaleY(.08);will-change:transform}
  hcn-eq.beat i{animation:eqBeat .18s ease-out}
  @keyframes eqBeat{from{filter:brightness(1.6)}to{filter:none}}
  .card .i:has(hcn-eq[live])>:not(hcn-eq){display:none}
`;
