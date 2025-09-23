import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

// Usar DATABASE_URL o construir la connection string manualmente
const connectionString = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const poolConfig = {
  connectionString: connectionString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Asegurarse de que la contraseña sea string
if (process.env.DB_PASSWORD) {
  poolConfig.password = String(process.env.DB_PASSWORD);
}


const pool = new Pool(poolConfig);

// Eventos del pool para mejor logging
pool.on('connect', (client) => {
  console.log('🟢 Nueva conexión establecida con PostgreSQL');
});

pool.on('error', (err, client) => {
  console.error('❌ Error inesperado en el cliente de base de datos:', err.message);
  console.error('Stack trace:', err.stack);
});

// Función mejorada para probar la conexión
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión a PostgreSQL exitosa');
    
    // Obtener información de la base de datos
    const dbResult = await client.query(
      `SELECT 
        current_database() as database,
        version() as version,
        current_user as user,
        inet_server_addr() as host,
        inet_server_port() as port`
    );
    
    console.log('📊 Información de la base de datos:');
    console.log(`   Base de datos: ${dbResult.rows[0].database}`);
    console.log(`   Usuario: ${dbResult.rows[0].user}`);
    console.log(`   Host: ${dbResult.rows[0].host}`);
    console.log(`   Puerto: ${dbResult.rows[0].port}`);
    console.log(`   Versión: ${dbResult.rows[0].version.split(',')[0]}`);
    
    client.release();
    return { success: true, info: dbResult.rows[0] };
  } catch (error) {
    console.error('❌ Error de conexión a PostgreSQL:');
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Código: ${error.code}`);
    console.error(`   Detalle: ${error.detail || 'N/A'}`);
    console.error(`   Donde: ${error.where || 'N/A'}`);
    console.error(`   Stack: ${error.stack}`);
    
    // Análisis detallado del error
    analyzeDatabaseError(error);
    
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where
      }
    };
  }
};

// Función para analizar errores comunes de PostgreSQL
const analyzeDatabaseError = (error) => {
  console.log('🔍 Análisis del error:');
  
  switch (error.code) {
    case 'ECONNREFUSED':
      console.log('   ⚠️  No se puede conectar al servidor PostgreSQL');
      console.log('   💡 Verifique que PostgreSQL esté ejecutándose');
      console.log('   💡 Verifique el host y puerto en DATABASE_URL');
      break;
      
    case '28P01':
      console.log('   ⚠️  Error de autenticación');
      console.log('   💡 Verifique el usuario y contraseña en DATABASE_URL');
      break;
      
    case '3D000':
      console.log('   ⚠️  Base de datos no existe');
      console.log('   💡 Verifique el nombre de la base de datos en DATABASE_URL');
      console.log('   💡 Ejecute el script database.sql para crear las tablas');
      break;
      
    case '42P01':
      console.log('   ⚠️  Tabla no existe');
      console.log('   💡 Ejecute el script database.sql para crear las tablas');
      break;
      
    case '23505':
      console.log('   ⚠️  Violación de unique constraint');
      console.log('   💡 Intenta insertar un dato duplicado');
      break;
      
    case '23503':
      console.log('   ⚠️  Violación de foreign key constraint');
      console.log('   💡 Referencia a un registro que no existe');
      break;
      
    case '23502':
      console.log('   ⚠️  Violación de not null constraint');
      console.log('   💡 Campo requerido está vacío');
      break;
      
    default:
      console.log('   ℹ️  Error general de base de datos');
      console.log(`   💡 Código de error: ${error.code}`);
      break;
  }
};

// Función mejorada de query con mejor manejo de errores
const query = async (text, params) => {
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log de queries lentas (más de 1 segundo)
    if (duration > 1000) {
      console.warn(`🐌 Query lenta: ${duration}ms - ${text.substring(0, 100)}...`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`❌ Error en query (${duration}ms): ${text}`);
    console.error(`   Parámetros: ${JSON.stringify(params)}`);
    console.error(`   Mensaje: ${error.message}`);
    console.error(`   Código: ${error.code}`);
    
    // Enriquecer el error con más información
    error.query = text;
    error.queryParameters = params;
    error.queryDuration = duration;
    
    throw error;
  }
};

// Función para obtener estadísticas del pool
const getPoolStats = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
};

export default {
  query,
  pool,
  testConnection,
  getPoolStats,
  analyzeDatabaseError
};