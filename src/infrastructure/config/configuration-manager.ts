/**
 * Configuration Management System
 * Centralized, type-safe configuration with validation
 */

import { z } from 'zod';
import { Result, ResultUtil, ValidationError, IConfigurationProvider } from './core-abstractions';
import { config as dotenv } from 'dotenv';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============================================
// CONFIGURATION SCHEMAS
// ============================================

/**
 * Connection configuration schema
 */
const ConnectionConfigSchema = z.object({
  solidworksPath: z.string().optional(),
  retryAttempts: z.number().min(1).max(10).default(3),
  retryDelay: z.number().min(100).max(10000).default(1000),
  timeout: z.number().min(1000).max(300000).default(30000),
  autoConnect: z.boolean().default(true),
});

/**
 * Logging configuration schema
 */
const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  console: z.boolean().default(true),
  file: z.boolean().default(false),
  filePath: z.string().optional(),
  maxFileSize: z.number().min(1024).default(10485760), // 10MB
  maxFiles: z.number().min(1).max(100).default(5),
  format: z.enum(['json', 'text']).default('json'),
});

/**
 * Cache configuration schema
 */
const CacheConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxEntries: z.number().min(10).max(10000).default(1000),
  ttl: z.number().min(1000).default(3600000), // 1 hour
  strategy: z.enum(['lru', 'lfu', 'fifo']).default('lru'),
});

/**
 * Performance configuration schema
 */
const PerformanceConfigSchema = z.object({
  maxConcurrentOperations: z.number().min(1).max(20).default(5),
  operationTimeout: z.number().min(1000).default(60000),
  memoryLimit: z.number().min(104857600).optional(), // 100MB minimum
  enableMetrics: z.boolean().default(true),
});

/**
 * Security configuration schema
 */
const SecurityConfigSchema = z.object({
  enableMacroSecurity: z.boolean().default(true),
  macroSecurityLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  trustedPaths: z.array(z.string()).default([]),
  enableAudit: z.boolean().default(false),
  encryptSensitiveData: z.boolean().default(true),
});

/**
 * Templates configuration schema
 */
const TemplatesConfigSchema = z.object({
  partTemplate: z.string().optional(),
  assemblyTemplate: z.string().optional(),
  drawingTemplate: z.string().optional(),
  customTemplatesPath: z.string().optional(),
  autoDetectTemplates: z.boolean().default(true),
});

/**
 * Database configuration schema
 */
const DatabaseConfigSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(['mssql', 'postgresql', 'sqlite']).optional(),
  connectionString: z.string().optional(),
  poolSize: z.number().min(1).max(100).default(10),
  connectionTimeout: z.number().min(1000).default(15000),
});

/**
 * Feature flags schema
 */
const FeatureFlagsSchema = z.object({
  enableMacroRecording: z.boolean().default(true),
  enablePDM: z.boolean().default(false),
  enableDesignTables: z.boolean().default(true),
  enableVBAGeneration: z.boolean().default(true),
  enableAdvancedAnalysis: z.boolean().default(false),
  enableExperimentalFeatures: z.boolean().default(false),
});

/**
 * Complete configuration schema
 */
const ConfigurationSchema = z.object({
  connection: ConnectionConfigSchema,
  logging: LoggingConfigSchema,
  cache: CacheConfigSchema,
  performance: PerformanceConfigSchema,
  security: SecurityConfigSchema,
  templates: TemplatesConfigSchema,
  database: DatabaseConfigSchema,
  features: FeatureFlagsSchema,
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  version: z.string().default('2.0.0'),
});

export type Configuration = z.infer<typeof ConfigurationSchema>;

// ============================================
// CONFIGURATION SOURCES
// ============================================

/**
 * Configuration source interface
 */
interface IConfigurationSource {
  load(): Promise<Result<Record<string, unknown>>>;
  save?(config: Record<string, unknown>): Promise<Result<void>>;
  priority: number;
}

/**
 * Environment variables configuration source
 */
class EnvironmentConfigSource implements IConfigurationSource {
  priority = 1;

  async load(): Promise<Result<Record<string, unknown>>> {
    try {
      dotenv();
      
      const config: Record<string, unknown> = {};
      
      // Map environment variables to configuration
      const mappings: Record<string, string[]> = {
        'SOLIDWORKS_PATH': ['connection', 'solidworksPath'],
        'RETRY_ATTEMPTS': ['connection', 'retryAttempts'],
        'RETRY_DELAY': ['connection', 'retryDelay'],
        'CONNECTION_TIMEOUT': ['connection', 'timeout'],
        'LOG_LEVEL': ['logging', 'level'],
        'LOG_TO_FILE': ['logging', 'file'],
        'LOG_FILE_PATH': ['logging', 'filePath'],
        'CACHE_ENABLED': ['cache', 'enabled'],
        'CACHE_TTL': ['cache', 'ttl'],
        'MAX_CONCURRENT_OPS': ['performance', 'maxConcurrentOperations'],
        'ENABLE_MACRO_RECORDING': ['features', 'enableMacroRecording'],
        'ENABLE_PDM': ['features', 'enablePDM'],
        'DB_CONNECTION_STRING': ['database', 'connectionString'],
        'DB_TYPE': ['database', 'type'],
        'NODE_ENV': ['environment'],
      };

      for (const [envVar, path] of Object.entries(mappings)) {
        const value = process.env[envVar];
        if (value !== undefined) {
          this.setNestedValue(config, path, this.parseValue(value));
        }
      }

      return ResultUtil.ok(config);
    } catch (error) {
      return ResultUtil.fail(
        new ValidationError('Failed to load environment configuration', { error })
      );
    }
  }

