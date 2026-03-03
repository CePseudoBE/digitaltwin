import vine from '@vinejs/vine'

// ============================================
// Common schemas
// ============================================

/**
 * Pagination query parameters schema
 */
export const paginationSchema = vine.object({
    limit: vine.number().positive().max(1000).optional(),
    offset: vine.number().min(0).optional()
})

/**
 * ID parameter schema
 */
export const idParamSchema = vine.object({
    id: vine.number().positive()
})

// ============================================
// Assets Manager schemas
// ============================================

/**
 * Asset upload body schema
 */
export const assetUploadSchema = vine.object({
    description: vine.string().maxLength(1000).optional(),
    source: vine.string().url().optional(),
    is_public: vine.boolean().optional()
})

/**
 * Asset update body schema
 */
export const assetUpdateSchema = vine.object({
    description: vine.string().maxLength(1000).optional(),
    source: vine.string().url().optional(),
    is_public: vine.boolean().optional()
})

/**
 * Batch upload body schema
 */
export const assetBatchUploadSchema = vine.object({
    assets: vine
        .array(
            vine.object({
                description: vine.string().maxLength(1000).optional(),
                source: vine.string().url().optional(),
                is_public: vine.boolean().optional()
            })
        )
        .optional()
})

// ============================================
// Custom Table Manager schemas
// ============================================

/**
 * Custom record create schema (allows passthrough for dynamic fields)
 */
export const customRecordCreateSchema = vine.object({}).allowUnknownProperties()

/**
 * Custom record update schema
 */
export const customRecordUpdateSchema = vine.object({}).allowUnknownProperties()

// ============================================
// Query parameter schemas
// ============================================

/**
 * Date range query schema
 */
export const dateRangeQuerySchema = vine.object({
    startDate: vine.string().optional(),
    endDate: vine.string().optional(),
    limit: vine.number().positive().max(1000).optional()
})

// ============================================
// Compiled validators (for performance)
// ============================================

export const validatePagination = vine.compile(paginationSchema)
export const validateIdParam = vine.compile(idParamSchema)
export const validateAssetUpload = vine.compile(assetUploadSchema)
export const validateAssetUpdate = vine.compile(assetUpdateSchema)
export const validateAssetBatchUpload = vine.compile(assetBatchUploadSchema)
export const validateCustomRecordCreate = vine.compile(customRecordCreateSchema)
export const validateCustomRecordUpdate = vine.compile(customRecordUpdateSchema)
export const validateDateRangeQuery = vine.compile(dateRangeQuerySchema)
