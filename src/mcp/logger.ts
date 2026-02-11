import * as fs from 'fs';
import * as path from 'path';
import { getEffectiveRRCEHome, detectWorkspaceRoot } from '../lib/paths';
import { writeFileAtomic } from '../lib/fs-safe';

/**
 * Get the path to the MCP server log file
 */
export function getLogFilePath(): string {
  const workspaceRoot = detectWorkspaceRoot();
  const rrceHome = getEffectiveRRCEHome(workspaceRoot);
  return path.join(rrceHome, 'mcp-server.log');
}

/**
 * Simple file-based logger for MCP server debugging
 */
class Logger {
  private logPath: string;
  private readonly maxBytes = 2 * 1024 * 1024;
  private readonly trimToBytes = 512 * 1024;
  private writeCount = 0;
  private readonly trimCheckInterval = 100; // Check trim every N writes
  private dirEnsured = false;

  constructor() {
    this.logPath = getLogFilePath();
  }

  private write(level: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level}] ${message}`;

    if (data) {
      if (data instanceof Error) {
        logMessage += `\n${data.stack || data.message}`;
      } else {
        try {
          logMessage += `\n${JSON.stringify(data, null, 2)}`;
        } catch (e) {
          logMessage += `\n[Circular or invalid data]`;
        }
      }
    }

    logMessage += '\n';

    try {
      // Ensure directory exists (only check once)
      if (!this.dirEnsured) {
        const dir = path.dirname(this.logPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.dirEnsured = true;
      }
      // Only check trim periodically to reduce stat calls
      if (++this.writeCount % this.trimCheckInterval === 0) {
        this.trimIfNeeded();
      }
      fs.appendFileSync(this.logPath, logMessage);
    } catch (e) {
      // Fallback to console if file write fails to avoid crashing
      console.error(`[Logger Failure] Could not write to ${this.logPath}`, e);
      console.error(logMessage);
    }
  }

  private trimIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logPath)) return;
      const stats = fs.statSync(this.logPath);
      if (stats.size <= this.maxBytes) return;

      const start = Math.max(0, stats.size - this.trimToBytes);
      const buffer = Buffer.alloc(stats.size - start);
      const fd = fs.openSync(this.logPath, 'r');
      try {
        fs.readSync(fd, buffer, 0, buffer.length, start);
      } finally {
        fs.closeSync(fd);
      }

      const header = `[${new Date().toISOString()}] [INFO] Log truncated to last ${this.trimToBytes} bytes\n`;
      writeFileAtomic(this.logPath, header + buffer.toString('utf-8'));
    } catch (e) {
      console.error(`[Logger Failure] Could not trim ${this.logPath}`, e);
    }
  }

  info(message: string, data?: any) {
    this.write('INFO', message, data);
  }

  error(message: string, error?: any) {
    this.write('ERROR', message, error);
  }

  warn(message: string, data?: any) {
    this.write('WARN', message, data);
  }

  debug(message: string, data?: any) {
    this.write('DEBUG', message, data);
  }
}

export const logger = new Logger();