  private setNestedValue(obj: any, path: string[], value: unknown): void {
    const last = path[path.length - 1];
    const parent = path.slice(0, -1).reduce((acc, key) => {
      if (!acc[key]) acc[key] = {};
      return acc[key];
    }, obj);
    parent[last] = value;
  }

  private parseValue(value: string): unknown {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Parse booleans
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      
      // Parse numbers
      const num = Number(value);
      if (!isNaN(num)) return num;
      
      // Return as string
      return value;
    }
  }
}

/**
 * JSON file configuration source
 */
class JsonFileConfigSource implements IConfigurationSource {
  priority = 2;

  constructor(private readonly filePath: string) {}

  async load(): Promise<Result<Record<string, unknown>>> {
    try {
      if (!existsSync(this.filePath)) {
        return ResultUtil.ok({});
      }

      const content = readFileSync(this.filePath, 'utf-8');
      const config = JSON.parse(content);
      
      return ResultUtil.ok(config);
    } catch (error) {
      return ResultUtil.fail(
        new ValidationError('Failed to load JSON configuration', { 
          file: this.filePath,
          error 
        })
      );
    }
  }

  async save(config: Record<string, unknown>): Promise<Result<void>> {
    try {
      const content = JSON.stringify(config, null, 2);
      writeFileSync(this.filePath, content, 'utf-8');
      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new ValidationError('Failed to save JSON configuration', { 
          file: this.filePath,
          error 
        })
      );
    }
  }
}

/**
 * Default configuration source
 */
class DefaultConfigSource implements IConfigurationSource {
  priority = 0;

  async load(): Promise<Result<Record<string, unknown>>> {
    const defaults: Partial<Configuration> = {
      connection: {
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
        autoConnect: true,
      },
      logging: {
        level: 'info',
        console: true,
        file: false,
        maxFileSize: 10485760,
        maxFiles: 5,
        format: 'json',
      },
      cache: {
        enabled: true,
        maxEntries: 1000,
        ttl: 3600000,
        strategy: 'lru',
      },
      performance: {
        maxConcurrentOperations: 5,
        operationTimeout: 60000,
        enableMetrics: true,
      },
      security: {
        enableMacroSecurity: true,
        macroSecurityLevel: 'medium',
        trustedPaths: [],
        enableAudit: false,
        encryptSensitiveData: true,
      },
      templates: {
        autoDetectTemplates: true,
      },
      database: {
        enabled: false,
        poolSize: 10,
        connectionTimeout: 15000,
      },
      features: {
        enableMacroRecording: true,
        enablePDM: false,
        enableDesignTables: true,
        enableVBAGeneration: true,
        enableAdvancedAnalysis: false,
        enableExperimentalFeatures: false,
      },
      environment: 'production',
      version: '2.0.0',
    };

    return ResultUtil.ok(defaults as Record<string, unknown>);
  }
}

// ============================================
// CONFIGURATION MANAGER
// ============================================

/**
 * Main configuration manager
 */
export class ConfigurationManager implements IConfigurationProvider {
  private config: Configuration | null = null;
  private readonly sources: IConfigurationSource[] = [];
  private readonly listeners: Map<string, Set<(value: unknown) => void>> = new Map();

  constructor() {
    // Add default sources
    this.addSource(new DefaultConfigSource());
    this.addSource(new EnvironmentConfigSource());
    
    // Add JSON file sources
    const configPaths = [
      join(process.cwd(), 'solidworks-mcp.config.json'),
      join(process.cwd(), '.solidworks-mcp', 'config.json'),
      join(process.env.APPDATA || '', 'solidworks-mcp', 'config.json'),
    ];

    for (const path of configPaths) {
      if (path && existsSync(path)) {
        this.addSource(new JsonFileConfigSource(path));
        break;
      }
    }
  }

  /**
   * Add a configuration source
   */
  addSource(source: IConfigurationSource): void {
    this.sources.push(source);
    this.sources.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Load configuration from all sources
   */
  async reload(): Promise<Result<void>> {
    try {
      let mergedConfig: Record<string, unknown> = {};

      // Load from all sources in priority order
      for (const source of this.sources) {
        const result = await source.load();
        if (ResultUtil.isSuccess(result)) {
          mergedConfig = this.deepMerge(mergedConfig, result.data);
        }
      }

      // Validate configuration
      const validationResult = ConfigurationSchema.safeParse(mergedConfig);
      
      if (!validationResult.success) {
        return ResultUtil.fail(
          new ValidationError('Configuration validation failed', {
            errors: validationResult.error.errors,
          })
        );
      }

      const oldConfig = this.config;
      this.config = validationResult.data;

      // Notify listeners of changes
      if (oldConfig) {
        this.notifyChanges(oldConfig, this.config);
      }

      return ResultUtil.ok(undefined);
    } catch (error) {
      return ResultUtil.fail(
        new ValidationError('Failed to reload configuration', { error })
      );
    }
  }

  /**
   * Get configuration value
   */
  get<T = unknown>(key: string): T | undefined {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call reload() first.');
    }

    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value as T;
  }

