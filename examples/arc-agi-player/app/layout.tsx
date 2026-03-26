import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARC-AGI Player — Persona Agent Demo",
  description:
    "Watch a Persona AI agent play ARC-AGI-3 games using tool calls to reason about and interact with puzzle environments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
