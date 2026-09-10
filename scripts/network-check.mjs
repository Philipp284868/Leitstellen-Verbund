import { createServer } from "node:net";
export async function assertPortFree(host, port) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once("error", (error) =>
      reject(
        Error(
          `Spielport ${host}:${port}: ${error.code === "EADDRINUSE" ? "bereits belegt. AMP-Port und laufende Instanzen prüfen; kein Ausweichport." : error.code === "EACCES" ? "Berechtigung zum Binden fehlt." : error.code}`,
        ),
      ),
    );
    server.listen(port, host, () => server.close(done));
  });
}
