import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona × eve",
  description: "Wrap an eve agent session stream in Persona's SSE wire protocol",
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
