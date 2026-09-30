/**
 * Imports an optional package, or returns undefined when it is not installed.
 * A package that is installed but fails to load (a missing dependency of its own, an error at
 * evaluation) throws: a broken install must not look like an absent one.
 */
export async function importOptional<T>(specifier: string): Promise<T | undefined> {
    try {
        return (await import(specifier)) as T
    } catch (error) {
        if (isNotInstalled(error, specifier)) return undefined
        throw error
    }
}

// Node names the package it could not find; a broken install names one of its dependencies instead
function isNotInstalled(error: unknown, specifier: string): boolean {
    return (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
        error.message.includes(`'${specifier}'`)
    )
}
