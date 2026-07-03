import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Heart, Minus, Plus, Trash2, X } from "lucide-react";

import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { tableColor, TABLE_COLORS } from "@/lib/table-colors";
import { CATEGORY_LABEL, CATEGORY_BADGE_CLASS } from "@/lib/categories";
import type { EditorActions, RemoteTouch } from "./Editor";

type Table = Doc<"tables">;
type Guest = Doc<"guests">;

/** Grid cell size in px; tables snap to cells. */
export const CELL = 120;
/** Square footprint of a table node in px. */
export const NODE = 220;
/** Canvas inset matching table positioning. */
export const PADDING = 32;
const CIRCLE = 112;
const SEAT = 34;
/** Distance from table center to each seat center. */
const SEAT_RADIUS = CIRCLE / 2 + 32;

export function TableNode({
  table,
  guests,
  canEdit,
  scale = 1,
  actions,
  remoteTouch,
  remoteGuestTouch,
  hoveredGuestId,
  onSeatGuest,
}: {
  table: Table;
  guests: Guest[];
  canEdit: boolean;
  scale?: number;
  actions: EditorActions;
  remoteTouch?: RemoteTouch;
  remoteGuestTouch?: Map<string, RemoteTouch>;
  hoveredGuestId?: string | null;
  onSeatGuest?: (table: Table) => void;
}) {
  const isCouple = table.kind === "couple";
  const color = tableColor(isCouple ? "gold" : table.color);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `t:${table._id}`,
    data: { type: "table", tableId: table._id },
    disabled: !canEdit,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `d:${table._id}`,
    data: { type: "table-drop", tableId: table._id },
    disabled: isCouple,
  });

  const left = table.gridX * CELL + PADDING;
  const top = table.gridY * CELL + PADDING;

  return (
    <div
      ref={setDropRef}
      className={cn("absolute", isDragging && "z-30")}
      style={{
        left,
        top,
        width: NODE,
        height: NODE,
        transform: transform
          ? `translate3d(${transform.x / scale}px, ${transform.y / scale}px, 0)`
          : undefined,
      }}
    >
      {!isCouple &&
        Array.from({ length: table.capacity }).map((_, i) => {
          const angle = (i / table.capacity) * Math.PI * 2 - Math.PI / 2;
          const x = NODE / 2 + SEAT_RADIUS * Math.cos(angle);
          const y = NODE / 2 + SEAT_RADIUS * Math.sin(angle);
          const guest = guests[i];
          return guest ? (
            <SeatChip
              key={guest._id}
              guest={guest}
              x={x}
              y={y}
              labelOutside={y < NODE / 2}
              canEdit={canEdit}
              remote={remoteGuestTouch?.get(guest._id)}
              highlight={guest._id === hoveredGuestId}
              onRemove={() => actions.assignGuest(guest, null)}
            />
          ) : canEdit ? (
            <button
              key={`empty-${i}`}
              onClick={() => onSeatGuest?.(table)}
              title="Seat a guest"
              className="absolute flex items-center justify-center rounded-full border border-dashed border-border/80 bg-background/50 text-muted-foreground/50 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
              style={{
                left: x - SEAT / 2,
                top: y - SEAT / 2,
                width: SEAT,
                height: SEAT,
              }}
            >
              <Plus className="size-3.5" />
            </button>
          ) : (
            <div
              key={`empty-${i}`}
              className="absolute rounded-full border border-dashed border-border/80 bg-background/50"
              style={{
                left: x - SEAT / 2,
                top: y - SEAT / 2,
                width: SEAT,
                height: SEAT,
              }}
            />
          );
        })}

      <TableCircle
        table={table}
        guests={guests}
        color={color}
        isOver={isOver}
        isDragging={isDragging}
        canEdit={canEdit}
        actions={actions}
        dragProps={{ ...attributes, ...listeners }}
        setDragRef={setDragRef}
        remote={remoteTouch}
      />
    </div>
  );
}

