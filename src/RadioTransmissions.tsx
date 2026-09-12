import type { Save } from "./model";
export function RadioTransmissions({ s }: { s: Save }) {
  return (
    <section className="radio-transmissions">
      <h3>Textfunk</h3>
      {(s.radioNetwork?.entries ?? [])
        .filter((e) => e.state !== "queued")
        .slice(-100)
        .reverse()
        .map((e) => (
          <article key={e.id}>
            <b>{e.sender}</b>
            <p>{e.text}</p>
          </article>
        ))}
    </section>
  );
}
