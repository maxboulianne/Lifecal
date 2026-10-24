// Lecteur plein écran d'une séance de méditation.
//
// Étapes : humeur avant (facultatif) → séance → fin (humeur après, habitudes
// du jour à cocher). La séance terminée est enregistrée dans le calendrier,
// dans le module « Méditation ».

import { todayISO } from "../../core/dates.js";
import { $, esc } from "../../core/dom.js";
import { isCancelled } from "../../data/item.js";
import { getLanguage, t } from "../../i18n/index.js";
import { BREATH_PATTERNS, MOODS } from "../../meditation/catalog.js";
import { MEDITATION_MODULE } from "../../meditation/progress.js";
import { SessionRunner } from "../../meditation/runner.js";
import { SpeechVoice, TextVoice, isSpeechSupported, loadVoices, pickVoice, unlockSpeech } from "../../meditation/voice.js";

const MIN_SECONDS_TO_LOG = 60;
// Une séance compte comme « terminée au complet » si elle est allée jusqu'au
// bout et qu'au moins 80 % de sa durée a vraiment été écoutée (sauter à la fin
// avec la barre d'avancement ne suffit pas).
const COMPLETE_RATIO = 0.8;

const clock = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Bascule voix / texte seul pendant la séance.
class SwitchableVoice {
  constructor(speech) {
    this.speech = speech;
    this.text = new TextVoice();
    this.on = Boolean(speech);
  }
  get current() {
    return this.on && this.speech ? this.speech : this.text;
  }
  speak(text) {
    return this.current.speak(text);
  }
  cancel() {
    this.speech?.cancel();
    this.text.cancel();
  }
  attach(speech) {
    this.speech = speech;
    this.on = true;
  }
  toggle() {
    if (!this.speech) return;
    this.cancel(); // la phrase en cours est reprise dans le nouveau mode
    this.on = !this.on;
  }
}

export class MeditationPlayer {
  #config = null;
  #runner = null;
  #voice = null;
  #ticker = null;
  #breathTimer = null;
  #wakeLock = null;
  #moodBefore = null;
  #itemId = null;
  #startTime = "";
  #scrubbing = false;

