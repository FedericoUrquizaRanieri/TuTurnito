import React, { useMemo, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { api } from '../../api/client';
import { Banner } from '../Banner';
import { DAY_NAMES, DAY_NAMES_SHORT } from '../../lib/dates';
import { toMinutes } from '../../lib/slots';
import { StudentAccountModal } from './StudentAccountModal';
import type { StudentWithBalance, WeeklyClass } from '../../types';

interface WeeklyClassGridProps {
  classes: WeeklyClass[];
  students: StudentWithBalance[];
  onChanged: () => void;
}

const MAX_STUDENTS = 4;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Weekly grid with only the professor's classes; each class lists its students (up to 4). */
export const WeeklyClassGrid: React.FC<WeeklyClassGridProps> = ({ classes, students, onChanged }) => {
  const [selected, setSelected] = useState<{ classKey: string; enrollmentId: string } | null>(null);
  const [addingTo, setAddingTo] = useState<WeeklyClass | null>(null);

  const days = useMemo(() => WEEK_ORDER.filter((d) => classes.some((c) => c.dayOfWeek === d)), [classes]);
  const times = useMemo(
    () => Array.from(new Set(classes.map((c) => c.startTime))).sort((a, b) => toMinutes(a) - toMinutes(b)),
    [classes]
  );

  // Re-derive the selection from fresh data so the modal reflects changes.
  const selectedClass = selected ? classes.find((c) => c.key === selected.classKey) : undefined;
  const selectedStudent = selectedClass?.students.find((s) => s.enrollmentId === selected?.enrollmentId);

  if (classes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>Todavía no tenés clases en la semana</h4>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Reservá un horario de clases desde “Mis complejos” y acá vas a poder cargar a tus alumnos.
        </p>
      </div>
    );
  }

  return (
    <div>
      {selectedClass && selectedStudent && (
        <StudentAccountModal cls={selectedClass} student={selectedStudent} onChanged={onChanged} onClose={() => setSelected(null)} />
      )}
      {addingTo && (
        <AddStudentModal cls={addingTo} students={students} onAdded={onChanged} onClose={() => setAddingTo(null)} />
      )}

      <div className="og-wrap">
        <table className="og-table pg-table">
          <thead>
            <tr>
              <th className="og-court">HORA</th>
              {days.map((d) => <th key={d}>{DAY_NAMES[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <tr key={time}>
                <td className="og-court">{time}</td>
                {days.map((d) => {
                  const cellClasses = classes.filter((c) => c.dayOfWeek === d && c.startTime === time);
                  return (
                    <td key={d}>
                      {cellClasses.length === 0 ? (
                        <div className="og-empty" aria-hidden="true" />
                      ) : (
                        cellClasses.map((c) => (
                          <div key={c.key} className="pg-class">
                            <div className="pg-class-head">
                              <span>{c.court.name}</span>
                              <span className="pg-count">{c.students.length}/{MAX_STUDENTS}</span>
                            </div>
                            <div className="pg-class-sub">{c.complex.name} · hasta {c.endTime}</div>
                            <div className="pg-students">
                              {c.students.map((s) => (
                                <button
                                  key={s.enrollmentId}
                                  className={`pg-student ${s.balance.balance < 0 ? 'owes' : ''}`}
                                  onClick={() => setSelected({ classKey: c.key, enrollmentId: s.enrollmentId })}
                                  title={s.balance.balance < 0 ? `Debe $${(-s.balance.balance).toLocaleString('es-AR')}` : 'Al día'}
                                >
                                  <span className="pg-dot" aria-hidden="true" />
                                  {s.name}
                                </button>
                              ))}
                              {c.students.length < MAX_STUDENTS && (
                                <button className="pg-add" onClick={() => setAddingTo(c)}>
                                  <UserPlus size={12} /> Alumno
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '0.6rem' }}>
        <span className="pg-dot owes-dot" /> alumno con deuda · tocá un alumno para ver su cuenta y registrar un cobro.
      </p>
    </div>
  );
};

interface AddStudentModalProps {
  cls: WeeklyClass;
  students: StudentWithBalance[];
  onAdded: () => void;
  onClose: () => void;
}

const AddStudentModal: React.FC<AddStudentModalProps> = ({ cls, students, onAdded, onClose }) => {
  const available = students.filter((s) => !cls.students.some((cs) => cs.studentId === s.id));
  const [mode, setMode] = useState<'EXISTING' | 'NEW'>(available.length ? 'EXISTING' : 'NEW');
  const [studentId, setStudentId] = useState(available[0]?.id || '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [price, setPrice] = useState(String(cls.students[0]?.price ?? 8000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.professors.addEnrollment({
        classScheduleId: cls.classScheduleId,
        dayOfWeek: cls.dayOfWeek,
        startTime: cls.startTime,
        price: Number(price),
        ...(mode === 'EXISTING' ? { studentId } : { newStudent: { name, phone } }),
      });
      onAdded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo agregar el alumno.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button onClick={onClose} aria-label="Cerrar" className="icon-btn modal-close">
          <X size={20} />
        </button>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Agregar alumno</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {DAY_NAMES_SHORT[cls.dayOfWeek]} {cls.startTime} · {cls.court.name} · {cls.complex.name}
        </p>

        {error && <Banner type="error" text={error} marginBottom="1rem" />}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {available.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className={`btn btn-sm ${mode === 'EXISTING' ? 'btn-lime' : 'btn-secondary'}`} onClick={() => setMode('EXISTING')}>
                Alumno existente
              </button>
              <button type="button" className={`btn btn-sm ${mode === 'NEW' ? 'btn-lime' : 'btn-secondary'}`} onClick={() => setMode('NEW')}>
                Nuevo alumno
              </button>
            </div>
          )}

          {mode === 'EXISTING' ? (
            <select className="form-select" value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Alumno">
              {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <>
              <input className="form-input" required minLength={2} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
              <input className="form-input" required minLength={6} placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Teléfono" />
            </>
          )}

          <div>
            <label className="form-label" htmlFor="new-enrollment-price">Valor de su turno en esta clase</label>
            <input id="new-enrollment-price" type="number" min="0" step="any" required className="form-input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>

          <button type="submit" className="btn btn-lime" disabled={busy || (mode === 'EXISTING' && !studentId)} style={{ justifyContent: 'center' }}>
            <UserPlus size={16} />
            <span>{busy ? 'Agregando...' : 'Agregar a la clase'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
