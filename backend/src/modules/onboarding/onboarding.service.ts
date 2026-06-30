import type { OnboardingRepository } from "./onboarding.port.js";
import type { RuleRepository } from "../rules/rules.port.js";
import type { OnboardingState } from "../../shared/types/index.js";

export class OnboardingService {
  constructor(
    private onboardingRepo: OnboardingRepository,
    private ruleRepo: RuleRepository,
  ) {}

  async isComplete(userId: string): Promise<boolean> {
    const state = await this.onboardingRepo.getState(userId);
    return state?.step === "completed";
  }

  async processMessage(userId: string, message: string): Promise<string> {
    const state = await this.onboardingRepo.getState(userId);
    if (!state) return "Ops, algo deu errado aqui. Me manda uma mensagem de novo?";

    switch (state.step) {
      case "confirm_name":
        return this.handleConfirmName(userId, state, message);
      case "business_type":
        return this.handleBusinessType(userId, state, message);
      case "target_audience":
        return this.handleTargetAudience(userId, state, message);
      case "tone_of_voice":
        return this.handleToneOfVoice(userId, state, message);
      case "business_hours":
        return this.handleBusinessHours(userId, state, message);
      case "outside_hours_behavior":
        return this.handleOutsideHours(userId, state, message);
      case "confirm_summary":
        return this.handleConfirmSummary(userId, state, message);
      case "completed":
        return "Já tá tudo pronto! 🎉 Me pergunta qualquer coisa sobre seus clientes que eu te ajudo.";
      default:
        return "Não entendi. Me manda de novo?";
    }
  }

  private async handleConfirmName(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const nome = message.trim();
    await this.onboardingRepo.updateStep(userId, "business_type", {
      ...state.data,
      nome_confirmado: nome,
    });

    return `Boa, ${nome}! Prazer em te conhecer 🤝\n\nMe conta o que você faz — pode ser bem direto:\n\nExemplos:\n• Corretor de imóveis — venda e aluguel\n• Professor de inglês — aulas particulares\n• Clínica de estética — depilação e limpeza de pele\n• Loja de roupas — moda feminina\n• Personal trainer — treinos personalizados\n\nPode mandar do seu jeito, não precisa seguir o formato 😊`;
  }

  private async handleBusinessType(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const businessDescription = message.trim();
    await this.onboardingRepo.updateStep(userId, "target_audience", {
      ...state.data,
      negocio: businessDescription,
    });

    return `Legal! Entendi sobre o seu trabalho ✨\n\nE quem são seus clientes geralmente?\n\nExemplos:\n• Casais procurando apartamento\n• Adolescentes e adultos\n• Mulheres 25-45 anos\n• Empresas pequenas e médias\n• Alunos de ensino médio\n\nSe não tiver certeza, manda o que vier na cabeça:`;
  }

  private async handleTargetAudience(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const audience = message.trim();
    await this.onboardingRepo.updateStep(userId, "tone_of_voice", {
      ...state.data,
      publico_alvo: audience,
    });

    return `Boa! Agora me diz: como quer que eu fale com seus clientes?\n\n1️⃣ Profissional e cordial (Sr./Sra., linguagem formal)\n2️⃣ Descontraído mas profissional (amigável, sem ser forçado)\n3️⃣ Super informal (como se fosse um amigo próximo)\n\nOu descreve com suas palavras como quer que eu me comunique:`;
  }

  private async handleToneOfVoice(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const tone = this.parseToneOfVoice(message);
    await this.onboardingRepo.updateStep(userId, "business_hours", {
      ...state.data,
      tom_de_voz: tone,
    });

    return `Perfeito! Vou me comunicar assim com seus clientes 💬\n\nE qual é seu horário de atendimento?\n\nExemplos:\n• Seg-Sex 9h-18h\n• Seg-Sáb 8h-20h\n• Todos os dias 7h-22h\n• Ter e Qui 14h-21h\n\nManda como preferir:`;
  }

  private async handleBusinessHours(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const hours = this.parseBusinessHours(message);
    await this.onboardingRepo.updateStep(userId, "outside_hours_behavior", {
      ...state.data,
      horario_inicio: hours.start,
      horario_fim: hours.end,
      horario_descricao: message.trim(),
    });

    return `Anotado! 🕐\n\nÚltima pergunta: quando chegar mensagem *fora* desse horário, o que faço?\n\n1️⃣ Aviso educadamente que você retorna no próximo dia útil\n2️⃣ Não respondo nada, só anoto o contato\n\nOu me diz exatamente a mensagem que quer que eu mande:`;
  }

  private async handleOutsideHours(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const behavior = this.parseOutsideHoursBehavior(message);
    await this.onboardingRepo.updateStep(userId, "confirm_summary", {
      ...state.data,
      fora_horario: behavior.type,
      fora_horario_mensagem: behavior.customMessage || '',
    });

    const nome = state.data.nome_confirmado;
    const toneLabel = this.getToneLabel(state.data.tom_de_voz || 'friendly_professional');
    const outsideLabel = behavior.type === 'notify' ? 'aviso que retorna' : 'só anoto, sem resposta';

    return `Pronto! Aqui tá meu resumo sobre você:\n\n👤 *${nome}*\n💼 ${state.data.negocio}\n🎯 Clientes: ${state.data.publico_alvo}\n💬 Tom: ${toneLabel}\n🕐 Horário: ${state.data.horario_descricao || `${state.data.horario_inicio}-${state.data.horario_fim}`}\n📩 Fora do horário: ${outsideLabel}\n\nTá tudo certo? Manda *ok* pra confirmar ou me diz o que quer ajustar!`;
  }

