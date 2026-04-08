import { confirm, input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { isatty } from 'tty';

import { theRarbgConfigurationDefinition } from '@content-directories/therarbg/therarbg.configuration';
import { ytsConfigurationDefinition } from '@content-directories/yts/yts.configuration';
import { type ServiceConfiguration, type VariableInfo } from '@mytypes/configuration';
import { jwtConfigurationDefinition } from '@services/auth/auth.configuration';
import { tmdbConfigurationDefinition } from '@services/content-catalog/tmdb/tmdb.configuration';
import { traktConfigurationDefinition } from '@services/content-catalog/trakt/trakt.configuration';
import { downloadConfigurationDefinition } from '@services/download/download.configuration';
import { mediaConfigurationDefinition } from '@services/media/media.configuration';
import { RequestService } from '@services/request/request.service';
import { vpnConfigurationDefinition } from '@services/security/vpn.configuration';
import { sourceConfigurationDefinition } from '@services/source/source.configuration';
import { StatsService } from '@services/stats/stats.service';
import { storageConfigurationDefinition } from '@services/storage/storage.configuration';
import { serviceConfiguration, transforms, variable } from '@utils/config';

function isNonInteractiveEnvironment() {
  return !isatty(process.stdout.fd);
}

const err = console.error;

const serverConfigurationDefinition = serviceConfiguration({
  name: 'Server',
  description: 'Server configuration',
  variables: {
    CORS_ORIGIN: variable({
      description: "Allowed origins for CORS (comma-separated list or '*' for all origins)",
      required: false,
      defaultValue:
        'http://localhost:3000,http://localhost:4173,http://localhost:4174,http://localhost:4175',
      example: 'http://localhost:3000,https://myapp.com',
      transform: transforms.stringArray(),
    }),
    PORT: variable({
      description: 'Port for the server to listen on',
      required: false,
      defaultValue: '3000',
      example: '3000',
      transform: transforms.number({ min: 1, max: 65535, integer: true }),
    }),
    DATA_DIR: variable({
      description: 'Directory for storing data files',
      required: false,
      defaultValue: path.resolve(process.cwd(), './data'),
      example: '/path/to/data',
      transform: transforms.string({ minLength: 1 }),
    }),
    MAXIMUM_CACHE_EMPTY_SPACE: variable({
      description:
        'Cache will be cleaned periodically, however, the database file will not shrink automatically, empty space will be reused in the future, this is the maximum size of the empty space',
      required: false,
      defaultValue: '10MB',
      example: '10MB',
      transform: transforms.size(['B', 'KB', 'MB', 'GB', 'TB']),
    }),
    REVERSE_PROXY_SECRET: variable({
      description:
        'Secret key shared between the reverse proxy and the backend to validate requests',
      required: false,
      defaultValue: '',
      example: 'your-secure-random-string',
      transform: transforms.optional(transforms.string({ minLength: 16 })),
    }),
    DISABLE_BACKGROUND_TASKS: variable({
      description: 'Disable all background tasks for testing on-demand functionality',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    ALLOW_CREATE_ADMIN_ON_FIRST_RUN: variable({
      description:
        'When enabled, the initial admin user is not automatically created on first run. ' +
        'An unauthenticated POST /api/auth/setup endpoint is exposed to create the first admin. ' +
        'The endpoint is disabled once any admin user exists.',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    NODE_ENV: variable({
      description: 'Node.js environment mode',
      required: false,
      defaultValue: 'development',
      example: 'production',
    }),
    DEBUG: variable({
      description:
        'Enable debug output for specific modules (e.g. "Jaeger" for OTLP tracing debug logs)',
      required: false,
      defaultValue: '',
      example: 'Jaeger',
    }),
    ENABLE_TRACING: variable({
      description: 'Enable OpenTelemetry distributed tracing',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    OTEL_EXPORTER_OTLP_ENDPOINT: variable({
      description: 'OTLP endpoint URL for exporting traces (e.g. Jaeger)',
      required: false,
      defaultValue: '',
      example: 'http://localhost:4318',
    }),
    ENABLE_OTLP: variable({
      description:
        'Enable OTLP trace export to localhost:4318 when no OTEL_EXPORTER_OTLP_ENDPOINT is set',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
    TRACE_FILE: variable({
      description: 'Directory for writing trace span files',
      required: false,
      defaultValue: '/tmp',
      example: '/data/traces',
    }),
    TRACE_MAX_TRACES: variable({
      description: 'Maximum number of traces to retain in the trace file',
      required: false,
      defaultValue: '1000',
      example: '500',
    }),
    FRONTEND_DIR: variable({
      description: 'If set, the backend will serve static frontend files from this directory',
      required: false,
      example: '/usr/src/app/public',
    }),
    ENABLE_FRONTEND: variable({
      description: 'Enable the frontend',
      required: false,
      defaultValue: 'true',
      example: 'true',
      transform: transforms.boolean(),
    }),
    FLARESOLVERR_URL: variable({
      description: 'URL for FlareSolverr instance to bypass Cloudflare protection',
      required: false,
      defaultValue: '',
      example: 'http://localhost:8191',
      transform: transforms.optional(transforms.url()),
    }),
    ENABLE_FLARESOLVERR: variable({
      description: 'Enable FlareSolverr for bypassing Cloudflare protection on 403 responses',
      required: false,
      defaultValue: 'false',
      example: 'true',
      transform: transforms.boolean(),
    }),
  },
  test: async () => {
    // No test needed for CORS configuration
    return;
  },
});

export const services = {
  JWT: jwtConfigurationDefinition,
  SERVER: serverConfigurationDefinition,
  SOURCE: sourceConfigurationDefinition,
  THE_RARBG: theRarbgConfigurationDefinition,
  TMDB: tmdbConfigurationDefinition,
  TRAKT: traktConfigurationDefinition,
  VPN: vpnConfigurationDefinition,
  YTS: ytsConfigurationDefinition,
  DOWNLOAD: downloadConfigurationDefinition,
  STORAGE: storageConfigurationDefinition,
  MEDIA: mediaConfigurationDefinition,
};

export type Variables = {
  [K in keyof typeof services]: keyof (typeof services)[K]['variables'];
}[keyof typeof services];

const getDefaultValue = (defaultValue: string | (() => string)): string | undefined => {
  return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
};

export const variablesDefaultValues = Object.values(services).reduce(
  (acc, service) => {
    (Object.entries(service.variables) as [Variables, VariableInfo][]).forEach(
      ([varName, varInfo]) => {
        if ('defaultValue' in varInfo && varInfo.defaultValue) {
          acc[varName] = getDefaultValue(varInfo.defaultValue);
        }
      }
    );
    return acc;
  },
  {} as Partial<Record<Variables, string>>
);

type ServiceKey = keyof typeof services;

const testService = async (
  service: ServiceConfiguration<Record<string, VariableInfo>>,
  requestService: RequestService,
  statsService: StatsService
): Promise<{ success: boolean; message?: string }> => {
  console.error = () => {};
  try {
    await service.test(requestService, statsService);

    console.error = err;

    return { success: true };
  } catch (error) {
    console.error = err;
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Configure a service by prompting for variables and testing the configuration
 */
async function configureService(
  service: ServiceConfiguration<Record<string, VariableInfo>>,
  requestService: RequestService,
  statsService: StatsService
): Promise<void> {
  console.log();
  console.log(chalk.cyan.bold(`===== ${service.name} Configuration =====`));
  console.log(chalk.white(service.description));
  console.log();

  // Get variables by required state
  const optionalVars = Object.entries(service.variables)
    .filter(([, info]) => !info.required)
    .map(([name]) => name);

  const requiredVars = Object.entries(service.variables)
    .filter(([, info]) => info.required)
    .map(([name]) => name);

  // Handle optional variables
  if (optionalVars.length > 0) {
    for (const varName of optionalVars) {
      const varInfo = service.variables[varName];
      process.env[varName] = await promptForVariable(varName, varInfo, true);
    }
  }

  // Handle required variables
  if (requiredVars.length > 0) {
    for (const varName of requiredVars) {
      const varInfo = service.variables[varName];
      process.env[varName] = await promptForVariable(varName, varInfo, false);
    }
  }

  // Test the configuration
  console.log(chalk.yellow(`\nTesting ${service.name} configuration...`));
  const testResult = await testService(service, requestService, statsService);

  if (testResult.success) {
    console.log(chalk.green(`✅ ${service.name} configuration is valid!`));
    return;
  }

  console.log(chalk.red(`❌ ${service.name} configuration failed: ${testResult.message}`));

  const tryAgain = await confirm({
    message: `Would you like to reconfigure ${service.name}?`,
    default: true,
  });

  if (tryAgain) {
    return configureService(service, requestService, statsService);
  }

  console.log(chalk.yellow(`Warning: Using potentially invalid configuration for ${service.name}`));
}

/**
 * Prompt user for a single environment variable
 */
async function promptForVariable(
  varName: string,
  varInfo: VariableInfo,
  optional: boolean
): Promise<string> {
  const defaultValue =
    'defaultValue' in varInfo && varInfo.defaultValue ? getDefaultValue(varInfo.defaultValue) : '';
  const currentValue = process.env[varName] || defaultValue;

  console.log();
  console.log(
    chalk.cyan.bold(`${varName}:`) + chalk.dim(` (${optional ? 'optional' : 'required'})`)
  );
  console.log(chalk.white(varInfo.description));

  if ('defaultValue' in varInfo) {
    console.log(chalk.dim(`Default: ${defaultValue}`));
  }

  if (varInfo.example) {
    console.log(chalk.dim(`Example: ${varInfo.example}`));
  }

  if (varInfo.link) {
    console.log(`You can get this from: ${varInfo.link}`);
  }

  // Enhanced validation function
  const validateInput = async (input: string): Promise<string | true> => {
    // Basic required validation
    if (!input.trim() && varInfo.required) {
      return `${varName} is required`;
    }

    // Skip validation for empty optional fields
    if (!input.trim() && !varInfo.required) {
      return true;
    }

    // Run custom validation if present
    if ('transform' in varInfo && varInfo.transform && input.trim()) {
      const result = varInfo.transform(input);
      if (!result.isValid) {
        let errorMsg = result.error!;
        if (result.suggestions?.length) {
          errorMsg += `\n${chalk.dim('Suggestions:')} ${result.suggestions.join(', ')}`;
        }
        return errorMsg;
      }
    }

    return true;
  };

  if ('password' in varInfo && varInfo.password) {
    const passwordValue = await password({
      message: `Enter ${chalk.cyan(varName)}:`,
      mask: true,
      validate: validateInput,
    });

    return passwordValue || defaultValue || '';
  }

  const value = await input({
    message: `Enter ${chalk.cyan(varName)}:`,
    default: currentValue,
    validate: validateInput,
  });

  return value || defaultValue || '';
}

/**
 * Save environment variables to a .env file.
 */
async function saveEnvironmentVariables(envValues: Record<string, string>): Promise<void> {
  try {
    const envFilePath = path.resolve(process.cwd(), '.env');
    let envContent = '';

    // Read existing .env if available
    try {
      envContent = readFileSync(envFilePath, 'utf-8');
    } catch {
      // File doesn't exist, start with empty content
    }

    // Update with new values
    for (const [key, value] of Object.entries(envValues)) {
      // Check if the key already exists in the file
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (regex.test(envContent)) {
        // Replace existing value
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new key-value pair
        envContent += `${key}=${value}\n`;
      }
    }

    writeFileSync(envFilePath, envContent);
    console.log(chalk.green.bold('✅ Environment variables saved to .env file.'));
  } catch (error) {
    console.error(chalk.red.bold('Error saving to .env file:'), error);
  }
}

/**
 * Main function to prompt for missing environment variables
 */
export async function validateConfiguration(
  options: { forceReconfigure?: boolean; configOnly?: boolean } = {}
): Promise<void> {
  const { forceReconfigure = false, configOnly = false } = options;
  const servicesNeedingConfiguration = new Set<ServiceKey>();
  const allMissingRequiredVars = new Set<string>();
  const changedEnvVariables = new Set<string>();
  const autoConfiguredVars = new Set<string>();
  /** Services that need config because required env vars are missing (for clear error messages) */
  const servicesWithMissingVars = new Set<ServiceKey>();
  /** Which vars are missing per service (for clear error messages) */
  const missingVarsByService = new Map<ServiceKey, string[]>();
  /** Services that need config because the validation test failed (keys set, but e.g. wrong credentials); includes error message per service */
  let validationErrorsByService: Array<{ serviceKey: ServiceKey; error: string }> = [];

  // If forceReconfigure is true, add all services to be configured
  if (forceReconfigure) {
    Object.keys(services).forEach(serviceKey => {
      servicesNeedingConfiguration.add(serviceKey as ServiceKey);
    });
  } else {
    // Normal logic: only add services with missing required variables
    for (const [serviceKey, service] of Object.entries(services)) {
      const missingRequiredVars = Object.entries(service.variables)
        .filter(([varName, varInfo]) => {
          // Auto-configure variables with skipUserInteraction set to true
          if ('skipUserInteraction' in varInfo && varInfo.skipUserInteraction === true) {
            if (!process.env[varName]) {
              process.env[varName] = getDefaultValue(varInfo.defaultValue);
              autoConfiguredVars.add(varName);
              changedEnvVariables.add(varName);
            }
            return false; // Cause it's auto-configured is not missing
          }
          return varInfo.required && !process.env[varName];
        })
        .map(([varName]) => varName);

      if (missingRequiredVars.length > 0) {
        const key = serviceKey as ServiceKey;
        servicesNeedingConfiguration.add(key);
        servicesWithMissingVars.add(key);
        missingVarsByService.set(key, missingRequiredVars);
        missingRequiredVars.forEach(varName => allMissingRequiredVars.add(varName));
      }
    }
  }

  // Create StatsService and RequestService instances for services that need it
  const statsService = new StatsService();
  const requestService = new RequestService(statsService);

  if (servicesNeedingConfiguration.size === 0 && !forceReconfigure) {
    console.log(chalk.cyan('Self testing...'));

    const invalidResults = await validateExistingConfiguration(requestService, statsService);
    if (invalidResults.length > 0) {
      validationErrorsByService = invalidResults;
      const serviceList = invalidResults.map(r => r.serviceKey).join(', ');
      console.log(
        chalk.red(
          `❌ Validation test failed for the following services (e.g. wrong credentials or API unreachable): ${serviceList}. You will be prompted to reconfigure them.`
        )
      );
      for (const { serviceKey } of invalidResults) {
        servicesNeedingConfiguration.add(serviceKey);
      }
    } else {
      console.log(chalk.green('✅ All services are configured correctly!'));
    }
  }

  if (servicesNeedingConfiguration.size > 0 || forceReconfigure) {
    if (isNonInteractiveEnvironment()) {
      // Only block startup when required env vars are missing; failed validation tests (e.g. Trakt API) are non-blocking so Docker can start
      if (allMissingRequiredVars.size > 0) {
        const missingByService = Array.from(missingVarsByService.entries())
          .map(([svc, vars]) => `${svc} (${vars.join(', ')})`)
          .join('; ');
        throw new Error(
          `Configuration is incomplete: missing required environment variables for: ${missingByService}. Set these in your environment or .env (non-interactive mode cannot prompt).`
        );
      }
      if (validationErrorsByService.length > 0) {
        const details = validationErrorsByService
          .map(({ serviceKey, error }) => `${serviceKey}: ${error}`)
          .join('; ');
        throw new Error(`Configuration is incomplete: validation test failed. ${details}`);
      }
    } else {
      if (forceReconfigure) {
        console.log(chalk.yellow.bold('🔄 Reconfiguring all services as requested.'));
      } else {
        if (servicesWithMissingVars.size > 0) {
          const missingByService = Array.from(missingVarsByService.entries())
            .map(([svc, vars]) => `${svc}: ${vars.join(', ')}`)
            .join('; ');
          console.log(
            chalk.yellow.bold(`⚠️  Missing required environment variables for: ${missingByService}`)
          );
        }
        if (validationErrorsByService.length > 0) {
          const details = validationErrorsByService
            .map(({ serviceKey, error }) => `${serviceKey}: ${error}`)
            .join('; ');
          console.log(chalk.yellow(`⚠️  Validation test failed for: ${details}`));
        }
      }
      console.log(chalk.cyan("Let's set up your configuration for each service."));

      for (const serviceKey of servicesNeedingConfiguration) {
        const service = services[serviceKey];
        const envVariablesBefore = Object.keys(service.variables)
          .map(varName => [varName, process.env[varName]] satisfies [string, string | undefined])
          .reduce(
            (acc, [varName, value]) => {
              acc[varName] = value;
              return acc;
            },
            {} as Record<string, string | undefined>
          );
        await configureService(service, requestService, statsService);

        for (const [varName] of Object.entries(service.variables)) {
          if (process.env[varName] !== envVariablesBefore[varName]) {
            changedEnvVariables.add(varName);
          }
        }
      }
    }
  }

  // Save configuration if any variables were set
  if (changedEnvVariables.size > 0) {
    if (autoConfiguredVars.size > 0) {
      console.log(
        chalk.green(
          `✅ Auto-configured ${autoConfiguredVars.size} variables: ${Array.from(autoConfiguredVars).join(', ')}`
        )
      );
    }

    // Don't ask for confirmation in non-interactive environment
    const saveToEnvFile = isNonInteractiveEnvironment()
      ? true
      : await confirm({
          message: `Would you like to save these values to a ${chalk.cyan('.env')} file?`,
          default: true,
        });

    if (saveToEnvFile) {
      const envValues = [...changedEnvVariables].reduce(
        (acc, varName) => {
          const value = process.env[varName];
          if (value) {
            acc[varName] = value;
          }
          return acc;
        },
        {} as Record<string, string>
      );
      await saveEnvironmentVariables(envValues);
    }
  }

  // If configOnly is true, exit the process after configuration
  if (configOnly) {
    console.log(chalk.green.bold('✅ Configuration completed successfully!'));
    console.log(chalk.cyan('Exiting without starting the server as requested.'));
    process.exit(0);
  }
}

/**
 * Validate existing configuration; returns services that failed the test with their error message.
 */
async function validateExistingConfiguration(
  requestService: RequestService,
  statsService: StatsService
): Promise<Array<{ serviceKey: ServiceKey; error: string }>> {
  const results = await Promise.all(
    (
      Object.entries(services) as [ServiceKey, ServiceConfiguration<Record<string, VariableInfo>>][]
    ).map(async ([serviceKey, service]) => {
      const testResult = await testService(service, requestService, statsService);
      return {
        serviceKey,
        success: testResult.success,
        error: testResult.message ?? 'Unknown error',
      };
    })
  );
  return results.filter(r => !r.success).map(({ serviceKey, error }) => ({ serviceKey, error }));
}
