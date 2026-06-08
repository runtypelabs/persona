import type { Metadata } from "next";
import "@runtypelabs/persona/widget.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Switchback — WebMCP on a direct AI SDK backend",
  description:
    "Persona's WebMCP page tools driven by a direct Vercel AI SDK backend, no Runtype.",
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
