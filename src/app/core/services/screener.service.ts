import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject, switchMap, tap, catchError, debounceTime, distinctUntilChanged } from 'rxjs';
import { Stock, Market } from '../models/stock.model';
import { 
  ScreenerFilters, 
  ScreenResult, 
  SortConfig, 
  PaginationConfig,
  getDefaultFilters,
  FilterPreset,
  FILTER_PRESETS
} from '../models/filter.model';
import { environment } from '../../../environments/environment';

/**
 * Service for stock screening functionality
 * Manages filter state, pagination, sorting, and API calls
 */
@Injectable({
  providedIn: 'root'
})
export class ScreenerService {
  private http = inject(HttpClient);
  
  // Filter state
  private _filters = signal<ScreenerFilters>(getDefaultFilters(environment.defaultMarket));
  public filters = this._filters.asReadonly();
  
  // Results state - current page
  private _results = signal<Stock[]>([]);
  public results = this._results.asReadonly();
  
  // Cache for all stocks from last API call (for client-side pagination)
  private _cachedStocks = signal<Stock[]>([]);
  
  // Filtered stocks (subset of cached when technical filters active)
  private _filteredStocks = signal<Stock[]>([]);
  
  private _totalCount = signal<number>(0);
  public totalCount = this._totalCount.asReadonly();
  
  // Loading state
  private _loading = signal<boolean>(false);
  public loading = this._loading.asReadonly();
  
  // Error state
  private _error = signal<string | null>(null);
  public error = this._error.asReadonly();
  
  // Pagination state
  private _pagination = signal<PaginationConfig>({
    page: 0,
    pageSize: environment.defaultPageSize,
    totalRecords: 0
  });
  public pagination = this._pagination.asReadonly();
  
  // Sort state
  private _sort = signal<SortConfig>({
    field: 'marketCap',
    direction: 'desc'
  });
  public sort = this._sort.asReadonly();
  
  // Execution time for performance tracking
  private _executionTime = signal<number>(0);
  public executionTime = this._executionTime.asReadonly();
  
  // Technical filter state
  private _rsiFilter = signal<'oversold' | 'overbought' | null>(null);
  public rsiFilter = this._rsiFilter.asReadonly();
  
  private _macdFilter = signal<'bullish' | 'bearish' | null>(null);

  // Column filter state
  private _sectorFilter = signal<string[]>([]);
  public sectorFilter = this._sectorFilter.asReadonly();
  
  private _industryFilter = signal<string[]>([]);
  public industryFilter = this._industryFilter.asReadonly();
  public macdFilter = this._macdFilter.asReadonly();
  
  private _calculatingTechnicals = signal<boolean>(false);
  public calculatingTechnicals = this._calculatingTechnicals.asReadonly();
  
  private _technicalProgress = signal<string>('');
  public technicalProgress = this._technicalProgress.asReadonly();
  
  // Track if technicals have been calculated for cached stocks
  private _technicalsCalculated = false;
  
  // Computed: Active filter count for UI badge
  public activeFilterCount = computed(() => {
    const f = this._filters();
    let count = 0;
    
    if (f.marketCap.categories.length > 0 || f.marketCap.customRange.min !== undefined || f.marketCap.customRange.max !== undefined) count++;
    if (f.price.min !== undefined || f.price.max !== undefined) count++;
    if (f.fiftyTwoWeek.percentFromHigh.min !== undefined || f.fiftyTwoWeek.percentFromHigh.max !== undefined) count++;
    if (f.fiftyTwoWeek.nearHigh || f.fiftyTwoWeek.nearLow) count++;
    if (f.peRatio.min !== undefined || f.peRatio.max !== undefined) count++;
    if (f.forwardPeRatio.min !== undefined || f.forwardPeRatio.max !== undefined) count++;
    if (f.pbRatio.min !== undefined || f.pbRatio.max !== undefined) count++;
    if (f.earningsGrowth.min !== undefined || f.earningsGrowth.max !== undefined) count++;
    if (f.revenueGrowth.min !== undefined || f.revenueGrowth.max !== undefined) count++;
    if (f.dividendYield.min !== undefined || f.dividendYield.max !== undefined) count++;
    if (f.avgVolume.min !== undefined || f.avgVolume.max !== undefined) count++;
    if (f.relativeVolume.min !== undefined || f.relativeVolume.max !== undefined) count++;
    if (f.movingAverages.aboveFiftyDayMA !== null || f.movingAverages.aboveTwoHundredDayMA !== null) count++;
    if (f.movingAverages.goldenCross || f.movingAverages.deathCross) count++;
    if (f.sectors.length > 0) count++;
    if (f.exchanges.length > 0) count++;
    
    return count;
  });

