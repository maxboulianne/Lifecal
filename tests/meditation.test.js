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

// ---- Se déplacer dans une séance ----------------------------------------------

function seekRig(script, minutes, onSpeak) {
  const clock = fakeClock();
  const events = [];
  const voice = {
    spoken: [],
    async speak(text) {
      this.spoken.push(text);
      onSpeak?.(text, runner, clock);
      clock.advance(text.length / 13);
      return true;
    },
    cancel() {},
  };
  const runner = new SessionRunner({ script, targetSeconds: minutes * 60, voice, audio: { bell() {} },
    now: clock.now, sleep: clock.sleep, onEvent: (e) => events.push(e) });
  return { runner, voice, clock, events };
}

test("plan : chaque élément a sa place, la séance remplit la durée", () => {
  const { runner } = seekRig(fr.sessions.pp2.script, 10);
  const plan = runner.plan();
  assert.equal(plan.length, fr.sessions.pp2.script.length);
  assert.equal(plan[0].start, 0);
  for (let k = 1; k < plan.length; k++) assert.equal(plan[k].start, plan[k - 1].end);
  assert.ok(Math.abs(plan.at(-1).end - (600 - 5)) < 1, `fin prévue ${plan.at(-1).end}`);
});

test("reculer : la phrase est redite, la séance finit quand même à l'heure", async () => {
  const script = fr.sessions.pp2.script;
  let rewound = false;
  const { runner, voice, clock } = seekRig(script, 5, (text, r) => {
    // À la 5e phrase, on revient tout au début.
    if (!rewound && voice.spoken.length === 5) { rewound = true; r.seek(0); }
  });
  await runner.run();
  assert.equal(runner.state, "done");
  const first = script.find((x) => typeof x === "string");
  assert.equal(voice.spoken.filter((t) => t === first).length, 2);
  assert.ok(Math.abs(runner.elapsed - 300) < 30, `position finale ${Math.round(runner.elapsed)} s`);
  assert.ok(runner.listened > 300, "le temps réellement écouté inclut la partie réentendue");
  assert.ok(clock.now() > 300);
});

test("avancer jusqu'à la fin : terminé rapidement, peu de temps écouté", async () => {
  const { runner, voice } = seekRig(fr.sessions.pp1.script, 10, (text, r) => {
    if (voice.spoken.length === 2) r.seek(10 * 60);
  });
  await runner.run();
  assert.equal(runner.state, "done");
  assert.ok(runner.listened < 60, `écouté ${Math.round(runner.listened)} s`);
  assert.ok(runner.elapsed >= 595);
});

test("se déplacer dans une pause : la dernière consigne est redite, puis la pause reprend au bon endroit", async () => {
  const script = ["Première", SILENCE_TOKEN(), "Deuxième", 30, "Fin"];
  let target = null;
  const { runner, events, voice } = seekRig(script, 3, (text, r) => {
    if (text === "Deuxième" && target === null) {
      const plan = r.plan();
      target = (plan[3].start + plan[3].end) / 2; // au milieu de la pause de 30 s
      r.seek(target);
    }
  });
  await runner.run();
  const seek = events.find((e) => e.type === "seek");
  assert.equal(seek.line, "Deuxième");
  assert.ok(Math.abs(seek.position - target) < 0.01);
  assert.deepEqual(voice.spoken, ["Première", "Deuxième", "Deuxième", "Fin"]);
  assert.equal(runner.state, "done");
});

test("avancer dans un long silence : la voix reprend tout de suite, la séance finit à l'heure", async () => {
  const script = fr.sessions.pp1.script;
  let jumped = false;
  let after = null;
  const { runner, voice } = seekRig(script, 10, (text, r) => {
    if (!jumped && voice.spoken.length === 2) {
      jumped = true;
      // au milieu du plus long silence
      const plan = r.plan();
      const k = plan.reduce((best, p, j) => (p.end - p.start > plan[best].end - plan[best].start ? j : best), 0);
      r.seek((plan[k].start + plan[k].end) / 2);
      after = { count: voice.spoken.length, line: script.slice(0, k).filter((x) => typeof x === "string").at(-1) };
    }
  });
  await runner.run();
  assert.equal(voice.spoken[after.count], after.line, "la consigne du silence est redite aussitôt");
  assert.equal(runner.state, "done");
  assert.ok(Math.abs(runner.elapsed - 600) < 25, `position finale ${Math.round(runner.elapsed)} s`);
});

