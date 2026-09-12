import { LegalInfo } from "./LegalInfo";
import { useEffect, useState } from "react";
import { version } from "../package.json";
import { cleanReport, reportText, type ReportInput } from "./bug-report";
import { api, useGame } from "./store";
import type { BugReports } from "../server/bug-reports";
import { mergeEvents } from "./event-store";
import { clientDiagnostics } from "./client-diagnostics";

type Preview = ReturnType<BugReports["read"]>;
const empty: ReportInput = {
  title: "",
  description: "",
  steps: "",
  expected: "",
  actual: "",
  technical: true,
};
const states: Record<string, string> = {
  prepared: "Vorschau intern gespeichert – noch nicht veröffentlicht",
  sending: "Versand läuft",
  sent: "Auf GitHub veröffentlicht",
  uncertain:
    "Versandstatus unklar. Vor jedem weiteren Versuch wird nach der Berichts-ID gesucht; kein blindes Neuerstellen.",
  retry:
    "GitHub begrenzt den Zugriff. Nach Ablauf der Wartezeit bewusst erneut versuchen.",
  blocked:
    "Direktversand abgelehnt oder Versuchslimit erreicht. Betreiber informieren oder Export verwenden.",
};
function download(text: string, name: string) {
  const u = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function SupportPanel({ onOpen }: { onOpen: (panel: string) => void }) {
  const { readonly, user } = useGame();
  const [form, setForm] = useState<ReportInput>({ ...empty }),
    [preview, setPreview] = useState<Preview | null>(null),
    [reports, setReports] = useState<Preview[]>([]),
    [configured, setConfigured] = useState<boolean | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const technical = `Leitstellen-Verbund ${version}
Karte: Deutschland
Browser: ${/Firefox/.test(navigator.userAgent) ? "Firefox" : /Edg/.test(navigator.userAgent) ? "Edge" : /Chrome/.test(navigator.userAgent) ? "Chromium" : "Anderer Browser"}
Verbindung: ${readonly ? "unterbrochen" : "verbunden"}
Keine Konto-, Standort- oder Zugangsdaten enthalten.
Lokale Fehlercodes: ${JSON.stringify(clientDiagnostics())}`;
  const key = `lv-report-draft:${user?.id ?? "local"}`;
  useEffect(() => {
    if (readonly) return;
    let active = true;
    void api("reports")
      .then((d) => {
        if (active) {
          setConfigured(d.configured);
          setReports(d.reports);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [readonly]);
  const run = async (fn: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };
  const clean = () => cleanReport(form);
  const exportText = () => {
    const v = clean();
    return (
      v.title +
      "\n\n" +
      reportText(
        v,
        `Leitstellen-Verbund ${version}\nKarte: Deutschland · Echtzeitserver`,
      )
    );
  };
  const update = (field: keyof ReportInput, value: string | boolean) => {
    setForm({ ...form, [field]: value });
    setPreview(null);
    setConsent(false);
  };
  return (
    <section className="menu-flow support-panel" aria-label="Support">
      <h2>Support</h2>
      <div className="inline">
        <button onClick={() => onOpen("help")}>Spielanleitung öffnen</button>
        <a
          href="https://discord.gg/RgtUHaWpcQ"
          target="_blank"
          rel="noopener noreferrer"
        >
          Gaminglive – Discord
        </a>
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/wiki"
          target="_blank"
          rel="noopener noreferrer"
        >
          Wiki
        </a>
      </div>
      <LegalInfo />
      <p>
        Sicherheitslücken bitte vertraulich über{" "}
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/security/advisories/new"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHubs private Sicherheitsmeldung
        </a>{" "}
        melden. Falls dort nicht verfügbar, den Serverbetreiber privat
        kontaktieren.
      </p>
      <label>
        Technische Angaben
        <textarea readOnly value={technical} rows={5} />
      </label>
      <button
        onClick={() =>
          void run(async () => {
            if (!navigator.clipboard?.writeText)
              throw Error(
                "Bitte technische Angaben markieren und mit Strg+C kopieren.",
              );
            try {
              await navigator.clipboard.writeText(technical);
            } catch {
              throw Error(
                "Kopieren nicht freigegeben. Bitte technische Angaben markieren und mit Strg+C kopieren.",
              );
            }
            setMessage("Technische Angaben kopiert.");
          })
        }
      >
        Angaben kopieren
      </button>
      <button
        onClick={() =>
          download(
            `Leitstellen-Verbund ${version}\nDeutschland\nVerbindung: ${readonly ? "unterbrochen" : "verbunden"}\nKeine Konto-, Standort- oder Zugangsdaten enthalten.`,
            "leitstellen-diagnose.txt",
          )
        }
      >
        Diagnose exportieren
      </button>
      <h3>Fehler melden</h3>
      <p>
        {readonly
          ? "Serververbindung unterbrochen. Nur lokaler Entwurf/Export möglich; es erfolgt später kein automatischer Versand."
          : configured === false
            ? "Direktversand nicht eingerichtet"
            : configured
              ? "Öffentliche GitHub-Berichte nach Vorschau und ausdrücklicher Bestätigung möglich."
              : "Versandkonfiguration wird geprüft …"}
      </p>
      {(
        [
          ["title", "Titel", 140],
          ["description", "Beschreibung", 4000],
          ["steps", "Schritte zur Reproduktion", 3000],
          ["expected", "Erwartetes Ergebnis", 2000],
          ["actual", "Tatsächliches Ergebnis", 2000],
        ] as const
      ).map(([k, label, max]) => (
        <label key={k}>
          {label}
          {k === "title" ? (
            <input
              value={form[k]}
              maxLength={max}
              onChange={(e) => update(k, e.target.value)}
            />
          ) : (
            <textarea
              rows={k === "description" ? 4 : 2}
              maxLength={max}
              value={form[k]}
              onChange={(e) => update(k, e.target.value)}
            />
          )}
        </label>
      ))}
      <label className="inline">
        <input
          type="checkbox"
          checked={form.technical}
          onChange={(e) => update("technical", e.target.checked)}
        />
        Spielversion und Kartentyp aufnehmen
      </label>
      <div className="inline">
        <button
          disabled={busy || readonly}
          onClick={() =>
            void run(async () => {
              const p = await api("reports/preview", clean());
              setPreview(p);
              setConfigured(p.configured);
              setConsent(false);
            })
          }
        >
          Bereinigte Vorschau
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(() =>
              download(exportText(), "leitstellen-fehlerbericht.txt"),
            )
          }
        >
          Bereinigten Bericht herunterladen
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(() => {
              localStorage.setItem(key, JSON.stringify(clean()));
              setMessage(
                "Bereinigter Entwurf nur auf diesem Gerät gespeichert.",
              );
            })
          }
        >
          Entwurf lokal speichern
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(() => {
              const raw = localStorage.getItem(key);
              if (!raw) throw Error("Kein lokaler Entwurf vorhanden.");
              setForm(cleanReport(JSON.parse(raw)));
              setPreview(null);
              setConsent(false);
            })
          }
        >
          Lokalen Entwurf laden
        </button>
        <button
          onClick={() => {
            localStorage.removeItem(key);
            setMessage("Lokaler Entwurf gelöscht.");
          }}
        >
          Lokalen Entwurf löschen
        </button>
      </div>
      {preview && (
        <article aria-label="Berichtsvorschau">
          <h3>{preview.preview.title}</h3>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {preview.preview.text}
          </pre>
          <p>Berichts-ID: {preview.id}</p>
          <p role="status">{states[preview.status]}</p>
          {preview.url ? (
            <a href={preview.url} target="_blank" rel="noopener noreferrer">
              GitHub-Issue #{preview.issue}
            </a>
          ) : (
            <>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                Ich habe die bereinigten Angaben geprüft und möchte genau diesen
                Bericht öffentlich auf GitHub veröffentlichen.
              </label>
              <button
                disabled={
                  busy ||
                  readonly ||
                  !consent ||
                  !preview.configured ||
                  preview.status === "blocked"
                }
                onClick={() =>
                  void run(async () => {
                    const p = await api("reports/submit", {
                      id: preview.id,
                      publish: true,
                    });
                    setPreview(p);
                    setConsent(false);
                    if (p.status === "sent") {
                      mergeEvents((await api("events")).events);
                    }
                    setReports((await api("reports")).reports);
                  })
                }
              >
                {preview.status === "uncertain"
                  ? "Versandstatus abgleichen"
                  : preview.status === "retry"
                    ? "Erneut ausdrücklich senden"
                    : "Öffentlich veröffentlichen"}
              </button>
            </>
          )}
        </article>
      )}
      {!!reports.length && (
        <details>
          <summary>Meine gespeicherten Berichte</summary>
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setPreview(r);
                setConsent(false);
              }}
            >
              {r.preview.title} · {states[r.status]}
            </button>
          ))}
        </details>
      )}
      <p>
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
        >
          Normaler GitHub-Meldeweg
        </a>{" "}
        – Export vorher prüfen und bewusst selbst übernehmen.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
