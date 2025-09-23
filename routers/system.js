import { Router } from 'express';
import { createRequire } from 'module';
import { 
  healthCheck, 
  systemInfo, 
  databaseDiagnostic 
} from '../utils/diagnostic.js';

const require = createRequire(import.meta.url);
const { name, version } = require('../package.json');

const router = Router();

// Ruta de health check
router.get('/health', healthCheck(name, version));

// Ruta de información del sistema
router.get('/info', systemInfo(name, version));

// Ruta para diagnóstico de base de datos
router.get('/database/diagnostic', databaseDiagnostic);

export default router;