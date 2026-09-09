import type { Save, Mission } from "../model";
import { record } from "./events";
import {
  radioHandler,
  RADIO_LEASE_SECONDS,
  type RadioRequest,
} from "./radio-state";

export function assertRadioHandler(s: Save, r: RadioRequest, actor: string) {
  const handler = radioHandler(r, s.time);
  if (handler && handler.actor !== actor)
    throw Error(
      "Dieser Sprechwunsch wird bereits von einem anderen Disponenten bearbeitet.",
    );
}

export function reserveRadio(
  s: Save,
  m: Mission,
  r: RadioRequest,
  actor: string,
  release: boolean,
) {
  assertRadioHandler(s, r, actor);
  const handler = radioHandler(r, s.time);
  if (release) {
    if (!handler) return;
    delete r.handling;
    record(
      s,
      m,
      "RADIO_RELEASED",
      "Sprechwunsch zur Bearbeitung freigegeben.",
      actor,
      r.vehicle,
    );
  } else {
    if (handler) return;
    r.handling = { actor, until: s.time + RADIO_LEASE_SECONDS };
    record(
      s,
      m,
      "RADIO_CLAIMED",
      "Sprechwunsch für drei Minuten zur Bearbeitung übernommen.",
      actor,
      r.vehicle,
    );
  }
}
