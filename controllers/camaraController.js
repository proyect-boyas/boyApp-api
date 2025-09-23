import db from "../config/database.js";
import { validationResult } from "express-validator";

// Obtener todas las cámaras
const getCamaras = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM camaras ORDER BY created_at DESC` 
    );

    res.json({ camaras: result.rows });
  } catch (error) {
    console.error("Error obteniendo cámaras:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Obtener una cámara específica
const getCamara = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT * FROM camaras WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cámara no encontrada" });
    }

    res.json({ camara: result.rows[0] });
  } catch (error) {
    console.error("Error obteniendo cámara:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Crear una nueva cámara
const createCamara = async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      camara_id,
      modelo,
      fabricante,
      fecha_instalacion,
      fecha_ultimo_mantenimiento,
      estado,
      url
    } = req.body;

    // Verificar si la camara_id ya existe
    const existingCamara = await db.query(
      "SELECT id FROM camaras WHERE camara_id = $1",
      [camara_id]
    );

    if (existingCamara.rows.length > 0) {
      return res.status(400).json({ error: "El ID de cámara ya existe" });
    }

    const result = await db.query(
      `INSERT INTO camaras (
        camara_id, modelo, fabricante, fecha_instalacion, 
        fecha_ultimo_mantenimiento, estado, url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        camara_id,
        modelo,
        fabricante,
        fecha_instalacion,
        fecha_ultimo_mantenimiento,
        estado,
        url
      ]
    );

    res.status(201).json({
      message: "Cámara creada exitosamente",
      camara: result.rows[0],
    });
  } catch (error) {
    console.error("Error creando cámara:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Actualizar una cámara
const updateCamara = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      modelo,
      fabricante,
      fecha_instalacion,
      fecha_ultimo_mantenimiento,
      estado,
      url
    } = req.body;

    // Verificar que la cámara existe
    const verifyResult = await db.query(
      `SELECT id FROM camaras WHERE id = $1`,
      [id]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: "Cámara no encontrada" });
    }

    const result = await db.query(
      `UPDATE camaras 
       SET modelo = $1, fabricante = $2, fecha_instalacion = $3, 
           fecha_ultimo_mantenimiento = $4, estado = $5, url = $6, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $7 
       RETURNING *`,
      [
        modelo,
        fabricante,
        fecha_instalacion,
        fecha_ultimo_mantenimiento,
        estado,
        url,
        id
      ]
    );

    res.json({
      message: "Cámara actualizada exitosamente",
      camara: result.rows[0],
    });
  } catch (error) {
    console.error("Error actualizando cámara:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Eliminar una cámara
const deleteCamara = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la cámara existe
    const verifyResult = await db.query(
      `SELECT id FROM camaras WHERE id = $1`,
      [id]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: "Cámara no encontrada" });
    }

    // Verificar si la cámara está siendo usada en alguna boya
    const boyasUsingCamara = await db.query(
      `SELECT id FROM boyas WHERE camara_id = (SELECT camara_id FROM camaras WHERE id = $1)`,
      [id]
    );

    if (boyasUsingCamara.rows.length > 0) {
      return res.status(400).json({ 
        error: "No se puede eliminar la cámara porque está asignada a una o más boyas" 
      });
    }

    await db.query("DELETE FROM camaras WHERE id = $1", [id]);

    res.json({ message: "Cámara eliminada exitosamente" });
  } catch (error) {
    console.error("Error eliminando cámara:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Actualizar mantenimiento de cámara
const updateMantenimientoCamara = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha_mantenimiento, observaciones } = req.body;

    const result = await db.query(
      `UPDATE camaras 
       SET fecha_ultimo_mantenimiento = $1, estado = 'ACTIVA', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [fecha_mantenimiento, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cámara no encontrada" });
    }

    res.json({
      message: "Mantenimiento de cámara registrado exitosamente",
      camara: result.rows[0],
    });
  } catch (error) {
    console.error("Error actualizando mantenimiento de cámara:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Obtener cámaras disponibles (no asignadas a boyas)
const getCamarasDisponibles = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.* 
       FROM camaras c 
       LEFT JOIN boyas b ON c.id = b.camara_id 
       WHERE b.camara_id IS NULL 
       ORDER BY c.created_at DESC`
    );

    res.json({ camaras: result.rows });
  } catch (error) {
    console.error("Error obteniendo cámaras disponibles:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

export { 
  getCamaras, 
  getCamara, 
  createCamara, 
  updateCamara, 
  deleteCamara, 
  updateMantenimientoCamara,
  getCamarasDisponibles
};