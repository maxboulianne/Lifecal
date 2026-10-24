// Scripts des séances par langue. Une langue sans traduction d'une séance
// retombe sur le français.
import { getLanguage } from "../../i18n/index.js";
import de from "./de.js";
import en from "./en.js";
import es from "./es.js";
import fr from "./fr.js";
import ko from "./ko.js";
import pt from "./pt.js";
import vi from "./vi.js";

export const SCRIPTS = { fr, en, es, pt, de, vi, ko };

const current = () => SCRIPTS[getLanguage()] ?? fr;

export const sessionContent = (id) => current().sessions[id] ?? fr.sessions[id];
export const programContent = (id) => current().programs[id] ?? fr.programs[id];
