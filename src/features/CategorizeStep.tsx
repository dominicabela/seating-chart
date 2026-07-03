import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowLeft, Check, Users } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, type Category } from "@/lib/categories";

type Guest = Doc<"guests">;

type HistoryEntry = {
  guestIds: Id<"guests">[];
  previous: (Category | null)[];
};

export function CategorizeStep({
  code,
  guests,
  onDone,
}: {
  code: string;
  guests: Guest[];
  onDone: () => void;
}) {
  const setCategory = useMutation(api.guests.setCategory);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [splitKey, setSplitKey] = useState<string | null>(null);
  const [skippedIds, setSkippedIds] = useState<Id<"guests">[]>([]);
  const busy = useRef(false);

  const total = guests.length;
  const done = guests.filter((g) => g.category).length;

  // Uncategorized guests grouped by last name (alphabetical), with skipped
  // people pushed to the back of the queue so the next group surfaces.
  const groups = useMemo(() => {
    const buildGroups = (list: Guest[]) => {
      const map = new Map<string, Guest[]>();
      for (const guest of list) {
        const key = guest.lastName.trim().toLowerCase() || `~${guest._id}`;
        const group = map.get(key) ?? [];
        group.push(guest);
        map.set(key, group);
      }
      return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, members]) => ({ key, members }));
    };

    const skippedSet = new Set(skippedIds);
    const uncategorized = guests.filter((g) => !g.category);
    const pending = uncategorized.filter((g) => !skippedSet.has(g._id));
    const skipped = uncategorized.filter((g) => skippedSet.has(g._id));
    return [...buildGroups(pending), ...buildGroups(skipped)];
  }, [guests, skippedIds]);

  const currentGroup = groups[0] ?? null;
  const splitting = currentGroup !== null && currentGroup.key === splitKey;
  const currentUnit: Guest[] = currentGroup
    ? splitting
      ? [currentGroup.members[0]]
      : currentGroup.members
    : [];

  const assign = async (category: Category) => {
    if (busy.current || currentUnit.length === 0) return;
    busy.current = true;
    try {
      setHistory((h) => [
        ...h,
        {
          guestIds: currentUnit.map((g) => g._id),
          previous: currentUnit.map((g) => g.category ?? null),
        },
      ]);
      await Promise.all(
        currentUnit.map((guest) =>
          setCategory({ code, guestId: guest._id, category }),
        ),
      );
    } finally {
      busy.current = false;
    }
  };

  const skip = () => {
    if (currentUnit.length === 0) return;
    const ids = currentUnit.map((g) => g._id);
    const idSet = new Set(ids);
    setSplitKey(null);
    // Move the skipped people to the end of the skip queue so we advance.
    setSkippedIds((prev) => [...prev.filter((id) => !idSet.has(id)), ...ids]);
  };

  const back = async () => {
    const entry = history[history.length - 1];
    if (!entry || busy.current) return;
    busy.current = true;
    try {
      setHistory((h) => h.slice(0, -1));
      await Promise.all(
        entry.guestIds.map((guestId, i) =>
          setCategory({ code, guestId, category: entry.previous[i] }),
        ),
      );
    } finally {
      busy.current = false;
    }
  };

  // Number keys 1–7 pick a category.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < CATEGORIES.length) {
        event.preventDefault();
        void assign(CATEGORIES[index].value);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        void back();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!currentGroup) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100">
          <Check className="size-6 text-emerald-700" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Everyone is categorized
        </h2>
        <p className="text-sm text-muted-foreground">
          {total} guests ready to be seated.
        </p>
        <div className="flex gap-2">
          {history.length > 0 && (
            <Button variant="outline" onClick={() => void back()}>
              <ArrowLeft data-icon="inline-start" /> Back
            </Button>
          )}
          <Button onClick={onDone}>Continue to seating</Button>
        </div>
      </div>
    );
  }

  const displayName =
    currentUnit.length === 1
      ? `${currentUnit[0].firstName} ${currentUnit[0].lastName}`.trim()
      : `The ${currentGroup.members[0].lastName} party`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Categorizing guests</span>
            <span>
              {done} / {total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-semibold tracking-tight">
              {displayName}
            </h2>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {currentUnit.map((guest) => (
                <span
                  key={guest._id}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs"
                >
                  {guest.firstName} {guest.lastName}
                </span>
              ))}
            </div>
            {currentGroup.members.length > 1 && (
              <button
                onClick={() =>
                  setSplitKey(splitting ? null : currentGroup.key)
                }
                className="mt-2.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Users className="size-3" />
                {splitting
                  ? "Categorize the whole group together"
                  : "Categorize one person at a time"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((category, i) => (
              <button
                key={category.value}
                onClick={() => void assign(category.value)}
                className={cn(
                  "group flex items-center justify-between rounded-xl border bg-background px-4 py-3 text-left text-sm font-medium transition-all hover:border-primary hover:bg-primary/5 active:translate-y-px",
                  category.value === "wedding_party" && "col-span-2",
                )}
              >
                {category.label}
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground group-hover:border-primary/30">
                  {i + 1}
                </kbd>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={history.length === 0}
            onClick={() => void back()}
          >
            <ArrowLeft data-icon="inline-start" /> Back
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={skip}>
              {currentUnit.length === 1 ? "Skip person" : "Skip group"}
            </Button>
            <Button variant="outline" size="sm" onClick={onDone}>
              Go to seating
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
