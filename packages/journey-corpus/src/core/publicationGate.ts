import type { MetricRow } from "./ports.js";

export interface CorpusHealthRecord {
  slug: string;
  eligibility: {
    reconstruction: boolean;
    audit: boolean;
    public_display: boolean;
    reasons: string[];
  };
}

export interface CorpusHealthReport {
  summary: {
    records: number;
    eligible_for_public_display: number;
  };
  records: CorpusHealthRecord[];
}

export class PublicationGate {
  private readonly bySlug: Map<string, CorpusHealthRecord>;

  constructor(readonly report: CorpusHealthReport) {
    this.bySlug = new Map(report.records.map((record) => [record.slug, record]));
  }

  isEligible(slug: string): boolean {
    return this.bySlug.get(slug)?.eligibility.public_display === true;
  }

  reasons(slug: string): string[] {
    return this.bySlug.get(slug)?.eligibility.reasons ?? ["missing_corpus_health_record"];
  }

  filterRows(rows: MetricRow[]): MetricRow[] {
    return rows.filter((row) => this.isEligible(row.slug));
  }
}
