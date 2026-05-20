import axios, { AxiosInstance } from 'axios';
import type { MessagingPort, SendTextOptions, SendMediaOptions, CreateInstanceOptions, CreateInstanceResult, ConnectionStatus } from './evolution.port.js';

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

  async createInstance(options: CreateInstanceOptions): Promise<CreateInstanceResult> {
    const response = await this.api.post('/instance/create', {
      instanceName: options.name, webhook: options.webhookUrl || undefined, events: options.webhookEvents || ['ALL'],
    });
    return { qrCode: response.data.qrcode?.base64 || '' };
  }

  async getStatus(instance: string): Promise<ConnectionStatus> {
    const response = await this.api.get(`/instance/${instance}/status`);
    const state = response.data.state || response.data.status || 'close';
    return state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'close';
  }

  async getQrCode(instance: string): Promise<string> {
    const response = await this.api.get(`/instance/${instance}/qrcode`);
    return response.data.base64 || response.data.qrcode || '';
  }

  async restart(instance: string): Promise<void> {
    await this.api.post(`/instance/${instance}/restart`);
  }
}
