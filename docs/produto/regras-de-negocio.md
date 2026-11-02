# Regras de Negócio — Hi Cleo

Documento central com todas as regras de negócio, fluxos e requisitos do produto.

> **Visão geral do produto** (o que é, problema, solução, público, stack): ver [visao-geral.md](./visao-geral.md)

---

## 2. Fluxo do Usuário (Jornada Completa)

```
Landing Page → Checkout → Ativação → Onboarding (WhatsApp) → Conexão (QR Code) → Uso
```

### 2.1 Landing Page → Checkout
- Usuário escolhe plano e período (mensal/anual)
- Clica em "Assinar agora" → abre checkout com plano pré-selecionado
- Checkout aceita PIX (padrão) ou cartão de crédito
- Campos: nome, e-mail, WhatsApp (com máscaras e validação)

### 2.2 Checkout → Pagamento → Criação do Usuário
- Após pagamento confirmado (webhook MP):
  - Sistema cria user no banco com email + plan + subscription ativa (sem phone ainda)
  - Gera activation_code vinculado ao user_id e user_email (intransferível)
  - Retry: até 3 tentativas se criação falhar
- Frontend redireciona para `/ativacao`
- Página exibe: número da Cleo + código de ativação + instruções

### 2.3 Ativação → Onboarding (WhatsApp)
- Usuário salva o número da Cleo e manda mensagem com o código pelo celular
- A página de ativação fica aberta no computador fazendo polling (a cada 3s)
- Cleo recebe o código → busca user existente pelo code.user_id → complementa com phone/name
- A Cleo faz onboarding por conversa: confirma nome, configura boas-vindas, configura resposta fora do horário
- Marca código como used

### 2.4 Onboarding → Conexão (QR Code)
- Ao concluir o onboarding, a Cleo orienta: "Volte para a tela no computador — o QR Code já está lá"
- A página redireciona automaticamente para `/conectar` com o QR Code
- Endpoint de QR valida: ownership do código + subscription ativa + slots disponíveis
- Página mostra contador: "X de Y conexões usadas"
- Usuário escaneia o QR Code com o celular (Dispositivos Vinculados)

### 2.5 Conexão → Uso
- Após vincular, a Cleo começa a monitorar as conversas
- Contatos são salvos automaticamente
- Follow-ups e lembretes são ativados

### 2.6 Convite de Colaboradores (Equipe/Empresa)
- Owner conectado diz pra Cleo: "convida 11999887766"
- Cleo verifica slots disponíveis e gera invite token (72h validade)
- Cleo envia link pro colaborador via WhatsApp: `/conectar/convite?token=XXXX`
- Colaborador clica → aceita termos LGPD → onboarding leve (nome + horário)
- Escaneia QR Code → conectado com business profile independente

### 2.7 Desconexão e Substituição
- Owner diz pra Cleo: "desconecta 11999887766"
- Cleo desconecta a sessão do colaborador e libera o slot
- Owner pode convidar outro colaborador imediatamente
- Follow-ups e lembretes são ativados

---

## 3. Planos e Preços

| Plano | Usuários | Mensal | Anual (12x) | Total Anual |
|-------|----------|--------|-------------|-------------|
| Solo | 1 | R$89,90 | R$74,92 | R$899 |
| Equipe | Até 3 | R$239,90 | R$199,92 | R$2.399 |
| Empresa | Até 8 | R$629,90 | R$524,92 | R$6.299 |

**Regras:**
- Anual = mensal × 10 (economia de 2 meses = 16,7%)
- Contatos ilimitados em todos os planos
- Terminologia: "usuário" (não "número")
- Limite de usuários = números de WhatsApp conectados simultaneamente

---

## 3.1 Métodos de Pagamento e Taxas

**Gateway:** Mercado Pago (API Orders v2)

