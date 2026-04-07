import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/screener/screener.component').then(m => m.ScreenerComponent),
    title: 'Stock Screener'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent),
    title: 'Sign In - StockScreen'
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
    path: 'recommendations',
    loadComponent: () => import('./features/recommendations/recommendations.component').then(m => m.RecommendationsComponent),
    canActivate: [authGuard],
    title: 'Recommendations'
  },
  {
    path: 'watchlists',
    loadComponent: () => import('./features/watchlists/watchlists.component').then(m => m.WatchlistsComponent),
    canActivate: [authGuard],
    title: 'Watchlists'
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
    redirectTo: ''
  }
];
