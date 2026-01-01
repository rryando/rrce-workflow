import { logger } from '../logger';

export type IndexJobState = 'idle' | 'running' | 'complete' | 'failed';

export interface IndexingProgress {
  project: string;
  state: IndexJobState;
  startedAt?: number;
  completedAt?: number;
  itemsDone: number;
  itemsTotal?: number;
  currentItem?: string;
  lastError?: string;
}

export interface StartOrStatusResult {
  status: 'started' | 'already_running';
  state: IndexJobState;
  progress: IndexingProgress;
}

interface InternalJob {
  progress: IndexingProgress;
  promise?: Promise<void>;
}

class IndexingJobManager {
  private jobs = new Map<string, InternalJob>();

  getProgress(project: string): IndexingProgress {
    const existing = this.jobs.get(project);
    if (existing) return { ...existing.progress };

    return {
      project,
      state: 'idle',
      itemsDone: 0,
      itemsTotal: undefined,
    };
  }

  update(project: string, patch: Partial<IndexingProgress>): void {
    const existing = this.jobs.get(project);
    const next: IndexingProgress = {
      ...(existing?.progress ?? this.getProgress(project)),
      ...patch,
      project,
    };

    this.jobs.set(project, { ...(existing ?? { progress: next }), progress: next });
  }

  isRunning(project: string): boolean {
    return this.getProgress(project).state === 'running';
  }

  startOrStatus(project: string, runner: () => Promise<void>): StartOrStatusResult {
    const current = this.jobs.get(project);

    if (current?.progress.state === 'running' && current.promise) {
      return {
        status: 'already_running',
        state: 'running',
        progress: { ...current.progress },
      };
    }

    // If we previously completed/failed, allow a new run to start.

    // Fresh start
    const startedAt = Date.now();
    const initial: IndexingProgress = {
      project,
      state: 'running',
      startedAt,
      itemsDone: 0,
      itemsTotal: undefined,
      currentItem: undefined,
      lastError: undefined,
    };

    const job: InternalJob = { progress: initial };
    this.jobs.set(project, job);

    job.promise = (async () => {
      try {
        await runner();
        this.update(project, { state: 'complete', completedAt: Date.now(), currentItem: undefined });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[RAG] Indexing job failed for '${project}'`, err);
        this.update(project, {
          state: 'failed',
          completedAt: Date.now(),
          currentItem: undefined,
          lastError: msg,
        });
      }
    })();

    return {
      status: 'started',
      state: 'running',
      progress: { ...this.getProgress(project) },
    };
  }
}

export const indexingJobs = new IndexingJobManager();
