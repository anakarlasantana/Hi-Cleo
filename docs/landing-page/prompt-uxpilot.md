# Prompts para UX Pilot — Hi Cleo Landing Page + Fluxo de Contratação

Use estes prompts no UX Pilot (uxpilot.ai) para gerar o design visual completo do projeto.

**IMPORTANTE — Gere cada tela SEPARADAMENTE no Figma.** Cada prompt abaixo deve virar um frame/página independente. Não junte tudo num design só. A organização no Figma deve ser:
- Frame 1: Landing Page (Tela 1)
- Frame 2: Checkout (Tela 2)
- Frame 3: Pós-pagamento / Ativação (Tela 3)

O projeto é a **Hi Cleo** — uma landing page desktop-first (responsiva para tablet e mobile) que funciona como vitrine do produto e plataforma de contratação. Após o pagamento, o usuário é direcionado ao WhatsApp para ativação e onboarding — coerente com a proposta "tudo no WhatsApp".

**Nome do produto:** Hi Cleo
**Domínio:** hicleo.com.br
**Persona:** Cleo — secretária virtual / IA de atendimento no WhatsApp

**Fluxo completo do usuário:**
```
Site: Landing Page → Checkout → Pós-pagamento (código + instruções)
WhatsApp: Manda código → Cleo ativa → Onboarding conversacional → Conexão QR Code
```

---

## Tela 1 — Landing Page (Vitrine + Conversão)

