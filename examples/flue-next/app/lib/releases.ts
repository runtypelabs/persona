export type Release = {
  id: string;
  version: string;
  title: string;
  date: string;
  description: string;
  checks: {
    name: string;
    detail: string;
    status: "passed" | "attention";
    owner: string;
  }[];
  changes: { id: string; title: string; area: string; author: string }[];
};

export const releases: Release[] = [
  {
    id: "october",
    version: "2.8",
    title: "A little more momentum.",
    date: "October 22, 2026",
    description:
      "Faster workspaces, clearer insights, and fewer things between you and your next idea.",
    checks: [
      {
        name: "Build & test",
        detail: "248 checks passed across all packages",
        status: "passed",
        owner: "Engineering",
      },
      {
        name: "Performance",
        detail: "Workspace loads 32% faster",
        status: "passed",
        owner: "Platform",
      },
      {
        name: "Accessibility",
        detail: "Keyboard review needed for command menu",
        status: "attention",
        owner: "Design",
      },
      {
        name: "Release notes",
        detail: "Draft ready for editorial review",
        status: "attention",
        owner: "Product",
      },
    ],
    changes: [
      {
        id: "ORB-284",
        title: "A command menu that keeps up",
        area: "Workspace",
        author: "Maya Chen",
      },
      {
        id: "ORB-279",
        title: "Your insights, at a glance",
        area: "Analytics",
        author: "Leo Park",
      },
      {
        id: "ORB-271",
        title: "Less waiting. More creating.",
        area: "Performance",
        author: "Ava Wilson",
      },
      {
        id: "ORB-266",
        title: "Bring your whole team along",
        area: "Workspace",
        author: "Noah James",
      },
    ],
  },
  {
    id: "september",
    version: "2.7",
    title: "Everything, in its place.",
    date: "September 24, 2026",
    description:
      "A calmer home for your projects, with flexible views and thoughtful organization.",
    checks: [
      {
        name: "Build & test",
        detail: "232 checks passed across all packages",
        status: "passed",
        owner: "Engineering",
      },
      {
        name: "Performance",
        detail: "All performance budgets met",
        status: "passed",
        owner: "Platform",
      },
      {
        name: "Accessibility",
        detail: "Keyboard and screen reader review complete",
        status: "passed",
        owner: "Design",
      },
      {
        name: "Release notes",
        detail: "Published and shared with customers",
        status: "passed",
        owner: "Product",
      },
    ],
    changes: [
      {
        id: "ORB-249",
        title: "A new home for every project",
        area: "Workspace",
        author: "Maya Chen",
      },
      {
        id: "ORB-243",
        title: "Views that work your way",
        area: "Analytics",
        author: "Leo Park",
      },
      {
        id: "ORB-238",
        title: "Find the right thing, faster",
        area: "Performance",
        author: "Ava Wilson",
      },
    ],
  },
];
export const getRelease = (id: unknown) =>
  releases.find((release) => release.id === id) ?? releases[0];
