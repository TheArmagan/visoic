#!/usr/bin/env node
/**
 * Visoic Shader Test CLI
 * 
 * Usage:
 *   node shader-test-cli.js [--only-failed] [--detailed] [shader...]
 * 
 * Examples:
 *   node shader-test-cli.js                              # Test all shaders
 *   node shader-test-cli.js "Effects/Blur"              # Test one shader
 *   node shader-test-cli.js "Effects/Blur" "Effects/Bloom"  # Test multiple shaders
 *   node shader-test-cli.js --only-failed               # Only log failed tests
 *   node shader-test-cli.js --detailed "Effects/Blur"   # Show compiled WGSL code
 */

import net from 'net';

const CLI_PORT = 19847;
const HOST = '127.0.0.1';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logResult(result) {
  const statusColors = {
    success: 'green',
    error: 'red',
    fixed: 'yellow',
    skipped: 'gray',
  };

  const color = statusColors[result.status] || 'reset';

  log(`${result.shaderName} (${result.category}) - ${result.duration.toFixed(0)}ms`, color);

  if (result.error) {
    log(`  Error: ${result.error.split('\n')[0]} (Line: ${result.errorLine ?? 'unknown'}, Column: ${result.errorColumn ?? 'unknown'})`, 'red');
  }
}

function logProgress(progress) {
  const percent = ((progress.current / progress.total) * 100).toFixed(1);
  log(`[${progress.current}/${progress.total}] (${percent}%) Testing: ${progress.currentShaderName}`, 'cyan');
}

function logSummary(result) {
  log('\n---------------------------------------', 'bright');
  log('Test Suite Complete', 'bright');
  log('---------------------------------------', 'bright');
  log(`Total: ${result.totalShaders}`);
  log(`Passed: ${result.passed}`, 'green');
  log(`Failed: ${result.failed}`, result.failed > 0 ? 'red' : 'reset');
  log(`Fixed: ${result.fixed}`, result.fixed > 0 ? 'yellow' : 'reset');
  log(`Skipped: ${result.skipped}`, 'gray');
  log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  log('---------------------------------------\n', 'bright');
}

class ShaderTestCLI {
  constructor(onlyFailed = false, detailed = false) {
    this.socket = null;
    this.connected = false;
    this.buffer = '';
    this.messageHandlers = new Map();
    this.onlyFailed = onlyFailed;
    this.detailed = detailed;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port: CLI_PORT, host: HOST }, () => {
        this.connected = true;
        log('Connected to Visoic', 'green');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            this.handleMessage(message);
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      this.socket.on('close', () => {
        this.connected = false;
      });

      this.socket.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
          reject(new Error('Could not connect to Visoic. Is the app running?'));
        } else {
          reject(err);
        }
      });
    });
  }

  handleMessage(message) {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.payload);
      return;
    }

    // Live updates
    switch (message.type) {
      case 'progress':
        if (!this.onlyFailed) logProgress(message.payload);
        break;
      case 'result':
        if (!this.onlyFailed || message.payload.status === 'error') {
          logResult(message.payload);
        }
        if (this.detailed && message.payload.wgsl) {
          log('\n------------- Compiled WGSL -------------', 'cyan');
          console.log(message.payload.wgsl);
          log('------------------------------------------\n', 'cyan');
        }
        break;
      case 'complete':
        logSummary(message.payload);
        this.disconnect();
        process.exit(message.payload.failed > 0 ? 1 : 0);
        break;
    }
  }

  send(message) {
    if (!this.connected) {
      throw new Error('Not connected to server');
    }
    this.socket.write(JSON.stringify(message) + '\n');
  }

  waitForResponse(type, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.messageHandlers.delete(type);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeout);

      this.messageHandlers.set(type, (payload) => {
        clearTimeout(timer);
        this.messageHandlers.delete(type);
        resolve(payload);
      });
    });
  }

  async runTest(shaderIds = []) {
    // 1. Reload window
    log('Reloading window...', 'cyan');
    this.send({ type: 'reload-window' });
    await this.waitForResponse('reloaded');
    log('Window reloaded', 'green');

    // 2. Wait a bit for app to initialize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Start test
    const payload = {
      includeWgsl: this.detailed,
    };
    if (shaderIds.length > 0) {
      payload.shaderIds = shaderIds;
      log(`Starting test for: ${shaderIds.join(', ')}`, 'cyan');
    } else {
      log('Starting all shader tests...', 'cyan');
    }

    this.send({ type: 'start-test', payload });
    log('Test started\n', 'green');

    // Results will come via handleMessage -> complete event
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

function showHelp() {
  console.log(`
${colors.bright}Visoic Shader Test CLI${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node shader-test-cli.js [--only-failed] [--detailed] [shader...]

${colors.cyan}Options:${colors.reset}
  --only-failed    Only log failed tests
  --detailed       Show compiled WGSL code (useful for debugging)

${colors.cyan}Examples:${colors.reset}
  node shader-test-cli.js                              # Test all shaders
  node shader-test-cli.js "Effects/Blur"              # Test one shader
  node shader-test-cli.js "Effects/Blur" "Effects/Bloom"  # Test multiple shaders
  node shader-test-cli.js --only-failed               # Only log failed tests
  node shader-test-cli.js --detailed "Effects/Blur"   # Show compiled WGSL code

${colors.gray}Note: The Visoic app must be running.${colors.reset}
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const onlyFailed = args.includes('--only-failed');
  const detailed = args.includes('--detailed');
  const shaderIds = args.filter(arg => !arg.startsWith('-'));
  const cli = new ShaderTestCLI(onlyFailed, detailed);

  try {
    await cli.connect();
    await cli.runTest(shaderIds);
  } catch (e) {
    log(`Error: ${e.message}`, 'red');
    process.exit(1);
  }
}

main();
