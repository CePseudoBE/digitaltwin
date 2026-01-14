/**
 * @fileoverview Environment variable validation and configuration management
 *
 * This utility class provides type-safe environment variable parsing with
 * validation rules for string, number, boolean, and enum types.
 */

/**
 * Environment variable validation and configuration utility.
 *
 * The Env class provides a schema-based approach to validating and parsing
 * environment variables with type safety and format validation.
 *
 * @example
 * ```typescript
 * const config = Env.validate({
 *   PORT: Env.schema.number({ optional: true, default: 3000 }),
 *   API_URL: Env.schema.string({ format: 'url' }),
 *   DEBUG: Env.schema.boolean({ optional: true, default: false }),
 *   NODE_ENV: Env.schema.enum(['development', 'production', 'test'])
 * });
 *
 * // config is now type-safe and validated
 * console.log(config.PORT); // number
 * console.log(config.API_URL); // validated URL string
 * ```
 */
export class Env {
    /**
     * Schema builders for different environment variable types.
     *
     * Provides factory methods for creating validation rules for different
     * data types that can be parsed from environment variables.
     */
    static schema = {
        /**
         * Creates a string validation rule.
         *
         * @param opts - Optional configuration for string validation
         * @param opts.optional - Whether the environment variable is optional
         * @param opts.format - Format validation ('url' or 'email')
         * @returns String validation rule object
         */
        string: (opts?: { optional?: boolean; format?: 'url' | 'email' }) => ({
            type: 'string' as const,
            ...opts
        }),

        /**
         * Creates a number validation rule.
         *
         * @param opts - Optional configuration for number validation
         * @param opts.optional - Whether the environment variable is optional
         * @returns Number validation rule object
         */
        number: (opts?: { optional?: boolean }) => ({
            type: 'number' as const,
            ...opts
        }),

        /**
         * Creates a boolean validation rule.
         *
         * Accepts 'true'/'false' or '1'/'0' as valid boolean values.
         *
         * @param opts - Optional configuration for boolean validation
         * @param opts.optional - Whether the environment variable is optional
         * @param opts.default - Default value if the variable is missing
         * @returns Boolean validation rule object
         */
        boolean: (opts?: { optional?: boolean; default?: boolean }) => ({
            type: 'boolean' as const,
            ...opts
        }),

        /**
         * Creates an enum validation rule.
         *
         * @template T - Array of allowed string values
         * @param values - Array of allowed values for this environment variable
         * @returns Enum validation rule object
         */
        enum: <T extends string[]>(values: T) => ({
            type: 'enum' as const,
            values
        })
    }

    /**
     * Stores the last validated configuration.
     *
     * This static property holds the most recently validated environment
     * configuration for reference by other parts of the application.
     */
    static config: Record<string, any> = {}

    /**
     * Validates environment variables against a schema definition.
     *
     * Parses and validates environment variables according to the provided
     * schema, returning a type-safe configuration object.
     *
     * @template T - The expected type of the returned configuration object
     * @param schema - Object mapping environment variable names to validation rules
     * @param rawEnv - Environment variables object (defaults to process.env)
     * @returns Validated and parsed configuration object
     *
     * @throws {Error} When required environment variables are missing
     * @throws {Error} When environment variables fail format validation
     *
     * @example
     * ```typescript
     * interface Config {
     *   DATABASE_URL: string;
     *   PORT: number;
     *   DEBUG: boolean;
     *   NODE_ENV: 'development' | 'production';
     * }
     *
     * const config: Config = Env.validate({
     *   DATABASE_URL: Env.schema.string({ format: 'url' }),
     *   PORT: Env.schema.number({ optional: true }),
     *   DEBUG: Env.schema.boolean({ optional: true, default: false }),
     *   NODE_ENV: Env.schema.enum(['development', 'production'])
     * });
     * ```
     */
    static validate<T extends Record<string, any>>(schema: Record<string, any>, rawEnv = process.env): T {
        const config: any = {}

        for (const [key, rules] of Object.entries(schema)) {
            const value = rawEnv[key]

            if (value === undefined || value === '') {
                if (rules.optional) {
                    // Use default value if provided
                    if (rules.default !== undefined) {
                        config[key] = rules.default
                    }
                    continue
                }
                throw new Error(`Missing environment variable: ${key}`)
            }

            switch (rules.type) {
                case 'string':
                    if (rules.format === 'url' && !/^https?:\/\/.+$/.test(value)) {
                        throw new Error(`Invalid URL format for ${key}`)
                    }
                    if (rules.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                        throw new Error(`Invalid email format for ${key}`)
                    }
                    config[key] = value
                    break

                case 'number':
                    const parsed = Number(value)
                    if (isNaN(parsed)) {
                        throw new Error(`Invalid number format for ${key}`)
                    }
                    config[key] = parsed
                    break

                case 'boolean':
                    const lowerValue = value.toLowerCase()
                    if (lowerValue === 'true' || lowerValue === '1') {
                        config[key] = true
                    } else if (lowerValue === 'false' || lowerValue === '0') {
                        config[key] = false
                    } else {
                        throw new Error(`Invalid boolean format for ${key}, expected true/false or 1/0`)
                    }
                    break

                case 'enum':
                    if (!rules.values.includes(value)) {
                        throw new Error(`Invalid value for ${key}, expected one of ${rules.values.join(', ')}`)
                    }
                    config[key] = value
                    break
            }
        }

        this.config = config
        return config
    }
}
