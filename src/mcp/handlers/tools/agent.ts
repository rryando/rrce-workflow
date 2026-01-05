import { 
  getContextPreamble,
} from '../../resources';
import { getAllPrompts, getPromptDef, renderPromptWithContext } from '../../prompts';

export const agentTools = [
  {
    name: 'list_agents',
    description: 'List available agents (e.g. init, plan) and their arguments. Use this to discover which agent to call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agent_prompt',
    description: 'Get the system prompt for a specific agent. Accepts agent Name (e.g. "RRCE Init") or ID (e.g. "init").',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Name of the agent (e.g. init, plan, execute)' },
        args: { type: 'object', description: 'Arguments for the agent prompt', additionalProperties: true },
      },
      required: ['agent'],
    },
  },
];

export async function handleAgentTool(name: string, args: Record<string, any> | undefined) {
  if (!args && name !== 'list_agents') return null;

  switch (name) {
    case 'list_agents': {
      const prompts = getAllPrompts();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(prompts.map(p => ({ 
            name: p.name, 
            id: p.id,
            description: p.description,
            arguments: p.arguments 
          })), null, 2) +
          "\n\nTip: Retrieve the prompt for an agent using `get_agent_prompt` with its name or ID.",
        }],
      };
    }

    case 'get_agent_prompt': {
      const params = args as { agent: string; args?: Record<string, string> };
      const agentName = params.agent;
      const promptDef = getPromptDef(agentName);
      
      if (!promptDef) {
        const available = getAllPrompts().map(p => `${p.name} (id: ${p.id})`).join(', ');
        throw new Error(`Agent not found: ${agentName}. Available agents: ${available}`);
      }
      
      // Render content
      const renderArgs = params.args || {};
      // Ensure strings
      const stringArgs: Record<string, string> = {};
      for (const [key, val] of Object.entries(renderArgs)) {
        stringArgs[key] = String(val);
      }
       
      const { rendered } = renderPromptWithContext(promptDef.content, stringArgs);
      
      // Single source of truth for context - no duplicate path sections
      // getContextPreamble() provides minimal System Context table
      // Base protocol (injected by renderPromptWithContext) explains how to use it
      const contextPreamble = getContextPreamble();

      return { content: [{ type: 'text', text: contextPreamble + rendered }] };
    }

    default:
      return null;
  }
}
