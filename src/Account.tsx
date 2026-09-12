import { BrandMark } from "./BrandMark";
import { AccountLifecycleControls } from "./AccountLifecycle";
import { useDialogDirty } from "./dialog-state";
import { ConfirmAction } from "./ui";
import "./Account.css";
import { useState, useEffect, useRef } from "react";

import { api, login, logout, useGame, refresh } from "./store";
export function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [connection, setConnection] = useState("Server wird geprüft …");
  const [check, setCheck] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/health", { signal: request.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw Error("Server meldet einen Betriebsfehler");
        setConnection("Server erreichbar");
      })
      .catch(() => {
        if (!request.signal.aborted)
          setConnection("Verbindung nicht verfügbar");
      });
    return () => request.abort();
  }, [check]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [station, setStation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="auth-screen command-hud">
      <section className="auth-brand">
        <div className="auth-mark">
          <BrandMark />
        </div>
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
        <div className="auth-principles">
          <article>
            <b>Deine Leitstelle</b>
            <p>
              Eigene Wachen, Fahrzeugflotte und Budget. Personal wird am
              Standort automatisch bereitgestellt.
            </p>
          </article>
          <article>
            <b>Gemeinsam disponieren</b>
            <p>
              Berechtigte Disponenten arbeiten in derselben Leitstelle. Andere
              Leitstellen helfen nach ausdrücklicher Freigabe.
            </p>
          </article>
          <article>
            <b>Schritt für Schritt</b>
            <p>Hilfe zur Bedienung findest du im Support. </p>
          </article>
        </div>
      </section>
      <section className="auth-card">
        <span className="eyebrow">Sicherer Zugang</span>
        <h2>{register ? "Leitstelle eröffnen" : "Willkommen zurück"}</h2>
        <div className="auth-connection">
          <span role="status">{connection}</span>
          <strong>{location.host}</strong>
          <button type="button" onClick={() => setCheck(check + 1)}>
            Verbindung prüfen
          </button>
        </div>
        <form
          className="start-actions"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await login(
                register
                  ? { username, password, name, station }
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
              <small>
                Benutzername: 3–32 Zeichen, Buchstaben, Ziffern, _ oder -.
                Passwort: 12–128 Zeichen. Jedes neue Konto ist ein normales
                Spielerkonto.
              </small>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="primary">
            {busy
              ? "Bitte warten …"
              : register
                ? "Konto erstellen"
                : "Anmelden"}
          </button>
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Zur Anmeldung" : "Neues Konto erstellen"}
          </button>
        </form>
        <small>
          Spielstände und Simulation werden auf diesem Server gespeichert.
          Geräte- und Audioeinstellungen bleiben in diesem Browser.
        </small>
      </section>
    </main>
  );
}
export function Account() {
  const { user, workspace } = useGame();
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    lock = useRef(false);
  useDialogDirty(!!current || !!password || !!repeat, undefined, busy);
  return (
    <section className="account-view">
      <p className="view-intro">
        Dein Zugang zu {location.host}. Sitzungen und Passwort werden auf dem
        Server verwaltet.
      </p>
      <div className="resource-summary">
        <div>
          <small>Benutzername</small>
          <strong>{user?.username}</strong>
        </div>
        <div>
          <small>Kontorolle</small>
          <strong>
            {user?.role === "admin" ? "Administrator" : "Spieler"}
          </strong>
        </div>
        <div>
          <small>Aktive Leitstelle</small>
          <strong>
            {workspace?.canManage
              ? "Eigene Leitstelle"
              : "Berechtigter Disponent"}
          </strong>
        </div>
      </div>
      <h3>Passwort ändern</h3>
      <p>
        Nach erfolgreicher Änderung werden alle Sitzungen dieses Kontos
        widerrufen. Du meldest dich anschließend mit dem neuen Passwort an.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (lock.current || password !== repeat) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await api("password", { current, password });
            setCurrent("");
            setPassword("");
            setRepeat("");
            await refresh();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Passwort konnte nicht geändert werden.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="account-fields">
          <label>
            Aktuelles Passwort
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              maxLength={128}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            Neues Passwort
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Neues Passwort wiederholen
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          {repeat && repeat !== password && (
            <p role="alert" className="error">
              Die neuen Passwörter stimmen noch nicht überein.
            </p>
          )}
          <button className="primary" disabled={busy || password !== repeat}>
            {busy
              ? "Passwort wird geändert …"
              : "Passwort ändern und Sitzungen widerrufen"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <AccountLifecycleControls />
      <h3>Sitzungen</h3>
      <div className="inline">
        <ConfirmAction
          message="Diese Sitzung beenden? Die Simulation läuft weiter."
          onConfirm={() => logout()}
        >
          Abmelden
        </ConfirmAction>
        <ConfirmAction
          message="Alle Browser und Geräte dieses Kontos abmelden?"
          onConfirm={() => logout(true)}
        >
          Alle Sitzungen abmelden
        </ConfirmAction>
      </div>
      <p>
        {user?.role === "admin"
          ? "Die Administratorrolle erlaubt die dokumentierten Serververwaltungsbefehle. Spielaktionen respektieren weiterhin die Leitstellenberechtigungen."
          : "Berechtigungen zur gemeinsamen Disposition werden im Leitstellenverbund verwaltet. Besitz und Budget bleiben der jeweiligen Leitstelle zugeordnet."}
      </p>
    </section>
  );
}
