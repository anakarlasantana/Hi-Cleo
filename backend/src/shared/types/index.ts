// === Enums ===
export type LeadStatus = 'novo' | 'quente' | 'frio' | 'perdido' | 'fechado';
export type SessionStatus = 'ativa' | 'desconectada' | 'pendente';
export type MessageDirection = 'entrada' | 'saida';
export type FollowUpStatus = 'pendente' | 'enviado' | 'cancelado';

export type OnboardingStep =
  | 'aguardando_ativacao'
  | 'confirmar_nome'
  | 'configurar_boas_vindas'
  | 'configurar_fora_horario'
  | 'concluido';

export type IntentType =
  | 'listar_leads'
  | 'leads_hoje'
  | 'sem_resposta'
  | 'clientes_quentes'
  | 'agendar_followup'
  | 'status_lead'
  | 'enviar_material'
  | 'configurar_regra'
  | 'ignorar_contato'
  | 'listar_ignorados'
  | 'parar_ignorar'
  | 'desconhecido';

// === Entidades ===
export interface User {
  id: string;
  nome: string;
  plano: string;
  telefone: string;
  horario_comercial_inicio?: string;
  horario_comercial_fim?: string;
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
  nome: string;
  telefone: string;
  status: LeadStatus;
  last_interaction?: string;
  created_at: string;
}

export interface Message {
  id: string;
  lead_id: string;
  texto: string;
  direcao: MessageDirection;
  timestamp: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  user_id: string;
  data_agendada: string;
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

export interface Material {
  id: string;
  user_id: string;
  keyword: string;
  tipo: 'texto' | 'imagem' | 'documento';
  conteudo: string;
  nome: string;
  created_at: string;
}

export interface ActivationCode {
  id: string;
  code: string;
  plano: string;
  payment_id: string;
  used: boolean;
  used_by?: string;
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
  data: {
    key: { remoteJid: string; fromMe: boolean };
    message: {
      conversation?: string;
      audioMessage?: { url: string; mimetype: string; seconds: number };
    };
    messageTimestamp: number;
    pushName?: string;
  };
}

// === Intent ===
export interface RecognizedIntent {
  type: IntentType;
  confidence: number;
  entities: Record<string, string>;
  originalText: string;
}
