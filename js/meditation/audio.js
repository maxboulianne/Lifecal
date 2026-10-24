// Sons des séances, fabriqués dans le navigateur : aucun fichier à
// télécharger, fonctionne hors ligne.
//   bell()              bol tibétain (plusieurs harmoniques qui s'éteignent lentement)
//   startAmbience(id)   pluie, océan ou forêt (bruit filtré et modulé)
//   stopAmbience()
//
// Les sons sont calculés d'avance (OfflineAudioContext), transformés en
// fichiers WAV, puis joués par des lecteurs <audio> ordinaires. Sur iPad et
// iPhone, la voix de synthèse coupe ou interrompt le son Web Audio en direct,
// qui ne repart plus ; un lecteur <audio> peut, lui, être relancé.
//  - Les lecteurs sont « débloqués » pendant un toucher (exigence d'iOS) en
//    jouant un court silence ; ils peuvent ensuite jouer à tout moment.
//  - Le lecteur d'ambiance joue un silence en boucle quand il n'y a pas
//    d'ambiance : l'appareil reste en mode « lecture » (le mode silencieux ne
//    coupe pas le bol).
//  - Si la voix met l'ambiance en pause, elle est relancée.

const Offline = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
const RATE = 44100;
const LOOP_SECONDS = 20; // la boucle se répète sans raccord audible (voir renderAmbience)
const WARMUP_SECONDS = 4;
const BELL_SECONDS = 8;
const RESUME_DELAY_MS = 400;

export class MeditationAudio {
  #ambienceEl = null;
  #bellEl = null;
  #active = false; // une séance est en cours : l'ambiance doit continuer
  #ambienceUrl = null;
  #token = 0;
  #cache = new Map(); // id -> Promise<url>
  #bellUrl = null; // Promise<url>
  #bellUrlReady = null;
  #silentUrl = null;

  get supported() {
    return Boolean(Offline) && typeof Audio !== "undefined";
  }

  // À appeler lors d'un toucher de l'utilisateur (exigence d'iOS).
  unlock() {
    if (!this.supported) return;
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    this.#silentUrl ??= wavUrl(new Float32Array(RATE / 4), RATE);
    if (!this.#ambienceEl) {
      this.#ambienceEl = new Audio();
      this.#ambienceEl.loop = true;
      // Interrompue par la voix ou par le système : on la relance.
      this.#ambienceEl.addEventListener("pause", () => {
        if (this.#active) setTimeout(() => this.#active && this.#play(this.#ambienceEl), RESUME_DELAY_MS);
      });
      this.#bellEl = new Audio();
      // Le bol coupé par la voix finit de résonner.
      this.#bellEl.addEventListener("pause", () => {
        const el = this.#bellEl;
        if (this.#active && !el.ended && el.src === this.#bellUrlReady) setTimeout(() => this.#active && this.#play(el), RESUME_DELAY_MS);
      });
    }
    if (this.#ambienceEl.paused) {
      if (!this.#ambienceEl.src) this.#ambienceEl.src = this.#silentUrl;
      this.#play(this.#ambienceEl);
    }
    if (!this.#bellEl.src) {
      this.#bellEl.src = this.#silentUrl;
      this.#play(this.#bellEl);
    }
    this.#bellUrl ??= render(BELL_SECONDS, bellSound).then((buffer) => wavUrl(buffer, RATE)).catch(() => null);
  }

  async bell() {
    const el = this.#bellEl;
    const url = await this.#bellUrl;
    if (!el || !url) return;
    this.#bellUrlReady = url;
    if (el.src !== url) el.src = url;
    el.currentTime = 0;
    this.#play(el);
  }

  startAmbience(id) {
    this.#active = true;
    const el = this.#ambienceEl;
    if (!el) return;
    const token = ++this.#token;
    const make = AMBIENCES[id];
    if (!make) return this.#setAmbience(this.#silentUrl);
    if (!this.#cache.has(id)) this.#cache.set(id, renderAmbience(make).then((b) => wavUrl(b, RATE)));
    this.#cache.get(id)
      .then((url) => token === this.#token && this.#active && this.#setAmbience(url))
      .catch((err) => console.error(err));
  }

  stopAmbience() {
    this.#token++;
    if (this.#ambienceEl && this.#ambienceUrl !== this.#silentUrl) this.#setAmbience(this.#silentUrl);
  }

  // Fin de séance : tout s'arrête, et l'appareil peut revenir au silence.
  close() {
    this.#token++;
    this.#active = false;
    this.#ambienceEl?.pause();
    this.#bellEl?.pause();
  }

  #setAmbience(url) {
    const el = this.#ambienceEl;
    this.#ambienceUrl = url;
    if (el.src !== url) el.src = url;
    el.loop = true;
    this.#play(el);
  }

  #play(el) {
    el.play()?.catch?.(() => {});
  }
}

