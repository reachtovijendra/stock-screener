import { Market } from './stock.model';

export type PaperTradeAction = 'BUY' | 'SELL';

export interface PaperAccount {
  id?: string;
  user_id?: string;
  market: Market;
  starting_cash: number;
  cash_balance: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaperPosition {
  id?: string;
  user_id?: string;
  market: Market;
  symbol: string;
  name: string | null;
  quantity: number;
  average_cost: number;
  updated_at?: string;
  currentPrice?: number | null;
}

export interface PaperTrade {
  id?: string;
  user_id?: string;
  market: Market;
  symbol: string;
  name: string | null;
  action: PaperTradeAction;
  quantity: number;
  execution_price: number;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  executed_at: string;
}

export interface PaperOrder {
  action: PaperTradeAction;
  symbol: string;
  name: string | null;
  quantity: number;
  execution_price: number;
}

export interface PaperTradingSummary {
  cashBalance: number;
  marketValue: number;
  totalEquity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalReturnPercent: number;
}
