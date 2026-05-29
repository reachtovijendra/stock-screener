import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { PennyHitsService, PennyHit } from '../../core/services';

@Component({
  selector: 'app-penny-hits',
  standalone: true,
  imports: [CommonModule, DecimalPipe, ProgressSpinnerModule, TooltipModule],
  template: `
    <div class="penny-page">
      <div class="penny-content">
        <!-- Header -->
        <header class="penny-header">
          <div class="header-left">
            <h1><i class="pi pi-bullseye"></i> Penny Hits</h1>
            <p>Low-priced US stocks (under $20) with strong catalysts, analyst conviction, and buying activity.</p>
          </div>
          <div class="header-right">
            @if (svc.pickDate()) {
              <span class="updated-badge"><i class="pi pi-calendar"></i> {{ svc.pickDate() }}</span>
            }
            <button class="refresh-btn" [class.spinning]="svc.loading()" (click)="refresh()" pTooltip="Refresh" tooltipPosition="bottom">
              <i class="pi pi-refresh"></i>
            </button>
          </div>
        </header>

        <!-- Loading -->
        @if (svc.loading()) {
          <div class="penny-state">
            <p-progressSpinner strokeWidth="3" [style]="{ width: '44px', height: '44px' }"></p-progressSpinner>
            <span>Loading Penny Hits...</span>
          </div>
        } @else if (svc.error()) {
          <div class="penny-state">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ svc.error() }}</span>
          </div>
        } @else if (svc.hits().length === 0) {
          <div class="penny-state">
            <i class="pi pi-inbox"></i>
            <span>No Penny Hits yet. The daily scan runs before US market open — check back soon.</span>
          </div>
        } @else {
          <!-- Card grid -->
          <div class="penny-grid">
            @for (hit of svc.hits(); track hit.symbol) {
              <div class="penny-card" (click)="openStock(hit.symbol)">
                <div class="card-top">
                  <div class="score-badge" [ngClass]="scoreClass(hit.score)">
                    <span class="score-num">{{ hit.score }}</span>
                    <span class="score-lbl">score</span>
                  </div>
                  <div class="sym-block">
                    <span class="sym">{{ hit.symbol }}</span>
                    <span class="name">{{ hit.name }}</span>
                    <span class="sector">{{ hit.sector }}</span>
                  </div>
                  <div class="price-block">
                    <span class="price">\${{ hit.price | number:'1.2-2' }}</span>
                    <span class="chg" [class.up]="(hit.change_percent ?? 0) >= 0" [class.down]="(hit.change_percent ?? 0) < 0">
                      {{ (hit.change_percent ?? 0) >= 0 ? '+' : '' }}{{ hit.change_percent | number:'1.1-1' }}%
                    </span>
                  </div>
                </div>

                @if (hit.catalysts.length) {
                  <div class="catalyst-chips">
                    @for (c of hit.catalysts; track c) {
                      <span class="chip" [ngClass]="chipClass(c)">{{ c }}</span>
                    }
                  </div>
                }

                <p class="thesis">{{ hit.thesis }}</p>

                <div class="metrics">
                  @if (hit.target_mean_price) {
                    <div class="metric">
                      <span class="m-lbl">Target</span>
                      <span class="m-val">\${{ hit.target_mean_price | number:'1.2-2' }}</span>
                    </div>
                  }
                  @if (hit.upside_percent != null) {
                    <div class="metric">
                      <span class="m-lbl">Upside</span>
                      <span class="m-val" [class.up]="hit.upside_percent >= 0" [class.down]="hit.upside_percent < 0">
                        {{ hit.upside_percent >= 0 ? '+' : '' }}{{ hit.upside_percent | number:'1.0-0' }}%
                      </span>
                    </div>
                  }
                  @if (hit.num_analysts) {
                    <div class="metric">
                      <span class="m-lbl">Analysts</span>
                      <span class="m-val">{{ hit.num_analysts }}</span>
                    </div>
                  }
                  @if (hit.relative_volume != null) {
                    <div class="metric">
                      <span class="m-lbl">Rel Vol</span>
                      <span class="m-val">{{ hit.relative_volume | number:'1.1-1' }}x</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <p class="disclaimer">
            Penny Hits are auto-generated, US-only, and not financial advice. Low-priced stocks carry elevated risk. Always do your own research.
          </p>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .penny-page {
      padding: 1.5rem 2rem 3rem;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100%;
    }
    .penny-content { max-width: 1500px; margin: 0 auto; }

    .penny-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1.5rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }
    .header-left h1 {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 700;
      color: #f5f5f7;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .header-left h1 i { color: #f5c842; }
    .header-left p { margin: 0.35rem 0 0; color: rgba(255,255,255,0.5); font-size: 0.9rem; }
    .header-right { display: flex; align-items: center; gap: 0.75rem; }
    .updated-badge {
      font-size: 0.75rem;
      color: rgba(255,255,255,0.55);
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      padding: 0.35rem 0.6rem;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .refresh-btn {
      width: 36px; height: 36px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.7);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .refresh-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .refresh-btn.spinning i { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .penny-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 4rem 1rem;
      color: rgba(255,255,255,0.5);
      text-align: center;
    }
    .penny-state i { font-size: 1.8rem; }

    .penny-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1rem;
    }

    .penny-card {
      background: rgba(26, 26, 29, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 16px;
      padding: 1.1rem 1.2rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
    }
    .penny-card:hover {
      border-color: rgba(245, 200, 66, 0.35);
      background: rgba(33, 33, 37, 0.85);
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    .card-top { display: flex; align-items: center; gap: 0.8rem; }
    .score-badge {
      flex-shrink: 0;
      width: 52px; height: 52px;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 800;
    }
    .score-badge .score-num { font-size: 1.25rem; line-height: 1; }
    .score-badge .score-lbl { font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
    .score-badge.high { background: rgba(52, 211, 153, 0.15); color: #34d399; }
    .score-badge.mid { background: rgba(245, 200, 66, 0.15); color: #f5c842; }
    .score-badge.low { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); }

    .sym-block { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .sym-block .sym { font-weight: 700; color: #f5f5f7; font-size: 1rem; }
    .sym-block .name { font-size: 0.78rem; color: rgba(255,255,255,0.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sym-block .sector { font-size: 0.68rem; color: rgba(255,255,255,0.35); }

    .price-block { display: flex; flex-direction: column; align-items: flex-end; }
    .price-block .price { font-weight: 700; color: #f5f5f7; font-size: 1rem; }
    .chg { font-size: 0.78rem; font-weight: 600; }
    .chg.up, .m-val.up { color: #34d399; }
    .chg.down, .m-val.down { color: #f87171; }

    .catalyst-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .chip {
      font-size: 0.66rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.7);
    }
    .chip.catalyst { background: rgba(124, 58, 237, 0.18); color: #c4b5fd; }
    .chip.insider { background: rgba(52, 211, 153, 0.15); color: #34d399; }
    .chip.volume { background: rgba(96, 165, 250, 0.15); color: #93c5fd; }
    .chip.analyst { background: rgba(245, 200, 66, 0.15); color: #f5c842; }

    .thesis { margin: 0; font-size: 0.82rem; color: rgba(255,255,255,0.7); line-height: 1.4; }

    .metrics {
      display: flex;
      gap: 0;
      border-top: 1px solid rgba(255,255,255,0.06);
      padding-top: 0.6rem;
      margin-top: auto;
    }
    .metric { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
    .metric .m-lbl { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.4); }
    .metric .m-val { font-size: 0.85rem; font-weight: 600; color: #f5f5f7; }

    .disclaimer { margin: 1.5rem 0 0; font-size: 0.72rem; color: rgba(255,255,255,0.35); line-height: 1.5; }

    @media (max-width: 768px) {
      .penny-page { padding: 1.25rem 0.85rem 3rem; }
      .penny-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class PennyHitsComponent implements OnInit {
  protected svc = inject(PennyHitsService);
  private router = inject(Router);

  ngOnInit(): void {
    this.svc.load();
  }

  refresh(): void {
    if (!this.svc.loading()) this.svc.load();
  }

  openStock(symbol: string): void {
    this.router.navigate(['/stock', symbol]);
  }

  scoreClass(score: number): string {
    if (score >= 70) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
  }

  chipClass(label: string): string {
    const l = label.toLowerCase();
    if (l.includes('insider')) return 'insider';
    if (l.includes('volume')) return 'volume';
    if (l.includes('analyst') || l.includes('coverage')) return 'analyst';
    return 'catalyst';
  }
}
