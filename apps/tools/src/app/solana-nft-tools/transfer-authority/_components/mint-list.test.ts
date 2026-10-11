import { describe, expect, it } from "vitest";
import { address } from "./fixtures";
import { parseMintList } from "./mint-list";

const [a, b, c] = [address(), address(), address()];

describe("parseMintList", () => {
  it("reads one address per line", () => {
    expect(parseMintList(`${a}\n${b}\n${c}`).mints).toEqual([a, b, c]);
  });

  it("handles Windows line endings, padding and blank lines", () => {
    expect(parseMintList(`  ${a}\r\n\r\n${b}  \n\n`).mints).toEqual([a, b]);
  });

  it("drops duplicates and reports invalid lines", () => {
    const result = parseMintList(`${a}\n${a}\nnot-a-key\n${b}`);
    expect(result).toEqual({
      mints: [a, b],
      invalid: ["not-a-key"],
      duplicates: 1,
    });
  });

  it("rejects a line with more than one address", () => {
    const result = parseMintList(`${a}, ${b}`);
    expect(result.mints).toEqual([]);
    expect(result.invalid).toEqual([`${a}, ${b}`]);
  });

  it("rejects JSON", () => {
    const result = parseMintList(JSON.stringify([a, b]));
    expect(result.mints).toEqual([]);
    expect(result.invalid).toHaveLength(1);
  });

  it("is empty for blank text", () => {
    expect(parseMintList("  \n ")).toEqual({
      mints: [],
      invalid: [],
      duplicates: 0,
    });
  });
});
