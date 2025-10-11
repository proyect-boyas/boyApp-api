import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import db from "../config/database.js";

// Configuración del JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Almacenar conexiones de clientes móviles con información adicional
const mobileClients = new Map(); // ws -> { userInfo, cameraId }

// Almacenar streams de cámaras
const cameraStreams = new Map(); // cameraId -> { ws, token }

// Función para verificar token de cámara en la base de datos
const verifyCameraToken = async (cameraId, token) => {
  try {
    // Verificar el token JWT primero
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.log(`Token JWT inválido para cámara ${cameraId}:`, jwtError.message);
      return false;
    }

    // Verificar que el token decodificado coincida con el cameraId
    if (decoded.camara_id !== cameraId) {
      console.log(`Token no coincide con cameraId. Token: ${decoded.camara_id}, Solicitado: ${cameraId}`);
      return false;
    }

    // Verificar en la base de datos que el token existe y está activo
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

// Función para verificar token de usuario móvil (basado en tu middleware)
const verifyUserToken = async (token) => {
  try {
    if (!token) {
      return { valid: false, error: 'Token de acceso requerido' };
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verificar que el usuario aún existe en la base de datos y obtener su rol
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

// Función para verificar que la cámara existe y está activa
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

// Función para inicializar WebSocket Server
export const initializeWebSocket = (server) => {
  const wss = new WebSocketServer({ 
    server,
    // No especificamos path para mantener compatibilidad con rutas existentes
  });

  wss.on('connection', async (ws, request) => {
    const url = request.url;
    const queryParams = new URLSearchParams(request.url.split('?')[1]);
    
    console.log(`Nueva conexión WebSocket: ${url}`);
    
    if (url.startsWith('/stream')) {
        // Conexión del script Python con parámetros
        const cameraId = queryParams.get('cameraId') || 'default';
        const token = queryParams.get('token');
        
        if (!token || !cameraId) {
            ws.close(1008, 'Token y cameraId requeridos');
            return;
        }
        
        // Verificar token y cameraId en la base de datos
        const isValid = await verifyCameraToken(cameraId, token);
        if (!isValid) {
            ws.close(1008, 'Token inválido o cámara no autorizada');
            return;
        }
        
        console.log(`✅ Cámara ${cameraId} autenticada y conectada`);
        cameraStreams.set(cameraId, { ws, token });
        
        // Notificar a clientes móviles que la cámara está en línea
        notifyCameraStatus(cameraId, 'online');
        
        ws.on('message', (data) => {
            try {
                // Crear mensaje estructurado con metadata
                const message = {
                    type: 'video_frame',
                    cameraId: cameraId,
                    timestamp: Date.now(),
                    data: data.toString('base64')
                };
                
                // Reenviar el frame a todos los clientes móviles suscritos a esta cámara
                broadcastToMobileClients(cameraId, message);
                
            } catch (error) {
                console.error('Error procesando mensaje de cámara:', error);
            }
        });
        
        ws.on('close', () => {
            console.log(`🔴 Cámara ${cameraId} desconectada`);
            cameraStreams.delete(cameraId);
            // Notificar a clientes que la cámara está offline
            notifyCameraStatus(cameraId, 'offline');
        });
        
        ws.on('error', (error) => {
            console.error(`❌ Error en cámara ${cameraId}:`, error);
            cameraStreams.delete(cameraId);
            notifyCameraStatus(cameraId, 'offline');
        });
        
    } else if (url.startsWith('/mobile')) {
        // Conexión de la app móvil con parámetros
        const token = queryParams.get('token');
        const cameraId = queryParams.get('cameraId') || 'default';
        
        if (!token) {
            ws.close(1008, 'Token requerido');
            return;
        }
        
        // Verificar token de usuario usando tu middleware
        const authResult = await verifyUserToken(token);
        if (!authResult.valid) {
            ws.close(1008, authResult.error);
            return;
        }
        
        // Verificar que la cámara solicitada existe y está activa
        const cameraExists = await checkCameraExists(cameraId);
        if (!cameraExists) {
            ws.close(1008, 'Cámara no encontrada o inactiva');
            return;
        }
        
        const userInfo = authResult.user;
        console.log(`✅ Cliente móvil conectado - User: ${userInfo.nombre}, Cámara: ${cameraId}`);
        
        // Almacenar cliente con información adicional
        mobileClients.set(ws, { 
            userInfo, 
            cameraId,
            connectedAt: new Date()
        });
        
        // Enviar confirmación de conexión
        ws.send(JSON.stringify({
            type: 'connection_established',
            cameraId: cameraId,
            user: {
                id: userInfo.id,
                nombre: userInfo.nombre,
                role: userInfo.role
            },
            timestamp: Date.now(),
            cameraStatus: cameraStreams.has(cameraId) ? 'online' : 'offline'
        }));
        
        ws.on('close', () => {
            const clientInfo = mobileClients.get(ws);
            console.log(`🔴 Cliente móvil desconectado - User: ${clientInfo?.userInfo.nombre}, Cámara: ${clientInfo?.cameraId}`);
            mobileClients.delete(ws);
        });
        
        ws.on('error', (error) => {
            const clientInfo = mobileClients.get(ws);
            console.log(`❌ Error en cliente móvil - User: ${clientInfo?.userInfo.nombre}:`, error);
            mobileClients.delete(ws);
        });
        
        // Manejar mensajes del cliente móvil
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleMobileMessage(ws, message);
            } catch (error) {
                console.error('Error procesando mensaje del móvil:', error);
            }
        });
    }
    
    ws.on('error', (error) => {
        console.log('❌ Error WebSocket:', error);
    });
  });

  console.log('✅ WebSocket Server inicializado');
  return wss;
};

// Función para notificar cambios de estado de la cámara
function notifyCameraStatus(cameraId, status) {
  const statusMessage = {
    type: 'camera_status',
    cameraId: cameraId,
    status: status,
    timestamp: Date.now()
  };
  
  // Enviar a todos los clientes suscritos a esta cámara
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

function handleMobileMessage(ws, message) {
    const clientInfo = mobileClients.get(ws);
    
    if (!clientInfo) return;
    
    switch (message.type) {
        case 'ping':
            ws.send(JSON.stringify({
                type: 'pong',
                timestamp: Date.now()
            }));
            break;
            
        case 'change_camera':
            const newCameraId = message.cameraId;
            console.log(`Usuario ${clientInfo.userInfo.nombre} cambiando a cámara: ${newCameraId}`);
            
            // Verificar que la nueva cámara existe
            checkCameraExists(newCameraId).then(exists => {
                if (exists) {
                    clientInfo.cameraId = newCameraId;
                    
                    ws.send(JSON.stringify({
                        type: 'camera_changed',
                        cameraId: newCameraId,
                        timestamp: Date.now(),
                        cameraStatus: cameraStreams.has(newCameraId) ? 'online' : 'offline'
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Cámara no encontrada',
                        cameraId: newCameraId
                    }));
                }
            });
            break;
            
        case 'list_cameras':
            // Obtener lista de cámaras disponibles
            getAvailableCameras().then(cameras => {
                ws.send(JSON.stringify({
                    type: 'cameras_list',
                    cameras: cameras,
                    timestamp: Date.now()
                }));
            });
            break;
            
        default:
            console.log(`Mensaje no reconocido de usuario ${clientInfo.userInfo.nombre}:`, message.type);
    }
}

// Función para obtener cámaras disponibles
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
      online: cameraStreams.has(camara.camara_id)
    }));
  } catch (error) {
    console.error('Error obteniendo cámaras:', error);
    return [];
  }
}

function broadcastToMobileClients(cameraId, message) {
    let clientsNotified = 0;
    
    mobileClients.forEach((clientInfo, clientWs) => {
        // Enviar solo a clientes suscritos a esta cámara y con conexión abierta
        if (clientInfo.cameraId === cameraId && clientWs.readyState === clientWs.OPEN) {
            try {
                clientWs.send(JSON.stringify(message));
                clientsNotified++;
            } catch (error) {
                console.error(`Error enviando a usuario ${clientInfo.userInfo.nombre}:`, error);
                mobileClients.delete(clientWs);
            }
        }
    });
    
    if (clientsNotified > 0 && clientsNotified % 30 === 0) {
        console.log(`📤 Frame de cámara ${cameraId} enviado a ${clientsNotified} clientes`);
    }
}

// Exportar funciones y variables
export { 
  mobileClients, 
  cameraStreams, 
  verifyCameraToken, 
  verifyUserToken,
  notifyCameraStatus,
  broadcastToMobileClients
};