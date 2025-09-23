-- Crear la base de datos (ejecutar por separado)
-- CREATE DATABASE boyapp;

-- Tabla de usuarios
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

-- Índices para mejorar el performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Tabla de boyas
CREATE TABLE IF NOT EXISTS boyas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    latitud DECIMAL(10, 8) NOT NULL,
    longitud DECIMAL(11, 8) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    station_id VARCHAR(100) NULL, -- ID de la estación Tempest
    sonda_id INTEGER NULL,
    camara_id INTEGER NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de estaciones (cache de datos de Tempest)
CREATE TABLE IF NOT EXISTS estaciones (
    id SERIAL PRIMARY KEY,
    station_id VARCHAR(100) UNIQUE NOT NULL,
    nombre VARCHAR(100),
    latitud DECIMAL(10, 8),
    longitud DECIMAL(11, 8),
    ultima_actualizacion TIMESTAMP,
    datos JSONB, -- Datos completos de la estación
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sondas (
	 id SERIAL PRIMARY KEY,
    sonda_id VARCHAR(50) UNIQUE NOT NULL,
    modelo VARCHAR(100),
    fabricante VARCHAR(100),
    fecha_instalacion DATE,
    fecha_ultimo_mantenimiento DATE,
    estado VARCHAR(20) DEFAULT 'ACTIVA',
    profundidad_medicion DECIMAL(8, 2),
    temperatura DECIMAL(5, 2),
    salinidad DECIMAL(5, 3),
    densidad DECIMAL(6, 3),
    presion DECIMAL(8, 2),
    oxigeno_disuelto DECIMAL(6, 3),
    ph DECIMAL(4, 2),   
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE camaras (
	 id SERIAL PRIMARY KEY,
    camara_id VARCHAR(50) UNIQUE NOT NULL,
    modelo VARCHAR(100),
    fabricante VARCHAR(100),
    fecha_instalacion DATE,
    fecha_ultimo_mantenimiento DATE,
    estado VARCHAR(20) DEFAULT 'ACTIVA',
    url VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Índices para mejorar el rendimiento
CREATE INDEX idx_boyas_user_id ON boyas(user_id);
CREATE INDEX idx_boyas_station_id ON boyas(station_id);
CREATE INDEX idx_estaciones_station_id ON estaciones(station_id);

CREATE INDEX idx_boyas_sonda_id ON boyas(sonda_id);
CREATE INDEX idx_sondas_sonda_id ON sondas(sonda_id);


CREATE INDEX idx_boyas_camara_id ON boyas(camara_id);
CREATE INDEX idx_sondas_camara_id ON camaras(camara_id);