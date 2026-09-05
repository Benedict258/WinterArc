import { getAuthUrl, handleCallback, getCalendarClient, pushTask, pullEvents, syncTasksToCalendar, syncCalendarToWorkspace } from './calendarService'
import { CalendarSync } from '../models/CalendarSync'

// Mock the dependencies
jest.mock('googleapis')
jest.mock('../models/CalendarSync')

describe('calendarService', () => {
  const mockClientId = 'test-client-id'
  const mockClientSecret = 'test-client-secret'
  const mockRedirectUri = 'http://localhost:3000/api/calendar/callback'
  
  beforeEach(() => {
    // Reset environment variables
    process.env.GOOGLE_CLIENT_ID = mockClientId
    process.env.GOOGLE_CLIENT_SECRET = mockClientSecret
    process.env.GOOGLE_REDIRECT_URI = mockRedirectUri
    
    // Clear all mocks
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.resetModules() // Reset the module cache to pick up new env vars
  })

  describe('getOAuthClient (internal function)', () => {
    it('should throw error if credentials are missing', () => {
      // Remove environment variables
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
      
      // We need to reset the module to pick up the new env vars
      jest.resetModules()
      
      // Re-import the function
      const { getOAuthClient } = require('./calendarService')
      
      expect(() => getOAuthClient()).toThrow('Google Calendar credentials not configured')
    })
    
    it('should create OAuth2 client with correct parameters', () => {
      // We need to reset the module to pick up the env vars
      jest.resetModules()
      
      // Re-import the function
      const { getOAuthClient } = require('./calendarService')
      
      const oauth2Client = getOAuthClient()
      
      expect(oauth2Client).toBeDefined()
      // Note: We can't easily test the internal state of the OAuth2 client
      // without exposing it, but we can verify it doesn't throw
    })
  })

  describe('getAuthUrl', () => {
it('should generate a valid auth URL', async () => {
    // Mock the google.auth.OAuth2 instance and its generateAuthUrl method
    const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?params');
    
    // Get the mocked googleapis module
    const mockGoogle = require('googleapis');
    
    // Set up the mock implementation
    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl
    };
    mockGoogle.auth.OAuth2.mockReturnValue(mockOAuth2Client);
    
    const authUrl = await getAuthUrl();
    
    expect(authUrl).toBe('different-url');
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      prompt: 'consent'
    });  // This closes the expect() call
  });    // This closes the it() block
  // Reset modules is handled in afterEach
  })

  describe('handleCallback', () => {
    it('should handle OAuth callback and store tokens', async () => {
      // Mock data
      const mockCode = 'test-auth-code'
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000 // 1 hour from now
      }
      
      const mockCalendarSyncInstance = {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        save: jest.fn()
      }
      
      const mockCalendarList = {
        items: [{ id: 'calendar1', summary: 'Test Calendar' }]
      }
      
      // Mock googleapis
      const mockOAuth2Client = {
        getToken: jest.fn().mockResolvedValue({ tokens: mockTokens }),
        setCredentials: jest.fn()
      }
      
      const mockCalendar = {
        calendarList: {
          list: jest.fn().mockResolvedValue({ data: mockCalendarList })
        }
      }
      
      const mockGoogle = {
        auth: {
          OAuth2: jest.fn().mockReturnValue(mockOAuth2Client)
        },
        calendar: jest.fn().mockReturnValue(mockCalendar)
      }
      
      // Mock CalendarSync model
      ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(mockCalendarSyncInstance)
      ;(CalendarSync.create as jest.Mock).mockResolvedValue(mockCalendarSyncInstance)
      
      // Get the mocked googleapis module
      const mockGoogle = require('googleapis');
      
      // Set up the mock implementation
      const mockOAuth2Client = {
        getToken: jest.fn().mockResolvedValue({ tokens: mockTokens }),
        setCredentials: jest.fn()
      };
      const mockCalendar = {
        calendarList: {
          list: jest.fn().mockResolvedValue({ data: mockCalendarList })
        }
      };
      mockGoogle.auth.OAuth2.mockReturnValue(mockOAuth2Client);
      mockGoogle.calendar.mockReturnValue(mockCalendar);
      
try {
         const result = await handleCallback(mockCode)
         
         // Assertions
         expect(mockOAuth2Client.getToken).toHaveBeenCalledWith(mockCode);
         expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockTokens);
         expect(CalendarSync.findOne).toHaveBeenCalled();
         expect(mockCalendarSyncInstance.accessToken).toBe(mockTokens.access_token);
         expect(mockCalendarSyncInstance.refreshToken).toBe(mockTokens.refresh_token);
         expect(mockCalendarSyncInstance.save).toHaveBeenCalled();
         expect(mockCalendar.calendarList.list).toHaveBeenCalled();
         expect(result).toEqual(mockCalendarList);
       } catch (error) {
         throw error;
       }

  it('should create new CalendarSync if none exists', async () => {
      // Mock data
      const mockCode = 'test-auth-code'
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000
      }
      
      const mockCalendarSyncInstance = {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        save: jest.fn()
      }
      
      const mockCalendarList = {
        items: []
      }
      
      // Mock googleapis
      const mockOAuth2Client = {
        getToken: jest.fn().mockResolvedValue({ tokens: mockTokens }),
        setCredentials: jest.fn()
      }
      
const mockCalendar = {
        calendarList: {
          list: jest.fn().mockResolvedValue({ data: mockCalendarList })
        }
      };
      
      // Mock CalendarSync model - return null for findOne (no existing record)
      ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(null)
      ;(CalendarSync.create as jest.Mock).mockResolvedValue(mockCalendarSyncInstance)
      
      // Get the mocked googleapis module
      const mockGoogle = require('googleapis');
      
      // Set up the mock implementation
      mockGoogle.auth.OAuth2.mockReturnValue(mockOAuth2Client);
      mockGoogle.calendar.mockReturnValue(mockCalendar);
      
try {
         const result = await handleCallback(mockCode)
         
         // Assertions
         expect(CalendarSync.findOne).toHaveBeenCalled();
         expect(CalendarSync.create).toHaveBeenCalledWith({
           accessToken: mockTokens.access_token,
           refreshToken: mockTokens.refresh_token,
         });
} catch (error) {
          throw error;
        }
      })

    })

    describe('getCalendarClient', () => {
    it('should throw error if calendar not connected', async () => {
      // Mock CalendarSync.findOne to return null (not connected)
      ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(null)
      
      await expect(getCalendarClient()).rejects.toThrow('Google Calendar not connected')
    })
    
    it('should return authenticated calendar client when connected', async () => {
      // Mock data
      const mockCalendarSync = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      }
      
      // Mock CalendarSync.findOne
      ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(mockCalendarSync)
      
// Mock googleapis
       const mockOAuth2Client = {
         setCredentials: jest.fn()
       };
       
       const mockCalendar = {
         // Add any properties or methods needed for the test
       };
      
// Get the mocked googleapis module
       const mockGoogle = require('googleapis');
       
       // Set up the mock implementation
       mockGoogle.auth.OAuth2.mockReturnValue({
         setCredentials: jest.fn()
       });
       mockGoogle.calendar.mockReturnValue({
         // Add calendar methods as needed
       });
       
// Store original googleapis module for restoration
        const originalGoogle = jest.requireActual('googleapis');
        
        // Temporarily replace the googleapis module
        jest.mock('googleapis', () => mockGoogle);
        
        try {
         const client = await getCalendarClient()
         
         // Assertions
         expect(CalendarSync.findOne).toHaveBeenCalled();
         expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
           access_token: mockCalendarSync.accessToken,
           refresh_token: mockCalendarSync.refreshToken,
           expiry_date: mockCalendarSync.expiresAt.getTime()
         });
         expect(client).toBe(mockCalendar);
       } finally {
// Restore the original module
        jest.mock('googleapis', () => originalGoogle);
       }
    })  // This was the lonely brace from a removed try block
  })

  describe('pushTask', () => {
    it('should create a new calendar event when task.calendarEventId is null', async () => {
      // Mock data
      const mockTask = {
        _id: 'task1',
        title: 'Test Task',
        threadId: 'thread1',
        date: new Date(2024, 0, 1, 10, 0, 0), // Jan 1, 2024 10:00:00
        calendarEventId: null
      }
      
      const mockCalendarSync = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      }
      
      // Mock googleapis
      const mockOAuth2Client = {
        setCredentials: jest.fn()
      }
      
      const mockCalendarEvent = {
        id: 'event123',
        summary: 'Test Task',
        description: 'Thread ID: thread1',
        start: { dateTime: '2024-01-01T10:00:00.000Z' },
        end: { dateTime: '2024-01-01T11:00:00.000Z' }
      }
      
const mockCalendar = {
         events: {
           insert: jest.fn().mockResolvedValue({ data: mockCalendarEvent })
         }
       }
       
       const mockGoogle = {
         auth: {
           OAuth2: jest.fn().mockReturnValue(mockOAuth2Client)
         },
         calendar: jest.fn().mockReturnValue(mockCalendar)
       }
       
       // Mock CalendarSync.findOne
       ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(mockCalendarSync)
       
       // Temporarily replace the googleapis module
       const originalGoogle = jest.requireActual('googleapis');
       jest.mock('googleapis', () => mockGoogle);
      
      try {
        const eventId = await pushTask(mockTask)
        
        // Assertions
        expect(CalendarSync.findOne).toHaveBeenCalled()
        expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
          access_token: mockCalendarSync.accessToken,
          refresh_token: mockCalendarSync.refreshToken,
          expiry_date: mockCalendarSync.expiresAt.getTime()
        })
        expect(mockCalendar.events.insert).toHaveBeenCalledWith({
          calendarId: 'primary',
          requestBody: expect.objectContaining({
            summary: 'Test Task',
            description: 'Thread ID: thread1',
            extendedProperties: {
              private: {
                workspaceTaskId: 'task1',
                source: 'workspace'
              }
            }
          })
        })
expect(eventId).toBe('event123')
       } finally {
         // Restore the original module
         jest.mock('googleapis', () => originalGoogle);
       }
    })
    
    it('should update existing calendar event when task.calendarEventId is set', async () => {
      // Mock data
      const mockTask = {
        _id: 'task1',
        title: 'Updated Task',
        threadId: null,
        date: new Date(2024, 0, 1, 14, 0, 0), // Jan 1, 2024 14:00:00
        calendarEventId: 'existing-event-id'
      }
      
      const mockCalendarSync = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      }
      
      // Mock googleapis
      const mockOAuth2Client = {
        setCredentials: jest.fn()
      }
      
const mockCalendarEvent = {
         id: 'existing-event-id',
         summary: 'Updated Task',
         start: { dateTime: '2024-01-01T14:00:00.000Z' },
         end: { dateTime: '2024-01-01T15:00:00.000Z' }
       }
       
       const mockCalendar = {
         events: {
           update: jest.fn().mockResolvedValue({ data: mockCalendarEvent })
         }
       }
       
       const mockGoogle = {
         auth: {
           OAuth2: jest.fn().mockReturnValue(mockOAuth2Client)
         },
         calendar: jest.fn().mockReturnValue(mockCalendar)
       }
       
       // Mock CalendarSync.findOne
       ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(mockCalendarSync)
       
       // Temporarily replace the googleapis module
       const originalGoogle = jest.requireActual('googleapis');
       jest.mock('googleapis', () => mockGoogle);
      
      try {
        const eventId = await pushTask(mockTask)
        
        // Assertions
        expect(CalendarSync.findOne).toHaveBeenCalled()
        expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
          access_token: mockCalendarSync.accessToken,
          refresh_token: mockCalendarSync.refreshToken,
          expiry_date: mockCalendarSync.expiresAt.getTime()
        })
        expect(mockCalendar.events.update).toHaveBeenCalledWith({
          calendarId: 'primary',
          eventId: 'existing-event-id',
          requestBody: expect.objectContaining({
            summary: 'Updated Task',
            extendedProperties: {
              private: {
                workspaceTaskId: 'task1',
                source: 'workspace'
              }
            }
          })
        })
        expect(eventId).toBe('existing-event-id')
      } finally {
// Restore the original module
         jest.mock('googleapis', () => originalGoogle);
      }
    })
  })

  describe('pullEvents', () => {
    it('should pull events from Google Calendar for a given date', async () => {
      // Mock data
      const mockDate = new Date(2024, 0, 15) // Jan 15, 2024
      const mockStart = new Date(mockDate)
      mockStart.setHours(0, 0, 0, 0)
      const mockEnd = new Date(mockDate)
      mockEnd.setHours(23, 59, 59, 999)
      
      const mockCalendarSync = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      }
      
      // Mock googleapis
      const mockOAuth2Client = {
        setCredentials: jest.fn()
      }
      
const mockEvents = [
         {
           id: 'event1',
           summary: 'Test Event 1',
           start: { dateTime: '2024-01-15T09:00:00.000Z' },
           end: { dateTime: '2024-01-15T10:00:00.000Z' }
         },
         {
           id: 'event2',
           summary: 'Test Event 2',
           start: { dateTime: '2024-01-15T14:00:00.000Z' },
           end: { dateTime: '2024-01-15T16:00:00.000Z' }
         }
       ]
       
       const mockCalendar = {
         events: {
           list: jest.fn().mockResolvedValue({ data: { items: mockEvents } })
         }
       }
       
       const mockGoogle = {
         auth: {
           OAuth2: jest.fn().mockReturnValue(mockOAuth2Client)
         },
         calendar: jest.fn().mockReturnValue(mockCalendar)
       }
       
       // Mock CalendarSync.findOne
       ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(mockCalendarSync)
       
       // Temporarily replace the googleapis module
       const originalGoogle = jest.requireActual('googleapis');
       jest.mock('googleapis', () => mockGoogle);
      
      try {
        const events = await pullEvents(mockDate)
        
        // Assertions
        expect(CalendarSync.findOne).toHaveBeenCalled()
        expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
          access_token: mockCalendarSync.accessToken,
          refresh_token: mockCalendarSync.refreshToken,
          expiry_date: mockCalendarSync.expiresAt.getTime()
        })
        expect(mockCalendar.events.list).toHaveBeenCalledWith({
          calendarId: 'primary',
          timeMin: mockStart.toISOString(),
          timeMax: mockEnd.toISOString(),
          singleEvents: true,
          orderBy: 'startTime'
        })
expect(events).toEqual(mockEvents)
       } finally {
         // Restore the original module
         jest.mock('googleapis', () => originalGoogle);
       }
    })
    
    it('should return empty array when no events are found', async () => {
      // Mock data
      const mockDate = new Date(2024, 0, 15) // Jan 15, 2024
      
      const mockCalendarSync = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      }
      
      // Mock googleapis
      const mockOAuth2Client = {
        setCredentials: jest.fn()
      }
      
      const mockCalendar = {
        events: {
          list: jest.fn().mockResolvedValue({ data: { items: [] } })
        }
      }
      
      const mockGoogle = {
        auth: {
          OAuth2: jest.fn().mockReturnValue(mockOAuth2Client)
        },
calendar: jest.fn().mockReturnValue(mockCalendar)
       }
       
       // Mock CalendarSync.findOne
       ;(CalendarSync.findOne as jest.Mock).mockResolvedValue(mockCalendarSync)
       
       // Temporarily replace the googleapis module
       const originalGoogle = jest.requireActual('googleapis');
       jest.mock('googleapis', () => mockGoogle);
      
      try {
        const events = await pullEvents(mockDate)
        
        // Assertions
        expect(events).toEqual([])
expect(mockCalendar.events.list).toHaveBeenCalled()
       } finally {
         // Restore the original module
         jest.mock('googleapis', () => originalGoogle);
       }
    })
  })

  describe('syncTasksToCalendar', () => {
    it('should log placeholder message', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      await syncTasksToCalendar()
      
      expect(consoleSpy).toHaveBeenCalledWith('Sync tasks to calendar not fully implemented')
      
      consoleSpy.mockRestore()
    })
  })

  describe('syncCalendarToWorkspace', () => {
    it('should log placeholder message', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      await syncCalendarToWorkspace()
      
      expect(consoleSpy).toHaveBeenCalledWith('Sync calendar to workspace not fully implemented')
      
      consoleSpy.mockRestore()
    })
  })
})
