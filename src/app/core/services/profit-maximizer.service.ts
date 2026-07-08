import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import type { BrokerTransaction } from '../utils/transaction-parser';

export interface ProfitMaximizerUpload {
  fileName: string;
  broker: string;
  uploadedAt: string;      // ISO
  transactions: BrokerTransaction[];
  ltTaxRate: number;       // long-term capital gains %
  stTaxRate: number;       // short-term capital gains %
}

export const DEFAULT_LT_TAX_RATE = 15;
export const DEFAULT_ST_TAX_RATE = 24;

/**
 * Persists a user's uploaded brokerage transactions to Supabase (one row per
 * user, replaced on each new upload) so the Profit Maximizer view is available
 * every day and across devices. Row-level security scopes rows to the user.
 */
@Injectable({ providedIn: 'root' })
export class ProfitMaximizerService {
  private auth = inject(AuthService);
  private get db() { return this.auth.supabaseClient; }

  /** Loads the current user's saved upload, or null if none / not signed in. */
  async load(): Promise<ProfitMaximizerUpload | null> {
    const user = this.auth.user();
    if (!user) return null;

    const { data, error } = await this.db
      .from('profit_maximizer_uploads')
      .select('file_name, broker, uploaded_at, transactions, lt_tax_rate, st_tax_rate')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw new Error(`Failed to load holdings: ${error.message}`);
    if (!data) return null;

    return {
      fileName: data.file_name ?? '',
      broker: data.broker ?? 'CSV',
      uploadedAt: data.uploaded_at ?? new Date().toISOString(),
      transactions: (data.transactions ?? []) as BrokerTransaction[],
      ltTaxRate: data.lt_tax_rate ?? DEFAULT_LT_TAX_RATE,
      stTaxRate: data.st_tax_rate ?? DEFAULT_ST_TAX_RATE,
    };
  }

  /** Updates just the tax rates on the user's existing row (no-op if none). */
  async saveTaxRates(ltTaxRate: number, stTaxRate: number): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    const { error } = await this.db
      .from('profit_maximizer_uploads')
      .update({ lt_tax_rate: ltTaxRate, st_tax_rate: stTaxRate, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) throw new Error(`Failed to save tax rates: ${error.message}`);
  }

  /** Saves (replaces) the user's upload. */
  async save(upload: ProfitMaximizerUpload): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('Please sign in to save your holdings.');

    const now = new Date().toISOString();
    const { error } = await this.db
      .from('profit_maximizer_uploads')
      .upsert({
        user_id: user.id,
        file_name: upload.fileName,
        broker: upload.broker,
        transactions: upload.transactions,
        uploaded_at: upload.uploadedAt,
        lt_tax_rate: upload.ltTaxRate,
        st_tax_rate: upload.stTaxRate,
        updated_at: now,
      }, { onConflict: 'user_id' });

    if (error) throw new Error(`Failed to save holdings: ${error.message}`);
  }

  /** Deletes the user's saved upload. */
  async clear(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    const { error } = await this.db
      .from('profit_maximizer_uploads')
      .delete()
      .eq('user_id', user.id);
    if (error) throw new Error(`Failed to clear holdings: ${error.message}`);
  }
}
