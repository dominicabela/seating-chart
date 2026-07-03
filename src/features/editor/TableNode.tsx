import { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Heart, Minus, Plus, Trash2, X } from "lucide-react";

import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { tableColor, TABLE_COLORS } from "@/lib/table-colors";
import { CATEGORY_LABEL } from "@/lib/categories";
import type { EditorActions } from "./Editor";

type Table = Doc<"tables">;
type Guest = Doc<"guests">;

/** Grid cell size in px; tables snap to cells. */
export const CELL = 100;
/** Square footprint of a table node in px. */
export const NODE = 180;
/** Canvas inset matching table positioning. */
export const PADDING = 24;
const CIRCLE = 100;
const SEAT = 32;
const SEAT_RADIUS = CIRCLE / 2 + 20;

export function TableNode({
  table,
  guests,
  canEdit,
  scale = 1,
  actions,
}: {
  table: Table;
  guests: Guest[];
  canEdit: boolean;
  scale?: number;
  actions: EditorActions;
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
              onRemove={() => actions.assignGuest(guest, null)}
            />
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
        canEdit && "cursor-grab active:cursor-grabbing",
        isOver && "shadow-md ring-2 ring-primary",
      )}
      style={{
        left: NODE / 2 - CIRCLE / 2,
        top: NODE / 2 - CIRCLE / 2,
        width: CIRCLE,
        height: CIRCLE,
        background: color.bg,
        border: `1.5px solid ${color.border}`,
      }}
    >
      {isCouple ? (
        <>
          <Heart className="mb-0.5 size-3.5 fill-rose-300 text-rose-300" />
          <span className="max-w-[80px] truncate px-1 text-center text-[11px] leading-tight font-medium">
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

  if (!canEdit) return circle;

  return (
    <Popover>
      <PopoverTrigger render={circle} />
      <TableSettings table={table} guests={guests} actions={actions} />
    </Popover>
  );
}

function TableSettings({
  table,
  guests,
  actions,
}: {
  table: Table;
  guests: Guest[];
  actions: EditorActions;
}) {
  const [label, setLabel] = useState(table.label);
  const isCouple = table.kind === "couple";

  const commitLabel = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== table.label) {
      actions.updateTable(table, { label: trimmed });
    }
  };

  return (
    <PopoverContent className="w-60" sideOffset={8}>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === "Enter" && commitLabel()}
      />

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
                  actions.updateTable(table, { capacity: table.capacity - 1 })
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
                  actions.updateTable(table, { capacity: table.capacity + 1 })
                }
              >
                <Plus />
              </Button>
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Color</span>
            <div className="mt-1.5 flex gap-1.5">
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
            className="mt-1 w-full"
            onClick={() => actions.removeTable(table)}
          >
            <Trash2 data-icon="inline-start" /> Remove table
          </Button>
        </>
      )}
    </PopoverContent>
  );
}

function SeatChip({
  guest,
  x,
  y,
  labelOutside,
  canEdit,
  onRemove,
}: {
  guest: Guest;
  x: number;
  y: number;
  labelOutside: boolean;
  canEdit: boolean;
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
    <div
      className={cn("group absolute z-10", isDragging && "opacity-40")}
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
                "flex size-full touch-none items-center justify-center rounded-full border bg-card text-[10px] font-semibold text-foreground/80 shadow-xs select-none",
                canEdit && "cursor-grab active:cursor-grabbing",
              )}
            />
          }
        >
          {initials}
        </TooltipTrigger>
        <TooltipContent>
          {guest.firstName} {guest.lastName}
          {guest.category ? ` · ${CATEGORY_LABEL[guest.category]}` : ""}
        </TooltipContent>
      </Tooltip>
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 w-16 -translate-x-1/2 truncate text-center text-[9px] leading-tight text-muted-foreground",
          labelOutside ? "bottom-full mb-0.5" : "top-full mt-0.5",
        )}
      >
        {guest.firstName}
      </span>
      {canEdit && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 z-20 hidden size-4 items-center justify-center rounded-full bg-foreground text-background shadow-sm group-hover:flex"
          title="Remove from table"
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  );
}
