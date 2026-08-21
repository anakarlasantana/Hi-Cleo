# Ollama — Configuração do Modelo Local para Testes

Guia de instalação e configuração do Ollama para rodar o simulador de personas
nos testes comportamentais da Cleo **sem depender de APIs externas** e sem rate limit.

---

## Por que usar Ollama nos testes?

| Aspecto | API externa (DeepSeek/Groq) | Ollama local |
|---|---|---|
| Rate limit | Sim (30-50 RPM) | **Nenhum** |
| Custo | Pago ou quota limitada | **Zero** |
| Precisa de internet | Sim | Não |
| Velocidade | ~1s | ~3-8s (CPU) / ~1-2s (GPU) |
| Qualidade p/ simular WhatsApp | Excelente | Boa o suficiente |

**Regra**: a Cleo em teste usa o provider REAL (DeepSeek). O Ollama substitui apenas o **simulador de persona** (lado do teste) e o **evaluator/judge**.

---

## Requisitos de Hardware

| Modelo | RAM necessária | Qualidade p/ simular msgs WhatsApp | Velocidade (CPU) |
|---|---|---|---|
| qwen3:1.7b | ~2 GB | Básica (saudações, msgs curtas) | Rápido (~1s) |
| qwen3:4b | ~4 GB | Boa (conversas simples em PT-BR) | Ok (~2-3s) |
| **qwen3:8b** ⭐ | **~6 GB** | **Muito boa (recomendado)** | **~3-8s** |
| qwen3:14b | ~10 GB | Excelente | Lento (~8-15s) |

**Mínimo recomendado**: 16GB RAM total (6GB para o modelo + ~10GB para SO e Docker).

---

## Instalação

### Linux / macOS

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Verificar instalação

```bash
ollama --version
# Exemplo: ollama version is 0.32.5
```

### Baixar o modelo recomendado

```bash
ollama pull qwen3:8b
```

> ⏳ Download de ~5.2GB. Tempo estimado: 8-10 min (depende da internet).

### Verificar modelos disponíveis

```bash
ollama list
# NAME           ID              SIZE      MODIFIED
# qwen3:8b       500a1f067a9f    5.2 GB    ...
```

---

## Testar se Funciona

### Via CLI

```bash
ollama run qwen3:8b "oi, quanto custa o serviço de vocês?"
```

### Via API HTTP (como o código dos testes chama)

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3:8b",
  "messages": [{"role": "user", "content": "oi, qnt custa?"}],
  "stream": false
}' | jq '.message.content'
```

Resposta esperada: algo como `"Olá! Poderia me dizer qual serviço você está perguntando..."`

### Verificar se o serviço está rodando

```bash
curl -s http://localhost:11434/api/tags | jq '.models[].name'
# "qwen3:8b"
```

---

## Configuração nos Testes E2E

No `.env` do projeto (ou variáveis de ambiente):

```env
# Provider para o SIMULADOR DE PERSONA (lado do teste, não a Cleo)
E2E_PERSONA_PROVIDER=ollama
E2E_PERSONA_MODEL=qwen3:8b
E2E_OLLAMA_BASE_URL=http://localhost:11434

# Provider para o EVALUATOR/JUDGE
E2E_JUDGE_PROVIDER=ollama
E2E_JUDGE_MODEL=qwen3:8b

# Provider para a CLEO (o que está sendo testado — mantém o real)
E2E_AI_PROVIDER=deepseek
```

### Exemplo de uso no código

```typescript
// Chamada para Ollama (persona simulator / judge)
async function callOllama(system: string, user: string): Promise<string> {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.E2E_OLLAMA_MODEL || 'qwen3:8b',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
      think: false,              // Desativa reasoning (mais rápido)
      options: {
        temperature: 0.7,        // Mais criativo para simular personas variadas
        num_predict: 200,         // Msgs de WhatsApp são curtas
      },
    }),
  });

  const data = await response.json();
  return data.message.content;
}
```

---

## Dicas de Performance

### Desativar o "thinking" (mais rápido)

O qwen3 tem modo de raciocínio (thinking) que consome tokens extras. Para os testes, está desativado via parâmetro `think: false` na API:

```typescript
// O ai-client.ts já faz isso automaticamente
{
  model: 'qwen3:8b',
  messages: [...],
  stream: false,
  think: false,  // ← Desativa o modo thinking
  options: { temperature: 0.7, num_predict: 200 },
}
```

> ⚠️ **Não use `/no_think` no prompt** — o parâmetro correto na API do Ollama é `"think": false` no body da requisição.

### Primeira chamada é mais lenta

O modelo é carregado na RAM na primeira requisição (~15-30s). Chamadas subsequentes são rápidas (~3-8s). O modelo é descarregado automaticamente após 5 minutos sem uso.

**Dica**: antes de rodar a bateria de testes, faça uma chamada de "warmup":

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3:8b",
  "messages": [{"role": "user", "content": "warmup"}],
  "stream": false
}' > /dev/null
```

