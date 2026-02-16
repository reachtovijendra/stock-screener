import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, map, tap, catchError, shareReplay } from 'rxjs';
import { Stock, StockSearchResult, MarketIndex, Market, MARKET_INDICES } from '../models/stock.model';
import { environment } from '../../../environments/environment';

/**
 * Cache entry with timestamp for TTL management
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service for fetching stock data from the backend API
 * Implements caching to reduce API calls
 */
@Injectable({
  providedIn: 'root'
})
export class StockService {
  private http = inject(HttpClient);
  
  // Cache storage
  private quoteCache = new Map<string, CacheEntry<Stock>>();
  private searchCache = new Map<string, CacheEntry<StockSearchResult[]>>();
  private indexCache = new Map<string, CacheEntry<MarketIndex[]>>();
  
  // Loading states
  private _loading = signal(false);
  public loading = this._loading.asReadonly();
  
  // Error state
  private _error = signal<string | null>(null);
  public error = this._error.asReadonly();

  /**
   * Get a single stock quote by symbol
   */
  getQuote(symbol: string, market: Market): Observable<Stock> {
    const cacheKey = `${symbol}-${market}`;
    const cached = this.getFromCache(this.quoteCache, cacheKey);
    
    if (cached) {
      return of(cached);
    }
    
    this._loading.set(true);
    this._error.set(null);
    
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('market', market);
    
    return this.http.get<Stock>('/api/stocks', { params: params.set('action', 'quote') }).pipe(
      tap(stock => {
        this.setCache(this.quoteCache, cacheKey, stock);
        this._loading.set(false);
      }),
      catchError(error => {
        this._loading.set(false);
        this._error.set(error.message);
        throw error;
      })
    );
  }

  /**
   * Get multiple stock quotes in a batch
   */
  getQuotes(symbols: string[], market: Market): Observable<Stock[]> {
    // Check cache for each symbol
    const cached: Stock[] = [];
    const uncachedSymbols: string[] = [];
    
    symbols.forEach(symbol => {
      const cacheKey = `${symbol}-${market}`;
      const cachedStock = this.getFromCache(this.quoteCache, cacheKey);
      if (cachedStock) {
        cached.push(cachedStock);
      } else {
        uncachedSymbols.push(symbol);
      }
    });
    
    // If all cached, return immediately
    if (uncachedSymbols.length === 0) {
      return of(cached);
    }
    
    this._loading.set(true);
    this._error.set(null);
    
    const params = new HttpParams()
      .set('symbols', uncachedSymbols.join(','))
      .set('market', market);
    
    return this.http.get<Stock[]>('/api/stocks', { params: params.set('action', 'quote') }).pipe(
      tap(stocks => {
        stocks.forEach(stock => {
          const cacheKey = `${stock.symbol}-${market}`;
          this.setCache(this.quoteCache, cacheKey, stock);
        });
        this._loading.set(false);
      }),
      map(stocks => [...cached, ...stocks]),
      catchError(error => {
        this._loading.set(false);
        this._error.set(error.message);
        throw error;
      })
    );
  }

  /**
   * Search for stocks by name or symbol
   */
  searchStocks(query: string, market: Market): Observable<StockSearchResult[]> {
    if (!query || query.length < 1) {
      return of([]);
    }
    
    const cacheKey = `search-${query.toLowerCase()}-${market}`;
    const cached = this.getFromCache(this.searchCache, cacheKey);
    
    if (cached) {
      return of(cached);
    }
    
    const params = new HttpParams()
      .set('q', query)
      .set('market', market);
    
    return this.http.get<StockSearchResult[]>('/api/stocks', { params: params.set('action', 'search') }).pipe(
      tap(results => {
        this.setCache(this.searchCache, cacheKey, results);
      }),
      catchError(error => {
        console.error('Search error:', error);
        return of([]);
      })
    );
  }

  /**
   * Get market indices for a market
   */
  getMarketIndices(market: Market): Observable<MarketIndex[]> {
    const cacheKey = `indices-${market}`;
    const cached = this.getFromCache(this.indexCache, cacheKey);
    
    if (cached) {
      return of(cached);
    }
    
    const symbols = MARKET_INDICES[market];
    const params = new HttpParams()
      .set('symbols', symbols.join(','))
      .set('market', market);
    
    return this.http.get<MarketIndex[]>('/api/stocks', { params: params.set('action', 'indices') }).pipe(
      tap(indices => {
        this.setCache(this.indexCache, cacheKey, indices);
      }),
      catchError(error => {
        console.error('Error fetching indices:', error);
        return of([]);
      }),
      shareReplay(1)
    );
  }

  /**
   * Get stock symbol list for a market (for autocomplete/screening base)
   */
  getStockList(market: Market): Observable<StockSearchResult[]> {
    const cacheKey = `stocklist-${market}`;
    const cached = this.getFromCache(this.searchCache, cacheKey);
    
    if (cached) {
      return of(cached);
    }
    
    const params = new HttpParams().set('market', market);
    
    return this.http.get<StockSearchResult[]>('/api/stocks', { params: params.set('action', 'list') }).pipe(
      tap(stocks => {
        // Cache for longer (30 minutes) since this changes infrequently
        this.searchCache.set(cacheKey, {
          data: stocks,
          timestamp: Date.now()
        });
      }),
      shareReplay(1)
    );
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.quoteCache.clear();
    this.searchCache.clear();
    this.indexCache.clear();
    
    if (environment.debug) {
      console.log('Stock service cache cleared');
    }
  }

  /**
   * Clear cache for a specific symbol
   */
  clearSymbolCache(symbol: string, market: Market): void {
    const cacheKey = `${symbol}-${market}`;
    this.quoteCache.delete(cacheKey);
  }

  /**
   * Get cached data if not expired
   */
  private getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    const age = Date.now() - entry.timestamp;
    if (age > environment.cacheTtlMs) {
      cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set cache entry with current timestamp
   */
  private setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Prevent cache from growing too large
    if (cache.size > 1000) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
  }
}
