import type { Socket } from "socket.io-client";

/** An active socket already owns its handshake or automatic reconnection.
 * Calling connect again before its namespace acknowledgement can send a second
 * CONNECT packet and make the server close the otherwise valid connection. */
export function ensureSocketConnection(socket: Socket | null) {
  if (socket && !socket.active) socket.connect();
}
