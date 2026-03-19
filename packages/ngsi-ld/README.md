# @cepseudo/ngsi-ld

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Optional NGSI-LD plugin for the Digital Twin Framework. Implements the [ETSI NGSI-LD](https://www.etsi.org/deliver/etsi_gs/CIM/001_099/009/) API specification directly -- no FIWARE or Orion dependency. Provides entity management, subscription-based notifications, and a Redis-backed entity cache for sub-millisecond last-state queries.

This package is designed as a **fully optional plugin**. The framework runs without it. When installed, the engine discovers and loads it dynamically at startup.

## Installation

```bash
pnpm add @cepseudo/ngsi-ld
```

### Peer dependencies

The following must be installed in your project:

```bash
pnpm add bullmq ioredis
```

### Workspace dependencies

This package depends on `@cepseudo/shared`, `@cepseudo/database`, and `@cepseudo/components`, which are resolved automatically in the monorepo workspace.

## How the Optional Plugin Pattern Works

The engine never imports `@cepseudo/ngsi-ld` statically. Instead, it uses a dynamic import with a try/catch at startup:

```typescript
// Inside @cepseudo/engine — dynamic discovery
async function loadOptionalPackages() {
    try {
        const { registerNgsiLd } = await import('@cepseudo/ngsi-ld')
        await registerNgsiLd({ router, db, redis, components, logger })
        logger.info('NGSI-LD plugin loaded')
    } catch {
        // Package not installed — skip silently, framework works without it
        logger.info('NGSI-LD package not installed, skipping')
    }
}
```

The integration point is the **EventBus** from `@cepseudo/shared`. When a Collector or Harvester completes, the engine emits a `component:event` on the event bus. If the NGSI-LD plugin is loaded, it listens for these events, converts data to NGSI-LD entities, updates the entity cache, and evaluates subscriptions. If the plugin is not loaded, the events are simply ignored.

```
Collector writes data --> EventBus emits "component:event"
  |-- ngsi-ld installed --> SubscriptionMatcher evaluates + enqueues notifications
  |-- ngsi-ld not installed --> event ignored, no side effects
```

No package in layers 0--2 (except ngsi-ld itself) may import from this package. Event names and payload types are defined in `@cepseudo/shared`, not here.

## Core Concepts

### Entities

An NGSI-LD entity is a JSON-LD object representing a real-world thing (a sensor, a parking spot, a weather station). Each entity has a URN-style `id`, a `type`, and a set of typed attributes:

- **Property** -- holds a scalar or structured value (e.g. temperature, air quality index)
- **GeoProperty** -- holds a GeoJSON geometry (e.g. sensor location)
- **Relationship** -- references another entity by URN (e.g. a sensor belongs to a device)

Entity last-state is cached in Redis for fast reads. Historical data remains in PostgreSQL.

### Subscriptions

Clients register subscriptions to receive webhook notifications when entities matching certain criteria are created or updated. A subscription defines:

- `entities` -- which entity types to watch
- `watchedAttributes` -- optional list of attributes; notifications fire only when these change
- `q` -- optional filter expression (e.g. `pm25>30;temperature<10`)
- `notification.endpoint` -- the webhook URL to POST to
- `throttling` -- minimum seconds between notifications

Subscriptions are persisted in PostgreSQL and cached in Redis for fast matching.

### Notifications

When an entity update matches a subscription, a notification job is enqueued in BullMQ. A dedicated worker delivers the notification via HTTP POST with exponential backoff retry (up to 3 attempts). Delivery statistics (times sent, times failed, last success) are tracked per subscription.

## API Endpoints

All endpoints are mounted under `/ngsi-ld/v1/` and return `application/ld+json`.

### Entities

| Method   | Path                                        | Description                          |
|----------|---------------------------------------------|--------------------------------------|
| `GET`    | `/ngsi-ld/v1/entities`                      | Query entities by type, q, attrs     |
| `POST`   | `/ngsi-ld/v1/entities`                      | Create or replace an entity          |
| `GET`    | `/ngsi-ld/v1/entities/:entityId`            | Retrieve a single entity             |
| `PATCH`  | `/ngsi-ld/v1/entities/:entityId`            | Merge-patch an entity                |
| `DELETE` | `/ngsi-ld/v1/entities/:entityId`            | Delete an entity                     |
| `PATCH`  | `/ngsi-ld/v1/entities/:entityId/attrs`      | Update specific attributes           |

**Query parameters** for `GET /entities`:

- `type` -- filter by entity type
- `q` -- NGSI-LD q-filter expression (e.g. `pm25>30;temperature<10`)
- `attrs` -- comma-separated list of attributes to project
- `limit` -- max results (default: 20)
- `offset` -- pagination offset (default: 0)

### Subscriptions

| Method   | Path                                            | Description                          |
|----------|-------------------------------------------------|--------------------------------------|
| `POST`   | `/ngsi-ld/v1/subscriptions`                     | Create a subscription                |
| `GET`    | `/ngsi-ld/v1/subscriptions`                     | List all subscriptions               |
| `GET`    | `/ngsi-ld/v1/subscriptions/:subscriptionId`     | Retrieve a single subscription       |
| `PATCH`  | `/ngsi-ld/v1/subscriptions/:subscriptionId`     | Partially update a subscription      |
| `DELETE` | `/ngsi-ld/v1/subscriptions/:subscriptionId`     | Delete a subscription                |

### Types

| Method | Path                    | Description                    |
|--------|-------------------------|--------------------------------|
| `GET`  | `/ngsi-ld/v1/types`     | List all known entity types    |

## Entity Format

Entities follow the ETSI NGSI-LD specification with JSON-LD context:

```json
{
  "id": "urn:ngsi-ld:AirQualityObserved:sensor-42",
  "type": "AirQualityObserved",
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "pm25": {
    "type": "Property",
    "value": 63.2,
    "observedAt": "2026-02-28T14:32:00Z"
  },
  "no2": {
    "type": "Property",
    "value": 28.1,
    "observedAt": "2026-02-28T14:32:00Z"
  },
  "location": {
    "type": "GeoProperty",
    "value": {
      "type": "Point",
      "coordinates": [4.3517, 50.8503]
    }
  },
  "refDevice": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:Device:weather-station-7"
  }
}
```

URNs follow the pattern `urn:ngsi-ld:<Type>:<localId>`. Use the `buildUrn` and `parseUrn` helpers to construct and decompose them.

## Redis Structures

### Entity Cache

Each entity is stored as a JSON string under a key derived from its URN. Type indexes allow efficient queries by entity type.

```
STRING  "ngsi:entity:urn:ngsi-ld:AirQualityObserved:sensor-42"  --> serialized entity JSON
SET     "ngsi:types"                                             --> { "AirQualityObserved", "WeatherObserved", ... }
SET     "ngsi:type:AirQualityObserved"                           --> { "urn:ngsi-ld:AirQualityObserved:sensor-42", ... }
```

- Last-state queries are served from Redis (sub-millisecond).
- Historical queries are served from PostgreSQL.

### Subscription Cache

Active subscriptions are cached in Redis for fast matching on every entity write. Warmed up from PostgreSQL at plugin startup.

```
STRING  "ngsi:sub:<uuid>"                    --> serialized Subscription JSON
SET     "ngsi:subs:type:AirQualityObserved"  --> { "<sub-uuid-1>", "<sub-uuid-7>", ... }
```

The `SubscriptionMatcher` reads from the subscription cache to evaluate conditions without hitting the database on every write.

## Subscription and Notification Flow

```
1. Client POSTs to /ngsi-ld/v1/subscriptions
   --> saved in PostgreSQL + cached in Redis

2. Collector/Harvester writes data
   --> engine emits "component:event" on the EventBus

3. Plugin receives the event
   --> loads the latest data record from the database
   --> calls component.toNgsiLdEntity(data, record)
   --> updates the entity cache in Redis

4. SubscriptionMatcher reads subscription cache
   --> evaluates: entity type match, watchedAttributes change, q-filter, throttling
   --> returns list of matching subscription IDs

5. For each match, a notification job is enqueued in BullMQ
   --> queue: "ngsi-ld-notifications"
   --> 3 attempts with exponential backoff (1s, 5s, 25s)

6. Notification worker POSTs the payload to the subscriber endpoint
   --> Content-Type: application/ld+json
   --> updates times_sent / times_failed in PostgreSQL
   --> updates lastNotificationAt in Redis cache
```

### Notification Payload

```json
{
  "id": "urn:ngsi-ld:Notification:<uuid>",
  "type": "Notification",
  "subscriptionId": "<subscription-uuid>",
  "notifiedAt": "2026-03-19T10:15:00.000Z",
  "data": [
    { "id": "urn:ngsi-ld:AirQualityObserved:sensor-42", "type": "AirQualityObserved", "pm25": { "type": "Property", "value": 63.2 } }
  ]
}
```

## Q-Filter Syntax

The `q` parameter supports comparison expressions with `;` as AND:

| Operator | Example             | Meaning                     |
|----------|---------------------|-----------------------------|
| `==`     | `status=="active"`  | Equals                      |
| `!=`     | `status!="offline"` | Not equals                  |
| `>`      | `pm25>30`           | Greater than                |
| `>=`     | `temperature>=0`    | Greater than or equal       |
| `<`      | `humidity<40`       | Less than                   |
| `<=`     | `no2<=50`           | Less than or equal          |

Multiple conditions are ANDed with `;`:

```
pm25>30;temperature<10;status=="active"
```

The parser resolves attribute values from NGSI-LD Property objects automatically -- `pm25>30` compares against the `value` field of the `pm25` Property.

## NGSI-LD-Aware Components

To have a Collector or Harvester produce NGSI-LD entities automatically, extend the provided abstract base classes instead of the standard ones:

### NgsiLdCollector

```typescript
import { NgsiLdCollector } from '@cepseudo/ngsi-ld'
import { buildAirQualityObserved } from '@cepseudo/ngsi-ld'
import type { DataRecord, NgsiLdEntity } from '@cepseudo/ngsi-ld'

export class AirQualityCollector extends NgsiLdCollector {
    getConfiguration() {
        return {
            name: 'air-quality',
            schedule: '*/5 * * * *',
            description: 'Collects air quality data from sensors',
        }
    }

    async collect() {
        const data = await fetch('https://api.example.com/air-quality')
        return data.json()
    }

    toNgsiLdEntity(data: unknown, _record: DataRecord): NgsiLdEntity {
        const d = data as { sensorId: string; pm25: number; no2: number; timestamp: string }
        return buildAirQualityObserved({
            localId: d.sensorId,
            pm25: d.pm25,
            no2: d.no2,
            dateObserved: d.timestamp,
        })
    }
}
```

### NgsiLdHarvester

Same pattern -- extend `NgsiLdHarvester` and implement `toNgsiLdEntity`. The plugin calls it after each successful harvest.

## Helper Functions

### Property builders

```typescript
import { property, geoProperty, relationship } from '@cepseudo/ngsi-ld'

// Property with value and optional metadata
property(42.5, { observedAt: '2026-03-19T10:00:00Z', unitCode: 'CEL' })
// => { type: 'Property', value: 42.5, observedAt: '...', unitCode: 'CEL' }

// GeoProperty with GeoJSON
geoProperty({ type: 'Point', coordinates: [4.3517, 50.8503] })
// => { type: 'GeoProperty', value: { type: 'Point', coordinates: [...] } }

// Relationship to another entity
relationship('urn:ngsi-ld:Device:station-7')
// => { type: 'Relationship', object: 'urn:ngsi-ld:Device:station-7' }
```

### URN helpers

```typescript
import { buildUrn, parseUrn } from '@cepseudo/ngsi-ld'

buildUrn('AirQualityObserved', 'sensor-42')
// => 'urn:ngsi-ld:AirQualityObserved:sensor-42'

parseUrn('urn:ngsi-ld:AirQualityObserved:sensor-42')
// => { type: 'AirQualityObserved', localId: 'sensor-42' }
```

## Smart Data Models

The package includes builder functions for common FIWARE Smart Data Model types. Each builder accepts a typed attributes object and returns a fully formed NGSI-LD entity.

**Environment:**
- `buildAirQualityObserved` -- PM2.5, PM10, NO2, O3, CO, SO2, temperature, humidity
- `buildWeatherObserved` -- temperature, humidity, wind speed/direction, precipitation
- `buildWaterQualityObserved` -- pH, dissolved oxygen, conductivity, turbidity
- `buildNoiseLevelObserved` -- LAeq, LAmax, sones

**Smart City:**
- `buildStreetLight` -- power state, brightness, energy consumption
- `buildParkingSpot` -- occupancy status, vehicle type
- `buildTrafficFlowObserved` -- vehicle count, average speed, occupancy

**Agrifood:**
- `buildAgriParcel` -- crop type, area, soil type
- `buildAgriSoilMeasurement` -- moisture, pH, nitrogen, phosphorus, potassium
- `buildAgriWeatherObserved` -- solar radiation, evapotranspiration

**Device:**
- `buildDevice` -- device metadata, battery, signal strength
- `buildDeviceMeasurement` -- generic sensor readings

## Architecture

`@cepseudo/ngsi-ld` sits at LAYER 2 in the Digital Twin Framework dependency graph:

```
LAYER 3:  engine              -- loads ngsi-ld dynamically via import()
LAYER 2:  ngsi-ld             -- entities, subscriptions, notifications
LAYER 2:  assets, components  -- business logic, file management
LAYER 1:  database, storage, auth  -- infrastructure adapters
LAYER 0:  shared              -- types, errors, utilities, validation
```

Internal structure:

```
src/
  cache/
    entity_cache.ts           -- Redis entity last-state cache
  components/
    ngsi_ld_collector.ts      -- Abstract NGSI-LD collector base class
    ngsi_ld_harvester.ts      -- Abstract NGSI-LD harvester base class
    type_guards.ts            -- Runtime type checks for NGSI-LD components
  endpoints/
    entities.ts               -- CRUD /ngsi-ld/v1/entities
    attrs.ts                  -- PATCH /ngsi-ld/v1/entities/:id/attrs
    subscriptions.ts          -- CRUD /ngsi-ld/v1/subscriptions
    types.ts                  -- GET /ngsi-ld/v1/types
  helpers/
    property.ts               -- property(), geoProperty(), relationship() builders
    urn.ts                    -- buildUrn(), parseUrn()
  models/
    environment/              -- Air quality, weather, water quality, noise
    smart_city/               -- Street lights, parking, traffic
    agrifood/                 -- Parcels, soil, weather
    device/                   -- Devices, measurements
  notifications/
    notification_sender.ts    -- Enqueues notification jobs in BullMQ
    notification_worker.ts    -- Delivers notifications via HTTP POST
  subscriptions/
    subscription_store.ts     -- PostgreSQL persistence for subscriptions
    subscription_cache.ts     -- Redis cache for active subscriptions
    subscription_matcher.ts   -- Evaluates subscriptions against entity updates
    q_parser.ts               -- Parses and evaluates q-filter expressions
  types/
    entity.ts                 -- NgsiLdEntity, NgsiLdProperty, etc.
    subscription.ts           -- Subscription, SubscriptionCreate
    notification.ts           -- NotificationPayload, NotificationJobData
    context.ts                -- JSON-LD context constants
  plugin.ts                   -- registerNgsiLd() entry point
  index.ts                    -- Public API exports
```

## Database Schema

The plugin creates its own table on first load (via `subscriptionStore.runMigration()`). No manual migration is needed.

```sql
CREATE TABLE IF NOT EXISTS ngsi_ld_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255),
    description TEXT,
    entity_types TEXT[],
    watched_attributes TEXT[],
    q VARCHAR(1000),
    notification_endpoint VARCHAR(500) NOT NULL,
    notification_format VARCHAR(50) DEFAULT 'normalized',
    notification_attrs TEXT[],
    throttling INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    last_notification_at TIMESTAMP,
    last_success_at TIMESTAMP,
    times_sent INTEGER DEFAULT 0,
    times_failed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## License

MIT
