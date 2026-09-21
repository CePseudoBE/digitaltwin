import { Type } from 'typebox'

const nonEmptyString = Type.String({ minLength: 1 })

/** Any JSON object: attribute fragments are free-form NGSI-LD attributes. */
export const attributeFragmentSchema = Type.Object({}, { additionalProperties: true })

export const entitySchema = Type.Object({ id: nonEmptyString, type: nonEmptyString }, { additionalProperties: true })

export const entityIdParamsSchema = Type.Object({ entityId: nonEmptyString })

export const entityListQuerySchema = Type.Object({
    type: Type.Optional(Type.String()),
    q: Type.Optional(Type.String()),
    attrs: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 }))
})

export const entityAttrsQuerySchema = Type.Object({ attrs: Type.Optional(Type.String()) })

export const subscriptionSchema = Type.Object({
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    entities: Type.Optional(Type.Array(Type.Object({ type: nonEmptyString }))),
    watchedAttributes: Type.Optional(Type.Array(Type.String())),
    q: Type.Optional(Type.String()),
    notification: Type.Object({
        endpoint: Type.Object({ uri: nonEmptyString, accept: Type.Optional(Type.String()) }),
        attributes: Type.Optional(Type.Array(Type.String())),
        format: Type.Optional(Type.Union([Type.Literal('normalized'), Type.Literal('keyValues')]))
    }),
    throttling: Type.Optional(Type.Integer({ minimum: 0 })),
    expiresAt: Type.Optional(Type.String())
})

export const subscriptionPatchSchema = Type.Partial(subscriptionSchema)

export const subscriptionIdParamsSchema = Type.Object({ subscriptionId: nonEmptyString })
