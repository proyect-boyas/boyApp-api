import { Router } from 'express';
import authRoutes from './auth.js';
import boyaRoutes from './boyas.js';
import stationRoutes from './station.js';
import systemRoutes from './system.js';
import SondasRoutes from './sondas.js';
import CamaraRotes from './camara.js';
const router = Router();

// Montar todas las rutas
router.use('/auth', authRoutes);
router.use('/boyas', boyaRoutes);
router.use('/stations', stationRoutes);
router.use('/sondas', SondasRoutes);
router.use('/camaras', CamaraRotes);
router.use('/', systemRoutes); // Rutas del sistema en la raíz

export default router;