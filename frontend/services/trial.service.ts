import { apiRequest } from "@/lib/api-client"

export interface StartTrialParams {
  name: string
  phone: string
}

export interface StartTrialResponse {
  activationCode: string
  message: string
}

export async function startTrial(params: StartTrialParams): Promise<StartTrialResponse> {
  return apiRequest<StartTrialResponse>("/api/trial/start", {
    method: "POST",
    body: params as unknown as Record<string, unknown>,
  })
}
