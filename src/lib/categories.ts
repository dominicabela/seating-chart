export const CATEGORIES = [
  { value: "wedding_party", label: "Wedding party" },
  { value: "bride_family", label: "Family of bride" },
  { value: "groom_family", label: "Family of groom" },
  { value: "bride_family_friend", label: "Family friend of bride" },
  { value: "groom_family_friend", label: "Family friend of groom" },
  { value: "bride_friend", label: "Friend of bride" },
  { value: "groom_friend", label: "Friend of groom" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<Category, string>;

/** Subtle badge tints per category. */
export const CATEGORY_BADGE_CLASS: Record<Category, string> = {
  wedding_party: "bg-amber-100 text-amber-800",
  bride_family: "bg-rose-100 text-rose-800",
  groom_family: "bg-sky-100 text-sky-800",
  bride_family_friend: "bg-pink-50 text-pink-700",
  groom_family_friend: "bg-indigo-50 text-indigo-700",
  bride_friend: "bg-fuchsia-50 text-fuchsia-700",
  groom_friend: "bg-cyan-50 text-cyan-700",
};
