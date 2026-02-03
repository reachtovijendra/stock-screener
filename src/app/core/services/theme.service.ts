import { Injectable, signal, effect } from '@angular/core';

const STORAGE_KEY_THEME = 'stock-screener-theme';

export type Theme = 'dark' | 'light';

/**
 * Service for managing dark/light theme
 * Persists preference to localStorage
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Theme signal - defaults to dark
  private _theme = signal<Theme>(this.loadSavedTheme());
  public theme = this._theme.asReadonly();
  
  // Computed dark mode check
  public isDark = () => this._theme() === 'dark';

  constructor() {
    // Apply theme changes to DOM and save to storage
    effect(() => {
      const theme = this._theme();
      this.applyTheme(theme);
      this.saveTheme(theme);
    });
    
    // Apply initial theme
    this.applyTheme(this._theme());
  }

  /**
   * Set theme explicitly
   */
  setTheme(theme: Theme): void {
    this._theme.set(theme);
  }

  /**
   * Toggle between dark and light themes
   */
  toggleTheme(): void {
    this._theme.update(current => current === 'dark' ? 'light' : 'dark');
  }

  /**
   * Apply theme class to document
   */
  private applyTheme(theme: Theme): void {
    if (typeof document === 'undefined') {
      return;
    }
    
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark-mode');
    } else {
      root.classList.remove('dark-mode');
    }
  }

  /**
   * Load saved theme from localStorage
   */
  private loadSavedTheme(): Theme {
    if (typeof window === 'undefined') {
      return 'dark'; // Default to dark
    }
    
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    
    // Check system preference, but default to dark for this app
    // const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // return prefersDark ? 'dark' : 'light';
    
    return 'dark'; // Default to dark mode
  }

  /**
   * Save theme to localStorage
   */
  private saveTheme(theme: Theme): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    }
  }
}
