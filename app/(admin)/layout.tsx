import Sidebar from "@/components/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="shell-main">
        <div className="shell-inner">{children}</div>
      </main>
    </div>
  );
}
