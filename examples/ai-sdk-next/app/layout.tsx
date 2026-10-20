import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona · Workspace",
  description: "A thoughtful chat workspace with Persona, Vercel AI SDK, and OpenAI Responses",
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
