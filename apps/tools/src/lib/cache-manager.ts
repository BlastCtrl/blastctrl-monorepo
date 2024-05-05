/* eslint-disable @typescript-eslint/no-unsafe-return */
import { redisClient } from "./redis";
import type { Config } from "cache-manager";
import { caching } from "cache-manager";
// import * as devalue from "devalue";

const stringify = (value: unknown) => JSON.stringify(value);
const parse = (val: string) => JSON.parse(val);
const keys = (pattern: string) => redisClient.keys(pattern);

export class NoCacheableError implements Error {
  name = "NoCacheableError";
  constructor(public message: string) {}
}

function builder() {
  const options: Config = {
    isCacheable(value) {
      return value !== null || value !== undefined;
    },
    ttl: 100000,
  };
  const isCacheable =
    options?.isCacheable ?? ((value) => value !== undefined && value !== null);

  return {
    name: "redis",
    async get<T>(key: string) {
      const val = await redisClient.get<any>(key);
      if (val === undefined || val === null) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      else return parse(val) as T;
    },
    async set<T>(key: string, value: T, ttl?: number) {
      if (value === null || value === undefined)
        throw new NoCacheableError(
          `"${String(value)}" is not a cacheable value`,
        );
      const t = ttl ?? options?.ttl;
      if (t !== undefined && t !== 0)
        await redisClient.set(key, stringify(value), { px: t, nx: true });
      else await redisClient.set(key, stringify(value));
    },
    async mset(args: [string, unknown][], ttl?: number) {
      const t = ttl ?? options?.ttl;
      if (t !== undefined && t !== 0) {
        const multi = redisClient.multi();
        for (const [key, value] of args) {
          if (!isCacheable(value))
            throw new NoCacheableError(
              `"${stringify(value)}" is not a cacheable value`,
            );
          multi.set(key, stringify(value), { px: t });
        }
        await multi.exec();
      } else await redisClient.mset(Object.fromEntries(args));
    },
    mget: (...args: string[]) =>
      redisClient
        .mget(args)
        .then((x) =>
          x.map((x) =>
            x === null || x === undefined
              ? undefined
              : (parse(x as string) as unknown),
          ),
        ),
    async mdel(...args: string[]) {
      await redisClient.del(...args);
    },
    async del(key: string) {
      await redisClient.del(key);
    },
    ttl: async (key: string) => redisClient.pttl(key),
    keys: (pattern = "*") => keys(pattern),
    reset: async () => {
      await redisClient.flushdb({ async: true });
    },
    isCacheable,
    client: () => redisClient,
  };
}

const cache = await caching(builder());

export default cache;
