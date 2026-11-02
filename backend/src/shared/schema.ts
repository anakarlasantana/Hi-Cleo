import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  inet,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================
// TABELAS
// ============================================================

// --- Users ---
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  plan: text('plan').notNull().default('solo'),
  phone: text('phone'),
  email: text('email'),
  subscriptionStatus: text('subscription_status').default('active'),
  subscriptionStartedAt: timestamp('subscription_started_at', { withTimezone: true }),
  subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
  billingPeriod: text('billing_period').default('monthly'),
  paymentProviderId: text('payment_provider_id'),
  maxConnectionsOverride: integer('max_connections_override'),
  ownerUserId: uuid('owner_user_id'),
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
  trialResponsesUsed: integer('trial_responses_used').default(0),
  trialResponsesLimit: integer('trial_responses_limit').default(30),
  trialAttemptId: uuid('trial_attempt_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_users_phone_unique').on(table.phone).where('phone IS NOT NULL' as any),
  uniqueIndex('idx_users_email_unique').on(table.email).where('email IS NOT NULL' as any),
]);

// --- Businesses ---
export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).unique(),
  name: text('name'),
  type: text('type'),
  services: text('services'),
  description: text('description'),
  targetAudience: text('target_audience'),
  toneOfVoice: text('tone_of_voice').default('friendly_professional'),
  businessHoursStart: text('business_hours_start').default('08:00'),
  businessHoursEnd: text('business_hours_end').default('18:00'),
  timezone: text('timezone').default('America/Sao_Paulo'),
  businessDays: text('business_days').array().default(['mon', 'tue', 'wed', 'thu', 'fri']),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// --- WhatsApp Sessions ---
export const whatsappSessions = pgTable('whatsapp_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  instanceName: text('instance_name').notNull(),
  status: text('status').default('pending'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  lastCheck: timestamp('last_check', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_instance').on(table.instanceName),
  index('idx_sessions_user_status').on(table.userId, table.status),
  // Migração 0002: uma instância só pode estar ativa para um usuário por vez.
  // Índice parcial — o histórico (disconnected) continua com múltiplas linhas.
  uniqueIndex('idx_sessions_instance_active_unique')
    .on(table.instanceName)
    .where(sql`status = 'active'`),
]);

// --- Leads ---
export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  status: text('status').default('new'),
  lastInteraction: timestamp('last_interaction', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_leads_user_id').on(table.userId),
  index('idx_leads_user_created').on(table.userId, table.createdAt),
  index('idx_leads_user_status').on(table.userId, table.status),
]);

// --- Messages ---
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id),
  text: text('text').notNull(),
  direction: text('direction').notNull(),
  mediaType: text('media_type'),
  mediaMimeType: text('media_mime_type'),
  mediaFileName: text('media_file_name'),
  mediaKey: text('media_key'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_messages_lead_media').on(table.leadId, table.mediaType),
]);

// --- Follow-ups ---
export const followUps = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id').references(() => leads.id),
  userId: uuid('user_id').references(() => users.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_followups_user_status').on(table.userId, table.status),
]);

// --- Rules ---
export const rules = pgTable('rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  condition: text('condition').notNull(),
  response: text('response').notNull(),
  active: boolean('active').default(true),
});

// --- Activation Codes ---
export const activationCodes = pgTable('activation_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').unique().notNull(),
  plan: text('plan').notNull(),
  paymentId: text('payment_id').notNull(),
  userId: uuid('user_id').references(() => users.id),
  userEmail: text('user_email'),
  used: boolean('used').default(false),
  usedBy: uuid('used_by').references(() => users.id),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_activation_code').on(table.code),
  index('idx_activation_codes_user_id').on(table.userId),
  index('idx_activation_codes_user_email').on(table.userEmail),
]);

// --- Onboarding States ---
export const onboardingStates = pgTable('onboarding_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  step: text('step').notNull(),
  data: jsonb('data').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// --- Excluded Contacts ---
export const excludedContacts = pgTable('excluded_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  phone: text('phone').notNull(),
  name: text('name'),
}, (table) => [
  uniqueIndex('excluded_contacts_user_phone_unique').on(table.userId, table.phone),
]);

// --- Plan Limits ---
export const planLimits = pgTable('plan_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  planName: text('plan_name').unique().notNull(),
  displayName: text('display_name'),
  description: text('description'),
  maxUsers: integer('max_users').notNull(),
  priceMonthly: integer('price_monthly').notNull().default(0),
  priceYearlyTotal: integer('price_yearly_total').notNull().default(0),
  features: text('features').array().default([]),
  highlighted: boolean('highlighted').default(false),
  /**
   * Ordem de apresentação na vitrine (Solo 1 → Equipe 2 → Empresa 3).
   * Sem esta coluna a API devolvia a ordem física do heap, que muda conforme os
   * UPSERTs de preço rodam (migration 0005).
   */
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// --- Terms Consent ---
export const termsConsent = pgTable('terms_consent', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  termsVersion: text('terms_version').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow(),
  ipAddress: text('ip_address'),
}, (table) => [
  index('idx_terms_consent_user').on(table.userId),
]);

