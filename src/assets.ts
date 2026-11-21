// Preloads the CC0 photo textures and skies (see public/assets/CREDITS.md).
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export const TEX_IDS = [
  'leafy_grass', 'forest_ground_04', 'rocky_terrain_02', 'brown_mud_leaves_01', 'rock_face', 'sand_01', 'gravelly_sand',
  'red_sandstone_wall', 'sandstone_cracks', 'white_rough_plaster', 'clay_roof_tiles_02', 'brick_wall_10', 'concrete_wall_004',
  'corrugated_iron', 'concrete_floor_02', 'pine_bark', 'aerial_grass_rock', 'mossy_rock', 'river_small_rocks', 'snow_02', 'asphalt_02',
] as const;
export type TexId = (typeof TEX_IDS)[number];

const SKY_FILES = {
  day: 'kloofendal_48d_partly_cloudy_puresky',
  gold: 'kloppenheim_06_puresky',
  cloud: 'sunflowers_puresky',
  mist: 'kloofendal_misty_morning_puresky',
} as const;
export type SkyId = keyof typeof SKY_FILES;

export interface TexSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}
export interface SkyAsset {
  bg: THREE.Texture;
  env: THREE.Texture;
  /** Direction to the sun as photographed. */
  sunDir: THREE.Vector3;
  /** Colour of the haze at the horizon, for fog. */
  horizon: THREE.Color;
}

const texs = new Map<string, TexSet>();
const skies = new Map<string, SkyAsset>();
let ready: Promise<void> | undefined;

export function tex(id: TexId): TexSet {
  return texs.get(id)!;
}
export function sky(id: SkyId): SkyAsset {
  return skies.get(id)!;
}

export function loadAssets(renderer: THREE.WebGLRenderer, onProgress: (f: number) => void = () => {}) {
  if (ready) return ready;
  const base = `${import.meta.env.BASE_URL}assets/`;
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const total = TEX_IDS.length * 2 + Object.keys(SKY_FILES).length * 2;
  let done = 0;
  const tick = <T>(v: T) => {
    onProgress(++done / total);
    return v;
  };
  const prep = (t: THREE.Texture, srgb: boolean) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const jobs: Promise<unknown>[] = [];
  for (const id of TEX_IDS) {
    jobs.push(
      Promise.all([
        loader.loadAsync(`${base}tex/${id}_diff.jpg`).then(tick),
        loader.loadAsync(`${base}tex/${id}_nor.jpg`).then(tick),
      ]).then(([d, n]) => texs.set(id, { map: prep(d, true), normalMap: prep(n, false) })),
    );
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  for (const [key, file] of Object.entries(SKY_FILES)) {
    jobs.push(
      Promise.all([
        loader.loadAsync(`${base}sky/${file}.jpg`).then(tick),
        new HDRLoader().setDataType(THREE.FloatType).loadAsync(`${base}sky/${file}_1k.hdr`).then(tick),
      ]).then(([bg, hdr]) => {
        bg.mapping = THREE.EquirectangularReflectionMapping;
        bg.colorSpace = THREE.SRGBColorSpace;

        // Find the sun (brightest pixel) and tame it so the image-based light
        // stays soft; the hard sunlight comes from a real shadow-casting lamp.
        const img = hdr.image as { data: Float32Array; width: number; height: number };
        const { data, width, height } = img;
        const stride = data.length / (width * height);
        let best = -1;
        let bi = 0;
        for (let i = 0; i < width * height; i++) {
          const o = i * stride;
          const l = data[o] + data[o + 1] + data[o + 2];
          if (l > best) {
            best = l;
            bi = i;
          }
          for (let k = 0; k < 3; k++) if (data[o + k] > 24) data[o + k] = 24;
        }
        const u = ((bi % width) + 0.5) / width;
        const v = 1 - (Math.floor(bi / width) + 0.5) / height;
        const lon = (u - 0.5) * Math.PI * 2;
        const lat = (v - 0.5) * Math.PI;
        const sunDir = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        hdr.needsUpdate = true;
        const env = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();

        // Average the strip just above the horizon for the fog colour.
        const cv = document.createElement('canvas');
        cv.width = 64;
        cv.height = 32;
        const g = cv.getContext('2d')!;
        g.drawImage(bg.image as CanvasImageSource, 0, 0, 64, 32);
        const px = g.getImageData(0, 14, 64, 2).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) {
          r += px[i];
          gg += px[i + 1];
          b += px[i + 2];
        }
        const n = (px.length / 4) * 255;
        const horizon = new THREE.Color().setRGB(r / n, gg / n, b / n, THREE.SRGBColorSpace);
        skies.set(key, { bg, env, sunDir, horizon });
      }),
    );
  }
  ready = Promise.all(jobs).then(() => pmrem.dispose());
  return ready;
}

/** Deterministic smooth noise in 0..1, used for terrain patches and rock shapes. */
export function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}
export function fbm2(x: number, y: number) {
  return noise2(x, y) * 0.55 + noise2(x * 2.1 + 9, y * 2.1 + 4) * 0.3 + noise2(x * 4.3 + 2, y * 4.3 + 7) * 0.15;
}
