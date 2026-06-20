import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';

interface ApiHoliday {
  date: string;
  name: string;
}

interface HolidayRow extends ApiHoliday {
  weekday: string;
  status: 'past' | 'today' | 'upcoming';
  isNext: boolean;
  year: number;
}

interface MarketHolidays {
  key: 'US' | 'IN';
  label: string;
  flag: string;
  note: string;
  rows: HolidayRow[];
  nextLabel: string | null;
}

@Component({
  selector: 'app-holidays',
  standalone: true,
  imports: [CommonModule, DatePipe, ProgressSpinnerModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="holidays-page">
      <header class="hero">
        <div>
          <span class="eyebrow">Reference</span>
          <h1>Market Holidays {{ currentYear }}</h1>
          <p>Days the exchanges are closed. On these dates the daily-pick crons skip — no recommendations are generated or emailed.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-card">
          <p-progressSpinner strokeWidth="3" animationDuration="1s"></p-progressSpinner>
          <span>Loading holidays…</span>
        </div>
      } @else if (markets().length === 0) {
        <div class="empty-state">
          <i class="pi pi-calendar-times"></i>
          <strong>Couldn't load holidays</strong>
          <span>The holiday calendar service is unavailable right now.</span>
        </div>
      } @else {
        <div class="markets-grid">
          @for (m of markets(); track m.key) {
            <section class="market-panel">
              <div class="panel-heading">
                <h2><span class="flag">{{ m.flag }}</span> {{ m.label }}</h2>
                @if (m.nextLabel) {
                  <span class="next-chip"><i class="pi pi-clock"></i> Next: {{ m.nextLabel }}</span>
                } @else {
                  <span class="next-chip muted">No upcoming dates listed</span>
                }
              </div>

              <div class="table-wrap">
                <table class="holiday-table">
                  <thead>
                    <tr>
                      <th class="col-date">Date</th>
                      <th class="col-day">Day</th>
                      <th class="col-name">Holiday</th>
                      <th class="col-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (h of m.rows; track h.date + h.name) {
                      <tr [class.past]="h.status === 'past'" [class.is-next]="h.isNext">
                        <td class="col-date">{{ h.date + 'T00:00:00' | date:'EEE, MMM d, y' }}</td>
                        <td class="col-day">{{ h.weekday }}</td>
                        <td class="col-name">{{ h.name }}</td>
                        <td class="col-status">
                          <span class="status-chip" [ngClass]="h.status">
                            {{ h.status === 'today' ? 'Today' : h.status === 'upcoming' ? (h.isNext ? 'Next' : 'Upcoming') : 'Past' }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              @if (m.note) {
                <p class="market-note"><i class="pi pi-info-circle"></i> {{ m.note }}</p>
              }
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .holidays-page {
      min-height: calc(100vh - 56px);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.16), transparent 34%);
    }

    .hero,
    .market-panel,
    .loading-card,
    .empty-state {
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: rgba(15, 23, 42, 0.58);
      border-radius: 18px;
    }

    .hero { padding: 1rem 1.1rem; }
    .hero h1 {
      margin: 0.1rem 0 0.2rem;
      color: #f8fafc;
      font-size: clamp(1.45rem, 2.8vw, 2.15rem);
      line-height: 1;
      letter-spacing: -0.045em;
    }
    .hero p { margin: 0; color: #94a3b8; font-size: 0.9rem; max-width: 60rem; }

    .eyebrow {
      display: inline-block;
      color: #38bdf8;
      font-size: 0.7rem;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .markets-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.9rem;
    }

    @media (max-width: 900px) {
      .markets-grid { grid-template-columns: 1fr; }
    }

    .market-panel { padding: 0.95rem 1rem 1rem; overflow: hidden; }

    .panel-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      flex-wrap: wrap;
      margin-bottom: 0.7rem;
    }

    .panel-heading h2 {
      margin: 0;
      color: #f8fafc;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .flag { font-size: 1.15rem; }

    .next-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      border-radius: 999px;
      padding: 0.26rem 0.6rem;
      font-size: 0.68rem;
      font-weight: 800;
      color: #7dd3fc;
      background: rgba(56, 189, 248, 0.12);
    }
    .next-chip.muted { color: #94a3b8; background: rgba(148, 163, 184, 0.12); }

    .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

    .holiday-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 0.84rem;
      min-width: 420px;
    }

    .holiday-table thead th {
      position: sticky;
      top: 0;
      padding: 0.55rem 0.7rem;
      color: #64748b;
      font-size: 0.66rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: left;
      white-space: nowrap;
      background: linear-gradient(180deg, #0b1120 0%, #0f172a 100%);
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }

    .holiday-table td {
      padding: 0.6rem 0.7rem;
      color: #cbd5e1;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
      white-space: nowrap;
    }

    .holiday-table tbody tr.past td { color: #64748b; }
    .holiday-table tbody tr.is-next td {
      background: rgba(56, 189, 248, 0.06);
    }

    .col-name { white-space: normal; color: #f1f5f9; font-weight: 600; }

    .status-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.2rem 0.55rem;
      font-size: 0.64rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .status-chip.past { color: #94a3b8; background: rgba(148, 163, 184, 0.12); }
    .status-chip.today { color: #fde047; background: rgba(234, 179, 8, 0.16); }
    .status-chip.upcoming { color: #34d399; background: rgba(16, 185, 129, 0.12); }

    .market-note {
      margin: 0.7rem 0 0;
      display: flex;
      gap: 0.4rem;
      color: #94a3b8;
      font-size: 0.74rem;
      line-height: 1.4;
    }
    .market-note .pi { color: #a78bfa; margin-top: 0.1rem; }

    .loading-card,
    .empty-state {
      min-height: 16rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      color: #94a3b8;
      text-align: center;
    }
    .empty-state .pi { color: #38bdf8; font-size: 1.6rem; }
    .empty-state strong { color: #f8fafc; }
  `]
})
export class HolidaysComponent implements OnInit {
  private http = inject(HttpClient);

  loading = signal(true);
  readonly currentYear = new Date().getFullYear();
  private data = signal<{ holidays: Record<string, ApiHoliday[]>; notes: Record<string, string> } | null>(null);

  private static readonly META: { key: 'US' | 'IN'; label: string; flag: string }[] = [
    { key: 'US', label: 'United States (NYSE / NASDAQ)', flag: '🇺🇸' },
    { key: 'IN', label: 'India (NSE / BSE)', flag: '🇮🇳' },
  ];

  markets = computed<MarketHolidays[]>(() => {
    const payload = this.data();
    if (!payload) return [];
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = today.slice(0, 4);

    return HolidaysComponent.META.map(meta => {
      const list = [...(payload.holidays[meta.key] ?? [])]
        .filter(h => h.date.slice(0, 4) === currentYear)
        .sort((a, b) => a.date.localeCompare(b.date));
      const nextDate = list.find(h => h.date >= today)?.date ?? null;

      const rows: HolidayRow[] = list.map(h => ({
        ...h,
        weekday: new Date(`${h.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        status: h.date < today ? 'past' : h.date === today ? 'today' : 'upcoming',
        isNext: h.date === nextDate && nextDate !== today,
        year: Number(h.date.slice(0, 4)),
      }));

      const next = rows.find(r => r.date === nextDate);
      const nextLabel = next
        ? `${next.name} · ${new Date(`${next.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : null;

      return {
        key: meta.key,
        label: meta.label,
        flag: meta.flag,
        note: payload.notes?.[meta.key] ?? '',
        rows,
        nextLabel,
      };
    });
  });

  ngOnInit(): void {
    this.http.get<{ holidays: Record<string, ApiHoliday[]>; notes: Record<string, string> }>('/api/stocks?action=holidays')
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load holidays:', err);
          this.data.set(null);
          this.loading.set(false);
        },
      });
  }
}
