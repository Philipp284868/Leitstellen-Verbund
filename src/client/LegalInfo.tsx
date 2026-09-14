import { privacySections } from "../shared/player-privacy";
export function LegalInfo() {
  return (
    <details className="legal-info">
      <summary>Hinweise zur Datenverarbeitung</summary>
      {privacySections.map(([title, text]) => (
        <section key={title}>
          <h3>{title}</h3>
          <p>{text}</p>
        </section>
      ))}
      <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
        Datenschutz vollständig öffnen
      </a>
    </details>
  );
}
