import { runGermany } from "./start-germany.mjs";

// With no arguments this is a read-only AMP App Name entry, never a migration.
try {
  const args = process.argv.slice(2);
  const preview = !args.length || args[0] === "facilities-preview";
  if (preview)
    console.log(
      "Schreibfreie Standortprüfung. Die Ausgabe zeigt Vorschläge und Konflikte; es wird keine Wache zugeordnet.",
    );
  const code = await runGermany({ maintenanceArgs: args });
  if (preview && code === 0)
    console.log(
      "Standortprüfung beendet. Bericht prüfen: ready=true erlaubt die gesicherte Migration; ready=false benötigt geklärte Zuordnungen. Dies war ein Wartungslauf, der Spielserver wurde nicht gestartet. Anleitung: docs/STANDORTE.md.",
    );
  process.exit(code);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
