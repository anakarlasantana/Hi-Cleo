// === Enums ===
export type LeadStatus = 'new' | 'hot' | 'lost' | 'closed';
export type SessionStatus = 'active' | 'disconnected' | 'pending';
export type MessageDirection = 'inbound' | 'outbound';
export type FollowUpStatus = 'pending' | 'sent' | 'cancelled';

export type OnboardingStep =
  | 'awaiting_activation'
  | 'confirm_name'
  | 'business_type'
  | 'target_audience'
  | 'tone_of_voice'
  | 'business_hours'
  | 'outside_hours_behavior'
  | 'confirm_summary'
  | 'completed';

export type IntentType =
  | 'list_leads'
  | 'leads_today'
  | 'no_reply'
  | 'hot_leads'
  | 'schedule_followup'
  | 'lead_status'
  | 'send_material'
  | 'configure_rule'
  | 'ignore_contact'
  | 'list_ignored'
  | 'stop_ignoring'
  | 'invite_user'
  | 'disconnect_user'
  | 'unknown';

// === Entities ===
export interface User {
  id: string;
  name: string | null;
  plan: string;
  phone: string | null;
  email: string | null;
  subscription_status?: string;
  subscription_started_at?: string;
  subscription_expires_at?: string;
  billing_period?: string;
  payment_provider_id?: string;
  max_connections_override?: number | null;
  owner_user_id?: string | null;
  created_at: string;
}

export interface Business {
  id: string;
  user_id: string;
  name?: string;
  type?: string;
  services?: string;
  description?: string;
  target_audience?: string;
  tone_of_voice?: string;
  business_hours_start?: string;
  business_hours_end?: string;
  created_at: string;
}

export interface WhatsAppSession {
  id: string;
  user_id: string;
  instance_name: string;
  status: SessionStatus;
  connected_at?: string;
  last_check: string;
}

export interface Lead {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  last_interaction?: string;
  created_at: string;
}

// === Media ===
export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface Message {
  id: string;
  lead_id: string;
  text: string;
  direction: MessageDirection;
  timestamp: string;
  media_type?: MediaType | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_key?: string | null;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  user_id: string;
  scheduled_at: string;
  status: FollowUpStatus;
  created_at: string;
}

export interface Rule {
  id: string;
  user_id: string;
  condition: string;
  response: string;
  active: boolean;
}

export interface ActivationCode {
  id: string;
  code: string;
  plan: string;
  payment_id: string;
  used: boolean;
  used_by?: string;
  user_id?: string | null;
  user_email?: string | null;
  activated_at?: string | null;
  expires_at: string;
  created_at: string;
}

export interface OnboardingState {
  id: string;
  user_id: string;
  step: OnboardingStep;
  data: Record<string, string>;
  updated_at: string;
}

// === Webhook ===
export interface WebhookPayload {
  instance: string;
  event: string;
  /** Número do remetente com @s.whatsapp.net (presente no root do payload) */
  sender?: string;
  server_url?: string;
  apikey?: string;
  date_time?: string;
  source?: string;
  data: {
    key: { remoteJid: string; fromMe: boolean; id: string; participant?: string; remoteJidAlt?: string; addressingMode?: string };
    message: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { url: string; mimetype: string; caption?: string; mediaKey?: string };
      audioMessage?: { url: string; mimetype: string; seconds: number; ptt?: boolean; mediaKey?: string };
      videoMessage?: { url: string; mimetype: string; caption?: string; seconds: number; mediaKey?: string };
      documentMessage?: { url: string; mimetype: string; title?: string; fileName?: string; mediaKey?: string };
      stickerMessage?: { url: string; mimetype: string; mediaKey?: string };
      contactMessage?: { displayName: string; vcard: string };
      locationMessage?: { degreesLatitude: number; degreesLongitude: number };
    };
    messageType?: string;
    messageTimestamp: number;
    pushName?: string;
    status?: string;
    instanceId?: string;
    source?: string;
  };
}

// === Intent ===
export interface RecognizedIntent {
  type: IntentType;
  confidence: number;
  entities: Record<string, string>;
  originalText: string;
}

// === Invite ===
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Invite {
  id: string;
  owner_user_id: string;
  phone: string;
  token: string;
  status: InviteStatus;
  created_at: string;
  expires_at: string;
  used_by_user_id: string | null;
}
