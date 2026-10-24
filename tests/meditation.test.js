import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionRunner, breathingScript, timerScript } from "../js/meditation/runner.js";
import { PROGRAMS } from "../js/meditation/catalog.js";
import fr from "../js/meditation/scripts/fr.js";

// Horloge simulée : sleep() avance le temps instantanément.
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms / 1000; }, advance: (s) => { t += s; } };
}

// Voix simulée : parle à 13 caractères par seconde.
function fakeVoice(clock, cps = 13) {
  return {
    spoken: [],
    async speak(text) { this.spoken.push(text); clock.advance(text.length / cps); return true; },
    cancel() {},
  };
}

const run = async (script, minutes, cps) => {
  const clock = fakeClock();
  const voice = fakeVoice(clock, cps);
  const runner = new SessionRunner({ script, targetSeconds: minutes * 60, voice, audio: { bell() {} }, now: clock.now, sleep: clock.sleep });
  await runner.run();
  return { seconds: clock.now(), runner, voice };
};

for (const program of PROGRAMS) {
  for (const id of program.sessions) {
    for (const minutes of program.durations) {
      test(`${id} en ${minutes} min respecte la durée`, async () => {
        const { seconds, runner, voice } = await run(fr.sessions[id].script, minutes, 13);
        assert.equal(runner.state, "done");
        const lines = fr.sessions[id].script.filter((x) => typeof x === "string");
        assert.equal(voice.spoken.length, lines.length);
        assert.ok(Math.abs(seconds - minutes * 60) <= 25, `${id} ${minutes} min : ${Math.round(seconds)} s`);
      });
    }
  }
}

test("voix plus lente : la séance reste à l'heure", async () => {
  const { seconds } = await run(fr.sessions.pp2.script, 10, 9);
  assert.ok(Math.abs(seconds - 600) < 25, `${Math.round(seconds)} s`);
});

test("pause : le temps en pause ne compte pas, la phrase reprend", async () => {
  const clock = fakeClock();
  let calls = 0;
  let runner;
  const voice = {
    async speak(text) {
      calls++;
      if (calls === 1) { runner.pause(); return false; } // interrompue
      clock.advance(text.length / 13);
      return true;
    },
    cancel() {},
  };
  runner = new SessionRunner({ script: ["Bonjour", 5], targetSeconds: 60, voice, audio: { bell() {} }, now: clock.now, sleep: clock.sleep });
  const done = runner.run();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(runner.state, "paused");
  clock.advance(300); // 5 minutes de pause
  runner.resume();
  await done;
  assert.equal(calls, 2);
  assert.ok(runner.elapsed < 15, `elapsed ${runner.elapsed}`);
});

test("arrêter met fin à la séance", async () => {
  const clock = fakeClock();
  const runner = new SessionRunner({ script: [60, "Fin"], targetSeconds: 120, voice: fakeVoice(clock), audio: { bell() {} },
    now: clock.now, sleep: async (ms) => { clock.advance(ms / 1000); if (clock.now() > 10) runner.stop(); } });
  await runner.run();
  assert.equal(runner.state, "stopped");
});

test("minuteur et respiration : durées", async () => {
  for (const [script, minutes] of [[timerScript(10, 0), 10], [timerScript(10, 5), 10], [timerScript(5, 1), 5]]) {
    const { seconds } = await run(script, minutes);
    assert.ok(Math.abs(seconds - minutes * 60) < 20, `minuteur ${minutes} : ${Math.round(seconds)} s`);
  }
  const { seconds } = await run(breathingScript("coherence", 5, { intro: "Suis le cercle.", outro: "Très bien." }), 5);
  assert.ok(Math.abs(seconds - 300) < 30, `respiration : ${Math.round(seconds)} s`);
});

import { SCRIPTS } from "../js/meditation/scripts/index.js";
import { tokenType } from "../js/meditation/tokens.js";
import { meditationStats, suggestion } from "../js/meditation/progress.js";
import { normalizeItem } from "../js/data/item.js";

// Forme d'un script : tout sauf le texte (le texte varie selon la langue).
const shape = (script) => script.map((tok) => (tokenType(tok) === "say" ? "say" : JSON.stringify(tok)));

for (const [lang, content] of Object.entries(SCRIPTS)) {
  test(`scripts ${lang} : mêmes séances et même structure que le français`, () => {
    assert.deepEqual(Object.keys(content.sessions).sort(), Object.keys(fr.sessions).sort());
    assert.deepEqual(Object.keys(content.programs).sort(), Object.keys(fr.programs).sort());
    for (const [id, session] of Object.entries(fr.sessions)) {
      const other = content.sessions[id];
      assert.ok(other.title && other.subtitle, `${lang} ${id} : titre`);
      assert.deepEqual(shape(other.script), shape(session.script), `${lang} ${id} : structure`);
      for (const tok of other.script) if (typeof tok === "string") assert.ok(tok.trim(), `${lang} ${id} : phrase vide`);
    }
  });
}

test("statistiques et séance suggérée", () => {
  const log = (date, sessionId, minutes, moods = {}) =>
    normalizeItem({ id: date + sessionId, title: "x", module: "meditation", date, done: true, data: { kind: "session", sessionId, minutes, ...moods } });
  const items = [
    log("2026-10-21", "pp1", 5, { moodBefore: 1, moodAfter: 3 }),
    log("2026-10-22", "pp2", 10, { moodBefore: 2, moodAfter: 3 }),
    log("2026-10-23", "sos1", 3),
    normalizeItem({ id: "plan", title: "Méditer", module: "meditation", date: "2026-10-25", done: false }),
  ];
  assert.deepEqual(meditationStats(items, "2026-10-23"), { sessions: 3, minutes: 18, streak: 3, moodLift: 1.5 });
  assert.equal(meditationStats(items, "2026-10-24").streak, 3); // aujourd'hui pas encore fait
  assert.equal(meditationStats(items, "2026-10-25").streak, 0);
  assert.equal(suggestion(items).sessionId, "pp3");
  assert.equal(suggestion([]).sessionId, "pp1");
});
