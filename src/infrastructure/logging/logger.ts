/**
 * Logger Implementation
 * Production-ready logging with multiple transports
 */

import winston from 'winston';
import { ILogger } from '../../core/interfaces/core-abstractions.js';

export interface LoggerConfig {
  level?: string;
  console?: boolean;
  file?: boolean;
  filePath?: string;
  format?: 'json' | 'text';
  maxFileSize?: number;
  maxFiles?: number;
}

export class Logger implements ILogger {
  private winston: winston.Logger;

  constructor(config: LoggerConfig = {}) {
    const transports: winston.transport[] = [];

    // Console transport
    if (config.console !== false) {
      transports.push(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      }));
    }

    // File transport
    if (config.file && config.filePath) {
      transports.push(new winston.transports.File({
        filename: config.filePath,
        format: winston.format.json(),
        maxsize: config.maxFileSize || 10485760, // 10MB
        maxFiles: config.maxFiles || 5
      }));
    }

    this.winston = winston.createLogger({
      level: config.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports
    });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.winston.debug(message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.winston.info(message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.winston.warn(message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.winston.error(message, {
      ...context,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }

  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.winston.error(message, {
      ...context,
      level: 'fatal',
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }
}