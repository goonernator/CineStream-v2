const { spawn } = require('child_process');
const { exec } = require('child_process');
const path = require('path');

// Start Next.js dev server
console.log('Starting Next.js dev server...');
const nextDev = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..'),
});

let electronProcess = null;

// Wait for Next.js to be ready, then start Electron
function startElectron() {
  console.log('Waiting for Next.js server to be ready...');
  
  // Use wait-on to wait for the server
  const waitOn = spawn('npx', ['wait-on', 'http://localhost:42069'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, '..'),
  });

  waitOn.on('close', (code) => {
    if (code === 0) {
      console.log('Next.js server is ready! Starting Electron...');
      electronProcess = spawn('npx', ['electron', '.'], {
        stdio: 'inherit',
        shell: true,
        cwd: path.join(__dirname, '..'),
      });
    }
  });
}

// Start Electron after a short delay
setTimeout(startElectron, 3000);

// Clean up on exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  nextDev.kill();
  if (electronProcess) {
    electronProcess.kill();
  }
  process.exit();
});

process.on('SIGTERM', () => {
  nextDev.kill();
  if (electronProcess) {
    electronProcess.kill();
  }
  process.exit();
});
