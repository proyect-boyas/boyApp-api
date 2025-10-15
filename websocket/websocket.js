import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import db from "../config/database.js";
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// WebRTC Configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

// Almacenar conexiones de clientes móviles
const mobileClients = new Map(); // ws -> { userInfo, cameraId, peerConnection }

// Almacenar conexiones de cámaras
const cameraClients = new Map(); // cameraId -> { ws, token, peerConnections }

// Almacenar streams HLS activos
const hlsStreams = new Map(); // cameraId -> { ffmpegProcess, streamPath, videoStream }
const pendingOffers = new Map();
// Configuración del JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Configuración HLS
const HLS_BASE_PATH = path.join(__dirname, 'hls-streams');

// Asegurar que el directorio HLS existe
fs.ensureDirSync(HLS_BASE_PATH);

class HLSStreamManager {
  constructor() {
    this.activeStreams = new Map();
  }

  startHLSStream(cameraId) {
    try {
      // Si ya existe un stream, lo detenemos primero
      if (this.activeStreams.has(cameraId)) {
        this.stopHLSStream(cameraId);
      }

      const streamPath = path.join(HLS_BASE_PATH, cameraId);
      fs.ensureDirSync(streamPath);

      // Crear un stream de passthrough para los datos de video
      const videoStream = new PassThrough();

      console.log(`🎬 Iniciando conversión HLS para cámara ${cameraId}`);

      const ffmpegProcess = ffmpeg(videoStream)
        .inputOptions([
          '-fflags nobuffer',
          '-flags low_delay',
          '-probesize 32',
          '-analyzeduration 0'
        ])
        .outputOptions([
          '-c copy',
          '-f hls',
          '-hls_time 2',
          '-hls_list_size 5',
          '-hls_segment_filename', path.join(streamPath, 'segment%03d.ts'),
          '-hls_flags delete_segments',
          '-hls_playlist_type event'
        ])
        .output(path.join(streamPath, 'playlist.m3u8'))
        .on('start', (commandLine) => {
          console.log(`🟢 FFmpeg iniciado para ${cameraId}: ${commandLine}`);
        })
        .on('stderr', (stderrLine) => {
          // Logs detallados de FFmpeg
          if (stderrLine.includes('frame=') || stderrLine.includes('time=')) {
            console.log(`📊 FFmpeg [${cameraId}]: ${stderrLine.trim()}`);
          }
        })
        .on('progress', (progress) => {
          console.log(`⏱️ FFmpeg [${cameraId}]: Progreso - ${progress.timemark}`);
        })
        .on('error', (err) => {
          console.error(`❌ Error FFmpeg para ${cameraId}:`, err);
          this.stopHLSStream(cameraId);
        })
        .on('end', () => {
          console.log(`🔴 FFmpeg finalizado para ${cameraId}`);
          this.stopHLSStream(cameraId);
        });

      ffmpegProcess.run();

      const streamInfo = {
        cameraId,
        streamPath,
        videoStream,
        ffmpegProcess,
        startTime: Date.now(),
        playlistUrl: `/hls/${cameraId}/playlist.m3u8`
      };

      this.activeStreams.set(cameraId, streamInfo);
      return streamInfo;

    } catch (error) {
      console.error(`❌ Error iniciando stream HLS para ${cameraId}:`, error);
      return null;
    }
  }

  getStreamInfo(cameraId) {
    return this.activeStreams.get(cameraId);
  }

writeVideoData(cameraId, videoData) {
    const streamInfo = this.activeStreams.get(cameraId);
    if (streamInfo && streamInfo.videoStream && !streamInfo.videoStream.destroyed) {
      try {
        // AGREGAR LOGS DE DIAGNÓSTICO
        if (Math.random() < 0.01) { // Log el 1% de los frames para no saturar
          console.log(`📥 HLS [${cameraId}]: Recibiendo datos de video - ${videoData.length} bytes`);
        }
        
        streamInfo.videoStream.write(videoData);
        
        // Contador de datos recibidos
        if (!streamInfo.bytesReceived) streamInfo.bytesReceived = 0;
        streamInfo.bytesReceived += videoData.length;
        
      } catch (error) {
        console.error(`❌ Error escribiendo datos de video para ${cameraId}:`, error);
      }
    } else {
      console.warn(`⚠️ Stream HLS no disponible para ${cameraId}`);
    }
  }

