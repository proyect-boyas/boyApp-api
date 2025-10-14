import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { hlsManager } from '../websocket/websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Servir archivos HLS estáticamente
router.use('/hls', express.static(path.join(__dirname, 'hls-streams')));

// Endpoint para obtener la playlist HLS de una cámara
router.get('/hls/:cameraId/playlist.m3u8', (req, res) => {
  const { cameraId } = req.params;
  const streamInfo = hlsManager.getStreamInfo(cameraId);
  
  if (!streamInfo) {
    return res.status(404).json({ 
      error: 'Stream HLS no disponible para esta cámara',
      cameraId 
    });
  }

  const playlistPath = path.join(streamInfo.streamPath, 'playlist.m3u8');
  
  // Verificar si el archivo de playlist existe
  if (!fs.existsSync(playlistPath)) {
    return res.status(404).json({ 
      error: 'Playlist no disponible todavía',
      cameraId 
    });
  }

  // Configurar headers para HLS
  res.set({
    'Content-Type': 'application/vnd.apple.mpegurl',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  });

  res.sendFile(playlistPath);
});

// Endpoint para servir segmentos TS individuales
router.get('/hls/:cameraId/:segment', (req, res) => {
  const { cameraId, segment } = req.params;
  const streamInfo = hlsManager.getStreamInfo(cameraId);
  
  if (!streamInfo) {
    return res.status(404).json({ error: 'Stream no encontrado' });
  }

  const segmentPath = path.join(streamInfo.streamPath, segment);
  
  if (!fs.existsSync(segmentPath)) {
    return res.status(404).json({ error: 'Segmento no encontrado' });
  }

  res.set({
    'Content-Type': 'video/MP2T',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  });

  res.sendFile(segmentPath);
});

// API para gestionar streams HLS
router.get('/hls/streams', (req, res) => {
  const activeStreams = hlsManager.getActiveStreams().map(stream => ({
    cameraId: stream.cameraId,
    playlistUrl: `/hls/${stream.cameraId}/playlist.m3u8`,
    startTime: stream.startTime,
    status: 'active',
    duration: Date.now() - stream.startTime
  }));
  
  res.json({ 
    streams: activeStreams,
    total: activeStreams.length 
  });
});

// Iniciar stream HLS manualmente
router.post('/hls/:cameraId/start', (req, res) => {
  const { cameraId } = req.params;
  
  // Verificar si la cámara está conectada
  const camera = cameraClients.get(cameraId);
  if (!camera) {
    return res.status(404).json({ 
      error: 'Cámara no conectada',
      cameraId 
    });
  }

  // Iniciar stream HLS
  const streamInfo = hlsManager.startHLSStream(cameraId);
  
  if (!streamInfo) {
    return res.status(500).json({ 
      error: 'Error iniciando stream HLS',
      cameraId 
    });
  }

  res.json({
    message: 'Stream HLS iniciado',
    cameraId,
    playlistUrl: `/hls/${cameraId}/playlist.m3u8`,
    streamId: streamInfo.streamId
  });
});

// Detener stream HLS
router.post('/hls/:cameraId/stop', (req, res) => {
  const { cameraId } = req.params;
  
  hlsManager.stopHLSStream(cameraId);
  
  res.json({
    message: 'Stream HLS detenido',
    cameraId
  });
});

// Obtener información del stream HLS
router.get('/hls/:cameraId/info', (req, res) => {
  const { cameraId } = req.params;
  const streamInfo = hlsManager.getStreamInfo(cameraId);
  
  if (!streamInfo) {
    return res.status(404).json({ 
      error: 'Stream HLS no encontrado',
      cameraId 
    });
  }

  const streamPath = streamInfo.streamPath;
  let segments = [];
  
  try {
    // Leer segmentos existentes
    const files = fs.readdirSync(streamPath);
    segments = files.filter(file => file.endsWith('.ts'));
  } catch (error) {
    console.error('Error leyendo segmentos:', error);
  }

  res.json({
    cameraId,
    playlistUrl: `/hls/${cameraId}/playlist.m3u8`,
    startTime: streamInfo.startTime,
    duration: Date.now() - streamInfo.startTime,
    segmentsCount: segments.length,
    status: 'active'
  });
});

// Endpoint principal para obtener URL HLS
router.get('/hls/:cameraId/url', (req, res) => {
  const { cameraId } = req.params;
  const streamInfo = hlsManager.getStreamInfo(cameraId);
  
  if (!streamInfo) {
    return res.status(404).json({ 
      error: 'No hay un stream HLS activo para esta cámara',
      cameraId 
    });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    cameraId,
    playlistUrl: `${baseUrl}/hls/${cameraId}/playlist.m3u8`,
    hlsUrl: `${baseUrl}/hls/${cameraId}/playlist.m3u8`,
    status: 'active',
    message: 'Usa esta URL en cualquier reproductor HLS compatible'
  });
});

export default router;