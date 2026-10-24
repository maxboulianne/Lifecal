// Déroulement d'une séance : lit le script dans l'ordre, en respectant la
// durée choisie. Les silences « élastiques » s'allongent ou se raccourcissent
// pour que la séance finisse à l'heure, quelle que soit la vitesse de la voix.
//
// Dépendances injectées (pour les tests) :
//   voice  { speak(text) -> Promise<boolean>, cancel() }   (false = interrompu)
//   audio  { bell() }
//   now()  temps en secondes ; sleep(ms) -> Promise

import { BREATH_PATTERNS, cycleSeconds } from "./catalog.js";
import { BELL, BREATHE, SILENCE, tokenType } from "./tokens.js";

const MIN_SILENCE = 4; // secondes
const TICK_MS = 200;
const FINAL_RING = 5; // laisser résonner le dernier bol
const DEFAULT_CHARS_PER_SECOND = 14;

export class SessionRunner {
  state = "idle"; // idle | running | paused | stopped | done
  #pausedAt = 0;
  #pausedTotal = 0;
  #startedAt = null;
  #offset = 0; // décalage dû aux déplacements dans la barre d'avancement
  #pendingSeek = null;
  #replay = null; // phrase à redire après un saut dans un silence
  #resumeWaiters = [];
  #spoken = { chars: 0, seconds: 0 };

