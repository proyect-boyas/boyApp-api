import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Importar middlewares y rutas
import { 
  loggerMiddleware, 
  databaseMiddleware, 
  errorHandlerMiddleware,
  notFoundMiddleware 
} from './middleware/server.js';
import routes from './routers/index.js';

// Importar configuración WebSocket (CORRECCIÓN: importamos cameraClients)
import { initializeWebSocket, mobileClients, cameraClients, verifyCameraToken } from './websocket/websocket.js';

// Importar rutas de streaming
import streamRoutes, { injectWebSocketConnections } from './routers/streamRoutes.js';

dotenv.config();

const app = express();
const server = createServer(app); // Un solo servidor HTTP

// Inicializar WebSocket con el mismo servidor HTTP
initializeWebSocket(server);

// Middleware básico
app.use(cors());
app.use(express.json());

// Middlewares personalizados
app.use(loggerMiddleware);
app.use(databaseMiddleware);

// Rutas principales
app.use('/api', routes);

// Rutas de streaming - inyectar conexiones WebSocket (CORRECCIÓN: usamos cameraClients)
app.use('/api/stream', 
  injectWebSocketConnections(mobileClients, cameraClients, verifyCameraToken), 
  streamRoutes
);

// Endpoint de estado global del servidor
app.get('/status', async (req, res) => {
    const cameraStatus = {};
    cameraClients.forEach((stream, cameraId) => {
        cameraStatus[cameraId] = {
            connected: stream.ws.readyState === stream.ws.OPEN,
            token: stream.token ? stream.token.substring(0, 10) + '...' : 'no-token'
        };
    });
    
    const mobileStatus = [];
    mobileClients.forEach((clientInfo, ws) => {
        mobileStatus.push({
            userId: clientInfo.userInfo.id,
            userName: clientInfo.userInfo.nombre,
            cameraId: clientInfo.cameraId,
            connectedAt: clientInfo.connectedAt,
            connectionActive: ws.readyState === ws.OPEN
        });
    });
    
    // Obtener información de cámaras desde la BD
    let dbCameras = [];
    try {
        const result = await db.query(
            `SELECT camara_id, modelo, estado FROM camaras WHERE estado = 'ACTIVA' ORDER BY created_at DESC`
        );
        dbCameras = result.rows;
    } catch (error) {
        console.error('Error obteniendo cámaras de BD:', error);
    }
    
    res.json({
        status: 'running',
        server: 'Express + WebSocket unificado',
        connectedCameras: cameraClients.size,
        connectedMobileClients: mobileClients.size,
        cameras: cameraStatus,
        mobileClients: mobileStatus,
        databaseCameras: dbCameras,
        timestamp: new Date().toISOString()
    });
});

// Endpoint para verificar token de cámara
app.post('/api/verify-camera-token', async (req, res) => {
    const { token, cameraId } = req.body;
    
    if (!token || !cameraId) {
        return res.status(400).json({
            valid: false,
            message: 'Token y cameraId requeridos'
        });
    }
    
    const isValid = await verifyCameraToken(cameraId, token);
    
    if (isValid) {
        res.json({
            valid: true,
            message: 'Token válido'
        });
    } else {
        res.status(401).json({
            valid: false,
            message: 'Token inválido'
        });
    }
});

// Middleware para rutas no encontradas
app.use(notFoundMiddleware);

// Manejo de errores
app.use(errorHandlerMiddleware);

// Función para inicializar el servidor
const startServer = async () => {
  try {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
      console.log(`📡 Servidor WebSocket integrado`);
      console.log('='.repeat(60));
      console.log(`🌐 URL base: ${process.env.URL_BASE || `http://localhost:${PORT}`}`);
      console.log(`📱 WebSocket móvil: ws://localhost:${PORT}/mobile`);
      console.log(`🎥 WebSocket stream: ws://localhost:${PORT}/stream`);
      console.log(`🔗 WebSocket WebRTC: ws://localhost:${PORT}/webrtc`);
      console.log(`📊 Endpoints de streaming:`);
      console.log(`   📍 Status: http://localhost:${PORT}/status`);
      console.log(`   📍 API Status: http://localhost:${PORT}/api/stream/status`);
      console.log(`   📍 Info: http://localhost:${PORT}/api/stream/info`);
      console.log(`   📍 Cámaras: http://localhost:${PORT}/api/stream/cameras`);
      console.log(`   📍 Stats: http://localhost:${PORT}/api/stream/stats`);
      console.log('='.repeat(60) + '\n');
    });
    
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();

export default app;