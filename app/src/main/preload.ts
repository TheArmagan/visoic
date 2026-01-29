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
});
