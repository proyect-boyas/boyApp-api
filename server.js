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

// Importar servidor WebSocket
import './websocket/websocket.js';

dotenv.config();

const app = express();
const server = createServer(app);

// Middleware básico
app.use(cors());
app.use(express.json());

// Middlewares personalizados
app.use(loggerMiddleware);
app.use(databaseMiddleware);

// Rutas
app.use('/api', routes);

// Ruta para información del streaming
app.get('/api/stream/info', (req, res) => {
  res.json({
    streaming: true,
    endpoints: {
      websocket: `ws://${req.headers.host.replace('http', 'ws')}/mobile`,
      status: `${req.protocol}://${req.headers.host}/api/stream/status`
    }
  });
});

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
      console.log(`🌐 URL base: ${process.env.URL_BASE}:${process.env.PORT}`);
      console.log(`📱 WebSocket móvil: ws://${process.env.URL_BASE?.replace('http://', '')}:${process.env.PORT}/mobile`);
      console.log(`🎥 WebSocket stream: ws://${process.env.URL_BASE?.replace('http://', '')}:${process.env.PORT}/stream`);
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