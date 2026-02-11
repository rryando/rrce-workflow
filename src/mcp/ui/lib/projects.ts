import * as fs from 'fs';
import * as path from 'path';
import type { DetectedProject } from '../../../lib/detection';

export interface IndexStats {
  knowledgeCount: number;
  codeCount: number;
  lastIndexed: string | null;
}

const statsCache = new Map<string, { stats: IndexStats; embMtimeMs: number; codeMtimeMs: number }>();

export function getIndexStats(project: DetectedProject): IndexStats {
  const stats: IndexStats = { knowledgeCount: 0, codeCount: 0, lastIndexed: null };

  try {
    const knowledgePath = project.knowledgePath;
    if (!knowledgePath) return stats;

    const embPath = path.join(knowledgePath, 'embeddings.json');
    const codeEmbPath = path.join(knowledgePath, 'code-embeddings.json');

    // Get current mtimes (statSync is ~100x cheaper than readFileSync+JSON.parse)
    let embMtimeMs = 0;
    let codeMtimeMs = 0;
    try { embMtimeMs = fs.statSync(embPath).mtimeMs; } catch {}
    try { codeMtimeMs = fs.statSync(codeEmbPath).mtimeMs; } catch {}

    // Return cached result if mtimes haven't changed
    const cached = statsCache.get(knowledgePath);
    if (cached && cached.embMtimeMs === embMtimeMs && cached.codeMtimeMs === codeMtimeMs) {
      return cached.stats;
    }

    // Re-read files since mtime changed
    if (embMtimeMs > 0) {
      stats.lastIndexed = new Date(embMtimeMs).toISOString();
      try {
        const data = JSON.parse(fs.readFileSync(embPath, 'utf-8'));
        stats.knowledgeCount = Array.isArray(data) ? data.length : Object.keys(data).length;
      } catch {}
    }

    if (codeMtimeMs > 0) {
      try {
        const data = JSON.parse(fs.readFileSync(codeEmbPath, 'utf-8'));
        stats.codeCount = Array.isArray(data) ? data.length : Object.keys(data).length;
      } catch {}
    }

    statsCache.set(knowledgePath, { stats, embMtimeMs, codeMtimeMs });
  } catch {}

  return stats;
}
