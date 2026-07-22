import type {
  DataStore, DatasetMeta, DocHit, LLMProvider, MetricRow, PlatformRecord, QualityRow, ShortestPathAudit,
  RepoWriter, SearchProvider,
} from "../core/ports.js";
import type {
  ResearchOutcome, ResearchTaskInput, RunStatusProjection, WorkflowRunner,
} from "../workflows/contract.js";

/** In-memory DataStore for tests: no filesystem, fully deterministic. */
export class InMemoryDataStore implements DataStore {
  private readonly bySlug: Map<string, MetricRow>;
  private readonly records: Map<string, PlatformRecord>;

  constructor(
    private readonly rows: MetricRow[],
    records: Record<string, PlatformRecord> = {},
    private readonly quality: Record<string, QualityRow> = {},
    private readonly audits: Record<string, ShortestPathAudit> = {},
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
  getAudit(slug: string): ShortestPathAudit | undefined {
    return this.audits[slug];
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
  constructor(private readonly result: { url: string; reused?: boolean } | Error = { url: "https://github.com/x/y/pull/1" }) {}
  async openDraftRecordPR(): Promise<{ url: string; reused: boolean }> {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return { url: this.result.url, reused: this.result.reused ?? false };
  }
}

/**
 * Fake WorkflowRunner: starts return a canned run id and status returns canned
 * projections in sequence (last one repeats). Lets the API layer be tested
 * without the Render SDK or network.
 */
export class FakeWorkflowRunner implements WorkflowRunner {
  public started: ResearchTaskInput[] = [];
  public namedStarts: Array<{ taskSlug: string; input: unknown }> = [];
  private index = 0;
  constructor(
    private readonly runId = "run-fake-1",
    private readonly projections: RunStatusProjection[] = [],
    private readonly startError?: Error,
  ) {}

  async start(input: ResearchTaskInput): Promise<{ runId: string }> {
    if (this.startError) throw this.startError;
    this.started.push(input);
    return { runId: this.runId };
  }

  async startNamedTask(taskSlug: string, input: unknown): Promise<{ runId: string }> {
    if (this.startError) throw this.startError;
    this.namedStarts.push({ taskSlug, input });
    return { runId: this.runId };
  }

  async status(runId: string): Promise<RunStatusProjection> {
    if (this.projections.length === 0) {
      return { runId, phase: "queued", result: null, message: null };
    }
    const projection = this.projections[Math.min(this.index, this.projections.length - 1)];
    this.index += 1;
    return { ...projection, runId };
  }
}

/** Small helper to build a completed ResearchOutcome for tests. */
export function completedOutcome(record: PlatformRecord, assessment: unknown): ResearchOutcome {
  return {
    outcome: "completed",
    slug: record.platform.slug,
    record,
    assessment: assessment as never,
    contribution: { status: "opened", url: "https://github.com/x/y/pull/1", reused: false },
  };
}
