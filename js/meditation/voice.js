// Voix des séances guidées.
//
// Trois implémentations partagent la même interface :
//   speak(text) -> Promise<boolean>   (true = phrase terminée, false = interrompue)
//   cancel()
//
//  - SpeechVoice    : voix de synthèse de l'appareil (aujourd'hui).
//  - TextVoice      : pas de voix, le texte reste affiché le temps de le lire.
//  - RecordedVoice  : (plus tard) fichiers audio enregistrés, une phrase par
//                     fichier : audio/<langue>/<séance>/<n>.mp3. Comme toutes
//                     les langues ont la même suite d'éléments, le n-ième
//                     texte du script correspond au n-ième fichier.

// Voix féminines connues, par langue (Apple, Google, Microsoft). Les voix
// « améliorées » ou « premium » sont préférées quand elles sont installées.
const FEMALE_VOICES = {
  fr: ["Amélie", "Amelie", "Audrey", "Aurélie", "Marie", "Virginie", "Chantal", "Julie", "Hortense", "Denise", "Sylvie", "Google français"],
  en: ["Samantha", "Ava", "Allison", "Susan", "Karen", "Moira", "Tessa", "Serena", "Victoria", "Zoe", "Zira", "Aria", "Jenny", "Google US English", "Google UK English Female"],
  es: ["Mónica", "Monica", "Paulina", "Marisol", "Helena", "Laura", "Sabina", "Elvira", "Google español"],
  pt: ["Luciana", "Joana", "Fernanda", "Francisca", "Maria", "Catarina", "Google português do Brasil"],
  de: ["Anna", "Petra", "Helena", "Katja", "Hedda", "Marlene", "Vicki", "Google Deutsch"],
  vi: ["Linh", "HoaiMy", "Hoài My", "Google Tiếng Việt"],
  ko: ["Yuna", "Sora", "Heami", "SunHi", "Google 한국의"],
};

// Variante régionale préférée (ex. Amélie, voix québécoise, pour le français).
const PREFERRED_REGION = { fr: "fr-CA", en: "en-US", es: "es-MX", pt: "pt-BR", de: "de-DE", vi: "vi-VN", ko: "ko-KR" };

const synth = () => globalThis.speechSynthesis ?? null;
export const isSpeechSupported = () => Boolean(synth() && globalThis.SpeechSynthesisUtterance);

const langOf = (voice) => voice.lang.replace("_", "-").toLowerCase();

export function voicesFor(language, all = synth()?.getVoices() ?? []) {
  return all.filter((v) => langOf(v).startsWith(language));
}

function score(voice, language) {
  const names = FEMALE_VOICES[language] ?? [];
  let s = 0;
  if (names.some((n) => voice.name.toLowerCase().includes(n.toLowerCase()))) s += 10;
  if (/enhanced|premium|améliorée|natural|neural/i.test(voice.name)) s += 5;
  if (langOf(voice) === PREFERRED_REGION[language]?.toLowerCase()) s += 2;
  if (voice.localService) s += 1;
  return s;
}

// La voix choisie dans les Paramètres, sinon la meilleure voix féminine.
export function pickVoice(language, preferredURI, all) {
  const list = voicesFor(language, all);
  return (
    list.find((v) => v.voiceURI === preferredURI) ??
    [...list].sort((a, b) => score(b, language) - score(a, language))[0] ??
    null
  );
}

// Les voix arrivent parfois après le chargement de la page (Safari, Chrome).
export function loadVoices(timeout = 1500) {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(s.getVoices());
    s.addEventListener?.("voiceschanged", done, { once: true });
    setTimeout(done, timeout);
  });
}