| Método | Taxa | Quem paga | Preço exibido |
|--------|------|-----------|---------------|
| PIX | 0% | Ninguém | Preço cheio (sem desconto) |
| Cartão à vista (1x) | ~4.99% | Sistema absorve | Preço cheio |
| Cartão 2x-3x | ~4.99% + parcelamento | Sistema absorve | Preço cheio dividido |
| Cartão 4x-12x | ~4.99% + juros compostos | Cliente paga juros | Preço ajustado visível |

**Regras de parcelamento:**
- Juros compostos: ~1.99% ao mês para parcelas acima de 3x
- Parcelamento NÃO estende o período da assinatura (30 dias mensal, 365 anual)
- O Mercado Pago cobra as parcelas do cliente e repassa o valor integral ao sistema
- Valores internos em centavos para evitar erros de arredondamento

**Fluxo de pagamento:**
1. Cliente escolhe plano + método no checkout
2. Frontend tokeniza cartão via MercadoPago.js (dados não passam pelo backend)
3. Backend cria Order no MP → recebe QR code (PIX) ou status (cartão)
4. MP confirma via webhook → sistema cria user (email + plan + subscription) + gera código de ativação vinculado

---

## 3.2 Renovação e Expiração

**Sem cobrança automática** — o cliente renova manualmente via novo pagamento.

| Evento | Ação |
|--------|------|
| 3 dias antes de expirar | Cleo envia lembrete via WhatsApp com link de renovação |
| 1 dia antes de expirar | Cleo envia segundo lembrete (urgência) |
| Dia da expiração | Status "expired" — Cleo fica 100% inoperante, TODAS as sessões desconectadas (owner + colaboradores) |
| Dentro de 30 dias após expirar | Cliente pode renovar e reativar sem perda de dados |
| Após 30 dias expirado | Dados removidos permanentemente |

**Renovação antecipada:** se o cliente paga antes de expirar, o novo período é somado a partir da data de expiração atual (não penaliza quem paga adiantado).

**Mensagens de lembrete incluem:**
- Link direto para o checkout
- Aviso sobre o prazo de 30 dias para reativação antes da remoção dos dados

---

## 4. Regras de Cancelamento

- Cancelamento a qualquer momento, sem multa
- Acesso mantido até o final do período já pago
- Reembolso integral nos primeiros 7 dias (CDC - Código de Defesa do Consumidor)
- Após cancelamento: 30 dias para reativar sem perda de dados
- Após 30 dias: dados removidos permanentemente
- Confirmação enviada pelo WhatsApp (Cleo manda mensagem com data de encerramento)
- Recibo de pagamento: enviado automaticamente pelo gateway (Mercado Pago/Stripe)
- E-mail: não utilizado no MVP (canal futuro se necessário)

---

## 5. LGPD e Consentimento

- Aceite obrigatório na página de conexão (antes do QR Code)
- Checkbox: "Li e aceito os Termos de Uso e Política de Privacidade"
- Registro armazenado: user_id, versão do documento, data/hora
- Quando termos são atualizados: Cleo envia mensagem no WhatsApp pedindo novo aceite
- Página `/termos` sempre acessível com conteúdo completo
- Versão atual dos termos: controlada por constante no backend

---

## 6. Regras do Motor de Regras

### 6.1 Condições disponíveis
- `primeira_mensagem` — Quando um contato novo manda mensagem pela primeira vez
- `fora_horario` — Quando mensagem chega fora do horário comercial do usuário
- `lembrete` — Quando um lembrete agendado é disparado

### 6.2 Lembrete com contato
- Formato: "🔔 Lembrete: [descrição] às [horário].\nContato: [nome] - [telefone]"
- Se contato não tem telefone: omite a linha de contato
- Se múltiplos contatos: lista todos com telefone

---

## 7. Onboarding (Conversa com a Cleo)

