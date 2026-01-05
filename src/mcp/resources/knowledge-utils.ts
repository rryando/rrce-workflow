/**
 * Knowledge file helper utilities for cleanup agent
 */

import * as path from 'path';
import * as fs from 'fs';

export interface KnowledgeFileOptions {
  domain: string;
  date?: string;
  knowledgePath: string;
}

export interface MergeResult {
  action: 'merged' | 'created' | 'skipped';
  filePath: string;
  lines: number;
}

/**
 * Generate knowledge file name using domain-based naming convention
 * Format: {domain}-{YYYY-MM-DD}.md
 */
export function generateKnowledgeFileName(options: KnowledgeFileOptions): string {
  const date = options.date || new Date().toISOString().split('T')[0];
  const domain = options.domain.replace(/\s+/g, '-').toLowerCase();
  return `${domain}-${date}.md`;
}

/**
 * Check if a knowledge file exists
 */
export function knowledgeFileExists(knowledgePath: string, fileName: string): boolean {
  const filePath = path.join(knowledgePath, fileName);
  return fs.existsSync(filePath);
}

/**
 * Read knowledge file content
 */
export function readKnowledgeFile(knowledgePath: string, fileName: string): string | null {
  const filePath = path.join(knowledgePath, fileName);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write knowledge file content
 */
export function writeKnowledgeFile(knowledgePath: string, fileName: string, content: string): void {
  const filePath = path.join(knowledgePath, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Count lines in a file
 */
export function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Check if file exceeds line limit
 */
export function exceedsLineLimit(content: string, limit: number = 500): boolean {
  return countLines(content) > limit;
}

/**
 * Update "Updated:" timestamp in a knowledge file
 * Looks for patterns like "Updated: YYYY-MM-DD" and updates them
 */
export function updateTimestamp(content: string, date?: string): string {
  const timestamp = date || new Date().toISOString().split('T')[0];
  return content.replace(/Updated:\s*\d{4}-\d{2}-\d{2}/g, `Updated: ${timestamp}`);
}

/**
 * Generate domain-based knowledge file content template
 */
export function generateKnowledgeFileTemplate(domain: string, summary: string, findings: string[], relatedFiles: string[]): string {
  const date = new Date().toISOString().split('T')[0];
  const title = domain.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let content = `# ${title} Insights\n\n`;
  content += `Updated: ${date}\n\n`;
  content += `## Summary\n${summary}\n\n`;
  content += `## Key Findings\n`;
  findings.forEach(finding => {
    content += `- ${finding}\n`;
  });
  content += `\n## Related Files\n`;
  relatedFiles.forEach(file => {
    content += `- ${file}\n`;
  });
  content += `\n## Checklist\n`;
  content += `- [ ] Follow-up item 1\n`;

  return content;
}

/**
 * Merge new knowledge into existing file
 * Adds content as new section, updates timestamp
 */
export function mergeIntoKnowledgeFile(existingContent: string, newContent: string, domain: string): string {
  // Find the position to insert new content (before Checklist section)
  const checklistIndex = existingContent.indexOf('## Checklist');

  if (checklistIndex === -1) {
    // No checklist, just append
    return updateTimestamp(`${existingContent}\n\n${newContent}`);
  }

  // Insert before checklist
  const before = existingContent.substring(0, checklistIndex);
  const after = existingContent.substring(checklistIndex);

  return updateTimestamp(`${before}${newContent}\n\n${after}`);
}

/**
 * Suggest existing knowledge files for merging based on domain
 */
export function suggestMergeTargets(knowledgePath: string, domain: string): string[] {
  try {
    if (!fs.existsSync(knowledgePath)) {
      return [];
    }

    const files = fs.readdirSync(knowledgePath)
      .filter(f => f.endsWith('.md'))
      .filter(f => !f.startsWith('template-'));

    // Look for files with similar domain keywords
    const domainKeywords = domain.toLowerCase().split(/[-\s]+/);
    const scored = files.map(file => {
      const fileName = path.basename(file, '.md').toLowerCase();
      let score = 0;

      domainKeywords.forEach(keyword => {
        if (fileName.includes(keyword)) {
          score += 1;
        }
      });

      return { file, score };
    });

    // Return top 3 matches
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.file);
  } catch (error) {
    return [];
  }
}

/**
 * Generate default knowledge file paths to consider for merging
 * Ordered by priority (most specific to most general)
 */
export function getDefaultMergeTargets(): string[] {
  return [
    'domain-insights-{date}.md',      // Generic domain file
    'project-context.md',              // Project overview
    'architecture.md',                 // Architectural decisions
    'mcp-server.md',                  // MCP tool/agent changes
  ];
}
