// src/components/async_upload.ts
import type { Queue } from 'bullmq'

/**
 * Interface for components that support async upload processing.
 *
 * Components implementing this interface will have the upload queue
 * automatically injected by the DigitalTwinEngine, allowing them to
 * queue long-running upload jobs instead of processing synchronously.
 */
export interface AsyncUploadable {
    /**
     * Set the upload queue for async job processing
     * @param queue - BullMQ queue for uploads
     */
    setUploadQueue(queue: Queue): void
}

/**
 * Type guard to check if a component supports async uploads
 */
export function isAsyncUploadable(component: unknown): component is AsyncUploadable {
    return (
        typeof component === 'object' &&
        component !== null &&
        'setUploadQueue' in component &&
        typeof (component as any).setUploadQueue === 'function'
    )
}
