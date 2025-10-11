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

// Importar configuración WebSocket
import {   mobileClients, 
  cameraStreams, 
  verifyCameraToken  } from './websocket/websocket.js';

// Importar rutas de streaming
import streamRoutes, { injectWebSocketConnections } from './routers/streamRoutes.js';

dotenv.config();

const app = express();
const server = createServer(app);

 

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
  injectWebSocketConnections(mobileClients, cameraStreams, verifyCameraToken), 
  streamRoutes
);

// Middleware para rutas no encontradas
app.use(notFoundMiddleware);

// Manejo de errores
app.use(errorHandlerMiddleware);

// Función para inicializar el servidor
const startServer = async () => {
  try {
    server.listen(process.env.PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log(`🚀 Servidor ejecutándose en puerto ${process.env.PORT}`);
      console.log(`📡 Servidor WebSocket integrado`);
      console.log('='.repeat(60));
      console.log(`🌐 URL base: ${process.env.URL_BASE || `http://localhost:${process.env.PORT}`}`);
      console.log(`📱 WebSocket móvil: ws://localhost:${process.env.PORT}/mobile`);
      console.log(`🎥 WebSocket stream: ws://localhost:${process.env.PORT}/stream`);
      console.log(`📊 Endpoints de streaming:`);
      console.log(`   📍 Status: http://localhost:${process.env.PORT}/api/stream/status`);
      console.log(`   📍 Info: http://localhost:${process.env.PORT}/api/stream/info`);
      console.log(`   📍 Cámaras: http://localhost:${process.env.PORT}/api/stream/cameras`);
      console.log(`   📍 Stats: http://localhost:${process.env.PORT}/api/stream/stats`);
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