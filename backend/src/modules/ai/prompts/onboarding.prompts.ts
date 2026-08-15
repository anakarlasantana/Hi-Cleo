/**
 * Prompts especializados por step do onboarding.
 *
 * REGRA FUNDAMENTAL: Se a resposta do usuário NÃO responde à pergunta feita,
 * retorne {"valid":false}. Não force interpretação. Não aceite números aleatórios,
 * emojis soltos, respostas evasivas ou texto completamente fora de contexto.
 *
 * Otimização de tokens:
 * - SYSTEM_CONTEXT compartilhado (~60 tokens)
 * - Instruções por step condensadas (só o essencial)
 * - Formato de retorno padronizado (IA já sabe que é JSON)
 * - Caching: como o interpret-onboarding.ts concatena SYSTEM + step,
 *   e o SYSTEM é idêntico entre chamadas, providers cacheiam o prefixo.
 */

const SYS = `Interprete resposta de onboarding WhatsApp. Usuário: empresário brasileiro, informal, pode ser áudio transcrito.
Retorne SÓ JSON válido.

REGRA CRÍTICA DE VALIDAÇÃO:
- A resposta DEVE fazer sentido como resposta à pergunta feita no step atual.
- Números aleatórios, emojis soltos, ".", "oi", "sim", "não" (quando não é confirm_summary), textos que não respondem à pergunta = INVÁLIDO.
- Ser RÍGIDO na validação. Na dúvida, marcar inválido — é melhor perguntar de novo do que aceitar lixo.
- Se inválido: {"valid":false,"extractedData":{},"retryMessage":"msg curta explicando o que espera"}`;

export const ONBOARDING_PROMPTS: Record<string, string> = {
  confirm_name: `${SYS}
Step: nome/apelido do usuário. Extraia em nome_confirmado.
VÁLIDO: qualquer nome ou apelido real (ex: "João", "Ana", "Lê", "Dr. Carlos").
INVÁLIDO: ".", números puros, emojis, "não sei", "ok", frases que não contêm um nome.
OK: {"valid":true,"extractedData":{"nome_confirmado":"..."}}`,

  business_type: `${SYS}
Step: profissão/negócio do usuário. Extraia descrição curta em negocio.
VÁLIDO: descrição de atividade profissional (ex: "corretor", "dentista", "vendo bolos", "dou aulas de inglês").
INVÁLIDO: números puros, emojis, respostas de 1-2 caracteres, "sim", "não", "ok", texto que não descreve nenhuma atividade.
OK: {"valid":true,"extractedData":{"negocio":"..."}}`,

  target_audience: `${SYS}
Step: público-alvo/clientes do negócio. Extraia em publico_alvo.
VÁLIDO: descrição de quem são os clientes (ex: "mulheres 30+", "empresas", "todo mundo", "jovens universitários").
INVÁLIDO: números puros, emojis, respostas de 1-2 caracteres, "sim", "não", texto que não descreve público nenhum.
OK: {"valid":true,"extractedData":{"publico_alvo":"..."}}`,

  tone_of_voice: `${SYS}
Step: tom de comunicação com clientes. Classifique em formal|friendly_professional|casual.
OPÇÕES NUMÉRICAS VÁLIDAS: APENAS 1, 2 ou 3.
  1 = formal
  2 = friendly_professional
  3 = casual
QUALQUER outro número (4, 5, 6, 7, 8, 9, 0, 10, etc.) = INVÁLIDO.
TEXTO LIVRE: aceitar SOMENTE se descreve claramente um estilo de comunicação (ex: "descontraído", "mais sério", "fala coloquial"). Classificar no mais próximo.
INVÁLIDO: números fora de 1-3, emojis soltos, "sim", "não", "ok", respostas que não indicam preferência de tom.
OK: {"valid":true,"extractedData":{"tom_de_voz":"formal|friendly_professional|casual"}}`,

  business_hours: `${SYS}
Step: dias da semana E horário de atendimento. AMBOS são obrigatórios.
VÁLIDO: resposta que contém DIAS + HORÁRIO juntos (ex: "seg a sex 8h-18h", "segunda a sábado 9 às 17", "todos os dias 8h-20h", "comercial"=seg-sex 08:00-18:00).
Se APENAS horário sem dias (ex: "8h às 18h", "das 9 às 17"): INVÁLIDO — precisa informar os dias.
Se APENAS dias sem horário (ex: "seg a sex"): INVÁLIDO — precisa informar o horário.
Interpretar "comercial"=seg-sex 08:00-18:00. "Todos os dias"/"todo dia"=mon,tue,wed,thu,fri,sat,sun.
Dias: extrair como lista separada por vírgula em inglês: mon,tue,wed,thu,fri,sat,sun.
INVÁLIDO: números puros, emojis, "sim", "não", respostas sem dias NEM horário.
OK: {"valid":true,"extractedData":{"horario_inicio":"HH:MM","horario_fim":"HH:MM","horario_descricao":"texto original","dias_semana":"mon,tue,wed,thu,fri"}}`,

  outside_hours_behavior: `${SYS}
Step: comportamento fora do horário.
OPÇÕES NUMÉRICAS VÁLIDAS: APENAS 1 ou 2.
  1 = notify (avisa que retorna no próximo dia útil)
  2 = silent (não responde nada, só anota)
QUALQUER outro número (3, 4, 5, 8, etc.) = INVÁLIDO.
TEXTO DESCRITIVO: se o usuário escreve uma mensagem customizada (ex: "avisa que tô fora e retorno amanhã"), usar notify + guardar texto em fora_horario_mensagem.
INVÁLIDO: números fora de 1-2, emojis soltos, "sim", "não", respostas que não indicam preferência.
OK: {"valid":true,"extractedData":{"fora_horario":"notify|silent","fora_horario_mensagem":"..."}}`,

  confirm_summary: `${SYS}
Step: confirmação de resumo do onboarding. Interprete se é aprovação ou rejeição/pedido de ajuste.
APROVAÇÃO: "sim", "ok", "isso", "bora", "perfeito", "tá ótimo", "confirma", "👍", emoji positivo.
REJEIÇÃO/AJUSTE: "não", "muda", "troca", "ajusta", "errado", qualquer indicação de que algo precisa mudar.
INVÁLIDO: números puros sem contexto, emojis ambíguos isolados, texto completamente fora de contexto.
OK: {"valid":true,"extractedData":{"confirmed":"true|false"}}`,
};

