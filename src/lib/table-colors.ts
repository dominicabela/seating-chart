export type TableColor = {
  key: string;
  label: string;
  /** Fill of the table circle. */
  bg: string;
  /** Border of the table circle. */
  border: string;
  /** Swatch preview color. */
  swatch: string;
};

export const TABLE_COLORS: TableColor[] = [
  { key: "none", label: "Neutral", bg: "#fafafa", border: "#e4e4e7", swatch: "#e4e4e7" },
  { key: "rose", label: "Rose", bg: "#fdf1f3", border: "#f4cdd5", swatch: "#f4cdd5" },
  { key: "peach", label: "Peach", bg: "#fef4ec", border: "#f8d9bd", swatch: "#f8d9bd" },
  { key: "sage", label: "Sage", bg: "#f0f6ef", border: "#cde3ca", swatch: "#cde3ca" },
  { key: "sky", label: "Sky", bg: "#eef6fb", border: "#c8e2f2", swatch: "#c8e2f2" },
  { key: "lavender", label: "Lavender", bg: "#f4f1fb", border: "#dcd3f2", swatch: "#dcd3f2" },
  { key: "sand", label: "Sand", bg: "#f9f6ef", border: "#e8ddc4", swatch: "#e8ddc4" },
];

export const COUPLE_COLOR: TableColor = {
  key: "gold",
  label: "Gold",
  bg: "#fdf8ec",
  border: "#ecd9a8",
  swatch: "#ecd9a8",
};

export function tableColor(key: string): TableColor {
  if (key === "gold") return COUPLE_COLOR;
  return TABLE_COLORS.find((c) => c.key === key) ?? TABLE_COLORS[0];
}
