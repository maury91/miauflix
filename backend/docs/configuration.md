# Assisted Configuration

The backend includes an assisted configuration system that helps manage environment variables and application settings:

## Features

- **Environment Variable Validation**: Automatically validates required environment variables at startup
- **Interactive Configuration**: Prompts for missing configuration values in an interactive terminal
- **Service-Specific Configuration**: Handles configuration for different services (TMDB, Trakt.tv)
- **Configuration Testing**: Tests service connections with provided credentials
- **Default Values**: Provides sensible defaults for optional configuration
- **Error Reporting**: Clear error messages when configuration is missing or invalid
- **.env File Generation**: Automatically saves configuration to .env file
- **Command Line Configuration Flags**: Force configuration prompts with `--config` and `--only-config` flags

## Command Line Options

### `--config` Flag

Forces the configuration prompts to run for all services, even if they are already configured:

```bash
npm run config
```

This is useful when you want to reconfigure existing settings or update configuration values.

### `--only-config` Flag

Same as `--config` but exits after configuration is complete without starting the server:

```bash
npm run config-only
```

This is useful for:

- Setting up configuration in deployment scripts
- Updating configuration without starting the server
- Initial setup workflows

## How It Works

The configuration system:

1. Checks for required environment variables at startup
2. If any are missing, prompts the user interactively for each value
3. Tests the configuration by attempting to connect to the service
4. Offers to save the configuration to a .env file
5. Provides clear error messages if configuration is invalid

## Benefits

- **Reduced Configuration Errors**: Catches missing or invalid configuration early
- **Improved Developer Experience**: Interactive prompts guide users through setup
- **Simplified Deployment**: Easier to identify missing configuration in production
- **Centralized Configuration**: All configuration in one place with validation
- **Service Validation**: Tests service connections before saving configuration
