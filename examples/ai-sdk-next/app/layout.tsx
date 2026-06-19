import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona SDK Adapter Minimal",
  description: "Minimal Persona adapters for Vercel AI SDK and OpenAI Responses SDK",
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
