import dotenv from 'dotenv';
dotenv.config();

const checkDatabase = async () => {
  try {
    const db = await import('../config/database.js');
    console.log('🔍 Ejecutando diagnóstico de base de datos...\n');
    
    const result = await db.default.testConnection();
    
    if (result.success) {
      console.log('✅ Conexión exitosa a PostgreSQL');
      console.log(`📊 Base de datos: ${result.info.database}`);
      console.log(`👤 Usuario: ${result.info.user}`);
      console.log(`🌐 Host: ${result.info.host}:${result.info.port}`);
      console.log(`🔄 Versión: ${result.info.version}\n`);
      
      // Verificar tablas
      try {
        const tables = await db.default.query(`
          SELECT table_name, table_type 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          ORDER BY table_name
        `);
        
        console.log('📋 Tablas encontradas:');
        tables.rows.forEach(table => {
          console.log(`   - ${table.table_name} (${table.table_type})`);
        });
        
        // Verificar datos de ejemplo
        const counts = await Promise.all([
          db.default.query('SELECT COUNT(*) as count FROM users'),
          db.default.query('SELECT COUNT(*) as count FROM boyas'),
          db.default.query('SELECT COUNT(*) as count FROM estaciones')
        ]);
        
        console.log('\n🔢 Conteo de registros:');
        console.log(`   👥 Usuarios: ${counts[0].rows[0].count}`);
        console.log(`   📍 Boyas: ${counts[1].rows[0].count}`);
        console.log(`   🌤️  Estaciones: ${counts[2].rows[0].count}`);
        
      } catch (queryError) {
        console.log('⚠️  Error al verificar tablas:', queryError.message);
        console.log('💡 Ejecute el script database.sql para crear las tablas necesarias');
      }
      
    } else {
      console.log('❌ Error de conexión:');
      console.log(`   Mensaje: ${result.error.message}`);
      console.log(`   Código: ${result.error.code}`);
      console.log(`   Detalle: ${result.error.detail || 'N/A'}`);
      
      // Análisis automático del error
      db.default.analyzeDatabaseError({ 
        message: result.error.message, 
        code: result.error.code 
      });
    }
    
  } catch (error) {
    console.error('❌ Error en el diagnóstico:', error.message);
  }
};

checkDatabase();