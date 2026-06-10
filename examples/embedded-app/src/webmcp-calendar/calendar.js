const STORAGE_KEY = 'webmcp-calendar-events-v1';
const TOOL_OWNER = '__webmcpCalendarToolAbortController';
const DAY_MS = 24 * 60 * 60 * 1000;

const USERS = [
  {
    id: '3bfbf608-53d6-4f33-8c94-46f902f6fd7f',
    name: 'Alex Rivera',
    role: 'Engineering Lead',
    avatar: 'AR',
  },
  {
    id: '8de44ce3-74df-49a1-b9c0-7a52a51f86a2',
    name: 'Maya Chen',
    role: 'Product Manager',
    avatar: 'MC',
  },
  {
    id: 'dfe3a3f1-14f7-4778-b646-05c602b03366',
    name: 'Jordan Lee',
    role: 'Design Partner',
    avatar: 'JL',
  },
];

const EVENT_COLORS = {
  blue: '#2563eb',
  green: '#16a34a',
  purple: '#7c3aed',
  amber: '#d97706',
  rose: '#e11d48',
};

const READ_ONLY_TOOL_NAMES = new Set([
  'get_page_title',
  'get_calendar_state',
  'get_events',
  'get_users',
  'get_event_colors',
  'find_availability',
]);

const DEFAULT_ASSISTANT_PROMPT =
  'Create a Team Standup tomorrow at 10am, then verify it appears on the calendar.';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );

const pad = (value) => String(value).padStart(2, '0');

const toLocalInputValue = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toDateInputValue = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const formatDate = (date, options = {}) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: options.weekday ?? 'short',
    month: options.month ?? 'short',
    day: options.day ?? 'numeric',
    year: options.year,
  }).format(new Date(date));

const formatTime = (date) =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfWeek = (date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
};

const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

const parseDate = (value, label = 'date') => {
  if (!value) {
    throw new Error(`${label} is required`);
  }

  let normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = `${normalized}T12:00:00`;
  } else {
    // Date-times are wall-clock in the calendar's local timezone. Models often
    // append "Z" or a UTC offset to the literal time the user said ("8am" →
    // "08:00:00Z"), which would shift the event hours on the visible calendar.
    // Strip any offset so the stated clock time always lands where it reads.
    normalized = normalized.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '');
  }
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date or ISO date-time string`);
  }

  return date;
};

const userById = (id) => USERS.find((user) => user.id === id) ?? USERS[0];
const colorValue = (color) => EVENT_COLORS[color] ?? EVENT_COLORS.blue;

const createInitialEvents = () => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const twoDays = addDays(today, 2);

  return [
    {
      id: 'evt-product-review',
      title: 'Product review',
      description: 'Walk through this week’s launch checklist.',
      startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30).toISOString(),
      endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 15).toISOString(),
      userId: USERS[1].id,
      color: 'purple',
      location: 'Room 2A',
      createdBy: 'seed',
    },
    {
      id: 'evt-design-sync',
      title: 'Design sync',
      description: 'Review high-fidelity calendar flows.',
      startDate: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 14, 0).toISOString(),
      endDate: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 15, 0).toISOString(),
      userId: USERS[2].id,
      color: 'green',
      location: 'Figma',
      createdBy: 'seed',
    },
    {
      id: 'evt-planning',
      title: 'Sprint planning',
      description: 'Prioritize agent-assisted scheduling improvements.',
      startDate: new Date(twoDays.getFullYear(), twoDays.getMonth(), twoDays.getDate(), 11, 0).toISOString(),
      endDate: new Date(twoDays.getFullYear(), twoDays.getMonth(), twoDays.getDate(), 12, 0).toISOString(),
      userId: USERS[0].id,
      color: 'blue',
      location: 'Zoom',
      createdBy: 'seed',
    },
  ];
};

const loadEvents = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialEvents();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : createInitialEvents();
  } catch {
    return createInitialEvents();
  }
};

const state = {
  selectedDate: startOfDay(new Date()),
  events: loadEvents(),
};

const persistEvents = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
};

const publicEvent = (event) => {
  const user = userById(event.userId);
  return {
    ...event,
    // Expose local wall-clock times to tool callers; storage stays UTC ISO.
    startDate: toLocalInputValue(event.startDate),
    endDate: toLocalInputValue(event.endDate),
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    colorHex: colorValue(event.color),
  };
};

const eventsInRange = (start, end) =>
  state.events
    .filter((event) => {
      const eventStart = new Date(event.startDate);
      return eventStart >= start && eventStart < end;
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

const filterEvents = ({ month, userId, search } = {}) => {
  const normalizedSearch = String(search ?? '').trim().toLowerCase();
  return state.events
    .filter((event) => {
      if (month && monthKey(event.startDate) !== month) return false;
      if (userId && event.userId !== userId) return false;
      if (normalizedSearch) {
        const haystack = `${event.title} ${event.description} ${event.location}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
};

