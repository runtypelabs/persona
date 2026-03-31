import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "@runtypelabs/persona/widget.css";

import { AppWorkspace } from "@/components/app-workspace";
import {
  getPersonaBackendLabel,
  resolvePersonaBackend
} from "@/lib/chat/provider";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Persona Next.js Demo",
  description:
    "A simplified embedded Persona demo for route navigation, local tools, approval, and theming."
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const resolvedBackend = resolvePersonaBackend(process.env);
  const activeBackend =
    resolvedBackend.ok ? resolvedBackend.backend : "ai-gateway";
  const backendLabel = getPersonaBackendLabel(resolvedBackend);
  const backendError = resolvedBackend.ok ? null : resolvedBackend.error;

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppWorkspace
          activeBackend={activeBackend}
          backendLabel={backendLabel}
          backendError={backendError}
        >
          {children}
        </AppWorkspace>
      </body>
    </html>
  );
}
