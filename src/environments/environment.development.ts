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
  maxResults: 500
};
