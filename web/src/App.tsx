import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { ComplexDetailPage } from './pages/ComplexDetailPage';
import { OwnerDashboardPage } from './pages/OwnerDashboardPage';
import { ProfessorDashboardPage } from './pages/ProfessorDashboardPage';
import { MyReservationsPage } from './pages/MyReservationsPage';
import { AuthPage } from './pages/AuthPage';
import { ProfilePage } from './pages/ProfilePage';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="app-container">
            <Navbar />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/complexes/:id" element={<ComplexDetailPage />} />
              <Route path="/my-reservations" element={<MyReservationsPage />} />
              <Route path="/owner" element={<OwnerDashboardPage />} />
              <Route path="/professor" element={<ProfessorDashboardPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              {/* Public complex page at the root (tuturnito.com/<slug>) — must stay
                  after every fixed route; reserved words are enforced server-side. */}
              <Route path="/:slug" element={<ComplexDetailPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Footer />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
