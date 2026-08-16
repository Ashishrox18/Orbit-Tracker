/**
 * Mind map domains, grouped so a long list stays navigable in a dropdown.
 *
 * Order within a group is rough breadth-first: the wider field first, its
 * specialisations after. `abstract` is deliberately last and is the default —
 * a concept you can't place yet still belongs on the map.
 */

export const DOMAIN_GROUPS = [
  {
    label: "Sciences",
    domains: [
      "cosmology",
      "physics",
      "chemistry",
      "biology",
      "medicine",
      "earth science",
      "mathematics",
      "statistics",
      "science",
    ],
  },
  {
    label: "Technology",
    domains: ["computing", "artificial intelligence", "engineering", "technology", "design"],
  },
  {
    label: "Humanities",
    domains: [
      "history",
      "philosophy",
      "literature",
      "language",
      "linguistics",
      "art",
      "music",
      "religion",
      "mythology",
    ],
  },
  {
    label: "Society",
    domains: [
      "politics",
      "economics",
      "business",
      "finance",
      "law",
      "ethics",
      "sociology",
      "anthropology",
      "geography",
      "environment",
      "war and conflict",
    ],
  },
  {
    label: "Self",
    domains: ["psychology", "emotion", "health", "fitness", "habits", "relationships"],
  },
  { label: "Other", domains: ["abstract"] },
] as const;

export const MIND_DOMAINS = DOMAIN_GROUPS.flatMap((g) => g.domains) as unknown as [
  string,
  ...string[],
];

export type MindDomain = (typeof DOMAIN_GROUPS)[number]["domains"][number];

/** Colour per group, so the canvas reads as clusters rather than confetti. */
export const DOMAIN_COLOUR: Record<string, string> = Object.fromEntries(
  DOMAIN_GROUPS.flatMap((group) =>
    group.domains.map((d) => [
      d,
      {
        Sciences: "#1d4ed8",
        Technology: "#0369a1",
        Humanities: "#7c2d12",
        Society: "#166534",
        Self: "#a21caf",
        Other: "#475569",
      }[group.label] ?? "#475569",
    ]),
  ),
);