function TableCircle({
  table,
  guests,
  color,
  isOver,
  isDragging,
  canEdit,
  actions,
  dragProps,
  setDragRef,
  remote,
}: {
  table: Table;
  guests: Guest[];
  color: { bg: string; border: string };
  isOver: boolean;
  isDragging: boolean;
  canEdit: boolean;
  actions: EditorActions;
  dragProps: Record<string, unknown>;
  setDragRef: (el: HTMLElement | null) => void;
  remote?: RemoteTouch;
}) {
  const isCouple = table.kind === "couple";
  // Suppress the click that fires right after a drag so the settings
  // popover only opens on a genuine click.
  const dragged = useRef(false);
  useEffect(() => {
    if (isDragging) dragged.current = true;
  }, [isDragging]);

  const circle = (
    <div
      ref={setDragRef}
      {...dragProps}
      onClickCapture={(e) => {
        if (dragged.current) {
          e.preventDefault();
          e.stopPropagation();
          dragged.current = false;
        }
      }}
      className={cn(
        "absolute flex touch-none flex-col items-center justify-center rounded-full shadow-xs transition-shadow select-none",
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isOver && "shadow-md ring-2 ring-primary",
      )}
      style={{
        left: NODE / 2 - CIRCLE / 2,
        top: NODE / 2 - CIRCLE / 2,
        width: CIRCLE,
        height: CIRCLE,
        background: color.bg,
        border: `1.5px solid ${color.border}`,
        ...(remote && { boxShadow: `0 0 0 2px ${remote.color}` }),
      }}
    >
      {remote && (
        <span
          className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-medium whitespace-nowrap text-white"
          style={{ background: remote.color }}
        >
          {remote.name}
        </span>
      )}
      {isCouple ? (
        <>
          <Heart className="mb-0.5 size-3.5 shrink-0 fill-rose-300 text-rose-300" />
          <span className="max-w-[88px] px-1 text-center text-[11px] leading-tight font-medium whitespace-normal">
            {table.label}
          </span>
        </>
      ) : (
        <>
          <span className="max-w-[80px] truncate px-1 text-center text-xs font-medium">
            {table.label}
          </span>
          <span
            className={cn(
              "mt-0.5 text-[10px] tabular-nums",
              guests.length >= table.capacity
                ? "font-medium text-amber-700"
                : "text-muted-foreground",
            )}
          >
            {guests.length}/{table.capacity}
          </span>
        </>
      )}
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger render={circle} />
      <TableDialog
        table={table}
        guests={guests}
        actions={actions}
        canEdit={canEdit}
      />
    </Dialog>
  );
}

function TableDialog({
  table,
  guests,
  actions,
  canEdit,
}: {
  table: Table;
  guests: Guest[];
  actions: EditorActions;
  canEdit: boolean;
}) {
  const [label, setLabel] = useState(table.label);
  const isCouple = table.kind === "couple";

  const sortedGuests = useMemo(
    () =>
      [...guests].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(
          `${b.lastName} ${b.firstName}`,
        ),
      ),
    [guests],
  );

  const commitLabel = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== table.label) {
      actions.updateTable(table, { label: trimmed });
    }
  };

  const emptySeats = isCouple ? 0 : Math.max(0, table.capacity - guests.length);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{table.label}</DialogTitle>
        <DialogDescription>
          {isCouple
            ? `${guests.length} seated`
            : `${guests.length}/${table.capacity} seated`}
          {emptySeats > 0 &&
            ` · ${emptySeats} empty ${emptySeats === 1 ? "seat" : "seats"}`}
        </DialogDescription>
      </DialogHeader>

      <ul className="-mx-1 max-h-64 overflow-y-auto">
        {sortedGuests.map((guest) => (
          <li
            key={guest._id}
            className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
          >
            <span className="min-w-0 truncate text-sm">
              {guest.firstName} {guest.lastName}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {guest.category && (
                <span className="text-[10px] text-muted-foreground">
                  {CATEGORY_LABEL[guest.category]}
                </span>
              )}
              {canEdit && (
                <button
                  onClick={() => actions.assignGuest(guest, null)}
                  className="hidden text-muted-foreground/60 group-hover:block hover:text-destructive"
                  title="Remove from table"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
        {sortedGuests.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            No guests seated yet
          </li>
        )}
      </ul>

      {canEdit && (
        <div className="flex flex-col gap-3 border-t pt-3">
        <div>
          <span className="text-xs text-muted-foreground">Table name</span>
          <Input
            className="mt-1"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === "Enter" && commitLabel()}
          />
        </div>

        {!isCouple && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Seats</span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={table.capacity <= Math.max(1, guests.length)}
                  onClick={() =>
                    actions.updateTable(table, {
                      capacity: table.capacity - 1,
                    })
                  }
                >
                  <Minus />
                </Button>
                <span className="w-6 text-center text-sm tabular-nums">
                  {table.capacity}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  disabled={table.capacity >= 16}
                  onClick={() =>
                    actions.updateTable(table, {
                      capacity: table.capacity + 1,
                    })
                  }
                >
                  <Plus />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Color</span>
              <div className="flex gap-1.5">
                {TABLE_COLORS.map((c) => (
                  <button
                    key={c.key}
                    title={c.label}
                    onClick={() => actions.updateTable(table, { color: c.key })}
                    className={cn(
                      "size-6 rounded-full border transition-transform hover:scale-110",
                      table.color === c.key &&
                        "ring-2 ring-primary ring-offset-1",
                    )}
                    style={{ background: c.swatch, borderColor: c.border }}
                  />
                ))}
              </div>
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => actions.removeTable(table)}
            >
              <Trash2 data-icon="inline-start" /> Remove table
            </Button>
          </>
        )}
        </div>
      )}
    </DialogContent>
  );
}

