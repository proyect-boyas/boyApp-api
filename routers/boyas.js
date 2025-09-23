import express from 'express';
import { 
  getBoyas, getBoya, createBoya, updateBoya, deleteBoya 
} from '../controllers/boyaController.js';
import { authenticateToken } from '../middleware/auth.js';
import { boyaValidation } from '../middleware/validation.js';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Rutas
router.get('/', getBoyas);
router.get('/:id', getBoya);
router.post('/', boyaValidation, createBoya);
router.put('/:id', boyaValidation, updateBoya);
router.delete('/:id', deleteBoya);

export default router;