// iOS n'autorise la synthèse vocale qu'après un geste de l'utilisateur :
// une phrase vide, dite pendant le toucher, débloque la suite de la séance.
export function unlockSpeech() {
  if (!isSpeechSupported()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth().speak(u);
}

// Safari (iPad, iPhone, Mac) : une phrase lancée juste après cancel() est
// souvent perdue, et la voix peut rester bloquée sans jamais signaler la fin.
// On attend donc un court instant après chaque arrêt, et un délai de secours
// fait avancer la séance si la phrase ne se termine jamais.
const AFTER_CANCEL_MS = 300;
const START_TIMEOUT_MS = 2500;
const RETRIES = 2;

export class SpeechVoice {
  #pending = null;
  #cancelledAt = -Infinity;
  // Garder la phrase en cours : sinon le navigateur peut l'oublier en route
  // et ne jamais signaler sa fin.
  #utterance = null;

  constructor({ voice, lang, rate = 0.88, pitch = 1 }) {
    this.voice = voice;
    this.lang = voice?.lang ?? lang;
    this.rate = rate;
    this.pitch = pitch;
  }

  speak(text) {
    return new Promise((resolve) => {
      const timers = [];
      const finish = (ok) => {
        if (this.#pending !== finish) return;
        this.#pending = null;
        this.#utterance = null;
        timers.forEach(clearTimeout);
        resolve(ok);
      };
      this.#pending = finish;
      const s = synth();
      let started = false;
      let tries = 0;

      const utter = () => {
        if (this.#pending !== finish) return;
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.lang = this.lang;
        u.rate = this.rate;
        u.pitch = this.pitch;
        // Seule la dernière phrase lancée compte (pas celle qu'on a relancée).
        u.onstart = () => this.#utterance === u && (started = true);
        u.onend = () => this.#utterance === u && finish(true);
        u.onerror = (e) => {
          if (this.#utterance !== u) return;
          // Arrêtée (cancel, autre son) : false, la phrase sera reprise.
          // Autre erreur : on passe à la suite plutôt que de boucler.
          const stopped = ["interrupted", "canceled"].includes(e.error);
          if (stopped) this.#cancelledAt = Date.now(); // laisser la voix se remettre avant de reprendre
          finish(!stopped);
        };
        this.#utterance = u;
        if (s.paused) s.resume();
        s.speak(u);
        // La voix n'a pas commencé : on la débloque et on réessaie.
        timers.push(setTimeout(() => {
          if (started || this.#pending !== finish) return;
          if (tries++ >= RETRIES) return finish(true); // on avance quand même
          this.#utterance = null;
          s.cancel();
          timers.push(setTimeout(utter, AFTER_CANCEL_MS));
        }, START_TIMEOUT_MS));
      };

      // Durée maximale raisonnable de la phrase : au-delà, on passe à la suite.
      const longest = (RETRIES + 1) * (START_TIMEOUT_MS + AFTER_CANCEL_MS) + (text.length / 6 / this.rate) * 1000;
      timers.push(setTimeout(() => finish(true), longest));

      // Safari perd une phrase lancée juste après un arrêt : on attend un peu.
      const wait = this.#cancelledAt + AFTER_CANCEL_MS - Date.now();
      if (wait > 0) timers.push(setTimeout(utter, wait));
      else utter(); // tout de suite, encore dans le geste de l'utilisateur
    });
  }

  cancel() {
    const pending = this.#pending;
    // Rien à arrêter (ex. déjà en pause) : ne pas retarder la phrase suivante.
    if (!pending && !synth()?.speaking) return;
    this.#cancelledAt = Date.now();
    this.#utterance = null;
    synth()?.cancel();
    pending?.(false);
  }
}

// Sans voix : le texte reste affiché le temps de le lire tranquillement.
export class TextVoice {
  #timer = null;
  #resolve = null;

  constructor({ charsPerSecond = 14 } = {}) {
    this.charsPerSecond = charsPerSecond;
  }

  speak(text) {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.#timer = setTimeout(() => {
        this.#resolve = null;
        resolve(true);
      }, (text.length / this.charsPerSecond + 1.5) * 1000);
    });
  }

  cancel() {
    clearTimeout(this.#timer);
    this.#resolve?.(false);
    this.#resolve = null;
  }
}
