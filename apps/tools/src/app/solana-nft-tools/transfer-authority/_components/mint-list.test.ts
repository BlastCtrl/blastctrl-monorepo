import { describe, expect, it } from "vitest";
import { address } from "./fixtures";
import { parseMintList } from "./mint-list";

const [a, b, c] = [address(), address(), address()];

describe("parseMintList", () => {
  it("reads addresses separated by newlines, spaces and commas", () => {
    expect(parseMintList(`${a}\n${b}, ${c}`).mints).toEqual([a, b, c]);
  });

  it("reads a JSON array of addresses", () => {
    expect(parseMintList(JSON.stringify([a, b])).mints).toEqual([a, b]);
  });

  it("reads JSON objects by their mint field", () => {
    const text = JSON.stringify([{ mint: a }, { mintAddress: b }, { id: c }]);
    expect(parseMintList(text).mints).toEqual([a, b, c]);
  });

  it("reads an object with a mints array", () => {
    expect(parseMintList(JSON.stringify({ mints: [a] })).mints).toEqual([a]);
  });

  it("drops duplicates and reports invalid entries", () => {
    const result = parseMintList(`${a}\n${a}\nnot-a-key\n${b}`);
    expect(result).toEqual({
      mints: [a, b],
      invalid: ["not-a-key"],
      duplicates: 1,
    });
  });

  it("is empty for blank text", () => {
    expect(parseMintList("  \n ").mints).toEqual([]);
  });

  it("throws on broken JSON", () => {
    expect(() => parseMintList(`["${a}",`)).toThrow(/can't be parsed/);
  });

  it("throws on JSON that isn't a list", () => {
    expect(() => parseMintList(`{"foo": 1}`)).toThrow(/Expected a JSON array/);
  });
});
