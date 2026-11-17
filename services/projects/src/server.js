import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const server = createApp(config).listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ msg: `${config.serviceName} listening`, port: config.port }));
});

// Container Apps and docker compose stop containers with SIGTERM.
process.on('SIGTERM', () => server.close(() => process.exit(0)));