```
Crie o design completo de uma landing page DESKTOP-FIRST (com responsividade para tablet e mobile) para um produto SaaS brasileiro chamado "Hi Cleo" — uma secretária virtual / IA de atendimento que funciona 100% dentro do WhatsApp.

O produto se conecta ao WhatsApp do usuário e organiza clientes automaticamente, faz acompanhamento, envia lembretes e responde mensagens. Não existe painel web — tudo funciona dentro do WhatsApp. A persona se chama "Cleo".

A landing page serve como VITRINE e ponto de CONTRATAÇÃO. Após o pagamento, o usuário ativa o serviço diretamente no WhatsApp (não no site).

PÚBLICO: Pequenos empresários, autônomos, prestadores de serviço brasileiros (corretores, personal trainers, clínicas pequenas, lojistas). Usam WhatsApp como ferramenta principal de trabalho.

ESTILO VISUAL:
- Paleta verde dominante (#25D366, #128C7E, #075E54) — remetendo ao WhatsApp
- Fundo branco/cinza claro para contraste
- Texto escuro (#1a1a1a)
- Design moderno, limpo, sem poluição visual
- Desktop-first: layout widescreen (1440px) com breakpoints para tablet (768px) e mobile (375px)
- Inspiração: simplicidade do Notion + conversão direta tipo Hotmart/Kiwify
- Seções com bastante respiro visual, espaçamento generoso
- Tipografia grande e legível

LAYOUT DESKTOP:
- Container máximo: 1200px centralizado
- Hero com layout lado a lado (texto à esquerda, visual à direita)
- Seções alternando fundo branco e fundo verde escuro/gradiente
- Tabela comparativa visível por completo (sem scroll horizontal)
- Cards de preço lado a lado (3 colunas)
- FAQ em accordion com largura contida

SEÇÕES DA PÁGINA (nesta ordem):

1. NAVBAR FIXA
- Logo "Hi Cleo" à esquerda (texto estilizado, sem ícone complexo)
- Links: Como funciona | Benefícios | Planos | FAQ
- CTA no canto direito: "Começar agora" (botão verde)
- Sticky no scroll, com fundo blur/transparente

2. HERO (2 colunas desktop)
- Headline: "Conheça a Cleo — sua secretária virtual no WhatsApp. Nunca mais perca um cliente por esquecimento."
- Sub-headline: "A Cleo organiza seus clientes, faz acompanhamento personalizado e te manda lembretes automáticos — tudo direto no seu celular, sem sistema complicado."
- 4 bullets com checkmarks verdes:
  • Todo cliente que te manda mensagem é salvo automaticamente
  • Acompanhamento personalizado da sua carteira
  • Lembretes pra você nunca esquecer de responder
  • Nenhum cliente fica sem retorno — mesmo fora do horário
- Preço em destaque: "A partir de R$49/mês" (badge ou texto destacado acima do CTA)
- CTA verde vibrante: "Quero a Cleo no meu WhatsApp"
- Visual direita: mockup de celular com conversa WhatsApp. Usar placeholder circular cinza onde o avatar da Cleo ficará (será adicionado manualmente depois). Nome do contato no mockup: "Cleo"
- Fundo com gradiente verde suave

3. DIFERENCIAL (comparativo)
- Fundo branco
- Título: "Por que não basta só o WhatsApp Business?"
- Tabela comparativa 3 colunas: WhatsApp Business | Outros CRMs | Hi Cleo
- 9 linhas com ícones ✅ ❌ ⚠️
- Coluna "Hi Cleo" destacada com borda/fundo verde
- Frase: "Tudo que um CRM faz, mas sem sair do WhatsApp. Sem painel. Sem computador."
- No mobile: transforma em cards empilhados

4. PROBLEMA (DOR)
- Fundo verde escuro (#075E54) com texto branco
- Título: "Quantos clientes você já perdeu por esquecimento?"
- 4 cards com ícones e dores:
  • Esquece de responder mensagens antigas
  • Não sabe quem está esperando retorno
  • Perde vendas porque não fez o acompanhamento
  • Não tem tempo pra ficar anotando tudo em planilha

5. COMO FUNCIONA (4 passos)
- Fundo branco
- Título: "Como começar em 3 minutos"
- 4 steps em linha horizontal (desktop) / vertical (mobile):
  1. Escolha seu plano e assine
  2. Mande uma mensagem no WhatsApp com seu código de ativação
  3. A Cleo te guia na configuração (tudo por conversa)
  4. Conecte seu WhatsApp e pronto — ela começa a trabalhar
- Timeline visual conectando os steps

6. BENEFÍCIOS (6 cards, grid 3x2 desktop)
- 📱 100% no celular — sem painel web, sem computador
- 🤖 Entende áudio e texto — fale naturalmente
- ⏰ Acompanhamento automático — nunca esqueça um cliente
- 📋 Contatos organizados — sem planilha, sem anotação
- 💬 Respostas automáticas — atenda fora do horário
- 💰 Preço justo — a partir de R$49/mês

7. DEMONSTRAÇÃO (mockup de conversa)
- Fundo verde escuro com mockup centralizado
- Mockup realista de celular com conversa WhatsApp
- Nome do contato no mockup: "Cleo". Usar placeholder circular cinza no lugar do avatar (será adicionado manualmente depois)
- Exemplos de interação:
  Usuário: "quem tá sem resposta?"
  Cleo: "Você tem 3 clientes esperando:
  • João (perguntou preço há 2 dias)
  • Maria (quer agendar visita)
  • Pedro (pediu orçamento)
  Quer ver detalhes de algum?"
  Usuário: "agenda retorno pro João amanhã"
  Cleo: "Pronto! Vou te lembrar amanhã de falar com o João ✅"
- No desktop: mockup grande com callouts ao redor

8. PLANOS E PREÇOS
- Fundo branco
- Título: "Escolha seu plano"
- Toggle: Mensal | Anual (economize 2 meses)
- 3 cards lado a lado:
  • Solo — 1 número — R$49/mês
  • Equipe (destacado "Mais popular") — até 3 números — R$119/mês
  • Empresa — até 8 números — R$249/mês
- CTA em cada card: "Assinar agora"
- Abaixo: "Todos os planos incluem: contatos ilimitados, áudios, acompanhamento automático, respostas inteligentes"
- "Precisa de mais números? Fale conosco" → link WhatsApp

9. FAQ (accordion, fundo cinza claro)
- Título: "Perguntas frequentes"
- Perguntas:
  • Preciso de computador pra usar?
  • Como funciona a ativação?
  • Meus clientes vão saber que é automático?
  • E se eu quiser cancelar?
  • Funciona com WhatsApp Business?
  • Quantos clientes posso ter?
  • A Cleo responde meus clientes sozinha?

10. CTA FINAL + FOOTER
- Seção CTA: fundo gradiente verde
- Título: "Comece a organizar seus clientes hoje"
- CTA grande: "Quero a Cleo no meu WhatsApp"
- Footer: logo "Hi Cleo", links (Termos | Privacidade | Contato), redes sociais

REGRAS:
- NÃO usar: leads, follow-up, CRM, pipeline, onboarding, churn
- Usar: clientes, acompanhamento, lembretes, organização
- Desktop-first, 100% responsivo
- Sem screenshots de dashboards ou painéis web
- NÃO gerar avatares, personagens ou ilustrações de pessoas — usar apenas placeholders (círculos cinza, ícones genéricos ou áreas marcadas com "avatar aqui"). O avatar da Cleo será criado separadamente e adicionado manualmente depois.
- A secretária virtual é PADRÃO para todos os usuários — NÃO existe personalização de avatar, foto, tom de voz ou aparência. O usuário personaliza apenas os DADOS DO NEGÓCIO (nome, serviços, horário). NÃO incluir nenhuma seção, tela ou elemento que sugira customização da Cleo.
```

