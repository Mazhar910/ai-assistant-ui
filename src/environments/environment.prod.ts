// Prod environment: served behind a reverse proxy/tunnel where /api maps to the backend,
// so all requests stay same-origin (no CORS, works over the tunnel's HTTPS).
export const environment = {
  production: true,
  apiBaseUrl: '/api'
};
