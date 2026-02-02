import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('VISOICNative', {
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
  receive: (channel: string, func: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => func(...args));
  },
  invoke: (channel: string, data?: unknown) => {
    return ipcRenderer.invoke(channel, data);
  },
  config: {
    save: (config: unknown): Promise<boolean> => ipcRenderer.invoke('config:save', config),
    load: (): Promise<unknown | null> => ipcRenderer.invoke('config:load'),
  },
  frame: {
    minimize: () => ipcRenderer.send('frame-minimize'),
    maximize: () => ipcRenderer.send('frame-maximize'),
    close: () => ipcRenderer.send('frame-close'),
  },
  isf: {
    getCategories: (): Promise<string[]> =>
      ipcRenderer.invoke('isf:getCategories'),
    getShadersByCategory: (category: string): Promise<Array<{ name: string; hasVertex: boolean }>> =>
      ipcRenderer.invoke('isf:getShadersByCategory', category),
    getAllShaders: (): Promise<Array<{ id: string; name: string; category: string; hasVertex: boolean }>> =>
      ipcRenderer.invoke('isf:getAllShaders'),
    readShader: (category: string, name: string): Promise<{ fragment: string; vertex: string | null } | null> =>
      ipcRenderer.invoke('isf:readShader', category, name),
    readShaderById: (id: string): Promise<{ fragment: string; vertex: string | null } | null> =>
      ipcRenderer.invoke('isf:readShaderById', id),
  },
  // Graph File System API
  graph: {
    showSaveDialog: (): Promise<string | null> =>
      ipcRenderer.invoke('graph:showSaveDialog'),
    showOpenDialog: (): Promise<string | null> =>
      ipcRenderer.invoke('graph:showOpenDialog'),
    saveToFile: (filePath: string, content: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('graph:saveToFile', filePath, content),
    loadFromFile: (filePath: string): Promise<{ success: boolean; content?: string; error?: string }> =>
      ipcRenderer.invoke('graph:loadFromFile', filePath),
  },
  // Shader Test Suite API
  shaderTest: {
    // Send test progress to main process (for CLI clients)
    sendProgress: (progress: unknown) => ipcRenderer.send('shader-test:progress', progress),
    // Send test result to main process
    sendResult: (result: unknown) => ipcRenderer.send('shader-test:result', result),
    // Send test complete notification
    sendComplete: (suiteResult: unknown) => ipcRenderer.send('shader-test:complete', suiteResult),
    // Get current test state
    getState: (): Promise<unknown> => ipcRenderer.invoke('shader-test:get-state'),
    // Get last error for a shader
    getLastError: (shaderId: string): Promise<{ error: string; wgsl: string } | null> =>
      ipcRenderer.invoke('shader-test:get-last-error', shaderId),
    // Clear test results
    clear: () => ipcRenderer.send('shader-test:clear'),
    // Listen for test start command from CLI
    onStart: (callback: (config: unknown) => void) => {
      ipcRenderer.on('shader-test:start', (_event, config) => callback(config));
    },
    // Listen for test stop command from CLI
    onStop: (callback: () => void) => {
      ipcRenderer.on('shader-test:stop', () => callback());
    },
    // Listen for retry shader command from CLI
    onRetry: (callback: (payload: { shaderId: string }) => void) => {
      ipcRenderer.on('shader-test:retry', (_event, payload) => callback(payload));
    },
    // Listen for navigate to test page command
    onNavigate: (callback: () => void) => {
      ipcRenderer.on('shader-test:navigate', () => callback());
    },
  },
});