  stopHLSStream(cameraId) {
    const streamInfo = this.activeStreams.get(cameraId);
    if (streamInfo) {
      if (streamInfo.videoStream && !streamInfo.videoStream.destroyed) {
        streamInfo.videoStream.end();
      }
      if (streamInfo.ffmpegProcess) {
        streamInfo.ffmpegProcess.kill('SIGTERM');
      }
      this.activeStreams.delete(cameraId);
      console.log(`🛑 Stream HLS detenido para ${cameraId}`);
    }
  }

  getActiveStreams() {
    return Array.from(this.activeStreams.values());
  }

  cleanupOldStreams() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutos

    this.activeStreams.forEach((streamInfo, cameraId) => {
      if (now - streamInfo.startTime > maxAge) {
        this.stopHLSStream(cameraId);
      }
    });
  }
}

const hlsManager = new HLSStreamManager();

// Función para verificar token de cámara
const verifyCameraToken = async (cameraId, token) => {
  try {
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log(`Token JWT inválido para cámara ${cameraId}:`, jwtError.message);
      return false;
    }

    if (decoded.camara_id !== cameraId) {
      console.log(`Token no coincide con cameraId. Token: ${decoded.camara_id}, Solicitado: ${cameraId}`);
      return false;
    }

    const result = await db.query(
      `SELECT id, camara_id, token, estado FROM camaras WHERE camara_id = $1 AND token = $2 AND estado = 'ACTIVA'`,
      [cameraId, token]
    );

    if (result.rows.length === 0) {
      console.log(`Cámara ${cameraId} no encontrada, token inválido o cámara inactiva`);
      return false;
    }

    console.log(`✅ Token verificado para cámara ${cameraId}`);
    return true;

  } catch (error) {
    console.error('Error verificando token en BD:', error);
    return false;
  }
};

// Función para verificar token de usuario móvil
const verifyUserToken = async (token) => {
  try {
    if (!token) {
      return { valid: false, error: 'Token de acceso requerido' };
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    const result = await db.query(
      'SELECT id, nombre, email, role FROM users WHERE id = $1', 
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return { valid: false, error: 'Usuario no válido' };
    }

    const user = result.rows[0];
    
    return {
      valid: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        role: user.role
      }
    };

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expirado' };
    } else if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Token inválido' };
    } else {
      return { valid: false, error: 'Error al verificar token' };
    }
  }
};

