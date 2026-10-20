export const documents = [
  {
    id: "launch-brief",
    title: "Atlas launch brief",
    category: "Product strategy",
    description: "A calmer way for small teams to turn research into decisions.",
    owner: "Maya Chen",
    updated: "October 16",
    status: "In review",
    sections: [
      { title: "The opportunity", content: "Research is everywhere. The decision is nowhere. Product teams collect customer calls, support notes, and market insights across a dozen tools, then lose the thread when it is time to act. Atlas brings the evidence and the decision into one shared workspace." },
      { title: "What we’re shipping", content: "A focused workspace for teams of 5–25: collect research notes, link evidence to a decision, and publish a concise brief. The first release includes shared projects, source-linked summaries, and a lightweight decision log. Integrations and automated imports are explicitly out of scope." },
      { title: "How we’ll measure it", content: "Our first milestone is 40 active pilot teams. Success means 60% of those teams publish a decision brief within seven days, and at least half return the following week. Measure completed briefs and returning teams, rather than raw notes uploaded." },
      { title: "Open questions", content: "Design partners still need to validate the first-run experience. Import reliability must pass the release check. We have not assigned an owner for the help center. The launch date remains a target until those three dependencies are resolved." },
    ],
  },
  {
    id: "research-notes",
    title: "Design partner insights",
    category: "Customer research",
    description: "What six pilot teams taught us about making decisions together.",
    owner: "Elena Park",
    updated: "October 15",
    status: "Ready",
    sections: [
      { title: "Who we spoke to", content: "Six design partners participated in a 45-minute workflow interview. Four were product leads at teams of 5–15; two were founders at teams of 20–25. These are directional observations from a small sample, not a representative market study." },
      { title: "The strongest signal", content: "Five of six teams said collecting notes was already easy. The painful step was explaining why a decision was made. Four teams keep a separate decision document, often without links back to the source evidence." },
      { title: "What surprised us", content: "Three teams preferred a blank brief over an elaborate template. Every participant wanted to verify an AI summary against the original source. Two teams would not invite colleagues until a first useful brief existed." },
      { title: "Next research round", content: "Run an unmoderated first-run test with all six partners. Observe whether they can publish one source-linked decision brief without help. Research is owned by Elena; results are due October 23, before the pilot opens." },
    ],
  },
  {
    id: "release-plan",
    title: "Pilot release checklist",
    category: "Delivery",
    description: "The small, deliberate steps between a working product and a useful pilot.",
    owner: "Noah Williams",
    updated: "October 16",
    status: "In progress",
    sections: [
      { title: "Release scope", content: "The pilot includes projects, research notes, source-linked summaries, and decision briefs. Keep billing, third-party integrations, and automated imports out of the release. Invite 40 teams gradually, starting with the six existing design partners." },
      { title: "Quality gates", content: "Noah owns the import reliability check due October 22. Elena owns first-run validation due October 23. The help center has no assigned owner or committed delivery date. These are release gates, not optional follow-ups." },
      { title: "Rollout", content: "October 26 is the target pilot opening. Start with six design partners, review issues for 48 hours, then add the remaining teams in two cohorts. Maya makes the go/no-go decision after the quality gates are complete." },
      { title: "If something goes wrong", content: "Pause invitations if a team loses content or cannot publish a brief. Noah leads incident triage; Maya informs affected pilot teams. Keep existing teams on the previous working version until the issue is resolved." },
    ],
  },
] as const;
export type WorkspaceDocument = (typeof documents)[number];
export const milestones = [
  { date: "Oct 22", title: "Import reliability check", owner: "Noah", status: "In progress" },
  { date: "Oct 23", title: "First-run validation", owner: "Elena", status: "Scheduled" },
  { date: "Unscheduled", title: "Help center ready", owner: "Unassigned", status: "At risk" },
  { date: "Oct 26", title: "Pilot opens · 40 teams", owner: "Maya", status: "Target" },
] as const;
export function getDocument(id: string | null): WorkspaceDocument {
  return documents.find((document) => document.id === id) ?? documents[0];
}
export function documentMarkdown(document: WorkspaceDocument): string {
  return `# ${document.title}\n\n${document.description}\n\n${document.sections.map((section) => `## ${section.title}\n\n${section.content}`).join("\n\n")}\n\n## Milestones\n\n${milestones.map((item) => `- ${item.date}: ${item.title} — ${item.owner}, ${item.status}`).join("\n")}`;
}