---

## Tela 2 — Checkout (Pagamento)

```
Crie uma tela de checkout/pagamento DESKTOP-FIRST (responsiva) para o produto "Hi Cleo" — secretária virtual no WhatsApp.

CONTEXTO: O usuário clicou em "Assinar agora". Esta tela faz parte do mesmo site (hicleo.com.br). Após o pagamento confirmado, ele será direcionado para uma tela com instruções de ativação via WhatsApp.

ESTILO VISUAL:
- Mesma paleta verde (#25D366, #128C7E, #075E54)
- Fundo branco/cinza claro, limpo e confiável
- Desktop: layout 2 colunas (formulário esquerda, resumo sticky direita)
- Mobile: coluna única com resumo no topo

LAYOUT DESKTOP (2 colunas):

COLUNA ESQUERDA — Formulário:
1. Indicador de etapas simples: ① Pagamento → ② Ativação no WhatsApp
   (etapa 1 ativa)
2. Dados pessoais: Nome, E-mail, CPF, Telefone (WhatsApp)
3. Forma de pagamento (tabs): Cartão de crédito | PIX
   - Cartão: número, validade, CVV, nome no cartão → confirma na hora → vai pra Tela 3
   - PIX: ao confirmar, abre MODAL/OVERLAY com:
     • QR Code grande
     • Valor (ex: R$49,00)
     • Timer countdown (30 min)
     • Código PIX copiável + botão "Copiar"
     • Status: "Aguardando confirmação..." com spinner
     • Quando confirma → fecha modal → vai pra Tela 3
4. CTA: "Confirmar pagamento" (botão verde grande)
5. Selos de segurança: cadeado SSL, bandeiras de cartão, "Cancele quando quiser"

COLUNA DIREITA — Resumo (sticky):
1. Card com resumo do plano selecionado
2. Nome do plano, preço, período (mensal/anual)
3. O que inclui (4-5 itens)
4. Link "Trocar plano" → volta pra seção de planos

REGRAS:
- Sem navbar completa (só logo "Hi Cleo" + link voltar)
- Sem distrações, transmitir confiança e segurança
- PIX é modal dentro da mesma tela (não tela separada)
- Após pagamento confirmado → redireciona pra Tela 3
- Responsivo: no mobile vira coluna única
- NÃO gerar avatares ou personagens
```

---

## Tela 3 — Pós-Pagamento (Código de Ativação + Instruções)

