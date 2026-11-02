# Simulação de Custos e Faturamento — WhatsApp-first CRM

## Planos VPS (qualquer provider com Docker)

| Provider | Plano | Preço estimado | vCPU | RAM | Disco | Observação |
|----------|-------|----------------|------|-----|-------|-----------|
| **Oracle Cloud** | Always Free (A1.Flex) | **R$ 0** | 2 (ARM) | 12GB | 200GB | Grátis para sempre, DC em São Paulo, exige build ARM |
| Hetzner | CX22 | ~R$27/mês | 2 | 4GB | 40GB | Melhor custo-benefício x86, DC na Europa |
| Hostinger | KVM 2 | ~R$48/mês | 2 | 8GB | 100GB | Painel em PT, build sem sufoco |
| Contabo | VPS S | ~R$43/mês | 4 | 8GB | 200GB | Mais recursos por menos, I/O mais lento |
| DigitalOcean | Droplet | ~R$130/mês | 2 | 4GB | 80GB | DC em SP (menor latência BR) |

Requisito mínimo: **2 vCPU, 4GB RAM**, Docker instalado. Todos os serviços (nginx, backend, frontend, Redis, Evolution API, 2× Postgres) rodam no mesmo servidor via Docker Compose.

**Medição real (2026-10-27):** ~1,1–1,6 GB de RAM em regime; pico de ~3,6 GB durante o `next build`. Em VPS de 4 GB, configure swap antes do build. Detalhes e validação ARM64 em [deploy-producao.md §2.5](../tecnico/deploy-producao.md#25-oracle-cloud-always-free).

---

## Custos Iniciais (Setup — pagamento único ou primeiro mês)

| Item | Custo | Detalhe |
|------|-------|---------|
| Chip pré-pago (TIM) | ~R$15 | Número dedicado da Cleo |
| Domínio .com.br | ~R$40/ano | hicleo.com.br (Registro.br) |
| Primeira recarga (manter chip ativo) | ~R$15 | Dura 90-180 dias |
| **Total setup** | **~R$70** | |

---

## Infraestrutura Base (custo fixo recorrente)

| Recurso | Descrição | Custo | Detalhe |
|---------|-----------|-------|---------|
| VPS | Servidor com Docker (tudo roda junto) | ~R$30/mês | 1 vCPU, 4GB RAM |
| Supabase | Banco de dados (free tier) | R$0 | 500MB, 50K MAUs |
| Evolution API | Open-source (no Docker Compose) | R$0 | Incluso no compose |
| Recarga chip | Manter número ativo (pré-pago TIM) | ~R$5-7/mês | R$15 a cada 2-3 meses |
| Domínio | .com.br (rateado) | ~R$3/mês | Renovação anual ~R$40 |
| Cloudflare | SSL/CDN | R$0 | Free tier |

**Custo fixo mínimo: ~R$38/mês** (VPS + domínio rateado + chip rateado)

---

## Taxas do Gateway de Pagamento (Mercado Pago)

As taxas são por venda, com recebimento na hora:

| Método | Taxa MP | Impacto no recebimento | Quem paga |
|--------|---------|------------------------|-----------|
| PIX | 0,99% | Recebe ~99% | Sistema absorve |
| Cartão à vista | 4,98% | Recebe ~95% | Sistema absorve |
| Cartão 2x-6x (parcelado vendedor) | 2,99% | Recebe ~97% | Sistema absorve |
| Cartão 7x-12x (parcelado vendedor) | 3,09% | Recebe ~97% | Sistema absorve |
| Cartão (parcelado comprador) | até 4,98% | Recebe ~95% | Cliente paga juros |
| Open Finance | 0,00% | Recebe 100% | Ninguém |
| Boleto | R$3,49 fixo | Recebe valor - R$3,49 | Sistema absorve |

> ℹ️ **Open Finance (0%)** é a opção mais barata, mas ainda é pouco adotada pelos consumidores. Pix (0,99%) é o melhor custo-benefício considerando adoção + taxa.

**Exemplo prático (Plano Solo R$49/mês):**
- PIX: recebe R$48,51 (absorve R$0,49)
- Open Finance: recebe R$49,00 (sem taxa)
- Cartão 1x: recebe R$46,56 (absorve R$2,44)
- Cartão 3x (parcelado vendedor): recebe R$47,54 (absorve R$1,46)
- Cartão 3x (parcelado comprador): cliente paga mais, você recebe ~R$46,56
- Boleto: recebe R$45,51 (absorve R$3,49)

**Impacto na margem:** com 90%+ de margem operacional, absorver qualquer taxa é trivial. Pix é o meio mais usado e a taxa de 0,99% é bem baixa.

---

## Custos Variáveis (por uso)

### IA — Gemini API

| Tier | Limite | Custo | Usuários suportados |
|------|--------|-------|---------------------|
| Free | 15 req/min — **insuficiente para beta** | R$0 | ~5 usuários (rate limit frequente) |
| Pay-as-you-go ($10 créditos iniciais) | 2000 req/min (Gemini 2.0 Flash) | ~$0.10/1M tokens input | 100+ usuários |

> ⚠️ **O free tier não sustenta o beta.** Com 20 donos e 600 chamadas/dia, estoura o rate limit.
> Solução: ativar billing no Google AI Studio (pay-as-you-go). Custo: ~R$2-5/mês para 20 donos.

**Uso médio por usuário/dia:** ~18 chamadas Gemini
- Interpretar intenções (texto): ~10
- Respostas contextuais aos clientes: ~5
- Transcrição + intenção (áudio): ~3

### IA Fallback — Groq API

| Tier | Limite | Custo | Quando usa |
|------|--------|-------|------------|
| Free | 30 req/min | R$0 | Quando Gemini falha |
| Developer (pay-as-you-go) | 7000 req/min | $0.05/1M tokens | Produção |

### Transcrição de Áudio — Groq Whisper

| Status | Custo | Limite |
|--------|-------|--------|
| ✅ Implementado | $0.111/hora áudio | 20 req/min (free) |

> Transcrição funciona no onboarding e pós-onboarding. Requer `GROQ_API_KEY` configurada.

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

> ℹ️ **Receita líquida** = receita bruta - taxa Mercado Pago. Considerando mix de 70% Pix (0,99%) + 30% Cartão (4,98%).
> Taxa média ponderada: ~2,19% por transação.

### Cenário 1: MVP / Validação (1-5 usuários)

| Item | Custo |
|------|-------|
| VPS NVMe 2 | R$25,89/mês |
| Chip pré-pago (rateado) | ~R$7/mês |
| Domínio (rateado) | ~R$3/mês |
| Gemini | R$0 (free) |
| Groq fallback | R$0 (free) |
| Supabase | R$0 (free) |
| **Total infra** | **~R$36/mês** |

**Receita com Plano Solo R$49/mês:**

| Clientes | Receita bruta | Taxa MP (~2,19%) | Receita líquida | Lucro |
|----------|--------------|------------------|-----------------|-------|
| 1 | R$49 | R$1,07 | R$47,93 | R$11,93 |
| 3 | R$147 | R$3,22 | R$143,78 | R$107,78 |
| 5 | R$245 | R$5,37 | R$239,63 | R$203,63 |

### Cenário 2: Primeiros Clientes (5-19 usuários)

| Item | Custo |
|------|-------|
| VPS NVMe 2 | R$25,89/mês |
| Chip pré-pago (rateado) | ~R$7/mês |
| Domínio (rateado) | ~R$3/mês |
| Gemini | R$0 (free) |
| Groq fallback | R$0 (free) |
| Supabase | R$0 (free) |
| **Total infra** | **~R$36/mês** |

**Receita com Plano Solo R$49/mês:**

| Clientes | Receita bruta | Taxa MP (~2,19%) | Receita líquida | Lucro |
|----------|--------------|------------------|-----------------|-------|
| 10 | R$490 | R$10,73 | R$479,27 | R$443,27 |
| 15 | R$735 | R$16,10 | R$718,90 | R$682,90 |
| 19 | R$931 | R$20,39 | R$910,61 | R$874,61 |

### Cenário 3: Escala Inicial (20-49 usuários) → Upgrade para NVMe 4

| Item | Custo |
|------|-------|
| VPS NVMe 4 | R$35,49/mês |
| Chip pré-pago (rateado) | ~R$7/mês |
| Domínio (rateado) | ~R$3/mês |
| Gemini | R$0 (free, mas próximo do limite de RPM) |
| Groq fallback | R$0 (free) |
| Supabase | R$0 (free) |
| **Total infra** | **~R$46/mês** |

| Clientes | Receita bruta | Taxa MP (~2,19%) | Receita líquida | Lucro |
|----------|--------------|------------------|-----------------|-------|
| 30 | R$1.470 | R$32,19 | R$1.437,81 | R$1.391,81 |
| 49 | R$2.401 | R$52,58 | R$2.348,42 | R$2.302,42 |

### Cenário 4: Escala Real (50-99 usuários) → Upgrade para NVMe 8

| Item | Custo |
|------|-------|
| VPS NVMe 8 | R$69,99/mês |
| Chip pré-pago (rateado) | ~R$7/mês |
| Domínio (rateado) | ~R$3/mês |
| Gemini Tier 1 | ~R$50/mês |
| Groq fallback | R$0 (free) |
| Supabase Pro | R$130/mês |
| **Total infra** | **~R$260/mês** |

| Clientes | Receita bruta | Taxa MP (~2,19%) | Receita líquida | Lucro |
|----------|--------------|------------------|-----------------|-------|
| 60 | R$2.940 | R$64,39 | R$2.875,61 | R$2.615,61 |
| 80 | R$3.920 | R$85,85 | R$3.834,15 | R$3.574,15 |
| 99 | R$4.851 | R$106,24 | R$4.744,76 | R$4.484,76 |

---

## Roadmap de Upgrades

| Gatilho | Ação | Custo adicional |
|---------|------|-----------------|
| 19º usuário | Upgrade VPS NVMe 2 → NVMe 4 | +R$10/mês |
| ~30-50 usuários | Gemini free → Tier 1 (RPM insuficiente) | +R$30-50/mês |
| 49º usuário | Upgrade VPS NVMe 4 → NVMe 8 | +R$35/mês |
| ~6 meses com 50+ users | Supabase free → Pro | +R$130/mês |
| Transcrição de áudio | Implementar Whisper ou Gemini multimodal | +R$5-25/mês (depende do volume) |
| 99º usuário | Segunda VPS ou cloud (AWS/GCP) | Reavaliar arquitetura |

---

## Custos NÃO contabilizados (possíveis no futuro)

| Item | Quando | Estimativa |
|------|--------|------------|
| Email transacional (Resend, SendGrid) | Se precisar enviar emails (recibos, recuperação) | R$0 (free tier: ~100 emails/dia) |
| Ngrok/Tunnel (testes webhook) | Desenvolvimento local com webhook | R$0 (free) ou ~$10/mês (pro) |
| Backup externo | Se quiser backup fora do Supabase | ~R$5-10/mês (S3/Backblaze) |
| Monitoramento (Uptime Robot, etc.) | Alertas quando o servidor cai | R$0 (free tier) |
| Certificado SSL | Se não usar Cloudflare | R$0 (Let's Encrypt gratuito) |

> ℹ️ Nenhum desses é necessário agora. São custos que podem surgir conforme o produto escala.

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

### Simulação de receita com esse modelo (incluindo taxas MP):

> Mix assumido: 70% Pix (0,99%) + 30% Cartão (4,98%) = taxa média ~2,19%

| Mix de clientes | Receita bruta | Taxa MP | Receita líquida | Custo infra | Lucro |
|-----------------|--------------|---------|-----------------|-------------|-------|
| 10 Solo + 2 Equipe | R$728/mês | R$15,94 | R$712,06 | ~R$36/mês | R$676,06 |
| 20 Solo + 5 Equipe + 1 Empresa | R$1.824/mês | R$39,95 | R$1.784,05 | ~R$46/mês | R$1.738,05 |
| 30 Solo + 10 Equipe + 3 Empresa | R$3.407/mês | R$74,61 | R$3.332,39 | ~R$260/mês | R$3.072,39 |

**Se 50% dos clientes optarem pelo anual (cenário 2):**
- Receita adiantada no 1º mês: ~R$9.520 (caixa imediato para expansão)
- Receita mensal recorrente dos mensais: ~R$892/mês (já descontando MP)

---

## Resumo Executivo

| Métrica | Valor |
|---------|-------|
| Investimento inicial (setup) | ~R$70 (chip + recarga + domínio 1º ano) |
| Custo mensal mínimo | ~R$36/mês |
| Taxa média Mercado Pago | ~2,19% (mix 70% Pix + 30% Cartão) |
| Break-even | 1 cliente Solo (R$49 - R$1,07 taxa = R$47,93 > R$36 infra) ✅ |
| Margem com 10 clientes Solo | ~91% |
| Margem com 30 clientes (mix) | ~92% |
| Limite free (sem pagar IA) | ~30-50 números conectados (gargalo: 15 RPM Gemini) |
| Receita potencial (20 Solo + 5 Equipe + 1 Empresa) | R$1.784/mês líquido |
| Custo com esse mix | ~R$46/mês |
| **Lucro líquido** | **~R$1.738/mês** |

---

## Análise de Viabilidade por Plano

### Plano Solo (R$49/mês) — 1 número

| Métrica | Valor |
|---------|-------|
| Receita bruta | R$49,00 |
| Taxa MP (Pix 0,99%) | -R$0,49 |
| Taxa MP (Cartão 4,98%) | -R$2,44 |
| Receita líquida (melhor caso - Pix) | R$48,51 |
| Receita líquida (pior caso - Cartão) | R$46,56 |
| Custo marginal por usuário (infra) | ~R$0* |

*O custo de infra é fixo (VPS). Cada novo usuário Solo não adiciona custo significativo até atingir limite da VPS.

**Veredicto: ✅ Viável.** Mesmo com 1 único cliente, já cobre toda a infra. A taxa do MP é irrelevante.

### Plano Equipe (R$119/mês) — 3 números

| Métrica | Valor |
|---------|-------|
| Receita líquida (Pix) | R$117,82 |
| Receita líquida (Cartão) | R$113,07 |
| Custo marginal | ~R$0 (mesma VPS) |

**Veredicto: ✅ Muito viável.** Margem excelente.

### Plano Empresa (R$249/mês) — 8 números

| Métrica | Valor |
|---------|-------|
| Receita líquida (Pix) | R$246,54 |
| Receita líquida (Cartão) | R$236,60 |
| Custo marginal | ~R$0 (mesma VPS, mas 8 instâncias consomem mais RAM) |

**Veredicto: ✅ Altamente viável.** Margem altíssima.

### Conclusão da análise

| Cenário | Taxa MP total/mês | % da receita perdida | Impacto real |
|---------|-------------------|---------------------|--------------|
| 10 clientes Solo (todos Pix) | R$4,90 | 1% | Irrelevante |
| 10 clientes Solo (todos Cartão) | R$24,40 | 5% | Baixo |
| 20 Solo + 5 Equipe + 1 Empresa | R$17-40 | 1-2,2% | Irrelevante |

**A taxa do Mercado Pago não ameaça a viabilidade do negócio em nenhum cenário.** O maior custo continua sendo a infraestrutura (VPS + Gemini pago quando escalar), e mesmo assim as margens ficam acima de 90% em todos os cenários.

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
| Provider aumenta preço | Baixo | Docker Compose portável — migrar para outro provider em 1h |
