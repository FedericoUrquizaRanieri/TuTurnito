import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Search, MapPin, LayoutGrid, ChevronRight, PlusCircle, SearchX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getComplexPhoto, HERO_PHOTO_ID } from '../lib/stockPhotos';
import type { ComplexSummary } from '../types';

const heroPhotoUrl = `https://images.unsplash.com/photo-${HERO_PHOTO_ID}?auto=format&fit=crop&w=1600&q=80`;

export const HomePage: React.FC = () => {
  const { user } = useAuth();
  const [complexes, setComplexes] = useState<ComplexSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');

  const fetchComplexes = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedLocation !== 'ALL') params.location = selectedLocation;

      const res = await api.complexes.list(params);
      setComplexes(res.complexes || []);
    } catch (err) {
      console.error('Error loading complexes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchComplexes();
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchTerm, selectedLocation]);

  const uniqueLocations = Array.from(new Set(complexes.map((c) => c.location))).filter(Boolean);

  return (
    <div className="main-content">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-photo">
          <img src={heroPhotoUrl} alt="" loading="eager" />
        </div>
        <div className="container">
          <div className="hero-inner">
            <h1 className="hero-title">
              Encontrá cancha.
              <br />
              Reservá en minutos.
            </h1>

            <p style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--text-muted)',
              marginBottom: '2rem',
              lineHeight: 1.6,
              maxWidth: '480px',
            }}>
              Mirá la disponibilidad real de cada club y confirmá tu turno sin llamados ni grupos de WhatsApp.
            </p>

            {/* Search Kiosk */}
            <div className="kiosk">
              <Search size={20} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Buscá un club, un barrio o una ciudad"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-main)',
                  fontSize: '1rem',
                  outline: 'none',
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={fetchComplexes} style={{ height: '42px', padding: '0 1.25rem' }}>
                Buscar
              </button>
            </div>

            {/* Location Filter Tabs */}
            <div className="filter-tabs">
              <button
                className={`filter-tab ${selectedLocation === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedLocation('ALL')}
              >
                Todos
              </button>
              {uniqueLocations.map((loc) => (
                <button
                  key={loc}
                  className={`filter-tab ${selectedLocation === loc ? 'active' : ''}`}
                  onClick={() => setSelectedLocation(loc)}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Content */}
      <section className="container" style={{ paddingTop: '3rem' }}>
        {/* Owner Invitation Banner if owner without complex */}
        {user?.role === 'DUEÑO' && (!user.ownedComplexes || user.ownedComplexes.length === 0) && (
          <div style={{
            background: 'rgba(58, 122, 240, 0.1)',
            border: '1px solid rgba(58, 122, 240, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                ¡Bienvenido a TuTurnito, {user.name}!
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Aún no tienes un complejo registrado. Da de alta tu club y configura tu Excel de Canchas para recibir reservas hoy mismo.
              </p>
            </div>
            <Link to="/owner" className="btn btn-lime">
              <PlusCircle size={18} />
              <span>Registrar mi Complejo</span>
            </Link>
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <h2 style={{ fontSize: 'var(--text-3xl)', color: '#ffffff' }}>
            Complejos
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {complexes.length} {complexes.length === 1 ? 'complejo encontrado' : 'complejos encontrados'}
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
            Cargando catálogo de complejos...
          </div>
        ) : complexes.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
          }}>
            <SearchX size={40} color="var(--text-subtle)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>
              No encontramos complejos con esos filtros
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
              Probá con otro nombre, barrio o ciudad, o mirá el catálogo completo.
            </p>
            <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setSelectedLocation('ALL'); }}>
              Ver todos los complejos
            </button>
          </div>
        ) : (
          <div className="fixture-list">
            {complexes.map((complex) => (
              <div key={complex.id} className="fixture-row">
                <div className="fixture-thumb">
                  <img src={complex.imageUrl || getComplexPhoto(complex.id)} alt={complex.name} />
                </div>

                <div>
                  <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: '0.3rem' }}>
                    {complex.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <MapPin size={13} color="var(--accent-cyan)" />
                      {complex.location}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <LayoutGrid size={13} />
                      {complex.courtCount} {complex.courtCount === 1 ? 'cancha' : 'canchas'}
                    </span>
                  </div>
                </div>

                <div className="fixture-actions" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="fixture-price">
                      {complex.minPrice ? `$${complex.minPrice.toLocaleString('es-AR')}` : 'Consultar'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>por turno</div>
                  </div>
                  <Link to={`/complexes/${complex.id}`} className="btn btn-primary btn-sm">
                    <span>Ver disponibilidad</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
