import { useState } from "react";
import { Radio } from "lucide-react";
import { api, login, logout, useGame, emit } from "./store";
export function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="start-screen">
      <Radio size={44} />
      <span className="eyebrow">DEIN SERVER · DEINE LEITSTELLE</span>
      <h1>LEITSTELLEN<br /><em>VERBUND</em></h1>
      <p>Gemeinsam disponieren. Eigener Besitz. Die Simulation läuft auf dem Server weiter.</p>
      <form className="start-actions" onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await login(register ? { username, password, name, station } : { username, password }, register);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.");
        } finally { setBusy(false); }
      }}>
        <label>Benutzername
          <input autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>Passwort
          <input type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {register && <>
          <label>Dein Anzeigename
            <input required maxLength={48} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>Name deiner Leitstelle
            <input required maxLength={48} value={station} onChange={(e) => setStation(e.target.value)} />
          </label>
          <small>Benutzername: 3–32 Zeichen, Buchstaben, Ziffern, _ oder -. Passwort: 12–128 Zeichen. Jedes neue Konto ist ein normales Spielerkonto.</small>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy} className="primary">{busy ? "Bitte warten …" : register ? "Konto erstellen" : "Anmelden"}</button>
        <button disabled={busy} type="button" onClick={() => { setRegister(!register); setError(""); }}>
          {register ? "Zur Anmeldung" : "Neues Konto erstellen"}
        </button>
      </form>
      <small>Jeder kann ein eigenes Spielerkonto erstellen. Kein Einladungscode und kein externes Konto erforderlich. Ohne Serververbindung sind keine Spielaktionen möglich.</small>
    </main>
  );
}
export function Account() {
  const { user } = useGame();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const fail = (e: unknown) => emit({ error: e instanceof Error ? e.message : "Kontofunktion fehlgeschlagen." });
  return <section>
    <h3>Konto: {user?.username}</h3>
    <div className="inline">
      <button onClick={() => void logout().catch(fail)}>Abmelden</button>
      <button onClick={() => void logout(true).catch(fail)}>Alle Sitzungen abmelden</button>
    </div>
    <form onSubmit={async (e) => {
      e.preventDefault();
      try { await api("password", { current, password }); location.reload(); }
      catch (e) { fail(e); }
    }}>
      <label>Aktuelles Passwort
        <input type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>Neues Passwort
        <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button>Passwort ändern und Sitzungen widerrufen</button>
    </form>
    <p>Alle Konten sind normale Spieler. Wachen, Fahrzeuge und Fortschritt gehören weiterhin ausschließlich dem jeweiligen Konto.</p>
  </section>;
}
