import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

const positiveNumber = Type.Number({ exclusiveMinimum: 0 })
const description = Type.Optional(Type.String({ maxLength: 1000 }))
const source = Type.Optional(Type.String({ format: 'uri' }))
const isPublic = Type.Optional(Type.Boolean())

/** Pagination query parameters */
export const paginationSchema = Type.Object({
    limit: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1000 })),
    offset: Type.Optional(Type.Number({ minimum: 0 }))
})

/** Numeric `:id` route parameter */
export const idParamSchema = Type.Object({
    id: Type.Integer({ minimum: 1 })
})

/** Asset upload body */
export const assetUploadSchema = Type.Object({ description, source, is_public: isPublic })

/** Asset update body */
export const assetUpdateSchema = Type.Object({ description, source, is_public: isPublic })

/** Batch upload body */
export const assetBatchUploadSchema = Type.Object({
    assets: Type.Optional(Type.Array(assetUploadSchema))
})

/** Presigned upload request body */
export const presignedUploadRequestSchema = Type.Object({
    fileName: Type.String({ maxLength: 255 }),
    fileSize: positiveNumber,
    contentType: Type.String(),
    description,
    source,
    is_public: isPublic
})

/** Custom record create body: columns are dynamic, so any property is accepted */
export const customRecordCreateSchema = Type.Object({}, { additionalProperties: true })

/** Custom record update body */
export const customRecordUpdateSchema = Type.Object({}, { additionalProperties: true })

/** Date range query parameters */
export const dateRangeQuerySchema = Type.Object({
    startDate: Type.Optional(Type.String()),
    endDate: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1000 }))
})

export const validatePagination = Compile(paginationSchema)
export const validateIdParam = Compile(idParamSchema)
export const validateAssetUpload = Compile(assetUploadSchema)
export const validateAssetUpdate = Compile(assetUpdateSchema)
export const validateAssetBatchUpload = Compile(assetBatchUploadSchema)
export const validateCustomRecordCreate = Compile(customRecordCreateSchema)
export const validateCustomRecordUpdate = Compile(customRecordUpdateSchema)
export const validateDateRangeQuery = Compile(dateRangeQuerySchema)
export const validatePresignedUploadRequest = Compile(presignedUploadRequestSchema)
