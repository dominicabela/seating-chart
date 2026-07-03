import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  defaultIncludeValues,
  distinctValues,
  extractGuests,
  guessColumns,
  parseSpreadsheet,
  type ParsedSheet,
} from "@/lib/spreadsheet";

const NONE = "__none__";

export function ImportStep({
  code,
  hasExistingGuests,
  onDone,
}: {
  code: string;
  hasExistingGuests: boolean;
  onDone: () => void;
}) {
  const bulkImport = useMutation(api.guests.bulkImport);

  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [firstCol, setFirstCol] = useState<string>(NONE);
  const [lastCol, setLastCol] = useState<string>(NONE);
  const [rsvpCol, setRsvpCol] = useState<string>(NONE);
  const [includeValues, setIncludeValues] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const parsed = await parseSpreadsheet(file);
      setSheet(parsed);
      setFileName(file.name);
      const guesses = guessColumns(parsed);
      setFirstCol(guesses.firstName !== null ? String(guesses.firstName) : NONE);
      setLastCol(guesses.lastName !== null ? String(guesses.lastName) : NONE);
      setRsvpCol(guesses.rsvp !== null ? String(guesses.rsvp) : NONE);
      if (guesses.rsvp !== null) {
        const values = distinctValues(parsed, guesses.rsvp);
        setIncludeValues(new Set(defaultIncludeValues(values)));
      } else {
        setIncludeValues(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
    }
  }, []);

  const rsvpValues = useMemo(
    () => (sheet && rsvpCol !== NONE ? distinctValues(sheet, Number(rsvpCol)) : []),
    [sheet, rsvpCol],
  );

  const extraction = useMemo(() => {
    if (!sheet) return null;
    return extractGuests(
      sheet,
      firstCol === NONE ? null : Number(firstCol),
      lastCol === NONE ? null : Number(lastCol),
      rsvpCol === NONE ? null : Number(rsvpCol),
      includeValues,
    );
  }, [sheet, firstCol, lastCol, rsvpCol, includeValues]);

  const handleImport = async () => {
    if (!extraction || extraction.included.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      await bulkImport({
        code,
        guests: extraction.included,
        replace: hasExistingGuests,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setImporting(false);
    }
  };

  const columnOptions = sheet
    ? sheet.headers.map((h, i) => ({
        value: String(i),
        label: h || `Column ${i + 1}`,
      }))
    : [];

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl py-8">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            Import your guest list
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Upload a spreadsheet — we'll detect names and RSVPs automatically.
          </p>
          {hasExistingGuests && (
            <p className="mt-2 text-xs text-amber-700">
              Importing replaces your current guest list.
            </p>
          )}
        </div>

        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-card hover:border-muted-foreground/40",
          )}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void loadFile(file);
          }}
        >
          {sheet ? (
            <>
              <FileSpreadsheet className="size-6 text-muted-foreground" />
              <div className="text-sm font-medium">{fileName}</div>
              <div className="text-xs text-muted-foreground">
                {sheet.rows.length} rows · click to choose a different file
              </div>
            </>
          ) : (
            <>
              <Upload className="size-6 text-muted-foreground" />
              <div className="text-sm font-medium">
                Drop a spreadsheet here, or click to browse
              </div>
              <div className="text-xs text-muted-foreground">
                .xlsx, .csv and similar formats
              </div>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.ods,.numbers"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {sheet && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-medium">Columns</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColumnSelect
                  label="First name"
                  value={firstCol}
                  onChange={setFirstCol}
                  options={columnOptions}
                />
                <ColumnSelect
                  label="Last name"
                  value={lastCol}
                  onChange={setLastCol}
                  options={columnOptions}
                  noneLabel="None (split full name)"
                />
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <h3 className="mb-1 text-sm font-medium">Who's included?</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Pick the column that decides attendance, then the values that
                mean "include this person".
              </p>
              <ColumnSelect
                label="Attendance column"
                value={rsvpCol}
                onChange={(v) => {
                  setRsvpCol(v);
                  if (v !== NONE && sheet) {
                    setIncludeValues(
                      new Set(
                        defaultIncludeValues(distinctValues(sheet, Number(v))),
                      ),
                    );
                  }
                }}
                options={columnOptions}
                noneLabel="Include everyone"
              />
              {rsvpCol !== NONE && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rsvpValues.map((value) => {
                    const active = includeValues.has(value);
                    return (
                      <button
                        key={value}
                        onClick={() =>
                          setIncludeValues((prev) => {
                            const next = new Set(prev);
                            if (next.has(value)) next.delete(value);
                            else next.add(value);
                            return next;
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/50",
                        )}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {extraction && (
              <div className="rounded-2xl border bg-card p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">
                    {extraction.included.length} guests will be imported
                  </h3>
                  {extraction.excluded.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {extraction.excluded.length} excluded
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {extraction.included.slice(0, 12).map((g, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs"
                    >
                      {g.firstName} {g.lastName}
                    </span>
                  ))}
                  {extraction.included.length > 12 && (
                    <span className="px-1 py-1 text-xs text-muted-foreground">
                      and {extraction.included.length - 12} more…
                    </span>
                  )}
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={extraction.included.length === 0 || importing}
                  onClick={() => void handleImport()}
                >
                  {importing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    `Import ${extraction.included.length} guests`
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  onChange,
  options,
  noneLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  noneLabel?: string;
}) {
  const items = [{ value: NONE, label: noneLabel ?? "None" }, ...options];
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select
        items={items}
        value={value}
        onValueChange={(v) => onChange(v as string)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
