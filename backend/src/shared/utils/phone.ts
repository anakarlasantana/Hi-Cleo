/**
 * Normaliza telefone para o formato E.164 brasileiro sem o "+": 55DDNNNNNNNNN.
 * Usado para comparar números vindos de fontes diferentes (webhook do WhatsApp,
 * cadastro do usuário, digitação no checkout).
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // Já tem DDI 55 e tamanho de número brasileiro completo
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}
