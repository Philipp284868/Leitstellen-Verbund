import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import { App } from "./App";
import { start, state as gameState } from "./store";
import { BackupPanel } from "./Panels";
import { download } from "./storage";
import "./style.css";
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <h1>Die Leitstelle konnte nicht dargestellt werden.</h1>
        <p>
          Dein gespeicherter Stand bleibt erhalten. Lade die Anwendung neu und
          öffne bei Bedarf „Spielstand importieren“ für lokale Sicherungen.
        </p>
        <button onClick={() => location.reload()}>Neu laden</button>
        <BackupPanel s={gameState()} />
        <button
          onClick={() =>
            download(
              "leitstellen-diagnose.json",
              JSON.stringify({
                app: "leitstellen-verbund",
                renderError: true,
                hasConfirmedSave: !!gameState(),
              }),
            )
          }
        >
          Bereinigte Diagnose exportieren
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
start();
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
// Retire only this application's old offline worker. Never remove local save databases.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async registrations => {
    for (const registration of registrations) if (new URL(registration.scope).pathname === '/') await registration.unregister();
    for (const key of await caches.keys()) if (key.startsWith('leitstellen-verbund-')) await caches.delete(key);
  });
}
