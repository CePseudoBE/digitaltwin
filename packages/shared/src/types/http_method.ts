/**
 * Supported HTTP methods for component endpoints.
 *
 * These methods correspond to standard REST operations:
 * - get: Retrieve data
 * - post: Create new resources
 * - put: Update existing resources (full update)
 * - patch: Update existing resources (partial update)
 * - delete: Remove resources
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'
