import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

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
