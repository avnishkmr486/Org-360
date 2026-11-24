import type { NextConfig } from "next";

// GitHub Pages build (see .github/workflows/pages.yml): fully static, served under /<repo>.
const pages = process.env.GITHUB_PAGES === "1";
const basePath = pages ? "/Org-360" : "";

const nextConfig: NextConfig = {
  // The dev-mode badge overlaps the sidebar footer controls.
  devIndicators: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(pages ? { output: "export", basePath, trailingSlash: true, images: { unoptimized: true } } : {}),
};

export default nextConfig;
