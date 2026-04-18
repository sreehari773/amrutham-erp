import type { Metadata } from "next";
import { ReactNode } from "react";
import Link from "next/link";
import "./globals.css"; 

export const metadata: Metadata = {
  title: "Amrutham Customer",
  description: "Manage your daily tiffin deliveries.",
  manifest: "/manifest.json",
  themeColor: "#FF5722",
  viewport: "minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, viewport-fit=cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // If the user lands on the /login path, we don't want the bottom nav bar.
  // We handle this via client side checks or just keep login in a route group.
  // For standard usage in next 14, we can extract this nav into a client component
  // or simply keep the nav here for now since auth handles redirection.
  
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="customer-app-container bg-slate-50 min-h-screen text-slate-800 font-sans">
          {/* Mobile App Header */}
          <header className="sticky top-0 z-40 bg-white shadow-sm px-4 py-4 flex justify-between items-center">
            <div className="font-black text-xl text-[var(--accent)] tracking-tight">Amrutham</div>
            <div className="text-sm font-medium text-slate-500">Customer</div>
          </header>

          {/* Main Content Area */}
          <main className="pb-24 px-4 pt-6 max-w-md mx-auto h-full">
            {children}
          </main>

          {/* Bottom Navigation Bar */}
          <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 safe-area-pb z-50">
            <div className="flex justify-around items-center h-16 max-w-md mx-auto relative px-2">
              <Link href="/" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-[var(--accent)] transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span className="text-[10px] uppercase tracking-wider font-bold mt-1">Home</span>
              </Link>
              <Link href="/pause" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-[var(--accent)] transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                <span className="text-[10px] uppercase tracking-wider font-bold mt-1">Schedule</span>
              </Link>
              <Link href="/profile" className="flex flex-col items-center justify-center w-full h-full text-slate-500 hover:text-[var(--accent)] transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span className="text-[10px] uppercase tracking-wider font-bold mt-1">Profile</span>
              </Link>
            </div>
          </nav>
        </div>
      </body>
    </html>
  );
}
