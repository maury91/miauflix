import type { Contract } from './define.js';
import { ContractError } from './errors.js';
import type { Impl } from './types.js';

/** Anything with a zod-like `parse`; keeps this package free of a schema library. */
export interface Parser {
  parse(value: unknown): unknown;
}

export type MethodSchemas = { input?: Parser; output?: Parser };

/**
 * Development/test aid: wraps call implementations so their inputs and outputs are parsed.
 * Production code should not use it; the contract relies on both ends being typed.
 */
export const validated = <C extends Contract>(
  contract: C,
  impl: Impl<C>,
  schemas: Partial<Record<keyof C['methods'], MethodSchemas>>
): Impl<C> => {
  const wrapped: Record<string, unknown> = { ...impl };
  for (const [name, schema] of Object.entries(schemas) as Array<[string, MethodSchemas]>) {
    if (contract.methods[name]?.kind !== 'call') continue;
    const fn = (impl as Record<string, (input: unknown, ctx: unknown) => unknown>)[name];
    wrapped[name] = async (input: unknown, ctx: unknown) => {
      let parsedInput = input;
      try {
        parsedInput = schema.input ? schema.input.parse(input) : input;
      } catch (error) {
        throw new ContractError('bad_request', `Invalid input for ${name}: ${String(error)}`);
      }
      const output = await fn(parsedInput, ctx);
      return schema.output ? schema.output.parse(output) : output;
    };
  }
  return wrapped as Impl<C>;
};
