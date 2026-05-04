import { defineConfig } from "@trigger.dev/sdk/v3";
import { additionalPackages } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_mvardqmhhvljrkfmiuqg",
  runtime: "node",
  dirs: ["./src/trigger"],
  maxDuration: 5,
  build: {
    external: ["sharp"],
    extensions: [
      additionalPackages({
        packages: ["sharp"],
      }),
    ],
  },
});
