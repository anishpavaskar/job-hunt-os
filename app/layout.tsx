import type { Metadata } from "next";
import "./globals.css";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { getShellStatusLabel, getShellSummary } from "@/lib/server/web-data";

export const metadata: Metadata = {
  title: "job-hunt-os",
  description: "An operating system for job hunting",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: LayoutProps<"/">) {
  const summary = await getShellSummary();
  const statusLabel = getShellStatusLabel(summary);
  return (
    <html lang="en">
      <body className="min-h-dvh flex flex-col bg-void text-fg antialiased">
        <TopBar summary={summary} statusLabel={statusLabel} />
        <div className="flex flex-1 min-h-0">
          <Sidebar summary={summary} statusLabel={statusLabel} />
          <main className="flex-1 overflow-auto bg-void">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
