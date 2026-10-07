export type ChallengeState = "open" | "locked";

type DemoChallengeTitleKey =
  | "autumnSignsTitle"
  | "autumnLightTitle"
  | "townNatureTitle"
  | "waterReflectionTitle"
  | "memoryDetailTitle";

type DemoChallengeDescriptionKey =
  | "autumnSignsBody"
  | "autumnLightBody"
  | "townNatureBody"
  | "waterReflectionBody"
  | "memoryDetailBody";

type DemoChallengeHintKey =
  | "autumnSignsHint"
  | "autumnLightHint"
  | "townNatureHint"
  | "waterReflectionHint"
  | "memoryDetailHint";

export type DemoChallenge = {
  id: string;
  titleKey: DemoChallengeTitleKey;
  descriptionKey: DemoChallengeDescriptionKey;
  hintKey: DemoChallengeHintKey;
  state: ChallengeState;
  order: string;
  category?: string;
  difficulty?: string;
  required?: boolean;
  secret?: boolean;
  assignedTeamId?: string | null;
  maxPhotos?: number;
};

export const demoChallenges: DemoChallenge[] = [
  {
    id: "first-signs-of-autumn",
    titleKey: "autumnSignsTitle",
    descriptionKey: "autumnSignsBody",
    hintKey: "autumnSignsHint",
    state: "open",
    order: "01",
    category: "autumn",
    difficulty: "gentle",
    maxPhotos: 1,
  },
  {
    id: "autumn-light",
    titleKey: "autumnLightTitle",
    descriptionKey: "autumnLightBody",
    hintKey: "autumnLightHint",
    state: "open",
    order: "02",
    category: "light",
    difficulty: "gentle",
    maxPhotos: 1,
  },
  {
    id: "town-meets-nature",
    titleKey: "townNatureTitle",
    descriptionKey: "townNatureBody",
    hintKey: "townNatureHint",
    state: "open",
    order: "03",
    category: "place",
    difficulty: "curious",
    maxPhotos: 1,
  },
  {
    id: "water-and-reflection",
    titleKey: "waterReflectionTitle",
    descriptionKey: "waterReflectionBody",
    hintKey: "waterReflectionHint",
    state: "open",
    order: "04",
    category: "water",
    difficulty: "curious",
    maxPhotos: 1,
  },
  {
    id: "detail-to-remember",
    titleKey: "memoryDetailTitle",
    descriptionKey: "memoryDetailBody",
    hintKey: "memoryDetailHint",
    state: "open",
    order: "05",
    category: "memory",
    difficulty: "gentle",
    maxPhotos: 1,
  },
];

export type DemoPhoto = {
  id: string;
  study: string;
  author: string;
  caption: string;
  team: string;
  challenge: string;
  tone: "clay" | "river" | "moss" | "sun" | "ink";
  orientation: "portrait" | "landscape";
};

export const demoPhotos: DemoPhoto[] = [
  {
    id: "p-01",
    study: "01 / 12",
    author: "Lucía",
    caption: "The wall was warmer than the afternoon.",
    team: "Tajo",
    challenge: "Quiet changes",
    tone: "clay",
    orientation: "portrait",
  },
  {
    id: "p-02",
    study: "02 / 12",
    author: "Matteo",
    caption: "A small window keeping the sky.",
    team: "Alagón",
    challenge: "Quiet changes",
    tone: "river",
    orientation: "landscape",
  },
  {
    id: "p-03",
    study: "03 / 12",
    author: "Nerea",
    caption: "Green arrived in the cracks first.",
    team: "Tajo",
    challenge: "Quiet changes",
    tone: "moss",
    orientation: "portrait",
  },
  {
    id: "p-04",
    study: "04 / 12",
    author: "Giulia",
    caption: "The last light found the doorstep.",
    team: "Ambroz",
    challenge: "Quiet changes",
    tone: "sun",
    orientation: "landscape",
  },
  {
    id: "p-05",
    study: "05 / 12",
    author: "Irene",
    caption: "No one was looking down.",
    team: "Alagón",
    challenge: "Quiet changes",
    tone: "ink",
    orientation: "portrait",
  },
];
