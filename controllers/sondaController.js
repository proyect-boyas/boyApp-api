import db from "../config/database.js";
import { validationResult } from "express-validator";

// Obtener todas las sondas del usuario
const getSondas = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT * 
            FROM sondas s       
                ORDER BY s.created_at DESC` 
    );

    res.json({ sondas: result.rows });
  } catch (error) {
    console.error("Error obteniendo sondas:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Obtener una sonda específica
const getSonda = async (req, res) => {
  try {
    const { id } = req.params;


    const result = await db.query(
      `SELECT *
            FROM sondas s 
                WHERE s.id = $1 `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Sonda no encontrada" });
    }

    res.json({ sonda: result.rows[0] });
  } catch (error) {
    console.error("Error obteniendo sonda:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Crear una nueva sonda
const createSonda = async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      sonda_id,
      modelo,
      fabricante,
      fecha_instalacion,
      fecha_ultimo_mantenimiento,
      estado,
      profundidad_medicion,
      temperatura,
      salinidad,
      densidad,
      presion,
      oxigeno_disuelto,
      ph
    } = req.body;

    // Verificar si la sonda_id ya existe
    const existingSonda = await db.query(
      "SELECT id FROM sondas WHERE sonda_id = $1",
      [sonda_id]
    );

    if (existingSonda.rows.length > 0) {
      return res.status(400).json({ error: "El ID de sonda ya existe" });
    }

    const result = await db.query(
      `INSERT INTO sondas (
        sonda_id, modelo, fabricante, fecha_instalacion, 
        fecha_ultimo_mantenimiento, estado, profundidad_medicion,
        temperatura, salinidad, densidad, presion, oxigeno_disuelto, ph
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [
        sonda_id,
        modelo,
        fabricante,
        fecha_instalacion,
        fecha_ultimo_mantenimiento,
        estado,
        profundidad_medicion,
        temperatura,
        salinidad,
        densidad,
        presion,
        oxigeno_disuelto,
        ph
      ]
    );

    res.status(201).json({
      message: "Sonda creada exitosamente",
      sonda: result.rows[0],
    });
  } catch (error) {
    console.error("Error creando sonda:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Actualizar una sonda
const updateSonda = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      modelo,
      fabricante,
      fecha_instalacion,
      fecha_ultimo_mantenimiento,
      estado,
      profundidad_medicion,
      temperatura,
      salinidad,
      densidad,
      presion,
      oxigeno_disuelto,
      ph
    } = req.body;

    // Verificar que la sonda existe y pertenece al usuario (o es admin)
    const verifyResult = await db.query(
      `SELECT s.id 
            FROM sondas s 
                WHERE s.id = $1 `,
      [id]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: "Sonda no encontrada" });
    }

    const result = await db.query(
      `UPDATE sondas 
       SET modelo = $1, fabricante = $2, fecha_instalacion = $3, 
           fecha_ultimo_mantenimiento = $4, estado = $5, profundidad_medicion = $6,
           temperatura = $7, salinidad = $8, densidad = $9, presion = $10, 
           oxigeno_disuelto = $11, ph = $12, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $13 
       RETURNING *`,
      [
        modelo,
        fabricante,
        fecha_instalacion,
        fecha_ultimo_mantenimiento,
        estado,
        profundidad_medicion,
        temperatura,
        salinidad,
        densidad,
        presion,
        oxigeno_disuelto,
        ph,
        id
      ]
    );

    res.json({
      message: "Sonda actualizada exitosamente",
      sonda: result.rows[0],
    });
  } catch (error) {
    console.error("Error actualizando sonda:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Eliminar una sonda
const deleteSonda = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la sonda existe y pertenece al usuario (o es admin)
    const verifyResult = await db.query(
      `SELECT s.id 
            FROM sondas s 
                 WHERE s.id = $1 `,
      [id]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: "Sonda no encontrada" });
    }

    await db.query("DELETE FROM sondas WHERE id = $1", [id]);

    res.json({ message: "Sonda eliminada exitosamente" });
  } catch (error) {
    console.error("Error eliminando sonda:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Actualizar estado de mantenimiento
const updateMantenimiento = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_mantenimiento, observaciones } = req.body;

    const result = await db.query(
      `UPDATE sondas 
       SET fecha_ultimo_mantenimiento = $1, estado = 'ACTIVA', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [fecha_mantenimiento, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Sonda no encontrada" });
    }

    res.json({
      message: "Mantenimiento registrado exitosamente",
      sonda: result.rows[0],
    });
  } catch (error) {
    console.error("Error actualizando mantenimiento:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};



// Obtener cámaras disponibles (no asignadas a boyas)
const getSondasDisponibles = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.* 
       FROM sondas s 
       LEFT JOIN boyas b ON s.id = b.sonda_id 
       WHERE b.sonda_id IS NULL 
       ORDER BY s.created_at DESC`
    );

    res.json({ camaras: result.rows });
  } catch (error) {
    console.error("Error obteniendo cámaras disponibles:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

export { 
  getSondas, 
  getSonda,
  createSonda, 
  updateSonda, 
  deleteSonda, 
  updateMantenimiento,
  getSondasDisponibles
};