const summarizeEvent = (event) => {
  const user = userById(event.userId);
  return `${event.title} — ${formatDate(event.startDate, { weekday: 'short' })}, ${formatTime(event.startDate)}–${formatTime(event.endDate)} with ${user.name}`;
};

const getCalendarState = () => {
  const weekStart = startOfWeek(state.selectedDate);
  const weekEnd = addDays(weekStart, 7);
  const weekEvents = eventsInRange(weekStart, weekEnd).map(publicEvent);

  return {
    today: toDateInputValue(new Date()),
    now: toLocalInputValue(new Date()),
    selectedDate: toDateInputValue(state.selectedDate),
    visibleWeek: {
      startDate: toDateInputValue(weekStart),
      endDateExclusive: toDateInputValue(weekEnd),
      label: `${formatDate(weekStart, { year: 'numeric' })} – ${formatDate(addDays(weekEnd, -1), { year: 'numeric' })}`,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    eventCount: state.events.length,
    visibleEvents: weekEvents,
  };
};

const toolResult = (data, summary) => ({
  content: [
    {
      type: 'text',
      text: `${summary ? `${summary}\n\n` : ''}${JSON.stringify(data, null, 2)}`,
    },
  ],
  structuredContent: data,
});

const getModelContext = () => document.modelContext ?? navigator.modelContext;

const createEvent = (input = {}) => {
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('title is required');

  const start = parseDate(input.startDate, 'startDate');
  const end = parseDate(input.endDate, 'endDate');
  if (end <= start) throw new Error('endDate must be after startDate');

  const user = input.userId ? userById(input.userId) : USERS[0];
  const color = EVENT_COLORS[input.color] ? input.color : 'blue';
  const id = `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const event = {
    id,
    title,
    description: String(input.description ?? ''),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    userId: user.id,
    color,
    location: String(input.location ?? ''),
    createdBy: 'persona-webmcp',
    createdAt: new Date().toISOString(),
  };

  state.events.push(event);
  state.selectedDate = startOfDay(start);
  persistEvents();
  renderCalendar();
  flashEvent(event.id);
  return event;
};

const updateEvent = (input = {}) => {
  const eventId = String(input.eventId ?? '').trim();
  const event = state.events.find((item) => item.id === eventId);
  if (!event) throw new Error(`No event found with eventId "${eventId}"`);

  if (input.title !== undefined) event.title = String(input.title).trim() || event.title;
  if (input.description !== undefined) event.description = String(input.description);
  if (input.location !== undefined) event.location = String(input.location);
  if (input.userId !== undefined) event.userId = userById(input.userId).id;
  if (input.color !== undefined && EVENT_COLORS[input.color]) event.color = input.color;

  if (input.startDate !== undefined) event.startDate = parseDate(input.startDate, 'startDate').toISOString();
  if (input.endDate !== undefined) event.endDate = parseDate(input.endDate, 'endDate').toISOString();
  if (new Date(event.endDate) <= new Date(event.startDate)) {
    throw new Error('endDate must be after startDate');
  }

  state.selectedDate = startOfDay(event.startDate);
  persistEvents();
  renderCalendar();
  flashEvent(event.id);
  return event;
};

const deleteEvent = (eventId) => {
  const index = state.events.findIndex((item) => item.id === eventId);
  if (index === -1) throw new Error(`No event found with eventId "${eventId}"`);
  const [removed] = state.events.splice(index, 1);
  persistEvents();
  renderCalendar();
  return removed;
};

const findAvailability = ({ date, durationMinutes = 30, userId } = {}) => {
  const day = startOfDay(parseDate(date ?? state.selectedDate, 'date'));
  const duration = Math.max(15, Math.min(240, Number(durationMinutes) || 30));
  const dayStart = new Date(day);
  dayStart.setHours(9, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(17, 0, 0, 0);

  const relevantEvents = state.events
    .filter((event) => sameDay(event.startDate, day) && (!userId || event.userId === userId))
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const slots = [];
  let cursor = new Date(dayStart);
  for (const event of relevantEvents) {
    const eventStart = new Date(event.startDate);
    const eventEnd = new Date(event.endDate);
    if (eventStart > cursor && eventStart - cursor >= duration * 60 * 1000) {
      slots.push({ startDate: toLocalInputValue(cursor), endDate: toLocalInputValue(eventStart) });
    }
    if (eventEnd > cursor) cursor = eventEnd;
  }
  if (dayEnd > cursor && dayEnd - cursor >= duration * 60 * 1000) {
    slots.push({ startDate: toLocalInputValue(cursor), endDate: toLocalInputValue(dayEnd) });
  }

  return {
    date: toDateInputValue(day),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    durationMinutes: duration,
    userId: userId ?? null,
    slots,
  };
};

const registerTool = (modelContext, tool, signal) => {
  try {
    // The WebMCP spec carries the display title on the descriptor itself, but
    // the current @mcp-b SDK only surfaces annotations.title to consumers
    // (Persona approval bubbles, Chrome DevTools MCP) — mirror it there.
    const descriptor = tool.title
      ? { ...tool, annotations: { title: tool.title, ...tool.annotations } }
      : tool;
    modelContext.registerTool(descriptor, { signal });
  } catch (error) {
    console.warn(`[Calendar] Failed to register ${tool.name}`, error);
  }
};

const registerCalendarTools = () => {
  const modelContext = getModelContext();
  if (!modelContext?.registerTool) {
    setToolStatus('WebMCP unavailable — no modelContext found on this page.', 'error');
    return;
  }

  window[TOOL_OWNER]?.abort?.();
  const controller = new AbortController();
  window[TOOL_OWNER] = controller;

  registerTool(
    modelContext,
    {
      name: 'get_page_title',
      title: 'Get page title',
      description: 'Get the current page title for this calendar example.',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        return toolResult({ title: document.title }, document.title);
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'get_calendar_state',
      title: 'Read calendar state',
      description:
        'Read the current calendar state: current local date-time, selected date, visible week, timezone, total event count, and visible events. Call this before creating or editing events. All event times are local wall-clock times in the calendar timezone.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        return toolResult(getCalendarState(), 'Calendar state loaded.');
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'get_events',
      title: 'List events',
      description:
        'List calendar events. Optionally filter by month in YYYY-MM format, userId, or a text search over title/description/location.',
      inputSchema: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'Optional month filter, e.g. 2026-06.' },
          userId: { type: 'string', description: 'Optional owner/attendee user ID.' },
          search: { type: 'string', description: 'Optional text search.' },
        },
      },
      annotations: { readOnlyHint: true },
      async execute(args) {
        const events = filterEvents(args).map(publicEvent);
        return toolResult({ count: events.length, events }, `Found ${events.length} event${events.length === 1 ? '' : 's'}.`);
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'get_users',
      title: 'List calendar users',
      description:
        'Return valid calendar users/owners. Use one of these user IDs when creating an event.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const text = USERS.map((user) => `${user.name} (${user.role}) — ID: ${user.id}`).join('\n');
        return toolResult({ users: USERS }, text);
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'get_event_colors',
      title: 'List event colors',
      description: 'Return the allowed event color names and their hex values.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        return toolResult(
          { colors: Object.entries(EVENT_COLORS).map(([name, hex]) => ({ name, hex })) },
          `Allowed colors: ${Object.keys(EVENT_COLORS).join(', ')}.`,
        );
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'find_availability',
      title: 'Find open time slots',
      description:
        'Find open slots on a date, optionally for a single user. Workday is 9am-5pm local time. Returned slot times are local wall-clock times in the calendar timezone.',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date to inspect, e.g. 2026-06-10.' },
          durationMinutes: { type: 'number', description: 'Desired meeting duration in minutes.' },
          userId: { type: 'string', description: 'Optional user ID to check.' },
        },
      },
      annotations: { readOnlyHint: true },
      async execute(args) {
        const availability = findAvailability(args);
        return toolResult(
          availability,
          `Found ${availability.slots.length} open slot${availability.slots.length === 1 ? '' : 's'} on ${availability.date}.`,
        );
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'select_date',
      title: 'Jump to date',
      description: 'Move the calendar UI to a specific date without creating an event.',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date to select, e.g. 2026-06-10.' },
        },
        required: ['date'],
      },
      annotations: { readOnlyHint: false },
      async execute(args) {
        state.selectedDate = startOfDay(parseDate(args.date, 'date'));
        renderCalendar();
        return toolResult(getCalendarState(), `Selected ${toDateInputValue(state.selectedDate)}.`);
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'create_event',
      title: 'Create event',
      description:
        'Create a calendar event and render it on the page. startDate/endDate are LOCAL wall-clock times in the calendar timezone, formatted YYYY-MM-DDTHH:mm — never append "Z" or a UTC offset (any offset is ignored and the stated clock time is used as-is). Use a userId from get_users and a color from get_event_colors.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title.' },
          description: { type: 'string', description: 'Optional event notes.' },
          startDate: { type: 'string', description: 'Event start as local wall-clock time, e.g. 2026-06-11T08:00. No "Z" or UTC offset.' },
          endDate: { type: 'string', description: 'Event end as local wall-clock time, e.g. 2026-06-11T09:00. No "Z" or UTC offset.' },
          userId: { type: 'string', description: 'Owner/attendee user ID from get_users.' },
          color: { type: 'string', description: 'Color name from get_event_colors.' },
          location: { type: 'string', description: 'Optional location or video link.' },
        },
        required: ['title', 'startDate', 'endDate'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      async execute(args) {
        const event = createEvent(args);
        return toolResult({ event: publicEvent(event), calendarState: getCalendarState() }, `Created ${summarizeEvent(event)}.`);
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'update_event',
      title: 'Update event',
      description:
        'Update an existing event by eventId. Only supplied fields are changed. startDate/endDate are LOCAL wall-clock times (YYYY-MM-DDTHH:mm, no "Z" or UTC offset).',
      inputSchema: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          startDate: { type: 'string', description: 'Local wall-clock time, e.g. 2026-06-11T08:00. No "Z" or UTC offset.' },
          endDate: { type: 'string', description: 'Local wall-clock time, e.g. 2026-06-11T09:00. No "Z" or UTC offset.' },
          userId: { type: 'string' },
          color: { type: 'string' },
          location: { type: 'string' },
        },
        required: ['eventId'],
      },
      annotations: { readOnlyHint: false },
      async execute(args) {
        const event = updateEvent(args);
        return toolResult({ event: publicEvent(event), calendarState: getCalendarState() }, `Updated ${summarizeEvent(event)}.`);
      },
    },
    controller.signal,
  );

  registerTool(
    modelContext,
    {
      name: 'delete_event',
      title: 'Delete event',
      description: 'Delete an event from the calendar by eventId.',
      inputSchema: {
        type: 'object',
        properties: { eventId: { type: 'string' } },
        required: ['eventId'],
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
      async execute(args) {
        const removed = deleteEvent(String(args.eventId ?? ''));
        return toolResult({ removed: publicEvent(removed), calendarState: getCalendarState() }, `Deleted ${removed.title}.`);
      },
    },
    controller.signal,
  );

  setToolStatus('10 WebMCP tools registered for Chrome DevTools MCP and Persona.', 'ready');
};

const setToolStatus = (message, tone = 'ready') => {
  const el = document.querySelector('[data-tool-status]');
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
};

const renderUserOptions = () =>
  USERS.map((user) => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('');

const renderColorOptions = () =>
  Object.keys(EVENT_COLORS)
    .map((color) => `<option value="${esc(color)}">${esc(color)}</option>`)
    .join('');

const renderShell = (root) => {
  const defaultStart = new Date(state.selectedDate);
  defaultStart.setHours(10, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(11, 0, 0, 0);

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand-lockup">
          <span class="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="3" />
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <path d="M3 10h18" />
              <path d="m9 15 2 2 4-5" />
            </svg>
          </span>
          <strong>Calendar</strong>
        </div>
        <button
          id="assistant-toggle"
          class="assistant-toggle"
          type="button"
          aria-expanded="false"
          aria-label="Open Calendar Copilot"
          title="Open Calendar Copilot"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
          </svg>
        </button>
      </header>

      <div id="workspace-dock-target" class="workspace-dock-target">
        <div class="workspace-canvas">
          <form class="prompt-bar" data-persona-prompt-form autocomplete="off">
            <span class="prompt-bar-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            </span>
            <input
              id="persona-prompt-input"
              data-persona-prompt-input
              type="text"
              placeholder="Ask your calendar copilot…"
              aria-label="Ask Calendar Copilot"
            />
            <button class="prompt-bar-submit" type="submit" data-persona-prompt-submit>Ask</button>
            <span class="prompt-bar-note" data-persona-prompt-note></span>
          </form>

          <main class="workspace">
            <section class="calendar-panel" aria-label="Calendar">
              <div class="calendar-toolbar">
                <h2 data-week-label></h2>
                <div class="calendar-actions">
                  <button type="button" data-prev-week aria-label="Previous week">←</button>
                  <button type="button" data-today>Today</button>
                  <button type="button" data-next-week aria-label="Next week">→</button>
                </div>
              </div>
              <div class="calendar-grid" data-calendar-grid></div>
            </section>

            <aside class="side-panel">
              <section class="mini-card quick-add-card">
                <div class="card-heading">
                  <span>Quick add</span>
                </div>
                <form data-event-form class="event-form">
                  <label>
                    Title
                    <input name="title" required placeholder="Team Standup" value="Team Standup" />
                  </label>
                  <label>
                    Start
                    <input name="startDate" type="datetime-local" required value="${esc(toLocalInputValue(defaultStart))}" />
                  </label>
                  <label>
                    End
                    <input name="endDate" type="datetime-local" required value="${esc(toLocalInputValue(defaultEnd))}" />
                  </label>
                  <label>
                    Owner
                    <select name="userId">${renderUserOptions()}</select>
                  </label>
                  <label>
                    Color
                    <select name="color">${renderColorOptions()}</select>
                  </label>
                  <label>
                    Location
                    <input name="location" placeholder="Zoom" />
                  </label>
                  <button type="submit" class="primary-action full-width">Add event</button>
                </form>
              </section>

              <section class="mini-card">
                <div class="card-heading">
                  <span>Events</span>
                  <span class="card-kicker" data-event-count></span>
                </div>
                <div class="event-list" data-event-list></div>
              </section>
            </aside>
          </main>

          <footer class="tool-status" role="status" aria-live="polite">
            <span data-tool-status data-tone="pending">Registering WebMCP tools…</span>
          </footer>
        </div>
      </div>
    </div>
  `;
};

const renderCalendar = () => {
  const grid = document.querySelector('[data-calendar-grid]');
  const label = document.querySelector('[data-week-label]');
  const list = document.querySelector('[data-event-list]');
  const count = document.querySelector('[data-event-count]');
  if (!grid || !label || !list || !count) return;

  const weekStart = startOfWeek(state.selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekEnd = addDays(weekStart, 7);
  const visibleEvents = eventsInRange(weekStart, weekEnd);

  label.textContent = `${formatDate(weekStart, { year: 'numeric' })} – ${formatDate(addDays(weekEnd, -1), { year: 'numeric' })}`;
  count.textContent = `${visibleEvents.length} this week`;

  grid.innerHTML = days
    .map((day) => {
      const dayEvents = visibleEvents.filter((event) => sameDay(event.startDate, day));
      const isSelected = sameDay(day, state.selectedDate);
      const isToday = sameDay(day, new Date());
      return `
        <article class="day-column ${isSelected ? 'is-selected' : ''}" data-day="${esc(toDateInputValue(day))}">
          <button class="day-header" type="button" data-select-day="${esc(toDateInputValue(day))}">
            <span>${esc(formatDate(day, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>
            ${isToday ? '<strong>Today</strong>' : ''}
          </button>
          <div class="day-events">
            ${
              dayEvents.length
                ? dayEvents.map(renderEventCard).join('')
                : '<p class="empty-day">No events</p>'
            }
          </div>
        </article>`;
    })
    .join('');

  list.innerHTML = visibleEvents.length
    ? visibleEvents.map(renderEventListItem).join('')
    : '<p class="empty-list">No events this week. Ask Persona to add one.</p>';
};

const renderEventCard = (event) => {
  const user = userById(event.userId);
  return `
    <article class="event-card" data-event-id="${esc(event.id)}" style="--event-color:${esc(colorValue(event.color))}">
      <span class="event-time">${esc(formatTime(event.startDate))} – ${esc(formatTime(event.endDate))}</span>
      <strong>${esc(event.title)}</strong>
      <span>${esc(user.name)}${event.location ? ` · ${esc(event.location)}` : ''}</span>
    </article>`;
};

const renderEventListItem = (event) => {
  const user = userById(event.userId);
  return `
    <article class="event-list-item" data-event-id="${esc(event.id)}">
      <span class="event-dot" style="background:${esc(colorValue(event.color))}"></span>
      <div>
        <strong>${esc(event.title)}</strong>
        <p>${esc(formatDate(event.startDate, { weekday: 'short' }))}, ${esc(formatTime(event.startDate))} · ${esc(user.name)}</p>
        <code>${esc(event.id)}</code>
      </div>
    </article>`;
};

const flashEvent = (eventId) => {
  requestAnimationFrame(() => {
    document.querySelectorAll(`[data-event-id="${CSS.escape(eventId)}"]`).forEach((node) => {
      node.classList.remove('just-created');
      void node.offsetWidth;
      node.classList.add('just-created');
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
};

const setupInteractions = () => {
  const personaPromptInput = document.querySelector('[data-persona-prompt-input]');
  const personaPromptForm = document.querySelector('[data-persona-prompt-form]');

  const submitPersonaPrompt = (prompt) => {
    const cleanedPrompt = String(prompt || DEFAULT_ASSISTANT_PROMPT).trim();
    if (personaPromptInput) {
      personaPromptInput.value = '';
    }
    window.dispatchEvent(new CustomEvent('calendar:submit-prompt', { detail: { prompt: cleanedPrompt } }));
    setToolStatus('Submitting prompt to Calendar Copilot…', 'ready');
  };

  personaPromptForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitPersonaPrompt(personaPromptInput?.value);
  });

  document.querySelector('[data-prev-week]')?.addEventListener('click', () => {
    state.selectedDate = addDays(state.selectedDate, -7);
    renderCalendar();
  });

  document.querySelector('[data-next-week]')?.addEventListener('click', () => {
    state.selectedDate = addDays(state.selectedDate, 7);
    renderCalendar();
  });

  document.querySelector('[data-today]')?.addEventListener('click', () => {
    state.selectedDate = startOfDay(new Date());
    renderCalendar();
  });

  document.querySelector('[data-calendar-grid]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-day]');
    if (!button) return;
    state.selectedDate = startOfDay(parseDate(button.dataset.selectDay, 'date'));
    renderCalendar();
  });

  document.querySelector('[data-event-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const created = createEvent(data);
      setToolStatus(`Created ${created.title}.`, 'ready');
    } catch (error) {
      setToolStatus(error instanceof Error ? error.message : String(error), 'error');
    }
  });
};

export function setupCalendar(root) {
  renderShell(root);
  renderCalendar();
  setupInteractions();
  registerCalendarTools();

  window.calendarExample = {
    state,
    users: USERS,
    eventColors: EVENT_COLORS,
    getCalendarState,
    createEvent,
    updateEvent,
    deleteEvent,
    findAvailability,
  };
}

export { READ_ONLY_TOOL_NAMES };
