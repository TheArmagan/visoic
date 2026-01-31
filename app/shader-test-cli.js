#!/usr/bin/env node
/**
 * Visoic Shader Test CLI
 * 
 * A command-line tool to control shader testing in the Visoic app.
 * Connects to the running app via TCP socket and allows automated testing.
 * 
 * Usage:
 *   node shader-test-cli.js [command] [options]
 * 
 * Commands:
 *   start [--category <name>] [--shader <id>]  Start shader tests
 *   stop                                        Stop running tests
 *   status                                      Get current test status
 *   results                                     Get test results
 *   error <shaderId>                           Get last error for a shader
 *   retry <shaderId>                           Retry a specific shader
 *   reload                                      Reload the app window
 *   navigate                                    Navigate to test page
 *   watch                                       Watch for test events in real-time
 * 
 * Examples:
 *   node shader-test-cli.js start
 *   node shader-test-cli.js start --category Effects
 *   node shader-test-cli.js watch
 *   node shader-test-cli.js error "Effects/Blur"
 */

import net from 'net';
import readline from 'readline';

const CLI_PORT = 19847;
const HOST = '127.0.0.1';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
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
  const statusSymbols = {
    success: '✓',
    error: '✗',
    fixed: '⚙',
    skipped: '○',
  };

  const color = statusColors[result.status] || 'reset';
  const symbol = statusSymbols[result.status] || '?';

  log(`${symbol} ${result.shaderName} (${result.category}) - ${result.duration.toFixed(0)}ms`, color);

  if (result.error) {
    log(`  Error: ${result.error.split('\n')[0]}`, 'red');
  }
}

function logProgress(progress) {
  const percent = ((progress.current / progress.total) * 100).toFixed(1);
  log(`[${progress.current}/${progress.total}] (${percent}%) Testing: ${progress.currentShaderName}`, 'cyan');
}

function logSummary(result) {
  log('\n═══════════════════════════════════════', 'bright');
  log('Test Suite Complete', 'bright');
  log('═══════════════════════════════════════', 'bright');
  log(`Total: ${result.totalShaders}`);
  log(`Passed: ${result.passed}`, 'green');
  log(`Failed: ${result.failed}`, result.failed > 0 ? 'red' : 'reset');
  log(`Fixed: ${result.fixed}`, result.fixed > 0 ? 'yellow' : 'reset');
  log(`Skipped: ${result.skipped}`, 'gray');
  log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
  log('═══════════════════════════════════════\n', 'bright');
}

class ShaderTestCLI {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.buffer = '';
    this.messageHandlers = new Map();
    this.watchMode = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port: CLI_PORT, host: HOST }, () => {
        this.connected = true;
        log('Connected to Visoic Shader Test Server', 'green');
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
        if (this.watchMode) {
          log('\nDisconnected from server', 'yellow');
          process.exit(0);
        }
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
    // Check for specific handlers
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.payload);
      return;
    }

    // Default handling for watch mode
    if (this.watchMode) {
      switch (message.type) {
        case 'progress':
          logProgress(message.payload);
          break;
        case 'result':
          logResult(message.payload);
          break;
        case 'complete':
          logSummary(message.payload);
          break;
        case 'connected':
          if (message.payload.isRunning) {
            log('Tests are currently running...', 'cyan');
          }
          break;
      }
    }
  }

  send(message) {
    if (!this.connected) {
      throw new Error('Not connected to server');
    }
    this.socket.write(JSON.stringify(message) + '\n');
  }

  waitForResponse(type, timeout = 5000) {
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

  async startTest(options = {}) {
    const payload = {};
    if (options.category) {
      payload.categories = [options.category];
    }
    if (options.shader) {
      payload.shaderIds = [options.shader];
    }

    this.send({ type: 'start-test', payload });
    log('Test started', 'green');
  }

  async stopTest() {
    this.send({ type: 'stop-test' });
    log('Test stop requested', 'yellow');
  }

  async getStatus() {
    this.send({ type: 'get-status' });
    const status = await this.waitForResponse('status');

    if (status.isRunning) {
      log('Tests are running', 'cyan');
      if (status.progress) {
        logProgress(status.progress);
      }
    } else {
      log('No tests running', 'gray');
    }

    return status;
  }

  async getResults() {
    this.send({ type: 'get-results' });
    const results = await this.waitForResponse('results');

    if (!results || results.length === 0) {
      log('No test results available', 'gray');
      return [];
    }

    log(`\n${results.length} test results:\n`);
    for (const result of results) {
      logResult(result);
    }

    // Summary
    const passed = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    log(`\nSummary: ${passed} passed, ${failed} failed out of ${results.length}`, 'bright');

    return results;
  }

  async getError(shaderId) {
    this.send({ type: 'get-last-error', payload: { shaderId } });
    const error = await this.waitForResponse('last-error');

    if (!error) {
      log(`No error found for shader: ${shaderId}`, 'gray');
      return null;
    }

    log(`\nError for ${shaderId}:`, 'red');
    log(error.error, 'red');

    if (error.wgsl) {
      log('\nGenerated WGSL:', 'cyan');
      console.log(error.wgsl);
    }

    return error;
  }

  async retryShader(shaderId) {
    this.send({ type: 'retry-shader', payload: { shaderId } });
    log(`Retry requested for: ${shaderId}`, 'cyan');
  }

  async reloadWindow() {
    this.send({ type: 'reload-window' });
    const response = await this.waitForResponse('reloaded');
    log('Window reloaded', 'green');
  }

  async navigateToTestPage() {
    this.send({ type: 'navigate-test-page' });
    log('Navigate to test page requested', 'cyan');
  }

  async watch() {
    this.watchMode = true;
    log('Watching for test events... (Ctrl+C to exit)\n', 'cyan');

    // Keep connection alive
    return new Promise(() => { });
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      options.category = args[++i];
    } else if (args[i] === '--shader' && args[i + 1]) {
      options.shader = args[++i];
    } else if (!args[i].startsWith('--')) {
      options.arg = args[i];
    }
  }

  return { command, options };
}

