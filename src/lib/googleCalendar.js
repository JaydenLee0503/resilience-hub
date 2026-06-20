import { gmailClientId, loadGoogleIdentity } from './gmailClient';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export async function addDeadlineToGoogleCalendar(deadline) {
  if (!gmailClientId) {
    throw new Error('Add VITE_GOOGLE_CLIENT_ID to .env, restart the app, then try again.');
  }

  const accessToken = await requestCalendarToken();
  const { start, end } = parseDeadlineDate(deadline.date);
  const summary = deadline.task || 'Resilience Hub deadline';
  const description = [
    'Added from Resilience Hub.',
    deadline.consequence ? `If missed: ${deadline.consequence}` : '',
    deadline.date ? `Original extracted date: ${deadline.date}` : '',
  ].filter(Boolean).join('\n\n');

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary,
      description,
      start: { date: start },
      end: { date: end },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 24 * 60 },
          { method: 'email', minutes: 24 * 60 },
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Google Calendar request failed (${response.status}).`);
  }

  return response.json();
}

async function requestCalendarToken() {
  await loadGoogleIdentity();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: gmailClientId,
      scope: CALENDAR_SCOPE,
      prompt: 'consent',
      callback: (response) => {
        if (response?.error) reject(new Error(response.error_description || response.error));
        else resolve(response.access_token);
      },
    });
    client.requestAccessToken();
  });
}

function parseDeadlineDate(value) {
  const raw = String(value || '').trim();
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Google Calendar needs a specific date. I could not read "${raw}" as a calendar date.`);
  }

  const startDate = new Date(parsed);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 1);

  return {
    start: toDateOnly(startDate),
    end: toDateOnly(endDate),
  };
}

function toDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
