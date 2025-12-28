import * as fs from 'fs';
import * as path from 'path';
import { getEffectiveRRCEHome, detectWorkspaceRoot } from '../lib/paths';

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
      // Ensure directory exists
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this.logPath, logMessage);
    } catch (e) {
      // Fallback to console if file write fails to avoid crashing
      console.error(`[Logger Failure] Could not write to ${this.logPath}`, e);
      console.error(logMessage);
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