function SeatChip({
  guest,
  x,
  y,
  labelOutside,
  canEdit,
  remote,
  highlight,
  onRemove,
}: {
  guest: Guest;
  x: number;
  y: number;
  labelOutside: boolean;
  canEdit: boolean;
  remote?: RemoteTouch;
  highlight: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `seat:${guest._id}`,
    data: { type: "guest", guestId: guest._id },
    disabled: !canEdit,
  });

  const initials =
    `${guest.firstName.charAt(0)}${guest.lastName.charAt(0)}`.toUpperCase() ||
    "?";

  return (
    // No z-index on the root: the avatar (z-10) and name label (z-20) layer
    // within the table node, so labels always paint above neighboring avatars.
    <div
      className={cn("group absolute", isDragging && "opacity-40")}
      style={{ left: x - SEAT / 2, top: y - SEAT / 2, width: SEAT, height: SEAT }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              ref={setNodeRef}
              {...attributes}
              {...listeners}
              className={cn(
                "relative z-10 flex size-full touch-none items-center justify-center overflow-hidden rounded-full border text-[10px] font-semibold shadow-xs select-none",
                guest.category
                  ? CATEGORY_BADGE_CLASS[guest.category]
                  : "bg-card text-foreground/80",
                canEdit && "cursor-grab active:cursor-grabbing",
                highlight && "z-30",
              )}
              style={
                highlight
                  ? { boxShadow: "0 0 0 2px #39ff14, 0 0 8px #39ff14" }
                  : remote
                    ? { boxShadow: `0 0 0 2px ${remote.color}` }
                    : undefined
              }
            >
              {guest.single && (
                <span
                  className="pointer-events-none absolute inset-0 flex items-center justify-center text-[1.35rem] leading-none"
                  aria-hidden
                >
                  💘
                </span>
              )}
              {!guest.single && <span className="relative z-10">{initials}</span>}
            </div>
          }
        />
        <TooltipContent>
          {guest.firstName} {guest.lastName}
          {guest.category ? ` · ${CATEGORY_LABEL[guest.category]}` : ""}
          {guest.single ? " · Single" : ""}
        </TooltipContent>
      </Tooltip>
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 z-20 w-16 -translate-x-1/2 truncate text-center text-[9px] leading-tight",
          labelOutside ? "bottom-full mb-0.5" : "top-full mt-0.5",
          highlight ? "z-30 font-semibold" : "text-muted-foreground",
        )}
        style={highlight ? { color: "#39ff14" } : undefined}
      >
        {guest.firstName}
      </span>
      {canEdit && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 z-40 hidden size-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm group-hover:flex"
          title="Remove from table"
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  );
}
