import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import net from 'net';

// Shader test suite types (shared with renderer)
interface ShaderTestResult {
  shaderId: string;
  shaderName: string;
  category: string;
  status: 'success' | 'error' | 'fixed' | 'skipped';
  error?: string;
  errorLine?: number;
  errorColumn?: number;
  fixAttempts?: number;
  fixApplied?: string;
  wgslOutput?: string;
  duration: number;
  timestamp: number;
}

interface ShaderTestProgress {
  current: number;
  total: number;
  currentShaderId: string;
  currentShaderName: string;
  status: 'testing' | 'fixing' | 'complete';
  lastResult?: ShaderTestResult;
}

interface ShaderTestSuiteResult {
  totalShaders: number;
  passed: number;
  failed: number;
  fixed: number;
  skipped: number;
  results: ShaderTestResult[];
  startTime: number;
  endTime: number;
  duration: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.ELECTRON_DEV === 'true';

// ==========================================
// GPU Optimization Flags
// ==========================================

// Enable WebGPU - critical flags
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU,VulkanFromANGLE');

// Disable software rendering / SwiftShader
app.commandLine.appendSwitch('disable-software-rasterizer');

// Force hardware acceleration
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Use D3D12 backend on Windows (better WebGPU support)
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-features', 'D3D12,WebGPU');

// Disable frame rate limit
app.commandLine.appendSwitch('disable-frame-rate-limit');

// Memory and performance
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // GPU & Performance
      offscreen: false,
      backgroundThrottling: false,
      webgl: true,
      webviewTag: true
    },
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true
      }
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  ipcMain.on('frame-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('frame-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('frame-close', () => {
    mainWindow.close();
  });

  // ==========================================
  // Config Persistence
  // ==========================================

  const configPath = path.join(app.getPath('userData'), 'visoic-config.json');

  ipcMain.handle('config:save', async (_event, config: unknown) => {
    try {
      const tempPath = `${configPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(config, null, 2));
      await fs.rename(tempPath, configPath);
      return true;
    } catch (error) {
      console.error('Failed to save config:', error);
      return false;
    }
  });

  ipcMain.handle('config:load', async () => {
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  });

  // ==========================================
  // ISF Shader File System API
  // ==========================================

  const isfBasePath = isDev
    ? path.join(__dirname, '..', 'ISF')
    : path.join(process.resourcesPath, 'ISF');

  // Get all ISF categories (folders)
  ipcMain.handle('isf:getCategories', async () => {
    try {
      const entries = await fs.readdir(isfBasePath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      console.error('Failed to read ISF categories:', error);
      return [];
    }
  });

  // Get all shaders in a category
  ipcMain.handle('isf:getShadersByCategory', async (_event, category: string) => {
    try {
      const categoryPath = path.join(isfBasePath, category);
      const entries = await fs.readdir(categoryPath, { withFileTypes: true });

      const shaders: Array<{ name: string; hasVertex: boolean }> = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.fs')) {
          const name = entry.name.replace('.fs', '');
          const vertexPath = path.join(categoryPath, `${name}.vs`);
          let hasVertex = false;

          try {
            await fs.access(vertexPath);
            hasVertex = true;
          } catch {
            hasVertex = false;
          }

          shaders.push({ name, hasVertex });
        }
      }

      return shaders;
    } catch (error) {
      console.error(`Failed to read shaders in category ${category}:`, error);
      return [];
    }
  });

  // Get all shaders (flat list)
  ipcMain.handle('isf:getAllShaders', async () => {
    try {
      const categories = await fs.readdir(isfBasePath, { withFileTypes: true });
      const allShaders: Array<{
        id: string;
        name: string;
        category: string;
        hasVertex: boolean;
      }> = [];

      for (const catEntry of categories) {
        if (!catEntry.isDirectory()) continue;

        const categoryPath = path.join(isfBasePath, catEntry.name);
        const entries = await fs.readdir(categoryPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.fs')) {
            const name = entry.name.replace('.fs', '');
            const vertexPath = path.join(categoryPath, `${name}.vs`);
            let hasVertex = false;

            try {
              await fs.access(vertexPath);
              hasVertex = true;
            } catch {
              hasVertex = false;
            }

            allShaders.push({
              id: `${catEntry.name}/${name}`,
              name,
              category: catEntry.name,
              hasVertex,
            });
          }
        }
      }

      return allShaders;
    } catch (error) {
      console.error('Failed to read all ISF shaders:', error);
      return [];
    }
  });

  // Read shader source
  ipcMain.handle('isf:readShader', async (_event, category: string, name: string) => {
    try {
      const fragmentPath = path.join(isfBasePath, category, `${name}.fs`);
      const vertexPath = path.join(isfBasePath, category, `${name}.vs`);

      const fragment = await fs.readFile(fragmentPath, 'utf-8');

      let vertex: string | null = null;
      try {
        vertex = await fs.readFile(vertexPath, 'utf-8');
      } catch {
        // No vertex shader
      }

      return { fragment, vertex };
    } catch (error) {
      console.error(`Failed to read shader ${category}/${name}:`, error);
      return null;
    }
  });

  // Read shader by ID (category/name format)
  ipcMain.handle('isf:readShaderById', async (_event, id: string) => {
    const [category, name] = id.split('/');
    if (!category || !name) return null;

    try {
      const fragmentPath = path.join(isfBasePath, category, `${name}.fs`);
      const vertexPath = path.join(isfBasePath, category, `${name}.vs`);

      const fragment = await fs.readFile(fragmentPath, 'utf-8');

      let vertex: string | null = null;
      try {
        vertex = await fs.readFile(vertexPath, 'utf-8');
      } catch {
        // No vertex shader
      }

      return { fragment, vertex };
    } catch (error) {
      console.error(`Failed to read shader ${id}:`, error);
      return null;
    }
  });

  // ==========================================
  // Shader Test Suite IPC API
  // ==========================================

  // Store for test state
  let shaderTestState: {
    isRunning: boolean;
    progress: ShaderTestProgress | null;
    results: ShaderTestResult[];
    lastErrors: Map<string, { error: string; wgsl: string }>;
  } = {
    isRunning: false,
    progress: null,
    results: [],
    lastErrors: new Map(),
  };

  // CLI server for external test control
  let cliServer: net.Server | null = null;
  let cliClients: Set<net.Socket> = new Set();
  const CLI_PORT = 19847; // Visoic shader test CLI port

  function broadcastToCliClients(message: object) {
    const data = JSON.stringify(message) + '\n';
    for (const client of cliClients) {
      try {
        client.write(data);
      } catch {
        cliClients.delete(client);
      }
    }
  }

  // Start CLI server
  function startCliServer() {
    if (cliServer) return;

    cliServer = net.createServer((socket) => {
      console.log('[ShaderTestCLI] Client connected');
      cliClients.add(socket);

      // Send current state to new client
      socket.write(JSON.stringify({
        type: 'connected',
        payload: {
          isRunning: shaderTestState.isRunning,
          progress: shaderTestState.progress,
        }
      }) + '\n');

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const message = JSON.parse(line);
            handleCliMessage(socket, message);
          } catch (e) {
            console.error('[ShaderTestCLI] Invalid message:', line);
          }
        }
      });

      socket.on('close', () => {
        console.log('[ShaderTestCLI] Client disconnected');
        cliClients.delete(socket);
      });

      socket.on('error', (err) => {
        console.error('[ShaderTestCLI] Socket error:', err);
        cliClients.delete(socket);
      });
    });

    cliServer.listen(CLI_PORT, '127.0.0.1', () => {
      console.log(`[ShaderTestCLI] Server listening on port ${CLI_PORT}`);
    });

    cliServer.on('error', (err) => {
      console.error('[ShaderTestCLI] Server error:', err);
    });
  }

  function handleCliMessage(socket: net.Socket, message: { type: string; payload?: unknown }) {
    switch (message.type) {
      case 'start-test':
        mainWindow.webContents.send('shader-test:start', message.payload);
        break;
      case 'stop-test':
        mainWindow.webContents.send('shader-test:stop');
        break;
      case 'get-status':
        socket.write(JSON.stringify({
          type: 'status',
          payload: {
            isRunning: shaderTestState.isRunning,
            progress: shaderTestState.progress,
          }
        }) + '\n');
        break;
      case 'get-results':
        socket.write(JSON.stringify({
          type: 'results',
          payload: shaderTestState.results,
        }) + '\n');
        break;
      case 'get-last-error':
        const errorData = shaderTestState.lastErrors.get((message.payload as { shaderId: string })?.shaderId || '');
        socket.write(JSON.stringify({
          type: 'last-error',
          payload: errorData || null,
        }) + '\n');
        break;
      case 'retry-shader':
        mainWindow.webContents.send('shader-test:retry', message.payload);
        break;
      case 'reload-window':
        mainWindow.webContents.reload();
        socket.write(JSON.stringify({ type: 'reloaded' }) + '\n');
        break;
      case 'navigate-test-page':
        mainWindow.webContents.send('shader-test:navigate');
        break;
    }
  }

  // Start CLI server when app is ready
  startCliServer();

  // IPC: Start shader test
  ipcMain.on('shader-test:start-request', (_event, config: { shaderIds?: string[]; categories?: string[] }) => {
    mainWindow.webContents.send('shader-test:start', config);
  });

  // IPC: Receive test progress from renderer
  ipcMain.on('shader-test:progress', (_event, progress: ShaderTestProgress) => {
    shaderTestState.isRunning = progress.status !== 'complete';
    shaderTestState.progress = progress;
    broadcastToCliClients({ type: 'progress', payload: progress });
  });

  // IPC: Receive test result from renderer
  ipcMain.on('shader-test:result', (_event, result: ShaderTestResult) => {
    shaderTestState.results.push(result);
    if (result.error && result.wgslOutput) {
      shaderTestState.lastErrors.set(result.shaderId, {
        error: result.error,
        wgsl: result.wgslOutput,
      });
    }
    broadcastToCliClients({ type: 'result', payload: result });
  });

  // IPC: Receive test complete from renderer
  ipcMain.on('shader-test:complete', (_event, suiteResult: ShaderTestSuiteResult) => {
    shaderTestState.isRunning = false;
    shaderTestState.progress = null;
    broadcastToCliClients({ type: 'complete', payload: suiteResult });
    console.log(`[ShaderTest] Complete: ${suiteResult.passed}/${suiteResult.totalShaders} passed, ${suiteResult.failed} failed, ${suiteResult.fixed} fixed`);
  });

  // IPC: Get current test state
  ipcMain.handle('shader-test:get-state', () => {
    return {
      isRunning: shaderTestState.isRunning,
      progress: shaderTestState.progress,
      results: shaderTestState.results,
    };
  });

  // IPC: Clear test results
  ipcMain.on('shader-test:clear', () => {
    shaderTestState.results = [];
    shaderTestState.lastErrors.clear();
    broadcastToCliClients({ type: 'cleared' });
  });

  // IPC: Get last error for shader
  ipcMain.handle('shader-test:get-last-error', (_event, shaderId: string) => {
    return shaderTestState.lastErrors.get(shaderId) || null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
