import { body } from 'express-validator';

export const membresiaValidation = {
  asignarMembresia: [
    body('usuario_id')
      .isInt({ min: 1 })
      .withMessage('El ID de usuario debe ser un número entero válido'),
    body('membresia_id')
      .isInt({ min: 1 })
      .withMessage('El ID de membresía debe ser un número entero válido'),
    body('metodo_pago')
      .optional()
      .isLength({ max: 50 })
      .withMessage('El método de pago no puede exceder los 50 caracteres'),
    body('referencia_pago')
      .optional()
      .isLength({ max: 100 })
      .withMessage('La referencia de pago no puede exceder los 100 caracteres')
  ],
  
  renovarMembresia: [
    body('metodo_pago')
      .optional()
      .isLength({ max: 50 })
      .withMessage('El método de pago no puede exceder los 50 caracteres'),
    body('referencia_pago')
      .optional()
      .isLength({ max: 100 })
      .withMessage('La referencia de pago no puede exceder los 100 caracteres')
  ]
};