// Performance mode (config.perfMode): no live blur behind the cards of the row.
// A card's frosted glass is a backdrop-filter, re-blurred every frame while the row scrolls or the photo drifts —
// the heaviest work on a slow wall tablet. Here the room photo, with the same dark wash as .bg::after, is blurred
// once into a bitmap (canvas, half resolution) and painted behind each card with background-attachment: fixed, so
// it is anchored to the screen, exactly where the photo is: the browser places it in the same frame as the scroll
// (no JavaScript in the scroll path, so it never lags behind the cards). The photo's slow zoom (kb) is off in this mode, so the bitmap keeps matching it and the glass
// that stays live (pills, bars, popups) sits over a still picture the browser can cache.

// the cards' tint sits in a background-image layer here; registered as a colour it can still fade like the original
// background-color does (registerProperty is document-wide, so it also reaches the panel's shadow root)
try { CSS.registerProperty({ name: "--hcn-tint", syntax: "<color>", inherits: false, initialValue: "transparent" }); } catch {}

const S = .5;      // bitmap scale: half resolution is plenty for a 16px blur
const BLUR = 16;   // .card: backdrop-filter: blur(16px) saturate(1.2)

const loadImg = src => new Promise((ok, fail) => {
  const img = new Image();
  if (new URL(src, location.href).origin !== location.origin) img.crossOrigin = "anonymous";
  img.onload = () => ok(img); img.onerror = fail; img.src = src;
});

/** the wash of .bg::after (styles.js), drawn over the photo at (ox, oy, w, h) and extended over the whole canvas */
function wash(ctx, ox, oy, w, h, cw, ch) {
  const lin = ctx.createLinearGradient(0, oy, 0, oy + h);
  lin.addColorStop(0, "rgba(51,51,51,.62)"); lin.addColorStop(.5, "rgba(51,51,51,.55)"); lin.addColorStop(1, "rgba(51,51,51,.45)");
  ctx.fillStyle = lin; ctx.fillRect(0, 0, cw, ch);
  // radial-gradient(90% 70% at 18% 62%, rgba(20,20,22,.55), transparent): an ellipse, drawn as a scaled circle
  const rx = .9 * w, ry = .7 * h;
  ctx.save(); ctx.translate(ox + .18 * w, oy + .62 * h); ctx.scale(1, ry / rx);
  const rad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  rad.addColorStop(0, "rgba(20,20,22,.55)"); rad.addColorStop(1, "rgba(20,20,22,0)");
  ctx.fillStyle = rad; ctx.fillRect(-cw * 4, -ch * 4 * rx / ry, cw * 8, ch * 8 * rx / ry); ctx.restore();
}

/** blurred picture of a .bg element as a CSS image value; null when the browser cannot do it (keep live blur) */
export async function blurredBg(bg) {
  // iOS / iPadOS (Safari and the Home Assistant app) ignore fixed backgrounds: the bitmap would sit in the wrong place,
  // so the live blur stays there (the photo still stands still)
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return null;
  const cs = getComputedStyle(bg), w = bg.offsetWidth, h = bg.offsetHeight;
  const m = cs.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  if (!m) return cs.backgroundImage;   // a smooth gradient (no photo): blurring it changes nothing
  const img = await loadImg(m[1]);
  const W = Math.max(1, Math.round(w * S)), H = Math.max(1, Math.round(h * S)), r = BLUR * S, p = 2 * r;
  // source with a margin: the photo stretched under the margin, then exactly in place, so the blur has no dark rim
  const src = document.createElement("canvas"); src.width = W + 2 * p; src.height = H + 2 * p;
  const sx = src.getContext("2d"), k = Math.max(W / img.naturalWidth, H / img.naturalHeight);   // background-size: cover
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  sx.drawImage(img, 0, 0, src.width, src.height);
  sx.drawImage(img, p + (W - dw) / 2, p + (H - dh) / 2, dw, dh);   // background-position: center
  wash(sx, p, p, W, H, src.width, src.height);
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const ox = out.getContext("2d");
  ox.filter = `blur(${r}px) saturate(1.2)`;
  if (ox.filter !== `blur(${r}px) saturate(1.2)`) return null;   // no canvas filters (older Safari)
  ox.drawImage(src, -p, -p);
  const blob = await new Promise(ok => out.toBlob(ok, "image/jpeg", .85));
  return blob ? `url("${URL.createObjectURL(blob)}")` : null;
}

/** one of the row's edge strips (el) as a finished picture: the photo exactly as .bg paints it (cover, centred, with the
 *  .bg::after wash) with the strip's fade baked into its alpha (stops: [x in px, alpha] from the strip's left edge).
 *  The strips never move and carry no mask, so they are painted once and only composited while the row scrolls */
export async function edgeBg(bg, el, stops) {
  const r = bg.getBoundingClientRect(), e = el.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(1, Math.round(e.width * d)), H = Math.max(1, Math.round(e.height * d));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"); ctx.scale(d, d); ctx.translate(r.left - e.left, r.top - e.top);   // bg coordinates
  const m = getComputedStyle(bg).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  if (m) {
    const img = await loadImg(m[1]), k = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    ctx.drawImage(img, (r.width - dw) / 2, (r.height - dh) / 2, dw, dh);
    wash(ctx, 0, 0, r.width, r.height, r.width, r.height);
  } else {   // plain / gradient background: paint it with the browser itself is not possible here; keep the element's CSS
    return null;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createLinearGradient(0, 0, W, 0);
  for (const [x, a] of stops) g.addColorStop(Math.max(0, Math.min(1, x * d / W)), `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const blob = await new Promise(ok => cv.toBlob(ok, "image/png"));
  return blob ? URL.createObjectURL(blob) : null;
}
