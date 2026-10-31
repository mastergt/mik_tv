import { Injectable, type LoggerService as NestLoggerService, type OnApplicationShutdown } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect } from 'node:util';
import * as log4js from 'log4js';
import type { RequestHandler } from 'express';

const LOG_PATTERN = '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] [%c] - %m';
const VALID_LEVELS = new Set(['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'MARK', 'OFF']);
let configured = false;

function booleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  if (raw.toLowerCase() === 'true' || raw === '1') return true;
  if (raw.toLowerCase() === 'false' || raw === '0') return false;
  throw new Error(`${name} must be true or false`);
}
function numberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

export function configureLogging(): void {
  if (configured) return;
  const level = (process.env.LOG_LEVEL ?? 'INFO').toUpperCase();
  if (!VALID_LEVELS.has(level)) throw new Error('Invalid LOG_LEVEL');
  const directory = resolve(process.env.LOG_DIR || './logs');
  mkdirSync(directory, { recursive: true, mode: 0o750 });
  const maxLogSize = numberEnv('LOG_MAX_SIZE_MB', 20, 1, 1024) * 1024 * 1024;
  const backups = numberEnv('LOG_BACKUPS', 10, 0, 100);
  const compress = booleanEnv('LOG_COMPRESS', true);
  const withConsole = booleanEnv('LOG_TO_CONSOLE', true);
  const layout = { type: 'pattern' as const, pattern: LOG_PATTERN };
  const fileOptions = { type: 'file' as const, maxLogSize, backups, compress, keepFileExt: true, layout, mode: 0o640 };
  const appenders: log4js.Configuration['appenders'] = {
    application: { ...fileOptions, filename: resolve(directory, 'application.log') },
    errors: { ...fileOptions, filename: resolve(directory, 'error.log') },
    errorsOnly: { type: 'logLevelFilter', appender: 'errors', level: 'ERROR' },
  };
  const active = ['application', 'errorsOnly'];
  if (withConsole) {
    appenders.terminal = { type: 'stdout', layout };
    active.push('terminal');
  }
  log4js.configure({ appenders, categories: { default: { appenders: active, level } } });
  configured = true;
}

function render(message: unknown): string {
  if (message instanceof Error) return message.stack || message.message;
  if (typeof message === 'string') return message;
  return inspect(message, { depth: 3, maxArrayLength: 25, breakLength: 160 });
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private write(level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'fatal', message: unknown, extra: unknown[]) {
    const context = typeof extra[extra.length - 1] === 'string' ? String(extra.pop()) : 'Application';
    const content = [render(message), ...extra.filter(x => x !== undefined).map(render)].join('\n');
    log4js.getLogger(context).log(level.toUpperCase(), content);
  }
  log(message: unknown, ...optionalParams: unknown[]) { this.write('info', message, [...optionalParams]); }
  info(message: unknown, context = 'Application') { this.write('info', message, [context]); }
  warn(message: unknown, ...optionalParams: unknown[]) { this.write('warn', message, [...optionalParams]); }
  error(message: unknown, ...optionalParams: unknown[]) { this.write('error', message, [...optionalParams]); }
  debug(message: unknown, ...optionalParams: unknown[]) { this.write('debug', message, [...optionalParams]); }
  verbose(message: unknown, ...optionalParams: unknown[]) { this.write('trace', message, [...optionalParams]); }
  fatal(message: unknown, ...optionalParams: unknown[]) { this.write('fatal', message, [...optionalParams]); }
}

export function httpAccessLogger(): RequestHandler | null {
  if (!booleanEnv('LOG_HTTP_REQUESTS', false)) return null;
  const logger = log4js.getLogger('HTTP');
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      // No query string, cookies, authorization headers, or request body in logs.
      const line = `${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms`;
      if (res.statusCode >= 500) logger.error(line);
      else if (res.statusCode >= 400) logger.warn(line);
      else logger.info(line);
    });
    next();
  };
}

@Injectable()
export class LoggerShutdown implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    if (!configured) return;
    await new Promise<void>(resolve => log4js.shutdown((err?: Error) => {
      if (err) process.stderr.write(`log4js shutdown: ${err.message}\n`);
      resolve();
    }));
    configured = false;
  }
}
