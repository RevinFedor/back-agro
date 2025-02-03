import * as GeoTIFF from 'geotiff';
import { createCanvas, ImageData } from 'canvas';
import * as path from 'path';
import { writeFileSync } from 'fs';

// Импортируем ваш enum из схемы Prisma или объявляем вручную
export enum SpectralType {
  RGB = 'RGB',
  NDVI = 'NDVI',
  INFRARED = 'INFRARED',
  VARI = 'VARI',
}

// Описание возвращаемого результата
interface SpectralResult {
  type: SpectralType;
  imagePath: string;
}

export class SpectralService {
  /**
   * Основной метод генерации PNG-файлов разных спектров на базе исходного TIFF.
   * @param tiffPath Путь к исходному TIFF (например, "uploads/tasks/<taskId>/odm_orthophoto.tif")
   * @param outputDir Папка, куда сохраняем PNG
   */
  async generateSpectralImages(
    tiffPath: string,
    outputDir: string,
  ): Promise<SpectralResult[]> {
    // Читаем исходный TIFF с помощью geotiff
    const tiff = await GeoTIFF.fromFile(tiffPath);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();

    // Читаем все каналы (band) в массив `rasters`
    // Обычно в RGB-файле 3 или 4 канала, в мультиспектральном может быть больше
    const rasters = await image.readRasters();

    // Перечисляем нужные режимы спектров
    const modes: SpectralType[] = [
      SpectralType.RGB,
      SpectralType.NDVI,
      SpectralType.INFRARED,
      SpectralType.VARI,
    ];

    const results: SpectralResult[] = [];

    for (const mode of modes) {
      // Создаем canvas и получаем ImageData
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);

      // Обрабатываем пиксели (как на фронтенде)
      const processedData = this.processSpectralData(
        //@ts-ignore
        rasters,
        mode,
        width,
        height,
      );

      imageData.data.set(processedData);
      ctx.putImageData(imageData, 0, 0);

      // Сохраняем в PNG
      const outPath = path.join(outputDir, `${mode.toLowerCase()}.png`);
      // Здесь можно использовать fs.createWriteStream, но для упрощения writeFileSync
      const buffer = canvas.toBuffer('image/png');
      writeFileSync(outPath, buffer);

      results.push({
        type: mode,
        imagePath: outPath, // Абсолютный путь к созданному PNG
      });
    }

    return results;
  }

  /**
   * Универсальная функция, которая на основе `mode` вызывает нужную логику
   * для преобразования пиксельных данных (NDVI, INFRARED, VARI, RGB).
   */
  private processSpectralData(
    rasters: (Uint8Array | Uint16Array | Float32Array)[],
    mode: SpectralType,
    width: number,
    height: number,
  ): Uint8ClampedArray {
    switch (mode) {
      case SpectralType.NDVI:
        return this.processNDVI(rasters, width, height);
      case SpectralType.INFRARED:
        return this.processInfrared(rasters, width, height);
      case SpectralType.VARI:
        return this.processVARI(rasters, width, height);
      case SpectralType.RGB:
      default:
        return this.processRGB(rasters, width, height);
    }
  }

  /**
   *  реализации логики для каждого спектра.
   * Можно упростить/усложнить по желанию, включая нормализацию, гамму и т.д.
   */

 private isBackgroundPixel(values: number[]): boolean {
    // Проверяем, являются ли все значения нулевыми или очень близкими к нулю
    const threshold = 1e-6;
    return values.every(val => Math.abs(val) < threshold);
}

private processRGB(
    rasters: (Uint8Array | Uint16Array | Float32Array)[],
    width: number,
    height: number,
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);

    // Обычно каналы [0] = R, [1] = G, [2] = B, [3] = Alpha/NIR
    const r = rasters[0];
    const g = rasters[1] || r;
    const b = rasters[2] || r;

    // Простейшая нормализация (min/max) можно улучшить
    // 1) Находим минимальные/максимальные значения
    let minR = Infinity, maxR = -Infinity;
    let minG = Infinity, maxG = -Infinity;
    let minB = Infinity, maxB = -Infinity;

    for (let i = 0; i < width * height; i++) {
        minR = Math.min(minR, r[i]);
        maxR = Math.max(maxR, r[i]);
        if (g) {
            minG = Math.min(minG, g[i]);
            maxG = Math.max(maxG, g[i]);
        }
        if (b) {
            minB = Math.min(minB, b[i]);
            maxB = Math.max(maxB, b[i]);
        }
    }
    if (minG === Infinity) {
        minG = minR;
        maxG = maxR;
    }
    if (minB === Infinity) {
        minB = minR;
        maxB = maxR;
    }

    // 2) Заполняем data
    for (let i = 0; i < width * height; i++) {
        if (this.isBackgroundPixel([r[i], g[i], b[i]])) {
            data[4 * i + 3] = 0; // Прозрачный фон
            continue;
        }

        const R = this.normalize(r[i], minR, maxR);
        const G = this.normalize(g[i], minG, maxG);
        const B = this.normalize(b[i], minB, maxB);

        data[4 * i + 0] = R;
        data[4 * i + 1] = G;
        data[4 * i + 2] = B;
        data[4 * i + 3] = 255;
    }
    return data;
}

