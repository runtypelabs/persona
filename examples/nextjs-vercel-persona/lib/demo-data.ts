export const demoFeatureProofs = [
  {
    title: "Route-aware navigation",
    description:
      "Persona can move from the overview page to the form page without losing the chat thread."
  },
  {
    title: "Allowlisted local tools",
    description:
      "Persona can only call typed client tools for known routes and a small set of writable form fields."
  },
  {
    title: "Approval for sensitive actions",
    description:
      "Form submission is a real local tool, but it always pauses on Persona's built-in approval UI first."
  },
  {
    title: "Theme alignment",
    description:
      "The docked assistant is themed to feel native inside this shadcn-style Next.js shell."
  }
] as const;

export const demoSourceData = {
  projectName: "Support Portal Launch",
  contactEmail: "launch-owner@example.com",
  launchDate: "2026-05-15",
  region: "us",
  channels: ["Email", "Slack"],
  summary:
    "Embed Persona into the support portal so operators can draft launch details from the current page and submit with approval."
} as const;

export const demoSecurityNotes = [
  "Only route IDs in the local allowlist can be opened.",
  "Only six fields in the form allowlist can be patched by Persona.",
  "Submission is available only on the form page and always requires approval."
] as const;
