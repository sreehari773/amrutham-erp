"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { getCustomerDirectory } from "@/app/actions/sprint1";

type DirectoryEntry = {
  customer_id: number;
  name: string;
  phone: string;
  address: string | null;
  status: "Active" | "Completed" | "Cancelled";
};

const shortcuts = [
  { href: "/", title: "Dashboard", copy: "Daily overview and dispatch status" },
  { href: "/customers", title: "Customers", copy: "New and returning subscriptions" },
  { href: "/menus", title: "Menus", copy: "Daily menu planning" },
  { href: "/admin", title: "Admin", copy: "Subscription catalog and logs" },
];

export default function QuickSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleShortcut);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => {
    if (deferredQuery.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    startTransition(() => {
      void getCustomerDirectory(deferredQuery, 8).then((response) => {
        if (cancelled) {
          return;
        }

        setResults((response.data ?? []) as DirectoryEntry[]);
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [deferredQuery]);

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div className="side-search" ref={containerRef}>
      <div className="side-search-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </div>
      <input
        ref={inputRef}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        placeholder="Quick search customers or pages"
        className="side-search-input"
      />
      <span className="side-kbd">Ctrl K</span>

      {open && (
        <div className="search-popover">
          <div className="search-group">
            <p className="search-label">Shortcuts</p>
            {shortcuts.map((item) => (
              <button
                key={item.href}
                type="button"
                className="search-item"
                onClick={() => goTo(item.href)}
              >
                <div>
                  <div className="search-item-title">{item.title}</div>
                  <div className="search-item-copy">{item.copy}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="search-group">
            <p className="search-label">Customers</p>
            {deferredQuery.trim().length < 2 ? (
              <div className="search-item-copy" style={{ padding: "4px 12px 10px" }}>
                Type at least 2 characters to search by name or phone.
              </div>
            ) : loading ? (
              <div className="search-item-copy" style={{ padding: "4px 12px 10px" }}>
                Searching customer directory...
              </div>
            ) : results.length === 0 ? (
              <div className="search-item-copy" style={{ padding: "4px 12px 10px" }}>
                No customer matches found.
              </div>
            ) : (
              results.map((item) => (
                <button
                  key={item.customer_id}
                  type="button"
                  className="search-item"
                  onClick={() =>
                    goTo(
                      `/customers?mode=returning&customerId=${item.customer_id}&q=${encodeURIComponent(
                        item.name
                      )}`
                    )
                  }
                >
                  <div>
                    <div className="search-item-title">{item.name}</div>
                    <div className="search-item-copy">
                      {item.phone}
                      {item.address ? ` | ${item.address}` : ""}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
