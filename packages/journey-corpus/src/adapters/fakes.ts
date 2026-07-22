import type {
  DataStore, DatasetMeta, DocHit, LLMProvider, MetricRow, PlatformRecord, QualityRow,
  RepoWriter, SearchProvider,
} from "../core/ports.js";

/** In-memory DataStore for tests: no filesystem, fully deterministic. */
export class InMemoryDataStore implements DataStore {
  private readonly bySlug: Map<string, MetricRow>;
  private readonly records: Map<string, PlatformRecord>;

  constructor(
    private readonly rows: MetricRow[],
    records: Record<string, PlatformRecord> = {},
    private readonly quality: Record<string, QualityRow> = {},
    private readonly metaValue: DatasetMeta = {
      count: rows.length,
      generatedAt: "2026-07-19",
      scoreModelVersion: "1.0",
      caveats: [],
      totals: { platforms: rows.length, steps: 0, sources: 0 },
    },
  ) {
    this.bySlug = new Map(rows.map((r) => [r.slug, r]));
    this.records = new Map(Object.entries(records));
  }

  meta(): DatasetMeta {
    return this.metaValue;
  }
  listRows(): MetricRow[] {
    return this.rows;
  }
  getRow(slug: string): MetricRow | undefined {
    return this.bySlug.get(slug);
  }
  getRecord(slug: string): PlatformRecord | undefined {
    return this.records.get(slug);
  }
  getQuality(slug: string): QualityRow | undefined {
    return this.quality[slug];
  }
}

/** Fake SearchProvider: returns canned hits or throws to simulate failure. */
export class FakeSearchProvider implements SearchProvider {
  constructor(private readonly hits: DocHit[] | Error) {}
  async findOfficialDocs(): Promise<DocHit[]> {
    if (this.hits instanceof Error) throw this.hits;
    return this.hits;
  }
}

/** Fake LLMProvider: returns a canned record or throws to simulate failure. */
export class FakeLLMProvider implements LLMProvider {
  constructor(private readonly record: PlatformRecord | Error) {}
  async reconstructRecord(): Promise<PlatformRecord> {
    if (this.record instanceof Error) throw this.record;
    return this.record;
  }
}

/** Fake RepoWriter: records the call and returns a canned PR URL or throws. */
export class FakeRepoWriter implements RepoWriter {
  public calls = 0;
  constructor(private readonly result: { url: string } | Error = { url: "https://github.com/x/y/pull/1" }) {}
  async openDraftRecordPR(): Promise<{ url: string }> {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}
