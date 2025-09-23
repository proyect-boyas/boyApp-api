import db from "../config/database.js";
import { validationResult } from "express-validator";

// Obtener todas las boyas del usuario
const getBoyas = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT b.*, e.nombre as station_name, e.latitud as station_lat, e.longitud as station_lon 
       FROM boyas b 
       LEFT JOIN estaciones e ON b.station_id = e.station_id 
       WHERE b.user_id = $1 
       ORDER BY b.created_at DESC`,
      [userId]
    );

    res.json({ boyas: result.rows });
  } catch (error) {
    console.error("Error obteniendo boyas:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Obtener una boya específica
const getBoya = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      `SELECT b.*, e.nombre as station_name, e.datos as station_data 
       FROM boyas b 
       LEFT JOIN estaciones e ON b.station_id = e.station_id 
       WHERE b.id = $1 AND b.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Boya no encontrada" });
    }

    res.json({ boya: result.rows[0] });
  } catch (error) {
    console.error("Error obteniendo boya:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Crear una nueva boya
const createBoya = async (req, res) => {
  try {
    // Validar entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      nombre,
      descripcion,
      latitud,
      longitud,
      station_id,
      sonda_id,
      camara_id,
    } = req.body;
    const userId = req.user.id;

    const result = await db.query(
      `INSERT INTO boyas (nombre, descripcion, latitud, longitud, user_id, station_id,sonda_id, camara_id ) 
       VALUES ($1, $2, $3, $4, $5, $6,$7,$8) 
       RETURNING *`,
      [
        nombre,
        descripcion,
        latitud,
        longitud,
        userId,
        station_id,
        sonda_id,
        camara_id,
      ]
    );

    res.status(201).json({
      message: "Boya creada exitosamente",
      boya: result.rows[0],
    });
  } catch (error) {
    console.error("Error creando boya:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Actualizar una boya
const updateBoya = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      descripcion,
      latitud,
      longitud,
      station_id,
      sonda_id,
      camara_id,
    } = req.body;
    const userId = req.user.id;

    // Verificar que la boya pertenece al usuario
    const verifyResult = await db.query(
      "SELECT id FROM boyas WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: "Boya no encontrada" });
    }

    const result = await db.query(
      `UPDATE boyas 
       SET nombre = $1, descripcion = $2, latitud = $3, longitud = $4, station_id = $5, sonda_id= $6, camara_id= $7, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $8 
       RETURNING *`,
      [
        nombre,
        descripcion,
        latitud,
        longitud,
        station_id,
        sonda_id,
        camara_id,
        id,
      ]
    );

    res.json({
      message: "Boya actualizada exitosamente",
      boya: result.rows[0],
    });
  } catch (error) {
    console.error("Error actualizando boya:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

// Eliminar una boya
const deleteBoya = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verificar que la boya pertenece al usuario
    const verifyResult = await db.query(
      "SELECT id FROM boyas WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: "Boya no encontrada" });
    }

    await db.query("DELETE FROM boyas WHERE id = $1", [id]);

    res.json({ message: "Boya eliminada exitosamente" });
  } catch (error) {
    console.error("Error eliminando boya:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
};

export { getBoyas, getBoya, createBoya, updateBoya, deleteBoya };
