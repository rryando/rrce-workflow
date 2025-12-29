import { spinner, note, multiselect, isCancel, confirm } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, saveMCPConfig, setProjectConfig } from '../config';
import { scanForProjects } from '../../lib/detection';
import { logger } from '../logger';

/**
 * Configure which projects to expose
 */
export async function handleConfigure(): Promise<void> {
  const s = spinner();
  s.start('Scanning for projects...');

  const config = loadMCPConfig();
  
  // Ensure we include projects already in config
  const knownPaths = config.projects.map(p => p.path).filter((p): p is string => !!p);
  const projects = scanForProjects({ knownPaths });
  
  logger.info('Configure: Loaded config', { projects: config.projects, defaultMode: config.defaults.includeNew });

  s.stop('Projects found');

  if (projects.length === 0) {
    note('No RRCE projects detected. Run "rrce-workflow" in a project to set it up.', 'No Projects');
    return;
  }

  // Build options with current state
  const options = projects.map(project => {
    // Find config that matches this project specifically (by path) or legacy (by name)
    const projectConfig = config.projects.find(p => 
        (p.path && p.path === project.dataPath) || (!p.path && p.name === project.name)
    );
    const isExposed = projectConfig?.expose ?? config.defaults.includeNew;
    
    return {
      value: project.dataPath, // Use precise data path as unique identifier
      label: `${project.name} ${pc.dim(`(${project.source})`)}`,
      hint: project.dataPath,
    };
  });

  // Get currently exposed projects for initial values
  const currentlyExposed = projects
    .filter(p => {
      const cfg = config.projects.find(c => 
        (c.path && c.path === p.dataPath) || (!c.path && c.name === p.name)
      );
      return cfg?.expose ?? config.defaults.includeNew;
    })
    .map(p => p.dataPath);

  const selected = await multiselect({
    message: 'Select projects to expose via MCP:',
    options,
    initialValues: currentlyExposed,
    required: false,
  });

  if (isCancel(selected)) {
    return;
  }

  // Update config
  const selectedPaths = selected as string[];
  logger.info('Configure: User selected projects by path', selectedPaths);

  // Ask for Semantic Search opt-in if any projects selected
  let enableSemanticSearch = false;
  if (selectedPaths.length > 0) {
      const shouldEnable = await confirm({
          message: 'Enable Semantic Search (Local Mini RAG)?',
          initialValue: false,
      });

      if (isCancel(shouldEnable)) return;
      
      enableSemanticSearch = shouldEnable as boolean;

      if (enableSemanticSearch) {
           note(
               `This enables "search_knowledge" tool for agents.\n` + 
               `First use will download a ~100MB embedding model (all-MiniLM-L6-v2)\n` +
               `to your local device (one-time).`, 
               'Semantic Search Enabled'
           );
      }
  }

  for (const project of projects) {
    const shouldExpose = selectedPaths.includes(project.dataPath);
    
    // Determine semantic config: 
    // If enabling, set it. If disabling (or not selected), passing undefined keeps existing?
    // setProjectConfig logic: "if (semanticSearch) existing.semanticSearch = semanticSearch"
    // So passing undefined preserves existing. 
    // But if we want to explicitly enable/disable based on this session?
    // The user flow "Enable Semantic Search?" applies to the selected batch.
    // If user says NO, should we disable it if it was enabled? or just not touch it?
    // "Enable ...?" implies turning it on. 
    // Let's assume: if user says YES, we turn it ON for all selected.
    // If user says NO, we leave it as is? Or we ask "Enable or Disable"?
    // Simpler: Apply "Enable" to selected.
    
    let semanticConfig = undefined;
    if (shouldExpose && enableSemanticSearch) {
        semanticConfig = { enabled: true };
    }
    
    // Pass strictly strictly defined dataPath as the unique ID for this config entry
    setProjectConfig(config, project.name, shouldExpose, undefined, project.dataPath, semanticConfig);
  }

  saveMCPConfig(config);
  logger.info('Configure: Config saved', config);

  const exposedCount = selectedPaths.length;
  note(
    `${pc.green('✓')} Configuration saved!\n\n` +
    `Exposed projects: ${exposedCount}\n` +
    `Hidden projects: ${projects.length - exposedCount}`,
    'Configuration Updated'
  );
}

/**
 * Prompt user to configure a global path for MCP
 * Returns true if configured successfully
 */
export async function handleConfigureGlobalPath(): Promise<boolean> {
  const { resolveGlobalPath } = await import('../../lib/tui-utils');
  const fs = await import('fs');
  const path = await import('path');

  note(
    `MCP Hub requires a ${pc.bold('global storage path')} to store its configuration
and coordinate across projects.

Your current setup uses ${pc.cyan('workspace')} mode, which stores data
locally in each project. MCP needs a central location.`,
    'Global Path Required'
  );

  const resolvedPath = await resolveGlobalPath();
  
  if (!resolvedPath) {
    return false;
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    
    const config = loadMCPConfig();
    saveMCPConfig(config);
    
    note(
      `${pc.green('✓')} Global path configured: ${pc.cyan(resolvedPath)}\n\n` +
      `MCP config will be stored at:\n${path.join(resolvedPath, 'mcp.yaml')}`,
      'Configuration Saved'
    );
    
    return true;
  } catch (error) {
    note(
      `${pc.red('✗')} Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
      'Error'
    );
    return false;
  }
}
