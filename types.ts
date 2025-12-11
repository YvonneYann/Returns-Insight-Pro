
// Type definitions matching the user's JSON structure

export type ReportMode = 'status' | 'cycle';

export interface AsinNode {
  country: string;
  fasin: string;
  asin: string;
  start_date: string;
  end_date: string;
  units_sold: number;
  units_returned: number;
  return_rate: number;
  sales_share: number;
  returns_share: number;
  problem_class: string | null;
  problem_class_label_cn: string;
  high_return_watchlist: boolean;
}

export interface ParentSummary {
  country: string;
  fasin: string;
  start_date: string;
  end_date: string;
  units_sold: number;
  units_returned: number;
  return_rate: number;
}

export interface ReasonTag {
  tag_code: string;
  tag_name_cn: string;
  event_count: number;
  event_coverage: number;
  is_primary: boolean;
  detailed_explanation?: string; // Optional field for rich context/evidence
}

export interface ProblemAsinReason {
  country: string;
  fasin: string;
  asin: string;
  start_date: string;
  end_date: string;
  problem_class: string;
  problem_class_label_cn: string;
  total_events: number;
  units_returned: number;
  text_coverage: number;
  core_reasons: ReasonTag[];
  coverage_threshold: number;
  coverage_reached: number;
  reason_confidence_level: string;
  can_deep_dive_reasons: boolean;
}

export interface ReasonExplanation {
  asin: string;
  tag_code: string;
  explanation?: string;
  evidence?: string; // Support alias for explanation text
  review_cn?: string; // Chinese translation of the review
  review_en?: string; // Original English review
}

export interface ListingItem {
  country: string;
  fasin: string;
  asin: string;
  snapshot_date: string;
  payload: string; // JSON string containing title, features, description etc.
}

export interface AppData {
  structure: { asin_structure: AsinNode[] } | null;
  summary: { parent_summary: ParentSummary } | null;
  reasons: { problem_asin_reasons: ProblemAsinReason[] } | null;
  explanations: { 
    reason_explanations?: ReasonExplanation[];
    evidence?: ReasonExplanation[]; 
  } | null;
  listing: { problem_asin_listing: ListingItem[] } | null;
}

export interface ComparisonData {
  before: AppData;
  after: AppData;
}
