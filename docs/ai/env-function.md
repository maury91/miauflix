# 🔧 ENV Function - Type-Safe Environment Variable Access

The project uses a sophisticated, type-safe environment variable system with automatic validation and transformation.

## **Basic Usage**

```typescript
import { ENV } from '@constants';

// Type-safe access with automatic validation
const port = ENV('PORT'); // number (validated: 1-65535)
const dataDir = ENV('DATA_DIR'); // string (validated: minLength 1)
const syncMode = ENV('EPISODE_SYNC_MODE'); // 'GREEDY' | 'ON_DEMAND'
```

## **How It Works**

1. **Type Inference**: Automatically infers types from service configurations
2. **Validation**: Runs validation rules defined in service configs
3. **Transformation**: Converts string values to appropriate types (number, boolean, etc.)
4. **Default Values**: Falls back to configured defaults if not set
5. **Error Handling**: Throws descriptive errors for invalid values

## **Configuration System**

Environment variables are defined in service-specific configuration files:

```typescript
// Example: backend/src/services/media/media.configuration.ts
export const mediaConfigurationDefinition = serviceConfiguration({
  name: 'Media',
  description: 'Media service configuration',
  variables: {
    EPISODE_SYNC_MODE: variable({
      description: 'Episode metadata sync strategy',
      example: 'ON_DEMAND',
      defaultValue: 'ON_DEMAND',
      required: false,
      transform: transforms.string({
        pattern: /^(GREEDY|ON_DEMAND)$/,
      }),
    }),
  },
  test: async () => {
    return;
  },
});
```

## **Available Transforms**

```typescript
import { transforms } from '@utils/config';

// String transforms
transforms.string({ minLength: 1, maxLength: 100 });
transforms.string({ pattern: /^[A-Z_]+$/ });

// Number transforms
transforms.number({ min: 1, max: 65535, integer: true });
transforms.number({ min: 0, max: 100 });

// Boolean transforms
transforms.boolean();

// Size transforms (for file sizes)
transforms.size(['B', 'KB', 'MB', 'GB', 'TB']);

// Optional transforms
transforms.optional(transforms.string({ minLength: 16 }));
```

## **Error Handling**

The ENV function provides detailed error messages:

```typescript
try {
  const port = ENV('PORT');
} catch (error) {
  // Error includes:
  // - Variable name
  // - Current invalid value
  // - Example of valid value
  // - Suggestions for fixing
  console.error(error.message);
}
```

## **Testing with ENV**

When writing tests, mock the ENV function:

```typescript
// Mock at the top of test file
jest.mock('@constants', () => ({
  ENV: jest.fn(),
}));

// In test setup
const { ENV } = jest.requireMock('@constants');
ENV.mockReturnValue('test-value');

// Or mock specific calls
ENV.mockImplementation((key: string) => {
  switch (key) {
    case 'PORT':
      return 3000;
    case 'DATA_DIR':
      return '/test/data';
    default:
      return 'default-value';
  }
});
```

## **Adding New Environment Variables**

1. **Create/update service configuration**:

   ```typescript
   // backend/src/services/your-service/your-service.configuration.ts
   export const yourServiceConfigurationDefinition = serviceConfiguration({
     name: 'YourService',
     variables: {
       YOUR_VARIABLE: variable({
         description: 'Description of what this does',
         example: 'example-value',
         defaultValue: 'default-value',
         required: false,
         transform: transforms.string({ minLength: 1 }),
       }),
     },
   });
   ```

2. **Register in main configuration**:

   ```typescript
   // backend/src/configuration.ts
   import { yourServiceConfigurationDefinition } from '@services/your-service/your-service.configuration';

   export const services = {
     // ... existing services
     YOUR_SERVICE: yourServiceConfigurationDefinition,
   };
   ```

3. **Use in your service**:

   ```typescript
   import { ENV } from '@constants';

   const value = ENV('YOUR_VARIABLE');
   ```

## **Common Patterns**

### **Required vs Optional Variables**

```typescript
// Required - will throw if not set
API_KEY: variable({
  description: 'API key for external service',
  required: true,
  transform: transforms.string({ minLength: 32 }),
}),

// Optional - uses default if not set
DEBUG_MODE: variable({
  description: 'Enable debug logging',
  defaultValue: 'false',
  required: false,
  transform: transforms.boolean(),
}),
```

### **Validation Patterns**

```typescript
// URL validation
API_URL: variable({
  transform: transforms.string({
    pattern: /^https?:\/\/.+/
  }),
}),

// Enum-like validation
LOG_LEVEL: variable({
  transform: transforms.string({
    pattern: /^(debug|info|warn|error)$/,
  }),
}),
```

## **Best Practices**

1. **Always use ENV()**: Never access `process.env` directly
2. **Provide good descriptions**: Help other developers understand the variable
3. **Include examples**: Show what valid values look like
4. **Use appropriate transforms**: Don't just use string for everything
5. **Set sensible defaults**: Make the system work out-of-the-box
6. **Test your configurations**: Add validation tests in the service config

## **Troubleshooting**

### **"Variable not found" errors**

- Check if the variable is registered in a service configuration
- Ensure the service is added to `services` in `configuration.ts`

### **Type errors**

- The ENV function is strictly typed
- Check the transform type matches your expected usage
- Use type assertions if needed: `ENV('PORT') as number`

### **Validation errors**

- Check the transform rules in the service configuration
- Verify the environment variable value matches the expected format
- Look at the error message for suggestions

---

**Remember**: The ENV function is your friend! It provides type safety, validation, and clear error messages. Always use it instead of direct `process.env` access.
