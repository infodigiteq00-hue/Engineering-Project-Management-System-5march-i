// =====================================================
// NOTIFICATION READS CONTEXT
// Tracks "last seen" per user for projects, equipment, documents.
// Shows notification badge until user has viewed the tab or entity.
// =====================================================

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_PREFIX = "notification_reads_";

export type NotificationTabKey = "projects" | "standalone_equipment" | "certificates" | "tasks";

export interface NotificationReadsState {
  /** key -> timestamp (ms). Keys: 'projects' | 'standalone_equipment' | `project_${id}` | `equipment_${id}` */
  lastSeen: Record<string, number>;
}

interface NotificationReadsContextType {
  /** Get last seen timestamp for a key (tab or entity). Returns 0 if never seen. */
  getLastSeen: (key: string) => number;
  /** Mark a tab or entity as seen (now). Persists to localStorage. */
  markAsSeen: (key: string) => void;
  /** Number of items in the list that have been updated after the user's last seen for this tab/entity. */
  getUnreadCount: (tabKey: string, items: Array<{ id: string; updated_at?: string | null; last_update?: string | null }>) => number;
  /** Whether there is at least one unread update for the given tab key and items. */
  hasUnread: (tabKey: string, items: Array<{ id: string; updated_at?: string | null; last_update?: string | null }>) => boolean;
  /** Force re-read from localStorage (e.g. after login). */
  refresh: () => void;
}

const NotificationReadsContext = createContext<NotificationReadsContextType | undefined>(undefined);

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function loadState(userId: string | null): Record<string, number> {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveState(userId: string | null, lastSeen: Record<string, number>): void {
  if (!userId) return;
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(lastSeen));
  } catch {
    // ignore
  }
}

function getUpdatedAt(item: {
  updated_at?: string | null;
  last_update?: string | null;
}): number {
  const u = item.updated_at || item.last_update;
  if (!u) return 0;
  const t = new Date(u).getTime();
  return isNaN(t) ? 0 : t;
}

export function NotificationReadsProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string | null;
}) {
  const [lastSeen, setLastSeen] = useState<Record<string, number>>(() => loadState(userId));

  const refresh = useCallback(() => {
    setLastSeen(loadState(userId));
  }, [userId]);

  const getLastSeen = useCallback(
    (key: string): number => {
      return lastSeen[key] ?? 0;
    },
    [lastSeen]
  );

  const markAsSeen = useCallback(
    (key: string) => {
      const now = Date.now();
      setLastSeen((prev) => {
        const next = { ...prev, [key]: now };
        saveState(userId, next);
        return next;
      });
    },
    [userId]
  );

  const getUnreadCount = useCallback(
    (
      tabKey: string,
      items: Array<{
        id: string;
        updated_at?: string | null;
        last_update?: string | null;
      }>
    ): number => {
      const seenAt = lastSeen[tabKey] ?? 0;
      let count = 0;
      for (const item of items) {
        const updatedAt = getUpdatedAt(item);
        if (updatedAt > seenAt) count += 1;
      }
      return count;
    },
    [lastSeen]
  );

  const hasUnread = useCallback(
    (
      tabKey: string,
      items: Array<{
        id: string;
        updated_at?: string | null;
        last_update?: string | null;
      }>
    ): boolean => {
      return getUnreadCount(tabKey, items) > 0;
    },
    [getUnreadCount]
  );

  const value = useMemo<NotificationReadsContextType>(
    () => ({
      getLastSeen,
      markAsSeen,
      getUnreadCount,
      hasUnread,
      refresh,
    }),
    [getLastSeen, markAsSeen, getUnreadCount, hasUnread, refresh]
  );

  // When userId changes (e.g. login), reload from storage
  React.useEffect(() => {
    setLastSeen(loadState(userId));
  }, [userId]);

  return (
    <NotificationReadsContext.Provider value={value}>
      {children}
    </NotificationReadsContext.Provider>
  );
}

export function useNotificationReads(): NotificationReadsContextType {
  const ctx = useContext(NotificationReadsContext);
  if (ctx === undefined) {
    throw new Error("useNotificationReads must be used within NotificationReadsProvider");
  }
  return ctx;
}

/** Helper: check if a single entity (project or equipment) is unread for the current user. */
export function useIsEntityUnread(
  entityKey: string,
  updatedAt: string | null | undefined
): boolean {
  const { getLastSeen } = useNotificationReads();
  const lastSeen = getLastSeen(entityKey);
  const ts = updatedAt ? new Date(updatedAt).getTime() : 0;
  return ts > 0 && ts > lastSeen;
}

/** Small unread indicator dot for project/equipment/document cards. Use inside NotificationReadsProvider. Green = new updates. */
export function UnreadEntityDot({
  entityKey,
  updatedAt,
  className = "",
}: {
  entityKey: string;
  updatedAt: string | null | undefined;
  className?: string;
}) {
  const isUnread = useIsEntityUnread(entityKey, updatedAt);
  if (!isUnread) return null;
  return (
    <span className={`relative flex h-2 w-2 shrink-0 ${className}`} title="New updates">
      <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
    </span>
  );
}

/** Subtle dot for sub-tabs (e.g. Overview, Technical, Docs). No ping, smaller – use on tab labels. */
export function UnreadTabDot({
  entityKey,
  updatedAt,
  className = "",
}: {
  entityKey: string;
  updatedAt: string | null | undefined;
  className?: string;
}) {
  const isUnread = useIsEntityUnread(entityKey, updatedAt);
  if (!isUnread) return null;
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full bg-green-500 shrink-0 ml-0.5 align-middle ${className}`} title="New updates in this tab" />
  );
}
