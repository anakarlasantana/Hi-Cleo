import type { OnboardingRepository } from './onboarding.port.js';
import type { RuleRepository } from '../rules/rules.port.js';
import type { AiPort } from '../../shared/ports/ai.port.js';
import type { OnboardingState } from '../../shared/types/index.js';
import { interpretOnboardingResponse } from '../ai/nodes/interpret-onboarding.js';
import { ONBOARDING_RETRY_MESSAGES } from '../ai/prompts/onboarding.prompts.js';
import { env } from '../../shared/config/env.js';

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

    // Detectar se é edição parcial (voltou de confirm_summary para ajustar 1 campo)
    const isPartialEdit = state.data._editing === 'true';

    switch (state.step) {
      case 'awaiting_intro_confirmation':
        return this.handleIntroConfirmation(userId, state);
      case 'confirm_name':
        return this.handleStep(userId, state, message, 'confirm_name', isPartialEdit ? 'confirm_summary' : 'business_type');
      case 'business_type':
        return this.handleStep(userId, state, message, 'business_type', isPartialEdit ? 'confirm_summary' : 'target_audience');
      case 'target_audience':
        return this.handleStep(userId, state, message, 'target_audience', isPartialEdit ? 'confirm_summary' : 'tone_of_voice');
      case 'tone_of_voice':
        return this.handleStep(userId, state, message, 'tone_of_voice', isPartialEdit ? 'confirm_summary' : 'business_hours');
      case 'business_hours':
        return this.handleStep(userId, state, message, 'business_hours', isPartialEdit ? 'confirm_summary' : 'outside_hours_behavior');
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
      // Usar retryMessage da IA apenas se for útil (>20 chars e não genérico)
      const aiRetry = result.retryMessage?.trim();
      const isUsefulRetry = aiRetry && aiRetry.length > 20 && !this.isGenericRetry(aiRetry);
      return isUsefulRetry ? aiRetry : (ONBOARDING_RETRY_MESSAGES[currentStep] || 'Não entendi. Pode tentar de novo?');
    }

    const newData = { ...state.data, ...result.extractedData };
    // Limpar flag de edição ao voltar para confirm_summary
    if (nextStep === 'confirm_summary' && newData._editing) {
      delete newData._editing;
    }
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
      // Verificar se quer recomeçar do zero
      const lower = message.toLowerCase();
      if (lower.includes('recomeçar') || lower.includes('recomecar') || lower.includes('refazer tudo') || lower.includes('começar de novo') || lower.includes('comecar de novo')) {
        await this.onboardingRepo.updateStep(userId, 'business_type', { nome_confirmado: state.data.nome_confirmado });
        return 'Sem problemas! Vamos refazer 🔄\n\nMe conta de novo o que você faz:';
      }

      // Edição parcial: interpretar qual campo o usuário quer ajustar
      const fieldToEdit = this.detectFieldToEdit(message);
      if (fieldToEdit) {
        const editData = { ...state.data, _editing: 'true' };
        await this.onboardingRepo.updateStep(userId, fieldToEdit as any, editData);
        return this.getEditFieldMessage(fieldToEdit, state.data);
      }

      // Não identificou o campo — perguntar qual quer mudar
      return 'O que você quer ajustar? Pode me dizer:\n\n• "muda o nome"\n• "muda o negócio"\n• "muda o público"\n• "muda o tom"\n• "muda o horário"\n• "muda a mensagem de fora do horário"\n\nOu diga "recomeçar" pra refazer tudo.';
    }

    await this.onboardingRepo.updateStep(userId, 'completed', state.data);
    await this.saveBusinessProfileAndRules(userId, state.data);
    return `Tudo configurado! 🎉\n\nA partir de agora eu cuido da organização dos seus contatos e respondo seus clientes do jeito que combinamos.\n\n📱 *Último passo:* conecte seu WhatsApp pra eu começar a acompanhar suas conversas.\n\nAcesse o link abaixo no computador e escaneie o QR Code:\n${env.SITE_URL}/conectar\n\nÉ igual ao WhatsApp Web: vai em *Dispositivos Vinculados* no celular e escaneie. Quando conectar, eu começo a trabalhar automaticamente!\n\n📌 Dica: fixa a Cleo no topo do WhatsApp pra não perder nenhuma mensagem minha!`;
  }

  /**
   * Detecta qual campo o usuário quer editar com base na mensagem.
   * Retorna o step correspondente ou null se não identificar.
   */
  private detectFieldToEdit(message: string): string | null {
    const lower = message.toLowerCase();

    // Mapeia palavras-chave para o step correspondente
    const fieldMap: Array<{ keywords: string[]; step: string }> = [
      { keywords: ['nome', 'chamar', 'chamado'], step: 'confirm_name' },
      { keywords: ['negócio', 'negocio', 'faço', 'faz', 'trabalho', 'profissão', 'profissao'], step: 'business_type' },
      { keywords: ['público', 'publico', 'cliente', 'audiência', 'audiencia', 'atende'], step: 'target_audience' },
      { keywords: ['tom', 'comunicação', 'comunicacao', 'falar', 'linguagem', 'informal', 'formal'], step: 'tone_of_voice' },
      { keywords: ['horário', 'horario', 'hora', 'expediente', 'atendimento'], step: 'business_hours' },
      { keywords: ['fora', 'mensagem automática', 'mensagem automatica', 'resposta automática', 'resposta automatica'], step: 'outside_hours_behavior' },
    ];

    // "recomeçar" = reset total (mantém apenas o nome)
    if (lower.includes('recomeçar') || lower.includes('recomecar') || lower.includes('refazer tudo') || lower.includes('começar de novo') || lower.includes('comecar de novo')) {
      return null; // retorna null para sinalizar reset total
    }

    for (const { keywords, step } of fieldMap) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return step;
      }
    }

    return null;
  }

  /**
   * Retorna a mensagem de edição para um campo específico.
   * Mantém os dados anteriores — após a edição, volta ao confirm_summary.
   */
  private getEditFieldMessage(step: string, data: Record<string, string>): string {
    switch (step) {
      case 'confirm_name':
        return `Atualmente tá como *${data.nome_confirmado}*. Como quer que eu te chame?`;
      case 'business_type':
        return `Atualmente: *${data.negocio}*. Me conta de novo o que você faz:`;
      case 'target_audience':
        return `Atualmente: *${data.publico_alvo}*. Quem são seus clientes geralmente?`;
      case 'tone_of_voice':
        return `Atualmente: *${this.getToneLabel(data.tom_de_voz || 'friendly_professional')}*.\n\nComo quer que eu fale?\n1️⃣ Profissional e cordial\n2️⃣ Descontraído mas profissional\n3️⃣ Super informal`;
      case 'business_hours':
        return `Atualmente: *${data.horario_descricao || `${data.horario_inicio}-${data.horario_fim}`}*.\n\nQual o novo horário?`;
      case 'outside_hours_behavior':
        return 'O que faço quando chegar mensagem fora do horário?\n\n1️⃣ Aviso que retorna no próximo dia útil\n2️⃣ Não respondo nada, só anoto\n\nOu me diz a mensagem que quer:';
      default:
        return 'Me diz o que quer mudar:';
    }
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

  /**
   * Detecta se o retryMessage da IA é genérico demais para usar.
   * Exemplos ruins: "msg curta", "tente novamente", "por favor forneça".
   */
  private isGenericRetry(text: string): boolean {
    const lower = text.toLowerCase();
    const genericPatterns = [
      'por favor',
      'forneça',
      'tente novamente',
      'msg curta',
      'informação inválida',
      'resposta inválida',
      'não entendi',
    ];
    return genericPatterns.some((p) => lower.includes(p));
  }
}