function showHelp() {
  console.log(`
${colors.bright}Visoic Shader Test CLI${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node shader-test-cli.js [command] [options]

${colors.cyan}Commands:${colors.reset}
  start [options]     Start shader tests
    --category <name>   Filter by category
    --shader <id>       Test specific shader

  stop                Stop running tests
  status              Get current test status
  results             Get all test results
  error <shaderId>    Get last error for a shader
  retry <shaderId>    Retry a specific shader
  reload              Reload the app window
  navigate            Navigate to shader test page
  watch               Watch for test events in real-time
  help                Show this help message

${colors.cyan}Examples:${colors.reset}
  node shader-test-cli.js start
  node shader-test-cli.js start --category Effects
  node shader-test-cli.js error "Effects/Blur"
  node shader-test-cli.js watch

${colors.gray}Note: The Visoic app must be running for this CLI to work.${colors.reset}
`);
}

// Interactive mode
async function runInteractive(cli) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.cyan}shader-test>${colors.reset} `,
  });

  log('\nInteractive mode. Type "help" for commands, "exit" to quit.\n', 'cyan');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    const parts = input.split(/\s+/);
    const cmd = parts[0];

    try {
      switch (cmd) {
        case 'start':
          await cli.startTest();
          break;
        case 'stop':
          await cli.stopTest();
          break;
        case 'status':
          await cli.getStatus();
          break;
        case 'results':
          await cli.getResults();
          break;
        case 'error':
          if (parts[1]) {
            await cli.getError(parts[1]);
          } else {
            log('Usage: error <shaderId>', 'yellow');
          }
          break;
        case 'retry':
          if (parts[1]) {
            await cli.retryShader(parts[1]);
          } else {
            log('Usage: retry <shaderId>', 'yellow');
          }
          break;
        case 'reload':
          await cli.reloadWindow();
          break;
        case 'navigate':
          await cli.navigateToTestPage();
          break;
        case 'help':
          showHelp();
          break;
        case 'exit':
        case 'quit':
          cli.disconnect();
          process.exit(0);
        default:
          log(`Unknown command: ${cmd}. Type "help" for available commands.`, 'yellow');
      }
    } catch (e) {
      log(`Error: ${e.message}`, 'red');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    cli.disconnect();
    process.exit(0);
  });
}

// Main
async function main() {
  const { command, options } = parseArgs();

  if (command === 'help') {
    showHelp();
    return;
  }

  const cli = new ShaderTestCLI();

  try {
    await cli.connect();

    switch (command) {
      case 'start':
        await cli.startTest(options);
        // Don't disconnect immediately, let the test run
        if (!options.watch) {
          setTimeout(() => cli.disconnect(), 100);
        }
        break;

      case 'stop':
        await cli.stopTest();
        setTimeout(() => cli.disconnect(), 100);
        break;

      case 'status':
        await cli.getStatus();
        cli.disconnect();
        break;

      case 'results':
        await cli.getResults();
        cli.disconnect();
        break;

      case 'error':
        if (options.arg) {
          await cli.getError(options.arg);
        } else {
          log('Usage: shader-test-cli.js error <shaderId>', 'yellow');
        }
        cli.disconnect();
        break;

      case 'retry':
        if (options.arg) {
          await cli.retryShader(options.arg);
        } else {
          log('Usage: shader-test-cli.js retry <shaderId>', 'yellow');
        }
        setTimeout(() => cli.disconnect(), 100);
        break;

      case 'reload':
        await cli.reloadWindow();
        cli.disconnect();
        break;

      case 'navigate':
        await cli.navigateToTestPage();
        setTimeout(() => cli.disconnect(), 100);
        break;

      case 'watch':
        await cli.watch();
        break;

      case 'interactive':
      case 'i':
        await runInteractive(cli);
        break;

      default:
        log(`Unknown command: ${command}`, 'red');
        showHelp();
        cli.disconnect();
    }
  } catch (e) {
    log(`Error: ${e.message}`, 'red');
    process.exit(1);
  }
}

main();
