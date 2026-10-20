import { describe, expect, it } from "vitest";
import { buildNftMetadata, uploadNftMetadata } from "./metaplex-json-metadata";

const image = new File(["img"], "pic.png", { type: "image/png" });
const video = new File(["vid"], "clip.mp4", { type: "video/mp4" });

const recordingUploader = () => {
  const uploads: { file: File; label: string }[] = [];
  const upload = async (file: File, label: string) => {
    uploads.push({ file, label });
    return `https://arweave.net/${uploads.length}`;
  };
  return { uploads, upload };
};

describe("buildNftMetadata", () => {
  it("keeps the JSON to the basic fields when there are no files", () => {
    expect(
      buildNftMetadata(
        { name: "N", symbol: "S", description: "D", external_url: "" },
        {},
      ),
    ).toEqual({ name: "N", symbol: "S", description: "D", external_url: "" });
  });

  it("lists the files and lets the animation decide the category", () => {
    const json = buildNftMetadata(
      {
        name: "N",
        symbol: "S",
        image,
        animation_url: video,
        attributes: [{ trait_type: "t", value: "v" }],
      },
      { image: "https://arweave.net/i", animation: "https://arweave.net/a" },
    );

    expect(json).toMatchObject({
      image: "https://arweave.net/i",
      animation_url: "https://arweave.net/a",
      attributes: [{ trait_type: "t", value: "v" }],
      properties: {
        category: "video",
        files: [
          { uri: "https://arweave.net/i", type: "image/png" },
          { uri: "https://arweave.net/a", type: "video/mp4" },
        ],
      },
    });
  });
});

describe("uploadNftMetadata", () => {
  it("uploads media first, then the JSON that references it", async () => {
    const { uploads, upload } = recordingUploader();

    const uri = await uploadNftMetadata(
      { name: "N", symbol: "S", image, animation_url: video },
      upload,
    );

    expect(uri).toBe("https://arweave.net/3");
    expect(uploads.map((u) => [u.file, u.label])).toEqual([
      [image, "image"],
      [video, "animation file"],
      [expect.any(File), "metadata"],
    ]);
    const json = uploads[2]!.file;
    expect(json.type).toBe("application/json");
    expect(JSON.parse(await json.text())).toMatchObject({
      name: "N",
      image: "https://arweave.net/1",
      animation_url: "https://arweave.net/2",
      properties: { category: "video" },
    });
  });

  it("uploads only the JSON when there are no files", async () => {
    const { uploads, upload } = recordingUploader();

    const uri = await uploadNftMetadata({ name: "N", symbol: "S" }, upload);

    expect(uri).toBe("https://arweave.net/1");
    expect(uploads).toHaveLength(1);
    expect(JSON.parse(await uploads[0]!.file.text())).toEqual({
      name: "N",
      symbol: "S",
    });
  });

  it("stops at the first failed upload", async () => {
    const { uploads, upload } = recordingUploader();
    const failing = async (file: File, label: string) => {
      if (label === "image") throw new Error("insufficient balance");
      return upload(file, label);
    };

    await expect(
      uploadNftMetadata({ name: "N", symbol: "S", image }, failing),
    ).rejects.toThrow("insufficient balance");
    expect(uploads).toEqual([]);
  });
});
