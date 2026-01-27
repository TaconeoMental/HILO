/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*"
      },
      {
        source: "/r/:projectId/download/:filename",
        destination: "http://backend:8000/r/:projectId/download/:filename"
      }
    ];
  }
};

export default nextConfig;
