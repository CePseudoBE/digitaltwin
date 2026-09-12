/**
 * Reduces a user-supplied filename to something safe to use in a storage key.
 *
 * Directory parts are dropped (both slash styles), anything outside
 * `A-Z a-z 0-9 . _ -` becomes `_`, and leading dots are removed so neither
 * `..` nor hidden files survive. An empty result falls back to `fallback`.
 *
 * @example
 * sanitizeFilename('../../etc/passwd')   // 'passwd'
 * sanitizeFilename('my model (v2).glb')  // 'my_model__v2_.glb'
 * sanitizeFilename('..')                 // 'file'
 */
export function sanitizeFilename(name: string, fallback = 'file'): string {
    const base = name.split(/[\\/]/).pop() ?? ''
    const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
    return cleaned || fallback
}
