import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Minus, Plus, Search } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { History } from "@/lib/history";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import type { Activity, Collaborator } from "@/lib/presence";
import { TableNode, CELL, NODE, PADDING } from "./TableNode";
import { Sidebar } from "./Sidebar";

type Table = Doc<"tables">;
type Guest = Doc<"guests">;

export type EditorActions = {
  assignGuest: (guest: Guest, tableId: Id<"tables"> | null) => void;
  swapGuests: (
    guest: Guest,
    swapWith: Guest,
    toTableId: Id<"tables">,
  ) => void;
  addGuest: (fields: {
    firstName: string;
    lastName: string;
    category?: Category;
  }) => void;
  removeGuest: (guest: Guest) => void;
  setGuestCategory: (guest: Guest, category: Category | null) => void;
  setGuestSingle: (guest: Guest, single: boolean) => void;
  moveTable: (table: Table, gridX: number, gridY: number) => void;
  updateTable: (
    table: Table,
    patch: { label?: string; capacity?: number; color?: string },
  ) => void;
  addTable: () => void;
  removeTable: (table: Table) => void;
  autoSeat: () => void;
};

type SwapPrompt = {
  guest: Guest;
  toTable: Table;
};

/** Who (name + color) is currently touching a given guest/table. */
export type RemoteTouch = { name: string; color: string };

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function Editor({
  code,
  canEdit,
  tables,
  guests,
  history,
  collaborators = [],
  onActivity,
}: {
  code: string;
  canEdit: boolean;
  tables: Table[];
  guests: Guest[];
  history: History;
  collaborators?: Collaborator[];
  onActivity?: (activity: Activity | null) => void;
}) {
  const assignMut = useMutation(api.guests.assign);
  const restoreMut = useMutation(api.guests.restoreAssignments);
  const addGuestMut = useMutation(api.guests.add);
  const removeGuestMut = useMutation(api.guests.remove);
  const setCategoryMut = useMutation(api.guests.setCategory);
  const setSingleMut = useMutation(api.guests.setSingle);
  const moveTableMut = useMutation(api.tables.move);
  const updateTableMut = useMutation(api.tables.update);
  const addTableMut = useMutation(api.tables.add);
  const removeTableMut = useMutation(api.tables.remove);
  const autoSeatMut = useMutation(api.guests.autoSeat);

  const [activeGuest, setActiveGuest] = useState<Guest | null>(null);
  const [swapPrompt, setSwapPrompt] = useState<SwapPrompt | null>(null);
  const [hoveredGuestId, setHoveredGuestId] = useState<Id<"guests"> | null>(
    null,
  );
  const [seatPrompt, setSeatPrompt] = useState<Table | null>(null);
  const [draggingTable, setDraggingTable] = useState(false);

  // Latest server state, readable from history closures at undo time so we
  // can detect (and skip) reverts of changes another collaborator made since.
  const guestsRef = useRef(guests);
  const tablesRef = useRef(tables);
  useEffect(() => {
    guestsRef.current = guests;
    tablesRef.current = tables;
  }, [guests, tables]);

  const remoteGuestTouch = useMemo(() => {
    const map = new Map<string, RemoteTouch>();
    for (const c of collaborators) {
      if (c.activity?.kind === "guest") {
        map.set(c.activity.guestId, { name: c.name, color: c.color });
      }
    }
    return map;
  }, [collaborators]);

  const remoteTableTouch = useMemo(() => {
    const map = new Map<string, RemoteTouch>();
    for (const c of collaborators) {
      if (c.activity?.kind === "table") {
        map.set(c.activity.tableId, { name: c.name, color: c.color });
      }
    }
    return map;
  }, [collaborators]);

  const [scale, setScale] = useState(1);
  const scaleRef = useRef(scale);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  /** Zoom while keeping the given viewport-relative focal point stable. */
  const zoomTo = (next: number, focalX?: number, focalY?: number) => {
    const el = scrollRef.current;
    const current = scaleRef.current;
    const clamped = clampZoom(next);
    if (clamped === current || !el) {
      setScale(clamped);
      return;
    }
    const rect = el.getBoundingClientRect();
    const fx = focalX ?? rect.width / 2;
    const fy = focalY ?? rect.height / 2;
    const contentX = el.scrollLeft + fx;
    const contentY = el.scrollTop + fy;
    const ratio = clamped / current;
    setScale(clamped);
    requestAnimationFrame(() => {
      el.scrollLeft = contentX * ratio - fx;
      el.scrollTop = contentY * ratio - fy;
    });
  };

  // Cmd/Ctrl + wheel and trackpad pinch zoom (non-passive to allow preventDefault).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const current = scaleRef.current;
      zoomTo(
        current * (1 - e.deltaY * 0.0015),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const guestsByTable = useMemo(() => {
    const map = new Map<Id<"tables">, Guest[]>();
    for (const guest of guests) {
      if (!guest.tableId) continue;
      const list = map.get(guest.tableId) ?? [];
      list.push(guest);
      map.set(guest.tableId, list);
    }
    return map;
  }, [guests]);

  const run = (
    label: string,
    redo: () => Promise<void>,
    undo: () => Promise<void>,
  ) => {
    redo()
      .then(() => history.push({ label, undo, redo }))
      .catch((error: unknown) => console.error(`${label} failed`, error));
  };

  const actions: EditorActions = {
    assignGuest: (guest, tableId) => {
      const prev = guest.tableId ?? null;
      if (prev === tableId) return;
      run(
        "Move guest",
        async () => {
          const result = await assignMut({ code, guestId: guest._id, tableId });
          if (result === "full") {
            const toTable = tables.find((t) => t._id === tableId);
            if (toTable) setSwapPrompt({ guest, toTable });
            throw new Error("Table is full");
          }
        },
        async () => {
          // Skip if a collaborator has moved this guest since; undo should
          // only revert this session's own work.
          const current = guestsRef.current.find((g) => g._id === guest._id);
          if (!current || (current.tableId ?? null) !== tableId) return;
          await restoreMut({
            code,
            assignments: [{ guestId: guest._id, tableId: prev }],
          });
        },
      );
    },

    swapGuests: (guest, swapWith, toTableId) => {
      const prevGuest = guest.tableId ?? null;
      const prevOther = swapWith.tableId ?? null;
      run(
        "Swap guests",
        async () => {
          await assignMut({
            code,
            guestId: guest._id,
            tableId: toTableId,
            swapWithGuestId: swapWith._id,
          });
        },
        async () => {
          // Skip if either guest was moved again by someone else since.
          const a = guestsRef.current.find((g) => g._id === guest._id);
          const b = guestsRef.current.find((g) => g._id === swapWith._id);
          if (!a || !b) return;
          if ((a.tableId ?? null) !== toTableId) return;
          if ((b.tableId ?? null) !== prevGuest) return;
          await restoreMut({
            code,
            assignments: [
              { guestId: guest._id, tableId: prevGuest },
              { guestId: swapWith._id, tableId: prevOther },
            ],
          });
        },
      );
    },

    addGuest: (fields) => {
      let id: Id<"guests"> | null = null;
      run(
        "Add guest",
        async () => {
          id = await addGuestMut({ code, ...fields });
        },
        async () => {
          if (id) await removeGuestMut({ code, guestId: id });
        },
      );
    },

    removeGuest: (guest) => {
      let currentId = guest._id;
      run(
        "Remove guest",
        async () => {
          await removeGuestMut({ code, guestId: currentId });
        },
        async () => {
          currentId = await addGuestMut({
            code,
            firstName: guest.firstName,
            lastName: guest.lastName,
            category: guest.category,
            tableId: guest.tableId,
            single: guest.single,
          });
        },
      );
    },

    setGuestCategory: (guest, category) => {
      const prev = guest.category ?? null;
      if (prev === category) return;
      run(
        "Change category",
        async () => {
          await setCategoryMut({ code, guestId: guest._id, category });
        },
        async () => {
          // Skip if someone else recategorized this guest since.
          const current = guestsRef.current.find((g) => g._id === guest._id);
          if (!current || (current.category ?? null) !== category) return;
          await setCategoryMut({ code, guestId: guest._id, category: prev });
        },
      );
    },

    setGuestSingle: (guest, single) => {
      const prev = guest.single ?? false;
      if (prev === single) return;
      run(
        single ? "Tag single" : "Untag single",
        async () => {
          await setSingleMut({ code, guestId: guest._id, single });
        },
        async () => {
          // Skip if someone else changed this guest's single tag since.
          const current = guestsRef.current.find((g) => g._id === guest._id);
          if (!current || (current.single ?? false) !== single) return;
          await setSingleMut({ code, guestId: guest._id, single: prev });
        },
      );
    },

    moveTable: (table, gridX, gridY) => {
      const { gridX: prevX, gridY: prevY } = table;
      if (prevX === gridX && prevY === gridY) return;
      run(
        "Move table",
        async () => {
          await moveTableMut({ code, tableId: table._id, gridX, gridY });
        },
        async () => {
          // Skip if someone else moved this table since.
          const current = tablesRef.current.find((t) => t._id === table._id);
          if (!current || current.gridX !== gridX || current.gridY !== gridY)
            return;
          await moveTableMut({
            code,
            tableId: table._id,
            gridX: prevX,
            gridY: prevY,
          });
        },
      );
    },

    updateTable: (table, patch) => {
      const prev = {
        label: table.label,
        capacity: table.capacity,
        color: table.color,
      };
      run(
        "Edit table",
        async () => {
          await updateTableMut({ code, tableId: table._id, ...patch });
        },
        async () => {
          // Skip if someone else edited the same fields since.
          const current = tablesRef.current.find((t) => t._id === table._id);
          if (!current) return;
          for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
            if (current[key] !== patch[key]) return;
          }
          await updateTableMut({ code, tableId: table._id, ...prev });
        },
      );
    },

    addTable: () => {
      const spot = findFreeCell(tables);
      let id: Id<"tables"> | null = null;
      run(
        "Add table",
        async () => {
          id = await addTableMut({ code, gridX: spot.x, gridY: spot.y });
        },
        async () => {
          if (id) await removeTableMut({ code, tableId: id });
        },
      );
    },

    removeTable: (table) => {
      let currentId = table._id;
      const seatedIds = (guestsByTable.get(table._id) ?? []).map((g) => g._id);
      run(
        "Remove table",
        async () => {
          await removeTableMut({ code, tableId: currentId });
        },
        async () => {
          currentId = await addTableMut({
            code,
            gridX: table.gridX,
            gridY: table.gridY,
            label: table.label,
            capacity: table.capacity,
            color: table.color,
          });
          await restoreMut({
            code,
            assignments: seatedIds.map((guestId) => ({
              guestId,
              tableId: currentId,
            })),
          });
        },
      );
    },

    autoSeat: () => {
      const snapshot = guests.map((g) => ({
        guestId: g._id,
        tableId: g.tableId ?? null,
      }));
      run(
        "Auto-seat",
        async () => {
          await autoSeatMut({ code });
        },
        async () => {
          await restoreMut({ code, assignments: snapshot });
        },
      );
    },
  };

  const onDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "guest") {
      const guest = guests.find((g) => g._id === data.guestId);
      setActiveGuest(guest ?? null);
      if (guest) onActivity?.({ kind: "guest", guestId: guest._id });
    } else if (data?.type === "table") {
      setDraggingTable(true);
      onActivity?.({ kind: "table", tableId: data.tableId as Table["_id"] });
    }
  };

  const onDragCancel = () => {
    setActiveGuest(null);
    setDraggingTable(false);
    onActivity?.(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const data = event.active.data.current;
    setActiveGuest(null);
    setDraggingTable(false);
    onActivity?.(null);

    if (data?.type === "table") {
      const table = tables.find((t) => t._id === data.tableId);
      if (!table) return;
      const gridX = Math.max(
        0,
        Math.round((table.gridX * CELL + event.delta.x / scale) / CELL),
      );
      const gridY = Math.max(
        0,
        Math.round((table.gridY * CELL + event.delta.y / scale) / CELL),
      );
      const occupied = tables.some(
        (t) => t._id !== table._id && t.gridX === gridX && t.gridY === gridY,
      );
      if (!occupied) actions.moveTable(table, gridX, gridY);
      return;
    }

    if (data?.type !== "guest" || !event.over) return;
    const guest = guests.find((g) => g._id === data.guestId);
    if (!guest) return;

    const overData = event.over.data.current;
    if (overData?.type === "unassign") {
      if (guest.tableId) actions.assignGuest(guest, null);
      return;
    }
    if (overData?.type !== "table-drop") return;

    const toTable = tables.find((t) => t._id === overData.tableId);
    if (!toTable || toTable._id === guest.tableId) return;

    const occupancy = (guestsByTable.get(toTable._id) ?? []).length;
    if (occupancy >= toTable.capacity) {
      setSwapPrompt({ guest, toTable });
    } else {
      actions.assignGuest(guest, toTable._id);
    }
  };

  const canvasSize = useMemo(() => {
    const maxX = Math.max(0, ...tables.map((t) => t.gridX));
    const maxY = Math.max(0, ...tables.map((t) => t.gridY));
    return {
      width: maxX * CELL + NODE + 96,
      height: maxY * CELL + NODE + 96,
    };
  }, [tables]);

  const sortedTables = useMemo(
    () =>
      [...tables].sort((a, b) =>
        a.kind === b.kind
          ? a._creationTime - b._creationTime
          : a.kind === "couple"
            ? -1
            : 1,
      ),
    [tables],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            <div
              style={{
                width: canvasSize.width * scale,
                height: canvasSize.height * scale,
                minWidth: "100%",
                minHeight: "100%",
              }}
            >
              <div
                className="relative"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "0 0",
                  ...(draggingTable && {
                    backgroundImage: `
                      linear-gradient(to right, color-mix(in oklch, var(--border) 35%, transparent) 1px, transparent 1px),
                      linear-gradient(to bottom, color-mix(in oklch, var(--border) 35%, transparent) 1px, transparent 1px)
                    `,
                    backgroundSize: `${CELL}px ${CELL}px`,
                    // Offset so each table circle centers within a grid cell.
                    backgroundPosition: `${PADDING + (NODE - CELL) / 2}px ${PADDING + (NODE - CELL) / 2}px`,
                  }),
                }}
              >
                {sortedTables.map((table) => (
                  <TableNode
                    key={table._id}
                    table={table}
                    guests={guestsByTable.get(table._id) ?? []}
                    canEdit={canEdit}
                    scale={scale}
                    actions={actions}
                    remoteTouch={remoteTableTouch.get(table._id)}
                    remoteGuestTouch={remoteGuestTouch}
                    hoveredGuestId={hoveredGuestId}
                    onSeatGuest={setSeatPrompt}
                  />
                ))}
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="absolute bottom-4 left-4 z-10">
              <Button
                variant="outline"
                size="sm"
                className="shadow-sm"
                onClick={() => actions.addTable()}
              >
                <Plus data-icon="inline-start" /> Add table
              </Button>
            </div>
          )}

          <div className="absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={scale <= MIN_ZOOM}
              onClick={() => zoomTo(scale / 1.2)}
              title="Zoom out"
            >
              <Minus />
            </Button>
            <button
              className="min-w-11 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
              onClick={() => zoomTo(1)}
              title="Reset zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={scale >= MAX_ZOOM}
              onClick={() => zoomTo(scale * 1.2)}
              title="Zoom in"
            >
              <Plus />
            </Button>
          </div>
        </div>

        <Sidebar
          guests={guests}
          tables={tables}
          canEdit={canEdit}
          actions={actions}
          remoteGuestTouch={remoteGuestTouch}
          onHoverGuest={setHoveredGuestId}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeGuest && (
          <div className="pointer-events-none flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-md">
            {activeGuest.firstName} {activeGuest.lastName}
          </div>
        )}
      </DragOverlay>

      {seatPrompt && (
        <SeatGuestDialog
          table={seatPrompt}
          unseated={guests.filter((g) => !g.tableId)}
          onClose={() => setSeatPrompt(null)}
          onPick={(guest) => {
            actions.assignGuest(guest, seatPrompt._id);
            setSeatPrompt(null);
          }}
        />
      )}

      {swapPrompt && (
        <SwapDialog
          prompt={swapPrompt}
          seated={guestsByTable.get(swapPrompt.toTable._id) ?? []}
          onClose={() => setSwapPrompt(null)}
          onSwap={(swapWith) => {
            actions.swapGuests(
              swapPrompt.guest,
              swapWith,
              swapPrompt.toTable._id,
            );
            setSwapPrompt(null);
          }}
        />
      )}
    </DndContext>
  );
}

