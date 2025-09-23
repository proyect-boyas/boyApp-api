export const loggerMiddleware = (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
  };


 export const databaseMiddleware = async (req, res, next) => {
    try {
      const db = await import('../config/database.js');
      req.db = db.default;
      next();
    } catch (error) {
      console.error('Error cargando módulo de base de datos:', error);
      next(error);
    }
  };

  export const errorHandlerMiddleware = (error, req, res, next) => {
    console.error('Error global:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Algo salió mal'
    });
  };


  export const notFoundMiddleware = (req, res) => {
    res.status(404).json({
      error: 'Ruta no encontrada',
      message: `La ruta ${req.originalUrl} no existe en este servidor`,
      suggestion: 'Visite GET /api/info para ver los endpoints disponibles'
    });
  };