```
Crie uma tela pós-pagamento DESKTOP-FIRST (responsiva) para o produto "Hi Cleo" — secretária virtual no WhatsApp.

CONTEXTO: Pagamento confirmado! Agora o usuário precisa abrir o WhatsApp e mandar uma mensagem para a Cleo com seu código de ativação. A partir daí, TODO o onboarding acontece dentro do WhatsApp (não no site). Esta é a ÚLTIMA tela web do fluxo.

ESTILO VISUAL:
- Mesma paleta verde (#25D366, #128C7E, #075E54)
- Fundo branco com toque de celebração (confetti sutil ou check verde animado no topo)
- Desktop: conteúdo centralizado (max-width 700px)
- Tom: sucesso + guia claro e simples pro próximo passo

ESTRUTURA:

1. HEADER DE SUCESSO
- Ícone/animação de check verde grande
- Título: "✅ Pagamento confirmado! Agora vamos ativar a Cleo."
- Subtítulo: "É só mandar uma mensagem no WhatsApp — leva 30 segundos."
- Indicador: ① Pagamento ✓ → ② Ativação no WhatsApp (atual)

2. INSTRUÇÕES (2 passos grandes e claros)

PASSO 1: "Salve este número nos seus contatos"
- Número grande e destacado: (48) 99999-9999
- Nome sugerido: "Cleo"
- Botão: "Copiar número" (com feedback "Copiado!")
- Ícone de agenda/contato

PASSO 2: "Mande esta mensagem no WhatsApp"
- Card com fundo verde claro (estilo balão de mensagem) contendo:
  ATIVAR-7X3K | Seu Nome | Seu Negócio | Serviços | Horário de atendimento
- Botão: "Copiar mensagem"
- Exemplo preenchido abaixo (texto menor, cinza):
  "ATIVAR-7X3K | João Silva | Imobiliária Centro | Venda e aluguel de imóveis | Seg a Sex 9h-18h"
- Código de ativação em DESTAQUE MÁXIMO: ATIVAR-7X3K (grande, bold, copiável separadamente)

3. BOTÃO PRINCIPAL (CTA)
- Botão verde grande com ícone do WhatsApp: "Abrir WhatsApp e ativar a Cleo"
- Deep link: abre WhatsApp com o número da Cleo pré-preenchido
- Texto abaixo: "A Cleo vai te responder e te guiar nos próximos passos — tudo por conversa!"

4. INFORMAÇÕES ADICIONAIS
- "⏰ O código expira em 24 horas"
- "📱 Após ativar, a Cleo vai te ajudar a configurar tudo pelo WhatsApp"
- "❓ Precisa de ajuda? Fale conosco" → link WhatsApp suporte

5. O QUE ACONTECE DEPOIS (mini seção informativa, discreta)
- "Após mandar a mensagem, a Cleo vai:"
  • Confirmar seus dados
  • Perguntar como você quer atender seus clientes
  • Te enviar um QR Code pra conectar seu WhatsApp
  • E pronto — ela começa a trabalhar pra você!

REGRAS:
- Esta é a ÚLTIMA tela web — depois disso tudo acontece no WhatsApp
- Código de ativação MUITO visível e fácil de copiar
- Botão "Abrir WhatsApp" é o CTA principal e dominante
- Explicar brevemente o que vai acontecer depois (gera confiança)
- Sem distrações, foco total em levar o usuário pro WhatsApp
- Transmitir que é rápido e simples
- Responsivo
- NÃO gerar avatares ou personagens — usar placeholder onde o avatar da Cleo apareceria
```

---

## Resumo do Fluxo

| Onde | Tela | O que acontece |
|------|------|----------------|
| Site | Tela 1 - Landing Page | Conhece a Cleo, vê benefícios, escolhe plano |
| Site | Tela 2 - Checkout | Paga com cartão (direto) ou PIX (modal) |
| Site | Tela 3 - Pós-pagamento | Recebe código de ativação + instruções + botão "Abrir WhatsApp" |
| WhatsApp | — | Manda código → Cleo ativa → Onboarding conversacional → QR Code → pronto |

O site tem apenas 3 telas. Todo o resto (configuração, onboarding, conexão do WhatsApp) acontece dentro do WhatsApp, conversando com a Cleo.

---

## Após Gerar os Designs

Traga os designs de volta (screenshots, Figma, ou descrições) e eu implemento:
- HTML/CSS/JS responsivo (ou React/Next.js)
- Animações e transições
- Integração com gateway de pagamento (Stripe/Mercado Pago)
- Geração de código de ativação
- Deep links WhatsApp
- SEO e performance
