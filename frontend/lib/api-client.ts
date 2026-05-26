const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: unknown
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

/**
 * Cliente HTTP centralizado com tratamento de erros padronizado.
 * Todas as requisições passam por aqui.
 */
export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {} } = options

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  }

  if (body) {
    config.body = JSON.stringify(body)
  }

  let response: Response

  try {
    response = await fetch(`${API_URL}${endpoint}`, config)
  } catch (networkError) {
    throw new ApiError(
      "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
      0,
      networkError
    )
  }

  if (!response.ok) {
    let errorMessage = "Erro inesperado. Tente novamente."

    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || errorMessage
    } catch {
      // Resposta não é JSON — usa mensagem padrão por status
      errorMessage = getDefaultErrorMessage(response.status)
    }

    throw new ApiError(errorMessage, response.status)
  }

  try {
    return await response.json() as T
  } catch {
    throw new ApiError("Resposta inválida do servidor.", response.status)
  }
}

function getDefaultErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400: return "Dados inválidos. Verifique as informações e tente novamente."
    case 401: return "Não autorizado. Faça login novamente."
    case 403: return "Acesso negado."
    case 404: return "Recurso não encontrado."
    case 429: return "Muitas tentativas. Aguarde um momento e tente novamente."
    case 500: return "Erro interno do servidor. Tente novamente em alguns instantes."
    case 502: return "Serviço temporariamente indisponível."
    case 503: return "Serviço em manutenção. Tente novamente em breve."
    default: return "Erro inesperado. Tente novamente."
  }
}
