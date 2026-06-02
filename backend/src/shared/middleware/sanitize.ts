import { z } from 'zod';

// --- Validadores reutilizáveis ---

/** Formato E.164 brasileiro: 55 + DDD (2 dígitos) + número (8 ou 9 dígitos) */
const BRAZILIAN_PHONE_REGEX = /^55\d{10,11}$/;

/** Formato de código de ativação: ATIVAR-XXXX (4 chars alfanuméricos) */
const ACTIVATION_CODE_REGEX = /^ATIVAR-[A-Z0-9]{4}$/;

/** Tamanho máximo de mensagem do WhatsApp */
const MAX_MESSAGE_LENGTH = 4096;

// --- Funções de validação ---

export function validatePhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return BRAZILIAN_PHONE_REGEX.test(cleaned);
}

export function validateActivationCode(code: string): boolean {
  return ACTIVATION_CODE_REGEX.test(code.toUpperCase().trim());
}

/**
 * Sanitiza texto de mensagem do WhatsApp.
 * Remove caracteres de controle, limita tamanho, preserva conteúdo legítimo.
 */
export function sanitizeMessageText(text: string): string {
  if (!text) return '';

  // Limitar tamanho (WhatsApp tem limite de ~65k mas raramente passa de 4k)
  const truncated = text.slice(0, MAX_MESSAGE_LENGTH);

  // Remover caracteres de controle (exceto newline e tab)
  const cleaned = truncated.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return cleaned.trim();
}

/**
 * Sanitiza texto antes de enviar para a IA.
 * Camada adicional sobre sanitizeMessageText para prevenir prompt injection.
 */
export function sanitizeForAiPrompt(text: string): string {
  const base = sanitizeMessageText(text).slice(0, 1000);

  // Remover padrões de prompt injection
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/gi,
    /you\s+are\s+now\s+a/gi,
    /forget\s+(everything|all|your)\s+(above|previous|instructions?)/gi,
    /system\s*:\s*/gi,
    /\[INST\]/gi,
    /<<SYS>>/gi,
    /\{\{.*?\}\}/g,
    /```[\s\S]*?```/g, // Blocos de código (podem conter instruções)
    /\[system\]/gi,
    /\[assistant\]/gi,
    /role\s*:\s*(system|assistant)/gi,
  ];

  let sanitized = base;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '[filtrado]');
  }

  return sanitized;
}

/**
 * Mascara dados pessoais para logs seguros (LGPD).
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return '****';
  return phone.slice(0, 4) + '*'.repeat(phone.length - 6) + phone.slice(-2);
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '****';
  const [local, domain] = email.split('@');
  const maskedLocal = local.slice(0, 2) + '***';
  return `${maskedLocal}@${domain}`;
}

// --- Schemas Zod reutilizáveis ---

export const phoneSchema = z.string().regex(BRAZILIAN_PHONE_REGEX, 'Telefone inválido (formato: 55DDNNNNNNNNN)');
export const activationCodeSchema = z.string().regex(ACTIVATION_CODE_REGEX, 'Código de ativação inválido');
export const emailSchema = z.string().email('E-mail inválido');
export const messageTextSchema = z.string().min(1).max(MAX_MESSAGE_LENGTH);
