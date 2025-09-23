import express, { Router } from 'express';
import { 
  getSondas,  
  getSonda, 
  getSondasDisponibles,
  createSonda, 
  updateSonda, 
  deleteSonda, 
  updateMantenimiento
 
} from '../controllers/sondaController.js';
import { authenticateToken } from '../middleware/auth.js';
import { sondaValidation } from '../middleware/validation.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas básicas

router.get('/', getSondas);
router.get('/disponibles',getSondasDisponibles);
router.get('/:id', getSonda);

router.post('/', sondaValidation, createSonda);
router.put('/:id', sondaValidation, updateSonda);
router.delete('/:id', deleteSonda);

// Rutas específicas
router.put('/:id/mantenimiento', updateMantenimiento);

export default router;
