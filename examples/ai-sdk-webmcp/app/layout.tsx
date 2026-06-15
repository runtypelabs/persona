import type { Metadata } from "next";
import "@runtypelabs/persona/widget.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-sdk-webmcp.persona-chat.dev"),
  title: "Switchback: WebMCP on a direct AI SDK backend",
  description:
    "Persona's WebMCP page tools driven by a direct Vercel AI SDK backend, no Runtype.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Switchback: WebMCP on a direct AI SDK backend",
    description:
      "Persona's WebMCP page tools driven by a direct Vercel AI SDK backend, no Runtype.",
    url: "/",
    siteName: "Persona WebMCP demo",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Persona: open source AI chat widget for websites",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Switchback: WebMCP on a direct AI SDK backend",
    description:
      "Persona's WebMCP page tools driven by a direct Vercel AI SDK backend, no Runtype.",
    images: ["/og-image.png"],
  },
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
