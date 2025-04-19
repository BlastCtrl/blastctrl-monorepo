/* eslint-disable prefer-const */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// exports a function that will accepts a promise and waits a minimum amount of time before resolving
export const withMinimumTime = async <T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> => {
  const [result] = await Promise.all([promise, sleep(ms)]);
  return result;
};

export function chunk<T>(array: T[], size: number): T[][] {
  if (!array?.length || size < 1) {
    return [];
  }
  let index = 0,
    resIndex = 0,
    length = array.length;
  const result = Array(Math.ceil(array.length / size)) as T[][];

  while (index < length) {
    result[resIndex++] = array.slice(index, index + size);
    index += size;
  }
  return result;
}

export const zipMap = <T, U, V>(
  left: T[],
  right: U[],
  fn: (t: T, u: U | null, i: number) => V,
): V[] => left.map((t: T, index) => fn(t, right?.[index] ?? null, index));

export async function fetcher<T>(url: string, options?: RequestInit) {
  const res = await fetch(url, options);

  if (res.status !== 200) {
    throw new Error(res.statusText);
  }

  return (await res.json()) as T;
}

export const iife = <T>(fn: () => T): T => fn();

export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 5) {
  let i = 0;

  for (;;) {
    i++;
    try {
      return await fn();
    } catch (err) {
      if (i === retries) {
        throw err;
      }
      await sleep(i ** 2 * 100);
    }
  }
}

export function mimeTypeToCategory(file: File) {
  const extension = file.name.split(".")[1];
  const isModel = extension === "glb" || extension === "gltf";
  const type = file.type ? file.type : isModel ? "model/gltf-binary" : "";

  if (type) {
    return type.startsWith("image")
      ? "image"
      : type.startsWith("audio")
        ? "audio"
        : type.startsWith("video")
          ? "video"
          : type.startsWith("model")
            ? "vr"
            : type.startsWith("text/html")
              ? "html"
              : type.split("/")[0];
  } else {
    return "";
  }
}

// ---------------------
// Formatters
// ---------------------
const userLocale =
  typeof navigator !== "undefined"
    ? navigator.languages?.length
      ? navigator.languages[0]
      : navigator.language
    : "en-US";

export const numberFormatter = new Intl.NumberFormat(userLocale, {
  style: "decimal",
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 9,
});

export const formatNumber = {
  format: (val?: number, precision?: number) => {
    if (!val && val !== 0) {
      return "--";
    }

    if (precision !== undefined) {
      return numberFormatter.format(
        Math.round((val + Number.EPSILON) * 10 ** precision) / 10 ** precision,
      );
    } else {
      return numberFormatter.format(val);
    }
  },
};

export function abbreviatedNumber(value: number, fixed = 1) {
  if (value < 1e3) return value;
  if (value >= 1e3 && value < 1e6) return +(value / 1e3).toFixed(fixed) + " K";
  if (value >= 1e6 && value < 1e9) return +(value / 1e6).toFixed(fixed) + " M";
  if (value >= 1e9 && value < 1e12) return +(value / 1e9).toFixed(fixed) + " G";
  if (value >= 1e12) return +(value / 1e12).toFixed(fixed) + "T";
}
