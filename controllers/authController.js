import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import { validationResult } from 'express-validator';

// Función auxiliar para verificar membresía activa
const checkActiveMembership = async (userId) => {
  try {
    const membershipResult = await db.query(
      `SELECT um.estado, um.fecha_fin, m.tipo 
       FROM usuario_membresias um 
       JOIN membresias m ON um.membresia_id = m.id 
       WHERE um.usuario_id = $1 
       AND um.estado = 'activa' 
       AND um.fecha_fin >= CURRENT_DATE
       ORDER BY um.fecha_fin DESC 
       LIMIT 1`,
      [userId]
    );

    return membershipResult.rows.length > 0 ? membershipResult.rows[0] : null;
  } catch (error) {
    console.error('Error verificando membresía:', error);
    return null;
  }
};


// Login de usuario
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar si el usuario existe
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    // Validar membresía para usuarios tipo 'user'
    if (user.role === 'user') {
      const activeMembership = await checkActiveMembership(user.id);
      
      if (!activeMembership) {
        return res.status(403).json({ 
          error: 'No tienes una membresía activa. Por favor, adquiere una membresía para acceder al sistema.' 
        });
      }
 
      // Verificar si la membresía está próxima a expirar (menos de 7 días)
      const daysUntilExpiry = Math.ceil((new Date(activeMembership.fecha_fin) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 7) {
        console.log(`Membresía del usuario ${user.nombre} expira en ${daysUntilExpiry} días`);
      }

      user.membresia_activa = activeMembership;
    }

    // Generar token JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        role: user.role 
      },
      process.env.JWT_SECRET || 'secreto_tempest',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login exitoso',
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};


// Registrar nuevo usuario
const register = async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { nombre, email, password, role = 'user' } = req.body;

    // Verificar si el usuario ya existe
    const userExists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // Validar que el rol sea válido
    const validRoles = ['admin', 'user'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // Hash de la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear usuario
    const result = await db.query(
      'INSERT INTO users (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, role',
      [nombre, email, hashedPassword, role]
    );

    // Generar token JWT
    const token = jwt.sign(
      { 
        userId: result.rows[0].id,
        role: result.rows[0].role 
      },
      process.env.JWT_SECRET || 'secreto_tempest',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: result.rows[0],
      token
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};


// Obtener perfil de usuario con información de membresía
const getProfile = async (req, res) => {
  try {
    let userWithMembership = { ...req.user };
    
    // Si es usuario regular, obtener información de membresía
    if (req.user.role === 'user') {
      const activeMembership = await checkActiveMembership(req.user.id);
      userWithMembership.membresia = activeMembership;
    }

    res.json({ user: userWithMembership });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Editar perfil de usuario
const updateProfile = async (req, res) => {
  try {
    const { nombre } = req.body;
    const userId = req.user.id;

    const result = await db.query(
      'UPDATE users SET nombre = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, nombre, email, role',
      [nombre, userId]
    );

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Listar todos los usuarios (solo admin)
const getAllUsers = async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador' });
    }

    const result = await db.query(
      `SELECT u.id, u.nombre, u.email, u.role, u.created_at, u.updated_at,
              um.estado as membresia_estado, um.fecha_fin as membresia_fin,
              m.tipo as membresia_tipo
       FROM users u
       LEFT JOIN usuario_membresias um ON u.id = um.usuario_id AND um.estado = 'activa' AND um.fecha_fin >= CURRENT_DATE
       LEFT JOIN membresias m ON um.membresia_id = m.id
       ORDER BY u.created_at DESC`
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Obtener usuario por ID (solo admin)
const getUserById = async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador' });
    }

    const { id } = req.params;

    const result = await db.query(
      `SELECT u.id, u.nombre, u.email, u.role, u.created_at, u.updated_at,
              um.estado as membresia_estado, um.fecha_inicio as membresia_inicio, 
              um.fecha_fin as membresia_fin, um.monto_pagado, um.metodo_pago,
              m.tipo as membresia_tipo, m.descripcion as membresia_descripcion
       FROM users u
       LEFT JOIN usuario_membresias um ON u.id = um.usuario_id AND um.estado = 'activa' AND um.fecha_fin >= CURRENT_DATE
       LEFT JOIN membresias m ON um.membresia_id = m.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Editar cualquier usuario (solo admin)
const updateUser = async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador' });
    }

    const { id } = req.params;
    const { nombre, email, role } = req.body;

    // Verificar si el usuario existe
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Validar que el rol sea válido
    const validRoles = ['admin', 'user'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    const result = await db.query(
      'UPDATE users SET nombre = COALESCE($1, nombre), email = COALESCE($2, email), role = COALESCE($3, role), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id, nombre, email, role',
      [nombre, email, role, id]
    );

    res.json({
      message: 'Usuario actualizado exitosamente',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Eliminar usuario (solo admin)
const deleteUser = async (req, res) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador' });
    }

    const { id } = req.params;

    // No permitir que un admin se elimine a sí mismo
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    // Verificar si el usuario existe
    const userExists = await db.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await db.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Crear usuario sin estar logueado (solo para desarrollo o endpoints públicos controlados)
const createUserByAdmin = async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Errores de validación:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { nombre, email, password, role = 'user' } = req.body;

    // Debug: verificar los datos recibidos
    console.log('Datos recibidos:',{ nombre, email, password, role });

    // Verificar que el password esté presente
    if (!password) {
      return res.status(400).json({ error: 'La contraseña es requerida' });
    }

    // Verificar si el usuario ya existe
    const userExists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // Validar que el rol sea válido
    const validRoles = ['admin', 'user'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // Hash de la contraseña
    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // Crear usuario
      const result = await db.query(
        'INSERT INTO users (nombre, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, role',
        [nombre, email, hashedPassword, role]
      );

      res.status(201).json({
        message: 'Usuario creado exitosamente',
        user: result.rows[0]
      });
    } catch (hashError) {
      console.error('Error hashing password:', hashError);
      return res.status(500).json({ error: 'Error al procesar la contraseña' });
    }
  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const logout = (req, res) => {
  try {
    // En una implementación con JWT, el logout se maneja principalmente del lado del cliente
    // eliminando el token. Aquí simplemente devolvemos una respuesta exitosa.
    res.json({ 
      message: 'Sesión cerrada exitosamente',
      logout: true
    });
  } catch (error) {
    console.error('Error cerrando sesión:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

export { 
  register, 
  login, 
  getProfile, 
  updateProfile, 
  getAllUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  createUserByAdmin,
  logout
};