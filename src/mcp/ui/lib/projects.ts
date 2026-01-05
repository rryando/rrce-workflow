import * as fs from 'fs';
import * as path from 'path';
import type { DetectedProject } from '../../../lib/detection';

export interface IndexStats {
  knowledgeCount: number;
  codeCount: number;
  lastIndexed: string | null;
}

export function getIndexStats(project: DetectedProject): IndexStats {
  const stats: IndexStats = { knowledgeCount: 0, codeCount: 0, lastIndexed: null };
  
  try {
    const knowledgePath = project.knowledgePath;
    if (knowledgePath) {
      const embPath = path.join(knowledgePath, 'embeddings.json');
      const codeEmbPath = path.join(knowledgePath, 'code-embeddings.json');
      
      if (fs.existsSync(embPath)) {
        const stat = fs.statSync(embPath);
        stats.lastIndexed = stat.mtime.toISOString();
        try {
          const data = JSON.parse(fs.readFileSync(embPath, 'utf-8'));
          stats.knowledgeCount = Array.isArray(data) ? data.length : Object.keys(data).length;
        } catch {}
      }
      
      if (fs.existsSync(codeEmbPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(codeEmbPath, 'utf-8'));
          stats.codeCount = Array.isArray(data) ? data.length : Object.keys(data).length;
        } catch {}
      }
    }
  } catch {}
  
  return stats;
}
