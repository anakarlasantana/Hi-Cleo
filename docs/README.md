# Documentação — Hi Cleo

Índice de todos os documentos do projeto.

---

## Produto

| Documento | Descrição |
|-----------|-----------|
| [Visão Geral](produto/visao-geral.md) | O que é, problema, solução, público, stack |
| [Regras de Negócio](produto/regras-de-negocio.md) | Fluxos, requisitos e regras do sistema |
| [Personalidade da Cleo](produto/personalidade-cleo.md) | Como a Cleo se comporta com donos e clientes |
| [Custos e Faturamento](produto/custos-e-faturamento.md) | Simulação de infra, planos e break-even |

## Técnico

| Documento | Descrição |
|-----------|-----------|
| [Arquitetura de IA](tecnico/arquitetura-ia.md) | Módulo ai/, nós, prompts, tokens, LangGraph |
| [Deploy em Produção](tecnico/deploy-producao.md) | Guia completo: VPS, domínio, SSL, segurança, backup, checklist |
| [Débitos Técnicos](tecnico/debitos-tecnicos.md) | Roadmap, histórico de concluídos e melhorias futuras |
| [Teste E2E via Webhook](tecnico/teste-e2e-webhook.md) | Guia para testar fluxo Trial→Onboarding sem WhatsApp real |
| [Teste E2E de Qualidade](../tests/e2e-quality/README.md) | Teste autônomo com LLM simulando usuário + avaliando respostas |
| [Limites de IA](tecnico/limites-ia.md) | Resultados do teste de carga dos providers (gerado automaticamente) |
| [Credenciais de Teste MP](tecnico/credenciais-teste-mercadopago.md) | Cartões, emails e cenários de teste do sandbox Mercado Pago |

## Marketing

| Documento | Descrição |
|-----------|-----------|
| [Público-Alvo](marketing/publico-alvo-analise.md) | Análise de personas e segmentos |
| [Prompt Instagram](marketing/prompt-instagram.md) | Prompts para criação de conteúdo |
| [Briefing Landing Page](marketing/briefing-landing-page.md) | Requisitos da página de vendas |

## Laudos (gitignored)

Relatórios de testes E2E gerados automaticamente. Não versionados.

---

## Onde fica o quê

| Preciso de... | Vá para... |
|---------------|-----------|
| Entender o produto | `produto/visao-geral.md` |
| Ver regras e fluxos | `produto/regras-de-negocio.md` |
| Escrever/ajustar prompts da Cleo | `produto/personalidade-cleo.md` |
| Entender a camada de IA | `tecnico/arquitetura-ia.md` |
| Fazer deploy em produção | `tecnico/deploy-producao.md` |
| Ver o que falta fazer | `tecnico/debitos-tecnicos.md` |
| Calcular custos | `produto/custos-e-faturamento.md` |
