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
              stores[storeName] = {};
              return {
                put: (value: any) => {
                  const id = value.id || Math.random().toString(36).substr(2, 9);
                  value.id = id;
                  stores[storeName][id] = value;
                  return id;
                },
                clear: () => {
                  stores[storeName] = {};
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

import { 
  initDB, 
  cacheThreads, 
  getCachedThreads, 
  cacheTasks, 
  getCachedTasks, 
  cacheGoals, 
  getCachedGoals, 
  clearCache 
} from './storage';

describe('IndexedDB Storage', () => {
  beforeEach(async () => {
    // Clear all stores before each test
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('workspace-db', 1);
      request.onsuccess = () => resolve(request.result);
    });
    
    const transaction = db.transaction(['threads', 'tasks', 'goals'], 'readwrite');
    ['threads', 'tasks', 'goals'].forEach(store => {
      transaction.objectStore(store).clear();
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  describe('initDB', () => {
    it('should initialize the database successfully', async () => {
      await expect(initDB()).resolves.not.toThrow();
    });
  });

  describe('cacheThreads and getCachedThreads', () => {
    it('should cache and retrieve threads correctly', async () => {
      const mockThreads = [
        { id: '1', name: 'Thread 1', status: 'active' },
        { id: '2', name: 'Thread 2', status: 'parked' }
      ];
      
      await cacheThreads(mockThreads);
      const cachedThreads = await getCachedThreads();
      
      expect(cachedThreads).toHaveLength(2);
      expect(cachedThreads[0]).toEqual(expect.objectContaining({ id: '1', name: 'Thread 1' }));
      expect(cachedThreads[1]).toEqual(expect.objectContaining({ id: '2', name: 'Thread 2' }));
    });
    
    it('should return empty array when no threads are cached', async () => {
      const cachedThreads = await getCachedThreads();
      expect(cachedThreads).toEqual([]);
    });
    
    it('should overwrite existing threads when caching new ones', async () => {
      const initialThreads = [{ id: '1', name: 'Initial Thread' }];
      const newThreads = [{ id: '2', name: 'New Thread' }];
      
      await cacheThreads(initialThreads);
      await cacheThreads(newThreads);
      
      const cachedThreads = await getCachedThreads();
      expect(cachedThreads).toHaveLength(1);
      expect(cachedThreads[0].name).toBe('New Thread');
    });
  });

  describe('cacheTasks and getCachedTasks', () => {
    it('should cache and retrieve tasks correctly', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'done' }
      ];
      
      await cacheTasks(mockTasks);
      const cachedTasks = await getCachedTasks();
      
      expect(cachedTasks).toHaveLength(2);
      expect(cachedTasks[0]).toEqual(expect.objectContaining({ id: '1', title: 'Task 1' }));
      expect(cachedTasks[1]).toEqual(expect.objectContaining({ id: '2', title: 'Task 2' }));
    });
    
    it('should return empty array when no tasks are cached', async () => {
      const cachedTasks = await getCachedTasks();
      expect(cachedTasks).toEqual([]);
    });
  });

  describe('cacheGoals and getCachedGoals', () => {
    it('should cache and retrieve goals correctly', async () => {
      const mockGoals = [
        { id: '1', title: 'Goal 1', progress: 50 },
        { id: '2', title: 'Goal 2', progress: 80 }
      ];
      
      await cacheGoals(mockGoals);
      const cachedGoals = await getCachedGoals();
      
      expect(cachedGoals).toHaveLength(2);
      expect(cachedGoals[0]).toEqual(expect.objectContaining({ id: '1', title: 'Goal 1', progress: 50 }));
      expect(cachedGoals[1]).toEqual(expect.objectContaining({ id: '2', title: 'Goal 2', progress: 80 }));
    });
    
    it('should return empty array when no goals are cached', async () => {
      const cachedGoals = await getCachedGoals();
      expect(cachedGoals).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', async () => {
      // Cache some data
      await cacheThreads([{ id: '1', name: 'Thread 1' }]);
      await cacheTasks([{ id: '1', title: 'Task 1' }]);
      await cacheGoals([{ id: '1', title: 'Goal 1' }]);
      
      // Verify data is cached
      let threads = await getCachedThreads();
      let tasks = await getCachedTasks();
      let goals = await getCachedGoals();
      
      expect(threads).toHaveLength(1);
      expect(tasks).toHaveLength(1);
      expect(goals).toHaveLength(1);
      
      // Clear cache
      await clearCache();
      
      // Verify data is cleared
      threads = await getCachedThreads();
      tasks = await getCachedTasks();
      goals = await getCachedGoals();
      
      expect(threads).toHaveLength(0);
      expect(tasks).toHaveLength(0);
      expect(goals).toHaveLength(0);
    });
  });
});