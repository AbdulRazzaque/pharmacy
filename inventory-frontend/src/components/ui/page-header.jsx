import React from 'react';

export const PageHeader = ({
  title,
  subtitle,
  children,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[var(--ph-border)] mb-6 ${className}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl sm:text-[1.65rem] font-bold text-[var(--ph-text)] tracking-tight leading-tight">
            {title}
          </h1>
          {badge && <span className="inline-flex items-center">{badge}</span>}
        </div>
        {subtitle && (
          <p className="text-sm text-[var(--ph-text-secondary)] font-normal">
            {subtitle}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2.5">
          {children}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
