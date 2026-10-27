export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }
export type Row = Record<string, unknown> & { id: string | number; version?: string }
export type Field = { name: string; label: string; precision?: 2; kind?: 'text' | 'textarea' | 'number' | 'date' | 'email' | 'url' | 'boolean' | 'select' | 'file' | 'lookup'; lookup?: 'users' | 'providers' | 'benefits'; lookupQuery?: string; options?: readonly (readonly [string, string])[]; required?: boolean; createOnly?: boolean; editOnly?: boolean }
export type Filter = { name: string; label: string; options: readonly (readonly [string, string])[] }
export type Resource = { key: string; title: string; singular: string; columns: readonly string[]; fields?: readonly Field[]; filters?: readonly Filter[]; detail?: readonly string[]; description?: string }

export type DashboardData = {
  counts: Record<string, number>
  queues: Record<string, number>
  settings: { catalog_enabled: boolean; pickup_enabled: boolean; pickup_configured: boolean; base_reward: number; target_visits: number; payment_provider: string }
  recent_activity: Row[]
  refreshed_at: string
}

export type SiteSettings = {
  site_name: string; home_title: string; home_description: string; footer_text: string
  contact_email: string; whatsapp_url: string; instagram_url: string
}
