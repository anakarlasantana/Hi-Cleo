import { apiRequest } from "@/lib/api-client"

export interface ActivationStatusResponse {
  status: "pending" | "activated"
  used: boolean
}

export interface ConnectionSlots {
  used: number
  total: number
  remaining: number
}

export interface InviteValidation {
  valid: boolean
  ownerName?: string
  phone?: string
  error?: string
}

export interface AcceptInviteParams {
  name: string
  businessHoursStart: string
  businessHoursEnd: string
  termsAccepted: boolean
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

export async function fetchConnectionSlots(code: string): Promise<ConnectionSlots> {
  return apiRequest<ConnectionSlots>(`/api/activation/slots/${code}`)
}

export async function fetchInviteStatus(token: string): Promise<InviteValidation> {
  return apiRequest<InviteValidation>(`/api/invites/validate/${token}`)
}

export async function acceptInvite(token: string, data: AcceptInviteParams): Promise<{ userId: string }> {
  return apiRequest<{ userId: string }>(`/api/invites/${token}/accept`, {
    method: "POST",
    body: data as unknown as Record<string, unknown>,
  })
}
