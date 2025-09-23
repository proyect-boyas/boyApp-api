import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

// Configuración de la API Tempest
const TEMPEST_API_KEY = process.env.TEMPEST_API_KEY;
const TEMPEST_BASE_URL = process.env.TEMPEST_API_URL || 'https://api.tempestwx.com/v1';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Función para verificar la conexión a la API
const verifyTempestConnection = async () => {
  console.log(`${colors.bright}${colors.cyan}🔍 Verificando conexión con Tempest API...${colors.reset}\n`);

  // Verificar si la API key está configurada
  if (!TEMPEST_API_KEY || TEMPEST_API_KEY === 'tu_api_key_aqui') {
    console.log(`${colors.red}❌ ERROR: API key de Tempest no configurada${colors.reset}`);
    console.log(`${colors.yellow}💡 Solución:${colors.reset}`);
    console.log(`  1. Obtén tu API key de: https://tempestwx.com/settings/account`);
    console.log(`  2. Agrega al archivo .env:`);
    console.log(`     TEMPEST_API_KEY=tu_api_key_real_aqui`);
    console.log(`     TEMPEST_API_URL=https://api.tempestwx.com/v1`);
    return;
  }

  console.log(`${colors.green}✅ API Key configurada: ${TEMPEST_API_KEY.substring(0, 10)}...${colors.reset}`);
  console.log(`${colors.green}✅ URL de API: ${TEMPEST_BASE_URL}${colors.reset}\n`);

  try {
    // 1. Verificar conexión básica  curl -H "Authorization: Bearer 76703070-20ba-411d-81b7-744093e2f19c" https://swd.weatherflow.com/swd/rest/ping
    console.log(`${colors.blue}📡 Realizando prueba de conexión...${colors.reset}`);
    
    const testResponse = await axios.get(`${TEMPEST_BASE_URL}/ping`, {
      headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
      timeout: 10000
    });

    console.log(`${colors.green}✅ Conexión exitosa: ${testResponse.data.message || 'API respondiendo'}${colors.reset}\n`);

    // 2. Obtener información del usuario/account
    console.log(`${colors.blue}👤 Obteniendo información de la cuenta...${colors.reset}`);
    
    const accountResponse = await axios.get(`${TEMPEST_BASE_URL}/account`, {
      headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
      timeout: 10000
    });

    const account = accountResponse.data;
    console.log(`${colors.green}✅ Cuenta: ${account.first_name} ${account.last_name}${colors.reset}`);
    console.log(`${colors.green}✅ Email: ${account.email}${colors.reset}`);
    console.log(`${colors.green}✅ Plan: ${account.plan}${colors.reset}\n`);

    // 3. Obtener lista de estaciones
    console.log(`${colors.blue}🌤️  Obteniendo lista de estaciones...${colors.reset}`);
    
    const stationsResponse = await axios.get(`${TEMPEST_BASE_URL}/stations`, {
      headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
      timeout: 10000
    });

    const stations = stationsResponse.data.stations;
    console.log(`${colors.green}✅ Estaciones encontradas: ${stations.length}${colors.reset}\n`);

    // 4. Mostrar detalles de cada estación
    console.log(`${colors.bright}${colors.magenta}📊 DETALLES DE ESTACIONES:${colors.reset}\n`);

    for (const [index, station] of stations.entries()) {
      console.log(`${colors.bright}${colors.cyan}🏠 Estación ${index + 1}: ${station.station_name}${colors.reset}`);
      console.log(`${colors.white}   ID: ${station.station_id}${colors.reset}`);
      console.log(`${colors.white}   Nombre: ${station.station_name}${colors.reset}`);
      console.log(`${colors.white}   Ubicación: ${station.latitude}, ${station.longitude}${colors.reset}`);
      console.log(`${colors.white}   Elevación: ${station.elevation}m${colors.reset}`);
      console.log(`${colors.white}   Tipo: ${station.device_type}${colors.reset}`);
      console.log(`${colors.white}   Firmware: ${station.firmware_revision}${colors.reset}`);
      console.log(`${colors.white}   Status: ${station.status.online ? '🟢 En línea' : '🔴 Offline'}${colors.reset}`);
      
      if (station.status.online) {
        console.log(`${colors.white}   Última conexión: ${new Date(station.status.last_connect_time * 1000).toLocaleString()}${colors.reset}`);
      }
      
      console.log(''); // Espacio entre estaciones
    }

    // 5. Probar observaciones para estaciones en línea
    const onlineStations = stations.filter(s => s.status.online);
    
    if (onlineStations.length > 0) {
      console.log(`${colors.blue}📈 Probando observaciones para estaciones en línea...${colors.reset}\n`);
      
      for (const station of onlineStations.slice(0, 2)) { // Probar máximo 2 estaciones
        try {
          const obsResponse = await axios.get(`${TEMPEST_BASE_URL}/observations/station/${station.station_id}`, {
            headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
            timeout: 10000
          });

          const observations = obsResponse.data;
          console.log(`${colors.green}✅ Observaciones para ${station.station_name}:${colors.reset}`);
          console.log(`${colors.white}   Temperatura: ${observations.air_temperature}°C${colors.reset}`);
          console.log(`${colors.white}   Humedad: ${observations.relative_humidity}%${colors.reset}`);
          console.log(`${colors.white}   Presión: ${observations.sea_level_pressure} hPa${colors.reset}`);
          console.log(`${colors.white}   Viento: ${observations.wind_avg} m/s${colors.reset}`);
          console.log('');
        } catch (obsError) {
          console.log(`${colors.yellow}⚠️  Error obteniendo observaciones para ${station.station_name}: ${obsError.message}${colors.reset}\n`);
        }
      }
    }

    // 6. Resumen final
    console.log(`${colors.bright}${colors.green}🎉 VERIFICACIÓN COMPLETADA${colors.reset}`);
    console.log(`${colors.white}✅ Conexión API: ${colors.green}Exitosa${colors.reset}`);
    console.log(`${colors.white}✅ Total estaciones: ${colors.cyan}${stations.length}${colors.reset}`);
    console.log(`${colors.white}✅ Estaciones en línea: ${colors.green}${onlineStations.length}${colors.reset}`);
    console.log(`${colors.white}✅ Estaciones offline: ${colors.red}${stations.length - onlineStations.length}${colors.reset}`);

  } catch (error) {
    console.log(`${colors.red}❌ Error en la verificación:${colors.reset}`);
    
    if (error.response) {
      // Error de respuesta de la API
      console.log(`${colors.red}   Status: ${error.response.status}${colors.reset}`);
      console.log(`${colors.red}   Mensaje: ${error.response.data?.message || error.response.statusText}${colors.reset}`);
      
      if (error.response.status === 401) {
        console.log(`${colors.yellow}💡 La API key parece ser inválida o expirada${colors.reset}`);
      } else if (error.response.status === 403) {
        console.log(`${colors.yellow}💡 Permisos insuficientes para acceder a los recursos${colors.reset}`);
      }
    } else if (error.request) {
      // Error de red/timeout
      console.log(`${colors.red}   Error de red: ${error.message}${colors.reset}`);
      console.log(`${colors.yellow}💡 Verifica tu conexión a internet${colors.reset}`);
    } else {
      // Otro error
      console.log(`${colors.red}   Error: ${error.message}${colors.reset}`);
    }
  }
};

// Función principal
const main = async () => {
  console.log(`${colors.bright}${colors.magenta}========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}   VERIFICADOR DE CONEXIÓN TEMPEST API   ${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}========================================${colors.reset}\n`);

  await verifyTempestConnection();

  console.log(`\n${colors.bright}${colors.magenta}========================================${colors.reset}`);
};

// Ejecutar si se llama directamente
if (process.argv[1] && process.argv[1].includes('tempestVerify.js')) {
  main().catch(console.error);
}

export default verifyTempestConnection;