import './env'; // must be the first import: loads .env and fails fast if required vars are missing
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import complexesRoutes from './routes/complexes.routes';
import schedulesRoutes from './routes/schedules.routes';
import turnsRoutes from './routes/turns.routes';
import reservationsRoutes from './routes/reservations.routes';
import professorsRoutes from './routes/professors.routes';
import { authenticateToken } from './middleware/auth';
import { HttpError } from './middleware/HttpError';

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const allowedOrigins = IS_PRODUCTION
  ? [CLIENT_URL]
  : [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'];

const skipRateLimit = () => process.env.NODE_ENV === 'test';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: 'Demasiadas solicitudes seguidas. Esperá un momento y probá de nuevo.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter);
app.use(authenticateToken);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'TuTurnito API',
    timestamp: new Date().toISOString(),
  });
});

// Route mountings
app.use('/api/auth', authRoutes);
app.use('/api/complexes', complexesRoutes);
app.use('/api/complexes', schedulesRoutes);
app.use('/api/complexes', turnsRoutes);
app.use('/api', reservationsRoutes);
app.use('/api/professors', professorsRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada.` });
});

// Centralized error handler. Routes/services throw HttpError when they need
// a specific status/message (matching what each one used to hardcode in its
// own try/catch); anything else is a genuinely unexpected error.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.publicMessage });
    return;
  }
  // Body errors raised by express.json() before reaching any route.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Los datos enviados son demasiado grandes.' });
    return;
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🎾 Servidor TuTurnito corriendo en http://localhost:${PORT}`);
  });
}

export default app;
