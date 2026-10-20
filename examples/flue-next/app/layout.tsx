import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Orbit — Release room",
  description:
    "A thoughtful release workspace, with a Persona assistant powered by Flue.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