private processNDVI(
    rasters: (Uint8Array | Uint16Array | Float32Array)[],
    width: number,
    height: number,
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);

    // Допустим, NIR — это 4-й канал (rasters[3]), RED — это rasters[0]
    const nir = rasters[3] || rasters[0];
    const red = rasters[0];

    for (let i = 0; i < width * height; i++) {
        if (this.isBackgroundPixel([nir[i], red[i]])) {
            data[4 * i + 3] = 0; // Прозрачный фон
            continue;
        }

        const nirVal = nir[i];
        const redVal = red[i];
        if (nirVal + redVal === 0) {
            data[4 * i + 3] = 0;
            continue;
        }

        const ndvi = (nirVal - redVal) / (nirVal + redVal + 1e-6);
        // Нормируем NDVI (обычно -1..1) в 0..1
        const normalized = (ndvi + 1) / 2;

        // Колоризация: от красного (0) к зеленому (1)
        const R = Math.floor((1 - normalized) * 255);
        const G = Math.floor(normalized * 255);

        data[4 * i + 0] = R;
        data[4 * i + 1] = G;
        data[4 * i + 2] = 0;
        data[4 * i + 3] = 255;
    }
    return data;
}

private processInfrared(
    rasters: (Uint8Array | Uint16Array | Float32Array)[],
    width: number,
    height: number,
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);

    // Допустим, NIR = rasters[3], RED = rasters[0], GREEN = rasters[1]
    const nir = rasters[3] || rasters[0];
    const red = rasters[0];
    const green = rasters[1] || rasters[0];

    // Простейшая нормализация
    let minNIR = Infinity, maxNIR = -Infinity;
    let minRED = Infinity, maxRED = -Infinity;
    let minGRN = Infinity, maxGRN = -Infinity;

    for (let i = 0; i < width * height; i++) {
        minNIR = Math.min(minNIR, nir[i]);
        maxNIR = Math.max(maxNIR, nir[i]);
        minRED = Math.min(minRED, red[i]);
        maxRED = Math.max(maxRED, red[i]);
        minGRN = Math.min(minGRN, green[i]);
        maxGRN = Math.max(maxGRN, green[i]);
    }

    for (let i = 0; i < width * height; i++) {
        if (this.isBackgroundPixel([nir[i], red[i], green[i]])) {
            data[4 * i + 3] = 0; // Прозрачный фон
            continue;
        }

        const R = this.normalize(nir[i], minNIR, maxNIR);
        const G = this.normalize(red[i], minRED, maxRED);
        const B = this.normalize(green[i], minGRN, maxGRN);

        data[4 * i + 0] = R;
        data[4 * i + 1] = G;
        data[4 * i + 2] = B;
        data[4 * i + 3] = 255;
    }
    return data;
}

private processVARI(
    rasters: (Uint8Array | Uint16Array | Float32Array)[],
    width: number,
    height: number,
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);

    const red = rasters[0];
    const green = rasters[1];
    const blue = rasters[2];

    if (!red || !green || !blue) {
        return data;
    }

    for (let i = 0; i < width * height; i++) {
        if (this.isBackgroundPixel([red[i], green[i], blue[i]])) {
            data[4 * i + 3] = 0; // Прозрачный фон
            continue;
        }

        const rVal = red[i];
        const gVal = green[i];
        const bVal = blue[i];

        const denom = gVal + rVal - bVal + 1e-6;
        if (denom === 0) {
            data[4 * i + 3] = 0;
            continue;
        }

        const vari = (gVal - rVal) / denom;
        const normalized = (vari + 1) / 2;

        const R = Math.floor((1 - normalized) * 255);
        const G = Math.floor(normalized * 255);
        const B = 0;

        data[4 * i + 0] = R;
        data[4 * i + 1] = G;
        data[4 * i + 2] = B;
        data[4 * i + 3] = 255;
    }
    return data;
}

  /**
   * Простейшая линейная нормализация значения к 0..255
   */
  private normalize(value: number, minV: number, maxV: number): number {
    if (maxV === minV) {
      return 0;
    }
    let norm = (value - minV) / (maxV - minV);
    // Ограничиваем 0..1
    norm = Math.min(Math.max(norm, 0), 1);
    return Math.floor(norm * 255);
  }
}
