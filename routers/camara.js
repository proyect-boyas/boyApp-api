import express from 'express';
import { 
  getCamaras,  
  getCamara, 
  createCamara, 
  updateCamara, 
  deleteCamara, 
  updateMantenimientoCamara,
  getCamarasDisponibles
} from '../controllers/camaraController.js';
import { authenticateToken } from '../middleware/auth.js';
import { camaraValidation, mantenimientoValidation } from '../middleware/validation.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas básicas
router.get('/', getCamaras);
router.get('/disponibles', getCamarasDisponibles);
router.get('/:id', getCamara);
router.post('/', camaraValidation, createCamara);
router.put('/:id', camaraValidation, updateCamara);
router.delete('/:id', deleteCamara);

// Rutas específicas
router.put('/:id/mantenimiento', mantenimientoValidation, updateMantenimientoCamara);

export default router;