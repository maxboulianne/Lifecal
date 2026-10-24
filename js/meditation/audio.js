// Sons des séances, générés en direct avec Web Audio : aucun fichier à
// télécharger, fonctionne hors ligne.
//   bell()              bol tibétain (plusieurs harmoniques qui s'éteignent lentement)
//   startAmbience(id)   pluie, océan ou forêt (bruit filtré et modulé)
//   stopAmbience()
//
// Sur iPad et iPhone :
//  - Web Audio suit le mode silencieux de l'appareil, contrairement à la voix.
//    On déclare donc la séance comme une « lecture » (audioSession), ou, sur
//    les anciennes versions, on joue un son muet en boucle qui a le même effet.
//  - La voix de synthèse peut interrompre le contexte audio : on le relance.

const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;

export class MeditationAudio {
  #ctx = null;
  #ambience = null;
  #master = null;
  #active = false; // une séance est en cours : le son doit continuer
  #keepAlive = null;

  get supported() {
    return Boolean(AudioCtx);
  }

  // À appeler lors d'un toucher de l'utilisateur (exigence d'iOS).
  unlock() {
    if (!AudioCtx) return;
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    else this.#startKeepAlive();
    if (!this.#ctx) {
      this.#ctx = new AudioCtx();
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = 0.9;
      this.#master.connect(this.#ctx.destination);
      this.#ctx.addEventListener?.("statechange", () => {
        if (this.#active && this.#ctx.state !== "running" && this.#ctx.state !== "closed") this.#resume();
      });
    }
    this.#resume();
  }

  #resume() {
    if (this.#ctx.state !== "running") this.#ctx.resume().catch(() => {});
  }

  // Ancien iOS : un son muet en boucle fait passer l'appareil en mode lecture.
  #startKeepAlive() {
    if (typeof Audio === "undefined") return;
    this.#keepAlive ??= Object.assign(new Audio(silentWav()), { loop: true });
    this.#keepAlive.play().catch(() => {});
  }

  bell() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 196; // sol grave, chaleureux
    // Harmoniques d'un bol chantant (rapports non entiers) et leur durée.
    const partials = [
      [1, 0.5, 7],
      [2.71, 0.22, 5],
      [5.15, 0.1, 3.5],
      [8.43, 0.04, 2],
    ];
    for (const [ratio, gain, decay] of partials) {
      for (const detune of [-1.2, 1.2]) {
        // deux oscillateurs légèrement désaccordés = battement naturel du bol
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = base * ratio + detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain / 2, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(g).connect(this.#master);
        osc.start(t);
        osc.stop(t + decay + 0.1);
      }
    }
  }

  startAmbience(id) {
    this.stopAmbience();
    this.#active = true;
    const ctx = this.#ctx;
    if (!ctx || !id || id === "none") return;
    const make = { rain, ocean, forest }[id];
    if (!make) return;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3); // fondu d'entrée
    out.connect(this.#master);
    const nodes = make(ctx, out);
    this.#ambience = { out, nodes };
  }

  stopAmbience() {
    const amb = this.#ambience;
    if (!amb || !this.#ctx) return;
    this.#ambience = null;
    const t = this.#ctx.currentTime;
    amb.out.gain.cancelScheduledValues(t);
    amb.out.gain.setValueAtTime(amb.out.gain.value || 0.5, t);
    amb.out.gain.exponentialRampToValueAtTime(0.0001, t + 2); // fondu de sortie
    setTimeout(() => {
      amb.nodes.forEach((n) => n.stop?.());
      amb.out.disconnect();
    }, 2200);
  }

  // Fin de séance : l'ambiance s'éteint, et l'appareil peut revenir au silence.
  close() {
    this.stopAmbience();
    this.#active = false;
    this.#keepAlive?.pause();
  }
}

// Un quart de seconde de silence au format WAV.
function silentWav() {
  const rate = 8000;
  const samples = rate / 4;
  const view = new DataView(new ArrayBuffer(44 + samples));
  const text = (offset, str) => [...str].forEach((c, k) => view.setUint8(offset + k, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8 bits
  text(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128); // silence en 8 bits
  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
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
  return [src];
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
  const wave = lfo(ctx, 0.09, 0.4, g.gain); // une vague toutes les ~11 s
  const tone = lfo(ctx, 0.09, 500, lp.frequency);
  return [src, wave, tone];
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
  const wind = lfo(ctx, 0.05, 0.3, g.gain);

  let stopped = false;
  const chirp = () => {
    if (stopped) return;
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const f = 2600 + Math.random() * 1400;
    for (let k = 0; k < notes; k++) {
      const osc = ctx.createOscillator();
      const cg = ctx.createGain();
      const start = t + k * 0.13;
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), start + 0.08);
      cg.gain.setValueAtTime(0.0001, start);
      cg.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      cg.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(cg).connect(out);
      osc.start(start);
      osc.stop(start + 0.12);
    }
    timer = setTimeout(chirp, 3000 + Math.random() * 7000);
  };
  let timer = setTimeout(chirp, 2000);
  const birds = { stop: () => { stopped = true; clearTimeout(timer); } };
  return [src, wind, birds];
}
