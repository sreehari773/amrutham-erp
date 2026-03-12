import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amrutham ERP",
  description: "Cloud Kitchen and subscription operations console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="shell-main">
            <div className="shell-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
