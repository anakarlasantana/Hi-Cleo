/**
 * Prompts especializados por step do onboarding.
 * Cada prompt será usado por um nó — no LangGraph, será o system prompt do nó.
 *
 * Regra: prompt pequeno e focado. Retorno sempre JSON.
 */

const SYSTEM_CONTEXT = `Você interpreta respostas de um onboarding via WhatsApp para um CRM de secretária virtual.
O usuário é um pequeno empresário brasileiro. Pode falar de forma informal, usar áudio transcrito (frases cortadas), gírias.
Retorne APENAS JSON válido (sem markdown, sem backticks, sem explicação).
Se a resposta não faz sentido para a pergunta, retorne valid=false com retryMessage amigável e curta (máx 1 linha).`;

export const ONBOARDING_PROMPTS: Record<string, string> = {
  confirm_name: `${SYSTEM_CONTEXT}

O usuário está informando como quer ser chamado (nome ou apelido).
Extraia o nome. Se a mensagem não contém um nome válido (ex: "não sei", ".", "aham", emojis, respostas evasivas), retorne valid=false.

Retorne: { "valid": true/false, "extractedData": { "nome_confirmado": "..." }, "retryMessage": "..." }`,

  business_type: `${SYSTEM_CONTEXT}

O usuário está descrevendo o que faz profissionalmente (negócio, profissão, serviço).
Extraia uma descrição curta do negócio. Se a mensagem não descreve uma atividade (ex: "não sei", "qualquer coisa", "tanto faz"), retorne valid=false.

Retorne: { "valid": true/false, "extractedData": { "negocio": "..." }, "retryMessage": "..." }`,

  target_audience: `${SYSTEM_CONTEXT}

O usuário está descrevendo quem são seus clientes/público-alvo.
Extraia o público. Se a mensagem não descreve um público (ex: "não sei", respostas de 1-2 palavras sem sentido), retorne valid=false.
"Todo mundo", "qualquer pessoa", "homens e mulheres" são respostas válidas.

Retorne: { "valid": true/false, "extractedData": { "publico_alvo": "..." }, "retryMessage": "..." }`,

  tone_of_voice: `${SYSTEM_CONTEXT}

O usuário está escolhendo o tom de comunicação com seus clientes. Opções:
1 = formal (Sr./Sra., linguagem formal)
2 = friendly_professional (amigável, descontraído mas profissional)
3 = casual (super informal, como amigo)
Ou pode descrever com palavras (ex: "simpática e direta", "profissional mas leve").
Interprete e classifique em: "formal", "friendly_professional" ou "casual".
Se a mensagem não indica preferência de tom (ex: "não sei", "tanto faz", ".", sem relação com comunicação), retorne valid=false.

Retorne: { "valid": true/false, "extractedData": { "tom_de_voz": "formal|friendly_professional|casual" }, "retryMessage": "..." }`,

  business_hours: `${SYSTEM_CONTEXT}

O usuário está informando o horário de atendimento do negócio.
Extraia horário de início e fim no formato HH:MM.
Aceite formatos como "8h-18h", "9 às 17", "seg a sex 8h às 20h", "de manhã até 6 da tarde", "comercial" (= 08:00-18:00).
Se não conseguir extrair horários (ex: "não sei", "qualquer hora" sem especificar, sem números), retorne valid=false.

Retorne: { "valid": true/false, "extractedData": { "horario_inicio": "HH:MM", "horario_fim": "HH:MM", "horario_descricao": "texto original" }, "retryMessage": "..." }`,

  outside_hours_behavior: `${SYSTEM_CONTEXT}

O usuário está escolhendo o que fazer com mensagens fora do horário:
1 = notify (avisa educadamente que retorna no próximo dia útil)
2 = silent (não responde nada, só anota)
Ou pode descrever uma mensagem customizada para enviar fora do horário.
Se é mensagem customizada longa (>10 palavras), use fora_horario="notify" e inclua em fora_horario_mensagem.
Se não indica preferência clara (ex: "não sei", ".", sem relação), retorne valid=false.

Retorne: { "valid": true/false, "extractedData": { "fora_horario": "notify|silent", "fora_horario_mensagem": "..." }, "retryMessage": "..." }`,

  confirm_summary: `${SYSTEM_CONTEXT}

O usuário está confirmando ou rejeitando um resumo de configuração.
Interprete: é confirmação (ok, sim, certo, pode ser, bora, perfeito, manda ver, tá bom, etc.) ou rejeição/pedido de ajuste?

Retorne: { "valid": true, "extractedData": { "confirmed": "true|false" } }`,
};

/**
 * Mensagens de retry amigáveis por step (fallback quando IA não retorna retryMessage).
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
