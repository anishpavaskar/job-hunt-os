import { Suspense } from "react";
import { RolesView } from "@/components/roles/RolesView";

function SkeletonRows() {
  return (
    <div className="flex flex-col">
      <div className="h-11 border-b border-edge bg-surface" />
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="h-10 border-b border-edge animate-pulse"
          style={{ background: `rgba(26,26,30,${0.6 - i * 0.04})` }}
        />
      ))}
    </div>
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<SkeletonRows />}>
      <RolesView />
    </Suspense>
  );
}
