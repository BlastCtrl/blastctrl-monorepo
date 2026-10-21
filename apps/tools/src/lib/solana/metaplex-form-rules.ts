/**
 * react-hook-form rules shared by the Token Metadata forms (mint, update,
 * create-token). The program limits strings by byte, not by character, so
 * `maxLength` (UTF-16 code units) lets a 32-character accented name through
 * that the program then refuses as too long.
 */

/** Token Metadata's limits, in bytes. */
export const METADATA_LIMITS = { name: 32, symbol: 10, uri: 200 } as const;

/** A `validate` rule: the value's UTF-8 length is at most `max` bytes. */
export const maxBytes = (max: number) => (value: string) =>
  new TextEncoder().encode(value).length <= max || `Over ${max} bytes`;
