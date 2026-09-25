import React from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import type { PaymentStatus } from '../types';

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  /** Present -> renders as a clickable <button> (owner/professor toggling payment); absent -> static <span> (read-only player view). */
  onClick?: () => void;
  paidIcon?: React.ReactNode;
  pendingLabel?: string;
}

/** Paid/pending payment badge — a clickable toggle in the owner/professor dashboards, a static label in MyReservationsPage. */
export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({
  status,
  onClick,
  paidIcon = <CheckCircle size={12} />,
  pendingLabel = 'PENDIENTE',
}) => {
  const isPaid = status === 'PAID';
  const className = `badge ${isPaid ? 'badge-paid' : 'badge-pending'}`;
  const content = (
    <>
      {isPaid ? paidIcon : <Clock size={12} />}
      <span>{isPaid ? 'PAGADO' : pendingLabel}</span>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={className} style={{ cursor: 'pointer', border: 'none' }} title="Haz clic para alternar Pagado / Pendiente">
        {content}
      </button>
    );
  }

  return <span className={className}>{content}</span>;
};