  /**
   * Get available filter presets
   */
  getPresets(): FilterPreset[] {
    return FILTER_PRESETS;
  }

  /**
   * Apply a preset filter configuration
   */
  applyPreset(presetId: string): void {
    const preset = FILTER_PRESETS.find(p => p.id === presetId);
    if (!preset) {
      console.warn(`Preset not found: ${presetId}`);
      return;
    }
    
    const currentMarket = this._filters().market;
    const newFilters: ScreenerFilters = {
      ...getDefaultFilters(currentMarket),
      ...preset.filters,
      market: currentMarket
    };
    
    this._filters.set(newFilters);
    this.resetPagination();
    this.runScreen();
  }

  /**
   * Update filters and optionally trigger screen
   */
  updateFilters(partialFilters: Partial<ScreenerFilters>, runScreen: boolean = true): void {
    this._filters.update(current => ({
      ...current,
      ...partialFilters
    }));
    
    if (runScreen) {
      this.resetPagination();
      this.runScreen();
    }
  }

  /**
   * Reset all filters to default
   */
  resetFilters(): void {
    const market = this._filters().market;
    this._filters.set(getDefaultFilters(market));
    this.resetPagination();
    this._results.set([]);
    this._cachedStocks.set([]);
    this._totalCount.set(0);
  }

  /**
   * Change market and reset filters
   */
  setMarket(market: Market): void {
    this._filters.set(getDefaultFilters(market));
    this.resetPagination();
    this._results.set([]);
    this._cachedStocks.set([]);
    this._totalCount.set(0);
  }

  /**
   * Update sort configuration - uses cached/filtered data
   */
  setSort(sort: SortConfig): void {
    this._sort.set(sort);
    
    // Determine which data set to use
    const hasFilters = this._rsiFilter() || this._macdFilter();
    const dataToSort = hasFilters && this._filteredStocks().length > 0 
      ? this._filteredStocks() 
      : this._cachedStocks();
    
    if (dataToSort.length > 0) {
      this._pagination.update(p => ({ ...p, page: 0 })); // Reset to first page on sort
      this.paginateFromSource(dataToSort);
    }
  }

  /**
   * Update pagination - uses cached/filtered data for client-side pagination
   */
  setPagination(page: number, pageSize?: number): void {
    const current = this._pagination();
    const newPageSize = pageSize ?? current.pageSize;
    
    // Guard: Only update if values actually changed
    if (current.page === page && current.pageSize === newPageSize) {
      return;
    }
    
    this._pagination.update(p => ({
      ...p,
      page,
      pageSize: newPageSize
    }));
    
    // Use correct source for pagination (filtered or all cached)
    this.paginateFromCache();
  }
  
  /**
   * Paginate from cached stocks (client-side)
   */
  private paginateFromCache(): void {
    // Start with base data source
    let source: Stock[];
    
    // Use filtered stocks if technical filters are active
    const hasTechFilters = this._rsiFilter() || this._macdFilter();
    if (hasTechFilters && this._filteredStocks().length > 0) {
      source = this._filteredStocks();
    } else {
      source = this._cachedStocks();
    }
    
    // Apply column filters
    if (this._sectorFilter().length > 0) {
      source = source.filter(s => this._sectorFilter().includes(s.sector));
    }
    if (this._industryFilter().length > 0) {
      source = source.filter(s => this._industryFilter().includes(s.industry));
    }
    
    this.paginateFromSource(source);
  }
  
  /**
   * Paginate from a specific source array
   */
  private paginateFromSource(stocks: Stock[]): void {
    if (stocks.length === 0) {
      return;
    }
    
    const { page, pageSize } = this._pagination();
    const start = page * pageSize;
    const end = start + pageSize;
    
    // Sort data
    const sorted = this.sortStocks(stocks);
    const pageResults = sorted.slice(start, end);
    
    this._results.set(pageResults);
  }
  