function SeatGuestDialog({
  table,
  unseated,
  onClose,
  onPick,
}: {
  table: Table;
  unseated: Guest[];
  onClose: () => void;
  onPick: (guest: Guest) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return unseated
      .filter(
        (g) =>
          !query ||
          `${g.firstName} ${g.lastName}`.toLowerCase().includes(query),
      )
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(
          `${b.lastName} ${b.firstName}`,
        ),
      );
  }, [unseated, search]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Seat a guest at {table.label}</DialogTitle>
          <DialogDescription>
            {unseated.length === 0
              ? "Everyone already has a seat."
              : "Pick an unseated guest for this spot."}
          </DialogDescription>
        </DialogHeader>

        {unseated.length > 0 && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search unseated guests"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length === 1) {
                    onPick(filtered[0]);
                  }
                }}
              />
            </div>
            <ul className="-mx-2 max-h-64 overflow-y-auto">
              {filtered.map((guest) => (
                <li key={guest._id}>
                  <button
                    onClick={() => onPick(guest)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate">
                      {guest.firstName} {guest.lastName}
                    </span>
                    {guest.category && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {CATEGORY_LABEL[guest.category]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No unseated guests match “{search}”
                </li>
              )}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({
  prompt,
  seated,
  onClose,
  onSwap,
}: {
  prompt: SwapPrompt;
  seated: Guest[];
  onClose: () => void;
  onSwap: (swapWith: Guest) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const items = seated.map((g) => ({
    value: g._id as string,
    label: `${g.firstName} ${g.lastName}`.trim(),
  }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.toTable.label} is full</DialogTitle>
          <DialogDescription>
            Choose someone to swap out for{" "}
            <span className="font-medium text-foreground">
              {prompt.guest.firstName} {prompt.guest.lastName}
            </span>
            , or undo the move.
          </DialogDescription>
        </DialogHeader>
        <Select
          items={items}
          value={selectedId}
          onValueChange={(v) => setSelectedId(v as string)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a guest to swap out" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Undo
          </Button>
          <Button
            disabled={!selectedId}
            onClick={() => {
              const swapWith = seated.find((g) => g._id === selectedId);
              if (swapWith) onSwap(swapWith);
            }}
          >
            Swap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findFreeCell(tables: Table[]): { x: number; y: number } {
  const occupied = new Set(tables.map((t) => `${t.gridX},${t.gridY}`));
  const step = 3;
  for (let y = 0; y < 100; y += step) {
    for (let x = 0; x < 12; x += step) {
      if (!occupied.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
