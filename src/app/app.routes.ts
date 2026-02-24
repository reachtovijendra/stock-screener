import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

const versionRedirectGuard = () => {
  const router = inject(Router);
  const savedVersion = localStorage.getItem('stock-screener-version') || 'v2';
  if (savedVersion === 'v2') {
    router.navigate(['/v2/screener']);
    return false;
  }
  return true;
};

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/screener/screener.component').then(m => m.ScreenerComponent),
    canActivate: [versionRedirectGuard],
    title: 'Stock Screener'
  },
  {
    path: 'v2/screener',
    loadComponent: () => import('./features/screener-v2/screener-v2.component').then(m => m.ScreenerV2Component),
    title: 'Stock Screener V2'
  },
  {
    path: 'v2/news',
    loadComponent: () => import('./features/market-news-v2/market-news-v2.component').then(m => m.MarketNewsV2Component),
    title: 'Market News V2'
  },
  {
    path: 'v2/breakouts',
    loadComponent: () => import('./features/breakouts-v2/breakouts-v2.component').then(m => m.BreakoutsV2Component),
    title: 'Technical Breakouts V2'
  },
  {
    path: 'v2/dma-simulator',
    loadComponent: () => import('./features/dma-simulator-v2/dma-simulator-v2.component').then(m => m.DmaSimulatorV2Component),
    title: 'DMA Simulator V2'
  },
  {
    path: 'v2/stock/:symbol',
    loadComponent: () => import('./features/stock-detail-v2/stock-detail-v2.component').then(m => m.StockDetailV2Component),
    title: 'Stock Details V2'
  },
  {
    path: 'news',
    loadComponent: () => import('./features/market-news/market-news.component').then(m => m.MarketNewsComponent),
    title: 'Market News'
  },
  {
    path: 'breakouts',
    loadComponent: () => import('./features/breakouts/breakouts.component').then(m => m.BreakoutsComponent),
    title: 'Technical Breakouts'
  },
  {
    path: 'dma-simulator',
    loadComponent: () => import('./features/dma-simulator/dma-simulator.component').then(m => m.DmaSimulatorComponent),
    title: 'DMA Simulator'
  },
  {
    path: 'stock/:symbol',
    loadComponent: () => import('./features/stock-detail/stock-detail.component').then(m => m.StockDetailComponent),
    title: 'Stock Details'
  },
  {
    path: '**',
    redirectTo: 'v2/screener'
  }
];
