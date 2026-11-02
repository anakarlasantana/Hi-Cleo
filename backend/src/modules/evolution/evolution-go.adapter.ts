import axios, { AxiosInstance } from 'axios';
import type { MessagingPort, SendTextOptions, SendMediaOptions, ForwardMessageOptions, CreateInstanceOptions, CreateInstanceResult, ConnectionStatus, WebhookOptions } from './evolution.port.js';

export class EvolutionGoAdapter implements MessagingPort {
  private api: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.api = axios.create({
      baseURL,
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    });
  }

  async sendText({ instance, to, text }: SendTextOptions): Promise<void> {
    await this.api.post('/message/sendText', { instance, number: to, text });
  }

  async sendMedia({ instance, to, mediaUrl, caption, mediaType, fileName }: SendMediaOptions): Promise<void> {
    await this.api.post('/message/sendMedia', {
      instance, number: to, mediatype: mediaType, media: mediaUrl, caption: caption || '', fileName: fileName || '',
    });
  }

  async forwardMessage({ instance, to, messageId }: ForwardMessageOptions): Promise<void> {
    await this.api.post('/chat/forwardMessage', {
      instance, number: to, message: { key: { id: messageId } },
    });
  }

  async createInstance(options: CreateInstanceOptions): Promise<CreateInstanceResult> {
    const response = await this.api.post('/instance/create', {
      instanceName: options.name, webhook: options.webhookUrl || undefined, events: options.webhookEvents || ['ALL'],
    });
    return { qrCode: response.data.qrcode?.base64 || '' };
  }

  /**
   * Garante que a instância existe. Se ainda não existe, cria já com o webhook
   * configurado (sem webhook a Evolution não avisa quando o WhatsApp conecta e
   * a sessão nunca seria gravada no banco).
   */
  async ensureInstance(options: CreateInstanceOptions): Promise<void> {
    try {
      await this.getStatus(options.name);
      return;
    } catch (error: any) {
      const status = error?.response?.status;
      const isNotFound = status === 404 || status === 400;
      if (!isNotFound) throw error;
    }

    try {
      await this.createInstance(options);
    } catch (error: any) {
      // Corrida: duas requisições simultâneas criando a mesma instância.
      if (error?.response?.status === 409) return;
      throw error;
    }
  }

  async getStatus(instance: string): Promise<ConnectionStatus> {
    const response = await this.api.get(`/instance/${instance}/status`);
    const state = response.data.state || response.data.status || 'close';
    return state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'close';
  }

  /** Atualiza o webhook da instância (Evolution GO usa o mesmo formato v2). */
  async setWebhook(instance: string, options: WebhookOptions): Promise<void> {
    await this.api.post(`/webhook/set/${instance}`, {
      webhook: {
        enabled: true,
        url: options.url,
        events: options.events || ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        byEvents: false,
        base64: false,
      },
    });
  }

  async getQrCode(instance: string): Promise<string> {
    const response = await this.api.get(`/instance/${instance}/qrcode`);
    return response.data.base64 || response.data.qrcode || '';
  }

  async restart(instance: string): Promise<void> {
    await this.api.post(`/instance/${instance}/restart`);
  }
}
