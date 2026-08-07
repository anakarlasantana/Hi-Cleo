import type { OnboardingRepository } from './onboarding.port.js';
import type { RuleRepository } from '../rules/rules.port.js';
import type { AiPort } from '../../shared/ports/ai.port.js';
import type { OnboardingState } from '../../shared/types/index.js';
import { interpretOnboardingResponse } from '../ai/nodes/interpret-onboarding.js';
import { ONBOARDING_RETRY_MESSAGES } from '../ai/prompts/onboarding.prompts.js';

/**
 * Orquestra o onboarding conversacional.
 * Cada step delega interpretação para o nó de IA (interpret-onboarding).
 *
 * No LangGraph futuro, este service será substituído por um grafo compilado.
 * A lógica interna dos handlers migra 1:1 para nós do grafo.
 */
export class OnboardingService {
  constructor(
    private onboardingRepo: OnboardingRepository,
    private ruleRepo: RuleRepository,
    private ai: AiPort,
  ) {}

  async isComplete(userId: string): Promise<boolean> {
    const state = await this.onboardingRepo.getState(userId);
    return state?.step === 'completed';
  }

  getIntroMessage(userName: string): string {
    return `Oi, ${userName}! 👋 Que bom ter você aqui.\n\nAntes de começar a trabalhar pra você, preciso te conhecer melhor. Vou te fazer algumas perguntas rápidas sobre o seu negócio pra poder atender seus clientes do jeito certo.\n\nSão só 5 perguntinhas — leva menos de 2 minutos! Pode responder por texto ou áudio, como preferir. 🎙️\n\nVamos lá?`;
  }

  async processMessage(userId: string, message: string): Promise<string> {
    const state = await this.onboardingRepo.getState(userId);
    if (!state) return 'Ops, algo deu errado aqui. Me manda uma mensagem de novo?';

    switch (state.step) {
      case 'awaiting_intro_confirmation':
        return this.handleIntroConfirmation(userId, state);
      case 'confirm_name':
        return this.handleStep(userId, state, message, 'confirm_name', 'business_type');
      case 'business_type':
        return this.handleStep(userId, state, message, 'business_type', 'target_audience');
      case 'target_audience':
        return this.handleStep(userId, state, message, 'target_audience', 'tone_of_voice');
      case 'tone_of_voice':
        return this.handleStep(userId, state, message, 'tone_of_voice', 'business_hours');
      case 'business_hours':
        return this.handleStep(userId, state, message, 'business_hours', 'outside_hours_behavior');
      case 'outside_hours_behavior':
        return this.handleStep(userId, state, message, 'outside_hours_behavior', 'confirm_summary');
      case 'confirm_summary':
        return this.handleConfirmSummary(userId, state, message);
      case 'completed':
        return 'Já tá tudo pronto! 🎉 Me pergunta qualquer coisa sobre seus clientes que eu te ajudo.';
      default:
        return 'Não entendi. Me manda de novo?';
    }
  }

  /**
   * Handler genérico que delega interpretação ao nó de IA.
   * No LangGraph: cada chamada = um nó + edge condicional (valid → next, !valid → retry).
   */
  private async handleStep(
    userId: string,
    state: OnboardingState,
    message: string,
    currentStep: string,
    nextStep: string,
  ): Promise<string> {
    const result = await interpretOnboardingResponse(this.ai, currentStep, message, state.data);

    if (!result.valid) {
      return result.retryMessage || ONBOARDING_RETRY_MESSAGES[currentStep] || 'Não entendi. Pode tentar de novo?';
    }

    const newData = { ...state.data, ...result.extractedData };
    await this.onboardingRepo.updateStep(userId, nextStep as any, newData);
    return this.getNextStepMessage(nextStep, newData);
  }

  private async handleIntroConfirmation(userId: string, state: OnboardingState): Promise<string> {
    await this.onboardingRepo.updateStep(userId, 'confirm_name', state.data);
    return 'Pra começar, como posso te chamar?';
  }

