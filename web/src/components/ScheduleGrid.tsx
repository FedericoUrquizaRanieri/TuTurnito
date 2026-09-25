import React, { useState } from 'react';
import {
  Save,
  Download,
  Upload,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Calendar as CalendarIcon,
  Sparkles,
  GraduationCap,
  Lightbulb
} from 'lucide-react';
import { api } from '../api/client';
import { ConflictModal } from './ConflictModal';
import { ReservationModal } from './ReservationModal';
import { Banner } from './Banner';
import type { CourtWithTemplate, Turn, ScheduleConflict } from '../types';

// Re-exported under these names since ComplexDetailPage.tsx/OwnerDashboardPage.tsx
// already import CourtData/PublicTurnData from this module — the shapes now
// live in web/src/types, this just keeps existing call sites unchanged.
export type CourtData = CourtWithTemplate;
export type PublicTurnData = Turn;

interface ScheduleGridProps {
  mode: 'EDIT' | 'PUBLIC';
  complexId: string;
  complexName?: string;
  isApprovedProfessor?: boolean;
  // Edit mode props
  initialCourts?: CourtData[];
  onSaved?: () => void;
  // Public mode props
  turns?: PublicTurnData[];
  selectedDate?: string;
  onRefreshTurns?: () => void;
}

const DEFAULT_HOURS = [
  { start: '08:00', end: '09:30' },
  { start: '09:30', end: '11:00' },
  { start: '11:00', end: '12:30' },
  { start: '14:00', end: '15:30' },
  { start: '15:30', end: '17:00' },
  { start: '17:00', end: '18:30' },
  { start: '18:30', end: '20:00' },
  { start: '20:00', end: '21:30' },
  { start: '21:30', end: '23:00' },
];

