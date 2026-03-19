import { Collector, Harvester, Handler, CustomTableManager } from '@cepseudo/components'
import { AssetsManager } from '@cepseudo/assets'
import type {
    CollectorConfiguration,
    HarvesterConfiguration,
    ComponentConfiguration,
    AssetsManagerConfiguration,
    DataRecord
} from '@cepseudo/shared'

export class TestCollector extends Collector {
    constructor(private componentName: string = 'test-collector', private endpoints: any[] = []) {
        super()
    }

    async collect(): Promise<Buffer> {
        return Buffer.from(JSON.stringify({ data: 'test' }))
    }

    getConfiguration(): CollectorConfiguration {
        return {
            name: this.componentName,
            description: 'Test collector',
            contentType: 'application/json',
            endpoint: this.componentName,
        }
    }

    getSchedule(): string {
        return '0 * * * * *'
    }

    getEndpoints() {
        return this.endpoints
    }
}

export class TestHarvester extends Harvester {
    constructor(
        private componentName: string = 'test-harvester',
        private endpoints: any[] = [],
        private sourceOverride?: string,
        private triggerModeOverride?: 'schedule' | 'on-source' | 'both'
    ) {
        super()
    }

    async harvest(sourceData: DataRecord | DataRecord[]): Promise<Buffer> {
        return Buffer.from(JSON.stringify({ harvested: true }))
    }

    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: this.componentName,
            description: 'Test harvester',
            contentType: 'application/json',
            endpoint: this.componentName,
            source: this.sourceOverride || 'test-source',
            triggerMode: this.triggerModeOverride || 'schedule',
            debounceMs: 100,
            source_range_min: false,
            multiple_results: false,
        }
    }

    getSchedule(): string {
        if (this.triggerModeOverride === 'on-source') return ''
        return '0 * * * * *'
    }

    getEndpoints() {
        return this.endpoints
    }
}

export class TestHandler extends Handler {
    constructor(private componentName: string = 'test-handler', private endpoints: any[] = []) {
        super()
    }

    getConfiguration(): ComponentConfiguration {
        return {
            name: this.componentName,
            description: 'Test handler',
            contentType: 'application/json',
        }
    }

    getEndpoints() {
        return this.endpoints
    }
}

export class TestAssetsManager extends AssetsManager {
    constructor(private componentName: string = 'test-assets') {
        super()
    }

    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: this.componentName,
            description: 'Test assets manager',
            contentType: 'image/png',
            endpoint: 'assets',
        }
    }
}

export class TestCustomTableManager extends CustomTableManager {
    constructor(private componentName: string = 'test-custom-table') {
        super()
    }

    getConfiguration() {
        return {
            name: this.componentName,
            description: 'Test custom table',
            columns: { custom_field: 'TEXT' },
        }
    }
}