### Manter o modelo carregado

Para evitar o tempo de carregamento entre testes:

```bash
# Manter por 1 hora (padrão é 5min)
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3:8b",
  "messages": [{"role": "user", "content": "keep alive"}],
  "stream": false,
  "keep_alive": "1h"
}' > /dev/null
```

### Limitar uso de RAM/CPU

Se a máquina está rodando Docker + backend + testes ao mesmo tempo:

```bash
# Limitar threads de CPU usadas pelo Ollama
export OLLAMA_NUM_PARALLEL=1    # 1 request por vez (padrão)
export OLLAMA_MAX_LOADED_MODELS=1  # Só 1 modelo na RAM
```

---

## Arquitetura nos Testes

```
┌──────────────────────────────────────────────────────────┐
│                    Teste E2E de Qualidade                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Persona Simulator ─── Ollama (local, grátis, ilimitado) │
│       │                                                  │
│       │  msg tipo "oi qnt custa?"                        │
│       ▼                                                  │
│  Cleo Backend ────────── DeepSeek (provider REAL)        │
│       │                                                  │
│       │  resposta humanizada                             │
│       ▼                                                  │
│  Persona interpreta ─── Ollama (local)                   │
│       │                                                  │
│       ▼                                                  │
│  ... (loop até max turnos)                               │
│       │                                                  │
│       ▼                                                  │
│  Judge/Evaluator ────── Ollama (local)                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Resultado**: a única chamada a API paga é a da Cleo respondendo — que é exatamente o que queremos testar.

---

## Troubleshooting

### "connection refused" na porta 11434

O serviço Ollama não está rodando:

```bash
# Verificar status
systemctl status ollama

# Iniciar manualmente
ollama serve &
```

### Modelo não encontrado

```bash
# Verificar se foi baixado
ollama list

# Re-baixar se necessário
ollama pull qwen3:8b
```

### Resposta muito lenta (>15s)

1. Verificar se é a primeira chamada (carregamento do modelo)
2. Verificar RAM disponível: `free -h` — se swap está sendo usado, modelo não cabe
3. Considerar modelo menor: `ollama pull qwen3:4b`

### "out of memory"

A máquina não tem RAM suficiente para o modelo:

```bash
# Ver quanto está usando
ollama ps

# Trocar para modelo menor
ollama pull qwen3:4b
# E mudar E2E_PERSONA_MODEL=qwen3:4b
```

---

## Modelos Alternativos

Se o `qwen3:8b` não performar bem em algum cenário:

| Modelo | Comando | Quando usar |
|---|---|---|
| `qwen3:4b` | `ollama pull qwen3:4b` | Máquina com pouca RAM |
| `qwen3:14b` | `ollama pull qwen3:14b` | Personas adversarial complexas |
| `llama3.1:8b` | `ollama pull llama3.1:8b` | Alternativa se qwen falhar |
| `gemma2:9b` | `ollama pull gemma2:9b` | Bom em diálogos curtos |

---

## Importante: Ollama NÃO substitui a IA em Produção

O Ollama é **exclusivamente para testes**. Em produção, a Cleo continua usando DeepSeek/Groq/Gemini porque:

- Qualidade superior em português informal
- Menos alucinação
- Latência mais consistente (~1s vs ~3-8s)
- Sem necessidade de infra dedicada (GPU/RAM)
- Custo: ~R$0,05/dia para 600 chamadas

| Uso | Provider |
|---|---|
| Produção (Cleo atendendo clientes) | DeepSeek → Groq → Gemini |
| Testes (simular 100+ personas) | **Ollama local** |
| Testes (avaliar conversas) | **Ollama local** |
| Desenvolvimento/debug | **Ollama local** |
