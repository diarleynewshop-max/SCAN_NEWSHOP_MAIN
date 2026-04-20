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

  it("nao persiste foto local em blob ou data url", () => {
    expect(shouldPersistPhoto({ photo: "blob:http://localhost/123", photoBlob: new Blob(["x"]) })).toBe(false);
    expect(shouldPersistPhoto({ photo: "data:image/jpeg;base64,abc" })).toBe(false);
  });

  it("mantem apenas URL remota na serializacao", () => {
    const persisted = stripPhotoForPersistence({
      photo: "https://cdn.exemplo.com/foto.jpg",
      photoBlob: null,
    });

    const stripped = stripPhotoForPersistence({
      photo: "blob:http://localhost/123",
      photoBlob: new Blob(["x"]),
    });

    expect(persisted.photo).toBe("https://cdn.exemplo.com/foto.jpg");
    expect(stripped.photo).toBeNull();
    expect(stripped.photoBlob).toBeUndefined();
  });
});
