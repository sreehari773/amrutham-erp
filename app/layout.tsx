import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amrutham ERP",
  description: "Cloud Kitchen and subscription operations console",
  manifest: "/manifest.json",
  themeColor: "#FF5722",
  viewport: "minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, viewport-fit=cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
