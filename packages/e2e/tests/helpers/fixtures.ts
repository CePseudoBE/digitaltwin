/**
 * Test fixture generators for E2E tests.
 */

/**
 * Returns a valid GeoJSON FeatureCollection.
 */
export function sampleGeoJSON(): Record<string, unknown> {
    return {
        type: 'FeatureCollection',
        name: 'test_points',
        features: [
            {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [4.3517, 50.8503],
                },
                properties: {
                    name: 'Brussels',
                    population: 1200000,
                    country: 'Belgium',
                },
            },
            {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [3.7174, 51.0543],
                },
                properties: {
                    name: 'Ghent',
                    population: 265000,
                    country: 'Belgium',
                },
            },
        ],
    }
}

/**
 * Creates a minimal valid 3D Tiles tileset ZIP using JSZip.
 * Contains a tileset.json root file and a dummy tile.
 */
export async function sampleTilesetZip(): Promise<Buffer> {
    const JSZip = (await import('jszip')).default

    const zip = new JSZip()
    zip.file(
        'tileset.json',
        JSON.stringify({
            asset: { version: '1.0' },
            geometricError: 500,
            root: {
                boundingVolume: {
                    region: [-1.3197, 0.6988, -1.3196, 0.6989, 0, 100],
                },
                geometricError: 100,
                content: { uri: 'tile.b3dm' },
            },
        })
    )
    zip.file('tile.b3dm', Buffer.from('fake-b3dm-content'))

    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    return buf
}

/**
 * Returns a minimal valid 1x1 red PNG image as a Buffer.
 */
export function samplePngBuffer(): Buffer {
    // Minimal 1x1 red PNG (67 bytes)
    return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64'
    )
}
