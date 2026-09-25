import React from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  /** Omit to fall back to the .stat-icon CSS class's default tint. */
  iconBg?: string;
  iconColor?: string;
  valueColor?: string;
}

/** KPI card used in the Owner/Professor dashboard summary rows (.stat-card/.stat-icon/.stat-label/.stat-value classes live in index.css). */
export const StatCard: React.FC<StatCardProps> = ({ icon, label, value, iconBg, iconColor, valueColor }) => (
  <div className="stat-card">
    <div className="stat-icon" style={iconBg || iconColor ? { background: iconBg, color: iconColor } : undefined}>
      {icon}
    </div>
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
    </div>
  </div>
);
