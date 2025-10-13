import db from '../config/database.js';
import { validationResult } from 'express-validator';

// Obtener todas las membresías disponibles
const getMembresias = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM membresias 
      WHERE deleted_at IS NULL 
      ORDER BY precio ASC
    `);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error al obtener membresías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener membresías',
      error: error.message
    });
  }
};

// Obtener una membresía por ID
const getMembresiaById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT * FROM membresias 
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Membresía no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al obtener membresía:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener membresía',
      error: error.message
    });
  }
};

// Asignar una membresía a un usuario
const asignarMembresiaUsuario = async (req, res) => {
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    const { usuario_id, membresia_id, metodo_pago, referencia_pago } = req.body;

    // Verificar si el usuario existe
    const usuarioResult = await client.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [usuario_id]
    );
    
    if (usuarioResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'El usuario no existe'
      });
    }

    // Verificar si la membresía existe
    const membresiaResult = await client.query(
      'SELECT * FROM membresias WHERE id = $1 AND deleted_at IS NULL',
      [membresia_id]
    );
    
    if (membresiaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'La membresía no existe'
      });
    }

    const membresia = membresiaResult.rows[0];

    // Calcular fechas
    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + membresia.duracion_dias);

    // Insertar la asignación de membresía
    const insertResult = await client.query(`
      INSERT INTO usuario_membresias 
      (usuario_id, membresia_id, fecha_inicio, fecha_fin, monto_pagado, estado, metodo_pago, referencia_pago) 
      VALUES ($1, $2, $3, $4, $5, 'activa', $6, $7)
      RETURNING *
    `, [
      usuario_id,
      membresia_id,
      fechaInicio,
      fechaFin,
      membresia.precio,
      metodo_pago,
      referencia_pago
    ]);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Membresía asignada correctamente',
      data: insertResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al asignar membresía:', error);
    res.status(500).json({
      success: false,
      message: 'Error al asignar membresía',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Obtener las membresías de un usuario
const getMembresiasUsuario = async (req, res) => {
  try {
    const { usuario_id } = req.params;
    
    const result = await db.query(`
      SELECT 
        um.*,
        m.tipo,
        m.descripcion,
        m.duracion_dias,
        CASE 
          WHEN um.fecha_fin < CURRENT_DATE THEN 'expirada'
          ELSE um.estado 
        END as estado_actual
      FROM usuario_membresias um
      JOIN membresias m ON m.id = um.membresia_id
      WHERE um.usuario_id = $1 AND um.deleted_at IS NULL
      ORDER BY um.created_at DESC
    `, [usuario_id]);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error al obtener membresías del usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener membresías del usuario',
      error: error.message
    });
  }
};

// Obtener la membresía activa de un usuario
const getMembresiaActivaUsuario = async (req, res) => {
  try {
    const { usuario_id } = req.params;
    
    const result = await db.query(`
      SELECT 
        um.*,
        m.tipo,
        m.descripcion,
        m.duracion_dias
      FROM usuario_membresias um
      JOIN membresias m ON m.id = um.membresia_id
      WHERE um.usuario_id = $1 
      AND um.estado = 'activa'
      AND um.fecha_fin >= CURRENT_DATE
      AND um.deleted_at IS NULL
      ORDER BY um.fecha_fin DESC
      LIMIT 1
    `, [usuario_id]);
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'El usuario no tiene membresía activa'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al obtener membresía activa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener membresía activa',
      error: error.message
    });
  }
};

// Renovar membresía de usuario
const renovarMembresia = async (req, res) => {
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { metodo_pago, referencia_pago } = req.body;

    // Obtener la membresía actual
    const membresiaActualResult = await client.query(`
      SELECT um.*, m.duracion_dias, m.precio 
      FROM usuario_membresias um
      JOIN membresias m ON m.id = um.membresia_id
      WHERE um.id = $1 AND um.deleted_at IS NULL
    `, [id]);
    
    if (membresiaActualResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Registro de membresía no encontrado'
      });
    }

    const membresiaActual = membresiaActualResult.rows[0];

    // Calcular nueva fecha fin (desde la fecha actual)
    const nuevaFechaFin = new Date();
    nuevaFechaFin.setDate(nuevaFechaFin.getDate() + membresiaActual.duracion_dias);

    // Actualizar el registro existente
    const updateResult = await client.query(`
      UPDATE usuario_membresias 
      SET fecha_inicio = CURRENT_DATE,
          fecha_fin = $1,
          monto_pagado = $2,
          estado = 'activa',
          metodo_pago = $3,
          referencia_pago = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [
      nuevaFechaFin,
      membresiaActual.precio,
      metodo_pago,
      referencia_pago,
      id
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Membresía renovada correctamente',
      data: updateResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al renovar membresía:', error);
    res.status(500).json({
      success: false,
      message: 'Error al renovar membresía',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Cancelar membresía de usuario
const cancelarMembresia = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      UPDATE usuario_membresias 
      SET estado = 'cancelada', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Registro de membresía no encontrado'
      });
    }
    
    res.json({
      success: true,
      message: 'Membresía cancelada correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error al cancelar membresía:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar membresía',
      error: error.message
    });
  }
};

