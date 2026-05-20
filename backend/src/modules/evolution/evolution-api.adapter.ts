import axios, { AxiosInstance } from 'axios';
import type { MessagingPort, SendTextOptions, SendMediaOptions, CreateInstanceOptions, CreateInstanceResult, ConnectionStatus } from './evolution.port.js';

export class EvolutionApiAdapter implements MessagingPort {
  private api: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.api = axios.create({
      baseURL,
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    });
  }

  async sendText({ instance, to, text }: SendTextOptions): Promise<void> {
    await this.api.post(`/message/sendText/${instance}`, { number: to, text });
  }

  async sendMedia({ instance, to, mediaUrl, caption, mediaType, fileName }: SendMediaOptions): Promise<void> {
    await this.api.post(`/message/sendMedia/${instance}`, {
      number: to, mediatype: mediaType, media: mediaUrl, caption: caption || '', fileName: fileName || '',
    });
  }

  async createInstance(options: CreateInstanceOptions): Promise<CreateInstanceResult> {
    const response = await this.api.post('/instance/create', {
      instanceName: options.name, integration: 'WHATSAPP-BAILEYS', qrcode: true,
      webhook: { url: options.webhookUrl, events: options.webhookEvents || ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] },
    });
    return { qrCode: response.data.qrcode?.base64 || '' };
  }

  async getStatus(instance: string): Promise<ConnectionStatus> {
    const response = await this.api.get(`/instance/connectionState/${instance}`);
    return response.data.state || 'close';
  }

  async getQrCode(instance: string): Promise<string> {
    const response = await this.api.get(`/instance/connect/${instance}`);
    return response.data.base64 || '';
  }

  async restart(instance: string): Promise<void> {
    await this.api.post(`/instance/restart/${instance}`);
  }
}
