export interface Debounced<T extends unknown[]> {
    (...args: T): void
    /** Drops a pending call, if any. */
    cancel(): void
}

/**
 * Trailing-edge debounce: the call runs once `ms` have passed without a new call,
 * with the arguments of the last call.
 *
 * An async `fn` that rejects is routed to `onError` instead of becoming an
 * unhandled rejection on the timer, which nobody can catch.
 */
export function debounce<T extends unknown[]>(
    fn: (...args: T) => unknown,
    ms: number,
    onError: (error: unknown) => void = () => {}
): Debounced<T> {
    let timer: ReturnType<typeof setTimeout> | undefined

    const debounced = ((...args: T) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
            timer = undefined
            try {
                Promise.resolve(fn(...args)).catch(onError)
            } catch (error) {
                onError(error)
            }
        }, ms)
    }) as Debounced<T>

    debounced.cancel = () => {
        if (timer) clearTimeout(timer)
        timer = undefined
    }

    return debounced
}
