import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  message: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon,
  message,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center select-none">
      {icon && (
        <div className="mb-4 text-fg-4 opacity-50">{icon}</div>
      )}
      <p className="text-[13px] font-medium text-fg-2">{message}</p>
      {description && (
        <p className="mt-1 font-mono text-[11px] text-fg-3">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-3 py-1.5 font-mono text-[11px] text-blue border border-blue/25 bg-blue/6 hover:bg-blue/10 transition-colors rounded-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
