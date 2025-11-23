/**
 * Plugin Loader - Dynamic plugin loading and management
 * Supports loading plugins from files, directories, and npm packages
 */

import { promises as fs } from 'fs';
import path from 'path';
import {
  ToolPlugin,
  PluginManifest,
  EnhancedTool,
  RegisteredMiddleware,
} from './enhanced-tool.types.js';
import { DynamicToolRegistry } from './dynamic-registry.js';
import { ILogger, Result, ResultUtil } from '../interfaces/core-abstractions.js';

// ============================================
// PLUGIN MANIFEST SCHEMA
// ============================================

const MANIFEST_FILENAME = 'plugin.json';

interface PluginModule {
  tools?: EnhancedTool[];
  middleware?: RegisteredMiddleware[];
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
  default?: EnhancedTool[] | ToolPlugin;
}

// ============================================
// PLUGIN LOADER
// ============================================

export interface PluginLoaderOptions {
  logger?: ILogger;
  pluginDirs?: string[];
  autoLoad?: boolean;
}

export class PluginLoader {
  private logger?: ILogger;
  private pluginDirs: string[];
  private loadedPlugins: Map<string, { path: string; plugin: ToolPlugin }> = new Map();

  constructor(options: PluginLoaderOptions = {}) {
    this.logger = options.logger;
    this.pluginDirs = options.pluginDirs || [];
  }

  /**
   * Add a plugin directory
   */
  addPluginDir(dir: string): this {
    if (!this.pluginDirs.includes(dir)) {
      this.pluginDirs.push(dir);
    }
    return this;
  }

  /**
   * Load a plugin from a file path
   */
  async loadFromFile(filePath: string): Promise<Result<ToolPlugin>> {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if it's a directory (plugin folder) or a file
      const stats = await fs.stat(absolutePath);

      if (stats.isDirectory()) {
        return this.loadFromDirectory(absolutePath);
      }

      // Load single file plugin
      const module = await this.importModule(absolutePath);
      const plugin = this.extractPlugin(module, absolutePath);

      this.loadedPlugins.set(plugin.manifest.id, { path: absolutePath, plugin });
      this.logger?.info(`Loaded plugin from file: ${filePath}`, {
        pluginId: plugin.manifest.id,
      });

      return ResultUtil.ok(plugin);
    } catch (error) {
      this.logger?.error(`Failed to load plugin from ${filePath}`, error as Error);
      return ResultUtil.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Load a plugin from a directory
   */
  async loadFromDirectory(dirPath: string): Promise<Result<ToolPlugin>> {
    try {
      const absolutePath = path.resolve(dirPath);

      // Look for manifest
      const manifestPath = path.join(absolutePath, MANIFEST_FILENAME);
      let manifest: PluginManifest;

      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(manifestContent);
      } catch {
        // Generate manifest from directory name
        manifest = {
          id: path.basename(absolutePath),
          name: path.basename(absolutePath),
          version: '1.0.0',
          description: `Plugin from ${path.basename(absolutePath)}`,
        };
      }

      // Look for entry point
      const entryPoints = ['index.js', 'index.ts', 'plugin.js', 'plugin.ts'];
      let entryPath: string | null = null;

      for (const entry of entryPoints) {
        const fullPath = path.join(absolutePath, entry);
        try {
          await fs.access(fullPath);
          entryPath = fullPath;
          break;
        } catch {
          // Continue to next entry point
        }
      }

      if (!entryPath) {
        return ResultUtil.fail(new Error(`No entry point found in ${dirPath}`));
      }

      // Load the module
      const module = await this.importModule(entryPath);
      const plugin = this.extractPlugin(module, absolutePath, manifest);

      this.loadedPlugins.set(plugin.manifest.id, { path: absolutePath, plugin });
      this.logger?.info(`Loaded plugin from directory: ${dirPath}`, {
        pluginId: plugin.manifest.id,
        tools: plugin.tools.length,
      });

      return ResultUtil.ok(plugin);
    } catch (error) {
      this.logger?.error(`Failed to load plugin from ${dirPath}`, error as Error);
      return ResultUtil.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Discover and load all plugins from configured directories
   */
  async discoverPlugins(): Promise<ToolPlugin[]> {
    const plugins: ToolPlugin[] = [];

    for (const dir of this.pluginDirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const result = await this.loadFromDirectory(path.join(dir, entry.name));
            if (result.success) {
              plugins.push(result.data);
            }
          } else if (entry.name.endsWith('.js') || entry.name.endsWith('.ts')) {
            const result = await this.loadFromFile(path.join(dir, entry.name));
            if (result.success) {
              plugins.push(result.data);
            }
          }
        }
      } catch (error) {
        this.logger?.warn(`Failed to scan plugin directory: ${dir}`, {
          error: String(error),
        });
      }
    }

