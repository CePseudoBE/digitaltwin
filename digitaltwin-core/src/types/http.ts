/**
 * @fileoverview HTTP request type definitions for typed Express handlers
 *
 * Provides strongly-typed request interfaces to replace `any` in handler functions.
 * These types extend Express Request with specific body, params, and query types.
 */

import type { Request, Response } from 'ultimate-express'
import type { AuthContext } from '../auth/types.js'
import type { DataResponse } from '../components/types.js'

/**
 * Multer file object interface.
 * Represents an uploaded file from multipart/form-data requests.
 */
export interface MulterFile {
    /** Field name in the form */
    fieldname: string
    /** Original filename from the client */
    originalname: string
    /** File encoding (e.g., '7bit') */
    encoding: string
    /** MIME type of the file */
    mimetype: string
    /** File size in bytes */
    size: number
    /** Path to uploaded file (disk storage) */
    path?: string
    /** File content (memory storage) */
    buffer?: Buffer
    /** Destination directory (disk storage) */
    destination?: string
    /** Generated filename (disk storage) */
    filename?: string
}

/**
 * Base typed request interface extending Express Request.
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
> extends Omit<Request, 'params' | 'body' | 'query' | 'file' | 'files'> {
    params: TParams
    body: TBody
    query: TQuery
    file?: MulterFile
    files?: MulterFile[] | Record<string, MulterFile[]>
}

/**
 * Request with authentication context.
 * Used for endpoints that require user authentication.
 */
export interface AuthenticatedTypedRequest<
    TParams = Record<string, string>,
    TBody = unknown,
    TQuery = Record<string, string | string[] | undefined>
> extends TypedRequest<TParams, TBody, TQuery> {
    auth?: AuthContext
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
> = (req: TypedRequest<TParams, TBody, TQuery>, res?: Response) => Promise<DataResponse> | DataResponse

/**
 * Generic handler function that accepts any typed request.
 * Used in interface definitions where specific types are unknown.
 */
export type GenericHandler = (
    req: TypedRequest<Record<string, string>, unknown, Record<string, string | string[] | undefined>>,
    res?: Response
) => Promise<DataResponse> | DataResponse

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
export type AssetUploadRequest = TypedRequest<Record<string, never>, AssetUploadBody> & { file?: MulterFile }

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

// ========== Tileset request types ==========

/** Tileset upload request */
export type TilesetUploadRequest = TypedRequest<Record<string, never>, AssetUploadBody> & { file?: MulterFile }

/** Tileset list query */
export interface TilesetListQuery {
    page?: string
    limit?: string
    owner_id?: string
}

export type TilesetListRequest = TypedRequest<Record<string, never>, unknown, TilesetListQuery>
