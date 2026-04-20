import Map from 'ol/Map'
import View from 'ol/View'
import VectorTileLayer from 'ol/layer/VectorTile'
import { PMTilesVectorSource } from 'ol-pmtiles'
import { Fill, Stroke, Style } from 'ol/style'
import { createXYZ } from 'ol/tilegrid'
import { confidenceColorScale, getColorForValue } from '../layers/color-scales'

const TILE_SIZE = 512
const tileGrid = createXYZ({ tileSize: [TILE_SIZE, TILE_SIZE] })
const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE)

const threshold = 0.4
const key = 'confidence_mean'

const stroke = new Stroke({
  color: '',
  width: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 1,
})
const fill = new Fill({ color: '' })
const polyStyle = new Style({ stroke, fill })
const smallStyle = new Style({ stroke })

const layer = new VectorTileLayer({
  declutter: false,
  source: new PMTilesVectorSource({
    overlaps: false,
    url: 'https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/ftw/global-field-boundaries/pmtiles/ftw-global-fields-2025.pmtiles',
  }),
})

layer.setStyle((feature, resolution) => {
  const confidence = feature.get(key)
  if (confidence <= threshold) return undefined
  stroke.setColor(getColorForValue(confidenceColorScale, confidence, 1))
  const extent = feature.getGeometry()!.getExtent()
  const widthPx = (extent[2] - extent[0]) / resolution
  const heightPx = (extent[3] - extent[1]) / resolution
  if (widthPx < 3 && heightPx < 3) return smallStyle
  fill.setColor(getColorForValue(confidenceColorScale, confidence, 0.3))
  return polyStyle
})

const map = new Map({
  target: canvas,
  layers: [layer],
  pixelRatio: 1,
  controls: [],
  interactions: [],
})
map.setSize([TILE_SIZE, TILE_SIZE])

const source = layer.getSource()!
const sourceReady = new Promise<void>((resolve) => {
  if (source.getState() === 'ready') {
    resolve()
    return
  }
  const check = () => {
    if (source.getState() === 'ready') {
      resolve()
    } else {
      source.once('change', check)
    }
  }
  source.once('change', check)
})

self.addEventListener('message', async ({ data: { action, tile } }) => {
  if (action !== 'render') return
  await sourceReady
  const view = new View({
    center: tileGrid.getTileCoordCenter(tile),
    resolution: tileGrid.getResolution(tile[0]),
  })
  map.setView(view)
  map.once('rendercomplete', () => {
    const imageData = canvas.transferToImageBitmap()
    self.postMessage({ action: 'rendered', imageData }, [imageData] as any)
  })
})
