/**
 * Utilitário para verificação de horário comercial.
 * Respeita timezone do dono e dias da semana configurados.
 */

/** Dias da semana no formato abreviado (ISO: mon=1 ... sun=7) */
export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Padrões quando o dono não configura explicitamente */
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_BUSINESS_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_START = '08:00';
const DEFAULT_END = '18:00';

/** Mapeia getDay() (0=dom, 1=seg...) para WeekDay */
const DAY_INDEX_TO_WEEKDAY: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface BusinessHoursConfig {
  businessHoursStart?: string;
  businessHoursEnd?: string;
  timezone?: string;
  businessDays?: string[];
}

export interface BusinessHoursResult {
  isOutsideHours: boolean;
  currentTime: string;
  currentDay: WeekDay;
  start: string;
  end: string;
}

/**
 * Verifica se o momento atual está fora do horário comercial do dono.
 * Leva em conta timezone e dias da semana.
 */
export function checkBusinessHours(config: BusinessHoursConfig): BusinessHoursResult {
  const timezone = config.timezone || DEFAULT_TIMEZONE;
  const start = config.businessHoursStart || DEFAULT_START;
  const end = config.businessHoursEnd || DEFAULT_END;
  const businessDays = (config.businessDays as WeekDay[]) || DEFAULT_BUSINESS_DAYS;

  // Obter hora e dia da semana no timezone do dono
  const now = new Date();
  const { hours, minutes, dayOfWeek } = getTimeInTimezone(now, timezone);

  const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  const currentDay = DAY_INDEX_TO_WEEKDAY[dayOfWeek];

  // Verificar se é dia útil (configurado pelo dono)
  const isBusinessDay = businessDays.includes(currentDay);

  // Fora do horário se: não é dia útil OU hora fora do range
  const isOutsideTimeRange = currentTime < start || currentTime > end;
  const isOutsideHours = !isBusinessDay || isOutsideTimeRange;

  return { isOutsideHours, currentTime, currentDay, start, end };
}

/**
 * Obtém hora, minuto e dia da semana em um timezone específico.
 * Usa Intl.DateTimeFormat nativo (sem dependências externas).
 */
function getTimeInTimezone(date: Date, timezone: string): { hours: number; minutes: number; dayOfWeek: number } {
  try {
    // Usar Intl para obter partes da data no timezone correto
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hours = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    const minutes = Number(parts.find((p) => p.type === 'minute')?.value || '0');

    // Obter dia da semana via toLocaleDateString
    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
    const dayStr = dayFormatter.format(date);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dayOfWeek = dayMap[dayStr] ?? date.getDay();

    return { hours, minutes, dayOfWeek };
  } catch {
    // Fallback: timezone inválido, usar hora local do servidor
    return {
      hours: date.getHours(),
      minutes: date.getMinutes(),
      dayOfWeek: date.getDay(),
    };
  }
}
