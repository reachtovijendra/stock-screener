import { Market } from './stock.model';

export interface PortfolioTargetEntry {
  id?: string;
  user_id?: string;
  market?: Market;
  year: number;
  month: number;
  investment: number;
  added: number;
  principal: number;
  total_investment: number;
  return_percent: number;
  profit: number;
  total: number;
}

export interface PortfolioActualEntry {
  id?: string;
  user_id?: string;
  market?: Market;
  year: number;
  month: number;
  investment: number;
  added: number;
  principal: number;
  total_investment: number;
  return_percent: number;
  profit: number;
  total: number;
}
