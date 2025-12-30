
import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { RAGService } from '../services/rag';
import { getRAGIndexPath } from '../resources';
import { findProjectConfig } from '../config-utils';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';

interface IndexingStatusProps {
  projects: DetectedProject[];
  config: MCPConfig;
}

interface ProjectStats {
    projectName: string;
    enabled: boolean;
    totalFiles: number;
    totalChunks: number;
    lastFullIndex?: number;
    error?: string;
}

export const IndexingStatus: React.FC<IndexingStatusProps> = ({ projects, config }) => {
  const [stats, setStats] = useState<ProjectStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
        const newStats: ProjectStats[] = [];
        
        for (const project of projects) {
            let projConfig = findProjectConfig(config, { name: project.name, path: project.path });
            
            // Fallback for global projects: path in config (local) != path in detection (global storage)
            if (!projConfig && project.source === 'global') {
                projConfig = config.projects.find(p => p.name === project.name);
            }
            const enabled = projConfig?.semanticSearch?.enabled || project.semanticSearchEnabled || false;
            
            if (!enabled) {
                newStats.push({
                    projectName: project.name,
                    enabled: false,
                    totalFiles: 0,
                    totalChunks: 0
                });
                continue;
            }

            try {
                const indexPath = getRAGIndexPath(project);
                // We use a dummy model name because we only need to load the index json to get stats, 
                // we don't need to load the transformer pipeline.
                // RAGService constructor doesn't load model immediately.
                const rag = new RAGService(indexPath, 'dummy'); 
                const s = rag.getStats();
                newStats.push({
                    projectName: project.name,
                    enabled: true,
                    totalFiles: s.totalFiles,
                    totalChunks: s.totalChunks,
                    lastFullIndex: s.lastFullIndex
                });
            } catch (e) {
                 newStats.push({
                    projectName: project.name,
                    enabled: true,
                    totalFiles: 0,
                    totalChunks: 0,
                    error: String(e)
                });
            }
        }
        setStats(newStats);
        setLoading(false);
    };

    fetchStats();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [projects, config]);

  if (loading && stats.length === 0) {
      return <Text>Loading indexing status...</Text>;
  }

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="blue" flexGrow={1}>
        <Text bold color="blue"> RAG Indexing Status </Text>
        <Box marginTop={1} flexDirection="column">
            {/* Header */}
            <Box>
                <Box width={25}><Text underline>Project</Text></Box>
                <Box width={15}><Text underline>Status</Text></Box>
                <Box width={15}><Text underline>Indexed Files</Text></Box>
                <Box width={15}><Text underline>Total Chunks</Text></Box>
                <Box><Text underline>Last Index</Text></Box>
            </Box>
            
            {/* Rows */}
            {stats.length === 0 ? (
                <Text color="dim">No exposed projects found.</Text>
            ) : (
                stats.map(s => (
                    <Box key={s.projectName} marginTop={0}>
                        <Box width={25}>
                            <Text color="white">{s.projectName}</Text>
                        </Box>
                        <Box width={15}>
                            <Text color={s.enabled ? 'green' : 'dim'}>
                                {s.enabled ? 'Enabled' : 'Disabled'}
                            </Text>
                        </Box>
                        <Box width={15}>
                            <Text>{s.enabled ? s.totalFiles : '-'}</Text>
                        </Box>
                        <Box width={15}>
                            <Text>{s.enabled ? s.totalChunks : '-'}</Text>
                        </Box>
                         <Box>
                            <Text>
                                {s.lastFullIndex ? new Date(s.lastFullIndex).toLocaleTimeString() : '-'}
                            </Text>
                        </Box>
                    </Box>
                ))
            )}
        </Box>
    </Box>
  );
};