  constructor({ script, targetSeconds, voice, audio, onEvent = () => {}, now, sleep }) {
    this.script = script;
    this.targetSeconds = targetSeconds;
    this.voice = voice;
    this.audio = audio;
    this.onEvent = onEvent;
    this.now = now ?? (() => performance.now() / 1000);
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // Temps réellement écouté, pauses exclues (les sauts n'y changent rien).
  get listened() {
    if (this.#startedAt === null) return 0;
    const end = this.state === "paused" ? this.#pausedAt : this.now();
    return end - this.#startedAt - this.#pausedTotal;
  }

  // Position dans la séance (ce qu'affiche la barre d'avancement).
  get elapsed() {
    return this.listened + this.#offset;
  }

  get charsPerSecond() {
    return this.#spoken.seconds > 5 ? this.#spoken.chars / this.#spoken.seconds : DEFAULT_CHARS_PER_SECOND;
  }

  async run() {
    this.#startedAt = this.now();
    this.#setState("running");
    let i = 0;
    let into = 0; // secondes déjà passées dans l'élément (après un saut)
    for (;;) {
      if (this.state === "stopped") return;
      if (this.#replay !== null) {
        const text = this.#replay;
        this.#replay = null;
        await this.#say(text); // puis l'élément `i` reprend là où on l'a mis
      } else if (i >= this.script.length) {
        await this.#wait(FINAL_RING - into);
        if (!this.#pendingSeek) break;
      } else {
        await this.#play(i, into);
        into = 0;
        if (!this.#pendingSeek) i++;
      }
      if (this.#pendingSeek) ({ i, into } = this.#takeSeek());
    }
    if (this.state === "stopped") return;
    this.#setState("done");
  }

  pause() {
    if (this.state !== "running") return;
    this.#pausedAt = this.now();
    this.#setState("paused");
    this.voice.cancel();
  }

  resume() {
    if (this.state !== "paused") return;
    this.#pausedTotal += this.now() - this.#pausedAt;
    this.#setState("running");
    this.#resumeWaiters.splice(0).forEach((r) => r());
  }

  stop() {
    if (this.state === "stopped" || this.state === "done") return;
    if (this.state === "paused") this.#pausedTotal += this.now() - this.#pausedAt;
    this.#setState("stopped");
    this.voice.cancel();
    this.#resumeWaiters.splice(0).forEach((r) => r());
  }

  // Se déplacer dans la séance (en secondes depuis le début). Une phrase
  // reprend à son début ; un silence ou une pause reprend à l'endroit choisi,
  // après avoir redit la consigne qui le précède (on entend tout de suite
  // que la séance a repris, et on sait quoi faire pendant ce silence).
  // En pause, la séance reste en pause à la nouvelle position.
  seek(seconds) {
    if (this.state !== "running" && this.state !== "paused") return;
    const target = Math.min(Math.max(0, seconds), this.targetSeconds);
    const plan = this.plan();
    let index = plan.findIndex((p) => target < p.end);
    if (index === -1) index = this.script.length; // dans le dernier son du bol
    const start = index < plan.length ? plan[index].start : plan.at(-1)?.end ?? 0;
    const type = index < plan.length ? tokenType(this.script[index]) : "ring";
    const resumesInside = type === "pause" || type === "breathe" || type === "silence" || type === "ring";
    const position = resumesInside ? target : start;
    this.#offset += position - this.elapsed;
    const context = this.#contextBefore(index);
    const replay = type === "pause" || type === "silence" ? context.line : null;
    this.#pendingSeek = { index, into: resumesInside ? target - start : 0, replay };
    this.voice.cancel();
    this.onEvent({ type: "seek", position, ...context });
  }

  // Estimation de la place de chaque élément dans la séance : [{ start, end }].
  plan() {
    const cps = this.charsPerSecond;
    const durations = this.script.map((tok) => {
      switch (tokenType(tok)) {
        case "say": return tok.length / cps;
        case "pause": return tok;
        case "bell": return 1;
        case "breathe": return cycleSeconds(BREATH_PATTERNS[tok.pattern]) * tok.cycles;
        default: return 0; // silences : calculés ci-dessous
      }
    });
    const weights = this.script.reduce((w, tok) => w + (tokenType(tok) === "silence" ? tok.weight : 0), 0);
    const free = this.targetSeconds - FINAL_RING - durations.reduce((a, b) => a + b, 0);
    let t = 0;
    return this.script.map((tok, k) => {
      const d = tokenType(tok) === "silence" ? Math.max(MIN_SILENCE, (free * tok.weight) / weights) : durations[k];
      const slot = { start: t, end: t + d };
      t += d;
      return slot;
    });
  }

  // ---- Interne -----------------------------------------------------------

  #takeSeek() {
    const seek = this.#pendingSeek;
    this.#pendingSeek = null;
    this.#replay = seek.replay;
    return { i: seek.index, into: seek.into };
  }

  // Ce qui doit être affiché en arrivant à un élément : la dernière phrase
  // et le dernier rythme de respiration qui le précèdent.
  #contextBefore(index) {
    let line = null;
    let breathe = null;
    for (let k = 0; k < index && k < this.script.length; k++) {
      const type = tokenType(this.script[k]);
      if (type === "say") line = this.script[k];
      if (type === "breathe") breathe = this.script[k].pattern;
    }
    return { line, breathe };
  }

  async #play(i, into = 0) {
    const token = this.script[i];
    switch (tokenType(token)) {
      case "say":
        return this.#say(token);
      case "pause":
        return this.#wait(token - into);
      case "silence":
        this.onEvent({ type: "silence" });
        return this.#wait(this.silenceLength(i));
      case "bell":
        this.onEvent({ type: "bell" });
        this.audio.bell();
        return this.#wait(1);
      case "breathe": {
        const pattern = BREATH_PATTERNS[token.pattern];
        this.onEvent({ type: "breathe", pattern: token.pattern });
        return this.#wait(cycleSeconds(pattern) * token.cycles - into);
      }
    }
  }

  async #say(text) {
    this.onEvent({ type: "line", text });
    for (;;) {
      await this.#gate();
      if (this.state === "stopped" || this.#pendingSeek) return;
      const start = this.now();
      const finished = await this.voice.speak(text);
      if (finished) {
        this.#spoken.chars += text.length;
        this.#spoken.seconds += this.now() - start;
        return;
      }
      // Interrompu par une pause : on reprend la phrase au retour (sauf saut).
    }
  }

  // Longueur d'un silence élastique (en secondes), d'après le temps qui reste.
  silenceLength(index) {
    let fixed = 0;
    let chars = 0;
    let weights = 0;
    for (let k = index; k < this.script.length; k++) {
      const tok = this.script[k];
      const type = tokenType(tok);
      if (type === "silence") weights += tok.weight;
      else if (k === index) continue;
      else if (type === "say") chars += tok.length;
      else if (type === "pause") fixed += tok;
      else if (type === "bell") fixed += 1;
      else if (type === "breathe") fixed += cycleSeconds(BREATH_PATTERNS[tok.pattern]) * tok.cycles;
    }
    const available = this.targetSeconds - this.elapsed - fixed - chars / this.charsPerSecond - FINAL_RING;
    const share = (available * this.script[index].weight) / weights;
    return Math.max(MIN_SILENCE, share);
  }

  async #wait(seconds) {
    let left = seconds;
    while (left > 0 && this.state !== "stopped" && !this.#pendingSeek) {
      await this.#gate();
      if (this.state === "stopped" || this.#pendingSeek) return;
      const step = Math.min(left, TICK_MS / 1000);
      const before = this.now();
      await this.sleep(step * 1000);
      // Le temps passé en pause ne compte pas.
      if (this.state === "running") left -= Math.max(step, this.now() - before);
    }
  }

  #gate() {
    if (this.state !== "paused") return Promise.resolve();
    return new Promise((r) => this.#resumeWaiters.push(r));
  }

  #setState(state) {
    this.state = state;
    this.onEvent({ type: "state", state });
  }
}

// ---- Scripts générés --------------------------------------------------------

// Exercice de respiration : intro, cycles, conclusion.
export function breathingScript(pattern, minutes, { intro, outro }) {
  const cycles = Math.max(2, Math.round((minutes * 60 - 25) / cycleSeconds(BREATH_PATTERNS[pattern])));
  return [BELL, intro, 2, BREATHE(pattern, cycles), outro, BELL];
}

// Minuteur silencieux avec bol au début, à la fin et (en option) à intervalles.
export function timerScript(minutes, intervalMinutes) {
  if (!intervalMinutes) return [BELL, SILENCE(1), BELL];
  const script = [BELL];
  const rings = Math.floor((minutes - 0.01) / intervalMinutes);
  for (let k = 0; k < rings; k++) script.push(intervalMinutes * 60 - 1, BELL);
  script.push(SILENCE(1), BELL);
  return script;
}
