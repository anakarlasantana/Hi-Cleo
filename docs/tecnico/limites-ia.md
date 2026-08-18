# Limites de IA — Teste de Carga

> ⚠️ Este documento é gerado automaticamente por `tests/load-ai/run.ts`.
> Para atualizar, rode: `cd backend && npm run test:load:ai`

## Pendente

Rodar o teste com pelo menos 1 provider configurado (DEEPSEEK_API_KEY ou GROQ_API_KEY).

```bash
cd backend
npm run test:load:ai
```

O teste vai medir os limites reais e preencher este documento com:
- Tabela de limites por provider
- Capacidade estimada para o beta
- Latências sob carga
- Recomendações de configuração
- Cenários de degradação (1 ou 2 providers down)

---

## Limites Teóricos dos Free Tiers (referência)

| Provider | TPM | RPM | Limite diário | Observação |
|----------|-----|-----|---------------|-----------|
| Groq Free | 8.000 | 30 | ~500k tokens | Descontinua modelos sem aviso |
| Groq Dev Tier | 30.000 | 60 | ~5M tokens | Upgrade grátis no painel |
| DeepSeek Free Grant | Sem limite rígido | 50 | 5M tokens (grant) | Mais estável para produção |
| DeepSeek Pago | Sem limite | 500 | Ilimitado | $0.14/1M input, $0.28/1M output |
| Gemini Free | 15.000 | 15 | 1.5M tokens | Rate limit muito restritivo |