  private async handleConfirmSummary(userId: string, state: OnboardingState, message: string): Promise<string> {
    const result = await interpretOnboardingResponse(this.ai, 'confirm_summary', message, state.data);
    const confirmed = result.extractedData?.confirmed === 'true';

    if (!confirmed) {
      await this.onboardingRepo.updateStep(userId, 'business_type', { nome_confirmado: state.data.nome_confirmado });
      return 'Sem problemas! Vamos refazer 🔄\n\nMe conta de novo o que você faz:';
    }

    await this.onboardingRepo.updateStep(userId, 'completed', state.data);
    await this.saveBusinessProfileAndRules(userId, state.data);
    return `Tudo configurado! 🎉\n\nA partir de agora eu cuido da organização dos seus contatos e respondo seus clientes do jeito que combinamos.\n\n📱 *Último passo:* volta pra tela no computador — o QR Code já tá te esperando lá.\n\nÉ igual ao WhatsApp Web: vai em Dispositivos Vinculados no celular e escaneie. Quando conectar, eu começo a trabalhar automaticamente!\n\n📌 Dica: fixa a Cleo no topo do WhatsApp pra não perder nenhuma mensagem minha!`;
  }

  private getNextStepMessage(step: string, data: Record<string, string>): string {
    switch (step) {
      case 'business_type':
        return `Boa, ${data.nome_confirmado}! Prazer em te conhecer 🤝\n\nMe conta o que você faz — pode ser bem direto:\n\nExemplos:\n• Corretor de imóveis\n• Professor de inglês\n• Clínica de estética\n• Loja de roupas\n\nPode mandar do seu jeito 😊`;
      case 'target_audience':
        return 'Legal! Entendi sobre o seu trabalho ✨\n\nE quem são seus clientes geralmente?\n\nExemplos:\n• Casais procurando apartamento\n• Mulheres 25-45 anos\n• Empresas pequenas\n\nSe não tiver certeza, manda o que vier na cabeça:';
      case 'tone_of_voice':
        return 'Boa! Agora me diz: como quer que eu fale com seus clientes?\n\n1️⃣ Profissional e cordial\n2️⃣ Descontraído mas profissional\n3️⃣ Super informal\n\nOu descreve com suas palavras:';
      case 'business_hours':
        return 'Perfeito! Vou me comunicar assim com seus clientes 💬\n\nE qual é seu horário de atendimento?\n\nExemplos:\n• Seg-Sex 9h-18h\n• Todos os dias 7h-22h\n\nManda como preferir:';
      case 'outside_hours_behavior':
        return 'Anotado! 🕐\n\nÚltima pergunta: quando chegar mensagem *fora* desse horário, o que faço?\n\n1️⃣ Aviso que retorna no próximo dia útil\n2️⃣ Não respondo nada, só anoto\n\nOu me diz a mensagem que quer que eu mande:';
      case 'confirm_summary': {
        const tone = this.getToneLabel(data.tom_de_voz || 'friendly_professional');
        const outside = data.fora_horario === 'silent' ? 'só anoto, sem resposta' : 'aviso que retorna';
        const hours = data.horario_descricao || `${data.horario_inicio}-${data.horario_fim}`;
        return `Pronto! Aqui tá meu resumo sobre você:\n\n👤 *${data.nome_confirmado}*\n💼 ${data.negocio}\n🎯 Clientes: ${data.publico_alvo}\n💬 Tom: ${tone}\n🕐 Horário: ${hours}\n📩 Fora do horário: ${outside}\n\nTá tudo certo? Manda *ok* pra confirmar ou me diz o que quer ajustar!`;
      }
      default:
        return '';
    }
  }

  private async saveBusinessProfileAndRules(userId: string, data: Record<string, string>): Promise<void> {
    const { supabase } = await import('../../shared/config/supabase.js');
    await supabase.from('businesses').upsert({
      user_id: userId,
      name: data.negocio,
      services: data.negocio,
      target_audience: data.publico_alvo,
      tone_of_voice: data.tom_de_voz || 'friendly_professional',
      business_hours_start: data.horario_inicio || '08:00',
      business_hours_end: data.horario_fim || '18:00',
    }, { onConflict: 'user_id' });

    // Não cria mais regras de template fixo — a IA gera respostas contextuais em tempo real
    // Mantém apenas a regra de fora do horário customizada (se o dono escreveu uma mensagem específica)
    if (data.fora_horario_mensagem) {
      await this.ruleRepo.insertMany([{
        user_id: userId,
        condition: 'outside_hours_custom',
        response: data.fora_horario_mensagem,
        active: true,
      }]);
    }
  }

  private getToneLabel(tone: string): string {
    switch (tone) {
      case 'formal': return 'profissional e cordial';
      case 'casual': return 'super informal';
      default: return 'descontraído mas profissional';
    }
  }
}
