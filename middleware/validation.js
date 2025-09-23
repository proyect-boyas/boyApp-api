import { body } from 'express-validator';

// Validaciones para usuarios
const userValidation = {
  register: [
    body('nombre').notEmpty().withMessage('El nombre es requerido'),
    body('email').isEmail().withMessage('Email debe ser válido'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('La contraseña debe tener al menos 6 caracteres')
      .notEmpty()
      .withMessage('La contraseña es requerida'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Las contraseñas no coinciden');
        }
        return true;
      })
  ],
  
  login: [
    body('email').isEmail().withMessage('Email debe ser válido'),
    body('password').notEmpty().withMessage('La contraseña es requerida')
  ],
  
  updateProfile: [
    body('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío')
  ],
  updateUser: [
    body('nombre')
      .optional()
      .isLength({ min: 2 })
      .withMessage('El nombre debe tener al menos 2 caracteres'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Email debe ser válido'),
    body('role')
      .optional()
      .isIn(['admin', 'user'])
      .withMessage('Rol debe ser admin o user')
  ],
};

// Agrega estas validaciones a tu userValidation object



// Validaciones para boyas
const boyaValidation = [
  body('nombre').notEmpty().withMessage('El nombre es requerido'),
  body('latitud').isDecimal().withMessage('Latitud debe ser un número decimal'),
  body('longitud').isDecimal().withMessage('Longitud debe ser un número decimal'),
  body('station_id').optional().isString().withMessage('Station ID debe ser una cadena de texto')
];

// Validaciones para estaciones
const stationValidation = {
  add: [
    body('station_id').notEmpty().withMessage('ID de estación es requerido')
  ]
};




// Validaciones para sondas
const sondaValidation = [
  body('sonda_id')
    .notEmpty()
    .withMessage('El ID de sonda es requerido')
    .isLength({ min: 3, max: 50 })
    .withMessage('El ID de sonda debe tener entre 3 y 50 caracteres'),
  
  body('modelo')
    .optional()
    .isLength({ max: 100 })
    .withMessage('El modelo no puede exceder 100 caracteres'),
  
  body('fabricante')
    .optional()
    .isLength({ max: 100 })
    .withMessage('El fabricante no puede exceder 100 caracteres'),
  
  body('fecha_instalacion')
    .optional()
    .isDate()
    .withMessage('La fecha de instalación debe ser válida'),
  
  body('fecha_ultimo_mantenimiento')
    .optional()
    .isDate()
    .withMessage('La fecha de último mantenimiento debe ser válida'),
  
  body('estado')
    .optional()
    .isIn(['ACTIVA', 'INACTIVA', 'MANTENIMIENTO', 'FUERA_SERVICIO'])
    .withMessage('Estado debe ser: ACTIVA, INACTIVA, MANTENIMIENTO o FUERA_SERVICIO'),
  
  body('profundidad_medicion')
    .optional()
    .isDecimal()
    .withMessage('La profundidad debe ser un número decimal')
    .custom((value) => {
      if (value < 0) {
        throw new Error('La profundidad no puede ser negativa');
      }
      return true;
    }),
  
  body('temperatura')
    .optional()
    .isDecimal()
    .withMessage('La temperatura debe ser un número decimal'),
  
  body('salinidad')
    .optional()
    .isDecimal()
    .withMessage('La salinidad debe ser un número decimal'),
  
  body('ph')
    .optional()
    .isDecimal()
    .withMessage('El pH debe ser un número decimal')
    .custom((value) => {
      if (value && (value < 0 || value > 14)) {
        throw new Error('El pH debe estar entre 0 y 14');
      }
      return true;
    }),
  
  body('oxigeno_disuelto')
    .optional()
    .isDecimal()
    .withMessage('El oxígeno disuelto debe ser un número decimal'),
];

// Validaciones para mantenimiento
const mantenimientoValidation = [
  body('fecha_mantenimiento')
    .notEmpty()
    .withMessage('La fecha de mantenimiento es requerida')
    .isDate()
    .withMessage('La fecha de mantenimiento debe ser válida'),
  
  body('observaciones')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Las observaciones no pueden exceder 500 caracteres')
];

 


 // Validaciones para cámaras
const camaraValidation = [
  body('camara_id')
    .notEmpty()
    .withMessage('El ID de cámara es requerido')
    .isLength({ min: 3, max: 50 })
    .withMessage('El ID de cámara debe tener entre 3 y 50 caracteres'),
  
  body('modelo')
    .optional()
    .isLength({ max: 100 })
    .withMessage('El modelo no puede exceder 100 caracteres'),
  
  body('fabricante')
    .optional()
    .isLength({ max: 100 })
    .withMessage('El fabricante no puede exceder 100 caracteres'),
  
  body('fecha_instalacion')
    .optional()
    .isDate()
    .withMessage('La fecha de instalación debe ser válida'),
  
  body('fecha_ultimo_mantenimiento')
    .optional()
    .isDate()
    .withMessage('La fecha de último mantenimiento debe ser válida'),
  
  body('estado')
    .optional()
    .isIn(['ACTIVA', 'INACTIVA', 'MANTENIMIENTO', 'FUERA_SERVICIO'])
    .withMessage('Estado debe ser: ACTIVA, INACTIVA, MANTENIMIENTO o FUERA_SERVICIO'),
  
  body('url')
    .optional()
    //.isURL()
    // .withMessage('La URL debe ser válida')
    .isLength({ max: 100 })
    .withMessage('La URL no puede exceder 100 caracteres')
];



export { 
  userValidation, 
  boyaValidation, 
  stationValidation, 
  sondaValidation,
  camaraValidation,
  mantenimientoValidation 
};