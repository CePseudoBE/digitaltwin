import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022
            }
        }
    },
    
    // TypeScript files configuration
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json'
            }
        },
        rules: {
            // Code Quality - Permissive for existing codebase
            '@typescript-eslint/no-unused-vars': ['warn', { 
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_' 
            }],
            '@typescript-eslint/no-explicit-any': 'off', // Allow any for flexibility
            '@typescript-eslint/explicit-function-return-type': 'off', // Too restrictive
            
            // Disable problematic rules for your codebase
            '@typescript-eslint/naming-convention': 'off', // Too restrictive
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/prefer-optional-chain': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/await-thenable': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/prefer-readonly': 'off',
            
            // Style consistency - Let Prettier handle formatting
            'indent': 'off',
            'quotes': 'off',
            'semi': 'off',
            'comma-dangle': 'off',
            'object-curly-spacing': 'off',
            'array-bracket-spacing': 'off',
            'space-before-blocks': 'off',
            'keyword-spacing': 'off',
            'space-infix-ops': 'off',
            'no-trailing-spaces': 'off',
            'eol-last': 'off',
            'no-case-declarations': 'off',
            
            // Import/Export - Keep this useful rule
            '@typescript-eslint/consistent-type-imports': ['warn', {
                prefer: 'type-imports',
                disallowTypeAnnotations: false
            }],
            
            // Basic error prevention
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/ban-ts-comment': ['warn', {
                'ts-expect-error': 'allow-with-description',
                'ts-ignore': 'allow-with-description'
            }],
            
            // Disable conflicting base rules
            'no-unused-vars': 'off',
            'no-undef': 'off'
        }
    },
    
    // Test files - Even more permissive
    {
        files: ['**/*.spec.ts', '**/*.test.ts', '**/tests/**/*'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/consistent-type-imports': 'off'
        }
    },
    
    // Example files - Very permissive
    {
        files: ['**/examples/**/*'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/consistent-type-imports': 'off'
        }
    },
    
    // Ignore patterns
    {
        ignores: [
            'dist/**/*',
            'node_modules/**/*',
            '**/*.d.ts',
            '**/*.js',
            '**/*.js.map'
        ]
    }
)