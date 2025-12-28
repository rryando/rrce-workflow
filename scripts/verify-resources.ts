
import * as fs from 'fs';
import * as path from 'path';

// Setup Mock Environment Variables MUST happen before importing app code
const TEST_DIR = path.join(process.cwd(), 'temp_test_env');
const RRCE_HOME = path.join(TEST_DIR, '.rrce-workflow');
const HOME = TEST_DIR; 

// Override process.env immediately
process.env.RRCE_HOME = RRCE_HOME;
process.env.HOME = HOME;

// Mock Projects Paths
const PROJECT_A_PATH = path.join(TEST_DIR, 'ProjectA'); 
const PROJECT_B_PATH = path.join(TEST_DIR, 'ProjectB'); 
const GLOBAL_PROJ_PATH = path.join(RRCE_HOME, 'workspaces', 'GlobalProj');


async function setupAsync() {
    // Clean
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  
  // Create Structs
  fs.mkdirSync(RRCE_HOME, { recursive: true });
  fs.mkdirSync(path.join(RRCE_HOME, 'workspaces'), { recursive: true });
  fs.mkdirSync(path.join(PROJECT_A_PATH, '.rrce-workflow'), { recursive: true });
  fs.mkdirSync(path.join(PROJECT_B_PATH, '.rrce-workflow'), { recursive: true });
  fs.mkdirSync(path.join(GLOBAL_PROJ_PATH, '.rrce-workflow'), { recursive: true });

  const { saveMCPConfig } = await import('../src/mcp/config');
  const { DEFAULT_MCP_CONFIG } = await import('../src/mcp/types');

  const config = { ...DEFAULT_MCP_CONFIG };
  config.projects = [{
      name: 'GlobalProj',
      expose: true,
      permissions: config.defaults.permissions,
      path: GLOBAL_PROJ_PATH 
  }];
  saveMCPConfig(config);

  // Project B Config
  fs.writeFileSync(path.join(PROJECT_B_PATH, '.rrce-workflow', 'config.yaml'), `
name: ProjectB
mode: workspace
`);

  // Project A Config
  fs.writeFileSync(path.join(PROJECT_A_PATH, '.rrce-workflow', 'config.yaml'), `
name: ProjectA
mode: workspace
linked_projects:
  - ProjectB:local
`);

  console.log('Setup complete.');
}

async function run() {
  await setupAsync();

  // Mock CWD to be Project A
  const originalCwd = process.cwd();
  process.chdir(PROJECT_A_PATH);
  console.log(`CWD set to: ${process.cwd()}`);

  try {
    // Dynamic import to ensure it picks up the env vars
    console.log('Environment RRCE_HOME:', process.env.RRCE_HOME);
    
    // Import internals for debugging
    const { getRRCEHome } = await import('../src/lib/paths');
    console.log('paths.ts resolved RRCE_HOME:', getRRCEHome());
    
    const { scanForProjects } = await import('../src/lib/detection');
    const { loadMCPConfig } = await import('../src/mcp/config');
    const mcpConfig = loadMCPConfig();
    console.log('MCP Config loaded:', JSON.stringify(mcpConfig, null, 2));

    const allProjects = scanForProjects();
    console.log('All Detected Projects (Unfiltered):', allProjects.map(p => `${p.name} (${p.source})`));

    const { getExposedProjects } = await import('../src/mcp/resources');

    // Run detection
    console.log('Running getExposedProjects()...');
    const projects = getExposedProjects();
    
    console.log('Detected Projects:', projects.map(p => `${p.name} (${p.source})`));
    
    // Assertions
    const hasGlobal = projects.some(p => p.name === 'GlobalProj');
    const hasLinked = projects.some(p => p.name === 'ProjectB');
    
    if (hasGlobal && hasLinked) {
        console.log('✅ VERIFICATION PASSED: Found both global and locally linked projects.');
    } else {
        console.error('❌ VERIFICATION FAILED: Missing projects.');
        if (!hasGlobal) console.error('   - Missing GlobalProj');
        if (!hasLinked) console.error('   - Missing ProjectB (Linked)');
        process.exit(1);
    }

  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

run();
