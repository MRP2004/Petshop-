import express from 'express';
import cors from 'cors';

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  }),
);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'API Petshop funcionando correctamente',
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    error: 'Error interno del servidor',
  });
});

export default app;