### Fluxo do Owner (7 etapas):
1. **Confirmar nome** — "Como posso te chamar?"
2. **Tipo de negócio** — "Me conta o que você faz" (com exemplos: corretor, professor, clínica...)
3. **Público-alvo** — "Quem são seus clientes geralmente?" (com exemplos)
4. **Tom de voz** — Como a Cleo deve se comunicar (formal / descontraído / informal + texto livre)
5. **Horário comercial** — Parsing inteligente de texto livre (ex: "seg-sáb 8h-20h")
6. **Fora do horário** — O que fazer com mensagens fora do expediente (opções + texto customizado)
7. **Confirmação** — Resumo de tudo configurado, owner confirma ou ajusta

### Fluxo do Colaborador (onboarding leve, 2 etapas):
1. **Nome** — Via formulário web na página /conectar/convite
2. **Horário comercial** — Via formulário web

### Personalização baseada no onboarding:
- Tom de voz (`formal`, `friendly_professional`, `casual`) afeta as mensagens automáticas
- Público-alvo e tipo de negócio são armazenados no business_profile para contexto
- Mensagens de boas-vindas e fora de horário são geradas com o tom escolhido
- Aceita respostas livres (IA interpreta) E opções numéricas (1, 2, 3)

### Mensagem de conclusão:
- Mostra resumo do que foi configurado
- Orienta a voltar para o computador para escanear QR Code
- Compara com WhatsApp Web para o usuário entender
- Dica de fixar a Cleo no topo do WhatsApp

---

## 8. Monitoramento de Contatos

- Contatos ilimitados (sem limite por usuário)
- Índices de performance no banco: user_id, created_at, status
- Alerta para admin quando total de contatos excede threshold (padrão: 100k)
- Métricas disponíveis: total, média por usuário, máximo por usuário
- Threshold configurável via variável de ambiente

---

## 9. Limites de Plano

- Solo: máximo 1 sessão WhatsApp ativa
- Equipe: máximo 3 sessões WhatsApp ativas
- Empresa: máximo 8 sessões WhatsApp ativas
- Customizado: admin pode definir `max_connections_override` por usuário (10, 20, 50, 100+)
- Fórmula de slots: `max_connections_override ?? plan_limits.max_users`
- Ao exceder limite: rejeita conexão e informa necessidade de upgrade
- Ao fazer downgrade: desconecta sessões excedentes ao final do período de cobrança
- Ao expirar assinatura: desconecta TODAS as sessões (owner + colaboradores)
- Colaboradores: convidados via Cleo (intent "convida 11999..."), cada um com business profile independente
- Substituição: owner pode desconectar colaborador (intent "desconecta 11999...") e convidar outro

---

## 10. Padrões de Código

- **Código** (funções, variáveis, interfaces): inglês
- **Banco de dados** (tabelas, colunas): inglês (migração pendente)
- **Comentários**: português permitido
- **Documentação**: português
- **UI** (textos visíveis ao usuário): português
- **URLs do frontend** (pastas /app): português (são rotas visíveis)
- **Constantes**: arquivo `constants.ts` separado dentro de cada módulo
- **Arquitetura backend**: ports/repositories/services por módulo
- **Frontend**: Next.js com componentes em pastas por feature

---

## 11. Fluxo Técnico (Backend)

```
WhatsApp do usuário
   ↓
Evolution API (webhook)
   ↓
Backend Node.js (fila Redis)
   ↓
Message Processor
   ↓
Banco de dados (Supabase)
   ↓
Motor de regras + IA (Gemini/Groq)
   ↓
Resposta via WhatsApp
```

---

## 12. Páginas Web

| Rota | Propósito |
|------|-----------|
| `/` | Landing page |
| `/checkout` | Pagamento (PIX/cartão) |
| `/ativacao` | Pós-pagamento: código + instruções + polling |
| `/conectar` | QR Code para vincular WhatsApp (com contador de slots) |
| `/conectar/convite` | Convite para colaborador: termos + onboarding leve + QR |
| `/termos` | Termos de uso e política de privacidade |
