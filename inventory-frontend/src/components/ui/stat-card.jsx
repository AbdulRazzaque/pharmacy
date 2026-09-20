import React from 'react';

export const StatCard = ({
  icon: Icon,
  label,
  value,
  subtitle,
  trend,
  color = 'primary', // 'primary', 'secondary', 'success', 'warning', 'danger'
  className = '',
}) => {
  const colorMap = {
    primary: {
      bg: 'bg-blue-50/80 dark:bg-blue-950/30',
      text: 'text-[#0f3460] dark:text-blue-400',
      border: 'border-blue-100 dark:border-blue-900/40',
      iconBg: 'bg-[#0f3460]/10 text-[#0f3460] dark:bg-blue-500/20 dark:text-blue-300',
    },
    secondary: {
      bg: 'bg-cyan-50/80 dark:bg-cyan-950/30',
      text: 'text-[#0e7490] dark:text-cyan-400',
      border: 'border-cyan-100 dark:border-cyan-900/40',
      iconBg: 'bg-[#0e7490]/10 text-[#0e7490] dark:bg-cyan-500/20 dark:text-cyan-300',
    },
    success: {
      bg: 'bg-emerald-50/80 dark:bg-emerald-950/30',
      text: 'text-[#059669] dark:text-emerald-400',
      border: 'border-emerald-100 dark:border-emerald-900/40',
      iconBg: 'bg-[#059669]/10 text-[#059669] dark:bg-emerald-500/20 dark:text-emerald-300',
    },
    warning: {
      bg: 'bg-amber-50/80 dark:bg-amber-950/30',
      text: 'text-[#d97706] dark:text-amber-400',
      border: 'border-amber-100 dark:border-amber-900/40',
      iconBg: 'bg-[#d97706]/10 text-[#d97706] dark:bg-amber-500/20 dark:text-amber-300',
    },
    danger: {
      bg: 'bg-rose-50/80 dark:bg-rose-950/30',
      text: 'text-[#dc2626] dark:text-rose-400',
      border: 'border-rose-100 dark:border-rose-900/40',
      iconBg: 'bg-[#dc2626]/10 text-[#dc2626] dark:bg-rose-500/20 dark:text-rose-300',
    },
  };

  const scheme = colorMap[color] || colorMap.primary;

  return (
    <div
      className={`rounded-xl p-5 bg-[var(--ph-surface)] border border-[var(--ph-border)] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ph-text-secondary)]">
          {label}
        </span>
        {Icon && (
          <div className={`p-2.5 rounded-lg flex items-center justify-center ${scheme.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold text-[var(--ph-text)] tracking-tight">
          {value}
        </div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-2 mt-1">
            {trend && (
              <span
                className={`text-xs font-semibold ${
                  trend.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {trend.positive ? '+' : ''}{trend.value}
              </span>
            )}
            {subtitle && (
              <span className="text-xs text-[var(--ph-muted)]">{subtitle}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
