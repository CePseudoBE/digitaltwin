import type { NgsiLdEntity, NgsiLdProperty } from '../types/entity.js'

/**
 * Supported comparison operators in the q-filter language.
 */
export type QOperator = '==' | '!=' | '>' | '>=' | '<' | '<='

/**
 * A single comparison expression node.
 */
export interface QComparison {
    kind: 'comparison'
    attribute: string
    operator: QOperator
    value: string | number | boolean
}

/**
 * An AND chain of comparison expressions.
 */
export interface QAnd {
    kind: 'and'
    terms: QComparison[]
}

/**
 * A parsed q-filter expression (either a single comparison or an AND chain).
 */
export type QExpr = QComparison | QAnd

const OPERATOR_PATTERN = /^([a-zA-Z][a-zA-Z0-9_.]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/

/**
 * Parses a single comparison term like `pm25>30` or `status=="ok"`.
 */
function parseTerm(term: string): QComparison {
    const trimmed = term.trim()
    const match = trimmed.match(OPERATOR_PATTERN)
    if (!match) {
        throw new Error(`Invalid q-filter term: "${term}"`)
    }

    const [, attribute, operator, rawValue] = match

    let value: string | number | boolean
    const unquoted = rawValue.replace(/^["']|["']$/g, '')

    if (rawValue === 'true') {
        value = true
    } else if (rawValue === 'false') {
        value = false
    } else if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') {
        value = Number(rawValue)
    } else {
        value = unquoted
    }

    return {
        kind: 'comparison',
        attribute,
        operator: operator as QOperator,
        value,
    }
}

/**
 * Parses an NGSI-LD q-filter string into an AST.
 *
 * Supports: `attr>val`, `attr==val`, `attr!=val`, `attr>=val`, `attr<=val`, `attr<val`
 * AND chaining with `;` (e.g. `pm25>30;temperature<10`)
 * No OR support in v1.
 *
 * @throws {Error} When a term cannot be parsed.
 */
export function parseQ(q: string): QExpr {
    const terms = q.split(';').map(t => t.trim()).filter(t => t.length > 0)

    if (terms.length === 0) {
        throw new Error('Empty q-filter expression')
    }

    const parsed = terms.map(parseTerm)

    if (parsed.length === 1) {
        return parsed[0]
    }

    return {
        kind: 'and',
        terms: parsed,
    }
}

/**
 * Extracts the numeric/string/boolean value from an NGSI-LD property, or the raw attribute value.
 */
function resolveAttributeValue(entity: NgsiLdEntity, attribute: string): unknown {
    const attrValue = entity[attribute]

    if (attrValue === undefined || attrValue === null) {
        return undefined
    }

    // Handle NGSI-LD Property objects
    if (
        typeof attrValue === 'object' &&
        !Array.isArray(attrValue) &&
        'type' in attrValue &&
        (attrValue as NgsiLdProperty).type === 'Property'
    ) {
        return (attrValue as NgsiLdProperty).value
    }

    // Handle plain scalars (id, type, etc.)
    return attrValue
}

/**
 * Evaluates a single comparison against a resolved value.
 */
function evaluateComparison(expr: QComparison, entity: NgsiLdEntity): boolean {
    const attrValue = resolveAttributeValue(entity, expr.attribute)

    if (attrValue === undefined || attrValue === null) {
        // Missing attribute: only != returns true
        return expr.operator === '!='
    }

    // Type coercion: compare numbers as numbers, strings as strings
    const left = typeof attrValue === 'number' ? attrValue : String(attrValue)
    const right = typeof expr.value === 'number' ? expr.value : String(expr.value)

    switch (expr.operator) {
        case '==':
            return left === right
        case '!=':
            return left !== right
        case '>':
            return typeof left === 'number' && typeof right === 'number' ? left > right : String(left) > String(right)
        case '>=':
            return typeof left === 'number' && typeof right === 'number' ? left >= right : String(left) >= String(right)
        case '<':
            return typeof left === 'number' && typeof right === 'number' ? left < right : String(left) < String(right)
        case '<=':
            return typeof left === 'number' && typeof right === 'number' ? left <= right : String(left) <= String(right)
    }
}

/**
 * Evaluates a parsed q-filter expression against an NGSI-LD entity.
 *
 * @returns true if the entity matches the filter, false otherwise.
 */
export function evaluateQ(expr: QExpr, entity: NgsiLdEntity): boolean {
    if (expr.kind === 'comparison') {
        return evaluateComparison(expr, entity)
    }

    // AND: all terms must pass
    return expr.terms.every(term => evaluateComparison(term, entity))
}
