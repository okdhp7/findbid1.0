import type { NextConfig } from "next";
import packageJson from "./package.json";

if (Number.isNaN(Date.parse(packageJson.releaseDate))) {
  throw new Error("package.json의 releaseDate는 유효한 ISO 8601 일시여야 합니다.");
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["222.106.216.58"],
  output: "standalone",
};

export default nextConfig;