// Función para verificar que la cámara existe
const checkCameraExists = async (cameraId) => {
  try {
    const result = await db.query(
      `SELECT id, camara_id, estado FROM camaras WHERE camara_id = $1 AND estado = 'ACTIVA'`,
      [cameraId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error verificando cámara en BD:', error);
    return false;
  }
};

// Función para inicializar WebSocket Server con WebRTC
export const initializeWebSocket = (server) => {
  const wss = new WebSocketServer({ 
    server,
    perMessageDeflate: false
  });

  wss.on('connection', async (ws, request) => {
    const url = request.url;
    const queryParams = new URLSearchParams(request.url.split('?')[1]);
    
    console.log(`Nueva conexión WebSocket: ${url}`);
    
    if (url.startsWith('/stream')) {
      // Conexión de la cámara (Python/FFmpeg)
      await handleCameraConnection(ws, queryParams);
      
    } else if (url.startsWith('/mobile')) {
      // Conexión de la app móvil
      await handleMobileConnection(ws, queryParams);
      
    } else if (url.startsWith('/webrtc')) {
      // Conexión WebRTC específica
      await handleWebRTCConnection(ws, queryParams);
    }
    
    ws.on('error', (error) => {
      console.log('❌ Error WebSocket:', error);
    });
  });

  console.log('✅ WebSocket Server con WebRTC y HLS inicializado');
  return wss;
};

// Manejar conexión de cámara
async function handleCameraConnection(ws, queryParams) {
  const cameraId = queryParams.get('cameraId') || 'default';
  const token = queryParams.get('token');
  
  if (!token || !cameraId) {
    ws.close(1008, 'Token y cameraId requeridos');
    return;
  }
  
  const isValid = await verifyCameraToken(cameraId, token);
  if (!isValid) {
    ws.close(1008, 'Token inválido o cámara no autorizada');
    return;
  }
  
  console.log(`✅ Cámara ${cameraId} autenticada y conectada`);
  cameraClients.set(cameraId, { 
    ws, 
    token,
    peerConnections: new Map() // clientId -> peerConnection info
  });

  // Iniciar stream HLS para esta cámara
  hlsManager.startHLSStream(cameraId);
  
  // Notificar a clientes móviles que la cámara está en línea
  notifyCameraStatus(cameraId, 'online');
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleCameraMessage(cameraId, message, ws);
    } catch (error) {
      console.error('Error procesando mensaje de cámara:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`🔴 Cámara ${cameraId} desconectada`);
    const camera = cameraClients.get(cameraId);
    if (camera) {
      // Cerrar todas las conexiones peer asociadas
      camera.peerConnections.forEach((pcInfo, clientId) => {
        if (pcInfo.ws && pcInfo.ws.readyState === pcInfo.ws.OPEN) {
          pcInfo.ws.close();
        }
      });
    }
    cameraClients.delete(cameraId);
    
    // Detener stream HLS
    hlsManager.stopHLSStream(cameraId);
    
    notifyCameraStatus(cameraId, 'offline');
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Error en cámara ${cameraId}:`, error);
    cameraClients.delete(cameraId);
    
    // Detener stream HLS
    hlsManager.stopHLSStream(cameraId);
    
    notifyCameraStatus(cameraId, 'offline');
  });
}

// Manejar conexión móvil
async function handleMobileConnection(ws, queryParams) {
  const token = queryParams.get('token');
  const cameraId = queryParams.get('cameraId') || 'default';
  
  if (!token) {
    ws.close(1008, 'Token requerido');
    return;
  }
  
  const authResult = await verifyUserToken(token);
  if (!authResult.valid) {
    ws.close(1008, authResult.error);
    return;
  }
  
  const cameraExists = await checkCameraExists(cameraId);
  if (!cameraExists) {
    ws.close(1008, 'Cámara no encontrada o inactiva');
    return;
  }
  
  const userInfo = authResult.user;
  const clientId = generateClientId();
  
  console.log(`✅ Cliente móvil conectado - User: ${userInfo.nombre}, Cámara: ${cameraId}, ClientId: ${clientId}`);
  
  mobileClients.set(ws, { 
    userInfo, 
    cameraId,
    clientId,
    connectedAt: new Date()
  });
  
  // Enviar confirmación de conexión
  ws.send(JSON.stringify({
    type: 'connection_established',
    cameraId: cameraId,
    clientId: clientId,
    user: {
      id: userInfo.id,
      nombre: userInfo.nombre,
      role: userInfo.role
    },
    iceServers: ICE_SERVERS,
    timestamp: Date.now(),
    cameraStatus: cameraClients.has(cameraId) ? 'online' : 'offline',
    hlsUrl: hlsManager.getStreamInfo(cameraId) ? `/api/hls/${cameraId}/playlist.m3u8` : null
  }));
  
  ws.on('close', () => {
    const clientInfo = mobileClients.get(ws);
    console.log(`🔴 Cliente móvil desconectado - User: ${clientInfo?.userInfo.nombre}, Cámara: ${clientInfo?.cameraId}`);
    
    // Limpiar conexiones peer
    if (clientInfo) {
      const camera = cameraClients.get(clientInfo.cameraId);
      if (camera) {
        camera.peerConnections.delete(clientInfo.clientId);
      }
    }
    
    mobileClients.delete(ws);
  });
  
  ws.on('error', (error) => {
    const clientInfo = mobileClients.get(ws);
    console.log(`❌ Error en cliente móvil - User: ${clientInfo?.userInfo.nombre}:`, error);
    mobileClients.delete(ws);
  });
  
  // Manejar mensajes del cliente móvil
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMobileMessage(ws, message);
    } catch (error) {
      console.error('Error procesando mensaje del móvil:', error);
    }
  });
}

// Manejar conexión WebRTC directa
async function handleWebRTCConnection(ws, queryParams) {
  const type = queryParams.get('type'); // 'camera' o 'mobile'
  const cameraId = queryParams.get('cameraId');
  const token = queryParams.get('token');
  const clientId = queryParams.get('clientId');
  
  if (type === 'camera') {
    // Conexión WebRTC desde cámara
    if (!token || !cameraId) {
      ws.close(1008, 'Token y cameraId requeridos');
      return;
    }
    
    const isValid = await verifyCameraToken(cameraId, token);
    if (!isValid) {
      ws.close(1008, 'Token inválido o cámara no autorizada');
      return;
    }
    
    console.log(`📹 Conexión WebRTC desde cámara ${cameraId}`);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebRTCMessage(ws, message, 'camera', cameraId);
      } catch (error) {
        console.error('Error procesando mensaje WebRTC cámara:', error);
      }
    });
    
  } else if (type === 'mobile') {
    // Conexión WebRTC desde móvil
    if (!clientId || !cameraId) {
      ws.close(1008, 'clientId y cameraId requeridos');
      return;
    }
    
    console.log(`📱 Conexión WebRTC desde móvil para cámara ${cameraId}`);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebRTCMessage(ws, message, 'mobile', cameraId, clientId);
      } catch (error) {
        console.error('Error procesando mensaje WebRTC móvil:', error);
      }
    });
  }
}

// Manejar mensajes de cámara
async function handleCameraMessage(cameraId, message, ws) {
  switch (message.type) {
    case 'webrtc_offer':
      // La cámara envía una oferta WebRTC
      console.log(`📹 Cámara ${cameraId} envió oferta WebRTC`);
      pendingOffers.set(cameraId, message.offer);
      
      // Notificar a clientes móviles que hay una oferta disponible
      notifyWebRTCOffer(cameraId, message.offer);
      break;
      
    case 'webrtc_candidate':
      // La cámara envía un ICE candidate
      forwardICECandidate(cameraId, null, message.candidate, 'camera');
      break;
      
    case 'webrtc_answer':
      // La cámara responde a una oferta (caso poco común)
      const answerClientId = message.clientId;
      if (answerClientId) {
        const clientWs = findClientWebSocket(answerClientId);
        if (clientWs && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'webrtc_answer',
            answer: message.answer,
            cameraId: cameraId
          }));
        }
      }
      break;
      
    case 'video_frame':
      // La cámara envía frames de video (formato MPEG-TS o similar)
      // console.log(`🎥 Cámara ${cameraId} envió frame de video (size: ${message.size || 'N/A'} bytes)`);
      
      // Procesar frame para HLS
      if (message.data) {
        try {
          // Convertir base64 a buffer
          const videoData = Buffer.from(message.data, 'base64');
          
          // Escribir en el stream HLS
          hlsManager.writeVideoData(cameraId, videoData);
          
        } catch (error) {
          console.error(`❌ Error procesando frame HLS para ${cameraId}:`, error);
        }
      }
      
      // Reenviar el frame a todos los clientes móviles conectados a esta cámara
      forwardVideoFrameToClients(cameraId, message);
      break;
      case 'camera_heartbeat':
      // Manejar heartbeat de la cámara
      console.log(`❤️ Heartbeat recibido de cámara ${cameraId}`);
      
      // Actualizar último heartbeat
      const camera = cameraClients.get(cameraId);
      if (camera) {
        camera.lastHeartbeat = Date.now();
        cameraClients.set(cameraId, camera);
      }
      
      // Responder con acknowledgment
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat_ack',
          timestamp: Date.now(),
          cameraId: cameraId
        }));
      }
      break;
    default:
      console.log(`Mensaje no reconocido de cámara ${cameraId}:`, message.type);
  }
}

// Manejar mensajes móviles
async function handleMobileMessage(ws, message) {
  const clientInfo = mobileClients.get(ws);
  
  if (!clientInfo) return;
  
  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
      break;
      
    case 'request_stream':
      // Cliente solicita iniciar stream WebRTC
      await handleStreamRequest(clientInfo.cameraId, clientInfo.clientId, ws);
      break;
      
    case 'request_hls':
      // Cliente solicita URL HLS
      const hlsStreamInfo = hlsManager.getStreamInfo(clientInfo.cameraId);
      if (hlsStreamInfo) {
        ws.send(JSON.stringify({
          type: 'hls_url',
          url: `/api/hls/${clientInfo.cameraId}/playlist.m3u8`,
          cameraId: clientInfo.cameraId
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Stream HLS no disponible'
        }));
      }
      break;
      
    case 'webrtc_answer':
      // Cliente envía respuesta WebRTC
      if (message.answer && clientInfo.cameraId) {
        const camera = cameraClients.get(clientInfo.cameraId);
        if (camera && camera.ws.readyState === camera.ws.OPEN) {
          camera.ws.send(JSON.stringify({
            type: 'webrtc_answer',
            answer: message.answer,
            clientId: clientInfo.clientId
          }));
        }
      }
      break;
      
    case 'webrtc_candidate':
      // Cliente envía ICE candidate
      if (message.candidate && clientInfo.cameraId) {
        const camera = cameraClients.get(clientInfo.cameraId);
        if (camera && camera.ws.readyState === camera.ws.OPEN) {
          camera.ws.send(JSON.stringify({
            type: 'webrtc_candidate',
            candidate: message.candidate,
            clientId: clientInfo.clientId
          }));
        }
      }
      break;
      
    case 'change_camera':
      const newCameraId = message.cameraId;
      console.log(`Usuario ${clientInfo.userInfo.nombre} cambiando a cámara: ${newCameraId}`);
      
      const exists = await checkCameraExists(newCameraId);
      if (exists) {
        clientInfo.cameraId = newCameraId;
        
        ws.send(JSON.stringify({
          type: 'camera_changed',
          cameraId: newCameraId,
          timestamp: Date.now(),
          cameraStatus: cameraClients.has(newCameraId) ? 'online' : 'offline',
          hlsUrl: hlsManager.getStreamInfo(newCameraId) ? `/api/hls/${newCameraId}/playlist.m3u8` : null
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Cámara no encontrada',
          cameraId: newCameraId
        }));
      }
      break;
      
    case 'list_cameras':
      const cameras = await getAvailableCameras();
      ws.send(JSON.stringify({
        type: 'cameras_list',
        cameras: cameras,
        timestamp: Date.now()
      }));
      break;
      
    default:
      console.log(`Mensaje no reconocido de usuario ${clientInfo.userInfo.nombre}:`, message.type);
  }
}

function forwardVideoFrameToClients(cameraId, message) {
  let clientsForwarded = 0;
  
  mobileClients.forEach((clientInfo, clientWs) => {
    if (clientInfo.cameraId === cameraId && clientWs.readyState === clientWs.OPEN) {
      try {
        clientWs.send(JSON.stringify({
          type: 'video_frame',
          data: message.data, // Datos del frame (base64 o buffer)
          size: message.size,
          timestamp: message.timestamp || Date.now(),
          cameraId: cameraId
        }));
        clientsForwarded++;
      } catch (error) {
        console.error(`Error enviando video frame a usuario ${clientInfo.userInfo.nombre}:`, error);
      }
    }
  });
  
  // Log cada 100 frames para no saturar la consola
  if (Math.random() < 0.01) { // 1% de probabilidad
    console.log(`📊 Frame de ${cameraId} reenviado a ${clientsForwarded} clientes`);
  }
}

// Manejar mensajes WebRTC
async function handleWebRTCMessage(ws, message, type, cameraId, clientId = null) {
  switch (message.type) {
    case 'offer':
      if (type === 'mobile') {
        // Móvil envía oferta a cámara
        const camera = cameraClients.get(cameraId);
        if (camera && camera.ws.readyState === camera.ws.OPEN) {
          camera.ws.send(JSON.stringify({
            type: 'webrtc_offer',
            offer: message.offer,
            clientId: clientId
          }));
        }
      }
      break;
      
    case 'answer':
      if (type === 'camera') {
        // Cámara envía respuesta a móvil
        const clientWs = findClientWebSocket(clientId);
        if (clientWs && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'webrtc_answer',
            answer: message.answer,
            cameraId: cameraId
          }));
        }
      }
      break;
      
    case 'candidate':
      if (type === 'camera') {
        // Cámara envía ICE candidate a móvil
        const clientWs = findClientWebSocket(clientId);
        if (clientWs && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'webrtc_candidate',
            candidate: message.candidate,
            cameraId: cameraId
          }));
        }
      } else if (type === 'mobile') {
        // Móvil envía ICE candidate a cámara
        const camera = cameraClients.get(cameraId);
        if (camera && camera.ws.readyState === camera.ws.OPEN) {
          camera.ws.send(JSON.stringify({
            type: 'webrtc_candidate',
            candidate: message.candidate,
            clientId: clientId
          }));
        }
      }
      break;
  }
}

// Solicitar stream a la cámara
async function handleStreamRequest(cameraId, clientId, clientWs) {
  const camera = cameraClients.get(cameraId);
  
  if (!camera) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'Cámara no disponible'
    }));
    return;
  }
  
  if (camera.ws.readyState !== camera.ws.OPEN) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'Cámara desconectada'
    }));
    return;
  }
  
  console.log(`🎬 Solicitando stream de cámara ${cameraId} para cliente ${clientId}`);
  
  // Solicitar a la cámara que inicie WebRTC
  camera.ws.send(JSON.stringify({
    type: 'start_webrtc',
    clientId: clientId
  }));
  
  // Registrar la conexión peer
  if (!camera.peerConnections.has(clientId)) {
    camera.peerConnections.set(clientId, {
      ws: clientWs,
      connectedAt: new Date()
    });
  }
}

// Notificar oferta WebRTC a clientes
function notifyWebRTCOffer(cameraId, offer) {
  mobileClients.forEach((clientInfo, clientWs) => {
    if (clientInfo.cameraId === cameraId && clientWs.readyState === clientWs.OPEN) {
      try {
        clientWs.send(JSON.stringify({
          type: 'webrtc_offer',
          offer: offer,
          cameraId: cameraId,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error(`Error enviando oferta a usuario ${clientInfo.userInfo.nombre}:`, error);
      }
    }
  });
}

// Reenviar ICE candidates
function forwardICECandidate(cameraId, clientId, candidate, source) {
  if (source === 'camera') {
    // De cámara a todos los clientes móviles
    mobileClients.forEach((clientInfo, clientWs) => {
      if (clientInfo.cameraId === cameraId && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'webrtc_candidate',
          candidate: candidate,
          cameraId: cameraId
        }));
      }
    });
  }
}

// Encontrar WebSocket de cliente por ID
function findClientWebSocket(clientId) {
  for (const [ws, clientInfo] of mobileClients.entries()) {
    if (clientInfo.clientId === clientId) {
      return ws;
    }
  }
  return null;
}

// Notificar cambios de estado de cámara
function notifyCameraStatus(cameraId, status) {
  const statusMessage = {
    type: 'camera_status',
    cameraId: cameraId,
    status: status,
    timestamp: Date.now()
  };
  
  mobileClients.forEach((clientInfo, clientWs) => {
    if (clientInfo.cameraId === cameraId && clientWs.readyState === clientWs.OPEN) {
      try {
        clientWs.send(JSON.stringify(statusMessage));
      } catch (error) {
        console.error(`Error enviando estado de cámara a usuario ${clientInfo.userInfo.nombre}:`, error);
      }
    }
  });
}

// Generar ID único para cliente
function generateClientId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Obtener cámaras disponibles
async function getAvailableCameras() {
  try {
    const result = await db.query(
      `SELECT camara_id, modelo, fabricante, estado, url 
       FROM camaras 
       WHERE estado = 'ACTIVA'
       ORDER BY created_at DESC`
    );
    
    return result.rows.map(camara => ({
      cameraId: camara.camara_id,
      modelo: camara.modelo,
      fabricante: camara.fabricante,
      estado: camara.estado,
      url: camara.url,
      online: cameraClients.has(camara.camara_id),
      hlsAvailable: hlsManager.getStreamInfo(camara.camara_id) !== null
    }));
  } catch (error) {
    console.error('Error obteniendo cámaras:', error);
    return [];
  }
}

// Exportar funciones y variables
export { 
  mobileClients, 
  cameraClients, 
  hlsManager,
  verifyCameraToken, 
  verifyUserToken,
  notifyCameraStatus
};