import { apiRequest } from "@/lib/api-client"

export interface ActivationStatusResponse {
  status: "pending" | "activated"
  used: boolean
}

export async function fetchActivationStatus(code: string): Promise<ActivationStatusResponse> {
  return apiRequest<ActivationStatusResponse>(`/api/activation/status/${code}`)
}

export async function registerTermsConsent(code: string, termsVersion: string): Promise<void> {
  await apiRequest("/api/activation/consent", {
    method: "POST",
    body: { code, termsVersion },
  })
}
