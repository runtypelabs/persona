import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona × OpenAI Agents SDK",
  description: "Wrap @openai/agents' streamed run in Persona's SSE wire protocol",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
