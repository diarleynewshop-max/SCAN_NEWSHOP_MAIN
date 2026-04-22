import { describe, expect, it } from "vitest";
import {
  isDataPhotoUrl,
  isObjectPhotoUrl,
  isRemotePhotoUrl,
  shouldPersistPhoto,
  stripPhotoForPersistence,
} from "@/lib/photoUtils";

describe("photoUtils", () => {
  it("detecta tipos de URL de foto", () => {
    expect(isObjectPhotoUrl("blob:http://localhost/123")).toBe(true);
    expect(isDataPhotoUrl("data:image/jpeg;base64,abc")).toBe(true);
    expect(isRemotePhotoUrl("https://cdn.exemplo.com/foto.jpg")).toBe(true);
  });

  it("persiste data url e nao persiste blob local", () => {
    expect(shouldPersistPhoto({ photo: "blob:http://localhost/123", photoBlob: new Blob(["x"]) })).toBe(false);
    expect(shouldPersistPhoto({ photo: "data:image/jpeg;base64,abc" })).toBe(true);
  });

  it("mantem URL remota e data url na serializacao", () => {
    const persisted = stripPhotoForPersistence({
      photo: "https://cdn.exemplo.com/foto.jpg",
      photoBlob: null,
      photoAssetId: "asset-remoto",
    });

    const dataUrl = stripPhotoForPersistence({
      photo: "data:image/jpeg;base64,abc",
      photoBlob: null,
      photoAssetId: "asset-base64",
    });

    const stripped = stripPhotoForPersistence({
      photo: "blob:http://localhost/123",
      photoBlob: new Blob(["x"]),
      photoAssetId: "asset-local",
    });

    expect(persisted.photo).toBe("https://cdn.exemplo.com/foto.jpg");
    expect(persisted.photoAssetId).toBeUndefined();
    expect(dataUrl.photo).toBe("data:image/jpeg;base64,abc");
    expect(dataUrl.photoAssetId).toBeUndefined();
    expect(stripped.photo).toBeNull();
    expect(stripped.photoBlob).toBeUndefined();
    expect(stripped.photoAssetId).toBe("asset-local");
  });
});
