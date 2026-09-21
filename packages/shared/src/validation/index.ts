// Validation schemas
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
    mapLayerUploadSchema,
    validatePresignedUploadRequest
} from './schemas.js'

// Validation helpers
export { validateData, safeValidate, validateQuery, validateParams } from './validate.js'
export type { FieldError } from './validate.js'

// Schema builder, so components declare endpoint schemas without depending on typebox themselves
export { Type } from 'typebox'
export type { Static } from 'typebox'
