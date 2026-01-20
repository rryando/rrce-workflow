import { runWizard } from './commands/wizard/index';
import { runMCP } from './mcp/index';

// Get command from args
const command = process.argv[2];
const subcommand = process.argv[3];

if (!command || command === 'wizard' || command === 'install') {
  runWizard();
} else if (command === 'mcp') {
  runMCP(subcommand);
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: rrce-workflow [wizard|install|mcp]');
  process.exit(1);
}
