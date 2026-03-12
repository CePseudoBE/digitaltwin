/**
 * Concrete component classes for E2E tests.
 *
 * These provide real (non-mocked) behavior to verify the full pipeline
 * from component → database → storage and back.
 */
import { Collector, Harvester, Handler, CustomTableManager } from '@digitaltwin/components'
import { AssetsManager, TilesetManager, MapManager } from '@digitaltwin/assets'
import { servableEndpoint } from '@digitaltwin/shared'
import type {
    CollectorConfiguration,
    HarvesterConfiguration,
    AssetsManagerConfiguration,
    StoreConfiguration,
    ComponentConfiguration,
    DataResponse,
    DataRecord,
    TypedRequest,
} from '@digitaltwin/shared'

// ── Collector ────────────────────────────────────────────────────────────────

export class WeatherCollector extends Collector {
    getConfiguration(): CollectorConfiguration {
        return {
            name: 'e2e_weather',
            description: 'E2E weather data collector',
            contentType: 'application/json',
            endpoint: 'e2e-weather',
        }
    }

    getSchedule(): string {
        return '0 */15 * * * *'
    }

    async collect(): Promise<Buffer> {
        const data = {
            temperature: 22.5,
            humidity: 65,
            pressure: 1013.25,
            timestamp: new Date().toISOString(),
        }
        return Buffer.from(JSON.stringify(data))
    }
}

// ── Harvester ────────────────────────────────────────────────────────────────

export class WeatherAverageHarvester extends Harvester {
    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: 'e2e_weather_avg',
            description: 'E2E weather average harvester',
            contentType: 'application/json',
            endpoint: 'e2e-weather-avg',
            source: 'e2e_weather',
            source_range: 5,
            triggerMode: 'schedule',
        }
    }

    async harvest(
        sourceData: DataRecord | DataRecord[],
        _dependenciesData: Record<string, DataRecord | DataRecord[] | null>
    ): Promise<Buffer> {
        const records = Array.isArray(sourceData) ? sourceData : [sourceData]
        const temps: number[] = []

        for (const record of records) {
            const buf = await record.data()
            const parsed = JSON.parse(buf.toString())
            if (typeof parsed.temperature === 'number') {
                temps.push(parsed.temperature)
            }
        }

        const avg = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0
        return Buffer.from(JSON.stringify({ averageTemperature: avg, sampleCount: temps.length }))
    }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export class CalculatorHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'e2e_calculator',
            description: 'E2E calculator handler',
            contentType: 'application/json',
        }
    }

    @servableEndpoint({ path: '/e2e-calculator/sum', method: 'post' })
    async calculateSum(req: TypedRequest): Promise<DataResponse> {
        const body = req.body as { a: number; b: number }
        return {
            status: 200,
            content: JSON.stringify({ result: body.a + body.b }),
            headers: { 'Content-Type': 'application/json' },
        }
    }

    @servableEndpoint({ path: '/e2e-calculator/health', method: 'get' })
    async healthCheck(): Promise<DataResponse> {
        return {
            status: 200,
            content: JSON.stringify({ status: 'ok' }),
            headers: { 'Content-Type': 'application/json' },
        }
    }
}

// ── AssetsManager ────────────────────────────────────────────────────────────

export class E2EAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'e2e_assets',
            description: 'E2E asset manager',
            contentType: 'application/octet-stream',
            endpoint: 'e2e-assets',
            extension: '.bin',
        }
    }
}

// ── TilesetManager ───────────────────────────────────────────────────────────

export class E2ETilesetManager extends TilesetManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'e2e_tilesets',
            description: 'E2E tileset manager',
            contentType: 'application/json',
            endpoint: 'e2e-tilesets',
            extension: '.zip',
        }
    }
}

// ── MapManager ───────────────────────────────────────────────────────────────

export class E2EMapManager extends MapManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'e2e_maps',
            description: 'E2E map manager',
            contentType: 'application/json',
            endpoint: 'e2e-maps',
            extension: '.json',
        }
    }
}

// ── CustomTableManager ───────────────────────────────────────────────────────

export class E2ECustomTableManager extends CustomTableManager {
    getConfiguration(): StoreConfiguration {
        return {
            name: 'e2e_custom_records',
            description: 'E2E custom table for testing CRUD',
            columns: {
                title: 'text not null',
                value: 'integer default 0',
                active: 'boolean default true',
            },
        }
    }
}
