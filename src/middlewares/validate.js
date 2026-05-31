const { validationResult } = require('express-validator');

/**
 * Middleware genérico para verificar os resultados da validação.
 * Se houver erros, interrompe o pedido e devolve-os.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  
  // Formatar os erros para um formato amigável
  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

  return res.status(400).json({
    message: "Erro de validação nos dados enviados.",
    errors: extractedErrors,
  });
};

module.exports = validate;
