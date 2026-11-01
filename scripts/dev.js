// One command: start the mock server and the Expo dev server together.
//   npm run dev            -> mock server (calm: SM_CALM unset = the real, hostile behaviour) + Expo
//   SM_CALM=1 npm run dev  -> same, with the deliberate failures switched off
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const lan = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal);
const port = process.env.PORT || '4010';
const apiUrl = process.env.EXPO_PUBLIC_API_URL || `http://${lan ? lan.address : '10.0.2.2'}:${port}`;

console.log(`\nMock API: http://0.0.0.0:${port}`);
console.log(`The app will default to ${apiUrl} (change it in the app under Settings)\n`);

const server = spawn(process.execPath, [path.join(__dirname, '../mock/server.js')], { stdio: 'inherit', env: { ...process.env, PORT: port } });
const expo = spawn('npx', ['expo', 'start'], { stdio: 'inherit', shell: true, env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl } });

const stop = () => {
  server.kill();
  expo.kill();
};
process.on('SIGINT', stop);
process.on('exit', stop);
expo.on('exit', () => process.exit(0));
