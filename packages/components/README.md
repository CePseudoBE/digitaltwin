# @cepseudo/components

[![npm version](https://img.shields.io/npm/v/@cepseudo/components)](https://www.npmjs.com/package/@cepseudo/components)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

Core component base classes for the Digital Twin framework. Extend these to build your application.

## Installation

```bash
pnpm add @cepseudo/components
```

## Components Overview

| Component | Purpose | Scheduled | Database | HTTP Endpoints |
|---|---|---|---|---|
| **Collector** | Fetch data from external sources | Cron | Write | GET (latest data) |
| **Harvester** | Process and transform collected data | Cron or event-driven | Read + Write | GET (latest result) |
| **Handler** | Expose custom HTTP endpoints | No | No | User-defined |
| **CustomTableManager** | Manage structured data tables | No | Full CRUD | Auto-generated CRUD |

## Usage Examples

### Collector

Collectors run on a cron schedule to fetch data from external APIs and persist it automatically.

```typescript
import { Collector } from '@cepseudo/components'
import type { CollectorConfiguration } from '@cepseudo/shared'

class WeatherCollector extends Collector {
  getConfiguration(): CollectorConfiguration {
    return {
      name: 'weather-data',
      description: 'Collects weather observations from OpenMeteo',
      contentType: 'application/json',
      endpoint: 'weather'
    }
  }

  getSchedule(): string {
    return '0 */15 * * * *' // Every 15 minutes
  }

  async collect(): Promise<Buffer> {
    const response = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=50.85&longitude=4.35&current_weather=true'
    )
    const data = await response.json()
    return Buffer.from(JSON.stringify(data))
  }
}
```

The framework stores the returned `Buffer` in object storage and indexes it in the database. A `GET /weather` endpoint is exposed automatically to retrieve the latest collected data.

### Harvester

Harvesters process data written by other components. They can be triggered when new source data arrives (`on-source`) or run on a fixed schedule.

```typescript
import { Harvester } from '@cepseudo/components'
import type { HarvesterConfiguration, DataRecord } from '@cepseudo/shared'

class TemperatureAverageHarvester extends Harvester {
  getUserConfiguration(): HarvesterConfiguration {
    return {
      name: 'temperature-average',
      type: 'harvester',
      description: 'Computes hourly average temperature',
      contentType: 'application/json',
      endpoint: 'temperature-average',
      source: 'weather-data',
      source_range: '1h',
      triggerMode: 'scheduled'
    }
  }

  async harvest(
    sourceData: DataRecord[],
    _dependenciesData: Record<string, DataRecord | DataRecord[] | null>
  ): Promise<Buffer> {
    const readings = await Promise.all(
      sourceData.map(async (record) => {
        const raw = await record.data()
        return JSON.parse(raw.toString())
      })
    )

    const avgTemp =
      readings.reduce((sum, r) => sum + r.current_weather.temperature, 0) /
      readings.length

    return Buffer.from(JSON.stringify({ averageTemperature: avgTemp }))
  }
}
```

### Handler

Handlers expose stateless HTTP endpoints. They do not write to the database and are suited for real-time computations or proxy requests.

```typescript
import { Handler } from '@cepseudo/components'
import { servableEndpoint, Type } from '@cepseudo/shared'
import type { ComponentConfiguration, DataResponse, Static, TypedRequest } from '@cepseudo/shared'

const sumInput = Type.Object({ a: Type.Number(), b: Type.Number() })

class CalculatorHandler extends Handler {
  getConfiguration(): ComponentConfiguration {
    return {
      name: 'calculator',
      description: 'Adds numbers',
      contentType: 'application/json'
    }
  }

  @servableEndpoint({ path: '/calc/sum', method: 'post', schema: { body: sumInput } })
  async sum(req: TypedRequest): Promise<DataResponse> {
    const { a, b } = req.body as Static<typeof sumInput>
    return {
      status: 200,
      content: JSON.stringify({ sum: a + b }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
```

#### The request contract

Every endpoint handler receives a `TypedRequest` and returns a `DataResponse`. Both are plain
objects defined in `@cepseudo/shared`, so a component never imports the HTTP framework.

| `TypedRequest` field | Content |
|---|---|
| `params` | Path parameters (`/things/:id` gives `{ id }`) |
| `query` | Query string, values as strings unless a `querystring` schema converts them |
| `body` | Parsed JSON body, or the text fields of a multipart form |
| `headers` | Request headers |
| `user` | The caller identified from the headers, `undefined` for anonymous requests |
| `file` | Metadata and temp path of an uploaded file on multipart routes |

`DataResponse` is `{ status, content, headers? }`: the engine writes it back as-is.

The optional `schema` on `@servableEndpoint` takes JSON Schema for `params`, `querystring`, `body`
and `response`. Write it with the `Type` builder exported by `@cepseudo/shared`. The engine validates
the request before the handler runs, answers `400` with a structured error on mismatch, converts
`params` and `querystring` values to the declared types, and publishes the schema in the OpenAPI
document served at `/api/openapi.json`.

Deliberately not exposed: the raw framework request and reply, streams, and sockets. A component
that needs them belongs in the engine or in a Fastify plugin registered through `engine.getServer()`.

### CustomTableManager

CustomTableManagers define structured database tables with automatic CRUD endpoints and owner-based access control.

```typescript
import { CustomTableManager } from '@cepseudo/components'
import type { StoreConfiguration, DataResponse } from '@cepseudo/shared'

class SensorRegistryManager extends CustomTableManager {
  getConfiguration(): StoreConfiguration {
    return {
      name: 'sensors',
      description: 'IoT sensor registry',
      columns: {
        sensor_id: 'text unique not null',
        type: 'text not null',
        location: 'text',
        active: 'boolean default true'
      }
    }
  }
}
```

This generates the following endpoints automatically:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sensors` | No | List all records |
| `POST` | `/sensors` | Yes | Create a record (sets `owner_id`) |
| `GET` | `/sensors/:id` | No | Get record by ID |
| `PUT` | `/sensors/:id` | Yes | Update record (owner only) |
| `DELETE` | `/sensors/:id` | Yes | Delete record (owner only) |

You can add custom endpoints alongside the built-in CRUD ones:

```typescript
getConfiguration(): StoreConfiguration {
  return {
    name: 'sensors',
    description: 'IoT sensor registry',
    columns: {
      sensor_id: 'text unique not null',
      type: 'text not null',
      active: 'boolean default true'
    },
    endpoints: [
      { path: '/by-type', method: 'get', handler: 'handleGetByType' }
    ]
  }
}

async handleGetByType(req: TypedRequest): Promise<DataResponse> {
  const type = req.query.type
  const records = await this.findByColumn('type', type)
  return {
    status: 200,
    content: JSON.stringify(records),
    headers: { 'Content-Type': 'application/json' }
  }
}
```

## License

MIT
