import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Middleware para inyectar las conexiones WebSocket
export function injectWebSocketConnections(mobileClients, cameraStreams, verifyCameraToken) {
    return (req, res, next) => {
        req.webSocketData = {
            mobileClients,
            cameraStreams,
            verifyCameraToken
        };
        next();
    };
}

// Ruta para información del streaming
router.get('/info', (req, res) => {
    const host = req.headers.host;
    res.json({
        streaming: true,
        endpoints: {
            websocket_mobile: `ws://${host.replace('http', 'ws')}/mobile`,
            websocket_stream: `ws://${host.replace('http', 'ws')}/stream`,
            status: `${req.protocol}://${host}/api/stream/status`,
            verify_token: `${req.protocol}://${host}/api/stream/verify-camera-token`
        }
    });
});

// Endpoint de estado WebSocket
router.get('/status', async (req, res) => {
    const { mobileClients, cameraStreams } = req.webSocketData;
    
    const cameraStatus = {};
    cameraStreams.forEach((stream, cameraId) => {
        cameraStatus[cameraId] = {
            connected: stream.ws.readyState === stream.ws.OPEN,
            token: stream.token ? stream.token.substring(0, 10) + '...' : 'no-token'
        };
    });
    
    const mobileStatus = [];
    mobileClients.forEach((clientInfo, ws) => {
        mobileStatus.push({
            userId: clientInfo.userInfo.id,
            userName: clientInfo.userInfo.nombre,
            cameraId: clientInfo.cameraId,
            connectedAt: clientInfo.connectedAt,
            connectionActive: ws.readyState === ws.OPEN
        });
    });
    
    // Obtener información de cámaras desde la BD
    let dbCameras = [];
    try {
        const result = await db.query(
            `SELECT camara_id, modelo, estado FROM camaras WHERE estado = 'ACTIVA' ORDER BY created_at DESC`
        );
        dbCameras = result.rows;
    } catch (error) {
        console.error('Error obteniendo cámaras de BD:', error);
    }
    
    res.json({
        status: 'running',
        connectedCameras: cameraStreams.size,
        connectedMobileClients: mobileClients.size,
        cameras: cameraStatus,
        mobileClients: mobileStatus,
        databaseCameras: dbCameras,
        timestamp: new Date().toISOString()
    });
});

// Endpoint para verificar token de cámara
router.post('/verify-camera-token', async (req, res) => {
    const { verifyCameraToken } = req.webSocketData;
    const { token, cameraId } = req.body;
    
    if (!token || !cameraId) {
        return res.status(400).json({
            valid: false,
            message: 'Token y cameraId requeridos'
        });
    }
    
    const isValid = await verifyCameraToken(cameraId, token);
    
    if (isValid) {
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

// Endpoint para obtener lista de cámaras disponibles
router.get('/cameras', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT 
                camara_id, 
                modelo, 
                fabricante, 
                estado, 
                url,
                fecha_instalacion,
                fecha_ultimo_mantenimiento,
                created_at
             FROM camaras 
             WHERE estado = 'ACTIVA'
             ORDER BY created_at DESC`
        );
        
        const cameras = result.rows.map(camara => ({
            id: camara.camara_id,
            modelo: camara.modelo,
            fabricante: camara.fabricante,
            estado: camara.estado,
            url: camara.url,
            fecha_instalacion: camara.fecha_instalacion,
            fecha_ultimo_mantenimiento: camara.fecha_ultimo_mantenimiento,
            created_at: camara.created_at
        }));
        
        res.json({
            success: true,
            cameras: cameras,
            total: cameras.length
        });
        
    } catch (error) {
        console.error('Error obteniendo cámaras:', error);
        res.status(500).json({
            success: false,
            error: 'Error del servidor al obtener cámaras'
        });
    }
});

// Endpoint para obtener estadísticas del streaming
router.get('/stats', async (req, res) => {
    const { mobileClients, cameraStreams } = req.webSocketData;
    
    try {
        // Estadísticas de cámaras en BD
        const camarasResult = await db.query(
            `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN estado = 'ACTIVA' THEN 1 END) as activas,
                COUNT(CASE WHEN estado = 'INACTIVA' THEN 1 END) as inactivas
             FROM camaras`
        );
        
        const camarasStats = camarasResult.rows[0];
        
        res.json({
            streaming: {
                connected_cameras: cameraStreams.size,
                connected_clients: mobileClients.size,
                uptime: process.uptime()
            },
            database: {
                total_camaras: parseInt(camarasStats.total),
                camaras_activas: parseInt(camarasStats.activas),
                camaras_inactivas: parseInt(camarasStats.inactivas)
            },
            server: {
                timestamp: new Date().toISOString(),
                node_version: process.version,
                platform: process.platform
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            error: 'Error del servidor al obtener estadísticas'
        });
    }
});

export default router;