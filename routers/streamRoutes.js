import express from 'express';
import { cameraClients, mobileClients, hlsManager } from '../websocket/websocket.js';

const router = express.Router();

// Middleware para inyectar conexiones WebSocket
export const injectWebSocketConnections = (mobileClients, cameraClients, verifyCameraToken) => {
  return (req, res, next) => {
    req.mobileClients = mobileClients;
    req.cameraClients = cameraClients;
    req.verifyCameraToken = verifyCameraToken;
    next();
  };
};

// Endpoint de estado
router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'WebSocket Streaming Server',
    timestamp: new Date().toISOString(),
    connections: {
      cameras: req.cameraClients.size,
      mobileClients: req.mobileClients.size
    }
  });
});

// Información de conexiones
router.get('/info', (req, res) => {
  const cameraConnections = Array.from(req.cameraClients.entries()).map(([cameraId, data]) => ({
    cameraId,
    connectedAt: data.connectedAt || 'N/A',
    status: 'online'
  }));

  const mobileConnections = Array.from(req.mobileClients.entries()).map(([ws, data]) => ({
    clientId: data.clientId,
    userId: data.userInfo?.id,
    userName: data.userInfo?.nombre,
    cameraId: data.cameraId,
    connectedAt: data.connectedAt
  }));

  res.json({
    cameras: cameraConnections,
    mobileClients: mobileConnections,
    totals: {
      cameras: cameraConnections.length,
      mobileClients: mobileConnections.length
    }
  });
});

// Lista de cámaras disponibles
router.get('/cameras', async (req, res) => {
  try {
    // Aquí necesitas importar tu conexión a la base de datos
    const db = req.db; // Asumiendo que tienes middleware de base de datos
    
    const result = await db.query(
      `SELECT camara_id, modelo, fabricante, estado, url, created_at 
       FROM camaras 
       WHERE estado = 'ACTIVA'
       ORDER BY created_at DESC`
    );
    
    const cameras = result.rows.map(camara => ({
      cameraId: camara.camara_id,
      modelo: camara.modelo,
      fabricante: camara.fabricante,
      estado: camara.estado,
      url: camara.url,
      online: req.cameraClients.has(camara.camara_id), // Usar req.cameraClients
      hlsAvailable: hlsManager.getStreamInfo(camara.camara_id) !== null,
      createdAt: camara.created_at
    }));
    
    res.json({
      cameras: cameras,
      total: cameras.length,
      online: cameras.filter(cam => cam.online).length
    });
    
  } catch (error) {
    console.error('Error al obtener cámaras:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// Estadísticas del sistema
router.get('/stats', (req, res) => {
  const activeHLSStreams = hlsManager.getActiveStreams();
  
  const stats = {
    connections: {
      cameras: req.cameraClients.size,
      mobileClients: req.mobileClients.size,
      total: req.cameraClients.size + req.mobileClients.size
    },
    streaming: {
      hls: {
        active: activeHLSStreams.length,
        streams: activeHLSStreams.map(stream => ({
          cameraId: stream.cameraId,
          duration: Math.floor((Date.now() - stream.startTime) / 1000),
          playlistUrl: stream.playlistUrl
        }))
      }
    },
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    }
  };
  
  res.json(stats);
});

// Endpoint para forzar desconexión de cámara
router.post('/cameras/:cameraId/disconnect', (req, res) => {
  const { cameraId } = req.params;
  
  const camera = req.cameraClients.get(cameraId);
  if (camera && camera.ws) {
    camera.ws.close(1000, 'Desconexión administrativa');
    req.cameraClients.delete(cameraId);
    
    res.json({
      message: `Cámara ${cameraId} desconectada`,
      cameraId: cameraId
    });
  } else {
    res.status(404).json({
      error: 'Cámara no encontrada o no conectada',
      cameraId: cameraId
    });
  }
});

// Endpoint para reiniciar stream HLS
router.post('/cameras/:cameraId/restart-hls', (req, res) => {
  const { cameraId } = req.params;
  
  // Detener stream existente
  hlsManager.stopHLSStream(cameraId);
  
  // Iniciar nuevo stream
  const streamInfo = hlsManager.startHLSStream(cameraId);
  
  if (streamInfo) {
    res.json({
      message: 'Stream HLS reiniciado',
      cameraId: cameraId,
      playlistUrl: streamInfo.playlistUrl
    });
  } else {
    res.status(500).json({
      error: 'Error al reiniciar stream HLS',
      cameraId: cameraId
    });
  }
});

export default router;