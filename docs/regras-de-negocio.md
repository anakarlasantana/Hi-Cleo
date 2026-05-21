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

## 4. Regras de Cancelamento

- Cancelamento a qualquer momento, sem multa
- Acesso mantido até o final do período já pago
- Reembolso integral nos primeiros 7 dias (CDC - Código de Defesa do Consumidor)
- Após cancelamento: 30 dias para reativar sem perda de dados
- Após 30 dias: dados removidos permanentemente
- Confirmação enviada por e-mail e WhatsApp

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
