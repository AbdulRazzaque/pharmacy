import React from 'react';
import { PackageOpen } from 'lucide-react';

export const EmptyState = ({
  icon: Icon = PackageOpen,
  title = 'No records found',
  description = 'There are no items matching your criteria or currently logged in the system.',
  action,
  className = '',
}) => {
  return (
    <div
      className={`py-12 px-6 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[var(--ph-border)] bg-[var(--ph-surface-2)]/50 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-[var(--ph-border)]/60 flex items-center justify-center text-[var(--ph-muted)] mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-[var(--ph-text)] mb-1">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-[var(--ph-text-secondary)] max-w-sm mb-4">
        {description}
      </p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};

export default EmptyState;