const DAYS = [
  { id: 1, name: 'Lunes' },
  { id: 2, name: 'Martes' },
  { id: 3, name: 'Miércoles' },
  { id: 4, name: 'Jueves' },
  { id: 5, name: 'Viernes' },
  { id: 6, name: 'Sábado' },
  { id: 0, name: 'Domingo' },
];

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  mode,
  complexId,
  complexName = 'Complejo',
  isApprovedProfessor = false,
  initialCourts = [],
  onSaved,
  turns = [],
  onRefreshTurns,
}) => {
  // OWNER EDIT MODE STATE
  const [courts, setCourts] = useState<CourtData[]>(() => {
    if (initialCourts && initialCourts.length > 0) return initialCourts;
    return [
      { id: 'temp-1', name: 'Cancha 1 Cristal', order: 0, templateCells: [] },
      { id: 'temp-2', name: 'Cancha 2 Panorámica', order: 1, templateCells: [] },
    ];
  });

  const [selectedDay, setSelectedDay] = useState<number>(1); // Lunes default
  const [bulkPrice, setBulkPrice] = useState<string>('14000');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Conflict state
  const [conflictData, setConflictData] = useState<{
    hasConflicts: boolean;
    conflictType: string;
    conflicts: ScheduleConflict[];
  } | null>(null);

  // PUBLIC MODE STATE
  const [selectedTurnForBooking, setSelectedTurnForBooking] = useState<PublicTurnData | null>(null);

  // Helper to find a template cell in state
  const getCell = (court: CourtData, day: number, startTime: string) => {
    return court.templateCells.find((c) => c.dayOfWeek === day && c.startTime === startTime);
  };

  // Toggle cell availability (Available <-> Blocked)
  const handleToggleCell = (courtId: string, day: number, slot: { start: string; end: string }) => {
    setCourts((prevCourts) =>
      prevCourts.map((court) => {
        if (court.id !== courtId) return court;

        const existingCellIndex = court.templateCells.findIndex(
          (c) => c.dayOfWeek === day && c.startTime === slot.start
        );

        let newCells = [...court.templateCells];
        if (existingCellIndex >= 0) {
          const current = newCells[existingCellIndex];
          newCells[existingCellIndex] = {
            ...current,
            availability: current.availability === 'AVAILABLE' ? 'BLOCKED' : 'AVAILABLE',
          };
        } else {
          newCells.push({
            dayOfWeek: day,
            startTime: slot.start,
            endTime: slot.end,
            price: 12000,
            availability: 'BLOCKED',
          });
        }

        return { ...court, templateCells: newCells };
      })
    );
  };

  // Update cell price
  const handlePriceChange = (courtId: string, day: number, slot: { start: string; end: string }, price: number) => {
    setCourts((prevCourts) =>
      prevCourts.map((court) => {
        if (court.id !== courtId) return court;

        const existingCellIndex = court.templateCells.findIndex(
          (c) => c.dayOfWeek === day && c.startTime === slot.start
        );

        let newCells = [...court.templateCells];
        if (existingCellIndex >= 0) {
          newCells[existingCellIndex] = {
            ...newCells[existingCellIndex],
            price,
          };
        } else {
          newCells.push({
            dayOfWeek: day,
            startTime: slot.start,
            endTime: slot.end,
            price,
            availability: 'AVAILABLE',
          });
        }

        return { ...court, templateCells: newCells };
      })
    );
  };

  // Apply bulk price to all cells of selected day
  const handleApplyBulkPrice = () => {
    const numPrice = Number(bulkPrice);
    if (isNaN(numPrice) || numPrice <= 0) return;

    setCourts((prevCourts) =>
      prevCourts.map((court) => {
        const newCells = [...court.templateCells];

        for (const slot of DEFAULT_HOURS) {
          const idx = newCells.findIndex(
            (c) => c.dayOfWeek === selectedDay && c.startTime === slot.start
          );
          if (idx >= 0) {
            newCells[idx] = { ...newCells[idx], price: numPrice };
          } else {
            newCells.push({
              dayOfWeek: selectedDay,
              startTime: slot.start,
              endTime: slot.end,
              price: numPrice,
              availability: 'AVAILABLE',
            });
          }
        }

        return { ...court, templateCells: newCells };
      })
    );

    setMessage({ type: 'success', text: `Precio $${numPrice.toLocaleString()} aplicado al ${DAYS.find(d => d.id === selectedDay)?.name}.` });
    setTimeout(() => setMessage(null), 3000);
  };

  // Add court
  const handleAddCourt = () => {
    const newCourtNumber = courts.length + 1;
    const newCourt: CourtData = {
      id: `temp-${Date.now()}`,
      name: `Cancha ${newCourtNumber}`,
      order: courts.length,
      templateCells: [],
    };
    setCourts([...courts, newCourt]);
  };

  // Remove court
  const handleRemoveCourt = (courtId: string) => {
    if (courts.length <= 1) {
      alert('Debes mantener al menos una cancha.');
      return;
    }
    setCourts(courts.filter((c) => c.id !== courtId));
  };

  // Rename court
  const handleRenameCourt = (courtId: string, newName: string) => {
    setCourts(courts.map((c) => (c.id === courtId ? { ...c, name: newName } : c)));
  };

  // Save schedule
  const handleSave = async (resolveConflicts?: 'KEEP' | 'CANCEL') => {
    setSaving(true);
    setMessage(null);

    // Build payload
    const allCells: any[] = [];
    for (const court of courts) {
      for (let day = 0; day <= 6; day++) {
        for (const slot of DEFAULT_HOURS) {
          const existing = getCell(court, day, slot.start);
          allCells.push({
            courtId: court.id,
            dayOfWeek: day,
            startTime: slot.start,
            endTime: slot.end,
            price: existing ? existing.price : 12000,
            availability: existing ? existing.availability : 'AVAILABLE',
          });
        }
      }
    }

    try {
      const payload: any = {
        courts: courts.map((c, i) => ({ id: c.id, name: c.name, order: i })),
        cells: allCells,
      };
      if (resolveConflicts) {
        payload.resolveConflicts = resolveConflicts;
      }

      await api.schedules.save(complexId, payload);
      setConflictData(null);
      setMessage({ type: 'success', text: '¡Excel de canchas guardado y turnos actualizados!' });
      setTimeout(() => setMessage(null), 4000);
      if (onSaved) onSaved();
    } catch (err: any) {
      if (err.status === 409 && err.data?.hasConflicts) {
        setConflictData(err.data);
      } else {
        setMessage({ type: 'error', text: err.message || 'Error al guardar la grilla.' });
      }
    } finally {
      setSaving(false);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const blob = await api.schedules.exportExcel(complexId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excel-canchas-${complexId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar Excel: ' + err.message);
    }
  };

  // Import from Excel
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const b64 = (evt.target?.result as string).split(',')[1];
        await api.schedules.importExcel(complexId, b64);
        setMessage({ type: 'success', text: '¡Grilla importada exitosamente desde Excel!' });
        if (onSaved) onSaved();
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Error al importar archivo.' });
      }
    };
    reader.readAsDataURL(file);
  };

  // -------------------------------------------------------------
  // PUBLIC MODE RENDER (Turn calendar for players & visitors)
  // -------------------------------------------------------------
  if (mode === 'PUBLIC') {
    // Group turns by court
    const courtsInTurns = Array.from(
      new Set(turns.map((t) => JSON.stringify({ id: t.courtId, name: t.court.name })))
    ).map((s) => JSON.parse(s));

    return (
      <div>
        {selectedTurnForBooking && (
          <ReservationModal
            turn={selectedTurnForBooking}
            complexName={complexName}
            complexId={complexId}
            isApprovedProfessor={isApprovedProfessor}
            onSuccess={() => {
              if (onRefreshTurns) onRefreshTurns();
            }}
            onClose={() => setSelectedTurnForBooking(null)}
          />
        )}

        {turns.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
          }}>
            <CalendarIcon size={40} color="var(--text-muted)" style={{ marginBottom: '1rem' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.4rem' }}>
              No hay turnos disponibles para esta fecha
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Selecciona otro día en el calendario superior para ver la disponibilidad.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {courtsInTurns.map((court) => {
              const courtTurns = turns.filter((t) => t.courtId === court.id);

              return (
                <div
                  key={court.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.5rem',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1.25rem',
                    borderBottom: '1px solid var(--border-subtle)',
                    paddingBottom: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        boxShadow: '0 0 10px var(--accent-primary)',
                      }} />
                      <h4 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{court.name}</h4>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {courtTurns.filter((t) => t.state === 'AVAILABLE').length} libres hoy
                    </span>
                  </div>

                  {/* Turns Grid for this court */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))',
                    gap: '0.85rem',
                  }}>
                    {courtTurns.map((turn) => {
                      const isAvail = turn.state === 'AVAILABLE';
                      const isOcc = turn.state === 'OCCUPIED';

                      return (
                        <div
                          key={turn.id}
                          style={{
                            background: isAvail
                              ? 'var(--bg-surface)'
                              : isOcc
                              ? 'rgba(118, 136, 163, 0.08)'
                              : 'rgba(239, 93, 99, 0.06)',
                            border: `1px solid ${
                              isAvail
                                ? 'rgba(52, 199, 149, 0.3)'
                                : isOcc
                                ? 'rgba(118, 136, 163, 0.2)'
                                : 'rgba(239, 93, 99, 0.2)'
                            }`,
                            borderRadius: 'var(--radius-md)',
                            padding: '0.85rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            transition: 'all var(--transition-fast)',
                            opacity: isAvail ? 1 : 0.7,
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isAvail ? 'var(--text-main)' : 'var(--text-muted)' }}>
                              {turn.startTime} hs
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              hasta {turn.endTime}
                            </div>
                          </div>

                          <div>
                            <div style={{
                              fontWeight: 800,
                              fontSize: '0.95rem',
                              color: isAvail ? 'var(--accent-secondary)' : 'var(--text-subtle)',
                              marginBottom: '0.4rem',
                            }}>
                              ${turn.price.toLocaleString('es-AR')}
                            </div>

                            {isAvail ? (
                              <button
                                className="btn btn-lime btn-sm"
                                onClick={() => setSelectedTurnForBooking(turn)}
                                style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                              >
                                <Sparkles size={13} />
                                <span>Reservar</span>
                              </button>
                            ) : isOcc ? (
                              <span className="badge badge-occupied" style={{ width: '100%', justifyContent: 'center', gap: '0.3rem' }}>
                                {turn.reservation?.type === 'CLASS' ? (<><GraduationCap size={11} /> Clase</>) : 'Ocupado'}
                              </span>
                            ) : (
                              <span className="badge badge-blocked" style={{ width: '100%', justifyContent: 'center' }}>
                                Bloqueado
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // OWNER EDIT MODE RENDER (The "Excel de canchas" Matrix Grid)
  // -------------------------------------------------------------
  return (
    <div>
      {/* Conflict Modal */}
      {conflictData && (
        <ConflictModal
          conflicts={conflictData.conflicts}
          conflictType={conflictData.conflictType}
          loading={saving}
          onResolve={(decision) => handleSave(decision)}
          onClose={() => setConflictData(null)}
        />
      )}

      {/* Action Bar Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>Excel de Canchas</span>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'var(--accent-secondary)', color: 'var(--text-inverse)', borderRadius: '6px', fontWeight: 800 }}>
              En vivo
            </span>
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Configura las canchas, horarios semanales y precios. La grilla alimenta automáticamente el calendario público.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportExcel}
            title="Exportar a planilla Excel"
          >
            <Download size={15} />
            <span>Exportar .xlsx</span>
          </button>

          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
            <Upload size={15} />
            <span>Importar .xlsx</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              style={{ display: 'none' }}
            />
          </label>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleAddCourt}
          >
            <Plus size={15} />
            <span>Agregar Cancha</span>
          </button>

          <button
            className="btn btn-lime btn-sm"
            disabled={saving}
            onClick={() => handleSave()}
            style={{ fontWeight: 700 }}
          >
            <Save size={15} />
            <span>{saving ? 'Guardando...' : 'Guardar Grilla'}</span>
          </button>
        </div>
      </div>

      {message && <Banner type={message.type} text={message.text} marginBottom="1.25rem" />}

      {/* Day Selector Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        background: 'var(--bg-surface)',
        padding: '0.5rem',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '1.5rem',
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto' }}>
          {DAYS.map((day) => (
            <button
              key={day.id}
              onClick={() => setSelectedDay(day.id)}
              className="btn btn-sm"
              style={{
                background: selectedDay === day.id ? 'var(--accent-secondary)' : 'transparent',
                color: selectedDay === day.id ? 'var(--text-inverse)' : 'var(--text-muted)',
                fontWeight: selectedDay === day.id ? 800 : 600,
                borderRadius: 'var(--radius-md)',
              }}
            >
              {day.name}
            </button>
          ))}
        </div>

        {/* Bulk price editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Precio masivo día:</span>
          <div style={{ position: 'relative', width: '110px' }}>
            <span style={{ position: 'absolute', left: '8px', top: '7px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>$</span>
            <input
              type="number"
              className="form-input"
              style={{ padding: '0.35rem 0.5rem 0.35rem 1.4rem', fontSize: '0.85rem', height: '34px' }}
              value={bulkPrice}
              onChange={(e) => setBulkPrice(e.target.value)}
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleApplyBulkPrice}
            style={{ height: '34px' }}
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Interactive Spreadsheet-like Matrix Grid Table */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflowX: 'auto',
        boxShadow: 'var(--shadow-md)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          minWidth: '900px',
        }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '1rem', width: '220px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                CANCHA / FILA
              </th>
              {DEFAULT_HOURS.map((slot) => (
                <th key={slot.start} style={{ padding: '1rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 700 }}>
                  <div>{slot.start}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>a {slot.end}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courts.map((court) => (
              <tr key={court.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {/* Court Name / Actions Row Header */}
                <td style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.01)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', fontWeight: 700 }}
                      value={court.name}
                      onChange={(e) => handleRenameCourt(court.id, e.target.value)}
                    />
                    <button
                      onClick={() => handleRemoveCourt(court.id)}
                      title="Eliminar cancha"
                      style={{ color: 'var(--status-blocked)', padding: '0.4rem' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>

                {/* Matrix cells for this court on selected day */}
                {DEFAULT_HOURS.map((slot) => {
                  const cell = getCell(court, selectedDay, slot.start);
                  const isBlocked = cell?.availability === 'BLOCKED';
                  const price = cell?.price ?? 12000;

                  return (
                    <td
                      key={slot.start}
                      style={{
                        padding: '0.6rem 0.4rem',
                        textAlign: 'center',
                        background: isBlocked ? 'rgba(239, 93, 99, 0.07)' : 'rgba(52, 199, 149, 0.03)',
                        borderLeft: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                        {/* Toggle state button */}
                        <button
                          onClick={() => handleToggleCell(court.id, selectedDay, slot)}
                          className={`badge ${isBlocked ? 'badge-blocked' : 'badge-available'}`}
                          style={{ cursor: 'pointer', padding: '0.2rem 0.45rem', fontSize: '0.68rem', width: '90px', justifyContent: 'center' }}
                          title="Click para alternar Disponibilidad"
                        >
                          {isBlocked ? <Lock size={10} /> : <Unlock size={10} />}
                          <span>{isBlocked ? 'BLOQUEADO' : 'DISPONIBLE'}</span>
                        </button>

                        {/* Inline price edit */}
                        <div style={{ position: 'relative', width: '90px' }}>
                          <span style={{ position: 'absolute', left: '6px', top: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>$</span>
                          <input
                            type="number"
                            step="500"
                            disabled={isBlocked}
                            value={price}
                            onChange={(e) => handlePriceChange(court.id, selectedDay, slot, Number(e.target.value))}
                            style={{
                              width: '100%',
                              padding: '0.25rem 0.25rem 0.25rem 1.1rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                              color: isBlocked ? 'var(--text-subtle)' : 'var(--text-main)',
                              textAlign: 'right',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: '1.25rem',
        padding: '1rem',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.825rem',
        color: 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <Lightbulb size={16} color="var(--accent-secondary)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <span><strong>Tip:</strong> Haz clic en el botón de estado para bloquear u habilitar turnos. Los cambios impactarán en los turnos futuros al presionar <strong>"Guardar Grilla"</strong>.</span>
        </div>
        <button
          className="btn btn-lime btn-sm"
          disabled={saving}
          onClick={() => handleSave()}
        >
          <Save size={14} />
          <span>Guardar Cambios</span>
        </button>
      </div>
    </div>
  );
};
