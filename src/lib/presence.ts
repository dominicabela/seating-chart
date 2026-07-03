import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type Activity =
  | { kind: "guest"; guestId: Id<"guests"> }
  | { kind: "table"; tableId: Id<"tables"> };

export type Collaborator = {
  sessionId: string;
  name: string;
  color: string;
  canEdit: boolean;
  /** Epoch ms of this session's last heartbeat; used to age out ghosts. */
  lastSeen: number;
  activity?: Activity;
};

/** How often each session re-announces itself. */
const HEARTBEAT_MS = 5_000;
/** A session unseen for longer than this is treated as gone. */
const STALE_MS = 12_000;
/** How often we re-evaluate staleness even without new query data. */
const TICK_MS = 4_000;

const ADJECTIVES = [
  "Swift", "Gentle", "Sunny", "Clever", "Quiet", "Merry",
  "Bold", "Cozy", "Lucky", "Dapper", "Breezy", "Noble",
];
const ANIMALS = [
  "Fox", "Wren", "Otter", "Fawn", "Heron", "Dove",
  "Hare", "Lark", "Swan", "Finch", "Bee", "Sparrow",
];
const COLORS = [
  "#e11d48", "#d97706", "#059669", "#0284c7",
  "#7c3aed", "#db2777", "#4f46e5", "#0d9488",
];

type Identity = { sessionId: string; name: string; color: string };

/** Per-tab anonymous identity, stable across reloads via sessionStorage. */
function getIdentity(): Identity {
  const stored = sessionStorage.getItem("presence-identity");
  if (stored) {
    try {
      return JSON.parse(stored) as Identity;
    } catch {
      // fall through and regenerate
    }
  }
  const identity: Identity = {
    sessionId: crypto.randomUUID(),
    name: `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${
      ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
    }`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  sessionStorage.setItem("presence-identity", JSON.stringify(identity));
  return identity;
}

export type Presence = {
  /**
   * Other sessions on this project, excluding self and any whose last
   * heartbeat is older than STALE_MS (so disconnected peers disappear even
   * before the server garbage-collects their row).
   */
  others: Collaborator[];
  /** Report what this session is currently manipulating (null to clear). */
  setActivity: (activity: Activity | null) => void;
};

export function usePresence(code: string, enabled: boolean): Presence {
  const identity = useMemo(() => getIdentity(), []);
  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);
  const rows = useQuery(
    api.presence.list,
    enabled && code ? { code } : "skip",
  );

  const activityRef = useRef<Activity | null>(null);
  // Advancing clock so the staleness cutoff is re-evaluated on a timer, not
  // only when the presence query pushes new rows. Kept in state (rather than
  // Date.now() in render) so the memo below stays pure.
  const [now, setNow] = useState(() => Date.now());

  const send = useCallback(() => {
    if (!enabled || !code) return;
    heartbeat({
      code,
      sessionId: identity.sessionId,
      name: identity.name,
      color: identity.color,
      activity: activityRef.current ?? undefined,
    }).catch(() => {
      // Presence is best-effort; ignore transient failures.
    });
  }, [enabled, code, heartbeat, identity]);

  useEffect(() => {
    if (!enabled || !code) return;
    send();
    const interval = setInterval(send, HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      leave({ code, sessionId: identity.sessionId }).catch(() => {});
    };
  }, [enabled, code, send, leave, identity.sessionId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const setActivity = useCallback(
    (activity: Activity | null) => {
      activityRef.current = activity;
      send();
    },
    [send],
  );

  const others = useMemo(() => {
    if (!rows) return [];
    const cutoff = now - STALE_MS;
    return rows
      .filter(
        (row) => row.sessionId !== identity.sessionId && row.lastSeen > cutoff,
      )
      .map(({ sessionId, name, color, canEdit, lastSeen, activity }) => ({
        sessionId,
        name,
        color,
        canEdit,
        lastSeen,
        activity,
      }));
  }, [rows, identity.sessionId, now]);

  return { others, setActivity };
}