  /**
   * Get required configuration value
   */
  getRequired<T = unknown>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new Error(`Required configuration key not found: ${key}`);
    }
    return value;
  }

  /**
   * Set configuration value
   */
  set(key: string, value: unknown): void {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call reload() first.');
    }

    const keys = key.split('.');
    const last = keys[keys.length - 1];
    const parent = keys.slice(0, -1).reduce((acc: any, k) => {
      if (!acc[k]) acc[k] = {};
      return acc[k];
    }, this.config);

    const oldValue = parent[last];
    parent[last] = value;

    // Validate after change
    const validationResult = this.validate();
    if (ResultUtil.isFailure(validationResult)) {
      // Rollback change
      parent[last] = oldValue;
      throw new Error(`Invalid configuration value for ${key}`);
    }

    // Notify listeners
    this.notifyKey(key, value);
  }

  /**
   * Check if configuration has a key
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Validate current configuration
   */
  validate(): Result<void> {
    if (!this.config) {
      return ResultUtil.fail(
        new ValidationError('No configuration loaded')
      );
    }

    const result = ConfigurationSchema.safeParse(this.config);
    
    if (!result.success) {
      return ResultUtil.fail(
        new ValidationError('Configuration validation failed', {
          errors: result.error.errors,
        })
      );
    }

    return ResultUtil.ok(undefined);
  }

  /**
   * Get full configuration
   */
  getConfiguration(): Configuration {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call reload() first.');
    }
    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(filePath?: string): Promise<Result<void>> {
    if (!this.config) {
      return ResultUtil.fail(
        new ValidationError('No configuration to save')
      );
    }

    const path = filePath || join(process.cwd(), 'solidworks-mcp.config.json');
    const source = new JsonFileConfigSource(path);
    
    return source.save(this.config as Record<string, unknown>);
  }

  /**
   * Watch for configuration changes
   */
  watch(key: string, callback: (value: unknown) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Notify listeners of changes
   */
  private notifyChanges(oldConfig: Configuration, newConfig: Configuration): void {
    const changes = this.findChanges(oldConfig, newConfig);
    
    for (const key of changes) {
      this.notifyKey(key, this.get(key));
    }
  }

  /**
   * Notify listeners for a specific key
   */
  private notifyKey(key: string, value: unknown): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(value);
        } catch (error) {
          console.error(`Error in configuration listener for ${key}:`, error);
        }
      }
    }
  }

  /**
   * Find changed keys between configurations
   */
  private findChanges(
    oldConfig: any,
    newConfig: any,
    prefix = ''
  ): string[] {
    const changes: string[] = [];

    for (const key in newConfig) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (!(key in oldConfig)) {
        changes.push(fullKey);
      } else if (typeof newConfig[key] === 'object' && !Array.isArray(newConfig[key])) {
        changes.push(...this.findChanges(oldConfig[key], newConfig[key], fullKey));
      } else if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        changes.push(fullKey);
      }
    }

    return changes;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const configManager = new ConfigurationManager();

// ============================================
// CONFIGURATION HELPERS
// ============================================

/**
 * Get typed configuration sections
 */
export class ConfigHelper {
  static getConnectionConfig(): Configuration['connection'] {
    return configManager.getRequired<Configuration['connection']>('connection');
  }

  static getLoggingConfig(): Configuration['logging'] {
    return configManager.getRequired<Configuration['logging']>('logging');
  }

  static getCacheConfig(): Configuration['cache'] {
    return configManager.getRequired<Configuration['cache']>('cache');
  }

  static getPerformanceConfig(): Configuration['performance'] {
    return configManager.getRequired<Configuration['performance']>('performance');
  }

  static getSecurityConfig(): Configuration['security'] {
    return configManager.getRequired<Configuration['security']>('security');
  }

  static getTemplatesConfig(): Configuration['templates'] {
    return configManager.getRequired<Configuration['templates']>('templates');
  }

  static getDatabaseConfig(): Configuration['database'] {
    return configManager.getRequired<Configuration['database']>('database');
  }

  static getFeatureFlags(): Configuration['features'] {
    return configManager.getRequired<Configuration['features']>('features');
  }

  static getEnvironment(): Configuration['environment'] {
    return configManager.getRequired<Configuration['environment']>('environment');
  }

  static isDevelopment(): boolean {
    return ConfigHelper.getEnvironment() === 'development';
  }

  static isProduction(): boolean {
    return ConfigHelper.getEnvironment() === 'production';
  }
}