  private async handleConfirmSummary(
    userId: string,
    state: OnboardingState,
    message: string,
  ): Promise<string> {
    const normalized = message.trim().toLowerCase();
    const isConfirmation = ['ok', 'sim', 'confirma', 'confirmado', 'perfeito', 'tá certo', 'ta certo', 'bom', 'isso', 'pode ser', 'manda ver', 'bora'].some(
      (word) => normalized.includes(word)
    );

    if (!isConfirmation) {
      // Usuário quer ajustar algo — volta pro começo do fluxo de negócio
      await this.onboardingRepo.updateStep(userId, "business_type", {
        nome_confirmado: state.data.nome_confirmado,
      });
      return `Sem problemas! Vamos refazer 🔄\n\nMe conta de novo o que você faz:`;
    }

    // Confirmado — salvar tudo e finalizar
    await this.onboardingRepo.updateStep(userId, "completed", state.data);
    await this.saveBusinessProfileAndRules(userId, state.data);

    return `Tudo configurado! 🎉\n\nA partir de agora eu cuido da organização dos seus contatos e respondo seus clientes do jeito que combinamos.\n\n📱 *Último passo:* volta pra tela no computador — o QR Code já tá te esperando lá.\n\nÉ igual ao WhatsApp Web: vai em Dispositivos Vinculados no celular e escaneie. Quando conectar, eu começo a trabalhar automaticamente!\n\n📌 Dica: fixa a Cleo no topo do WhatsApp pra não perder nenhuma mensagem minha!`;
  }

  private async saveBusinessProfileAndRules(
    userId: string,
    data: Record<string, string>,
  ): Promise<void> {
    // Atualizar business profile com dados completos
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

    // Criar regras automáticas
    const rules: Array<{ user_id: string; condition: string; response: string; active: boolean }> = [];

    // Regra de boas-vindas (sempre ativa — usa o tom configurado)
    const welcomeMessage = this.buildWelcomeMessage(data);
    rules.push({
      user_id: userId,
      condition: "first_message",
      response: welcomeMessage,
      active: true,
    });

    // Regra de fora do horário
    if (data.fora_horario === 'notify') {
      const outsideMessage = data.fora_horario_mensagem || this.buildOutsideHoursMessage(data);
      rules.push({
        user_id: userId,
        condition: "outside_hours",
        response: outsideMessage,
        active: true,
      });
    }

    await this.ruleRepo.insertMany(rules);
  }

  private buildWelcomeMessage(data: Record<string, string>): string {
    const nome = data.nome_confirmado;
    const tone = data.tom_de_voz || 'friendly_professional';

    switch (tone) {
      case 'formal':
        return `Boa tarde! Sou assistente do(a) ${nome}. Em que posso ajudá-lo(a)?`;
      case 'casual':
        return `E aí! 👋 Tô aqui pelo(a) ${nome}. Pode mandar que já já a gente te responde!`;
      default: // friendly_professional
        return `Olá! 😊 Sou assistente do(a) ${nome}. Já anotei seu contato e vamos te retornar em breve!`;
    }
  }

  private buildOutsideHoursMessage(data: Record<string, string>): string {
    const nome = data.nome_confirmado;
    const tone = data.tom_de_voz || 'friendly_professional';

    switch (tone) {
      case 'formal':
        return `Prezado(a), o(a) ${nome} não está disponível no momento. Retornaremos no próximo dia útil. Sua mensagem foi registrada.`;
      case 'casual':
        return `Eii! O(a) ${nome} já foi descansar 😴 Mas relaxa, anotei sua mensagem e te retornamos amanhã!`;
      default:
        return `Olá! O(a) ${nome} não está disponível agora, mas sua mensagem foi anotada e retornamos no próximo dia útil 📝`;
    }
  }

  private parseToneOfVoice(message: string): string {
    const normalized = message.trim().toLowerCase();
    if (normalized === '1' || normalized.includes('formal') || normalized.includes('cordial')) return 'formal';
    if (normalized === '3' || normalized.includes('informal') || normalized.includes('amigo')) return 'casual';
    return 'friendly_professional'; // Default: opção 2
  }

  private parseBusinessHours(message: string): { start: string; end: string } {
    // Tenta extrair horários do texto (ex: "8h-18h", "9:00 às 17:00", "8 às 20")
    const timePattern = /(\d{1,2})[:h]?(\d{2})?\s*[-aàáeé]+\s*(\d{1,2})[:h]?(\d{2})?/i;
    const match = message.match(timePattern);

    if (match) {
      const startHour = match[1].padStart(2, '0');
      const startMin = match[2] || '00';
      const endHour = match[3].padStart(2, '0');
      const endMin = match[4] || '00';
      return { start: `${startHour}:${startMin}`, end: `${endHour}:${endMin}` };
    }

    return { start: '08:00', end: '18:00' };
  }

  private parseOutsideHoursBehavior(message: string): { type: string; customMessage?: string } {
    const normalized = message.trim().toLowerCase();
    if (normalized === '2' || normalized.includes('não respond') || normalized.includes('nao respond') || normalized.includes('não precisa')) {
      return { type: 'silent' };
    }
    if (normalized === '1' || normalized.includes('avis') || normalized.includes('retorn') || normalized.includes('sim')) {
      return { type: 'notify' };
    }
    // Resposta customizada
    return { type: 'notify', customMessage: message.trim() };
  }

  private getToneLabel(tone: string): string {
    switch (tone) {
      case 'formal': return 'profissional e cordial';
      case 'casual': return 'super informal';
      default: return 'descontraído mas profissional';
    }
  }
}
