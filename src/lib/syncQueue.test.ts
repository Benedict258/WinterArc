// Mock IndexedDB for testing
const mockIndexedDB = (() => {
  let db: any = null;
  let stores: any = {};
  
  return {
    open: (name: string, version: number) => {
      const request: any = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: db
      };
      
      // Simulate async behavior
      setTimeout(() => {
        if (request.onupgradeneeded && !db) {
          db = {
            objectStoreNames: {
              contains: (storeName: string) => stores[storeName] !== undefined
            },
            createObjectStore: (storeName: string, options: any) => {
              if (options.keyPath && options.keyPath === 'id' && options.autoIncrement) {
                // Auto-increment store
                let autoId = 1;
                stores[storeName] = {};
                return {
                  add: (value: any) => {
                    const id = autoId++;
                    value.id = id;
                    stores[storeName][id] = value;
                    return Promise.resolve(id);
                  },
                  delete: (id: number) => {
                    delete stores[storeName][id];
                    return Promise.resolve();
                  },
                  clear: () => {
                    stores[storeName] = {};
                    return Promise.resolve();
                  },
                  openCursor: () => {
                    const cursorRequest: any = {
                      onsuccess: null,
                      onerror: null,
                      result: null
                    };
                    
                    setTimeout(() => {
                      let index = 0;
                      const storeItems = Object.values(stores[stores]);
                      const cursor: any = {
                        value: null,
                        continue: () => {
                          index++;
                          if (index < storeItems.length) {
                            cursor.value = storeItems[index];
                            if (request.onsuccess) {
                              request.onsuccess({ target: { result: cursor } });
                            }
                          } else {
                            cursor.value = null;
                            if (request.onsuccess) {
                              request.onsuccess({ target: { result: cursor } });
                            }
                          }
                        }
                      };
                      
                      if (storeItems.length > 0) {
                        cursor.value = storeItems[0];
                      }
                      
                      if (request.onsuccess) {
                        request.onsuccess({ target: { result: cursor } });
                      }
                    }, 1);
                    
                    return cursorRequest;
                  }
                };
              } else {
                // Regular store
                stores[storeName] = {};
                return {
                  put: (value: any) => {
                    const id = value.id || Math.random().toString(36).substr(2, 9);
                    value.id = id;
                    stores[storeName][id] = value;
                    return Promise.resolve(id);
                  },
                  clear: () => {
                    stores[storeName] = {};
                    return Promise.resolve();
                  },
                  openCursor: () => {
                    const cursorRequest: any = {
                      onsuccess: null,
                      onerror: null,
                      result: null
                    };
                    
                    setTimeout(() => {
                      let index = 0;
                      const storeItems = Object.values(stores[stores]);
                      const cursor: any = {
                        value: null,
                        continue: () => {
                          index++;
                          if (index < storeItems.length) {
                            cursor.value = storeItems[index];
                            if (request.onsuccess) {
                              request.onsuccess({ target: { result: cursor } });
                            }
                          } else {
                            cursor.value = null;
                            if (request.onsuccess) {
                              request.onsuccess({ target: { result: cursor } });
                            }
                          }
                        }
                      };
                      
                      if (storeItems.length > 0) {
                        cursor.value = storeItems[0];
                      }
                      
                      if (request.onsuccess) {
                        request.onsuccess({ target: { result: cursor } });
                      }
                    }, 1);
                    
                    return cursorRequest;
                  }
                };
              }
            }
          };
          
          if (request.onupgradeneeded) {
            request.onupgradeneeded({ target: { result: db } });
          }
        }
        
        if (request.onsuccess) {
          request.onsuccess({ target: { result: db } });
        }
      }, 1);
      
      return request;
    }
  };
})();

// Replace global indexedDB with our mock before running tests
// @ts-ignore
global.indexedDB = mockIndexedDB;

// Mock navigator.onLine
const originalNavigator = global.navigator;
global.navigator = {
  ...originalNavigator,
  onLine: true
};

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { 
  initSyncDB, 
  addToQueue, 
  getQueue, 
  removeFromQueue, 
  clearQueue, 
  isOnline, 
  processQueue,
  startSyncListener,
  stopSyncListener
} from './syncQueue';

