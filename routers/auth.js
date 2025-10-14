import express from 'express';
import { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  getAllUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  createUserByAdmin ,
  changePassword,
 logout
} from '../controllers/authController.js';
import { 
  authenticateToken, 
  requireAdmin 
} from '../middleware/auth.js';
import { userValidation } from '../middleware/validation.js';

const router = express.Router();

// Rutas públicas
router.post('/register', userValidation.register, register);
router.post('/login', userValidation.login, login);
// Rutas protegidas (requieren autenticación)
router.post('/logout', authenticateToken, logout); 
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, userValidation.updateProfile, updateProfile);
router.put('/changePassword',authenticateToken,userValidation.changePassword,changePassword);

// Rutas de administración (requieren rol admin)
router.post('/admin/users', authenticateToken, requireAdmin,  createUserByAdmin); 
router.get('/admin/users', authenticateToken, requireAdmin, getAllUsers);
router.get('/admin/users/:id', authenticateToken, requireAdmin, getUserById);
router.put('/admin/users/:id', authenticateToken, requireAdmin, userValidation.updateUser, updateUser);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, deleteUser);

export default router;