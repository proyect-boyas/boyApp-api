// routes/camaras.js
import express from "express";
import {
  getCamaras,
  getCamara,
  createCamara,
  updateCamara,
  deleteCamara,
  updateMantenimientoCamara,
  getCamarasDisponibles,
  generateNewToken,
  getCamaraToken
} from "../controllers/camaraController.js";
import { camaraValidation } from "../middleware/validation.js";

const router = express.Router();

// Rutas existentes
router.get("/", getCamaras);
router.get("/disponibles", getCamarasDisponibles);
router.get("/:id", getCamara);
router.get("/:id/token", getCamaraToken); // Nueva ruta para obtener token
router.post("/", camaraValidation, createCamara);
router.put("/:id", camaraValidation, updateCamara);
router.delete("/:id", deleteCamara);
router.patch("/:id/mantenimiento", updateMantenimientoCamara);
router.post("/generar-token", generateNewToken);

export default router;