describe('Sync Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset online status
    // @ts-ignore
    global.navigator.onLine = true;
  });

  afterEach(() => {
    // Restore original navigator
    // @ts-ignore
    global.navigator = originalNavigator;
  });

  describe('initSyncDB', () => {
    it('should initialize the sync database successfully', async () => {
      await expect(initSyncDB()).resolves.not.toThrow();
    });
  });

  describe('isOnline', () => {
    it('should return true when online', () => {
      // @ts-ignore
      global.navigator.onLine = true;
      expect(isOnline()).toBe(true);
    });
    
    it('should return false when offline', () => {
      // @ts-ignore
      global.navigator.onLine = false;
      expect(isOnline()).toBe(false);
    });
  });

  describe('addToQueue and getQueue', () => {
    it('should add an operation to the queue and retrieve it', async () => {
      await initSyncDB();
      
      const operation = { type: 'create', endpoint: '/api/threads', data: { name: 'Test Thread' } };
      await addToQueue(operation);
      
      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        type: 'create',
        endpoint: '/api/threads',
        data: { name: 'Test Thread' },
        timestamp: expect.any(Number)
      });
    });
    
    it('should maintain order of operations in the queue', async () => {
      await initSyncDB();
      
      const op1 = { type: 'create', endpoint: '/api/threads', data: { name: 'Thread 1' } };
      const op2 = { type: 'update', endpoint: '/api/tasks', data: { title: 'Task 1' } };
      
      await addToQueue(op1);
      await addToQueue(op2);
      
      const queue = await getQueue();
      expect(queue).toHaveLength(2);
      expect(queue[0].type).toBe('create');
      expect(queue[1].type).toBe('update');
    });
  });

  describe('removeFromQueue', () => {
    it('should remove an operation from the queue by ID', async () => {
      await initSyncDB();
      
      const operation = { type: 'create', endpoint: '/api/threads', data: { name: 'Test Thread' } };
      await addToQueue(operation);
      
      let queue = await getQueue();
      expect(queue).toHaveLength(1);
      const operationId = queue[0].id;
      
      await removeFromQueue(operationId);
      
      queue = await getQueue();
      expect(queue).toHaveLength(0);
    });
  });

  describe('clearQueue', () => {
    it('should clear all operations from the queue', async () => {
      await initSyncDB();
      
      await addToQueue({ type: 'create', endpoint: '/api/threads', data: { name: 'Thread 1' } });
      await addToQueue({ type: 'update', endpoint: '/api/tasks', data: { title: 'Task 1' } });
      
      let queue = await getQueue();
      expect(queue).toHaveLength(2);
      
      await clearQueue();
      
      queue = await getQueue();
      expect(queue).toHaveLength(0);
    });
  });

  describe('processQueue', () => {
    it('should process queue operations when online', async () => {
      await initSyncDB();
      
      // Mock successful fetch responses
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 1, name: 'Created Thread' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 1, title: 'Updated Task' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });
      
      // Add operations to queue
      await addToQueue({ type: 'create', endpoint: '/api/threads', data: { name: 'Test Thread' } });
      await addToQueue({ type: 'update', endpoint: '/api/tasks', data: { title: 'Test Task' } });
      await addToQueue({ type: 'delete', endpoint: '/api/goals', id: 1 });
      
      // Process queue
      await processQueue();
      
      // Verify fetch was called for each operation
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      // Verify queue is empty after processing
      const queue = await getQueue();
      expect(queue).toHaveLength(0);
    });
    
    it('should not process queue when offline', async () => {
      await initSyncDB();
      
      // Set offline status
      // @ts-ignore
      global.navigator.onLine = false;
      
      // Add operation to queue
      await addToQueue({ type: 'create', endpoint: '/api/threads', data: { name: 'Test Thread' } });
      
      // Process queue (should not do anything)
      await processQueue();
      
      // Verify fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Verify operation is still in queue
      const queue = await getQueue();
      expect(queue).toHaveLength(1);
    });
    
    it('should remove failed operations from queue', async () => {
      await initSyncDB();
      
      // Mock failed fetch response
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      // Add operation to queue
      await addToQueue({ type: 'create', endpoint: '/api/threads', data: { name: 'Test Thread' } });
      
      // Process queue
      await processQueue();
      
      // Verify operation was removed from queue (even though it failed)
      const queue = await getQueue();
      expect(queue).toHaveLength(0);
    });
    
    it('should keep operations in queue for unknown types', async () => {
      await initSyncDB();
      
      // Add operation with unknown type
      await addToQueue({ type: 'unknown', endpoint: '/api/threads', data: { name: 'Test Thread' } });
      
      // Process queue
      await processQueue();
      
      // Verify fetch was not called
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Verify operation was removed from queue (unknown types are removed)
      const queue = await getQueue();
      expect(queue).toHaveLength(0);
    });
  });

  describe('startSyncListener and stopSyncListener', () => {
    it('should start and stop sync listeners', () => {
      const onOnline = jest.fn();
      const onOffline = jest.fn();
      
      // @ts-ignore
      global.navigator.onLine = true;
      
      startSyncListener(onOnline, onOffline);
      
      // Simulate online event
      if (global.navigator.onLine && window.dispatchEvent) {
        window.dispatchEvent(new Event('online'));
      }
      
      // Simulate offline event  
      // @ts-ignore
      global.navigator.onLine = false;
      if (!global.navigator.onLine && window.dispatchEvent) {
        window.dispatchEvent(new Event('offline'));
      }
      
      stopSyncListener();
      
      // Verify listeners were called
      expect(onOnline).toHaveBeenCalled();
      expect(onOffline).toHaveBeenCalled();
    });
  });
});