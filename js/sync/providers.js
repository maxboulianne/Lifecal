// Fournisseurs de calendriers externes.
//
// Chaque fournisseur implémente la même interface. Seuls les squelettes
// existent pour l'instant : la connexion OAuth demandera un petit serveur
// (ou des identifiants d'application) qui n'existe pas encore dans le pilote.
//
// Interface :
//   id, label, available
//   connect()                       -> Promise<{ accountLabel }>
//   disconnect()                    -> Promise<void>
//   listEvents({ from, to })        -> Promise<ExternalEvent[]>
//   upsertEvent(item)               -> Promise<{ externalId, etag }>
//   deleteEvent(externalId)         -> Promise<void>
//
// ExternalEvent (format pivot, commun à tous les fournisseurs) :
//   { externalId, etag, title, date: "AAAA-MM-JJ", time: "HH:MM" | "",
//     location, lat, lng, notes, cancelled }

export class CalendarProvider {
  constructor({ id, label, docsUrl }) {
    this.id = id;
    this.label = label;
    this.docsUrl = docsUrl;
    this.available = false;
  }

  #notYet() {
    return Promise.reject(new Error(`La synchronisation avec ${this.label} arrive bientôt.`));
  }

  connect() { return this.#notYet(); }
  disconnect() { return Promise.resolve(); }
  listEvents() { return this.#notYet(); }
  upsertEvent() { return this.#notYet(); }
  deleteEvent() { return this.#notYet(); }
}

// Google Calendar API v3 — events.list / events.insert / events.patch.
export class GoogleCalendarProvider extends CalendarProvider {
  constructor() {
    super({ id: "google", label: "Google Agenda", docsUrl: "https://developers.google.com/calendar/api" });
  }
}

// Microsoft Graph — /me/calendar/events (Outlook, Office 365).
export class OutlookCalendarProvider extends CalendarProvider {
  constructor() {
    super({ id: "outlook", label: "Outlook", docsUrl: "https://learn.microsoft.com/graph/api/resources/calendar" });
  }
}

// Yahoo expose ses agendas en CalDAV.
export class YahooCalendarProvider extends CalendarProvider {
  constructor() {
    super({ id: "yahoo", label: "Yahoo Agenda", docsUrl: "https://help.yahoo.com/kb/SLN4311.html" });
  }
}

export const PROVIDERS = [new GoogleCalendarProvider(), new OutlookCalendarProvider(), new YahooCalendarProvider()];

export const getProvider = (id) => PROVIDERS.find((p) => p.id === id) ?? null;