    return plugins;
  }

  /**
   * Load all discovered plugins into a registry
   */
  async loadAllIntoRegistry(registry: DynamicToolRegistry): Promise<void> {
    const plugins = await this.discoverPlugins();

    for (const plugin of plugins) {
      const result = await registry.loadPlugin(plugin);
      if (!result.success) {
        this.logger?.error(`Failed to register plugin: ${plugin.manifest.id}`, result.error);
      }
    }
  }

  /**
   * Get loaded plugin info
   */
  getLoadedPlugins(): Array<{ id: string; path: string; manifest: PluginManifest }> {
    return Array.from(this.loadedPlugins.entries()).map(([id, info]) => ({
      id,
      path: info.path,
      manifest: info.plugin.manifest,
    }));
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(pluginId: string, registry: DynamicToolRegistry): Promise<Result<void>> {
    const info = this.loadedPlugins.get(pluginId);
    if (!info) {
      return ResultUtil.fail(new Error(`Plugin ${pluginId} not loaded`));
    }

    // Unload from registry
    const unloadResult = await registry.unloadPlugin(pluginId);
    if (!unloadResult.success) {
      return unloadResult;
    }

    // Remove from our tracking
    this.loadedPlugins.delete(pluginId);

    // Reload
    const loadResult = await this.loadFromFile(info.path);
    if (!loadResult.success) {
      return ResultUtil.fail(loadResult.error);
    }

    // Register in registry
    return registry.loadPlugin(loadResult.data);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async importModule(filePath: string): Promise<PluginModule> {
    // For ES modules
    const url = `file://${filePath}`;
    const module = await import(url);
    return module;
  }

  private extractPlugin(
    module: PluginModule,
    sourcePath: string,
    manifest?: PluginManifest
  ): ToolPlugin {
    // Check for default export
    if (module.default) {
      if (Array.isArray(module.default)) {
        // Default export is an array of tools
        return {
          manifest: manifest || this.generateManifest(sourcePath),
          tools: module.default,
          middleware: module.middleware,
          lifecycle: {
            onLoad: module.onLoad,
            onUnload: module.onUnload,
            onEnable: module.onEnable,
            onDisable: module.onDisable,
          },
        };
      } else if ('manifest' in module.default) {
        // Default export is a full plugin
        return module.default as ToolPlugin;
      }
    }

    // Extract tools from named exports
    return {
      manifest: manifest || this.generateManifest(sourcePath),
      tools: module.tools || [],
      middleware: module.middleware,
      lifecycle: {
        onLoad: module.onLoad,
        onUnload: module.onUnload,
        onEnable: module.onEnable,
        onDisable: module.onDisable,
      },
    };
  }

  private generateManifest(sourcePath: string): PluginManifest {
    const name = path.basename(sourcePath, path.extname(sourcePath));
    return {
      id: name,
      name: name,
      version: '1.0.0',
      description: `Plugin from ${name}`,
    };
  }
}

// ============================================
// BUILT-IN PLUGIN TEMPLATES
// ============================================

/**
 * Create a plugin from a simple tools array
 */
export function createPlugin(
  manifest: PluginManifest,
  tools: EnhancedTool[],
  options?: {
    middleware?: RegisteredMiddleware[];
    onLoad?: () => Promise<void>;
    onUnload?: () => Promise<void>;
  }
): ToolPlugin {
  return {
    manifest,
    tools,
    middleware: options?.middleware,
    lifecycle: {
      onLoad: options?.onLoad,
      onUnload: options?.onUnload,
    },
  };
}

/**
 * Create a minimal plugin manifest
 */
export function createManifest(
  id: string,
  name: string,
  version: string = '1.0.0',
  description?: string
): PluginManifest {
  return {
    id,
    name,
    version,
    description: description || `${name} plugin`,
  };
}
