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
  maxResults: 500
};
