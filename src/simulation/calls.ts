import type { Save, Mission } from "../model";
import { mt } from "../catalog";
import { districtAt, roads, distance } from "../world";
import { record, simId } from "./events";
import type { Incident } from "./schema";
// Meldebilder are scenario data; future hazard simulation can extend these profiles.
export const scenarios: Record<
  string,
  { report: string; people: string; hazard: string; detail: string }
> = {
  "bma-false": {
    report: "bma",
    people:
      "Keine verletzten Personen gemeldet; Gebäude noch nicht vollständig kontrolliert.",
    hazard: "Brandmeldeanlage ausgelöst. Rauch und Feuer nicht bestätigt.",
    detail:
      "Fehlalarm bestätigt: Gebäude kontrolliert, kein Brand und keine verletzten Personen. Anlage zurückstellen und Betreiber informieren.",
  },
  car: {
    report: "bin",
    people: "Personenzahl unklar; niemand im Fahrzeug bestätigt.",
    hazard: "Rauch am Fahrzeug; Abstand halten.",
    detail:
      "Brennender Pkw bestätigt. Löschangriff und Wasserversorgung erforderlich.",
  },
  flat: {
    report: "bin",
    people: "Eine Person soll sich noch im Gebäude befinden; unbestätigt.",
    hazard: "Rauch im Gebäude; der Treppenraum ist nicht beurteilt.",
    detail: "Gebäudebrand bestätigt. Lage und Ressourcenbedarf neu bewertet.",
  },
  field: {
    report: "bin",
    people: "Keine Verletzten gemeldet.",
    hazard: "Rauch und Funken auf trockener Wiese; Abstand halten.",
    detail:
      "Flächenbrand bestätigt. Zusätzliche Wasserversorgung erforderlich.",
  },
  sick: {
    report: "sick",
    people: "Eine erkrankte Person gemeldet.",
    hazard: "Der Zustand lässt sich telefonisch noch nicht sicher beurteilen.",
    detail:
      "Patient angetroffen. Versorgung und anschließender Transport erforderlich.",
  },
};
export const questionLabels = {
  address: "Wo genau ist der Notfall?",
  report: "Was ist passiert?",
  people: "Wie viele Personen sind betroffen?",
  hazard: "Welche Gefahren erkennen Sie?",
  detail: "Was können Sie noch beobachten?",
  calm: "Anrufer beruhigen und Angaben wiederholen",
};
export type Question = keyof typeof questionLabels;
export function multipleCallers(m: Mission) {
  const t = mt(m.template),
    profile = m.dynamics?.scenario ?? t.profile;
  return (
    !!m.major ||
    !!profile?.major ||
    t.patients >= 5 ||
    (!!profile?.fire && profile.severity === 3) ||
    ["factory", "warehouse", "flood", "rail", "bus"].includes(t.id)
  );
}
export function questionsFor(m: Mission): Record<Question, string> {
  const org = m.control?.reportedTemplate
    ? mt(m.control.reportedTemplate).org
    : "";
  return {
    ...questionLabels,
    ...(org === "Feuerwehr"
      ? {
          hazard: "Sehen Sie Flammen, Rauch oder gefährliche Stoffe?",
          detail: "Was brennt und wohin breitet sich der Rauch aus?",
        }
      : org === "Rettungsdienst"
        ? {
            people: "Wie viele Personen brauchen medizinische Hilfe?",
            detail:
              "Ist die Person ansprechbar? Was können Sie sicher beobachten?",
          }
        : org === "Polizei"
          ? {
              hazard: "Besteht noch eine unmittelbare Bedrohung?",
              detail: "Welche Personen oder Fahrzeuge können Sie beschreiben?",
            }
          : {}),
  };
}
export function attachIncident(s: Save, m: Mission) {
  if (m.control) return;
  const seed = s.seed,
    scenario = scenarios[m.template],
    t = mt(m.template),
    profile = t.profile;
  const road = IS_GERMANY
    ? null
    : roads.reduce((a, b) =>
        Math.min(...a.points.map((p) => distance(p, m.pos))) <
        Math.min(...b.points.map((p) => distance(p, m.pos)))
          ? a
          : b,
      );
  m.shared = false;
  m.control = {
    priority: "NORMAL",
    legacy: false,
    stage: "incoming",
    locationKnown: false,
    reportedTemplate: "",
    briefed: false,
    firstArrival: "",
    facts: [],
    calls: [],
    radio: [],
    events: [],
    secret: {
      seed,
      report: scenario?.report ?? m.template,
      address: IS_GERMANY
        ? addressAt(m.pos)
        : `${road!.name} ${1 + (seed % 89)}, ${districtAt(m.pos)}`,
      people:
        profile?.people ??
        scenario?.people ??
        (t.patients
          ? `${t.patients} betroffene Person(en) gemeldet; Anzahl noch unbestätigt.`
          : "Keine verletzten Personen bekannt; weitere Betroffene nicht ausgeschlossen."),
      hazard:
        profile?.observations[0] ??
        scenario?.hazard ??
        `Meldung aus dem Bereich ${t.org}; Gefahren vor Ort noch unbestätigt.`,
      detail: scenario?.detail ?? `${t.name} durch Erkundung bestätigt.`,
      observations: profile?.observations ?? [
        `${t.name}: Die anrufende Person beobachtet den Einsatzort.`,
        t.patients > 0
          ? `Ein weiterer Anrufer meldet ${t.patients} betroffene Personen an einem zweiten Zugang.`
          : "Ein weiterer Anrufer bestätigt den betroffenen Gebäudeteil und berichtet über die Zufahrt.",
      ],
      secondaryAt: multipleCallers(m) ? s.time + 45 + (seed % 91) : 0,
      secondaryKind: "additional",
      dropAt: 0,
      dropCall: "",
    },
  };
  record(
    s,
    m,
    "MISSION_CREATED",
    "Ereignis angelegt; Ort und Lage werden im Notruf erfragt.",
  );
  newCall(s, m, "initial");
}
function newCall(
  s: Save,
  m: Mission,
  kind: "initial" | "additional" | "recovery",
) {
  const c = m.control!,
    seed = c.secret!.seed,
    second = kind !== "initial";
  if (c.calls.length >= 4) return;
  c.calls.push({
    id: simId(s),
    state: "ringing",
    actor: "",
    created: s.time,
    started: 0,
    ended: 0,
    duration: 0,
    stress: second ? 25 : 30 + (seed % 65),
    quality: second ? 85 : 30 + ((seed >>> 5) % 65),
    credibility: second ? 95 : 45 + ((seed >>> 9) % 50),
    callback: second || seed % 7 !== 0,
    kind,
    asked: [],
    nextAnswer: 0,
    caller:
      kind === "recovery"
        ? "Erneute Meldung mit Standortangabe"
        : second
          ? "Weitere Person vor Ort"
          : "Anrufende Person",
    noise: seed % 2 ? "Verkehr und Stimmen" : "Unruhige Umgebung",
  });
  record(
    s,
    m,
    "CALL_RECEIVED",
    second
      ? kind === "recovery"
        ? "Erneute Meldung nach abgebrochener oder unvollständiger Erstmeldung."
        : "Zusätzlicher Notruf mit neuen Beobachtungen zur Großlage eingegangen."
      : "Neuer Notruf eingegangen.",
  );
}
export function callsTick(s: Save) {
  for (const m of s.missions) {
    const c = m.control;
    if (!c?.secret) continue;
    if (c.secret.secondaryAt && s.time >= c.secret.secondaryAt) {
      c.secret.secondaryAt = 0;
      const kind =
        c.secret.secondaryKind ??
        (c.calls.some(
          (call) => ["dropped", "ended"].includes(call.state) && !call.callback,
        ) &&
        (!c.locationKnown || !c.reportedTemplate)
          ? "recovery"
          : "additional");
      if (
        kind === "recovery"
          ? (!c.locationKnown || !c.reportedTemplate) &&
            !c.calls.some((call) => ["ringing", "active"].includes(call.state))
          : multipleCallers(m)
      )
        newCall(s, m, kind);
    }
    for (const call of c.calls)
      if (
        call.state === "active" &&
        call.id === c.secret.dropCall &&
        c.secret.dropAt &&
        s.time >= c.secret.dropAt
      ) {
        call.duration += s.time - call.started;
        call.state = "dropped";
        call.ended = s.time;
        if (
          !call.callback &&
          (!c.locationKnown || !c.reportedTemplate) &&
          c.calls.length < 4
        ) {
          c.secret.secondaryAt = s.time + 30;
          c.secret.secondaryKind = "recovery";
        }
        c.secret.dropAt = 0;
        record(
          s,
          m,
          "CALL_ENDED",
          "Gespräch abgebrochen. Rückrufstatus beachten.",
        );
      }
  }
}
export function callAction(
  s: Save,
  m: Mission,
  id: string,
  op: "accept" | "end" | "callback" | "ask",
  actor: string,
  question?: Question,
) {
  const c = m.control,
    call = c?.calls.find((x) => x.id === id);
  if (!c?.secret || !call) throw Error("Notruf nicht verfügbar.");
  if (op === "accept" || op === "callback") {
    if (call.state === "active") {
      if (call.actor === actor) return;
      if (s.time - Math.max(call.started, call.nextAnswer) < 60)
        throw Error(
          "Dieses Gespräch wird bereits bearbeitet. Übernahme nach 60 Sekunden ohne Bearbeitung möglich.",
        );
      if (
        s.missions.some((m) =>
          m.control?.calls.some(
            (x) => x.state === "active" && x.actor === actor,
          ),
        )
      )
        throw Error("Bitte zuerst das laufende Gespräch beenden.");
      call.actor = actor;
      call.nextAnswer = s.time;
      record(
        s,
        m,
        "CALL_ACCEPTED",
        "Unbearbeitetes Gespräch von anderem Disponenten übernommen.",
        actor,
      );
      return;
    }
    if (
      op === "accept"
        ? call.state !== "ringing"
        : !["dropped", "ended"].includes(call.state) || !call.callback
    )
      throw Error("Notruf kann nicht angenommen oder zurückgerufen werden.");
    if (
      s.missions.some((m) =>
        m.control?.calls.some((x) => x.state === "active" && x.actor === actor),
      )
    )
      throw Error("Bitte zuerst das laufende Gespräch beenden.");
    call.state = "active";
    call.actor = actor;
    call.started = s.time;
    call.ended = 0;
    c.stage = c.stage === "incoming" ? "interview" : c.stage;
    if (op === "accept" && call.stress > 75) {
      c.secret.dropCall = call.id;
      c.secret.dropAt = s.time + 35;
    } else if (c.secret.dropCall === call.id) c.secret.dropAt = 0;
    record(
      s,
      m,
      "CALL_ACCEPTED",
      op === "callback" ? "Rückruf verbunden." : "Notruf angenommen.",
      actor,
    );
    return;
  }
  if (op === "end" && call.state === "ended" && call.actor === actor) return;
  if (call.state !== "active" || call.actor !== actor)
    throw Error("Nur der Gesprächsbearbeiter kann diesen Notruf ändern.");
  if (op === "end") {
    if (
      !call.callback &&
      (!c.locationKnown || !c.reportedTemplate) &&
      c.calls.length < 4
    ) {
      c.secret.secondaryAt = s.time + 30;
      c.secret.secondaryKind = "recovery";
    }
    call.duration += s.time - call.started;
    call.state = "ended";
    call.ended = s.time;
    if (c.secret.dropCall === call.id) c.secret.dropAt = 0;
    record(
      s,
      m,
      "CALL_ENDED",
      `Gespräch beendet, Dauer ${Math.ceil(call.duration)} s.`,
      actor,
    );
    return;
  }
  if (!question || !(question in questionLabels))
    throw Error("Unbekannte Frage.");
  if (call.asked.includes(question)) return;
  if (s.time < call.nextAnswer)
    throw Error("Die anrufende Person antwortet noch.");
  if (
    !["address", "report", "calm"].includes(question) &&
    !call.asked.includes("report")
  )
    throw Error("Zuerst das Meldebild erfragen.");
  call.asked.push(question);
  call.nextAnswer = s.time + 2 + Math.floor(call.stress / 30);
  if (question === "calm") {
    call.stress = Math.max(0, call.stress - 40);
    call.quality = Math.min(100, call.quality + 25);
    if (c.secret.dropCall === call.id) c.secret.dropAt = 0;
    record(
      s,
      m,
      "CALL_UPDATED",
      "Anrufer beruhigt; Antwortqualität verbessert und Gespräch stabilisiert.",
      actor,
    );
    return;
  }
  let answer = c.secret[question];
  if (question === "report") {
    if (!c.briefed) c.reportedTemplate = c.secret.report;
    answer = mt(c.secret.report).name;
  }
  if (question === "address") c.locationKnown = true;
  if (question === "detail")
    answer =
      call.quality < 60
        ? "Keine weiteren sicheren Beobachtungen. Eine Erkundung ist nötig."
        : (c.secret.observations?.[
            call.kind === "additional"
              ? Math.min(
                  c.calls.indexOf(call),
                  (c.secret.observations?.length ?? 1) - 1,
                )
              : 0
          ] ??
          "Die Meldung beruht auf eigener Beobachtung; Details müssen vor Ort überprüft werden.");
  if (question === "people" && call.credibility < 60)
    answer =
      "Anrufer ist unsicher und vermutet mehrere Personen; möglicherweise nur Hörensagen.";
  const prior = c.facts.filter((f) => f.key === question),
    confidence: Incident["facts"][number]["confidence"] = prior.some(
      (f) => f.text !== answer,
    )
      ? "widersprüchlich"
      : call.quality >= 80 && question === "address"
        ? "bestätigt"
        : "unbestätigt";
  c.facts.push({ key: question, text: answer, source: call.id, confidence });
  if (
    c.locationKnown &&
    c.reportedTemplate &&
    ["incoming", "interview"].includes(c.stage)
  )
    c.stage = "disposition";
  record(
    s,
    m,
    "CALL_UPDATED",
    `${questionsFor(m)[question]} – ${answer} (${confidence})`,
    actor,
  );
}
import { IS_GERMANY } from "../world-choice";
import { addressAt } from "../germany/world";
