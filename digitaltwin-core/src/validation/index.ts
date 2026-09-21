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
    // Pre-compiled validators
    validatePagination,
    validateIdParam,
    validateAssetUpload,
    validateAssetUpdate,
    validateAssetBatchUpload,
    validateCustomRecordCreate,
    validateCustomRecordUpdate,
    validateDateRangeQuery
} from './schemas.js'

// Validation helpers
export { validateData, safeValidate, validateQuery, validateParams } from './validate.js'
export type { FieldError } from './validate.js'
export { Type } from './validate.js'
export type { Static } from './validate.js'
