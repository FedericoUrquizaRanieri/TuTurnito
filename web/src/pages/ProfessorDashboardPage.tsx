import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api/client';
import { Users, Plus, Building, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RoleGateCard } from '../components/RoleGateCard';
import { ComplexClassSchedules } from '../components/professor/ComplexClassSchedules';
import { WeeklyClassGrid } from '../components/professor/WeeklyClassGrid';
import type { ClassSchedule, Complex, ProfessorRequest, StudentWithBalance, WeeklyClass } from '../types';

export const ProfessorDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'COMPLEXES' | 'STUDENTS'>('COMPLEXES');

  // Mis complejos: linked complexes, sent requests and class schedules
  const [approvedComplexes, setApprovedComplexes] = useState<Complex[]>([]);
  const [requests, setRequests] = useState<ProfessorRequest[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [loadingComplexes, setLoadingComplexes] = useState(false);

  // Alumnos: weekly class grid with each class's students and balances
  const [classes, setClasses] = useState<WeeklyClass[]>([]);
  const [students, setStudents] = useState<StudentWithBalance[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const loadComplexes = useCallback(async () => {
    setLoadingComplexes(true);
    try {
      const [complexesRes, schedulesRes] = await Promise.all([
        api.professors.getMyComplexes(),
        api.professors.getClassSchedules(),
      ]);
      setApprovedComplexes(complexesRes.approvedComplexes || []);
      setRequests(complexesRes.requests || []);
      setSchedules(schedulesRes.schedules || []);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar tus complejos y horarios.');
    } finally {
      setLoadingComplexes(false);
    }
  }, [toast]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const res = await api.professors.getWeeklyClasses();
      setClasses(res.classes || []);
      setStudents(res.students || []);
    } catch (err) {
      toast.error(err, 'No se pudieron cargar tus clases.');
    } finally {
      setLoadingClasses(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.role !== 'PROFESOR') return;
    loadComplexes();
    loadClasses();
  }, [user, loadComplexes, loadClasses]);

  // Schedules shape the weekly grid, so a change there reloads both tabs.
  const handleSchedulesChanged = () => {
    loadComplexes();
    loadClasses();
  };

  if (!user || user.role !== 'PROFESOR') {
    return (
      <RoleGateCard
        icon={<ShieldAlert size={48} color="#a3e635" />}
        title="Acceso Exclusivo para Profesores"
        description="Inicia sesión con tu cuenta de Profesor para gestionar tus clases y alumnos."
        cta="Iniciar Sesión como Profesor"
        ctaHref="/auth?mode=login"
        ctaVariant="lime"
      />
    );
  }

  const owingCount = students.filter((s) => s.balance.balance < 0).length;

  return (
    <div className="main-content">
      {/* Header */}
      <section style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '2rem 0',
      }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span className="badge badge-role">Panel de Profesor</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.name}</span>
              </div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#ffffff' }}>
                Gestión de Clases y Alumnos
              </h1>
            </div>

            <Link to="/" className="btn btn-secondary btn-sm">
              <Building size={15} />
              <span>Explorar Catálogo de Complejos</span>
            </Link>
          </div>

          {/* Navigation Tabs */}
          <div className="tabs-header" style={{ marginTop: '1.75rem', marginBottom: 0 }}>
            <button
              className={`tab-btn ${activeTab === 'COMPLEXES' ? 'active' : ''}`}
              onClick={() => setActiveTab('COMPLEXES')}
            >
              <Building size={16} />
              <span>Mis Complejos ({approvedComplexes.length})</span>
            </button>

            <button
              className={`tab-btn ${activeTab === 'STUDENTS' ? 'active' : ''}`}
              onClick={() => setActiveTab('STUDENTS')}
            >
              <Users size={16} />
              <span>Alumnos ({students.length})</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Tab Content */}
      <section className="container" style={{ paddingTop: '2rem' }}>
        {/* TAB 1: MIS COMPLEJOS — linked complexes and their class schedules */}
        {activeTab === 'COMPLEXES' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Complejos Vinculados</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Reservá una cancha algunos días de la semana en una franja horaria: cada turno de la franja es una clase y se reserva todas las semanas.
                </p>
              </div>

              <Link to="/" className="btn btn-secondary btn-sm">
                <Plus size={15} />
                <span>Solicitar unirme a otro complejo</span>
              </Link>
            </div>

            {loadingComplexes && approvedComplexes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
                Cargando complejos...
              </div>
            ) : approvedComplexes.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '3.5rem 2rem',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
              }}>
                <Building size={48} color="var(--text-subtle)" style={{ marginBottom: '1rem' }} />
                <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Aún no estás vinculado a ningún complejo
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '440px', margin: '0 auto 1.5rem auto' }}>
                  Navega por el catálogo de complejos y solicita unirte al club donde deseas dictar tus clases.
                </p>
                <Link to="/" className="btn btn-primary">
                  Ver Complejos Disponibles
                </Link>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
                gap: '1.5rem',
                marginBottom: '2.5rem',
              }}>
                {approvedComplexes.map((c) => (
                  <ComplexClassSchedules
                    key={c.id}
                    complex={c}
                    schedules={schedules.filter((s) => s.complexId === c.id)}
                    onChanged={handleSchedulesChanged}
                  />
                ))}
              </div>
            )}

            {/* Pending Requests */}
            {requests.length > 0 && (
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--text-muted)' }}>
                  Solicitudes Enviadas
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {requests.map((r) => (
                    <div
                      key={r.id}
                      className="card"
                      style={{
                        padding: '1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.complex?.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Enviada el {new Date(r.requestedAt).toLocaleDateString('es-AR')}
                        </div>
                      </div>

                      <span className={`badge ${r.status === 'APPROVED' ? 'badge-available' : r.status === 'REJECTED' ? 'badge-blocked' : 'badge-pending'}`}>
                        {r.status === 'APPROVED' ? 'APROBADA' : r.status === 'REJECTED' ? 'RECHAZADA' : 'PENDIENTE'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ALUMNOS — weekly grid of classes with their students */}
        {activeTab === 'STUDENTS' && (
          <div>
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Mis clases de la semana</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Cada clase admite hasta 4 alumnos. Cada clase dictada suma el valor del turno del alumno a su deuda; los cobros que registrás la descuentan.
                {owingCount > 0 && <> <strong style={{ color: 'var(--status-blocked)' }}>{owingCount} {owingCount === 1 ? 'alumno debe' : 'alumnos deben'}.</strong></>}
              </p>
            </div>

            {loadingClasses && classes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>Cargando clases...</div>
            ) : (
              <WeeklyClassGrid classes={classes} students={students} onChanged={loadClasses} />
            )}
          </div>
        )}
      </section>
    </div>
  );
};
