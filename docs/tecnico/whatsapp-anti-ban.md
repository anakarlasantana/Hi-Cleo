# Diretrizes Anti-Ban do WhatsApp — Hi Cleo

## Contexto

O WhatsApp usa um sistema de detecção de 4 camadas (fingerprinting, comportamento, reports, padrões de conteúdo) que pontua contas automaticamente. Chatbots e automações são particularmente vulneráveis porque geram padrões de envio que se assemelham a spam.

A Cleo, como secretária virtual que responde clientes automaticamente, precisa respeitar limites rígidos para não ser banida — protegendo tanto a conta do serviço (instância `secretary`) quanto as contas dos donos (quando a Cleo responde na instância deles).

## Limites Operacionais (produção)

| Parâmetro | Limite Seguro | Zona de Perigo | Impacto |
|-----------|--------------|----------------|---------|
| Mensagens por hora (por número) | ≤ 30 | > 60 | Flag de velocidade Layer 2 |
| Mensagens por dia (número novo) | ≤ 50 | > 200 | Ban quase certo nos primeiros 10 dias |
| Mensagens por dia (número estável) | ≤ 200 | > 500 | Acúmulo de flags |
| Delay mínimo entre mensagens | ≥ 2s (variável) | Fixo 500ms | Detecção de automação |
| Mensagens idênticas por hora | ≤ 15 | > 15 | Flag de conteúdo Layer 4 |
| Taxa de resposta (reply rate) | ≥ 30% | < 15% | Métrica mais importante |
| Taxa de bloqueio (block rate) | < 1% | > 2% | Quality Rating cai para Low |
| Mensagens sem resposta em 48h | Minimizar | Acumular 30 dias | Contador rolling 2026 |

## Regras para a Cleo

### 1. Rate Limiting de Saída (OBRIGATÓRIO)

Toda mensagem de saída (sendText, sendMedia, forwardMessage) passa por um rate limiter antes de chegar na Evolution API:

- **Máximo 25 msgs/hora por instância** (margem de segurança vs limite de 30)
- **Delay variável entre envios**: 2-5 segundos (randomizado para parecer humano)
- **Burst máximo**: 3 msgs seguidas sem delay (para respostas longas que precisam de múltiplas msgs)
- **Cooldown após burst**: delay de 8-15 segundos

### 2. Crons e Envios em Batch

Os crons que enviam mensagens proativas (prospecção, follow-up, subscription, connection-monitor):

- **Máximo 10 msgs por execução de cron** (espaçar ao longo do dia)
- **Delay de 30-60 segundos entre cada envio** do batch
- **Janela de envio**: apenas entre 8h-20h (horário comercial local)
- **Priorizar crons em horários alternados** (não todos no minuto 0)

### 3. Personalização de Mensagens

- **NUNCA enviar a mesma mensagem** para mais de 10 destinatários por hora
- Usar variações de texto (nome do cliente, contexto, emojis variados)
- Variar comprimento das mensagens (não enviar sempre o mesmo template idêntico)

### 4. Warm-up de Número Novo

Quando uma nova instância de WhatsApp é conectada (novo dono):

- **Dias 1-3**: Máximo 20 msgs/dia, apenas respostas a clientes que iniciaram conversa
- **Dias 4-7**: Até 50 msgs/dia, habilitar follow-up
- **Dias 8-14**: Até 100 msgs/dia, habilitar prospecção
- **Após dia 14**: Limites normais (200/dia, 25/hora)

### 5. Resposta > Prospecção

A Cleo SEMPRE prioriza responder clientes que mandaram mensagem (reply-initiated) sobre envios proativos (outbound). Isso mantém a reply rate alta:

- Respostas a clientes: sem limite de rate (respeitando apenas o 25/hora)
- Envios proativos: limitados a 10% do volume total do dia
- Se a reply rate cair abaixo de 30%, PAUSAR envios proativos

### 6. Detecção e Fallback

Se o rate limiter estiver saturado:
- Mensagens são enfileiradas (não descartadas)
- Logs de warning quando fila > 50 mensagens pendentes
- Alerta ao admin quando atingir 80% do limite horário
- Em caso de ban temporário (soft ban 24-72h): pausar todos os envios automaticamente

## Implementação Técnica

### Arquitetura

```
container.ts
└── messaging = RateLimitedMessaging(EvolutionApiAdapter)
    ├── Token bucket por instância (Redis)
    ├── Delay variável entre envios
    ├── Fila de prioridade (respostas > proativos)
    └── Métricas (msgs/hora, reply rate, block rate)
```

### Configuração (env vars)

```env
# Rate Limiting de saída (WhatsApp anti-ban)
WA_RATE_LIMIT_PER_HOUR=25
WA_RATE_LIMIT_PER_DAY=200
WA_MIN_DELAY_MS=2000
WA_MAX_DELAY_MS=5000
WA_BURST_MAX=3
WA_BURST_COOLDOWN_MS=12000
WA_PROACTIVE_MAX_PER_CRON=10
WA_PROACTIVE_DELAY_MS=45000
```

### Observabilidade

Métricas que devem ser monitoradas:
- `wa.messages.sent_per_hour` (por instância)
- `wa.messages.queued` (fila pendente)
- `wa.rate_limit.hits` (quantas vezes o limiter freou)
- `wa.reply_rate` (taxa de respostas recebidas vs enviadas)
- `wa.instance.warm_up_day` (dia de warm-up de cada instância)

## O que NÃO fazer

- ❌ Enviar mensagem com intervalo fixo (ex: exatamente 1 msg a cada 2s)
- ❌ Disparar prospecção para mais de 15 pessoas em 1 hora
- ❌ Mandar o mesmo texto para muitos destinatários (template idêntico)
- ❌ Enviar mensagens durante a madrugada (fora do horário comercial)
- ❌ Ignorar bloqueios — se alguém bloqueia a Cleo, remover imediatamente da lista
- ❌ Usar número novo para disparos em massa nos primeiros dias
- ❌ Manter enviando para números que não respondem há 30+ dias

## Referências

- [WhatsApp Business Policy 2026](https://business.whatsapp.com/policy)
- [Meta AI-Assisted Business Messaging Guidelines](https://developers.facebook.com/docs/whatsapp)
- Dados de enforcement observados pela comunidade (Whapi.cloud, 50+ deployments)
- Experiência própria: ban da instância Hi Cleo em 22/08/2026 por volume de testes automatizados

## Validação

O teste E2E de qualidade (`tests/e2e-quality/`) roda **sem WhatsApp conectado** graças ao padrão persist-then-dispatch. Resultado do primeiro run sem WhatsApp (22/08/2026):

- 4/7 personas passaram (cenários técnicos 2/2, conversacionais 2/5)
- Falhas são problemas reais da Cleo (não do setup de teste)
- Prova que o sistema é testável de forma independente da infraestrutura de mensageria