test("se déplacer pendant une pause : reste en pause à la nouvelle position", async () => {
  const clock = fakeClock();
  let runner;
  let calls = 0;
  const voice = {
    async speak(text) { calls++; if (calls === 1) { runner.pause(); runner.seek(100); return false; } clock.advance(1); return true; },
    cancel() {},
  };
  runner = new SessionRunner({ script: ["Un", 200, "Deux"], targetSeconds: 240, voice, audio: { bell() {} }, now: clock.now, sleep: clock.sleep });
  const done = runner.run();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(runner.state, "paused");
  assert.ok(Math.abs(runner.elapsed - 100) < 0.01);
  runner.resume();
  await done;
  assert.equal(runner.state, "done");
});

import { SILENCE as SILENCE_TOKEN } from "../js/meditation/tokens.js";

// ---- Statistiques détaillées ----------------------------------------------------

import { periodSeries, programProgress, secondsByKind } from "../js/meditation/progress.js";

const logged = (date, kind, seconds, extra = {}) =>
  normalizeItem({ id: `${date}-${kind}-${seconds}-${extra.sessionId ?? ""}`, title: "x", module: "meditation", date, done: true,
    data: { kind, seconds, ...extra } });

test("séance partielle : comptée dans le temps, pas dans la progression", () => {
  const items = [
    logged("2026-10-20", "session", 300, { sessionId: "pp1", completed: true }),
    logged("2026-10-21", "session", 120, { sessionId: "pp2", completed: false }),
    normalizeItem({ id: "ancien", title: "x", module: "meditation", date: "2026-10-19", done: true, data: { kind: "session", sessionId: "sos1", minutes: 3 } }),
  ];
  const [pp, sos] = programProgress(items);
  assert.equal(pp.completed, 1);
  assert.equal(pp.total, 7);
  assert.equal(pp.seconds, 420);
  assert.deepEqual(pp.sessions.slice(0, 2).map((s) => s.completed), [true, false]);
  assert.equal(sos.completed, 1); // ancienne séance sans « completed » : comptée comme terminée
  assert.equal(suggestion(items).sessionId, "pp2"); // la partielle reste à faire
  assert.equal(meditationStats(items, "2026-10-21").minutes, 10);
});

test("séries par semaine, mois et année", () => {
  const items = [
    logged("2026-10-19", "session", 600), // lundi
    logged("2026-10-19", "breathing", 300),
    logged("2026-10-23", "timer", 1200), // vendredi
    logged("2026-10-12", "session", 600), // semaine précédente
    logged("2026-03-05", "session", 900),
  ];
  const week = periodSeries(items, "week", "2026-10-24");
  assert.equal(week.bars.length, 7);
  assert.deepEqual(week.bars.map((b) => b.seconds), [900, 0, 0, 0, 1200, 0, 0]);
  assert.equal(week.total, 2100);
  assert.equal(week.best.key, "2026-10-23");
  assert.equal(periodSeries(items, "week", "2026-10-24", 1).total, 600);

  const month = periodSeries(items, "month", "2026-10-24");
  assert.equal(month.bars.length, 31);
  assert.equal(month.total, 2700);
  assert.equal(periodSeries(items, "month", "2026-10-24", 7).total, 900); // mars

  const year = periodSeries(items, "year", "2026-10-24");
  assert.equal(year.bars.length, 12);
  assert.equal(year.bars[9].seconds, 2700); // octobre
  assert.equal(year.bars[2].seconds, 900); // mars
  assert.equal(year.total, 3600);
  assert.equal(periodSeries(items, "year", "2026-10-24", 1).total, 0);

  assert.deepEqual(secondsByKind(items, "2026-10-19", "2026-10-25"), { session: 600, breathing: 300, timer: 1200 });
});
