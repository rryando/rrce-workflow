import { runWizard } from './commands/wizard/index';
import { runSelector } from './commands/selector';

// Get command from args
const command = process.argv[2];

if (!command || command === 'wizard') {
  runWizard();
} else {
  runSelector();
}
