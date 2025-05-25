import { confirm, input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { isatty } from 'tty';

import {
  type ServiceConfiguration,
  serviceConfiguration,
  type VariableInfo,
} from '@mytypes/configuration';
import { jwtConfigurationDefinition } from '@services/auth/auth.configuration';
import { sourceConfigurationDefinition } from '@services/source/source.configuration';
import { tmdbConfigurationDefinition } from '@services/tmdb/tmdb.configuration';
import { traktConfigurationDefinition } from '@services/trakt/trakt.configuration';
import { ytsConfigurationDefinition } from '@trackers/yts/yts.configuration';

function isNonInteractiveEnvironment() {
  return !isatty(process.stdout.fd);
}

const err = console.error;

const serverConfigurationDefinition = serviceConfiguration({
  name: 'Server',
  description: 'Server configuration',
  variables: {
    CORS_ORIGIN: {
      description: "Allowed origins for CORS (use '*' for all origins)",
      required: false,
      defaultValue: '*',
      example: 'http://localhost:3000',
    },
    PORT: {
      description: 'Port for the server to listen on',
      required: false,
      defaultValue: '3000',
      example: '3000',
    },
    DATA_DIR: {
      description: 'Directory for storing data files',
      required: false,
      defaultValue: path.resolve(process.cwd(), './data'),
      example: '/path/to/data',
    },
    REVERSE_PROXY_SECRET: {
      description:
        'Secret key shared between the reverse proxy and the backend to validate requests',
      required: false,
      defaultValue: '',
      example: 'your-secure-random-string',
    },
  },
  test: async () => {
    // No test needed for CORS configuration
    return;
  },
});

export const services = {
  TMDB: tmdbConfigurationDefinition,
  TRAKT: traktConfigurationDefinition,
  YTS: ytsConfigurationDefinition,
  JWT: jwtConfigurationDefinition,
  SERVER: serverConfigurationDefinition,
  SOURCE: sourceConfigurationDefinition,
};

export type Variables = {
  [K in keyof typeof services]: keyof (typeof services)[K]['variables'];
}[keyof typeof services];

export const variablesDefaultValues = Object.values(services).reduce(
  (acc, service) => {
    (Object.entries(service.variables) as [Variables, VariableInfo][]).forEach(
      ([varName, varInfo]) => {
        if ('defaultValue' in varInfo) {
          acc[varName] = varInfo.defaultValue;
        }
      }
    );
    return acc;
  },
  {} as Partial<Record<Variables, string>>
);

type ServiceKey = keyof typeof services;

const testService = async (
  service: ServiceConfiguration<string>
): Promise<{ success: boolean; message?: string }> => {
  console.error = () => {};
  try {
    await service.test();

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
async function configureService(service: ServiceConfiguration<string>): Promise<void> {
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
  const testResult = await testService(service);

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
    return configureService(service);
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
  const defaultValue = 'defaultValue' in varInfo ? varInfo.defaultValue : '';
  const currentValue = process.env[varName] || defaultValue;

  console.log();
  console.log(
    chalk.cyan.bold(`${varName}:`) + chalk.dim(` (${optional ? 'optional' : 'required'})`)
  );
  console.log(chalk.white(varInfo.description));

  if ('defaultValue' in varInfo) {
    console.log(chalk.dim(`Default: ${varInfo.defaultValue}`));
  }

  if (varInfo.example) {
    console.log(chalk.dim(`Example: ${varInfo.example}`));
  }

  if (varInfo.link) {
    console.log(`You can get this from: ${varInfo.link}`);
  }

  if ('password' in varInfo && varInfo.password) {
    const passwordValue = await password({
      message: `Enter ${chalk.cyan(varName)}:`,
      mask: true,
      validate: input => {
        if (!input.trim() && varInfo.required) {
          return `${varName} is required`;
        }
        return true;
      },
    });

    return passwordValue || defaultValue || '';
  }

  const value = await input({
    message: `Enter ${chalk.cyan(varName)}:`,
    default: currentValue,
    validate: input => {
      if (!input.trim() && varInfo.required) {
        return `${varName} is required`;
      }
      return true;
    },
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
  const changedEnvVariables = new Set<string>();
  const autoConfiguredVars = new Set<string>();

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
              process.env[varName] = varInfo.defaultValue;
              autoConfiguredVars.add(varName);
              changedEnvVariables.add(varName);
            }
            return false; // Cause it's auto-configured is not missing
          }
          return varInfo.required && !process.env[varName];
        })
        .map(([varName]) => varName);

      if (missingRequiredVars.length > 0) {
        servicesNeedingConfiguration.add(serviceKey as ServiceKey);
      }
    }
  }

  if (servicesNeedingConfiguration.size === 0 && !forceReconfigure) {
    console.log(chalk.cyan('Self testing...'));

    const invalidServices = await validateExistingConfiguration();
    if (invalidServices.length > 0) {
      console.log(
        chalk.red(
          `❌ Detected invalid configuration for the following services: ${invalidServices.join(', ')}
          You will be prompted to reconfigure them.`
        )
      );
      for (const invalidService of invalidServices) {
        servicesNeedingConfiguration.add(invalidService);
      }
    } else {
      console.log(chalk.green('✅ All services are configured correctly!'));
    }
  }

  if (servicesNeedingConfiguration.size > 0 || forceReconfigure) {
    if (isNonInteractiveEnvironment()) {
      throw new Error(
        'Configuration is incomplete and cannot be completed in a non-interactive environment. Please set the required environment variables.'
      );
    }

    if (forceReconfigure) {
      console.log(chalk.yellow.bold('🔄 Reconfiguring all services as requested.'));
    } else {
      console.log(chalk.yellow.bold('⚠️  Missing required environment variables!'));
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
      await configureService(service);

      for (const [varName] of Object.entries(service.variables)) {
        if (process.env[varName] !== envVariablesBefore[varName]) {
          changedEnvVariables.add(varName);
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
 * Validate existing configuration and reconfigure if needed
 */
async function validateExistingConfiguration(): Promise<ServiceKey[]> {
  const invalidServices = (
    await Promise.all(
      (Object.entries(services) as [ServiceKey, ServiceConfiguration<string>][]).map(
        async ([serviceKey, service]) => {
          // Execute test
          const testResult = await testService(service);
          return [testResult.success, serviceKey] as const;
        }
      )
    )
  )
    .filter(([isValid]) => !isValid)
    .map(([, serviceKey]) => serviceKey);

  return invalidServices;
}
