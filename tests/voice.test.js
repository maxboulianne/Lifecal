import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { SpeechVoice } from "../js/meditation/voice.js";

// Synthèse vocale factice : `mode` décide de ce que fait chaque phrase.
function fakeSpeech(mode) {
  const log = [];
  const synth = {
    paused: false,
    speaking: false,
    speak(u) {
      log.push({ at: Date.now(), text: u.text });
      const m = mode(log.length);
      if (m === "ok") setTimeout(() => { u.onstart?.(); setTimeout(() => u.onend?.(), 1000); }, 10);
      if (m === "fail") setTimeout(() => u.onerror?.({ error: "synthesis-failed" }), 10);
      // "stuck" : rien ne se passe, comme Safari après un cancel() trop rapide
    },
    cancel() {},
  };
  globalThis.speechSynthesis = synth;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  return log;
}

const settle = async (ms) => {
  for (let k = 0; k < ms / 50; k++) {
    mock.timers.tick(50);
    await Promise.resolve();
  }
};

test("après un arrêt, la phrase suivante attend un court instant (Safari)", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 });
  const log = fakeSpeech(() => "ok");
  const voice = new SpeechVoice({ lang: "fr-CA" });
  const first = voice.speak("Une phrase.");
  await settle(100);
  voice.cancel(); // saut dans la barre d'avancement
  assert.equal(await first, false);
  const cancelledAt = Date.now();
  const next = voice.speak("La suite.");
  await settle(2000);
  assert.equal(await next, true);
  assert.ok(log[1].at - cancelledAt >= 300, "la nouvelle phrase n'est pas lancée tout de suite");
  mock.timers.reset();
});

test("une phrase bloquée est relancée, puis la séance avance quand même", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 });
  const log = fakeSpeech((n) => (n === 1 ? "stuck" : "ok"));
  const voice = new SpeechVoice({ lang: "fr-CA" });
  const p = voice.speak("Respire doucement.");
  await settle(5000);
  assert.equal(await p, true);
  assert.equal(log.length, 2, "relancée une fois");

  const log2 = fakeSpeech(() => "stuck");
  const q = new SpeechVoice({ lang: "fr-CA" }).speak("Toujours bloquée.");
  await settle(15000);
  assert.equal(await q, true, "la séance ne reste pas figée");
  assert.equal(log2.length, 2);
  mock.timers.reset();
});

test("une erreur de la voix fait passer à la phrase suivante (pas de boucle)", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 });
  fakeSpeech(() => "fail");
  const p = new SpeechVoice({ lang: "fr-CA" }).speak("Bonjour.");
  await settle(200);
  assert.equal(await p, true);
  mock.timers.reset();
});
