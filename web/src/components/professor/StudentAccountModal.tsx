import React, { useCallback, useEffect, useState } from 'react';
import { X, Phone, Trash2, UserMinus, Plus, UserX, Undo2 } from 'lucide-react';
import { api } from '../../api/client';
import { Banner } from '../Banner';
import { DAY_NAMES, addDays, nowParts, parseDate, shortDateLabel, todayStr } from '../../lib/dates';
import type { ClassStudent, StudentAccount, WeeklyClass } from '../../types';

interface StudentAccountModalProps {
  cls: WeeklyClass;
  student: ClassStudent;
  onChanged: () => void;
  onClose: () => void;
}

const money = (n: number) => `$${Math.abs(n).toLocaleString('es-AR')}`;

/** Date of this class's next occurrence that hasn't started yet (today if it's later today). */
function nextClassDate(dayOfWeek: number, startTime: string): string {
  const { today, time } = nowParts();
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    if (parseDate(date).getDay() === dayOfWeek && (i > 0 || startTime > time)) return date;
  }
  return addDays(today, 7);
}

/**
 * A student inside one class: what their turn costs in this class, their
 * balance with the professor (paid − owed for the classes already given)
 * and the form to record a payment.
 */
export const StudentAccountModal: React.FC<StudentAccountModalProps> = ({ cls, student, onChanged, onClose }) => {
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [price, setPrice] = useState(String(student.price));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.professors.getStudentAccount(student.studentId);
      setAccount(res);
      // Suggest the debt, or one class if they're up to date.
      setAmount((prev) => prev || String(res.balance.balance < 0 ? -res.balance.balance : student.price));
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar la cuenta del alumno.');
    }
  }, [student.studentId, student.price]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePrice = () => {
    const value = Number(price);
    if (Number.isNaN(value) || value < 0) {
      setError('El valor no es válido.');
      return;
    }
    run(() => api.professors.updateEnrollmentPrice(student.enrollmentId, value));
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      setError('Ingresá un monto mayor a 0.');
      return;
    }
    run(
      () => api.professors.createStudentPayment(student.studentId, { amount: value, date, notes: notes || undefined }),
      () => {
        setAmount('');
        setNotes('');
      }
    );
  };

  const handleRemove = () => {
    if (!confirm(`¿Quitar a ${student.name} de esta clase? Las clases que ya tomó siguen en su cuenta.`)) return;
    run(() => api.professors.removeEnrollment(student.enrollmentId), onClose);
  };

  const toggleAbsent = (enrollmentId: string, date: string, absent: boolean) =>
    run(() => (absent ? api.professors.unmarkAbsent(enrollmentId, date) : api.professors.markAbsent(enrollmentId, date)));

  // Upcoming class of THIS enrollment, so the professor can mark ahead of
  // time that the student won't come.
  const nextDate = nextClassDate(cls.dayOfWeek, cls.startTime);
  const nextIsAbsent = Boolean(
    account?.absences.some((a) => a.enrollmentId === student.enrollmentId && a.date === nextDate)
  );

  const b = account?.balance;
  const balanceColor = !b ? 'var(--text-main)' : b.balance < 0 ? 'var(--status-blocked)' : 'var(--status-available)';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} aria-label="Cerrar" className="icon-btn modal-close">
          <X size={20} />
        </button>

        <div style={{ marginBottom: '1.1rem', paddingRight: '2rem' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{student.name}</h3>
          <a href={`tel:${student.phone}`} style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Phone size={13} /> {student.phone}
          </a>
          <p style={{ color: 'var(--text-subtle)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
            {DAY_NAMES[cls.dayOfWeek]} {cls.startTime}–{cls.endTime} · {cls.court.name} · {cls.complex.name}
          </p>
        </div>

        {error && <Banner type="error" text={error} marginBottom="1rem" />}

        {/* Price of their turn in this class */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.1rem' }}>
          <label htmlFor="enrollment-price" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Valor de su turno
          </label>
          <input
            id="enrollment-price"
            type="number"
            min="0"
            step="any"
            className="form-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{ padding: '0.4rem 0.6rem' }}
          />
          <button className="btn btn-secondary btn-sm" onClick={handleSavePrice} disabled={busy || Number(price) === student.price}>
            Guardar
          </button>
        </div>
        <p style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', marginTop: '-0.8rem', marginBottom: '1.1rem' }}>
          Un cambio de valor aplica desde la próxima clase; las clases ya dadas mantienen su precio.
        </p>

        {/* Balance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.1rem' }}>
          <div className="pg-kpi">
            <span>Cobrado</span>
            <strong>{b ? money(b.paid) : '—'}</strong>
          </div>
          <div className="pg-kpi">
            <span>Adeudado{b ? ` (${b.classesCharged} ${b.classesCharged === 1 ? 'clase' : 'clases'})` : ''}</span>
            <strong>{b ? money(b.owed) : '—'}</strong>
          </div>
          <div className="pg-kpi">
            <span>{b && b.balance < 0 ? 'Debe' : 'Saldo a favor'}</span>
            <strong style={{ color: balanceColor }}>{b ? money(b.balance) : '—'}</strong>
          </div>
        </div>

        {/* Record a payment */}
        <form onSubmit={handlePay} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '0.85rem', marginBottom: '1.1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Registrar cobro
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
            <input type="number" min="1" step="any" className="form-input" placeholder="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monto" />
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha del cobro" />
          </div>
          <input className="form-input" placeholder="Nota (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: '0.5rem' }} aria-label="Nota" />
          <button type="submit" className="btn btn-lime btn-sm" disabled={busy} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
            <Plus size={14} />
            <span>Registrar cobro</span>
          </button>
        </form>

        {/* Next class: mark ahead of time that the student won't come */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.1rem', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Próxima clase: <strong style={{ color: 'var(--text-main)' }}>{shortDateLabel(nextDate)} {cls.startTime}</strong>
            {nextIsAbsent && <span className="badge badge-blocked" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>AUSENTE</span>}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy || !account}
            onClick={() => toggleAbsent(student.enrollmentId, nextDate, nextIsAbsent)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {nextIsAbsent ? <Undo2 size={13} /> : <UserX size={13} />}
            <span>{nextIsAbsent ? 'Va a venir' : 'Avisó que falta'}</span>
          </button>
        </div>

        {/* Movements: payments, charged classes (can be marked absent) and absences (can be undone) */}
        {account && (account.payments.length > 0 || account.charges.length > 0 || account.absences.length > 0) && (
          <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {[
              ...account.payments.map((p) => ({ kind: 'pay' as const, key: p.id, date: p.date, label: p.notes || 'Cobro', amount: p.amount, id: p.id, enrollmentId: '' })),
              ...account.charges.map((c) => ({ kind: 'charge' as const, key: `c${c.enrollmentId}${c.date}`, date: c.date, label: `Clase ${c.startTime}`, amount: c.price, id: '', enrollmentId: c.enrollmentId })),
              ...account.absences.map((a) => ({ kind: 'absent' as const, key: `a${a.enrollmentId}${a.date}`, date: a.date, label: `Clase ${a.startTime} · ausente`, amount: 0, id: '', enrollmentId: a.enrollmentId })),
            ]
              .sort((x, y) => y.date.localeCompare(x.date))
              .map((m) => (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8rem', padding: '0.35rem 0.5rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', opacity: m.kind === 'absent' ? 0.75 : 1 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{shortDateLabel(m.date)} · {m.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: m.kind === 'pay' ? 'var(--status-available)' : 'var(--text-main)' }}>
                    {m.kind === 'pay' && <>+{money(m.amount)}</>}
                    {m.kind === 'charge' && <>−{money(m.amount)}</>}
                    {m.kind === 'absent' && <span style={{ fontWeight: 600, color: 'var(--text-subtle)' }}>no se cobra</span>}

                    {m.kind === 'pay' && (
                      <button
                        onClick={() => confirm('¿Eliminar este cobro?') && run(() => api.professors.deleteStudentPayment(m.id))}
                        disabled={busy}
                        aria-label="Eliminar cobro"
                        title="Eliminar cobro"
                        className="icon-btn"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {m.kind === 'charge' && (
                      <button
                        onClick={() => toggleAbsent(m.enrollmentId, m.date, false)}
                        disabled={busy}
                        aria-label={`Marcar ausente el ${shortDateLabel(m.date)}`}
                        title="Marcar ausente: esta clase no se cobra"
                        className="badge badge-blocked badge-btn"
                      >
                        Ausente
                      </button>
                    )}
                    {m.kind === 'absent' && (
                      <button
                        onClick={() => toggleAbsent(m.enrollmentId, m.date, true)}
                        disabled={busy}
                        aria-label={`Deshacer ausencia del ${shortDateLabel(m.date)}`}
                        title="Deshacer ausencia"
                        className="icon-btn"
                      >
                        <Undo2 size={12} />
                      </button>
                    )}
                  </span>
                </div>
              ))}
          </div>
        )}

        <button className="btn btn-secondary btn-sm" onClick={handleRemove} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          <UserMinus size={14} />
          <span>Quitar de esta clase</span>
        </button>
      </div>
    </div>
  );
};
