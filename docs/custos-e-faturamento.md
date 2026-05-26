# Simulação de Custos e Faturamento — WhatsApp-first CRM

## Planos VPS Hostinger (Evolution API pré-instalada)

| Plano | Preço | vCPU | RAM | NVMe | Instâncias WhatsApp |
|-------|-------|------|-----|------|---------------------|
| **VPS NVMe 2** | R$25,89/mês (3 anos) | 1 | 2GB DDR5 | 50GB | Até 20 |
| **VPS NVMe 4** (mais popular) | R$35,49/mês (3 anos) | 2 | 4GB DDR5 | 100GB | Até 50 |
| **VPS NVMe 8** (recomendado) | R$69,99/mês (3 anos) | 4 | 8GB DDR5 | 200GB | Até 100 |

Todos incluem: transferência ilimitada, servidor no Brasil, 1 IP dedicado, migração grátis.

---

## Infraestrutura Base (custo fixo)

| Recurso | Plano | Custo | Limite |
|---------|-------|-------|--------|
| VPS Hostinger NVMe 2 | Evolution API pré-instalada | R$25,89/mês | 1 vCPU, 2GB RAM, 50GB, 20 instâncias |
| Supabase | Free tier | R$0 | 500MB banco, 50K MAUs |
| Evolution API | Open-source (na VPS) | R$0 | Incluso na VPS |
| Chip secretária | Pré-pago | R$10 (único) | 1 número para a secretária virtual |
| Domínio | .com.br | ~R$40/ano (~R$3,33/mês) | Landing page + webhook HTTPS (obrigatório) |

**Custo fixo mínimo: ~R$29/mês** (VPS + domínio rateado) (plano NVMe 2)

---

## Taxas do Gateway de Pagamento (Mercado Pago)

| Método | Taxa MP | Impacto no recebimento | Quem paga |
|--------|---------|------------------------|-----------|
| PIX | 0% | Recebe 100% na hora | Ninguém |
| Cartão à vista | ~4.99% | Recebe ~95% | Sistema absorve |
| Cartão 2x-3x | ~4.99% | Recebe ~95% | Sistema absorve |
| Cartão 4x-12x | ~4.99% + juros | Recebe 100% (juros repassados) | Cliente paga juros |

**Exemplo prático (Plano Solo R$49/mês):**
- PIX: recebe R$49,00
- Cartão 1x: recebe ~R$46,55 (absorve R$2,45)
- Cartão 3x: recebe ~R$46,55 (cliente paga 3x R$16,33)
- Cartão 6x: cliente paga ~R$57,00 total (juros), você recebe ~R$54,16 (menos taxa MP)

**Impacto na margem:** com 95%+ de margem operacional, absorver a taxa de cartão até 3x é trivial.

---

## Custos Variáveis (por uso)

### IA — Gemini API

| Tier | Limite | Custo | Usuários suportados |
|------|--------|-------|---------------------|
| Free | 1.000 req/dia, 15 req/min | R$0 | ~55 usuários |
| Tier 1 (pago) | 150 req/min | ~$0.25/1M tokens input | 55-200 usuários |

**Uso médio por usuário/dia:** ~18 chamadas Gemini
- Interpretar intenções (texto): ~10
- Transcrição + intenção (áudio, camada 1): ~3
- Resumos contextuais: ~3
- Notificações proativas: ~2

**Cálculo:** 1.000 req/dia ÷ 18 req/usuário = **~55 usuários no free tier**

### Transcrição de Áudio (estratégia 2 camadas)

| Camada | Quando usa | Custo | % dos áudios |
|--------|-----------|-------|--------------|
| Gemini Flash (multimodal) | Sempre (primeira tentativa) | R$0 (conta como 1 req Gemini) | 90-95% |
| Whisper fallback | Quando Gemini falha (confidence < 0.7) | $0.006/min (~R$0.03/min) | 5-10% |

**Estimativa mensal (20 usuários, 3 áudios/dia de 30s cada):**
- Total áudios: 20 × 3 × 30 = 1.800 min/mês
- Gemini resolve 95%: 1.710 min → R$0
- Whisper fallback 5%: 90 min × R$0.03 = **~R$2.70/mês**

### Supabase

