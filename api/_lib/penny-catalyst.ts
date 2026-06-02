/**
 * Catalyst classifier for Penny Hits.
 *
 * Scans Finnhub news headlines/summaries for high-conviction events and
 * assigns a strength-weighted catalyst tag. Catalyst strength is the dominant
 * factor (40%) in the Penny Hit score, so this is where "a strong reason to
 * buy" is detected.
 */

import type { FinnhubNewsItem } from './finnhub-client';

export type CatalystTag =
  | 'contract_win'
  | 'fda_approval'
  | 'partnership'
  | 'acquisition'
  | 'earnings_beat'
  | 'guidance_raise'
  | 'upgrade'
  | 'product_launch';

export interface CatalystDefinition {
  tag: CatalystTag;
  /** Human-readable badge label shown in the UI. */
  label: string;
  /** Relative strength weight (higher = stronger buy reason). */
  weight: number;
  /** Lowercased keyword/phrase patterns that signal this catalyst. */
  patterns: string[];
}

const CATALYST_DEFINITIONS: CatalystDefinition[] = [
  {
    tag: 'contract_win',
    label: 'Contract Win',
    weight: 1.0,
    patterns: [
      'awarded contract', 'wins contract', 'win contract', 'awarded a contract',
      'secures contract', 'secured contract', 'new contract', 'contract award',
      'awarded order', 'wins order', 'purchase order', 'government contract',
      'defense contract', 'multi-year contract', 'million contract', 'billion contract',
    ],
  },
  {
    tag: 'fda_approval',
    label: 'FDA / Approval',
    weight: 1.0,
    patterns: [
      'fda approval', 'fda approves', 'fda clearance', 'fda cleared', '510(k)',
      'fast track', 'breakthrough therapy', 'phase 3', 'phase iii', 'topline results',
      'meets primary endpoint', 'positive results', 'ce mark', 'regulatory approval',
    ],
  },
  {
    tag: 'acquisition',
    label: 'M&A',
    weight: 0.9,
    patterns: [
      'to be acquired', 'acquisition of', 'agrees to acquire', 'merger', 'buyout',
      'takeover', 'acquires', 'to acquire',
    ],
  },
  {
    tag: 'partnership',
    label: 'Partnership',
    weight: 0.8,
    patterns: [
      'partnership', 'partners with', 'strategic partnership', 'collaboration',
      'collaborates with', 'joint venture', 'teams up with', 'agreement with',
    ],
  },
  {
    tag: 'guidance_raise',
    label: 'Guidance Raise',
    weight: 0.8,
    patterns: [
      'raises guidance', 'raised guidance', 'lifts guidance', 'boosts outlook',
      'raises outlook', 'increases guidance', 'guidance raised', 'raises forecast',
    ],
  },
  {
    tag: 'earnings_beat',
    label: 'Earnings Beat',
    weight: 0.7,
    patterns: [
      'beats estimates', 'beat estimates', 'tops estimates', 'beats expectations',
      'earnings beat', 'beats on revenue', 'record revenue', 'record quarter',
      'surpasses estimates',
    ],
  },
  {
    tag: 'upgrade',
    label: 'Analyst Upgrade',
    weight: 0.6,
    patterns: [
      'upgraded to', 'upgrade to', 'raises price target', 'raised price target',
      'price target raised', 'initiates buy', 'initiated at buy', 'reiterates buy',
      'outperform rating', 'overweight rating',
    ],
  },
  {
    tag: 'product_launch',
    label: 'Product Launch',
    weight: 0.5,
    patterns: [
      'launches', 'unveils', 'announces launch', 'product launch', 'now available',
      'rolls out', 'introduces new',
    ],
  },
];

/**
 * Negative-polarity phrases. When a headline carries one of these, we do NOT
 * count it as a positive catalyst (e.g. "FDA rejects", "phase 3 trial fails",
 * "prices offering" / dilution) and we track it so the scorer can penalize or
 * exclude names whose recent news is dominated by bad news.
 */
const NEGATIVE_PATTERNS: string[] = [
  'rejects', 'rejection', 'reject', 'fails', 'failed', 'failure', 'misses', 'missed',
  'disappointing', 'halts', 'halted', 'clinical hold', 'recall', 'recalls',
  'offering', 'dilution', 'dilutive', 'priced offering', 'prices offering',
  'registered direct', 'reverse split', 'downgrade', 'downgraded', 'cut to', 'lowers',
  'lowered guidance', 'cuts guidance', 'going concern', 'delisting', 'delist',
  'investigation', 'sec probe', 'lawsuit', 'securities fraud', 'bankruptcy',
  'chapter 11', 'warning letter', 'subpoena', 'default', 'restatement',
];

function hasNegativeSentiment(text: string): boolean {
  const lower = text.toLowerCase();
  return NEGATIVE_PATTERNS.some(p => lower.includes(p));
}

export interface DetectedCatalyst {
  tag: CatalystTag;
  label: string;
  weight: number;
  /** The headline that triggered detection. */
  headline: string;
  /** Article URL for reference. */
  url: string;
  /** Unix seconds timestamp of the article. */
  datetime: number;
}

export interface CatalystResult {
  /** Strongest catalysts found (deduped by tag, highest weight first). */
  catalysts: DetectedCatalyst[];
  /** 0-1 normalized catalyst strength (strongest single catalyst weight). */
  strength: number;
  /** Total number of news articles scanned (a rough buzz proxy). */
  articleCount: number;
  /** Count of recent articles carrying negative sentiment. */
  negativeCount: number;
  /** True when negative news outweighs positive catalysts (a red flag). */
  negativeDominant: boolean;
}

function matchCatalyst(text: string): CatalystDefinition | null {
  const lower = text.toLowerCase();
  for (const def of CATALYST_DEFINITIONS) {
    if (def.patterns.some(p => lower.includes(p))) {
      return def;
    }
  }
  return null;
}

/**
 * Scan a list of news items and return the strongest detected catalysts,
 * ignoring negative-sentiment headlines and tracking how much bad news there is.
 */
export function detectCatalysts(news: FinnhubNewsItem[]): CatalystResult {
  const byTag = new Map<CatalystTag, DetectedCatalyst>();
  let negativeCount = 0;

  for (const item of news) {
    const text = `${item.headline || ''} ${item.summary || ''}`;

    // A negative headline never counts as a positive catalyst, even if it
    // also matches a catalyst keyword (e.g. "phase 3 trial fails").
    if (hasNegativeSentiment(text)) {
      negativeCount++;
      continue;
    }

    const def = matchCatalyst(text);
    if (!def) continue;

    const existing = byTag.get(def.tag);
    // Keep the most recent headline per tag.
    if (!existing || item.datetime > existing.datetime) {
      byTag.set(def.tag, {
        tag: def.tag,
        label: def.label,
        weight: def.weight,
        headline: item.headline || '',
        url: item.url || '',
        datetime: item.datetime || 0,
      });
    }
  }

  const catalysts = Array.from(byTag.values()).sort((a, b) => b.weight - a.weight);
  const strength = catalysts.length > 0 ? catalysts[0].weight : 0;
  // Bad news outweighs the good when there are multiple negative articles and
  // no strong positive catalyst to offset them.
  const negativeDominant = negativeCount >= 2 && negativeCount > catalysts.length;

  return {
    catalysts,
    strength,
    articleCount: news.length,
    negativeCount,
    negativeDominant,
  };
}
