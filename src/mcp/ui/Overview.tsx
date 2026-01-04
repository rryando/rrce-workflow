
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header';
import { useConfig } from './ConfigContext';
import { 
  listProjectTasks, 
  readSession, 
  readAgentTodos,
  isSessionStale,
  type AgentSession,
  type AgentTodos
} from './lib/tasks-fs';
import { 
  getPhaseIcon, 
  getTodoStatusIcon, 
  formatRelativeTime,
  getTreeBranch 
} from './ui-helpers';

interface OverviewProps {
  serverStatus: {
    running: boolean;
    port: number;
    pid: number;
  };
  stats: {
    exposedProjects: number;
    totalProjects: number;
    installedIntegrations: number;
  };
  logs: string[];
}

interface ActiveTaskInfo {
  project: string;
  title: string;
  slug: string;
  session: AgentSession | null;
  todos: AgentTodos | null;
  isStale: boolean;
}

export const Overview = ({ serverStatus, stats, logs }: OverviewProps) => {
  const { projects } = useConfig();

  // Find active tasks with session info
  const activeTasks = useMemo<ActiveTaskInfo[]>(() => {
    const active: ActiveTaskInfo[] = [];
    for (const p of projects) {
      const { tasks } = listProjectTasks(p);
      const inProgress = tasks.filter(t => t.status === 'in_progress');
      for (const t of inProgress) {
        const session = readSession(p, t.task_slug);
        const todos = readAgentTodos(p, t.task_slug);
        active.push({ 
          project: p.name, 
          title: t.title || t.task_slug, 
          slug: t.task_slug,
          session,
          todos,
          isStale: session ? isSessionStale(session) : false
        });
      }
    }
    return active;
  }, [projects]);

  const recentLogs = useMemo(() => {
    return logs.slice(-5).reverse();
  }, [logs]);

  // Calculate elapsed time
  const getElapsedTime = (startedAt: string): string => {
    const start = Date.parse(startedAt);
    if (isNaN(start)) return '';
    const elapsed = Date.now() - start;
    const mins = Math.floor(elapsed / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Header />
      
      <Box borderStyle="round" paddingX={1} borderColor="white" flexDirection="column" flexGrow={1}>
         {/* Top Row: System Status & Quick Commands */}
         <Box justifyContent="space-between">
            <Box flexDirection="column" width="50%">
                <Text bold color="cyan">🚀 System Cockpit</Text>
                <Box marginTop={1}>
                    <Text>Integrations: </Text>
                    <Text color={stats.installedIntegrations > 0 ? 'green' : 'yellow'}>{stats.installedIntegrations} active</Text>
                </Box>
                <Box>
                    <Text>MCP Server: </Text>
                    <Text color="green">Running</Text>
                    <Text color="dim"> (Port: {serverStatus.port})</Text>
                </Box>
                <Box>
                    <Text>Projects: </Text>
                    <Text>{stats.exposedProjects} / {stats.totalProjects} exposed</Text>
                </Box>
            </Box>
            
            <Box flexDirection="column" width="50%" paddingLeft={2}>
                <Text bold color="magenta">⚡ Slash Commands</Text>
                <Box marginTop={1} flexDirection="column">
                    <Text color="cyan">/rrce_init <Text color="dim">- Setup workspace</Text></Text>
                    <Text color="cyan">/rrce_research <Text color="dim">- Clarify requirements</Text></Text>
                    <Text color="cyan">/rrce_plan <Text color="dim">- Generate plan</Text></Text>
                    <Text color="cyan">/rrce_execute <Text color="dim">- Run executor</Text></Text>
                </Box>
            </Box>
         </Box>

         {/* Middle Row: Active Tasks with Session Info */}
         <Box marginTop={1} borderStyle="single" borderColor="blue" flexDirection="column" paddingX={1}>
            <Text bold color="blue">🏃 Active Tasks</Text>
            {activeTasks.length === 0 ? (
                <Box paddingY={1}>
                    <Text color="dim">No tasks currently in progress.</Text>
                </Box>
            ) : (
                activeTasks.slice(0, 3).map((t, i) => (
                    <Box key={`${t.project}-${t.slug}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
                        {/* Task header */}
                        <Box>
                            <Text color="yellow">🔄 </Text>
                            <Text bold color="white">{t.project}</Text>
                            <Text color="dim">: </Text>
                            <Text color="white">{t.title}</Text>
                        </Box>
                        
                        {/* Session info (if available) */}
                        {t.session && (
                            <Box marginLeft={3}>
                                <Text>{getPhaseIcon(t.session.agent)} </Text>
                                <Text color={t.isStale ? 'dim' : 'cyan'}>{t.session.agent}</Text>
                                <Text color="dim"> • </Text>
                                <Text color={t.isStale ? 'dim' : 'white'}>{t.session.phase}</Text>
                                <Text color="dim"> • </Text>
                                <Text color={t.isStale ? 'red' : 'green'}>
                                    {t.isStale ? 'stale' : `${getElapsedTime(t.session.started_at)} elapsed`}
                                </Text>
                            </Box>
                        )}
                        
                        {/* Top 3 todos (if available) */}
                        {t.todos && t.todos.items.length > 0 && (
                            <Box flexDirection="column" marginLeft={3}>
                                {t.todos.items.slice(0, 3).map((item, idx) => (
                                    <Box key={item.id}>
                                        <Text color="dim">{getTreeBranch(idx === Math.min(2, t.todos!.items.length - 1))} </Text>
                                        <Text color={item.status === 'completed' ? 'green' : item.status === 'in_progress' ? 'yellow' : 'dim'}>
                                            {getTodoStatusIcon(item.status)}
                                        </Text>
                                        <Text color={item.status === 'completed' ? 'dim' : 'white'}>
                                            {' '}{item.content.length > 40 ? item.content.substring(0, 37) + '...' : item.content}
                                        </Text>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                ))
            )}
            {activeTasks.length > 3 && <Text color="dim">   ...and {activeTasks.length - 3} more</Text>}
         </Box>

         {/* Bottom Row: Recent Activity */}
         <Box marginTop={1} borderStyle="single" borderColor="dim" flexDirection="column" paddingX={1} flexGrow={1}>
            <Text bold color="dim">📜 Recent Activity</Text>
            <Box flexDirection="column" marginTop={0}>
                {recentLogs.length === 0 ? (
                    <Text color="dim">Waiting for activity...</Text>
                ) : (
                    recentLogs.map((log, i) => (
                        <Text key={i} color="white" wrap="truncate-end">
                             {log.length > 80 ? log.substring(0, 77) + '...' : log}
                        </Text>
                    ))
                )}
            </Box>
         </Box>

         <Box marginTop={0} justifyContent="space-between">
             <Box>
                <Text color="dim">r:Restart q:Quit 1-4/◄ ►:Tabs</Text>
             </Box>
             <Box>
                <Text color="dim">RRCE MCP Hub v0.3.14</Text>
             </Box>
         </Box>
      </Box>
    </Box>
  );
};
