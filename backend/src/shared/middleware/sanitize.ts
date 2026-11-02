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
 * Mascara dados pessoais sensíveis antes de enviar texto para a IA.
 * Protege telefones, emails, CPFs e CNPJs (LGPD).
 * NÃO remove primeiro nome — necessário para personalização.
 */
export function sanitizePersonalDataForAi(text: string): string {
  if (!text) return '';

  let sanitized = text;

  // Telefones brasileiros em vários formatos:
  // 55XXXXXXXXXXX (E.164), (XX)XXXXX-XXXX, XX XXXXX-XXXX, XXXXX-XXXX
  sanitized = sanitized.replace(/55\d{10,11}/g, '[TELEFONE]');
  sanitized = sanitized.replace(/\(\d{2}\)\s?\d{4,5}-?\d{4}/g, '[TELEFONE]');
  sanitized = sanitized.replace(/\d{2}\s\d{4,5}-?\d{4}/g, '[TELEFONE]');
  sanitized = sanitized.replace(/\d{5}-\d{4}/g, '[TELEFONE]');

  // Emails
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // CPF: XXX.XXX.XXX-XX ou XXXXXXXXXXX (11 dígitos soltos)
  sanitized = sanitized.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]');
  sanitized = sanitized.replace(/\b\d{11}\b/g, '[CPF]');

  // CNPJ: XX.XXX.XXX/XXXX-XX
  sanitized = sanitized.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '[CNPJ]');

  return sanitized;
}

/**
 * Sanitiza texto antes de enviar para a IA.
 * Camada adicional sobre sanitizeMessageText para prevenir prompt injection.
 */
export function sanitizeForAiPrompt(text: string): string {
  const base = sanitizePersonalDataForAi(sanitizeMessageText(text).slice(0, 1000));

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
/**
 * Remove blocos de raciocínio (<think>...</think>) de respostas de modelos
 * reasoning (Qwen, DeepSeek-R1). Cobre tag NÃO fechada também — quando o modelo
 * estoura max_tokens, o bloco de pensamento fica aberto e vazaria ao usuário.
 */
/**
 * Remove artefatos de "thinking" e de formatação que os modelos vazam na
 * resposta final. Sem isso, o dono recebe coisas como:
 *   "Quer trocar de contato? Tá de sacanagem, chefe! 😜】"
 * (o `】` é lixo de template do modelo), ou blocos  thinking vazando.
 */
export function stripThinkingTags(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

  // Linhas de raciocínio do modelo, não resposta ao usuário (só a linha do rótulo
  // e o que vem nela — não engole a resposta seguinte)
  cleaned = cleaned
    .replace(/^\s*(?:Reasoning|Thinking|Raciocínio|Análise)\s*:.*$/gim, '')
    .replace(/^\s*(?:Final Answer|Resposta final|Output)\s*:\s*/im, '')
    .trim();

  // Delimitadores decorativos vazados (【 】 「 」 ⟨ ⟩ <<< >>> ###). Removidos só
  // nas bordas e quando aparecem soltos no fim da frase — nunca no meio de texto
  // legítimo, para não corromper a mensagem.
  cleaned = cleaned
    .replace(/[【】]/g, '')
    .replace(/\s*[「」⟨⟩]\s*$/g, '')
    .replace(/\s*#{3,}\s*$/g, '')
    .replace(/^(?:<<<|>>>)\s*/g, '')
    .replace(/\s*(?:<<<|>>>)$/g, '');

  return cleaned.replace(/[ \t]{2,}/g, ' ').trim();
}

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
