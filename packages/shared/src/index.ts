// Types
export type { HttpMethod } from './types/http_method.js'
export type { DataRecord } from './types/data_record.js'
export type { DataResolver } from './types/data_resolver.js'
export type { MetadataRow } from './types/database.js'
export type { UserRepository } from './types/user_repository.js'
export type { AuthResult } from './types/auth_result.js'
export type {
    DataResponse,
    MulterFile,
    TypedRequest,
    AuthenticatedTypedRequest,
    EndpointHandler,
    GenericHandler,
    IdParamRequest,
    NoParamRequest,
    AssetUploadBody,
    AssetUpdateBody,
    AssetUploadRequest,
    AssetGetRequest,
    AssetUpdateRequest,
    AssetDeleteRequest,
    BatchAssetData,
    BatchUploadBody,
    BatchUploadRequest,
    CustomTableListQuery,
    CustomTableListRequest,
    CustomTableGetRequest,
    CustomTableCreateRequest,
    CustomTableUpdateRequest,
    PresignedUploadRequestBody,
    PresignedUploadRequest,
    PresignedUploadConfirmRequest,
    TilesetUploadRequest,
    TilesetListQuery,
    TilesetListRequest
} from './types/http.js'
export type {
    AuthenticatedUser,
    UserRecord,
    AuthContext,
    AuthenticatedRequest
} from './types/auth.js'

// Errors
export {
    DigitalTwinError,
    ValidationError,
    NotFoundError,
    AuthenticationError,
    AuthorizationError,
    StorageError,
    DatabaseError,
    ExternalServiceError,
    ConfigurationError,
    QueueError,
    FileOperationError,
    isDigitalTwinError,
    wrapError
} from './errors/index.js'

// Environment
export { Env } from './env/env.js'

// Validation
export {
    paginationSchema,
    idParamSchema,
    assetUploadSchema,
    assetUpdateSchema,
    assetBatchUploadSchema,
    customRecordCreateSchema,
    customRecordUpdateSchema,
    dateRangeQuerySchema,
    validatePagination,
    validateIdParam,
    validateAssetUpload,
    validateAssetUpdate,
    validateAssetBatchUpload,
    validateCustomRecordCreate,
    validateCustomRecordUpdate,
    validateDateRangeQuery,
    presignedUploadRequestSchema,
    validatePresignedUploadRequest
} from './validation/schemas.js'
export { validateData, safeValidate, validateQuery, validateParams, vine } from './validation/validate.js'

// Utils
export { Logger, LogLevel } from './utils/logger.js'
export { safeAsync, tryAsync, safeCleanup, retryAsync } from './utils/safe_async.js'
export { servableEndpoint } from './utils/servable_endpoint.js'
export type { ServableEndpointConfig } from './utils/servable_endpoint.js'
export {
    HttpStatus,
    jsonResponse,
    successResponse,
    errorResponse,
    badRequestResponse,
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
    validationErrorResponse,
    textResponse,
    fileResponse,
    multiStatusResponse
} from './utils/http_responses.js'
export type { HttpStatusCode } from './utils/http_responses.js'

// OpenAPI types
export type {
    OpenAPIInfo,
    OpenAPIServer,
    OpenAPITag,
    OpenAPIParameter,
    OpenAPISchema,
    OpenAPIMediaType,
    OpenAPIRequestBody,
    OpenAPIResponse,
    OpenAPISecurityRequirement,
    OpenAPIOperation,
    OpenAPIPathItem,
    OpenAPISecurityScheme,
    OpenAPIComponents,
    OpenAPIDocument,
    OpenAPIComponentSpec,
    OpenAPIGeneratorOptions,
    OpenAPIDocumentable
} from './types/openapi.js'
export { isOpenAPIDocumentable } from './types/openapi.js'

// Component types and interfaces
export type {
    ComponentConfiguration,
    AssetsManagerConfiguration,
    CollectorConfiguration,
    HarvesterConfiguration,
    AssetsConfiguration,
    StoreConfiguration,
    EndpointDefinition,
    Component,
    ScheduleRunnable,
    Servable
} from './types/component.js'