| Métrica | Free tier | Quando paga |
|---------|-----------|-------------|
| Banco de dados | 500MB | ~6 meses com 50 usuários |
| Linhas estimadas | 2-5 milhões | Suficiente para MVP |
| Pro plan | $25/mês (8GB) | Quando ultrapassar 500MB |

**Estimativa de crescimento do banco:**
- 1 usuário gera ~50 mensagens/dia = ~1.500/mês
- 20 usuários = 30.000 mensagens/mês
- Cada mensagem ~200 bytes = ~6MB/mês
- **500MB dura ~80 meses com 20 usuários** (muito confortável)

---

## Cenários de Faturamento

### Cenário 1: MVP / Validação (1-5 usuários)

| Item | Custo |
|------|-------|
| VPS NVMe 2 | R$25,89/mês |
| Gemini | R$0 (free) |
| Whisper fallback | ~R$1/mês |
| Supabase | R$0 (free) |
| **Total** | **~R$27/mês** |

**Se cobrar R$49/mês por usuário:**
- 1 cliente = R$49 receita → R$22 lucro
- 3 clientes = R$147 receita → R$120 lucro
- 5 clientes = R$245 receita → R$218 lucro

### Cenário 2: Primeiros Clientes (5-19 usuários)

| Item | Custo |
|------|-------|
| VPS NVMe 2 | R$25,89/mês |
| Gemini | R$0 (free) |
| Whisper fallback | ~R$5/mês |
| Supabase | R$0 (free) |
| **Total** | **~R$31/mês** |

**Se cobrar R$69/mês por usuário:**
- 10 clientes = R$690 receita → R$659 lucro
- 15 clientes = R$1.035 receita → R$1.004 lucro
- 19 clientes = R$1.311 receita → R$1.280 lucro (limite do plano NVMe 2)

### Cenário 3: Escala Inicial (20-49 usuários) → Upgrade para NVMe 4

| Item | Custo |
|------|-------|
| VPS NVMe 4 | R$35,49/mês |
| Gemini | R$0 (free, ainda dentro de 1.000/dia) |
| Whisper fallback | ~R$10/mês |
| Supabase | R$0 (free) |
| **Total** | **~R$46/mês** |

**Se cobrar R$79/mês por usuário:**
- 30 clientes = R$2.370 receita → R$2.324 lucro
- 49 clientes = R$3.871 receita → R$3.825 lucro (limite do plano NVMe 4)

### Cenário 4: Escala Real (50-99 usuários) → Upgrade para NVMe 8

| Item | Custo |
|------|-------|
| VPS NVMe 8 | R$69,99/mês |
| Gemini Tier 1 | ~R$50/mês (acima de 55 usuários) |
| Whisper fallback | ~R$25/mês |
| Supabase Pro | R$130/mês ($25) |
| **Total** | **~R$275/mês** |

**Se cobrar R$89/mês por usuário:**
- 60 clientes = R$5.340 receita → R$5.065 lucro
- 80 clientes = R$7.120 receita → R$6.845 lucro
- 99 clientes = R$8.811 receita → R$8.536 lucro

---

## Roadmap de Upgrades

| Gatilho | Ação | Custo adicional |
|---------|------|-----------------|
| 19º usuário | Upgrade VPS NVMe 2 → NVMe 4 | +R$10/mês |
| 49º usuário | Upgrade VPS NVMe 4 → NVMe 8 | +R$35/mês |
| 55º usuário | Gemini free → Tier 1 (pago) | +R$30-50/mês |
| ~6 meses com 50+ users | Supabase free → Pro | +R$130/mês |
| 99º usuário | Segunda VPS ou cloud (AWS/GCP) | Reavaliar arquitetura |

---


## Modelo de Precificação

### Abordagem: Preço por número conectado (simples e justo)

Diferenciação baseada em uso real (cada número consome 1 instância na VPS), não em features artificiais.

### Planos Mensais

| Plano | Preço | Para quem | Inclui |
|-------|-------|-----------|--------|
| **Solo** | R$49/mês | Profissional autônomo (corretor, professor, consultor) | 1 número WhatsApp conectado, tudo incluso |
| **Equipe** | R$119/mês | Pequena empresa com atendentes | Até 3 números conectados, tudo incluso |
| **Empresa** | R$249/mês | Negócio com time de vendas | Até 8 números conectados, tudo incluso |

### Planos Anuais (pague 10, leve 12 — 2 meses grátis)

