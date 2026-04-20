import TileLayer from 'ol/layer/Tile'
import ImageTileSource from 'ol/source/ImageTile'
import { GLOBAL_DATA_MAP_FIELD_START_ZOOM_LEVEL, type Settings } from '../composables/useSettings'

export interface GlobalPredictionsController {
  layer: TileLayer<ImageTileSource>
  update(settings: Settings): void
  dispose(): void
}

export function createGlobalPredictionsLayer(_settings: Settings): GlobalPredictionsController {
  const worker = new Worker(new URL('../workers/predictions-worker.ts', import.meta.url), {
    type: 'module',
  })

  const tileQueue: Array<() => void> = []

  const source = new ImageTileSource({
    tileSize: 512,
    loader: (z, x, y, { signal }) => {
      return new Promise<ImageBitmap>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        const loadTile = () => {
          if (signal.aborted) {
            // Tile was aborted while waiting in queue — skip it
            reject(signal.reason)
            tileQueue.shift()
            tileQueue[0]?.()
            return
          }
          const handleMessage = ({ data: { action, imageData } }: MessageEvent) => {
            if (action !== 'rendered') return
            worker.removeEventListener('message', handleMessage)
            resolve(imageData)
            tileQueue.shift()
            tileQueue[0]?.()
          }
          signal.addEventListener(
            'abort',
            () => {
              worker.removeEventListener('message', handleMessage)
              reject(signal.reason)
              tileQueue.shift()
              tileQueue[0]?.()
            },
            { once: true },
          )
          worker.addEventListener('message', handleMessage)
          worker.postMessage({ action: 'render', tile: [z, x, y] })
        }
        // Reject immediately if aborted while still in queue (before loadTile runs)
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        if (tileQueue.length === 0) {
          loadTile()
        }
        tileQueue.push(loadTile)
      })
    },
  })

  const layer = new TileLayer({
    source,
    minZoom: GLOBAL_DATA_MAP_FIELD_START_ZOOM_LEVEL,
    properties: { name: 'global-predictions' },
  })

  return {
    layer,
    update(_newSettings: Settings) {
      // TODO: threshold/year updates
    },
    dispose() {
      worker.terminate()
    },
  }
}
