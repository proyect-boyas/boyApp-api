import axios from 'axios';
import db from '../config/database.js';

// Clave API de Tempest (deberías configurarla en las variables de entorno)
const TEMPEST_API_KEY = process.env.TEMPEST_API_KEY;
const TEMPEST_BASE_URL =process.env.TEMPEST_API_URL;

// Obtener datos de una estación desde la API de Tempest
const fetchStationData = async (station_id) => {
  try {
    if (!TEMPEST_API_KEY || TEMPEST_API_KEY === 'tu_api_key_aqui') {
      throw new Error('API key de Tempest no configurada');
    }
    
    const response = await axios.get(`${TEMPEST_BASE_URL}/stations/${station_id}`, {
      headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
      timeout: 10000 // Timeout de 10 segundos
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching Tempest API data:', error.message);
    throw error;
  }
};

// Guardar datos de estación en caché
// const cacheStationData = async (stationData) => {
//   try {
//     const { station_id, station_name, latitude, longitude } = stationData;
    
//     await db.query(
//       `INSERT INTO estaciones (station_id, nombre, latitud, longitud, datos, ultima_actualizacion) 
//        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
//        ON CONFLICT (station_id) 
//        DO UPDATE SET nombre = $2, latitud = $3, longitud = $4, datos = $5, ultima_actualizacion = CURRENT_TIMESTAMP`,
//       [station_id, station_name, latitude, longitude, JSON.stringify(stationData)]
//     );
    
//     return true;
//   } catch (error) {
//     console.error('Error caching station data:', error);
//     throw error;
//   }
// };
const cacheStationData = async (stationData) => {
  try {
    // Verificar que la respuesta tenga la estructura esperada
    if (!stationData.stations || stationData.stations.length === 0) {
      throw new Error('No station data found in API response');
    }
    
    if (stationData.status.status_code !== 0) {
      throw new Error(`API Error: ${stationData.status.status_message}`);
    }
    
    // Extraer los datos específicos de la primera estación
    const station = stationData.stations[0];
    const { station_id, name: station_name, latitude, longitude } = station;
    
    await db.query(
      `INSERT INTO estaciones (station_id, nombre, latitud, longitud, datos, ultima_actualizacion) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (station_id) 
       DO UPDATE SET nombre = $2, latitud = $3, longitud = $4, datos = $5, ultima_actualizacion = CURRENT_TIMESTAMP`,
      [station_id, station_name, latitude, longitude, JSON.stringify(stationData)]
    );
    
    return true;
  } catch (error) {
    console.error('Error caching station data:', error);
    throw error;
  }
};
// Obtener datos cacheados de una estación
const getCachedStationData = async (station_id) => {
  try {
    const result = await db.query(
      'SELECT * FROM estaciones WHERE station_id = $1',
      [station_id]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cached station data:', error);
    throw error;
  }
};

// Verificar si los datos cacheados están actualizados (menos de 10 minutos)
const isCacheValid = (cachedData) => {
  if (!cachedData || !cachedData.ultima_actualizacion) return false;
  
  const lastUpdate = new Date(cachedData.ultima_actualizacion);
  const now = new Date();
  const diffInMinutes = (now - lastUpdate) / (1000 * 60);
  
  return diffInMinutes < 10; // Cache válido por 10 minutos
};

// Obtener observaciones actuales de una estación
const getCurrentObservations = async (station_id) => {
  try {
    if (!TEMPEST_API_KEY || TEMPEST_API_KEY === 'tu_api_key_aqui') {
      throw new Error('API key de Tempest no configurada');
    }
    
    const response = await axios.get(`${TEMPEST_BASE_URL}/observations/station/${station_id}`, {
      headers: { 'Authorization': `Bearer ${TEMPEST_API_KEY}` },
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching current observations:', error.message);
    throw error;
  }
};

export {
  fetchStationData,
  cacheStationData,
  getCachedStationData,
  isCacheValid,
  getCurrentObservations
};