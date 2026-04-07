/**
 * Development environment configuration
 * Used for local development
 */
export const environment = {
  production: false,
  
  /** Base URL for API calls - local development server */
  apiBaseUrl: 'http://localhost:3000',
  
  /** Cache TTL in milliseconds (1 minute for faster iteration) */
  cacheTtlMs: 1 * 60 * 1000,
  
  /** Enable debug logging */
  debug: true,
  
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
