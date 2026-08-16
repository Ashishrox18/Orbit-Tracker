import type { Metadata, Viewport } from "next";

import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — daily plan, three wins, real behaviour",
  description:
    "A personal assistant that plans your day around three wins and adapts tomorrow from what actually happened today.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1014" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="lg:grid lg:min-h-screen lg:grid-cols-[13rem_1fr]">
          <Nav />
          <main id="main" tabIndex={-1} className="w-full min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
