import { useState } from "react";
import { Radio } from "lucide-react";
import { api, login, logout, useGame, emit } from "./store";
export function AuthScreen() {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [station, setStation] = useState(""),
    [invite, setInvite] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="start-screen">
      <Radio size={44} />
      <span className="eyebrow">DEIN SERVER · DEINE LEITSTELLE</span>
      <h1>
        LEITSTELLEN
        <br />
        <em>VERBUND</em>
      </h1>
      <p>
        Gemeinsam disponieren. Eigener Besitz. Die Simulation läuft auf dem
        Server weiter.
      </p>
      <form
        className="start-actions"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await login(
              register
                ? { username, password, name, station, invite }
                : { username, password },
              register,
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Benutzername
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Passwort
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {register && (
          <>
            <label>
              Einladungscode
              <input
                required
                value={invite}
                maxLength={100}
                onChange={(e) => setInvite(e.target.value)}
              />
            </label>
            <label>
              Dein Anzeigename
              <input
                required
                maxLength={48}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Name deiner Leitstelle
              <input
                required
                maxLength={48}
                value={station}
                onChange={(e) => setStation(e.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary">
          {busy ? "Bitte warten …" : register ? "Konto erstellen" : "Anmelden"}
        </button>
        <button type="button" onClick={() => setRegister(!register)}>
          {register ? "Zur Anmeldung" : "Mit Einladung registrieren"}
        </button>
      </form>
      <small>
        Registrierung nur mit Einladung. Kein externer Login. Ohne
        Serververbindung sind keine Spielaktionen möglich.
      </small>
    </main>
  );
}
export function Account() {
  const { user } = useGame();
  const [invite, setInvite] = useState(""),
    [message, setMessage] = useState(""),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState("");
  const fail = (e: unknown) =>
    emit({
      error: e instanceof Error ? e.message : "Kontofunktion fehlgeschlagen.",
    });
  return (
    <section>
      <h3>Konto: {user?.username}</h3>
      <div className="inline">
        <button onClick={() => void logout().catch(fail)}>Abmelden</button>
        <button onClick={() => void logout(true).catch(fail)}>
          Alle Sitzungen abmelden
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("password", { current, password });
            location.reload();
          } catch (e) {
            fail(e);
          }
        }}
      >
        <label>
          Aktuelles Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button>Passwort ändern und Sitzungen widerrufen</button>
      </form>
      {user?.role === "admin" && (
        <>
          <h3>Serververwaltung</h3>
          <button
            onClick={() =>
              void api("admin/invite", {})
                .then((r) => setInvite(r.invite))
                .catch(fail)
            }
          >
            Einladung erstellen
          </button>
          {invite && (
            <label>
              Einladungscode (einmalig, drei Tage)
              <textarea readOnly value={invite} />
            </label>
          )}
          <button
            onClick={() =>
              void api("admin/backup", {})
                .then((r) =>
                  setMessage(
                    `Konsistente Datenbanksicherung erstellt: ${r.file}`,
                  ),
                )
                .catch(fail)
            }
          >
            Datenbanksicherung erstellen
          </button>
          <p role="status">{message}</p>
          <p>
            Wiederherstellung und Übernahme alter Browserdaten erfolgen nach
            Serverstopp über die dokumentierten Administrationsbefehle.
          </p>
        </>
      )}
    </section>
  );
}
