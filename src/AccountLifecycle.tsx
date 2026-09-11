import { useState } from "react";
import { api, refresh } from "./store";
import { useCommandForm } from "./use-command-form";
type Preview = {
  challenge: string;
  operation: "reset" | "delete";
  phrase: string;
  buildings: number;
  vehicles: number;
  missions: number;
};
export function AccountLifecycleControls() {
  const [operation, setOperation] = useState<"reset" | "delete">("reset"),
    [password, setPassword] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [phrase, setPhrase] = useState(""),
    [ack, setAck] = useState(false);
  const form = useCommandForm(!!password || !!preview, () => {
    setPassword("");
    setPreview(null);
    setPhrase("");
    setAck(false);
  });
  return (
    <details>
      <summary>Spielstand zurücksetzen oder Konto löschen</summary>
      <p>
        Dies betrifft deine eigene Leitstelle samt Fortschritt, Käufen,
        Einsatzhistorie und Übungen. Beim Zurücksetzen bleibt dein Zugang
        erhalten; beim Löschen wird auch dein Konto entfernt. Laufende
        gemeinsame Einsätze müssen vorher abgeschlossen sein.
      </p>
      {form.error && (
        <p role="alert" className="error">
          {form.error}
        </p>
      )}
      {!preview ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.run(async () => {
              const result = (await api("account/prepare", {
                operation,
                password,
              })) as Preview;
              setPassword("");
              setPreview(result);
            });
          }}
        >
          <fieldset disabled={form.busy} className="account-fields">
            <label>
              Aktion
              <select
                aria-label="Aktion"
                value={operation}
                onChange={(e) =>
                  setOperation(e.target.value as typeof operation)
                }
              >
                <option value="reset">Spielstand zurücksetzen</option>
                <option value="delete">Konto vollständig löschen</option>
              </select>
            </label>
            <label>
              Passwort zur Identitätsprüfung
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                required
                minLength={12}
                maxLength={128}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button>Betroffene Daten prüfen</button>
          </fieldset>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (phrase !== preview.phrase || !ack) return;
            void form.run(async () => {
              await api("account/confirm", {
                challenge: preview.challenge,
                phrase,
                acknowledged: ack,
              });
              setPreview(null);
              setPhrase("");
              setAck(false);
              await refresh();
            });
          }}
        >
          <fieldset disabled={form.busy} className="account-fields">
            <h3>
              {preview.operation === "delete"
                ? "Konto endgültig löschen"
                : "Eigene Leitstelle auf den Startzustand zurücksetzen"}
            </h3>
            <p>
              Betroffen: {preview.buildings} Standorte, {preview.vehicles}{" "}
              Fahrzeuge, {preview.missions} aktive Einsätze sowie Guthaben,
              Fortschritt und Historie. Alle eigenen Sitzungen werden beendet.
            </p>
            <label>
              Zur Bestätigung exakt eingeben: <b>{preview.phrase}</b>
              <input
                value={phrase}
                autoComplete="off"
                onChange={(e) => setPhrase(e.target.value)}
                required
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Ich habe den Umfang geprüft und möchte diese Daten endgültig
              entfernen.
            </label>
            <button disabled={!ack || phrase !== preview.phrase}>
              Endgültig bestätigen
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setPhrase("");
                setAck(false);
              }}
            >
              Abbrechen
            </button>
          </fieldset>
        </form>
      )}
    </details>
  );
}
