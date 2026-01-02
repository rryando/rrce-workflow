import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DriftService } from '../../lib/drift-service';

vi.mock('fs');
vi.mock('crypto');

describe('DriftService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateHash', () => {
    it('should calculate md5 hash of file content', () => {
      const content = Buffer.from('test content');
      (fs.readFileSync as any).mockReturnValue(content);
      const mockHash = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('mockhash'),
      };
      (crypto.createHash as any).mockReturnValue(mockHash);

      const hash = DriftService.calculateHash('dummy.txt');

      expect(fs.readFileSync).toHaveBeenCalledWith('dummy.txt');
      expect(crypto.createHash).toHaveBeenCalledWith('md5');
      expect(mockHash.update).toHaveBeenCalledWith(content);
      expect(hash).toBe('mockhash');
    });
  });

  describe('checkDrift', () => {
    it('should detect version drift', () => {
      (fs.existsSync as any).mockReturnValue(false); // No manifest
      
      const report = DriftService.checkDrift('/path', '1.0.0', '1.1.0');

      expect(report.hasDrift).toBe(true);
      expect(report.type).toBe('version');
      expect(report.version.current).toBe('1.0.0');
      expect(report.version.running).toBe('1.1.0');
    });

    it('should detect modification drift when versions match', () => {
      // Mock manifest
      const manifest = {
        'file.txt': { hash: 'oldhash', mtime: 100 }
      };
      (fs.existsSync as any).mockImplementation((p: string) => p.endsWith('.rrce-checksums.json') || p.endsWith('file.txt'));
      (fs.readFileSync as any).mockImplementation((p: string) => {
        if (p.endsWith('.rrce-checksums.json')) return JSON.stringify(manifest);
        return 'new content';
      });
      (fs.statSync as any).mockReturnValue({ mtimeMs: 200 });
      
      const mockHash = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('newhash'),
      };
      (crypto.createHash as any).mockReturnValue(mockHash);

      const report = DriftService.checkDrift('/path', '1.0.0', '1.0.0');

      expect(report.hasDrift).toBe(true);
      expect(report.type).toBe('modified');
      expect(report.modifiedFiles).toContain('file.txt');
    });

    it('should return no drift when everything matches', () => {
       const manifest = {
        'file.txt': { hash: 'samehash', mtime: 100 }
      };
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation((p: string) => {
        if (p.endsWith('.rrce-checksums.json')) return JSON.stringify(manifest);
        return 'content';
      });
      (fs.statSync as any).mockReturnValue({ mtimeMs: 100 });

      const report = DriftService.checkDrift('/path', '1.0.0', '1.0.0');

      expect(report.hasDrift).toBe(false);
      expect(report.type).toBe('none');
    });
  });
});