/**
 * Mensagens de retry por step (fallback quando IA não retorna retryMessage útil).
 * Devem ser claras sobre o que esperam como resposta.
 */
export const ONBOARDING_RETRY_MESSAGES: Record<string, string> = {
  awaiting_intro_confirmation: 'Manda qualquer coisa pra gente começar! Pode ser um "vamos" ou "bora" 😊',
  confirm_name: 'Preciso saber como te chamar! Me manda seu nome ou apelido 😊',
  business_type: 'Não entendi como seu negócio. Me conta o que você faz! Exemplos: "Dentista", "Loja de roupas", "Personal trainer"...',
  target_audience: 'Não entendi quem são seus clientes. Algo como: "Mulheres 25-40", "Empresas pequenas", "Todo mundo" 😊',
  tone_of_voice: 'Não entendi! Me diz como quer que eu fale com seus clientes:\n\n1️⃣ Profissional e cordial\n2️⃣ Descontraído mas profissional\n3️⃣ Super informal\n\nManda 1, 2 ou 3 (ou descreve com suas palavras):',
  business_hours: 'Preciso saber os *dias* e o *horário*! Manda os dois juntos, por exemplo:\n\n• "Seg a Sex, 8h às 18h"\n• "Seg a Sáb, 9h às 20h"\n• "Todos os dias, 7h às 22h"\n\nQuais dias e horários você atende?',
  outside_hours_behavior: 'Não entendi! O que faço quando chegar mensagem fora do horário?\n\n1️⃣ Aviso que retorna no próximo dia útil\n2️⃣ Não respondo nada, só anoto\n\nManda 1 ou 2 (ou escreve a mensagem que quer):',
  confirm_summary: 'Tá tudo certo com o resumo? Manda *ok* pra confirmar ou me diz o que quer ajustar!',
};
