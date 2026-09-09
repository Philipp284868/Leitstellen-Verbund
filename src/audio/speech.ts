/** Only installed German voices are eligible. Never fall back to a remote service. */
export function localGermanVoice() {
  if (typeof speechSynthesis === "undefined") return undefined;
  return speechSynthesis
    .getVoices()
    .find((v) => v.localService && /^de(?:-|$)/i.test(v.lang));
}
export function speakLocal(text: string, volume: number, done: () => void) {
  const voice = localGermanVoice();
  if (!voice || typeof SpeechSynthesisUtterance === "undefined") return null;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 1.06;
  utterance.volume = Math.max(0, Math.min(1, volume));
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    done();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  try {
    speechSynthesis.speak(utterance);
  } catch {
    queueMicrotask(finish);
  }
  return {
    stop() {
      ended = true;
      utterance.onend = utterance.onerror = null;
      speechSynthesis.cancel();
    },
    volume(value: number) {
      utterance.volume = Math.max(0, Math.min(1, value));
    },
  };
}
