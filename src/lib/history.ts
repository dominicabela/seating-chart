import { useCallback, useEffect, useRef, useState } from "react";

export type HistoryEntry = {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const MAX_UNDO = 10;

export type History = {
  push: (entry: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
};

export function useHistory(): History {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const busy = useRef(false);
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const bump = () =>
    setCounts({
      undo: undoStack.current.length,
      redo: redoStack.current.length,
    });

  const push = useCallback((entry: HistoryEntry) => {
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), entry];
    redoStack.current = [];
    bump();
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry || busy.current) return;
    busy.current = true;
    entry
      .undo()
      .then(() => {
        redoStack.current.push(entry);
      })
      .catch((error: unknown) => {
        console.error("Undo failed", error);
      })
      .finally(() => {
        busy.current = false;
        bump();
      });
    bump();
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry || busy.current) return;
    busy.current = true;
    entry
      .redo()
      .then(() => {
        undoStack.current = [
          ...undoStack.current.slice(-(MAX_UNDO - 1)),
          entry,
        ];
      })
      .catch((error: unknown) => {
        console.error("Redo failed", error);
      })
      .finally(() => {
        busy.current = false;
        bump();
      });
    bump();
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, []);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: counts.undo > 0,
    canRedo: counts.redo > 0,
  };
}

/** Cmd/Ctrl+Z to undo, Shift+Cmd/Ctrl+Z or Ctrl+Y to redo. */
export function useHistoryShortcuts(history: History, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        history.redo();
      } else if (key === "z") {
        event.preventDefault();
        history.undo();
      } else if (key === "y") {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, enabled]);
}