  constructor({ repo, audio }) {
    this.repo = repo;
    this.audio = audio;
    this.root = $("#player");
    this.root.addEventListener("click", (e) => this.#onClick(e));
    // Barre d'avancement : on suit le doigt, puis on saute au relâchement.
    this.root.addEventListener("input", (e) => {
      if (!e.target.matches(".player-seek")) return;
      this.#scrubbing = true;
      this.#showPosition(Number(e.target.value));
    });
    this.root.addEventListener("change", (e) => {
      if (!e.target.matches(".player-seek")) return;
      this.audio.unlock(); // relancer le son au besoin (iOS)
      this.#runner?.seek(Number(e.target.value));
      this.#scrubbing = false;
    });
    this.root.addEventListener("pointerdown", (e) => {
      if (e.target.matches(".player-seek")) this.#scrubbing = true;
    });
    // Un simple toucher sans glisser ne déclenche pas « change » : on libère la barre.
    const release = () => setTimeout(() => (this.#scrubbing = false), 50);
    this.root.addEventListener("pointerup", release);
    this.root.addEventListener("pointercancel", release);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.#runner?.state === "running") this.#keepAwake();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  // config : { kind, id, title, kicker, color, script, minutes, ambience, voiceOn }
  async open(config) {
    this.#config = config;
    this.#moodBefore = null;
    this.#itemId = null;
    this.audio.unlock(); // dans le geste de l'utilisateur (iOS)
    this.root.style.setProperty("--pc", config.color);
    this.root.hidden = false;
    document.body.classList.add("player-open");
    // Texte seul en attendant ; la voix s'ajoute dès que l'appareil a fourni
    // sa liste (elle peut arriver avec un peu de retard).
    const voice = new SwitchableVoice(null);
    this.#voice = voice;
    this.#renderBefore();
    if (!config.voiceOn || !isSpeechSupported()) return;
    const voices = await loadVoices();
    const prefs = this.repo.settings.meditation ?? {};
    const chosen = pickVoice(getLanguage(), prefs.voices?.[getLanguage()], voices);
    if (chosen && this.#voice === voice) voice.attach(new SpeechVoice({ voice: chosen }));
  }

  close() {
    this.#runner?.stop();
    this.#cleanup();
    this.root.hidden = true;
    this.root.innerHTML = "";
    document.body.classList.remove("player-open");
  }

  // ---- Étapes ------------------------------------------------------------

  #moods(action) {
    return `<div class="moods" role="group">${MOODS.map((m, k) =>
      `<button type="button" class="mood" data-player="${action}" data-mood="${k}" aria-label="${k + 1}/5">${m}</button>`).join("")}</div>`;
  }

  #header(closeAction) {
    return `<button type="button" class="player-close" data-player="${closeAction}" aria-label="${esc(t("med.stop"))}">×</button>
      <p class="player-kicker">${esc(this.#config.kicker)}</p>
      <h2 class="player-title">${esc(this.#config.title)}</h2>`;
  }

  #renderBefore() {
    this.root.innerHTML = `<div class="player-inner">
      ${this.#header("close")}
      <p class="player-question">${t("med.moodBefore")}</p>
      ${this.#moods("mood-before")}
      <button type="button" class="btn link light" data-player="mood-before" data-mood="">${t("med.skip")}</button>
    </div>`;
  }

  #renderRunning() {
    this.root.innerHTML = `<div class="player-inner running">
      ${this.#header("stop")}
      <div class="breath idle" aria-hidden="true"><div class="breath-circle"></div><span class="breath-label"></span></div>
      <p class="player-line" aria-live="polite"></p>
      <div class="player-progress">
        <span class="player-time" data-role="elapsed">0:00</span>
        <input type="range" class="player-seek" min="0" max="${this.#config.minutes * 60}" step="1" value="0"
          aria-label="${esc(t("med.seek"))}" style="--pct:0%">
        <span class="player-time" data-role="remaining">-${clock(this.#config.minutes * 60)}</span>
      </div>
      <div class="player-controls">
        <button type="button" class="player-btn" data-player="pause" aria-label="${esc(t("med.pause"))}">❚❚</button>
        ${this.#voice.speech ? `<button type="button" class="player-btn small" data-player="voice" aria-label="${esc(t("med.voiceOn"))}">${this.#voice.on ? "🔊" : "🔇"}</button>` : ""}
      </div>
    </div>`;
  }

  async #renderEnd(minutes, completed) {
    const today = todayISO();
    const habits = this.repo
      .onDate(today)
      .filter((i) => i.occurrence && i.module === "habitude" && !i.done && !isCancelled(i));
    this.root.innerHTML = `<div class="player-inner end">
      <button type="button" class="player-close" data-player="close" aria-label="${esc(t("detail.close"))}">×</button>
      <p class="player-end-icon" aria-hidden="true">🌿</p>
      <h2 class="player-title">${t("med.end.title")}</h2>
      <p>${t("med.end.minutes", { count: minutes })}</p>
      <p class="player-badge ${completed ? "complete" : ""}">${t(completed ? "med.end.complete" : "med.end.partial")}</p>
      <p class="player-question">${t("med.moodAfter")}</p>
      ${this.#moods("mood-after")}
      ${habits.length ? `<p class="player-question small">${t("med.end.habits")}</p>
        <div class="player-habits">${habits.map((h) =>
          `<button type="button" class="btn soft" data-player="habit" data-id="${esc(h.id)}">🌱 ${esc(h.title)}</button>`).join("")}</div>` : ""}
      <button type="button" class="btn primary" data-player="close">${t("med.end.done")}</button>
    </div>`;
  }

  // ---- Séance ------------------------------------------------------------

  async #start() {
    const c = this.#config;
    this.#startTime = new Date().toTimeString().slice(0, 5);
    this.#renderRunning();
    this.audio.startAmbience(c.ambience);
    this.#keepAwake();
    this.#runner = new SessionRunner({
      script: c.script,
      targetSeconds: c.minutes * 60,
      voice: this.#voice,
      audio: this.audio,
      onEvent: (e) => this.#onEvent(e),
    });
    this.#ticker = setInterval(() => this.#tick(), 500);
    await this.#runner.run();
    if (this.#runner.state === "done") this.#finish();
  }

  #onEvent(e) {
    if (e.type === "line") {
      const line = this.root.querySelector(".player-line");
      if (!line) return;
      line.classList.remove("show");
      line.textContent = e.text;
      requestAnimationFrame(() => line.classList.add("show"));
    }
    if (e.type === "breathe") this.#breathe(e.pattern);
    if (e.type === "seek") {
      const line = this.root.querySelector(".player-line");
      if (line) line.textContent = e.line ?? "";
      if (e.breathe) {
        this.#breathe(e.breathe);
        if (this.#runner?.state === "paused") this.#stopBreath();
      } else {
        this.#stopBreath();
        this.#breathPattern = null;
        this.root.querySelector(".breath")?.classList.add("idle");
      }
      this.#showPosition(e.position);
    }
    if (e.type === "state" && e.state === "paused") this.#stopBreath();
    if (e.type === "state" && e.state === "running" && this.#breathPattern) this.#breathe(this.#breathPattern);
  }

  #tick() {
    if (this.#runner && !this.#scrubbing) this.#showPosition(this.#runner.elapsed);
  }

  #showPosition(seconds) {
    const total = this.#config.minutes * 60;
    const pos = Math.min(total, Math.max(0, seconds));
    const range = this.root.querySelector(".player-seek");
    if (!range) return;
    if (!this.#scrubbing) range.value = String(Math.round(pos));
    range.style.setProperty("--pct", `${(pos / total) * 100}%`);
    range.setAttribute("aria-valuetext", `${clock(pos)} / ${clock(total)}`);
    this.root.querySelector("[data-role=elapsed]").textContent = clock(pos);
    this.root.querySelector("[data-role=remaining]").textContent = `-${clock(total - pos)}`;
  }

  // Cercle de respiration : grandit à l'inspiration, rétrécit à l'expiration.
  #breathPattern = null;

  #breathe(patternId) {
    this.#stopBreath();
    this.#breathPattern = patternId;
    const p = BREATH_PATTERNS[patternId];
    const box = this.root.querySelector(".breath");
    if (!box) return;
    box.classList.remove("idle");
    const circle = box.querySelector(".breath-circle");
    const label = box.querySelector(".breath-label");
    const phases = [
      ["in", p.in, 1],
      ["hold", p.hold, 1],
      ["out", p.out, 0.55],
      ["hold", p.hold2, 0.55],
    ].filter(([, s]) => s > 0);
    let k = 0;
    const step = () => {
      const [name, seconds, scale] = phases[k % phases.length];
      circle.style.transition = `transform ${seconds}s ease-in-out`;
      circle.style.transform = `scale(${scale})`;
      label.textContent = t(`med.breath.${name}`);
      k++;
      this.#breathTimer = setTimeout(step, seconds * 1000);
    };
    step();
  }

  #stopBreath() {
    clearTimeout(this.#breathTimer);
  }

  async #finish() {
    const r = this.#runner;
    const seconds = r.listened;
    const minutes = Math.max(1, Math.round(seconds / 60));
    const completed = r.state === "done" && seconds >= COMPLETE_RATIO * this.#config.minutes * 60;
    this.#cleanup();
    if (seconds < MIN_SECONDS_TO_LOG) return this.close();
    await this.#log(Math.round(seconds), completed);
    this.#renderEnd(minutes, completed);
  }

  // Enregistre la séance ; réutilise une méditation planifiée aujourd'hui si elle existe.
  async #log(seconds, completed) {
    const c = this.#config;
    const today = todayISO();
    const data = {
      kind: c.kind,
      sessionId: c.kind === "session" ? c.id : null,
      exercise: c.id,
      seconds,
      minutes: Math.max(1, Math.round(seconds / 60)),
      planned: c.minutes,
      completed,
      moodBefore: this.#moodBefore,
    };
    const planned = this.repo.onDate(today).find((i) => i.module === MEDITATION_MODULE && !i.done && !i.data?.kind && !i.recurrence);
    const fields = { done: true, data: { ...(planned?.data ?? {}), ...data } };
    const item = planned
      ? await this.repo.update(planned.id, fields)
      : await this.repo.add({ title: c.title, module: MEDITATION_MODULE, date: today, time: this.#startTime, ...fields });
    this.#itemId = item.id;
  }

  #cleanup() {
    clearInterval(this.#ticker);
    this.#stopBreath();
    this.#breathPattern = null;
    this.audio.close();
    this.#voice?.cancel();
    this.#wakeLock?.release?.().catch(() => {});
    this.#wakeLock = null;
  }

  // Garder l'écran allumé pendant la séance (sinon iOS coupe la voix).
  async #keepAwake() {
    try {
      this.#wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      /* non disponible : sans conséquence */
    }
  }

  // ---- Actions -----------------------------------------------------------

  async #onClick(e) {
    const el = e.target.closest("[data-player]");
    if (!el) return;
    const action = el.dataset.player;
    try {
      if (action === "mood-before") {
        if (this.#voice?.speech) unlockSpeech(); // pendant le toucher (iOS)
        this.audio.unlock();
        this.#moodBefore = el.dataset.mood === "" ? null : Number(el.dataset.mood);
        await this.#start();
      } else if (action === "pause") {
        const r = this.#runner;
        if (r.state === "running") r.pause();
        else {
          this.audio.unlock();
          r.resume();
        }
        el.textContent = r.state === "paused" ? "▶" : "❚❚";
        el.setAttribute("aria-label", t(r.state === "paused" ? "med.resume" : "med.pause"));
      } else if (action === "voice") {
        this.#voice.toggle();
        el.textContent = this.#voice.on ? "🔊" : "🔇";
      } else if (action === "stop") {
        this.#runner.stop();
        await this.#finish();
      } else if (action === "mood-after") {
        const item = this.repo.get(this.#itemId);
        if (item) await this.repo.update(item.id, { data: { ...item.data, moodAfter: Number(el.dataset.mood) } });
        el.parentElement.querySelectorAll(".mood").forEach((b) => b.classList.toggle("selected", b === el));
      } else if (action === "habit") {
        await this.repo.toggleDone(el.dataset.id, todayISO());
        el.disabled = true;
        el.textContent = `✓ ${el.textContent.replace("🌱 ", "")}`;
      } else if (action === "close") {
        this.close();
      }
    } catch (err) {
      console.error(err);
    }
  }
}

