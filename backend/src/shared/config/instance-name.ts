/**
 * Nomes determinísticos de instância da Evolution API.
 *
 * O nome da instância é a chave que liga:
 * - o QR Code exibido no frontend,
 * - o SSE que acompanha a conexão,
 * - o webhook que a Evolution envia quando o WhatsApp conecta,
 * - a sessão gravada em whatsapp_sessions.
 *
 * Por isso ele NÃO pode conter timestamps: se o nome mudar entre a geração do
 * QR e a verificação de status, a sessão nunca é reconhecida.
 */

const EVOLUTION_INSTANCE_MAX_LENGTH = 100;

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, EVOLUTION_INSTANCE_MAX_LENGTH);
}

/** Instância do dono/colaborador que conectou o próprio WhatsApp. */
export function userInstanceName(userId: string): string {
  return sanitize(`user-${userId}`);
}

/** Instância do colaborador que está aceitando um convite. */
export function inviteInstanceName(token: string): string {
  return sanitize(`invite-${token}`);
}
