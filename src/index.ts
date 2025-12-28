import { runWizard } from './commands/wizard/index';
import { runSelector } from './commands/selector';
import { runMCP } from './mcp/index';

// Get command from args
const command = process.argv[2];
const subcommand = process.argv[3];

if (!command || command === 'wizard') {
  runWizard();
} else if (command === 'mcp') {
  runMCP(subcommand);
} else {
  runSelector();
}
