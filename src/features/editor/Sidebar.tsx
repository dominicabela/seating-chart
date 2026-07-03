import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Plus, Search, Sparkles, X } from "lucide-react";

import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  CATEGORY_BADGE_CLASS,
  CATEGORY_LABEL,
  type Category,
} from "@/lib/categories";
import type { EditorActions, RemoteTouch } from "./Editor";

type Guest = Doc<"guests">;
type Table = Doc<"tables">;

const ALL = "__all__";
const UNCATEGORIZED = "__uncategorized__";

type SortBy = "name" | "category" | "table";

const CATEGORY_ORDER = new Map<string, number>(
  CATEGORIES.map((c, i) => [c.value, i]),
);

export function Sidebar({
  guests,
  tables,
  canEdit,
  actions,
  remoteGuestTouch,
  onHoverGuest,
}: {
  guests: Guest[];
  tables: Table[];
  canEdit: boolean;
  actions: EditorActions;
  remoteGuestTouch?: Map<string, RemoteTouch>;
  onHoverGuest?: (guestId: Id<"guests"> | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmAutoSeat, setConfirmAutoSeat] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: "unassign",
    data: { type: "unassign" },
    disabled: !canEdit,
  });

  const tableLabels = useMemo(
    () => new Map<Id<"tables">, string>(tables.map((t) => [t._id, t.label])),
    [tables],
  );

  const seatedCount = guests.filter((g) => g.tableId).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byName = (a: Guest, b: Guest) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
      );
    const compare = (a: Guest, b: Guest): number => {
      if (sortBy === "category") {
        // Uncategorized last, then plan order, then name.
        const ai = a.category ? (CATEGORY_ORDER.get(a.category) ?? 99) : 100;
        const bi = b.category ? (CATEGORY_ORDER.get(b.category) ?? 99) : 100;
        if (ai !== bi) return ai - bi;
      } else if (sortBy === "table") {
        // Unseated last, then by table label (numeric-aware), then name.
        const al = a.tableId ? (tableLabels.get(a.tableId) ?? "") : null;
        const bl = b.tableId ? (tableLabels.get(b.tableId) ?? "") : null;
        if (al === null && bl !== null) return 1;
        if (al !== null && bl === null) return -1;
        if (al !== null && bl !== null && al !== bl) {
          return al.localeCompare(bl, undefined, { numeric: true });
        }
      }
      return byName(a, b);
    };
    return guests
      .filter((guest) => {
        if (
          query &&
          !`${guest.firstName} ${guest.lastName}`.toLowerCase().includes(query)
        ) {
          return false;
        }
        if (categoryFilter === UNCATEGORIZED && guest.category) return false;
        if (
          categoryFilter !== ALL &&
          categoryFilter !== UNCATEGORIZED &&
          guest.category !== categoryFilter
        ) {
          return false;
        }
        if (statusFilter === "seated" && !guest.tableId) return false;
        if (statusFilter === "unseated" && guest.tableId) return false;
        return true;
      })
      .sort(compare);
  }, [guests, search, categoryFilter, statusFilter, sortBy, tableLabels]);

  const anySeated = seatedCount > 0;

  const categoryItems = [
    { value: ALL, label: "All categories" },
    { value: UNCATEGORIZED, label: "Uncategorized" },
    ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];
  const statusItems = [
    { value: ALL, label: "All guests" },
    { value: "seated", label: "Seated" },
    { value: "unseated", label: "Unseated" },
  ];
  const sortItems: { value: SortBy; label: string }[] = [
    { value: "name", label: "Sort · Last name" },
    { value: "category", label: "Sort · Category" },
    { value: "table", label: "Sort · Table" },
  ];

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-card/40">
      <div className="flex flex-col gap-2.5 border-b p-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Guests</h2>
          <span className="text-xs text-muted-foreground">
            {seatedCount} of {guests.length} seated
          </span>
        </div>

        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={guests.length === 0}
            onClick={() => {
              if (anySeated) setConfirmAutoSeat(true);
              else actions.autoSeat();
            }}
          >
            <Sparkles data-icon="inline-start" /> Auto-seat guests
          </Button>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search guests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            items={categoryItems}
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as string)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={statusItems}
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as string)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select
          items={sortItems}
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortBy)}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        {filtered.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {guests.length === 0 ? "No guests yet." : "No matches."}
          </p>
        ) : (
          <ul className="flex flex-col p-1.5">
            {filtered.map((guest) => (
              <GuestRow
                key={guest._id}
                guest={guest}
                tableLabel={
                  guest.tableId
                    ? (tableLabels.get(guest.tableId) ?? "?")
                    : null
                }
                canEdit={canEdit}
                actions={actions}
                remote={remoteGuestTouch?.get(guest._id)}
                onHover={onHoverGuest}
              />
            ))}
          </ul>
        )}
        {isOver && (
          <p className="px-4 pb-3 text-center text-xs text-primary">
            Drop to unseat
          </p>
        )}
      </div>

      {canEdit && (
        <div className="border-t p-3">
          {showAdd ? (
            <AddGuestForm
              onAdd={(fields) => {
                actions.addGuest(fields);
                setShowAdd(false);
              }}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShowAdd(true)}
            >
              <Plus data-icon="inline-start" /> Add guest
            </Button>
          )}
        </div>
      )}

      {confirmAutoSeat && (
        <Dialog open onOpenChange={(open) => !open && setConfirmAutoSeat(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Re-run auto-seating?</DialogTitle>
              <DialogDescription>
                This rearranges all {guests.length} guests, replacing the
                current seating. You can undo it afterwards.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmAutoSeat(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  actions.autoSeat();
                  setConfirmAutoSeat(false);
                }}
              >
                Auto-seat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </aside>
  );
}

function GuestRow({
  guest,
  tableLabel,
  canEdit,
  actions,
  remote,
  onHover,
}: {
  guest: Guest;
  tableLabel: string | null;
  canEdit: boolean;
  actions: EditorActions;
  remote?: RemoteTouch;
  onHover?: (guestId: Id<"guests"> | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `row:${guest._id}`,
    data: { type: "guest", guestId: guest._id },
    disabled: !canEdit,
  });

  const [confirmRemove, setConfirmRemove] = useState(false);

  const categoryItems = [
    { value: "", label: "Uncategorized" },
    ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/60",
        isDragging && "opacity-40",
      )}
      style={
        remote ? { boxShadow: `inset 0 0 0 1.5px ${remote.color}` } : undefined
      }
      title={remote ? `${remote.name} is moving this guest` : undefined}
      onMouseEnter={() => onHover?.(guest._id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {canEdit && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">
          {guest.firstName} {guest.lastName}
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          {canEdit ? (
            <Select
              items={categoryItems}
              value={guest.category ?? ""}
              onValueChange={(v) =>
                actions.setGuestCategory(
                  guest,
                  (v as string) === "" ? null : (v as Category),
                )
              }
            >
              <SelectTrigger
                className={cn(
                  "h-4 gap-0.5 rounded-full border-transparent px-1.5 py-0 text-[10px] leading-none font-medium hover:border-border [&_svg]:size-2.5",
                  guest.category
                    ? CATEGORY_BADGE_CLASS[guest.category]
                    : "bg-muted text-muted-foreground",
                )}
              >
                <SelectValue>
                  {guest.category ? CATEGORY_LABEL[guest.category] : "—"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="min-w-44" alignItemWithTrigger={false}>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium",
                guest.category
                  ? CATEGORY_BADGE_CLASS[guest.category]
                  : "bg-muted text-muted-foreground",
              )}
            >
              {guest.category ? CATEGORY_LABEL[guest.category] : "—"}
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 text-[10px]",
          tableLabel ? "text-muted-foreground" : "text-amber-600",
        )}
      >
        {tableLabel ?? "Unseated"}
      </span>
      {canEdit ? (
        <button
          onClick={() => actions.setGuestSingle(guest, !guest.single)}
          className={cn(
            "shrink-0 text-xs leading-none",
            guest.single
              ? "opacity-100"
              : "hidden opacity-40 group-hover:block hover:opacity-100",
          )}
          title={guest.single ? "Tagged single — click to remove" : "Tag as single"}
        >
          💘
        </button>
      ) : (
        guest.single && (
          <span
            className="shrink-0 text-xs leading-none"
            title="Single"
            aria-label="Single"
          >
            💘
          </span>
        )
      )}
      {canEdit && (
        <button
          onClick={() => setConfirmRemove(true)}
          className="hidden shrink-0 text-muted-foreground/60 group-hover:block hover:text-destructive"
          title="Remove guest"
        >
          <X className="size-3.5" />
        </button>
      )}

      {confirmRemove && (
        <Dialog open onOpenChange={(open) => !open && setConfirmRemove(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove guest?</DialogTitle>
              <DialogDescription>
                Remove{" "}
                <span className="font-medium text-foreground">
                  {guest.firstName} {guest.lastName}
                </span>{" "}
                from the guest list? You can undo this afterwards.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  actions.removeGuest(guest);
                  setConfirmRemove(false);
                }}
              >
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </li>
  );
}

function AddGuestForm({
  onAdd,
  onCancel,
}: {
  onAdd: (fields: {
    firstName: string;
    lastName: string;
    category?: Category;
  }) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [category, setCategory] = useState<string>("");

  const categoryItems = [
    { value: "", label: "No category" },
    ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
  ];

  const submit = () => {
    if (!firstName.trim() && !lastName.trim()) return;
    onAdd({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      category: category === "" ? undefined : (category as Category),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="First name"
          value={firstName}
          autoFocus
          onChange={(e) => setFirstName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <Input
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <Select
        items={categoryItems}
        value={category}
        onValueChange={(v) => setCategory(v as string)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categoryItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={submit}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
