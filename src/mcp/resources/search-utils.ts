import { indexingJobs } from '../services/indexing-jobs';
import { estimateTokens } from './utils';

/**
 * Get advisory message if indexing is in progress
 */
export function getSearchAdvisory(projectName: string): { 
  indexingInProgress: boolean; 
  advisoryMessage?: string; 
} {
  const indexingInProgress = indexingJobs.isRunning(projectName);
  const advisoryMessage = indexingInProgress
    ? 'Indexing in progress; results may be stale/incomplete.'
    : undefined;
    
  return { indexingInProgress, advisoryMessage };
}

/**
 * Get index freshness information
 */
export function getIndexFreshness(projectName: string): { 
  indexAgeSeconds?: number; 
  lastIndexedAt?: string; 
} {
  const progress = indexingJobs.getProgress(projectName);
  if (progress.completedAt) {
    return {
      lastIndexedAt: new Date(progress.completedAt).toISOString(),
      indexAgeSeconds: Math.floor((Date.now() - progress.completedAt) / 1000)
    };
  }
  return {};
}

/**
 * Apply token budget to search results
 */
export function applyTokenBudget<T>(
  results: T[], 
  maxTokens: number | undefined, 
  getContent: (item: T) => string
): { 
  budgetedResults: T[]; 
  truncated: boolean; 
  tokenCount: number; 
} {
  let truncated = false;
  let tokenCount = 0;
  
  if (maxTokens !== undefined && maxTokens > 0) {
    const budgeted: T[] = [];
    for (const result of results) {
      const resultTokens = estimateTokens(getContent(result));
      if (tokenCount + resultTokens > maxTokens) {
        truncated = true;
        break;
      }
      budgeted.push(result);
      tokenCount += resultTokens;
    }
    return { budgetedResults: budgeted, truncated, tokenCount };
  } else {
    // Calculate total tokens without budget
    tokenCount = results.reduce((sum, r) => sum + estimateTokens(getContent(r)), 0);
    return { budgetedResults: results, truncated: false, tokenCount };
  }
}