  /**
   * Sort stocks array by current sort config
   */
  private sortStocks(stocks: Stock[]): Stock[] {
    const { field, direction } = this._sort();
    
    return [...stocks].sort((a, b) => {
      let aVal = (a as any)[field];
      let bVal = (b as any)[field];
      
      // Handle null/undefined
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      // String comparison
      if (typeof aVal === 'string') {
        return direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      // Numeric comparison
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  /**
   * Reset pagination to first page
   */
  private resetPagination(): void {
    this._pagination.update(current => ({
      ...current,
      page: 0
    }));
  }

  /**
   * Execute the screen with current filters - fetches ALL results and caches them
   */
  runScreen(): void {
    this._loading.set(true);
    this._error.set(null);
    
    // Clear cache and reset all filter states
    this._cachedStocks.set([]);
    this._filteredStocks.set([]);
    this._technicalsCalculated = false;
    this._rsiFilter.set(null);
    this._macdFilter.set(null);
    this._sectorFilter.set([]);
    this._industryFilter.set([]);
    
    const startTime = performance.now();
    
    // Fetch ALL results (large page size, no pagination)
    const requestBody = {
      filters: this._filters(),
      sort: this._sort(),
      pagination: {
        page: 0,
        pageSize: 10000 // Large number to get all results
      }
    };
    
    this.http.post<ScreenResult>('/api/stocks?action=screen', requestBody).pipe(
      tap(result => {
        // Cache all stocks for client-side pagination
        this._cachedStocks.set(result.stocks);
        this._totalCount.set(result.totalCount);
        
        // Reset to first page
        this._pagination.update(current => ({
          ...current,
          page: 0,
          totalRecords: result.totalCount
        }));
        
        // Display first page from cache
        this.paginateFromCache();
        
        this._executionTime.set(performance.now() - startTime);
        this._loading.set(false);
        
        if (environment.debug) {
          console.log('Screen results:', {
            cached: this._cachedStocks().length,
            total: result.totalCount,
            executionTime: this._executionTime()
          });
        }
        
        // Automatically calculate technicals for all stocks in background
        this.calculateTechnicalsForAllStocks();
      }),
      catchError(error => {
        this._loading.set(false);
        this._error.set(error.message || 'An error occurred while screening stocks');
        this._results.set([]);
        this._cachedStocks.set([]);
        this._totalCount.set(0);
        console.error('Screen error:', error);
        return of(null);
      })
    ).subscribe();
  }

  /**
   * Export current results to CSV
   */
  exportToCsv(): void {
    const stocks = this._results();
    if (stocks.length === 0) {
      return;
    }
    
    const headers = [
      'Symbol', 'Name', 'Price', 'Change', 'Change %', 'Market Cap',
      'P/E Ratio', 'Forward P/E', 'EPS', '52W High', '52W Low',
      '% From High', 'Volume', 'Avg Volume', 'Sector', 'Industry'
    ];
    
    const rows = stocks.map(stock => [
      stock.symbol,
      `"${stock.name}"`,
      stock.price,
      stock.change,
      stock.changePercent.toFixed(2),
      stock.marketCap,
      stock.peRatio ?? '',
      stock.forwardPeRatio ?? '',
      stock.eps ?? '',
      stock.fiftyTwoWeekHigh,
      stock.fiftyTwoWeekLow,
      stock.percentFromFiftyTwoWeekHigh.toFixed(2),
      stock.volume,
      stock.avgVolume,
      stock.sector,
      stock.industry
    ]);
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-screen-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Get all cached stocks (for search/autocomplete)
   */
  getAllCachedStocks(): Stock[] {
    return this._cachedStocks();
  }

  /**
   * Alias for getAllCachedStocks - returns cached stocks for computed properties
   */
  getCachedStocks(): Stock[] {
    return this._cachedStocks();
  }

  /**
   * Set sector filter and refresh results
   */
  setSectorFilter(sectors: string[]): void {
    this._sectorFilter.set(sectors);
    this.applyColumnFilters();
  }

  /**
   * Set industry filter and refresh results
   */
  setIndustryFilter(industries: string[]): void {
    this._industryFilter.set(industries);
    this.applyColumnFilters();
  }

  /**
   * Clear all column filters
   */
  clearColumnFilters(): void {
    this._sectorFilter.set([]);
    this._industryFilter.set([]);
    this.applyColumnFilters();
  }

  /**
   * Apply column filters to cached stocks and update results
   */
  private applyColumnFilters(): void {
    let source = this._cachedStocks();
    
    // Apply technical filters first if active
    if (this._rsiFilter() || this._macdFilter()) {
      source = this._filteredStocks().length > 0 ? this._filteredStocks() : source;
    }
    
    // Apply sector filter
    if (this._sectorFilter().length > 0) {
      source = source.filter(s => this._sectorFilter().includes(s.sector));
    }
    
    // Apply industry filter
    if (this._industryFilter().length > 0) {
      source = source.filter(s => this._industryFilter().includes(s.industry));
    }
    
    // Update total and paginate
    this._totalCount.set(source.length);
    this._pagination.update(p => ({
      ...p,
      page: 0,
      totalRecords: source.length
    }));
    
    this.paginateFromSource(source);
  }

  /**
   * Show a single stock directly (for stocks found via search)
   * This bypasses cache and shows the stock immediately
   */
  showSearchedStock(stock: Stock): void {
    // Add to cache if not exists
    const cached = this._cachedStocks();
    const exists = cached.some(s => s.symbol === stock.symbol);
    if (!exists) {
      this._cachedStocks.set([stock, ...cached]);
    }
    
    // Update state to show this stock
    const newTotal = Math.max(1, this._cachedStocks().length);
    this._totalCount.set(newTotal);
    
    this._pagination.set({
      page: 0,
      pageSize: this._pagination().pageSize,
      totalRecords: newTotal
    });
    
    // Always show the searched stock directly in results
    this._results.set([stock]);
    
    // Clear any loading/error state
    this._loading.set(false);
    this._error.set(null);
  }
  
  /**
   * Add a stock to cache (legacy method, use showSearchedStock instead)
   */
  addStockToCache(stock: Stock): void {
    this.showSearchedStock(stock);
  }

  /**
   * Get summary statistics for current data (respects filters)
   */
  getResultsSummary = computed(() => {
    // Use filtered stocks if technical filters are active, otherwise cached stocks
    const hasFilters = this._rsiFilter() || this._macdFilter();
    let stocks: Stock[];
    
    if (hasFilters && this._filteredStocks().length > 0) {
      stocks = this._filteredStocks();
    } else if (this._cachedStocks().length > 0) {
      stocks = this._cachedStocks();
    } else {
      stocks = this._results();
    }
    
    if (stocks.length === 0) {
      return null;
    }
    
    const validPE = stocks.filter(s => s.peRatio !== null && s.peRatio !== undefined).map(s => s.peRatio!);
    const validMarketCap = stocks.filter(s => s.marketCap !== null && s.marketCap !== undefined).map(s => s.marketCap!);
    
    const gainers = stocks.filter(s => s.changePercent != null && s.changePercent > 0).length;
    const losers = stocks.filter(s => s.changePercent != null && s.changePercent < 0).length;
    
    return {
      count: stocks.length,
      totalMarketCap: validMarketCap.length > 0 ? validMarketCap.reduce((sum, mc) => sum + mc, 0) : 0,
      avgPE: validPE.length > 0 ? validPE.reduce((sum, pe) => sum + pe, 0) / validPE.length : null,
      medianPE: validPE.length > 0 ? this.median(validPE) : null,
      gainers,
      losers,
      unchanged: stocks.length - gainers - losers
    };
  });

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Toggle RSI filter and apply to all cached stocks
   */
  async toggleRsiFilter(zone: 'oversold' | 'overbought'): Promise<void> {
    // Toggle the filter
    if (this._rsiFilter() === zone) {
      this._rsiFilter.set(null);
    } else {
      this._rsiFilter.set(zone);
    }
    
    await this.applyTechnicalFilters();
  }

  /**
   * Toggle MACD filter and apply to all cached stocks
   */
  async toggleMacdFilter(signal: 'bullish' | 'bearish'): Promise<void> {
    // Toggle the filter
    if (this._macdFilter() === signal) {
      this._macdFilter.set(null);
    } else {
      this._macdFilter.set(signal);
    }
    
    await this.applyTechnicalFilters();
  }

  /**
   * Clear all technical filters
   */
  clearTechnicalFilters(): void {
    this._rsiFilter.set(null);
    this._macdFilter.set(null);
    this._filteredStocks.set([]);
    
    // Reset to show all cached stocks
    this._totalCount.set(this._cachedStocks().length);
    this._pagination.update(p => ({
      ...p,
      page: 0,
      totalRecords: this._cachedStocks().length
    }));
    this.paginateFromCache();
  }

  /**
   * Apply technical filters to cached stocks
   * Calculates technicals if not already done
   */
  private async applyTechnicalFilters(): Promise<void> {
    if (this._cachedStocks().length === 0) return;
    
    const hasFilters = this._rsiFilter() || this._macdFilter();
    
    // If no filters, clear filtered stocks and show all cached
    if (!hasFilters) {
      this._filteredStocks.set([]);
      this._totalCount.set(this._cachedStocks().length);
      this._pagination.update(p => ({
        ...p,
        page: 0,
        totalRecords: this._cachedStocks().length
      }));
      this.paginateFromCache();
      return;
    }
    
    // Calculate technicals if not already done
    if (!this._technicalsCalculated) {
      await this.calculateTechnicalsForAllStocks();
    }
    
    // Apply filters to all cached stocks
    let filtered = [...this._cachedStocks()];
    
    if (this._rsiFilter()) {
      const zone = this._rsiFilter();
      filtered = filtered.filter(stock => {
        if (stock.rsi == null) return false;
        if (zone === 'oversold') return stock.rsi < 30;
        if (zone === 'overbought') return stock.rsi > 70;
        return true;
      });
    }
    
    if (this._macdFilter()) {
      const signal = this._macdFilter();
      filtered = filtered.filter(stock => {
        if (stock.macdSignalType == null) return false;
        if (signal === 'bullish') {
          return stock.macdSignalType === 'bullish' || 
                 stock.macdSignalType === 'bullish_crossover' || 
                 stock.macdSignalType === 'strong_bullish';
        }
        if (signal === 'bearish') {
          return stock.macdSignalType === 'bearish' || 
                 stock.macdSignalType === 'bearish_crossover' || 
                 stock.macdSignalType === 'strong_bearish';
        }
        return true;
      });
    }
    
    // Store filtered results
    this._filteredStocks.set(filtered);
    
    // Update state with filtered results
    this._totalCount.set(filtered.length);
    this._pagination.update(p => ({
      ...p,
      page: 0,
      totalRecords: filtered.length
    }));
    
    // Sort and paginate filtered results
    this.paginateFromSource(filtered);
  }

  /**
   * Calculate technicals for all cached stocks via bulk API
   */
  private async calculateTechnicalsForAllStocks(): Promise<void> {
    const cached = this._cachedStocks();
    if (cached.length === 0) return;
    
    this._calculatingTechnicals.set(true);
    this._technicalProgress.set(`0/${cached.length}`);
    
    // Send all symbols in chunks to the bulk endpoint
    const chunkSize = 500; // Process 500 at a time for progress updates
    const allSymbols = cached.map(s => s.symbol);
    
    for (let i = 0; i < allSymbols.length; i += chunkSize) {
      const chunkSymbols = allSymbols.slice(i, i + chunkSize);
      
      try {
        // Bulk API call - server handles parallel processing
        const result = await this.http.post<{ technicals: Record<string, any> }>(
          '/api/stocks?action=technicals',
          { symbols: chunkSymbols }
        ).toPromise();
        
        // Update cached stocks with technical data
        if (result?.technicals) {
          this._cachedStocks.update(stocks => {
            const updated = [...stocks];
            for (const [symbol, data] of Object.entries(result.technicals)) {
              const idx = updated.findIndex(s => s.symbol === symbol);
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  rsi: (data as any).rsi,
                  macdLine: (data as any).macdLine,
                  macdSignal: (data as any).macdSignal,
                  macdHistogram: (data as any).macdHistogram,
                  macdSignalType: (data as any).macdSignalType
                };
              }
            }
            return updated;
          });
        }
      } catch (error) {
        console.error(`Error fetching technicals:`, error);
      }
      
      this._technicalProgress.set(`${Math.min(i + chunkSize, allSymbols.length)}/${allSymbols.length}`);
    }
    
    this._technicalsCalculated = true;
    this._calculatingTechnicals.set(false);
    this._technicalProgress.set('');
    
    // Refresh displayed results to show calculated technicals
    this.paginateFromCache();
  }
}
