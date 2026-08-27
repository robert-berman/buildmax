import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildMax — LoL build search",
  description:
    "Natural-language League of Legends build search. Ask for a champion, role and item and get the strongest builds by win rate and by synergy.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
