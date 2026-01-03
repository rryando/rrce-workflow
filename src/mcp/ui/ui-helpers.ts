/**
 * UI Helper Functions for ProjectsView
 * Provides reusable utility functions for status icons, colors, progress indicators, etc.
 */

import type { TaskMeta } from './lib/tasks-fs';

/**
 * Get icon for task status
 */
export const getStatusIcon = (status: string): string => {
  const icons = {
    pending: '⏳',
    in_progress: '🔄',
    blocked: '🚫',
    complete: '✅'
  };
  return icons[status as keyof typeof icons] || '○';
};

/**
 * Get color for task status
 */
export const getStatusColor = (status: string): string => {
  const colors = {
    pending: 'yellow',
    in_progress: 'yellow',
    blocked: 'red',
    complete: 'green'
  };
  return colors[status as keyof typeof colors] || 'white';
};

/**
 * Calculate checklist progress
 * @returns Object with completed count, total count, and percentage
 */
export const getChecklistProgress = (checklist: any[]): { completed: number; total: number; percentage: number } => {
  if (!checklist || checklist.length === 0) {
    return { completed: 0, total: 0, percentage: 0 };
  }
  const completed = checklist.filter(item => item.status === 'done').length;
  return {
    completed,
    total: checklist.length,
    percentage: Math.round((completed / checklist.length) * 100)
  };
};

/**
 * Get checkbox symbol based on status
 */
export const getCheckbox = (status: string): string => {
  return status === 'done' ? '☑' : '☐';
};

/**
 * Get relative time display (simplified - returns original string for now)
 */
export const getRelativeTime = (dateString: string): string => {
  if (!dateString) return '—';
  // TODO: Implement proper relative time logic
  // For now, return as-is since format is already ISO date string
  return dateString;
};

/**
 * Generate progress bar using block characters
 * @param percentage Progress percentage (0-100)
 * @param length Total length of progress bar (default: 10)
 * @returns Progress bar string with █ and ░ characters
 */
export const getProgressBar = (percentage: number, length: number = 10): string => {
  const filled = Math.floor((percentage / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
};

/**
 * Get folder icon based on expanded state
 */
export const getFolderIcon = (isOpen: boolean): string => {
  return isOpen ? '📂' : '📁';
};

/**
 * Get expand/collapse indicator
 */
export const getExpandIndicator = (isOpen: boolean): string => {
  return isOpen ? '▾' : '▸';
};

/**
 * Get agent status icon
 */
export const getAgentStatusIcon = (status: string): string => {
  const icons = {
    complete: '✓',
    in_progress: '⟳',
    pending: '○',
    blocked: '✕'
  };
  return icons[status as keyof typeof icons] || '—';
};
