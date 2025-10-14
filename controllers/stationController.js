import db from '../config/database.js';
import {
  fetchStationData,
  cacheStationData,
  getCachedStationData,
  isCacheValid,
  getCurrentObservations,
  getStationStats
} from '../utils/tempestAPI.js';

// Obtener datos de una estación Tempest
const getStationData = async (req, res) => {
  try {
    const { station_id } = req.params;
    
    // Primero verificar si tenemos datos cacheados válidos
    const cachedData = await getCachedStationData(station_id);
    
    if (cachedData && isCacheValid(cachedData)) {
      return res.json({ data: cachedData.datos, source: 'cache' });
    }
    
    // Si no hay caché válido, obtener datos de la API
    try {
      const stationData = await fetchStationData(station_id);
      await cacheStationData(stationData);
      
      res.json({ data: stationData, source: 'api' });
    } catch (apiError) {
      console.warn('Error al conectar con API Tempest:', apiError.message);
      
      // Si falla la API pero tenemos datos cacheados (aunque sean viejos), usarlos
      if (cachedData) {
        console.log('Usando datos cacheados (aunque sean antiguos)');
        res.json({ data: cachedData.datos, source: 'stale_cache' });
      } else {
        res.status(404).json({ error: 'Estación no encontrada' });
      }
    }
  } catch (error) {
    console.error('Error obteniendo datos de estación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Obtener observaciones actuales de una estación
const getStationObservations = async (req, res) => {
  try {
    const { station_id } = req.params;
    
    const observations = await getCurrentObservations(station_id);
    
    res.json({ observations, source: 'api' });
  } catch (error) {
    console.error('Error obteniendo observaciones:', error);
    
    // Intentar devolver datos básicos de la estación si las observaciones fallan
    try {
      const cachedData = await getCachedStationData(station_id);
      if (cachedData) {
        res.json({ 
          observations: cachedData.datos, 
          source: 'cache_fallback',
          note: 'Datos pueden no ser los más actuales' 
        });
      } else {
        res.status(404).json({ error: 'No se pudieron obtener observaciones' });
      }
    } catch (fallbackError) {
      res.status(500).json({ error: 'Error del servidor' });
    }
  }
};

// Agregar una nueva estación (guardar en cache)
const addStation = async (req, res) => {
  try {
    const { station_id } = req.body;
    
    if (!station_id) {
      return res.status(400).json({ error: 'ID de estación requerido' });
    }
    
    // Verificar si ya existe
    const existingResult = await db.query(
      'SELECT station_id FROM estaciones WHERE station_id = $1',
      [station_id]
    );
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'La estación ya existe' });
    }
    
    // Intentar obtener datos de la API
    try {
      const stationData = await fetchStationData(station_id);
      console.log("datos estacion ",stationData);
      await cacheStationData(stationData);
      
      res.status(201).json({ 
        message: 'Estación agregada exitosamente',
        station: stationData 
      });
    } catch (apiError) {
      console.error('Error obteniendo datos de la estación:', apiError.message);
      res.status(400).json({ error: apiError.message });
    }
  } catch (error) {
    console.error('Error agregando estación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Obtener todas las estaciones para mostrar en mapa
const getStationsMap = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT station_id, nombre, latitud, longitud FROM estaciones WHERE latitud IS NOT NULL AND longitud IS NOT NULL'
    );
    
    res.json({ stations: result.rows });
  } catch (error) {
    console.error('Error obteniendo estaciones para mapa:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Obtener detalles de una estación específica
const getStationDetails = async (req, res) => {
  try {
    const { station_id } = req.params;
    
    const result = await db.query(
      'SELECT * FROM estaciones WHERE station_id = $1',
      [station_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estación no encontrada' });
    }
    
    res.json({ station: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo detalles de estación:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// Obtener estadísticas de una estación Tempest
const getStationStatistics = async (req, res) => {
  try {
    const { station_id } = req.params;
    
    // Obtener estadísticas de la API
    const statsData = await getStationStats(station_id);
    
    res.json({ 
      stats: statsData, 
      source: 'api' 
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas de estación:', error);
    
    // Manejar diferentes tipos de errores
    if (error.message.includes('No se pudo conectar') || error.message.includes('timeout')) {
      res.status(503).json({ 
        error: 'Servicio temporalmente no disponible',
        details: error.message 
      });
    } else if (error.message.includes('no configurada')) {
      res.status(500).json({ 
        error: 'Configuración del servidor incompleta' 
      });
    } else if (error.message.includes('No encontrada') || error.message.includes('404')) {
      res.status(404).json({ 
        error: 'Estación no encontrada o no accesible' 
      });
    } else {
      res.status(500).json({ 
        error: 'Error del servidor al obtener estadísticas',
        details: error.message 
      });
    }
  }
};

export { 
  getStationData, 
  getStationObservations, 
  addStation, 
  getStationsMap, 
  getStationDetails,
  getStationStatistics 
};