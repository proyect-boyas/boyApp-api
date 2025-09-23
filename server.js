import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Importar middlewares y rutas
import { 
  loggerMiddleware, 
  databaseMiddleware, 
  errorHandlerMiddleware,
  notFoundMiddleware 
} from './middleware/server.js';
import routes from './routers/index.js';

dotenv.config();

const app = express();

// Middleware básico
app.use(cors());
app.use(express.json());

// Middlewares personalizados
app.use(loggerMiddleware);
app.use(databaseMiddleware);

// Rutas
app.use('/api', routes);

// Middleware para rutas no encontradas
app.use(notFoundMiddleware);

// Manejo de errores
app.use(errorHandlerMiddleware);



// Función para inicializar el servidor
const startServer = async () => {
  try {
   
    app.listen(process.env.PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log(`🚀 Servidor ejecutándose en puerto ${process.env.PORT}`);
      console.log('='.repeat(60));
      console.log(`🌐 URL base: ${process.env.URL_BASE}:${process.env.PORT}`);
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