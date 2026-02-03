import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/screener/screener.component').then(m => m.ScreenerComponent),
    title: 'Stock Screener'
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
