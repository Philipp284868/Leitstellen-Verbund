import {
  fireProfileLabels,
  fireGameProfile,
  fireReadinessText,
  type FireProfile,
} from "../../shared/facilities/fire-profile";

export function FireProfileDetails({
  profile,
  pending = false,
}: {
  profile: FireProfile;
  pending?: boolean;
}) {
  const game = fireGameProfile(profile);
  return (
    <section aria-label="Belegtes Wachprofil" className="fire-profile-details">
      <strong>{fireProfileLabels[profile.kind]}</strong>
      <p>{fireReadinessText(profile)}</p>
      {pending && (
        <p role="status">
          Profilkorrektur vorgemerkt. Laufende Besatzungen bleiben bis zur
          sicheren Rückkehr erhalten.
        </p>
      )}
      {game && (
        <p>
          Abstrahiertes Spielprofil je Ausbaustufe: {game.slots} Stellplätze ·{" "}
          {game.people} Personen, davon {game.paid} diensthabend vor Ort.
          Vorbereitung {game.turnout} s plus tatsächliche Ankunft der
          freiwilligen Besatzung. Keine realen Personal- oder Garagenzahlen.
        </p>
      )}
      <details>
        <summary>Zuordnung, Einheiten und Quellen · {profile.checked}</summary>
        <p>{profile.reason}</p>
        <p>
          {profile.confidence === "official"
            ? "Offizielle Standortquelle"
            : profile.confidence === "osm"
              ? "OSM-Tags abgeglichen; keine amtliche Vollprüfung"
              : "Ungeklärter Datenbestand"}{" "}
          · Profil {profile.revision}
        </p>
        <ul>
          {profile.units.map((unit, index) => (
            <li key={index}>
              {unit.name} · {unit.kind.toUpperCase()}
            </li>
          ))}
        </ul>
        <ul>
          {profile.evidence.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {new URL(url).hostname} · Quelle öffnen
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