// ---- Fabrication des sons ----------------------------------------------------

async function render(seconds, build) {
  const ctx = new Offline(1, Math.round(seconds * RATE), RATE);
  build(ctx, ctx.destination);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

// Tous les éléments d'une ambiance se répètent toutes les LOOP_SECONDS
// (bruit de 4 s, vagues de 10 s, vent de 20 s, oiseaux placés sur la boucle) :
// après une mise en route, un extrait de LOOP_SECONDS s'enchaîne sans coupure.
async function renderAmbience(make) {
  const data = await render(WARMUP_SECONDS + LOOP_SECONDS, (ctx, out) => {
    const g = ctx.createGain();
    g.gain.value = 0.9;
    g.connect(out);
    make(ctx, g);
  });
  return data.slice(WARMUP_SECONDS * RATE);
}

// Mono 16 bits -> adresse d'un fichier WAV en mémoire.
export function encodeWav(samples, rate) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset, str) => [...str].forEach((c, k) => view.setUint8(offset + k, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view.buffer;
}

const wavUrl = (samples, rate) => URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: "audio/wav" }));

// Bol chantant : harmoniques aux rapports non entiers, chacune doublée et
// légèrement désaccordée (le battement naturel du bol).
function bellSound(ctx, out) {
  const base = 196; // sol grave, chaleureux
  const partials = [
    [1, 0.5, 7],
    [2.71, 0.22, 5],
    [5.15, 0.1, 3.5],
    [8.43, 0.04, 2],
  ];
  for (const [ratio, gain, decay] of partials) {
    for (const detune of [-1.2, 1.2]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = base * ratio + detune;
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(gain / 2, 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, decay);
      osc.connect(g).connect(out);
      osc.start(0);
      osc.stop(decay + 0.1);
    }
  }
}

// ---- Ambiances ---------------------------------------------------------------

function noiseSource(ctx, color = "pink") {
  const length = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (color === "brown") {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      // bruit rose (approximation de Paul Kellet)
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    }
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function lfo(ctx, frequency, depth, target) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = frequency;
  g.gain.value = depth;
  osc.connect(g).connect(target);
  osc.start();
  return osc;
}

// Pluie douce : bruit rose filtré, légèrement aigu.
function rain(ctx, out) {
  const src = noiseSource(ctx, "pink");
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 400;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.value = 0.8;
  src.connect(hp).connect(lp).connect(g).connect(out);
  src.start();
}

// Océan : bruit grave dont le volume monte et descend comme des vagues.
function ocean(ctx, out) {
  const src = noiseSource(ctx, "brown");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.value = 0.6;
  src.connect(lp).connect(g).connect(out);
  src.start();
  lfo(ctx, 0.1, 0.4, g.gain); // une vague toutes les 10 s
  lfo(ctx, 0.1, 500, lp.frequency);
}

// Forêt : léger vent et petits gazouillis espacés.
function forest(ctx, out) {
  const src = noiseSource(ctx, "pink");
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 700;
  bp.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.value = 0.8;
  src.connect(bp).connect(g).connect(out);
  src.start();
  lfo(ctx, 0.05, 0.3, g.gain); // une rafale toutes les 20 s

  // Gazouillis placés une fois sur la boucle, puis répétés à l'identique.
  const calls = [];
  for (let t = 1 + Math.random() * 2; t < LOOP_SECONDS - 1; t += 3 + Math.random() * 6) {
    calls.push({ t, notes: 2 + Math.floor(Math.random() * 3), f: 2600 + Math.random() * 1400, rise: 1.25 + Math.random() * 0.3 });
  }
  const end = WARMUP_SECONDS + LOOP_SECONDS;
  for (let offset = 0; offset < end; offset += LOOP_SECONDS) {
    for (const c of calls) {
      for (let k = 0; k < c.notes; k++) {
        const start = offset + c.t + k * 0.13;
        if (start + 0.12 > end) continue;
        const osc = ctx.createOscillator();
        const cg = ctx.createGain();
        osc.frequency.setValueAtTime(c.f, start);
        osc.frequency.exponentialRampToValueAtTime(c.f * c.rise, start + 0.08);
        cg.gain.setValueAtTime(0.0001, start);
        cg.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        cg.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
        osc.connect(cg).connect(out);
        osc.start(start);
        osc.stop(start + 0.12);
      }
    }
  }
}

const AMBIENCES = { rain, ocean, forest };
