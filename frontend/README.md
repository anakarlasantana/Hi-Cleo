# Hi Cleo — Frontend

Interface web do Hi Cleo: checkout, ativação, conexão WhatsApp e termos.

> **Docs complementares:**
> - [Visão do produto](../docs/produto/visao-geral.md) — o que é, problema, solução
> - [Personalidade da Cleo](../docs/produto/personalidade-cleo.md) — tom e linguagem da UI
> - [Briefing Landing Page](../docs/marketing/briefing-landing-page.md) — requisitos visuais

---

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript |
| Estilização | Tailwind CSS |
| Componentes UI | Radix UI + shadcn/ui |
| Ícones | Lucide React |
| Pagamento | Mercado Pago SDK React |
| Formulários | React Hook Form + Zod |
| Tema | next-themes (dark/light) |

---

## Estrutura de Pastas

```
frontend/
├── app/                    # Pages (App Router)
│   ├── page.tsx            # Landing page (/)
│   ├── layout.tsx          # Layout raiz
│   ├── checkout/           # Pagamento (/checkout)
│   ├── ativacao/           # Ativação pós-pagamento (/ativacao)
│   ├── conectar/           # QR Code + convites (/conectar)
│   └── termos/             # Termos de uso (/termos)
├── components/
│   ├── ui/                 # Componentes genéricos (shadcn/ui)
│   ├── landing/            # Componentes da landing page
│   └── layout/             # Header, footer, containers
├── services/               # Chamadas HTTP centralizadas
│   ├── activation.service.ts
│   ├── payment.service.ts
│   └── plans.service.ts
├── lib/                    # Utilitários reutilizáveis
│   ├── api-client.ts       # Fetch wrapper com base URL
│   ├── formatters.ts       # Formatação de moeda, data
│   ├── masks.ts            # Máscaras de input (CPF, telefone)
│   ├── mercadopago.ts      # SDK wrapper do Mercado Pago
│   ├── sanitize.ts         # Sanitização de inputs
│   └── utils.ts            # cn() e utilitários gerais
├── hooks/                  # Hooks customizados
│   ├── use-mobile.ts       # Detecta viewport mobile
│   └── use-toast.ts        # Sistema de notificações
├── styles/                 # CSS global
├── public/                 # Assets estáticos
├── Dockerfile              # Multi-stage build (standalone)
└── next.config.mjs         # Configuração Next.js
```

---

## Regras de Desenvolvimento

### Organização

- **page.tsx deve ser mínimo** — apenas export default instanciando componentes
- **Lógica em componentes container** — estado, fetch e manipulação de dados fora da page
- **Chamadas HTTP em services/** — componentes NUNCA fazem fetch direto
- **Utilitários em lib/** — máscaras, formatters, SDK wrappers
- **Componentes de página na mesma pasta** — ex: `app/checkout/pix-modal.tsx`
- **Componentes genéricos em components/ui/** — reutilizáveis em qualquer página

### Nomenclatura

- Código (funções, variáveis): inglês
- UI (textos visíveis ao usuário): português
- URLs (rotas visíveis): português (`/checkout`, `/ativacao`, `/conectar`, `/termos`)

### Padrões

- Valores monetários: recebe em centavos do backend, formata com `formatters.ts`
- Variáveis de ambiente: prefixo `NEXT_PUBLIC_` para client-side
- Componentes com responsabilidade única
- Props ou estados no container para comunicação entre componentes

---

## Páginas

| Rota | Descrição | Componentes principais |
|------|-----------|------------------------|
| `/` | Landing page | Seções de venda, planos, FAQ |
| `/checkout` | Pagamento (PIX/cartão) | Formulário + Mercado Pago SDK |
| `/ativacao` | Pós-pagamento | Código de ativação + instruções WhatsApp |
| `/conectar` | QR Code WhatsApp | Stepper, QR code, polling de status |
| `/termos` | Termos de uso e privacidade | Conteúdo estático |

---

## Variáveis de Ambiente

```env
NEXT_PUBLIC_API_URL=http://localhost:3001      # Backend URL
NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY=APP_USR-x  # MP public key (tokenização)
NEXT_PUBLIC_SITE_URL=http://localhost:3000      # URL do próprio frontend
NEXT_PUBLIC_SECRETARY_PHONE=5548999999999      # Número da Cleo (exibição)
```

---

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Dev server com hot-reload |
| `npm run build` | Build de produção (standalone) |
| `npm run start` | Serve build de produção |
| `npm run lint` | ESLint |

---

## Docker

```bash
# Dev (via docker compose na raiz)
docker compose up --build

# Produção
docker compose -f docker-compose.prod.yml up -d --build
```

O Dockerfile usa multi-stage build com output `standalone` do Next.js para imagem mínima.
