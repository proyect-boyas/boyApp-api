import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';

// Crear servidor HTTP y WebSocket
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Almacenar conexiones de clientes móviles con información adicional
const mobileClients = new Map(); // ws -> { token, userId, cameraId }

// Almacenar streams de cámaras
const cameraStreams = new Map(); // cameraId -> { ws, token }

// Middleware para parsear JSON
app.use(express.json());

wss.on('connection', (ws, request) => {
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
        
        console.log(`Cámara ${cameraId} conectada con token: ${token}`);
        cameraStreams.set(cameraId, { ws, token });
        
        ws.on('message', (data) => {
            try {
                // Crear mensaje estructurado con metadata
                const message = {
                    type: 'video_frame',
                    cameraId: cameraId,
                    token: token,
                    timestamp: Date.now(),
                    data: data.toString('base64') // Convertir a base64 para transporte seguro
                };
                
                // Reenviar el frame a todos los clientes móviles suscritos a esta cámara
                broadcastToMobileClients(cameraId, message);
                
            } catch (error) {
                console.error('Error procesando mensaje de cámara:', error);
            }
        });
        
        ws.on('close', () => {
            console.log(`Cámara ${cameraId} desconectada`);
            cameraStreams.delete(cameraId);
        });
        
    } else if (url.startsWith('/mobile')) {
        // Conexión de la app móvil con parámetros
        const token = queryParams.get('token');
        const userId = queryParams.get('userId');
        const cameraId = queryParams.get('cameraId') || 'default';
        
        if (!token || !userId) {
            ws.close(1008, 'Token y userId requeridos');
            return;
        }
        
        console.log(`Cliente móvil conectado - User: ${userId}, Cámara: ${cameraId}`);
        
        // Almacenar cliente con información adicional
        mobileClients.set(ws, { 
            token, 
            userId, 
            cameraId,
            connectedAt: new Date()
        });
        
        // Enviar confirmación de conexión
        ws.send(JSON.stringify({
            type: 'connection_established',
            cameraId: cameraId,
            userId: userId,
            timestamp: Date.now()
        }));
        
        ws.on('close', () => {
            const clientInfo = mobileClients.get(ws);
            console.log(`Cliente móvil desconectado - User: ${clientInfo?.userId}, Cámara: ${clientInfo?.cameraId}`);
            mobileClients.delete(ws);
        });
        
        ws.on('error', (error) => {
            const clientInfo = mobileClients.get(ws);
            console.log(`Error en cliente móvil - User: ${clientInfo?.userId}:`, error);
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
        console.log('Error WebSocket:', error);
    });
});

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
            console.log(`Usuario ${clientInfo.userId} cambiando a cámara: ${newCameraId}`);
            clientInfo.cameraId = newCameraId;
            
            ws.send(JSON.stringify({
                type: 'camera_changed',
                cameraId: newCameraId,
                timestamp: Date.now()
            }));
            break;
            
        default:
            console.log(`Mensaje no reconocido de usuario ${clientInfo.userId}:`, message.type);
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
                console.error(`Error enviando a usuario ${clientInfo.userId}:`, error);
                mobileClients.delete(clientWs);
            }
        }
    });
    
    if (clientsNotified > 0) {
        console.log(`Frame de cámara ${cameraId} enviado a ${clientsNotified} clientes`);
    }
}

// Endpoint de estado mejorado
app.get('/status', (req, res) => {
    const cameraStatus = {};
    cameraStreams.forEach((stream, cameraId) => {
        cameraStatus[cameraId] = {
            connected: stream.ws.readyState === stream.ws.OPEN,
            token: stream.token
        };
    });
    
    const mobileStatus = [];
    mobileClients.forEach((clientInfo, ws) => {
        mobileStatus.push({
            userId: clientInfo.userId,
            cameraId: clientInfo.cameraId,
            connectedAt: clientInfo.connectedAt,
            connectionActive: ws.readyState === ws.OPEN
        });
    });
    
    res.json({
        status: 'running',
        connectedCameras: cameraStreams.size,
        connectedMobileClients: mobileClients.size,
        cameras: cameraStatus,
        mobileClients: mobileStatus
    });
});

// Endpoint para verificar token (simulado)
app.post('/api/verify-token', (req, res) => {
    const { token, userId } = req.body;
    
    // Aquí iría tu lógica real de verificación de token
    if (token && userId) {
        res.json({
            valid: true,
            message: 'Token válido'
        });
    } else {
        res.status(401).json({
            valid: false,
            message: 'Token inválido'
        });
    }
});

const PORT = process.env.WS_PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor WebSocket ejecutándose en puerto ${PORT}`);
    console.log(`📱 Endpoint móvil: ws://localhost:${PORT}/mobile?token=TOKEN&userId=USER_ID&cameraId=CAMERA_ID`);
    console.log(`🎥 Endpoint stream: ws://localhost:${PORT}/stream?token=TOKEN&cameraId=CAMERA_ID`);
    console.log(`📊 Status: http://localhost:${PORT}/status`);
});

export { wss, mobileClients, cameraStreams };