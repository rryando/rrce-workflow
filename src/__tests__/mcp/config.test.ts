import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { loadMCPConfig, saveMCPConfig } from '../../mcp/config';
import { getEffectiveRRCEHome, detectWorkspaceRoot } from '../../lib/paths';

vi.mock('fs');
vi.mock('../../lib/paths');

describe('mcp/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (detectWorkspaceRoot as any).mockReturnValue('/work');
    (getEffectiveRRCEHome as any).mockReturnValue('/home/user/.rrce-workflow');
  });

  describe('last_synced_version', () => {
    it('should load and save last_synced_version', () => {
      const mockConfig = {
        server: { port: 3000, autoStart: false },
        projects: [
          {
            name: 'test-project',
            expose: true,
            permissions: { knowledge: true, tasks: true, refs: true },
            last_synced_version: '0.2.98'
          }
        ],
        defaults: { includeNew: false, permissions: { knowledge: true, tasks: true, refs: true } },
        last_synced_version: '0.2.98'
      };

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockConfig));
      const writeSpy = vi.spyOn(fs, 'writeFileSync');

      const config = loadMCPConfig();
      expect(config.last_synced_version).toBe('0.2.98');
      expect(config.projects[0]?.last_synced_version).toBe('0.2.98');

      config.last_synced_version = '0.3.0';
      if (config.projects[0]) {
        config.projects[0].last_synced_version = '0.3.0';
      }
      saveMCPConfig(config);

      expect(writeSpy).toHaveBeenCalled();
      const writeCall = writeSpy.mock.calls[0];
      if (!writeCall) throw new Error('write was not called');
      const content = writeCall[1] as string;
      
      // We use YAML.stringify which is harder to parse back with JSON.parse if it has headers
      // Let's just check for the string presence
      expect(content).toContain('last_synced_version: 0.3.0');
    });
  });
});
