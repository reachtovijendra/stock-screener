/**
 * Production environment configuration
 * Used for Vercel deployment
 */
export const environment = {
  production: true,
  
  /** Base URL for API calls - uses relative path for same-origin deployment */
  apiBaseUrl: '',
  
  /** Cache TTL in milliseconds (5 minutes) */
  cacheTtlMs: 5 * 60 * 1000,
  
  /** Enable debug logging */
  debug: false,
  
  /** Default market on app load */
  defaultMarket: 'US' as const,
  
  /** Default page size for results */
  defaultPageSize: 50,
  
  /** Maximum results per request */
  maxResults: 500,

  /** Supabase (public keys — safe for frontend) */
  supabaseUrl: 'https://cbvfjicmcwuwmcchwwbw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNidmZqaWNtY3d1d21jY2h3d2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMDA2NzcsImV4cCI6MjA5MDU3NjY3N30.xYvt9FmnhaXWQkQVPWqYkVTQa067oG04t0W373L4WyM',
};
