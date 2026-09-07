import type { AidRequest } from "./simulation/organizations-schema";
import { audio } from "./audio/controller";
import { useSyncExternalStore } from "react";
import type { Building, Vehicle, Mission } from "./model";
import type { Point } from "./world";
import { command, sendChat } from "./store";
export interface Friend {
  id: string;
  name: string;
  status: string;
  buildings: Building[];
  vehicles: (Vehicle & { position: Point; eta: number; fms?: number })[];
  missions: Mission[];
  revision: number;
}
interface Contribution {
  peer: string;
  mission: string;
  round: string;
  assignment: string;
  vehicle: Vehicle;
  at: number;
}
export interface AidView extends AidRequest {
  ownerName: string;
  peerName: string;
  incident: { name: string; pos: Point; phase: string } | null;
}
let net = {
  requests: [] as AidView[],
  neighbors: [] as { id: string; name: string; online: boolean }[],
  friends: [] as Friend[],
  support: [] as Contribution[],
  chat: [] as { name: string; text: string }[],
};
const listeners = new Set<() => void>();
function update() {
  listeners.forEach((f) => f());
}
export function setNetwork(data: {
  friends: Friend[];
  support: Contribution[];
  requests?: AidView[];
  neighbors?: { id: string; name: string; online: boolean }[];
}) {
  net = { ...net, ...data };
  update();
}
export function resetNetwork() {
  net = { friends: [], support: [], chat: [], requests: [], neighbors: [] };
  update();
}
export function receiveChat(data: { name: string; text: string }) {
  audio.cue("radio");
  net = { ...net, chat: [...net.chat, data].slice(-100) };
  update();
}
export const useNetwork = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => net,
  );
export const chat = sendChat;
export const share = (id: string) => command({ type: "share", id });
export const stopSharing = (id: string) => command({ type: "unshare", id });
export const support = (peer: string, mission: Mission, vehicle: string) =>
  command({
    type: "support",
    peer,
    mission: mission.id,
    round: mission.round,
    vehicle,
  });
