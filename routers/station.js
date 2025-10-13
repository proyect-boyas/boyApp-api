 import express from 'express';
import { 
  getStationData, 
  getStationObservations, 
  addStation, 
  getStationsMap, 
  getStationDetails 
} from '../controllers/stationController.js';
import { authenticateToken } from '../middleware/auth.js';
import { stationValidation } from '../middleware/validation.js';

const router = express.Router();

// Algunas rutas requieren autenticación
router.use(authenticateToken);

// Rutas
router.get('/data/:station_id', getStationData);
router.get('/observations/:station_id', getStationObservations);
router.post('/add', stationValidation.add, addStation);
router.get('/map', getStationsMap);
router.get('/details/:station_id', getStationDetails);

export default router;