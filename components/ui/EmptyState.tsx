import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="soft-card" style={{ padding: 0 }}>
      <div className="empty">
        {icon && (
          <div className="halo" aria-hidden="true">
            {icon}
          </div>
        )}
        <p className="et">{title}</p>
        {description && <p className="es">{description}</p>}
      </div>
    </div>
  );
}
