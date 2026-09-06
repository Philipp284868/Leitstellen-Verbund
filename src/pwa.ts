import { flushSave, notice } from "./store";
export async function updateApplication() {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) {
    notice("Offline-Installation ist in diesem Browser noch nicht verfügbar.");
    return;
  }
  await registration.update();
  const worker = registration.installing;
  if (worker)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 15000);
      worker.addEventListener("statechange", () => {
        if (["installed", "redundant"].includes(worker.state)) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  if (registration.waiting) {
    await flushSave();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
    registration.waiting.postMessage({ type: "ACTIVATE" });
  } else notice("Updateprüfung abgeschlossen. Kein wartendes Update.");
}
