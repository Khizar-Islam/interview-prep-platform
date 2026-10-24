// This is the file that actually starts your backend server.
// Running "npm run dev" in the backend folder executes this file.

require('dotenv').config();

const { loadConfig } = require('./config/env');
const { createApp } = require('./app');

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = createApp(config);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
