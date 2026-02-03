import { Injectable, signal, computed, effect } from '@angular/core';
import { Market, MarketInfo, MARKETS } from '../models/stock.model';
import { environment } from '../../../environments/environment';

const STORAGE_KEY_MARKET = 'stock-screener-market';

/**
 * Service for managing market selection (US/India)
 * Persists selection to localStorage
 */
@Injectable({
  providedIn: 'root'
})
export class MarketService {
  // Current market signal
  private _currentMarket = signal<Market>(this.loadSavedMarket());
  public currentMarket = this._currentMarket.asReadonly();
  
  // Derived market info
  public marketInfo = computed<MarketInfo>(() => MARKETS[this._currentMarket()]);
  
  // Available markets
  public availableMarkets: MarketInfo[] = Object.values(MARKETS);
  
  constructor() {
    // Save market selection when it changes
    effect(() => {
      const market = this._currentMarket();
      this.saveMarket(market);
    });
  }

  /**
   * Switch to a different market
   */
  setMarket(market: Market): void {
    if (market !== this._currentMarket()) {
      this._currentMarket.set(market);
      
      if (environment.debug) {
        console.log('Market changed to:', market);
      }
    }
  }

  /**
   * Toggle between US and India markets
   */
  toggleMarket(): void {
    const current = this._currentMarket();
    this._currentMarket.set(current === 'US' ? 'IN' : 'US');
  }

  /**
   * Get info for a specific market
   */
  getMarketInfo(market: Market): MarketInfo {
    return MARKETS[market];
  }

  /**
   * Check if market is currently open
   */
  isMarketOpen(market?: Market): boolean {
    const targetMarket = market ?? this._currentMarket();
    const info = MARKETS[targetMarket];
    
    // Get current time in market timezone
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      timeZone: info.tradingHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    const weekday = parts.find(p => p.type === 'weekday')?.value;
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    
    // Check if weekend
    if (weekday === 'Sat' || weekday === 'Sun') {
      return false;
    }
    
    // Parse trading hours
    const [openHour, openMinute] = info.tradingHours.open.split(':').map(Number);
    const [closeHour, closeMinute] = info.tradingHours.close.split(':').map(Number);
    
    const currentMinutes = hour * 60 + minute;
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;
    
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }

  /**
   * Get time until market opens/closes
   */
  getMarketStatusMessage(market?: Market): string {
    const targetMarket = market ?? this._currentMarket();
    const info = MARKETS[targetMarket];
    const isOpen = this.isMarketOpen(targetMarket);
    
    if (isOpen) {
      return `${info.name} market is open`;
    } else {
      return `${info.name} market is closed`;
    }
  }

  /**
   * Format a number as currency for the current market
   */
  formatCurrency(value: number, market?: Market): string {
    const targetMarket = market ?? this._currentMarket();
    const info = MARKETS[targetMarket];
    
    return new Intl.NumberFormat(targetMarket === 'US' ? 'en-US' : 'en-IN', {
      style: 'currency',
      currency: info.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  /**
   * Format large numbers with appropriate suffixes
   */
  formatMarketCap(value: number | null | undefined, market?: Market): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    
    const targetMarket = market ?? this._currentMarket();
    const info = MARKETS[targetMarket];
    
    if (targetMarket === 'IN') {
      // Indian numbering system
      if (value >= 1e12) {
        return `${info.currencySymbol}${(value / 1e12).toFixed(2)} L Cr`;
      } else if (value >= 1e10) {
        return `${info.currencySymbol}${(value / 1e10).toFixed(2)} K Cr`;
      } else if (value >= 1e7) {
        return `${info.currencySymbol}${(value / 1e7).toFixed(2)} Cr`;
      } else if (value >= 1e5) {
        return `${info.currencySymbol}${(value / 1e5).toFixed(2)} L`;
      }
    } else {
      // Western numbering system
      if (value >= 1e12) {
        return `${info.currencySymbol}${(value / 1e12).toFixed(2)}T`;
      } else if (value >= 1e9) {
        return `${info.currencySymbol}${(value / 1e9).toFixed(2)}B`;
      } else if (value >= 1e6) {
        return `${info.currencySymbol}${(value / 1e6).toFixed(2)}M`;
      }
    }
    
    return `${info.currencySymbol}${value.toLocaleString()}`;
  }

  /**
   * Format volume numbers
   */
  formatVolume(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (value >= 1e9) {
      return `${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
      return `${(value / 1e6).toFixed(2)}M`;
    } else if (value >= 1e3) {
      return `${(value / 1e3).toFixed(1)}K`;
    }
    return value.toLocaleString();
  }

  /**
   * Load saved market from localStorage
   */
  private loadSavedMarket(): Market {
    if (typeof window === 'undefined') {
      return environment.defaultMarket;
    }
    
    const saved = localStorage.getItem(STORAGE_KEY_MARKET);
    if (saved === 'US' || saved === 'IN') {
      return saved;
    }
    
    return environment.defaultMarket;
  }

  /**
   * Save market selection to localStorage
   */
  private saveMarket(market: Market): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_MARKET, market);
    }
  }
}
