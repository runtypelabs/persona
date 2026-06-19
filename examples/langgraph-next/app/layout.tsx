import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona × LangGraph.js",
  description: "Wrap a LangGraph streamEvents run in Persona's SSE wire protocol",
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
