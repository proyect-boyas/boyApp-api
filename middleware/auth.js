import jwt from 'jsonwebtoken';
import db from '../config/database.js';

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET );
    
    // Verificar que el usuario aún existe en la base de datos y obtener su rol
    const result = await db.query(
      'SELECT id, nombre, email, role FROM users WHERE id = $1', 
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    const user = result.rows[0];
    
    // Agregar toda la información del usuario, incluyendo el rol
    req.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expirado' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Token inválido' });
    } else {
      return res.status(403).json({ error: 'Error al verificar token' });
    }
  }
};

// Middleware para verificar rol de administrador
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol de administrador' });
  }
  next();
};

// Middleware para verificar rol específico
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Acceso denegado. Se requieren los roles: ${roles.join(', ')}` 
      });
    }
    next();
  };
};

// Middleware para verificar si es el mismo usuario o admin
const requireSameUserOrAdmin = (req, res, next) => {
  const requestedUserId = parseInt(req.params.id);
  
  if (req.user.id !== requestedUserId && req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Solo puedes acceder a tu propia información o se requiere rol de administrador' 
    });
  }
  next();
};




export { 
  authenticateToken, 
  requireAdmin, 
  requireRole, 
  requireSameUserOrAdmin

};