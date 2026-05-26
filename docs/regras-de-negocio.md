# Regras de Negócio — Hi Cleo

Documento central com todas as regras de negócio, fluxos e requisitos do produto.

---

## 1. Visão Geral do Produto

A Cleo é uma secretária virtual de WhatsApp para profissionais autônomos e pequenas empresas. O diferencial é que tudo funciona dentro do WhatsApp — sem painel web obrigatório.

**Funcionalidades core:**
- Captura automática de contatos (leads)
- Acompanhamento e follow-up automático
- Lembretes de retorno
- Respostas automáticas fora do horário
- Consultas por mensagem ("quem tá sem resposta?")

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

### 2.2 Checkout → Ativação
- Após pagamento confirmado, redireciona para `/ativacao`
- Página exibe: número da Cleo + código de ativação + instruções
- Usuário salva o número da Cleo e manda mensagem com o código pelo celular

### 2.3 Ativação → Onboarding (WhatsApp)
- A página de ativação fica aberta no computador fazendo polling (a cada 3s)
- Quando a Cleo recebe a mensagem e ativa o código, a página detecta automaticamente
- A Cleo faz onboarding por conversa: confirma nome, configura boas-vindas, configura resposta fora do horário

### 2.4 Onboarding → Conexão (QR Code)
- Ao concluir o onboarding, a Cleo orienta: "Volte para a tela no computador — o QR Code já está lá"
- A página de ativação redireciona automaticamente para `/conectar` com o QR Code
- Usuário escaneia o QR Code com o celular (Dispositivos Vinculados) para vincular seu WhatsApp à Cleo
- Isso permite que a Cleo leia as mensagens dos clientes do usuário (igual WhatsApp Web)

### 2.5 Conexão → Uso
- Após vincular, a Cleo começa a monitorar as conversas
- Contatos são salvos automaticamente
- Follow-ups e lembretes são ativados

---

## 3. Planos e Preços

| Plano | Usuários | Mensal | Anual (12x) | Total Anual |
|-------|----------|--------|-------------|-------------|
| Solo | 1 | R$49 | R$40,83 | R$490 |
| Equipe | Até 3 | R$119 | R$99,17 | R$1.190 |
| Empresa | Até 8 | R$249 | R$207,50 | R$2.490 |

**Regras:**
- Anual = mensal × 10 (economia de 2 meses)
- Contatos ilimitados em todos os planos
- Terminologia: "usuário" (não "número")
- Limite de usuários = números de WhatsApp conectados simultaneamente

---

## 3.1 Métodos de Pagamento e Taxas

**Gateway:** Mercado Pago (API Orders v2)

| Método | Taxa | Quem paga | Preço exibido |
|--------|------|-----------|---------------|
| PIX | 0% | Ninguém | Preço cheio (com label "10% off") |
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
4. MP confirma via webhook → sistema gera código de ativação + ativa assinatura

---

## 3.2 Renovação e Expiração

**Sem cobrança automática** — o cliente renova manualmente via novo pagamento.

| Evento | Ação |
|--------|------|
| 3 dias antes de expirar | Cleo envia lembrete via WhatsApp com link de renovação |
| 1 dia antes de expirar | Cleo envia segundo lembrete (urgência) |
| Dia da expiração | Status "expired" — Cleo fica 100% inoperante |
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

### Etapas:
1. **Confirmar nome** — Cleo pergunta como chamar o usuário
2. **Boas-vindas** — Configurar se envia apresentação para clientes novos
3. **Fora do horário** — Configurar resposta automática fora do expediente
4. **Conclusão** — Orienta a vincular o WhatsApp (voltar ao computador) + dica de fixar a Cleo

### Mensagem de conclusão:
- Explica que falta vincular o WhatsApp
- Orienta a voltar para o computador
- Compara com WhatsApp Web para o usuário entender
- Inclui dica de fixar a Cleo no topo

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
- Ao exceder limite: rejeita conexão e informa necessidade de upgrade
- Ao fazer downgrade: desconecta sessões excedentes ao final do período de cobrança

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
| `/conectar` | QR Code para vincular WhatsApp |
| `/termos` | Termos de uso e política de privacidade |
