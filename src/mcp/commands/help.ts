import { note } from '@clack/prompts';
import pc from 'picocolors';

/**
 * Show help information
 */
export function showHelp(): void {
  const help = `
${pc.bold('RRCE MCP Hub')} - Cross-project AI assistant server

${pc.bold('ABOUT')}
MCP (Model Context Protocol) allows AI assistants like Claude to 
access your project knowledge in real-time. The RRCE MCP Hub 
provides a central server that exposes selected projects.

${pc.bold('MENU OPTIONS')}
  ${pc.cyan('Start MCP server')}      Start the server for AI access
  ${pc.cyan('Configure projects')}    Choose which projects to expose
  ${pc.cyan('Install to IDE')}        Add to Antigravity, VSCode, or Claude
  ${pc.cyan('View status')}           See which projects are exposed

${pc.bold('DIRECT COMMANDS')}
  ${pc.dim('rrce-workflow mcp start')}    Start server directly
  ${pc.dim('rrce-workflow mcp stop')}     Stop server directly
  ${pc.dim('rrce-workflow mcp status')}   Show status directly
  ${pc.dim('rrce-workflow mcp help')}     Show this help

${pc.bold('IDE INSTALLATION')}
  ${pc.cyan('Antigravity')}    ~/.gemini/antigravity/mcp_config.json
  ${pc.cyan('VSCode Global')} ~/.config/Code/User/settings.json
  ${pc.cyan('VSCode Workspace')} .vscode/mcp.json
  ${pc.cyan('Claude Desktop')} ~/.config/claude/claude_desktop_config.json

${pc.bold('SERVER COMMANDS')} (while running)
  ${pc.cyan('q')} Stop and quit       ${pc.cyan('p')} Reconfigure projects
  ${pc.cyan('i')} Install to IDE      ${pc.cyan('r')} Reload config
  ${pc.cyan('c')} Clear logs          ${pc.cyan('?')} Show help

${pc.bold('RESOURCES EXPOSED')}
  ${pc.cyan('rrce://projects')}              List all exposed projects
  ${pc.cyan('rrce://projects/{name}/context')}  Get project context
  ${pc.cyan('rrce://projects/{name}/tasks')}    Get project tasks
`;

  note(help.trim(), 'Help');
}
