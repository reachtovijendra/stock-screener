import { Injectable, signal, effect } from '@angular/core';
import { Router } from '@angular/router';

const STORAGE_KEY_VERSION = 'stock-screener-version';

export type AppVersion = 'v1' | 'v2';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private _version = signal<AppVersion>(this.loadSavedVersion());
  public version = this._version.asReadonly();

  public isV2 = () => this._version() === 'v2';

  constructor(private router: Router) {
    effect(() => {
      const version = this._version();
      this.saveVersion(version);
    });
  }

  setVersion(version: AppVersion): void {
    this._version.set(version);
  }

  toggleVersion(): void {
    const newVersion = this._version() === 'v1' ? 'v2' : 'v1';
    this._version.set(newVersion);
    this.navigateToCurrentPageInNewVersion(newVersion);
  }

  getRoute(basePath: string): string {
    const version = this._version();
    if (version === 'v2') {
      if (basePath === '/' || basePath === '') {
        return '/v2/screener';
      }
      return `/v2${basePath}`;
    }
    return basePath === '' ? '/' : basePath;
  }

  getScreenerRoute(): string {
    return this._version() === 'v2' ? '/v2/screener' : '/';
  }

  getBreakoutsRoute(): string {
    return this._version() === 'v2' ? '/v2/breakouts' : '/breakouts';
  }

  getNewsRoute(): string {
    return this._version() === 'v2' ? '/v2/news' : '/news';
  }

  getDmaRoute(): string {
    return this._version() === 'v2' ? '/v2/dma-simulator' : '/dma-simulator';
  }

  getStockRoute(symbol: string): string {
    return this._version() === 'v2' ? `/v2/stock/${symbol}` : `/stock/${symbol}`;
  }

  private navigateToCurrentPageInNewVersion(newVersion: AppVersion): void {
    const currentUrl = this.router.url;
    let newUrl: string;

    if (newVersion === 'v2') {
      if (currentUrl === '/' || currentUrl === '/screener') {
        newUrl = '/v2/screener';
      } else if (currentUrl.startsWith('/stock/')) {
        newUrl = currentUrl.replace('/stock/', '/v2/stock/');
      } else if (!currentUrl.startsWith('/v2')) {
        newUrl = `/v2${currentUrl}`;
      } else {
        newUrl = currentUrl;
      }
    } else {
      if (currentUrl === '/v2/screener') {
        newUrl = '/';
      } else if (currentUrl.startsWith('/v2/stock/')) {
        newUrl = currentUrl.replace('/v2/stock/', '/stock/');
      } else if (currentUrl.startsWith('/v2/')) {
        newUrl = currentUrl.replace('/v2', '');
      } else {
        newUrl = currentUrl;
      }
    }

    this.router.navigateByUrl(newUrl);
  }

  private loadSavedVersion(): AppVersion {
    if (typeof window === 'undefined') {
      return 'v2';
    }
    const saved = localStorage.getItem(STORAGE_KEY_VERSION);
    if (saved === 'v1' || saved === 'v2') {
      return saved;
    }
    return 'v2'; // Default to v2
  }

  private saveVersion(version: AppVersion): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_VERSION, version);
    }
  }
}
