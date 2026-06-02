/**
 * Utilitários de sanitização e validação para o frontend.
 * Valida dados antes de enviar para a API.
 */

/** Formato de código de ativação: ATIVAR-XXXX */
const ACTIVATION_CODE_REGEX = /^ATIVAR-[A-Z0-9]{4}$/

/** Formato básico de email */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Valida formato do código de ativação.
 * Previne injeção de caracteres especiais na URL.
 */
export function validateActivationCode(code: string): boolean {
  if (!code || typeof code !== "string") return false
  return ACTIVATION_CODE_REGEX.test(code.trim().toUpperCase())
}

/**
 * Sanitiza string para uso seguro em URLs e requisições.
 * Remove caracteres de controle e limita tamanho.
 */
export function sanitizeInput(text: string, maxLength = 200): string {
  if (!text) return ""
  return text
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, "") // Caracteres de controle
    .trim()
}

/**
 * Valida email no formato básico.
 */
export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim())
}

/**
 * Valida telefone brasileiro (com máscara ou sem).
 */
export function validateBrazilianPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "")
  return digits.length === 10 || digits.length === 11
}
