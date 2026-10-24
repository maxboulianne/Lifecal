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

  // Temps de méditation écoulé, pauses exclues.
  get elapsed() {
    if (this.#startedAt === null) return 0;
    const end = this.state === "paused" ? this.#pausedAt : this.now();
    return end - this.#startedAt - this.#pausedTotal;
  }

  get charsPerSecond() {
    return this.#spoken.seconds > 5 ? this.#spoken.chars / this.#spoken.seconds : DEFAULT_CHARS_PER_SECOND;
  }

  async run() {
    this.#startedAt = this.now();
    this.#setState("running");
    for (let i = 0; i < this.script.length; i++) {
      if (this.state === "stopped") return;
      await this.#play(i);
    }
    if (this.state === "stopped") return;
    await this.#wait(FINAL_RING);
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

  // ---- Interne -----------------------------------------------------------

  async #play(i) {
    const token = this.script[i];
    switch (tokenType(token)) {
      case "say":
        return this.#say(token);
      case "pause":
        return this.#wait(token);
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
        return this.#wait(cycleSeconds(pattern) * token.cycles);
      }
    }
  }

  async #say(text) {
    this.onEvent({ type: "line", text });
    for (;;) {
      await this.#gate();
      if (this.state === "stopped") return;
      const start = this.now();
      const finished = await this.voice.speak(text);
      if (finished) {
        this.#spoken.chars += text.length;
        this.#spoken.seconds += this.now() - start;
        return;
      }
      // Interrompu par une pause : on reprend la phrase au retour.
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
    while (left > 0 && this.state !== "stopped") {
      await this.#gate();
      if (this.state === "stopped") return;
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
