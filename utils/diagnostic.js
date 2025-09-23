import axios from 'axios';

// Health check mejorado
export const healthCheck = (name, version) => async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    let dbStatus = { status: 'Desconocido' };
    if (req.db && req.db.testConnection) {
      const dbResult = await req.db.testConnection();
      dbStatus = {
        status: dbResult.success ? 'Conectado' : 'Error',
        details: dbResult.success ? dbResult.info : dbResult.error
      };
    }

    // Verificar conexión a API Tempest
    let tempestStatus = 'No configurada';
    const TEMPEST_API_KEY = process.env.TEMPEST_API_KEY;
    const TEMPEST_API_URL= process.env.TEMPEST_API_URL;
    
   
    if (TEMPEST_API_KEY && TEMPEST_API_KEY !== 'tu_api_key_de_tempest_aqui') {
      try {
        const response = await axios.get(
          `${TEMPEST_API_URL}/stations`, 
          {
            headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
            timeout: 5000
          }
        );
        tempestStatus = `Conectado (${response.data.stations?.length || 0} estaciones disponibles)`;
      } catch (apiError) {
        tempestStatus = `Error: ${apiError.message}`;
      }
    }
    
    // Obtener estadísticas del pool de conexiones
    const poolStats = req.db.getPoolStats ? req.db.getPoolStats() : null;
    
    res.json({
      message: 'API funcionando correctamente',
      status: 'OK',
      service: `${name} v${version}`,
      timestamp: new Date().toISOString(),
      database: dbStatus,
      tempest_api: tempestStatus,
      pool_stats: poolStats,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Error en health check:', error);
    res.status(500).json({
      message: 'Error en health check',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno',
      status: 'ERROR'
    });
  }
};

// Información del sistema
export const systemInfo = (name, version) => (req, res) => {
  res.json({
    service: name,
    version: version,
    description: 'API para gestión de boyas y estaciones meteorológicas con PostgreSQL',
    endpoints: {
      auth: [
        'POST /api/auth/register - Registrar nuevo usuario',
        'POST /api/auth/login - Iniciar sesión',
        'GET /api/auth/profile - Obtener perfil de usuario',
        'PUT /api/auth/profile - Actualizar perfil de usuario'
      ],
      boyas: [
        'GET /api/boyas - Obtener todas las boyas del usuario',
        'GET /api/boyas/:id - Obtener una boya específica',
        'POST /api/boyas - Crear una nueva boya',
        'PUT /api/boyas/:id - Actualizar una boya',
        'DELETE /api/boyas/:id - Eliminar una boya'
      ],
      stations: [
        'GET /api/stations/data/:station_id - Obtener datos de una estación Tempest',
        'GET /api/stations/observations/:station_id - Obtener observaciones actuales',
        'POST /api/stations/add - Agregar una nueva estación',
        'GET /api/stations/map - Obtener estaciones para mostrar en mapa',
        'GET /api/stations/details/:station_id - Obtener detalles de una estación'
      ],
      system: [
        'GET /api/health - Estado del sistema y conexiones',
        'GET /api/info - Información de la API y endpoints disponibles',
        'GET /api/database/diagnostic - Diagnóstico de la base de datos'
      ]
    }
  });
};

// Diagnóstico de base de datos
export const databaseDiagnostic = async (req, res) => {
  try {
    if (!req.db) {
      return res.status(500).json({ error: 'Módulo de base de datos no disponible' });
    }
    
    // Ejecutar varias consultas de diagnóstico
    const queries = {
      tables: await req.db.query(`
        SELECT table_name, table_type 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `),
      users_count: await req.db.query('SELECT COUNT(*) FROM users'),
      boyas_count: await req.db.query('SELECT COUNT(*) FROM boyas'),
      estaciones_count: await req.db.query('SELECT COUNT(*) FROM estaciones'),
      connections: await req.db.query('SELECT COUNT(*) as connections FROM pg_stat_activity')
    };
    
    const results = {};
    for (const [key, result] of Object.entries(queries)) {
      results[key] = result.rows;
    }
    
    res.json({
      status: 'success',
      diagnostic: results,
      pool_stats: req.db.getPoolStats ? req.db.getPoolStats() : null
    });
    
  } catch (error) {
    console.error('Error en diagnóstico de base de datos:', error);
    
    if (req.db.analyzeDatabaseError) {
      req.db.analyzeDatabaseError(error);
    }
    
    res.status(500).json({
      status: 'error',
      error: {
        message: error.message,
        code: error.code,
        detail: error.detail,
        query: error.query ? error.query.substring(0, 100) + '...' : null
      }
    });
  }
};