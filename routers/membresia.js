import express from 'express';
import {
  getMembresias,
  getMembresiaById,
  asignarMembresiaUsuario,
  getMembresiasUsuario,
  getMembresiaActivaUsuario,
  renovarMembresia,
  cancelarMembresia,
  tieneMembresiaActiva,
  getEstadisticas,
  actualizarEstadosExpirados
} from '../controllers/membresiaController.js';
import { 
  authenticateToken, 
  requireAdmin 
} from '../middleware/auth.js';

const router = express.Router();

// Rutas públicas de membresías
router.get('/membresias', getMembresias);
router.get('/membresias/:id', getMembresiaById);

// Rutas protegidas para usuarios
router.get('/usuarios/:usuario_id/membresias', authenticateToken, getMembresiasUsuario);
router.get('/usuarios/:usuario_id/membresia-activa', authenticateToken, getMembresiaActivaUsuario);
router.get('/usuarios/:usuario_id/tiene-membresia-activa', authenticateToken, tieneMembresiaActiva);

// Rutas de administración (requieren rol admin)
router.post('/admin/membresias/asignar', authenticateToken, requireAdmin, asignarMembresiaUsuario);
router.put('/admin/membresias-usuario/:id/renovar', authenticateToken, requireAdmin, renovarMembresia);
router.put('/admin/membresias-usuario/:id/cancelar', authenticateToken, requireAdmin, cancelarMembresia);
router.get('/admin/estadisticas/membresias', authenticateToken, requireAdmin, getEstadisticas);
router.put('/admin/membresias/actualizar-estados', authenticateToken, requireAdmin, actualizarEstadosExpirados);

export default router;