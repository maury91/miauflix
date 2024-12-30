const dotenv = require('dotenv');

const result = dotenv.config();

console.log(result.parsed);

module.exports = {
  apps: [
    {
      name: 'Miauflix backend',
      script: 'dist/apps/backend/src/main.js',
      env: result.parsed,
      node_args: '--inspect --max-old-space-size=8192',
    },
  ],
};
