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
  getStatus(instance: string): Promise<ConnectionStatus>;
  getQrCode(instance: string): Promise<string>;
  restart(instance: string): Promise<void>;
}
