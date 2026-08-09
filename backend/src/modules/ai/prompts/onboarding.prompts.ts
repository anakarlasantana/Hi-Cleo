/**
 * Prompts especializados por step do onboarding.
 *
 * Otimização de tokens:
 * - SYSTEM_CONTEXT compartilhado (~40 tokens, era ~60)
 * - Instruções por step condensadas (só o essencial)
 * - Formato de retorno padronizado (IA já sabe que é JSON)
 * - Caching: como o interpret-onboarding.ts concatena SYSTEM + step,
 *   e o SYSTEM é idêntico entre chamadas, providers cacheiam o prefixo.
 */

const SYS = `Interprete resposta de onboarding WhatsApp. Usuário: empresário brasileiro, informal, pode ser áudio transcrito.
Retorne SÓ JSON válido. Se resposta inválida: {"valid":false,"extractedData":{},"retryMessage":"msg curta"}`;

export const ONBOARDING_PROMPTS: Record<string, string> = {
  confirm_name: `${SYS}
Step: nome/apelido do usuário. Extraia em nome_confirmado. Inválido se não contém nome (".", "não sei", emoji).
OK: {"valid":true,"extractedData":{"nome_confirmado":"..."}}`,

  business_type: `${SYS}
Step: profissão/negócio. Extraia descrição curta em negocio. Inválido se não descreve atividade.
OK: {"valid":true,"extractedData":{"negocio":"..."}}`,

  target_audience: `${SYS}
Step: público-alvo/clientes. Extraia em publico_alvo. "Todo mundo" é válido. Inválido se evasivo sem sentido.
OK: {"valid":true,"extractedData":{"publico_alvo":"..."}}`,

  tone_of_voice: `${SYS}
Step: tom de comunicação. Classifique em formal|friendly_professional|casual.
1=formal, 2=friendly_professional, 3=casual. Texto livre: interprete e classifique. Inválido se não indica tom.
OK: {"valid":true,"extractedData":{"tom_de_voz":"formal|friendly_professional|casual"}}`,

  business_hours: `${SYS}
Step: horário de atendimento. Extraia HH:MM início/fim. "comercial"=08:00-18:00. Inválido se sem horário extraível.
OK: {"valid":true,"extractedData":{"horario_inicio":"HH:MM","horario_fim":"HH:MM","horario_descricao":"original"}}`,

  outside_hours_behavior: `${SYS}
Step: comportamento fora do horário. 1=notify(avisa retorno), 2=silent(não responde). Texto longo=notify+mensagem custom.
OK: {"valid":true,"extractedData":{"fora_horario":"notify|silent","fora_horario_mensagem":"..."}}`,

  confirm_summary: `${SYS}
Step: confirmação de resumo. Interprete se é sim/ok/confirmação ou negação/ajuste.
OK: {"valid":true,"extractedData":{"confirmed":"true|false"}}`,
};

/**
 * Mensagens de retry por step (fallback quando IA não retorna retryMessage).
 */
export const ONBOARDING_RETRY_MESSAGES: Record<string, string> = {
  awaiting_intro_confirmation: 'Manda qualquer coisa pra gente começar! Pode ser um "vamos" ou "bora" 😊',
  confirm_name: 'Preciso saber como te chamar! Me manda seu nome ou apelido 😊',
  business_type: 'Me conta o que você faz! Pode ser simples: "Dentista", "Loja de roupas", "Personal trainer"...',
  target_audience: 'Quem são seus clientes? Algo como: "Mulheres 25-40", "Empresas pequenas", "Todo mundo" 😊',
  tone_of_voice: 'Como quer que eu fale com seus clientes? Manda 1, 2 ou 3:\n\n1️⃣ Formal\n2️⃣ Descontraído\n3️⃣ Informal',
  business_hours: 'Preciso do horário! Algo como: "8h às 18h" ou "Seg-Sex 9h-17h" 🕐',
  outside_hours_behavior: 'O que faço fora do horário?\n\n1️⃣ Aviso que retorna\n2️⃣ Não respondo\n\nOu escreve a mensagem que quer:',
};
