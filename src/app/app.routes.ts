import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/screener/screener.component').then(m => m.ScreenerComponent),
    title: 'Stock Screener'
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
    path: 'stock/:symbol',
    loadComponent: () => import('./features/stock-detail/stock-detail.component').then(m => m.StockDetailComponent),
    title: 'Stock Details'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
