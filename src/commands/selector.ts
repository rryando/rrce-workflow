import { intro, select, note, cancel, isCancel, outro } from '@clack/prompts';
import pc from 'picocolors';
import * as path from 'path';
import { loadPromptsFromDir, getAgentCorePromptsDir } from '../lib/prompts';
import type { ParsedPrompt } from '../types/prompt';

export async function runSelector() {
  const workspaceName = path.basename(process.cwd());
  
  intro(pc.cyan(pc.inverse(` RRCE-Workflow | ${workspaceName} `)));

  const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

  if (prompts.length === 0) {
    cancel('No agents found. Run `rrce-workflow` to set up.');
    process.exit(0);
  }

  const selection = await select({
    message: 'Select an agent:',
    options: prompts.map(p => ({
      value: p,
      label: p.frontmatter.name,
      hint: p.frontmatter.description
    })),
  });

  if (isCancel(selection)) {
    cancel('Selection cancelled.');
    process.exit(0);
  }

  const prompt = selection as ParsedPrompt;
  
  note(
    `Use this agent in your IDE by invoking:
${pc.bold(pc.cyan(`@${prompt.frontmatter.name}`))}`,
    'Agent Selected'
  );

  outro('Done');
}
