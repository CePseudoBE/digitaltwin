/**
 * @fileoverview Framework-neutral HTTP contract for component endpoints
 *
 * Components never see the underlying HTTP framework: handlers receive a
 * TypedRequest built by the engine and return a DataResponse.
 */

import type { AuthenticatedUser } from './auth.js'

/**
 * Standard HTTP response structure for component endpoints.
 *
 * All component handlers return this structure to provide consistent
 * API responses across the digital twin system.
 */
export interface DataResponse {
    /** HTTP status code (200, 400, 401, 404, 500, etc.) */
    status: number
    /** Response body (Buffer for binary, string for text/JSON) */
    content: Buffer | string
    /** Optional HTTP headers to include in response */
    headers?: Record<string, string>
}

/**
 * Metadata of a file received in a multipart/form-data request.
 */
export interface UploadedFile {
    /** Field name in the form */
    fieldname: string
    /** Original filename from the client */
    originalname: string
    /** MIME type of the file */
    mimetype: string
    /** File size in bytes */
    size: number
    /** Path to the temporary file (disk storage) */
    path?: string
    /** File content (memory storage) */
    buffer?: Buffer
}

/**
 * Request passed to component endpoint handlers.
 *
 * @template TParams - Type for URL parameters (e.g., { id: string })
 * @template TBody - Type for request body
 * @template TQuery - Type for query string parameters
 *
 * @example
 * ```typescript
 * type GetUserRequest = TypedRequest<{ id: string }, never, { include?: string }>
 *
 * async function getUser(req: GetUserRequest) {
 *     const userId = req.params.id  // string
 *     const include = req.query.include  // string | undefined
 * }
 * ```
 */
export interface TypedRequest<
    TParams = Record<string, string>,
    TBody = Record<string, unknown>,
    TQuery = Record<string, string | string[] | undefined>
> {
    params: TParams
    body: TBody
    query: TQuery
    headers: Record<string, string | string[] | undefined>
    /** Authenticated user, set by the engine when the request carries valid credentials */
    user?: AuthenticatedUser
    /** Uploaded file for multipart requests */
    file?: UploadedFile
}

/**
 * Handler function type for component endpoints.
 *
 * @template TParams - Type for URL parameters
 * @template TBody - Type for request body
 * @template TQuery - Type for query string parameters
 */
export type EndpointHandler<
    TParams = Record<string, string>,
    TBody = unknown,
    TQuery = Record<string, string | string[] | undefined>
> = (req: TypedRequest<TParams, TBody, TQuery>) => Promise<DataResponse> | DataResponse

// ========== Common request type aliases ==========

/** Request with ID parameter */
export type IdParamRequest<TBody = unknown> = TypedRequest<{ id: string }, TBody>

/** Request with no parameters */
export type NoParamRequest<TBody = unknown> = TypedRequest<Record<string, never>, TBody>

// ========== Asset-specific request types ==========

/** Asset upload request body */
export interface AssetUploadBody {
    description?: string
    source?: string
    is_public?: string | boolean
}

/** Asset update request body */
export interface AssetUpdateBody {
    description?: string
    source?: string
    is_public?: string | boolean
}

/** Request for uploading an asset */
export type AssetUploadRequest = TypedRequest<Record<string, never>, AssetUploadBody>

/** Request for getting an asset by ID */
export type AssetGetRequest = TypedRequest<{ id: string }>

/** Request for updating an asset */
export type AssetUpdateRequest = TypedRequest<{ id: string }, AssetUpdateBody>

/** Request for deleting an asset */
export type AssetDeleteRequest = TypedRequest<{ id: string }>

// ========== Batch upload request types ==========

/** Single asset in batch upload */
export interface BatchAssetData {
    filename: string
    description: string
    source: string
    data: string // Base64 encoded
    is_public?: boolean
}

/** Batch upload request body */
export interface BatchUploadBody {
    assets: BatchAssetData[]
}

/** Request for batch uploading assets */
export type BatchUploadRequest = TypedRequest<Record<string, never>, BatchUploadBody>

// ========== Custom table request types ==========

/** Request for custom table list with pagination */
export interface CustomTableListQuery {
    page?: string
    limit?: string
    sort?: string
    order?: 'asc' | 'desc'
    [key: string]: string | string[] | undefined
}

export type CustomTableListRequest = TypedRequest<Record<string, never>, unknown, CustomTableListQuery>

/** Request for custom table record by ID */
export type CustomTableGetRequest = TypedRequest<{ id: string }>

/** Request for creating custom table record */
export type CustomTableCreateRequest<T = Record<string, unknown>> = TypedRequest<Record<string, never>, T>

/** Request for updating custom table record */
export type CustomTableUpdateRequest<T = Record<string, unknown>> = TypedRequest<{ id: string }, T>

// ========== Presigned upload request types ==========

/** Request body for presigned upload URL generation */
export interface PresignedUploadRequestBody {
    fileName: string
    fileSize: number
    contentType: string
    description?: string
    source?: string
    is_public?: boolean
}

/** Request for presigned upload URL */
export type PresignedUploadRequest = TypedRequest<Record<string, never>, PresignedUploadRequestBody>

/** Request for confirming a presigned upload */
export type PresignedUploadConfirmRequest = TypedRequest<{ fileId: string }>

// ========== Tileset request types ==========

/** Tileset upload request */
export type TilesetUploadRequest = TypedRequest<Record<string, never>, AssetUploadBody>

/** Tileset list query */
export interface TilesetListQuery {
    page?: string
    limit?: string
    owner_id?: string
}

export type TilesetListRequest = TypedRequest<Record<string, never>, unknown, TilesetListQuery>
