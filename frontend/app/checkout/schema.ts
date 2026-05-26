import { z } from "zod"

export const baseSchema = z.object({
  name: z.string().min(3, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(14, "Telefone inválido"),
})

export const cardSchema = baseSchema.extend({
  cardName: z.string().min(3, "Nome no cartão é obrigatório"),
})

export type BaseFormData = z.infer<typeof baseSchema>
export type CardFormData = z.infer<typeof cardSchema>
