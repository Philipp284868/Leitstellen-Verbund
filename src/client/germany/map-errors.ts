export function mapInitializationMessage(reason: unknown): string {
  const error = reason && typeof reason === "object" ? reason : null;
  const message = String(
    error && "message" in error ? error.message || reason : reason,
  );
  if (
    (error && "name" in error && error.name === "GPUInitializationError") ||
    /WebGL2 is required|Failed to initialize WebGL|Error creating WebGL context/i.test(
      message,
    )
  )
    return "Die Deutschlandkarte benötigt WebGL2. Die Grafikunterstützung konnte nicht gestartet werden. Prüfe die Hardwarebeschleunigung deines Browsers und den Grafiktreiber und starte den Browser danach neu.";
  return message;
}