| Plano | Mensal | Anual (total) | Anual (por mês) | Economia |
|-------|--------|---------------|-----------------|----------|
| **Solo** | R$49 | R$490/ano | R$40,83/mês | R$98 (2 meses) |
| **Equipe** | R$119 | R$1.190/ano | R$99,17/mês | R$238 (2 meses) |
| **Empresa** | R$249 | R$2.490/ano | R$207,50/mês | R$498 (2 meses) |

### Número adicional avulso (referência interna — não exibir no site)

+R$39/mês por número extra (qualquer plano, mensal ou anual).

Exemplo: Cliente precisa de 5 números → Equipe (3) + 2 avulsos = R$119 + R$78 = R$197/mês.

> ⚠️ Esse valor é referência interna para negociação. No site, exibir apenas os 3 planos (Solo, Equipe, Empresa) + botão "Precisa de mais? Fale conosco" direcionando para WhatsApp de vendas.

### Acima de 8 números

Sob consulta — plano Enterprise customizado. Cliente entra em contato para negociação.

**Todos os planos incluem:** leads ilimitados, áudios ilimitados, follow-up automático, envio de materiais, respostas automáticas, IA contextual. Sem limitação de features.

### Por que esse modelo funciona:

1. **Custo real justifica:** Cada número consome 1 instância na Evolution API (recurso limitado da VPS)
2. **Fácil de entender:** "Quantos números de WhatsApp você usa?" — pronto, escolheu o plano
3. **Sem fricção:** Tudo incluso, sem "ah mas no seu plano não tem X"
4. **Upsell natural:** Quando o negócio cresce e contrata atendente, faz upgrade
5. **Anual garante caixa:** Receita adiantada cobre upgrades de infra com folga

### Simulação de receita com esse modelo:

| Mix de clientes | Receita mensal | Custo infra | Lucro |
|-----------------|---------------|-------------|-------|
| 10 Solo + 2 Equipe | R$728/mês | ~R$31/mês | R$697 |
| 20 Solo + 5 Equipe + 1 Empresa | R$1.824/mês | ~R$46/mês | R$1.778 |
| 30 Solo + 10 Equipe + 3 Empresa | R$3.407/mês | ~R$70/mês | R$3.337 |

**Se 50% dos clientes optarem pelo anual (cenário 2):**
- Receita adiantada no 1º mês: ~R$9.520 (caixa imediato para expansão)
- Receita mensal recorrente dos mensais: ~R$912/mês

---

## Resumo Executivo

| Métrica | Valor |
|---------|-------|
| Investimento inicial | ~R$76 (VPS + chip + domínio 1º ano) |
| Custo mensal mínimo | ~R$29/mês |
| Break-even | 1 cliente Solo (R$49) já cobre tudo |
| Margem com 10 clientes Solo | ~95% |
| Margem com 30 clientes (mix) | ~98% |
| Limite free (sem pagar IA) | ~55 números conectados |
| Receita potencial (20 Solo + 5 Equipe + 1 Empresa) | R$1.824/mês |
| Custo com esse mix | ~R$46/mês |
| **Lucro líquido** | **~R$1.778/mês** |

### Posicionamento de mercado:

| Concorrente | Preço mínimo | Seu preço |
|-------------|-------------|-----------|
| Kommo | ~R$78/mês/usuário | R$49/mês |
| PipeRun | ~R$89/mês | R$49/mês |
| WATI | ~R$200/mês | R$49/mês |
| SacOnline | ~R$97/mês | R$49/mês |

**Diferencial:** Mais barato, mais simples (sem dashboard), 100% no celular.

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Ban do WhatsApp (Evolution API usa protocolo não-oficial) | Alto | Uso moderado, sem spam, respeitar rate limits |
| Gemini muda free tier | Médio | Fallback para keyword matching + trocar para modelo mais barato |
| Supabase remove free tier | Baixo | Migrar para PostgreSQL self-hosted na VPS |
| Áudio não transcreve bem | Médio | Estratégia 2 camadas + pedir confirmação quando confidence baixa |
| Concorrência (WhatsApp Business AI) | Baixo | Diferencial é gestão pro DONO, não atendimento ao cliente |
| Hostinger aumenta preço após 3 anos | Médio | Migrar para Contabo/Hetzner ou renegociar |
