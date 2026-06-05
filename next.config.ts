import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** App directory (where package.json and node_modules live). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Prevent Turbopack from inferring C:\codes as root due to sibling lockfiles.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
