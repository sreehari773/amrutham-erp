"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import QuickSearch from "@/components/QuickSearch";

const navigation = [
  {
    href: "/",
    title: "Dashboard",
    copy: "Dispatch, renewals and monthly run rate",
    icon: (
      <svg className="side-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/customers",
    title: "Customers",
    copy: "New, returning and active subscriptions",
    icon: (
      <svg className="side-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/menus",
    title: "Menus",
    copy: "Plan the day across veg and non-veg runs",
    icon: (
      <svg className="side-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 3v18" />
        <path d="M12 3v18" />
        <path d="M17 3v18" />
        <path d="M4 8h16" />
        <path d="M4 13h16" />
      </svg>
    ),
  },
  {
    href: "/operations",
    title: "Operations",
    copy: "Forecast, manifest, reconciliation",
    icon: (
      <svg className="side-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    href: "/admin",
    title: "Admin",
    copy: "Catalog, logs and demo setup",
    icon: (
      <svg className="side-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M6 20a6 6 0 0 1 12 0" />
        <path d="M19 7h2" />
        <path d="M20 6v2" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="side-shell">
      <div className="side-brand">
        <div className="side-badge">AK</div>
        <div className="side-brand-copy">
          <p className="side-eyebrow">Cloud kitchen ERP</p>
          <p className="side-title">Amrutham</p>
        </div>
      </div>

      <QuickSearch />

      <nav className="side-nav">
        <div className="side-nav-group">
          <p className="side-nav-label">Operations</p>
          {navigation.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`side-link${isActive ? " active" : ""}`}
              >
                {item.icon}
                <div className="side-link-copy">
                  <span className="side-link-title">{item.title}</span>
                  <small>{item.copy}</small>
                </div>
                {isActive ? <span className="side-link-dot" /> : null}
              </Link>
            );
          })}
        </div>

        <div className="side-nav-group">
          <p className="side-nav-label">Exports</p>
          <a className="side-link" href="/api/export/invoices">
            <svg className="side-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 12v6" />
              <path d="m9 15 3 3 3-3" />
            </svg>
            <div className="side-link-copy">
              <span className="side-link-title">Invoice Export</span>
              <small>Download the billing ledger as CSV</small>
            </div>
          </a>
        </div>
      </nav>

      <Link href="/admin" className="side-footer-card">
        <div className="side-badge" style={{ width: 40, height: 40, borderRadius: 14, fontSize: 16 }}>
          A
        </div>
        <div>
          <strong>Admin Console</strong>
          <span>Subscription values, logs and sample data</span>
        </div>
      </Link>
    </aside>
  );
}
