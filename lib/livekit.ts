import "server-only";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

// In-app calls run on LiveKit (LiveKit Cloud, or a self-hosted LiveKit server).
// Set LIVEKIT_URL (wss://…), LIVEKIT_API_KEY and LIVEKIT_API_SECRET to turn them on.

export function callsConfigured() {
  return !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

export const roomName = (meetingId: string) => `meeting-${meetingId}`;

export async function joinToken(meetingId: string, user: { id: string; name: string }) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: user.id, name: user.name, ttl: "6h" });
  at.addGrant({ room: roomName(meetingId), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return { url: process.env.LIVEKIT_URL!, token: await at.toJwt() };
}

// Disconnects everyone. Best effort: the call is marked ended either way, and a room
// that's already gone (or a LiveKit hiccup) mustn't stop anyone writing the notes.
export async function closeRoom(meetingId: string) {
  if (!callsConfigured()) return;
  const host = process.env.LIVEKIT_URL!.replace(/^ws(s?):\/\//, "http$1://");
  try {
    await new RoomServiceClient(host, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).deleteRoom(roomName(meetingId));
  } catch (err) {
    if (!/not found|404/i.test(String(err))) console.warn("LiveKit: couldn't close the room", err);
  }
}