// --- Cancellations ---
export const cancellations = pgTable('cancellations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }).defaultNow(),
  accessUntil: timestamp('access_until', { withTimezone: true }).notNull(),
  reason: text('reason'),
  refundEligible: boolean('refund_eligible').default(false),
  refundProcessed: boolean('refund_processed').default(false),
  reactivatedAt: timestamp('reactivated_at', { withTimezone: true }),
}, (table) => [
  index('idx_cancellations_user').on(table.userId),
]);

// --- Invites ---
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
  phone: text('phone').notNull(),
  token: text('token').unique().notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedByUserId: uuid('used_by_user_id').references(() => users.id),
}, (table) => [
  index('idx_invites_token').on(table.token),
  index('idx_invites_owner').on(table.ownerUserId),
  index('idx_invites_phone').on(table.phone),
]);

// --- Payments ---
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalOrderId: varchar('external_order_id').notNull(),
  externalPaymentId: varchar('external_payment_id'),
  userEmail: varchar('user_email').notNull(),
  planName: varchar('plan_name').notNull(),
  billingPeriod: varchar('billing_period').notNull(),
  paymentMethod: varchar('payment_method').notNull(),
  installments: integer('installments').notNull().default(1),
  amountCents: integer('amount_cents').notNull(),
  status: varchar('status').notNull().default('pending'),
  pixQrCode: text('pix_qr_code'),
  pixQrCodeBase64: text('pix_qr_code_base64'),
  activationCodeId: uuid('activation_code_id').references(() => activationCodes.id),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_payments_external_order_id').on(table.externalOrderId),
  index('idx_payments_user_email').on(table.userEmail),
  index('idx_payments_status').on(table.status),
]);

// --- Subscription Events ---
export const subscriptionEvents = pgTable('subscription_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  eventType: varchar('event_type').notNull(),
  orderId: varchar('order_id').notNull().default(''),
  amountCents: integer('amount_cents').notNull().default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_subscription_events_user_id').on(table.userId),
  index('idx_subscription_events_event_type').on(table.eventType),
]);

// --- Trial Attempts ---
export const trialAttempts = pgTable('trial_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  emailNormalized: text('email_normalized'),
  businessType: text('business_type'),
  city: text('city'),
  state: text('state'),
  referralSource: text('referral_source'),
  ipAddress: inet('ip_address'),
  deviceFingerprint: text('device_fingerprint'),
  userAgent: text('user_agent'),
  status: text('status').default('started'),
  blockedReason: text('blocked_reason'),
  trialUserId: uuid('trial_user_id').references(() => users.id),
  responsesUsed: integer('responses_used').default(0),
  leadsCaptured: integer('leads_captured').default(0),
  whatsappConnected: boolean('whatsapp_connected').default(false),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  prospectionAttempts: integer('prospection_attempts').default(0),
  lastProspectionAt: timestamp('last_prospection_at', { withTimezone: true }),
  prospectionStatus: text('prospection_status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  expiredAt: timestamp('expired_at', { withTimezone: true }),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
}, (table) => [
  index('idx_trial_phone_90d').on(table.phone, table.createdAt),
  index('idx_trial_device').on(table.deviceFingerprint),
  index('idx_trial_ip_24h').on(table.ipAddress, table.createdAt),
  index('idx_trial_prospection').on(table.status, table.prospectionStatus),
  index('idx_trial_hot_leads').on(table.responsesUsed),
]);

// ============================================================
// TIPOS INFERIDOS (substituem shared/types/index.ts parcialmente)
// ============================================================

export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type BusinessSelect = typeof businesses.$inferSelect;
export type BusinessInsert = typeof businesses.$inferInsert;
export type LeadSelect = typeof leads.$inferSelect;
export type LeadInsert = typeof leads.$inferInsert;
export type MessageSelect = typeof messages.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
export type FollowUpSelect = typeof followUps.$inferSelect;
export type ActivationCodeSelect = typeof activationCodes.$inferSelect;
export type OnboardingStateSelect = typeof onboardingStates.$inferSelect;
export type PlanLimitSelect = typeof planLimits.$inferSelect;
export type TermsConsentSelect = typeof termsConsent.$inferSelect;
export type CancellationSelect = typeof cancellations.$inferSelect;
export type InviteSelect = typeof invites.$inferSelect;
export type PaymentSelect = typeof payments.$inferSelect;
export type PaymentInsert = typeof payments.$inferInsert;
export type SubscriptionEventSelect = typeof subscriptionEvents.$inferSelect;
export type TrialAttemptSelect = typeof trialAttempts.$inferSelect;
export type TrialAttemptInsert = typeof trialAttempts.$inferInsert;
export type WhatsAppSessionSelect = typeof whatsappSessions.$inferSelect;
