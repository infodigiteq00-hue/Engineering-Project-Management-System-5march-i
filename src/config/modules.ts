/**
 * Module Feature Flags Configuration
 * 
 * This file controls which modules are enabled/disabled in the application.
 * It reads from environment variables and provides safe defaults.
 * 
 * SAFETY: This file is ADDITIVE ONLY - it doesn't modify any existing code.
 * All modules default to ENABLED (current behavior) if env vars are not set.
 */

// Read environment variables with safe defaults
// Default behavior: All modules ENABLED (matches current state)
const getEnvVar = (key: string, defaultValue: string = 'true'): boolean => {
  const value = import.meta.env[key];
  if (value === undefined || value === '') {
    return defaultValue === 'true';
  }
  return value.toLowerCase() === 'true';
};

/**
 * Module Configuration
 * 
 * Each module can be enabled/disabled via environment variables.
 * Default: ALL ENABLED (preserves current behavior)
 */
export const MODULE_CONFIG = {
  // Projects module - Core functionality
  // Default: ENABLED (current behavior)
  projects: getEnvVar('VITE_ENABLE_PROJECTS', 'true'),
  
  // Standalone Equipment module
  // Default: ENABLED (current behavior)
  standaloneEquipment: getEnvVar('VITE_ENABLE_STANDALONE_EQUIPMENT', 'true'),
  
  // Tasks module
  // Default: ENABLED (current behavior)
  tasks: getEnvVar('VITE_ENABLE_TASKS', 'true'),
  
  // Completion Certificates module
  // Default: ENABLED (current behavior)
  certificates: getEnvVar('VITE_ENABLE_CERTIFICATES', 'true'),
  
  // Completed Projects module (if separate)
  // Default: ENABLED (current behavior)
  completedProjects: getEnvVar('VITE_ENABLE_COMPLETED_PROJECTS', 'true'),
} as const;

/**
 * Helper function to check if a module is enabled
 * @param module - Module name to check
 * @returns true if module is enabled, false otherwise
 */
export const isModuleEnabled = (module: keyof typeof MODULE_CONFIG): boolean => {
  return MODULE_CONFIG[module] ?? true; // Default to true (safe fallback)
};

/**
 * Get list of enabled module names
 * @returns Array of enabled module names
 */
export const getEnabledModules = (): string[] => {
  return Object.entries(MODULE_CONFIG)
    .filter(([_, enabled]) => enabled)
    .map(([module]) => module);
};

/**
 * Type-safe module names
 */
export type ModuleName = keyof typeof MODULE_CONFIG;








