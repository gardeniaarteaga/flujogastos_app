const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const sharedApiBaseUrl =
  process.env.API_BASE_URL || process.env.NG_APP_API_BASE_URL;

const envTargets = [
  {
    path: join(__dirname, '..', 'public', 'env.js'),
    apiBaseUrl:
      process.env.WEB_API_BASE_URL ||
      sharedApiBaseUrl ||
      'http://localhost:3001/api',
  },
  {
    path: join(__dirname, '..', 'projects', 'pago-rapido-android', 'public', 'env.js'),
    apiBaseUrl:
      process.env.MOBILE_API_BASE_URL ||
      sharedApiBaseUrl ||
      'https://flujogastosapi-production.up.railway.app/api',
  },
];

for (const target of envTargets) {
  const content = `window.__APP_CONFIG__ = {
  apiBaseUrl: ${JSON.stringify(target.apiBaseUrl)},
};
`;

  writeFileSync(target.path, content);
}
