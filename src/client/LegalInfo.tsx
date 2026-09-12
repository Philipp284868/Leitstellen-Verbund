export function LegalInfo() {
  return (
    <details className="legal-info">
      <summary>Datenschutz & Quellen/Lizenzen</summary>
      <p>
        Der verbundene Server verarbeitet Konten, geschützte Sitzungen,
        Spielstände, Spielaktionen und Betriebsdiagnosen. Öffentliche
        Spielstatistiken erscheinen im Leaderboard. Browserpräferenzen und
        ausdrücklich gespeicherte Berichts-Entwürfe bleiben lokal. Ohne aktiven
        Spieleinstieg werden keine neuen Notrufe erzeugt.
      </p>
      <p>
        Nur bewusst bestätigte Fehlerberichte werden öffentlich im
        GitHub-Projekt veröffentlicht. Bereinigte Berichtsvorschauen bleiben
        höchstens 30 Tage auf diesem Server; GitHub-Issues haben eine eigene
        Aufbewahrung. Name, Adresse oder andere persönliche Angaben im Freitext
        vor Veröffentlichung selbst prüfen. Automatische Redaktion erkennt nicht
        jede persönliche Angabe. Betrieb, Rechtsgrundlagen, Kontakt,
        Aufbewahrung und Löschung der übrigen Serverdaten bestimmt der jeweilige
        Betreiber.
      </p>
      <p>
        Lokale Karte: © OpenStreetMap-Mitwirkende (ODbL), OpenMapTiles (CC BY /
        BSD). Höhenmodell, falls installiert: Copernicus DEM gemäß Datenpaket.
        React/MIT, Lucide/ISC, MapLibre GL/BSD, Socket.IO/MIT. Musik und
        Signale: eigene lokale Klangerzeugung, keine echten Notrufaufnahmen.
      </p>
      <p>
        <a
          href="https://github.com/Philipp284868/Leitstellen-Verbund/blob/main/docs/LIZENZEN.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vollständige Quellen- und Lizenzliste
        </a>{" "}
        ·{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap-Lizenz
        </a>
      </p>
    </details>
  );
}
