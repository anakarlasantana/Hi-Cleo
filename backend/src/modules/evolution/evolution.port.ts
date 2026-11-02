export type ConnectionStatus = 'open' | 'close' | 'connecting';

export interface SendTextOptions {
  instance: string;
  to: string;
  text: string;
}

export interface SendMediaOptions {
  instance: string;
  to: string;
  mediaUrl: string;
  caption?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
}

export interface CreateInstanceOptions {
  name: string;
  webhookUrl?: string;
  webhookEvents?: string[];
}

export interface CreateInstanceResult {
  qrCode: string;
}

export interface WebhookOptions {
  url: string;
  events?: string[];
}

export interface ForwardMessageOptions {
  instance: string;
  to: string;
  messageId: string;
}

export interface MessagingPort {
  sendText(options: SendTextOptions): Promise<void>;
  sendMedia(options: SendMediaOptions): Promise<void>;
  forwardMessage(options: ForwardMessageOptions): Promise<void>;
  createInstance(options: CreateInstanceOptions): Promise<CreateInstanceResult>;
  /**
   * Garante que a instância existe na Evolution antes de pedir o QR Code.
   * Chamar `connect` numa instância inexistente retorna erro — o usuário
   * receberia "Falha ao gerar QR Code" no primeiro acesso.
   */
  ensureInstance(options: CreateInstanceOptions): Promise<void>;
  /**
   * (Re)configura o webhook de uma instância existente.
   *
   * Existe porque `createInstance` só define a URL no nascimento da instância:
   * ao trocar `WEBHOOK_URL` no ambiente (ou ao promover dev → produção), as
   * instâncias antigas continuavam apontando para a URL velha e a Evolution
   * entrava em loop de retry (`getaddrinfo ENOTFOUND api.hicleo.com.br`).
   */
  setWebhook(instance: string, options: WebhookOptions): Promise<void>;
  getStatus(instance: string): Promise<ConnectionStatus>;
  getQrCode(instance: string): Promise<string>;
  restart(instance: string): Promise<void>;
}
