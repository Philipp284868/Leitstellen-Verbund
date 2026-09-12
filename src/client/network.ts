import type { AidRequest } from "../simulation/organizations-schema";
import { audio } from "./audio/controller";
import { useSyncExternalStore } from "react";
import { subscription } from "./external-store";
import type { Building, Vehicle, Mission } from "../shared/model";
import type { Point } from "../shared/world";
import { command, sendChat } from "./store";
import { WORLD } from "../shared/world";
import { PresenceDecoder, type PublicPlayer } from "../shared/presence";
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
export interface PublicAlarm {
  id: string;
  name: string;
  phase: "mobilizing" | "ready";
  started: number;
  stations: number;
}
let net = {
  alarms: [] as PublicAlarm[],
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
  alarms?: PublicAlarm[];
  friends: Friend[];
  support: Contribution[];
  requests?: AidView[];
  neighbors?: { id: string; name: string; online: boolean }[];
}) {
  net = { ...net, ...data };
  update();
}
export function resetNetwork() {
  net = {
    friends: [],
    support: [],
    chat: [],
    requests: [],
    neighbors: [],
    alarms: [],
  };
  update();
}
export function receiveChat(data: { name: string; text: string }) {
  audio.cue("radio");
  net = { ...net, chat: [...net.chat, data].slice(-100) };
  update();
}
const subscribeNetwork = subscription(listeners);
const networkSnapshot = () => net;
export const useNetwork = () =>
  useSyncExternalStore(subscribeNetwork, networkSnapshot);
const presenceDecoder = new PresenceDecoder(WORLD);
const presenceListeners = new Set<() => void>();
let presence = {
  players: [] as PublicPlayer[],
  connected: false,
  ready: false,
  revision: -1,
};
function updatePresence(next: typeof presence) {
  presence = next;
  presenceListeners.forEach((listener) => listener());
}
export function presenceConnection(connected: boolean) {
  presenceDecoder.reset();
  updatePresence({ ...presence, connected, ready: false });
}
export function resetPresence() {
  presenceDecoder.reset();
  updatePresence({ players: [], connected: false, ready: false, revision: -1 });
}
export function receivePresence(frame: unknown) {
  try {
    const decoded = presenceDecoder.decode(frame);
    if (decoded) updatePresence({ ...decoded, connected: true, ready: true });
    return true;
  } catch {
    presenceDecoder.reset();
    updatePresence({ ...presence, ready: false });
    return false;
  }
}
const subscribePresence = subscription(presenceListeners);
const presenceSnapshot = () => presence;
export const usePresence = () =>
  useSyncExternalStore(subscribePresence, presenceSnapshot);
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
