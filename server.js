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
import hlsRoutes from './routers/hls-routes.js';
// Importar configuración WebSocket
import { initializeWebSocket, mobileClients, cameraClients, verifyCameraToken } from './websocket/websocket.js';

// Importar rutas de streaming
import streamRoutes, { injectWebSocketConnections } from './routers/streamRoutes.js';

dotenv.config();

const app = express();
const server = createServer(app); // Un solo servidor HTTP

// Inicializar WebSocket con el mismo servidor HTTP

app.use(express.json());
app.use(express.static('public'));

// Rutas HLS
app.use('/api', hlsRoutes);

// Ruta de estado
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'WebSocket HLS Stream Server',
    timestamp: new Date().toISOString()
  });
});
initializeWebSocket(server);

// Middleware básico
app.use(cors());
app.use(express.json());

// Middlewares personalizados
app.use(loggerMiddleware);
app.use(databaseMiddleware);

// Rutas principales
app.use('/api', routes);

// Rutas de streaming - inyectar conexiones WebSocket
app.use('/api/stream', 
  injectWebSocketConnections(mobileClients, cameraClients, verifyCameraToken), 
  streamRoutes
);

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