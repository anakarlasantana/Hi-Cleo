import type { OnboardingRepository } from './onboarding.port.js';
import type { RuleRepository } from '../rules/rules.port.js';
import type { OnboardingState } from '../../shared/types/index.js';

export class OnboardingService {
  constructor(
    private onboardingRepo: OnboardingRepository,
    private ruleRepo: RuleRepository,
  ) {}

  async isComplete(userId: string): Promise<boolean> {
    const state = await this.onboardingRepo.getState(userId);
    return state?.step === 'concluido';
  }

  async processMessage(userId: string, message: string): Promise<string> {
    const state = await this.onboardingRepo.getState(userId);
    if (!state) return 'Erro interno. Tente novamente.';

    switch (state.step) {
      case 'confirmar_nome':
        return this.handleConfirmarNome(userId, state, message);
      case 'configurar_boas_vindas':
        return this.handleBoasVindas(userId, state, message);
      case 'configurar_fora_horario':
        return this.handleForaHorario(userId, state, message);
      case 'concluido':
        return 'Seu onboarding já foi concluído! Me pergunte qualquer coisa sobre seus clientes. 😊';
      default:
        return 'Não entendi. Pode repetir?';
    }
  }

  private async handleConfirmarNome(userId: string, state: OnboardingState, message: string): Promise<string> {
    const nome = message.trim();
    await this.onboardingRepo.updateStep(userId, 'configurar_boas_vindas', { ...state.data, nome_confirmado: nome });

    return `Prazer, ${nome}! 😊\n\nAgora me diz: quando um cliente NOVO te manda mensagem pela primeira vez, o que você quer que eu faça?\n\n1️⃣ Enviar uma apresentação (ex: "Olá! Sou assistente do ${nome}...")\n2️⃣ Não fazer nada (só registrar o contato)\n\nResponde com 1 ou 2:`;
  }

  private async handleBoasVindas(userId: string, state: OnboardingState, message: string): Promise<string> {
    const opcao = message.trim();
    const boasVindas = opcao === '1' || opcao.toLowerCase().includes('apresenta') ? 'ativa' : 'desativada';

    await this.onboardingRepo.updateStep(userId, 'configurar_fora_horario', { ...state.data, boas_vindas: boasVindas });

    const intro = boasVindas === 'ativa'
      ? 'Ótimo! Vou me apresentar pros seus clientes novos. 👋'
      : 'Beleza, não vou enviar nada pra clientes novos. Só registro o contato. ✅';

    return `${intro}\n\nÚltima pergunta: quer que eu responda quando alguém te mandar mensagem FORA do seu horário comercial?\n\n1️⃣ Sim, avisa que vou retornar no próximo dia útil\n2️⃣ Não, deixa sem resposta\n\nResponde com 1 ou 2:`;
  }

  private async handleForaHorario(userId: string, state: OnboardingState, message: string): Promise<string> {
    const opcao = message.trim();
    const foraHorario = opcao === '1' || opcao.toLowerCase().includes('sim') ? 'ativa' : 'desativada';

    await this.onboardingRepo.updateStep(userId, 'concluido', { ...state.data, fora_horario: foraHorario });
    await this.saveRules(userId, state.data, foraHorario);

    return `Pronto! Tudo configurado! 🎉\n\nVou organizar todos os contatos que te mandarem mensagem a partir de agora.\n\n💡 *Dica:* Se alguém que te manda mensagem é pessoal (família, amigos), é só me dizer "ignora o número tal" que eu paro de acompanhar.\n\nMe manda "conectar" quando estiver pronto!`;
  }

  private async saveRules(userId: string, data: Record<string, string>, foraHorario: string): Promise<void> {
    const rules: Array<{ user_id: string; condition: string; response: string; active: boolean }> = [];

    if (data.boas_vindas === 'ativa') {
      rules.push({
        user_id: userId,
        condition: 'primeira_mensagem',
        response: `Olá! Sou a assistente do(a) ${data.nome_confirmado}. Ele(a) já vai te atender! 😊`,
        active: true,
      });
    }

    if (foraHorario === 'ativa') {
      rules.push({
        user_id: userId,
        condition: 'fora_horario',
        response: `Olá! O(a) ${data.nome_confirmado} não está disponível agora, mas retorna no próximo dia útil. Sua mensagem foi registrada! 📝`,
        active: true,
      });
    }

    await this.ruleRepo.insertMany(rules);
  }
}
