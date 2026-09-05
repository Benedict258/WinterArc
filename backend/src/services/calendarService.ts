import { google, calendar_v3 } from 'googleapis';
import { CalendarSync } from '../models/CalendarSync';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback';

/**
 * Get Google OAuth2 client with stored credentials
 */
function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Google Calendar credentials not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  return oauth2Client;
}

/**
 * Generate authentication URL for Google Calendar
 */
export async function getAuthUrl(): Promise<string> {
  const oauth2Client = getOAuthClient();
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  
  return authUrl;
}

/**
 * Handle OAuth callback and store tokens
 */
export async function handleCallback(code: string): Promise<calendar_v3.Schema$CalendarList> {
  const oauth2Client = getOAuthClient();
  
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  
  // Save or update tokens in database
  const calendarSync = await CalendarSync.findOne();
  if (calendarSync) {
    calendarSync.accessToken = tokens.access_token;
    calendarSync.refreshToken = tokens.refresh_token;
    calendarSync.expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
    await calendarSync.save();
  } else {
    await CalendarSync.create({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
    });
  }
  
  // Get calendar list to verify connection
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.calendarList.list();
  return res.data;
}

/**
 * Get authenticated Google Calendar client
 */
export async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const oauth2Client = getOAuthClient();
  const calendarSync = await CalendarSync.findOne();
  
  if (!calendarSync || !calendarSync.accessToken) {
    throw new Error('Google Calendar not connected');
  }
  
  oauth2Client.setCredentials({
    access_token: calendarSync.accessToken,
    refresh_token: calendarSync.refreshToken,
    expiry_date: calendarSync.expiresAt ? calendarSync.expiresAt.getTime() : undefined
  });
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Push a task to Google Calendar (create or update)
 */
export async function pushTask(task: any): Promise<string> {
  const calendar = await getCalendarClient();
  
  const event: calendar_v3.Schema$Event = {
    summary: task.title,
    description: task.threadId ? `Thread ID: ${task.threadId}` : undefined,
    start: {
      dateTime: new Date(task.date).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    end: {
      dateTime: new Date(new Date(task.date).getTime() + 60 * 60 * 1000).toISOString(), // 1 hour duration
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    // Add source property to allow syncing back
    extendedProperties: {
      private: {
        workspaceTaskId: task._id.toString(),
        source: 'workspace'
      }
    }
  };
  
  if (task.calendarEventId) {
    // Update existing event
    const res = await calendar.events.update({
      calendarId: 'primary',
      eventId: task.calendarEventId,
      requestBody: event
    });
    return res.data.id;
  } else {
    // Create new event
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });
    return res.data.id;
  }
}

/**
 * Pull events from Google Calendar for a given date
 */
export async function pullEvents(date: Date): Promise<calendar_v3.Schema$Event[]> {
  const calendar = await getCalendarClient();
  
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });
  
  return res.data.items || [];
}

/**
 * Sync tasks to Google Calendar (push new/updated tasks)
 * This would be called periodically or on task change
 */
export async function syncTasksToCalendar(): Promise<void> {
  // Implementation would depend on how we track changes
  // For now, we can leave as placeholder or implement later
  console.log('Sync tasks to calendar not fully implemented');
}

/**
 * Sync Google Calendar events to workspace (import as tasks)
 * This would be called manually or periodically
 */
export async function syncCalendarToWorkspace(): Promise<void> {
  // Implementation would involve fetching events and creating tasks
  // For now, placeholder
  console.log('Sync calendar to workspace not fully implemented');
}