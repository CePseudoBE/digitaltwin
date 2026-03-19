# @digitaltwin/components

[![npm version](https://img.shields.io/npm/v/@digitaltwin/components)](https://www.npmjs.com/package/@digitaltwin/components)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

Core component base classes for the Digital Twin framework. Extend these to build your application.

## Installation

```bash
pnpm add @digitaltwin/components
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
import { Collector } from '@digitaltwin/components'
import type { CollectorConfiguration } from '@digitaltwin/shared'

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
import { Harvester } from '@digitaltwin/components'
import type { HarvesterConfiguration, DataRecord } from '@digitaltwin/shared'

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
import { Handler } from '@digitaltwin/components'
import { servableEndpoint } from '@digitaltwin/shared'
import type { ComponentConfiguration, DataResponse } from '@digitaltwin/shared'

class HealthHandler extends Handler {
  getConfiguration(): ComponentConfiguration {
    return {
      name: 'health-handler',
      type: 'handler',
      contentType: 'application/json'
    }
  }

  @servableEndpoint({ path: '/health', method: 'get' })
  async checkHealth(): Promise<DataResponse> {
    return {
      status: 200,
      content: JSON.stringify({
        status: 'ok',
        uptime: process.uptime()
      })
    }
  }
}
```

### CustomTableManager

CustomTableManagers define structured database tables with automatic CRUD endpoints and owner-based access control.

```typescript
import { CustomTableManager } from '@digitaltwin/components'
import type { StoreConfiguration, DataResponse } from '@digitaltwin/shared'

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

async handleGetByType(req: any): Promise<DataResponse> {
  const type = req.query?.type
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
