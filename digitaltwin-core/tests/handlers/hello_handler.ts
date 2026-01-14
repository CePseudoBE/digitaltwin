import { Handler } from '../../src/components/handler.js'
import type { ComponentConfiguration, DataResponse } from "../../src/components/types.js"
import { servableEndpoint } from "../../src/utils/servable_endpoint.js";

export class HelloHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'hello',
            description: 'Says hello to people',
            contentType: 'text/plain',
        }
    }

    @servableEndpoint({ path: '/hi/:name', method: 'GET', responseType: 'text/plain' })
    async sayHi({ name }: { name: string }): Promise<DataResponse> {
        return {
            status: 200,
            content: `Hello, ${name}!`,
        }
    }
}
