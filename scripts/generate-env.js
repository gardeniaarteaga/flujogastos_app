const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const apiBaseUrl =
  process.env.API_BASE_URL ||
  process.env.NG_APP_API_BASE_URL ||
  'http://localhost:3001/api';

const content = `window.__APP_CONFIG__ = {
  apiBaseUrl: ${JSON.stringify(apiBaseUrl)},
};
`;

const envTargets = [
  join(__dirname, '..', 'public', 'env.js'),
  join(__dirname, '..', 'projects', 'pago-rapido-android', 'public', 'env.js'),
];

for (const envPath of envTargets) {
  writeFileSync(envPath, content);
}
