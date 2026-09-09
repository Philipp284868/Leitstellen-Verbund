import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { afterEach, expect, it } from "vitest";
import { ensureSocketConnection } from "../src/socket-connection";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

async function connection() {
  const http = createServer(),
    server = new Server(http),
    pendingAuth: ((data: object) => void)[] = [],
    state = { connectPackets: 0, connections: 0, disconnects: 0 };
  server.engine.on("connection", (transport) => {
    transport.on("packet", (packet: { type: string; data?: unknown }) => {
      if (
        packet.type === "message" &&
        typeof packet.data === "string" &&
        packet.data.startsWith("0")
      )
        state.connectPackets++;
    });
  });
  server.on("connection", (peer) => {
    state.connections++;
    peer.on("probe", (ack) => ack("connected"));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const socket = io(
    `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
      // Hold the real namespace handshake after the transport opens. This makes
      // overlapping online/retry requests deterministic without a timing sleep.
      auth: (send) => pendingAuth.push(send),
    },
  );
  socket.on("disconnect", () => state.disconnects++);
  cleanup.push(async () => {
    socket.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { socket, state, pendingAuth };
}

function event(socket: Socket, name: "connect" | "disconnect") {
  return new Promise<void>((resolve) => socket.once(name, () => resolve()));
}

it("reproduziert den echten Transportabbruch durch zwei überlappende ungeschützte Namespace-Handshakes", async () => {
  const f = await connection();
  f.socket.connect();
  await expect.poll(() => f.pendingAuth.length).toBe(1);
  expect(f.socket.active).toBe(true);
  expect(f.socket.connected).toBe(false);
  // Former online/retry behavior while the first acknowledgement is pending.
  f.socket.connect();
  expect(f.pendingAuth).toHaveLength(2);
  const connected = event(f.socket, "connect");
  f.pendingAuth[0]({});
  await connected;
  expect(await f.socket.timeout(1000).emitWithAck("probe")).toBe("connected");
  const disconnected = event(f.socket, "disconnect");
  f.pendingAuth[1]({});
  await disconnected;
  expect(f.state).toEqual({
    connectPackets: 2,
    connections: 1,
    disconnects: 1,
  });
  expect(f.socket.connected).toBe(false);
});

it("verbindet bei überlappenden Online-/Retry-Anfragen genau einmal und nach explizitem Offline erneut", async () => {
  const f = await connection();
  ensureSocketConnection(f.socket);
  await expect.poll(() => f.pendingAuth.length).toBe(1);
  ensureSocketConnection(f.socket);
  ensureSocketConnection(f.socket);
  expect(f.pendingAuth).toHaveLength(1);
  let connected = event(f.socket, "connect");
  f.pendingAuth[0]({});
  await connected;
  ensureSocketConnection(f.socket);
  expect(await f.socket.timeout(1000).emitWithAck("probe")).toBe("connected");
  expect(f.state).toEqual({
    connectPackets: 1,
    connections: 1,
    disconnects: 0,
  });

  f.socket.disconnect();
  expect(f.socket.active).toBe(false);
  expect(f.socket.connected).toBe(false);
  ensureSocketConnection(f.socket);
  await expect.poll(() => f.pendingAuth.length).toBe(2);
  ensureSocketConnection(f.socket);
  ensureSocketConnection(f.socket);
  expect(f.pendingAuth).toHaveLength(2);
  connected = event(f.socket, "connect");
  f.pendingAuth[1]({});
  await connected;
  expect(await f.socket.timeout(1000).emitWithAck("probe")).toBe("connected");
  expect(f.state).toEqual({
    connectPackets: 2,
    connections: 2,
    disconnects: 1,
  });
});