// Verificar si usuario tiene membresía activa (para uso interno y externo)
const tieneMembresiaActiva = async (req, res) => {
  try {
    const { usuario_id } = req.params;
    
    const result = await db.query(`
      SELECT 
        um.*,
        m.tipo,
        m.descripcion,
        m.duracion_dias
      FROM usuario_membresias um
      JOIN membresias m ON m.id = um.membresia_id
      WHERE um.usuario_id = $1 
      AND um.estado = 'activa'
      AND um.fecha_fin >= CURRENT_DATE
      AND um.deleted_at IS NULL
      ORDER BY um.fecha_fin DESC
      LIMIT 1
    `, [usuario_id]);
    
    const tieneMembresia = result.rows.length > 0;
    
    res.json({
      success: true,
      tiene_membresia_activa: tieneMembresia,
      data: tieneMembresia ? result.rows[0] : null
    });
  } catch (error) {
    console.error('Error al verificar membresía activa:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar membresía activa',
      error: error.message
    });
  }
};

// Obtener estadísticas de membresías (solo admin)
const getEstadisticas = async (req, res) => {
  try {
    const stats = {};

    // Total de membresías activas
    const activasResult = await db.query(`
      SELECT COUNT(*) as total 
      FROM usuario_membresias 
      WHERE estado = 'activa' 
      AND fecha_fin >= CURRENT_DATE 
      AND deleted_at IS NULL
    `);
    stats.membresias_activas = parseInt(activasResult.rows[0].total);

    // Distribución por tipo de membresía
    const distribucionResult = await db.query(`
      SELECT m.tipo, COUNT(um.id) as total
      FROM usuario_membresias um
      JOIN membresias m ON m.id = um.membresia_id
      WHERE um.estado = 'activa' 
      AND um.fecha_fin >= CURRENT_DATE
      AND um.deleted_at IS NULL
      GROUP BY m.tipo
    `);
    stats.distribucion_tipos = distribucionResult.rows;

    // Ingresos mensuales
    const ingresosResult = await db.query(`
      SELECT 
        EXTRACT(YEAR FROM created_at) as año,
        EXTRACT(MONTH FROM created_at) as mes,
        SUM(monto_pagado) as ingresos
      FROM usuario_membresias
      WHERE deleted_at IS NULL
      GROUP BY año, mes
      ORDER BY año DESC, mes DESC
      LIMIT 6
    `);
    stats.ingresos_mensuales = ingresosResult.rows;

    // Total de usuarios con membresía activa
    const usuariosActivosResult = await db.query(`
      SELECT COUNT(DISTINCT usuario_id) as total
      FROM usuario_membresias
      WHERE estado = 'activa' 
      AND fecha_fin >= CURRENT_DATE
      AND deleted_at IS NULL
    `);
    stats.usuarios_activos = parseInt(usuariosActivosResult.rows[0].total);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
};

// Actualizar estado automático de membresías expiradas (solo admin)
const actualizarEstadosExpirados = async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE usuario_membresias 
      SET estado = 'expirada', updated_at = CURRENT_TIMESTAMP 
      WHERE estado = 'activa' 
      AND fecha_fin < CURRENT_DATE 
      AND deleted_at IS NULL
      RETURNING COUNT(*) as actualizadas
    `);
    
    const actualizadas = parseInt(result.rows[0].actualizadas);
    
    res.json({
      success: true,
      message: `Se actualizaron ${actualizadas} membresías a estado expirado`,
      actualizadas: actualizadas
    });
  } catch (error) {
    console.error('Error al actualizar estados expirados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar estados expirados',
      error: error.message
    });
  }
};

export {
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
};