const STORAGE_KEY = "doable-tasks-v1";
const REMINDER_SETTINGS_KEY = "doable-reminder-settings-v1";
const REMINDER_LOG_KEY = "doable-reminder-log-v1";
const AUTH_TOKEN_KEY = "doable-auth-token";
const AUTH_USER_KEY = "doable-auth-user";

const dayOffset = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};

const defaultTasks = [
  { id: "task-1", title: "Review design handoff", description: "Check the latest mockups and confirm the handoff notes.", category: "Work", priority: "high", dueDate: isoDate(dayOffset(0)), dueTime: "10:00", done: false },
  { id: "task-2", title: "Reply to client emails", description: "Send follow-ups on the onboarding proposal.", category: "Work", priority: "medium", dueDate: isoDate(dayOffset(0)), dueTime: "12:30", done: true },
  { id: "task-3", title: "Prepare weekly report", description: "Summarize tasks, metrics, and blockers from the week.", category: "Work", priority: "medium", dueDate: isoDate(dayOffset(0)), dueTime: "15:00", done: false },
  { id: "task-4", title: "Gym session", description: "30-minute strength session after work.", category: "Health", priority: "low", dueDate: isoDate(dayOffset(0)), dueTime: "18:00", done: false },
  { id: "task-5", title: "Finish onboarding flow copy", description: "Tighten the welcome copy before sign-off.", category: "Work", priority: "high", dueDate: isoDate(dayOffset(1)), dueTime: "11:00", done: false },
  { id: "task-6", title: "Book dentist appointment", description: "Confirm a time with the dental clinic.", category: "Personal", priority: "low", dueDate: isoDate(dayOffset(2)), dueTime: "09:00", done: false },
  { id: "task-7", title: "Pay internet bill", description: "Settle the monthly internet payment online.", category: "Finance", priority: "high", dueDate: isoDate(dayOffset(3)), dueTime: "14:00", done: false },
  { id: "task-8", title: "Read two chapters of JS book", description: "Finish the chapter on closures and async patterns.", category: "Learning", priority: "medium", dueDate: isoDate(dayOffset(4)), dueTime: "20:00", done: false },
  { id: "task-9", title: "Plan sprint backlog", description: "Group the biggest wins and dependencies for the next sprint.", category: "Work", priority: "medium", dueDate: isoDate(dayOffset(6)), dueTime: "10:30", done: false },
  { id: "task-10", title: "Back up project files", description: "Upload updated assets to cloud storage.", category: "Work", priority: "low", dueDate: isoDate(dayOffset(-1)), dueTime: "17:00", done: true },
  { id: "task-11", title: "Send invoice to client", description: "Email the latest invoice and payment reference.", category: "Finance", priority: "high", dueDate: isoDate(dayOffset(-2)), dueTime: "16:00", done: true },
  { id: "task-12", title: "Grocery shopping", description: "Buy ingredients for the week.", category: "Personal", priority: "low", dueDate: isoDate(dayOffset(-3)), dueTime: "18:30", done: true },
  { id: "task-13", title: "Call mum", description: "Check in and catch up on family plans.", category: "Personal", priority: "low", dueDate: isoDate(dayOffset(8)), dueTime: "19:00", done: false },
  { id: "task-14", title: "Submit assignment", description: "Upload the final assignment before the deadline.", category: "Learning", priority: "high", dueDate: isoDate(dayOffset(10)), dueTime: "23:59", done: false },
];

const state = {
  view: "dashboard",
  filter: "all",
  query: "",
  dashboardTab: "today",
  calendarView: "day",
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: dayOffset(0),
  name: localStorage.getItem("doable-name") || "Benik",
};

let tasks = loadTasks();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const titles = { dashboard: "Dashboard", tasks: "My Tasks", calendar: "Calendar", assistant: "AI Assistant", settings: "Settings" };

function isoDate(date) {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
}

function loadTasks() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(cached) && cached.length) {
      return cached;
    }
  } catch (error) {
    console.warn("Failed to load tasks from localStorage.", error);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultTasks));
  return defaultTasks.map((task) => ({ ...task }));
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return;

  fetch("/api/tasks/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tasks: tasks.map((task) => ({ ...task })) }),
  }).catch((error) => {
    console.warn("Could not sync tasks to backend.", error);
  });
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }
  return payload;
}

function updateAuthStatus(message, isError = false) {
  const status = document.getElementById("authStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.classList.toggle("success", !isError);
}

async function syncLoggedInUserData() {
  if (!getAuthToken()) return;
  try {
    const payload = await apiFetch("/api/tasks");
    if (Array.isArray(payload.tasks)) {
      tasks = payload.tasks.map((task) => ({ ...task }));
      saveTasks();
      renderAll();
    }
  } catch (error) {
    console.warn("Backend sync failed.", error);
  }
}

async function registerOrLogin(mode) {
  const nameInput = document.getElementById("authName");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");

  const name = (nameInput?.value || "").trim();
  const email = (emailInput?.value || "").trim();
  const password = passwordInput?.value || "";

  if (!email || !password || (mode === "register" && !name)) {
    updateAuthStatus("Please fill in the required account fields.", true);
    return;
  }

  try {
    const payload = await apiFetch(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
    });

    setAuthToken(payload.token);
    setCurrentUser(payload.user);
    const userName = payload.user?.name || state.name || "there";
    state.name = userName;
    localStorage.setItem("doable-name", userName);
    document.getElementById("nameInput").value = userName;
    document.getElementById("sideName").textContent = userName;
    document.getElementById("avatar").textContent = userName.charAt(0).toUpperCase();
    updateAuthStatus(mode === "register" ? "Registration successful. Your data is now synced." : "Login successful. Your data is now synced.", false);
    await syncLoggedInUserData();
    renderAll();
  } catch (error) {
    updateAuthStatus(error.message || "Authentication failed.", true);
  }
}

function logoutUser() {
  setAuthToken("");
  setCurrentUser(null);
  updateAuthStatus("Signed out. Local data remains available on this device.", false);
  renderAll();
}

function getReminderSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDER_SETTINGS_KEY) || "{}");
    return {
      enabled: saved.enabled !== false,
      browserNotifications: saved.browserNotifications !== false,
      upcomingAlerts: saved.upcomingAlerts !== false,
      reminderLeadMinutes: Number(saved.reminderLeadMinutes) || 10,
      snoozeMinutes: Number(saved.snoozeMinutes) || 10,
    };
  } catch (error) {
    return {
      enabled: true,
      browserNotifications: true,
      upcomingAlerts: true,
      reminderLeadMinutes: 10,
      snoozeMinutes: 10,
    };
  }
}

function saveReminderSettings(nextSettings) {
  localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(nextSettings));
}

function getReminderLog() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDER_LOG_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function saveReminderLog(entries) {
  localStorage.setItem(REMINDER_LOG_KEY, JSON.stringify(entries.slice(-200)));
}

function getTaskReminderKey(task) {
  return `${task.id}|${task.dueDate || ""}|${task.dueTime || "00:00"}`;
}

function hasReminderBeenSent(task) {
  return getReminderLog().includes(getTaskReminderKey(task));
}

function markReminderSent(task) {
  const log = getReminderLog();
  const key = getTaskReminderKey(task);
  if (!log.includes(key)) {
    log.push(key);
    saveReminderLog(log);
  }
}

function dismissReminder(taskId) {
  const log = getReminderLog().filter((entry) => !entry.startsWith(`${taskId}|`));
  saveReminderLog(log);
  const toast = document.querySelector(`.notification-toast[data-task-id="${taskId}"]`);
  if (toast) toast.remove();
}

function getTaskDueDateObject(task) {
  if (!task.dueDate) return null;
  const value = new Date(`${task.dueDate}T${task.dueTime || "00:00"}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function showNotificationToast(task, reason = "Reminder") {
  if (!task || task.done) return;

  const stack = document.getElementById("notificationStack") || (() => {
    const element = document.createElement("div");
    element.id = "notificationStack";
    element.className = "notification-stack";
    document.body.appendChild(element);
    return element;
  })();

  const toast = document.createElement("div");
  toast.className = "notification-toast";
  toast.dataset.taskId = task.id;
  toast.innerHTML = `
    <strong>${escapeHtml(task.title)}</strong>
    <p>${escapeHtml(reason)} • ${escapeHtml(task.dueTime || "Any time")}</p>
    <div class="toast-actions">
      <button class="mini-btn primary" type="button" data-reminder-action="snooze" data-task-id="${task.id}" data-minutes="10">Snooze 10m</button>
      <button class="mini-btn" type="button" data-reminder-action="reschedule" data-task-id="${task.id}">Reschedule</button>
      <button class="mini-btn" type="button" data-reminder-action="dismiss" data-task-id="${task.id}">Dismiss</button>
    </div>
  `;

  stack.prepend(toast);
}

function triggerBrowserNotification(task) {
  if (!("Notification" in window)) return;
  const settings = getReminderSettings();
  if (!settings.enabled || !settings.browserNotifications || Notification.permission !== "granted") return;

  const notification = new Notification(`${task.title}`, {
    body: `Due ${task.dueTime || "today"} • ${task.category || "General"}`,
    tag: `doable-${task.id}`,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    openTaskModal(task.id);
  };
}

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    updateNotificationStatus();
    return true;
  }

  Notification.requestPermission().then((permission) => {
    updateNotificationStatus();
    if (permission === "granted") {
      checkForReminders();
    }
  });

  return Notification.permission === "granted";
}

function updateNotificationStatus() {
  const statusEl = document.getElementById("notificationStatusBadge");
  const permissionEl = document.getElementById("notificationPermissionStatus");
  const requestBtn = document.getElementById("requestNotificationPermissionBtn");

  if (!statusEl || !permissionEl || !requestBtn) return;

  const supports = "Notification" in window;
  const permission = supports ? Notification.permission : "unsupported";
  const settings = getReminderSettings();

  if (!supports) {
    statusEl.textContent = "Unsupported";
    statusEl.className = "status-badge blocked";
    permissionEl.textContent = "This browser does not support desktop notifications. In-app reminders still work.";
    requestBtn.disabled = true;
    return;
  }

  const enabled = settings.enabled && permission === "granted";
  requestBtn.disabled = permission === "granted";
  requestBtn.textContent = permission === "granted" ? "Enabled" : "Enable";

  if (permission === "granted") {
    statusEl.textContent = "Enabled";
    statusEl.className = "status-badge enabled";
    permissionEl.textContent = "Desktop notifications are allowed. The app can show alerts and quick actions.";
  } else if (permission === "denied") {
    statusEl.textContent = "Blocked";
    statusEl.className = "status-badge blocked";
    permissionEl.textContent = "Permission was blocked. Open browser site settings to allow notifications, or keep using in-app reminders.";
  } else {
    statusEl.textContent = "Ready";
    statusEl.className = "status-badge";
    permissionEl.textContent = "Browser notifications need your permission before desktop alerts can appear.";
  }

  if (!settings.enabled) {
    statusEl.textContent = "Off";
    statusEl.className = "status-badge blocked";
    permissionEl.textContent = "Reminders are turned off in Settings. Enable them to receive alerts.";
  }

  if (requestBtn.disabled && permission === "granted" && !settings.enabled) {
    requestBtn.disabled = false;
  }
}

function resolveReminderTask(taskId) {
  return tasks.find((task) => task.id === taskId) || null;
}

function snoozeTask(taskId, minutes = 10) {
  const task = resolveReminderTask(taskId);
  if (!task) return;

  const base = getTaskDueDateObject(task) || new Date();
  const next = new Date(base.getTime() + minutes * 60000);
  task.dueDate = isoDate(next);
  task.dueTime = next.toTimeString().slice(0, 5);
  saveTasks();
  dismissReminder(taskId);
  renderAll();
}

function checkForReminders() {
  const settings = getReminderSettings();
  if (!settings.enabled) return;

  const now = new Date();
  const lead = Math.max(0, Number(settings.reminderLeadMinutes) || 0) * 60000;

  tasks
    .filter((task) => !task.done && task.dueDate && task.dueTime)
    .forEach((task) => {
      const dueAt = getTaskDueDateObject(task);
      if (!dueAt) return;

      const timeUntil = dueAt - now;
      const dueSoon = timeUntil <= lead && timeUntil >= -5 * 60000;
      const upcoming = settings.upcomingAlerts && timeUntil > 0 && timeUntil <= lead + 2 * 60000;

      if (!dueSoon && !upcoming) return;
      if (hasReminderBeenSent(task)) return;

      triggerBrowserNotification(task);
      showNotificationToast(task, timeUntil <= 0 ? "Task is due" : "Upcoming task");
      markReminderSent(task);
    });
}

function applyReminderSettingValues() {
  const settings = getReminderSettings();
  const lead = document.getElementById("reminderLeadTime");
  const notificationsToggle = document.getElementById("notificationsToggle");
  const upcomingAlertsToggle = document.getElementById("upcomingAlertsToggle");

  if (lead) lead.value = String(settings.reminderLeadMinutes);
  if (notificationsToggle) notificationsToggle.checked = settings.enabled;
  if (upcomingAlertsToggle) upcomingAlertsToggle.checked = settings.upcomingAlerts;
  updateNotificationStatus();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(date, options) {
  return new Date(date).toLocaleDateString("en-GB", options);
}

function sameDay(a, b) {
  const first = new Date(a);
  const second = new Date(b);
  return first.toDateString() === second.toDateString();
}

function getTaskDueDate(task) {
  if (!task.dueDate) return null;
  const date = new Date(`${task.dueDate}T${task.dueTime || "00:00"}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isTaskOverdue(task) {
  if (task.done || !task.dueDate) return false;
  const dueDate = getTaskDueDate(task);
  if (!dueDate) return false;
  return dueDate < new Date();
}

function dueLabel(task) {
  if (!task.dueDate) {
    return "No deadline";
  }

  const dueDate = getTaskDueDate(task);
  if (!dueDate) return "No deadline";

  const relative = (() => {
    const diff = Math.round((dueDate - new Date()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff < 0) return "Overdue";
    return formatDate(dueDate, { weekday: "short", day: "numeric", month: "short" });
  })();

  return `${relative}${task.dueTime ? ` • ${task.dueTime}` : ""}`;
}

function taskItem(task) {
  const description = task.description ? `<small class="task-description">${escapeHtml(task.description)}</small>` : "";

  return `
    <li class="task ${task.done ? "done" : ""}">
      <input class="check" type="checkbox" data-id="${task.id}" ${task.done ? "checked" : ""} aria-label="Mark ${escapeHtml(task.title)} as done">
      <div class="body">
        <div class="title-row">
          <div class="title">${escapeHtml(task.title)}</div>
          <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        </div>
        <small>${dueLabel(task)}</small>
        ${description}
      </div>
      <div class="task-actions">
        <button class="task-btn edit" type="button" data-action="edit" data-id="${task.id}">Edit</button>
        <button class="task-btn delete" type="button" data-action="delete" data-id="${task.id}">Delete</button>
      </div>
    </li>
  `;
}

const listHTML = (items, emptyMessage) => items.length ? items.map(taskItem).join("") : `<li class="empty">${emptyMessage}</li>`;
const byDue = (a, b) => {
  const aDate = getTaskDueDate(a) || new Date(8640000000000000);
  const bDate = getTaskDueDate(b) || new Date(8640000000000000);
  if (aDate - bDate !== 0) return aDate - bDate;
  return (a.dueTime || "23:59").localeCompare(b.dueTime || "23:59");
};

function renderDashboard() {
  const pending = tasks.filter((task) => !task.done);
  const completed = tasks.filter((task) => task.done);
  const overdue = pending.filter((task) => isTaskOverdue(task));
  const today = tasks.filter((task) => task.dueDate && sameDay(task.dueDate, new Date()) && !task.done).sort(byDue);
  const upcoming = pending
    .filter((task) => task.dueDate && !sameDay(task.dueDate, new Date()) && !isTaskOverdue(task))
    .sort(byDue)
    .slice(0, 4);
  const donePreview = completed.slice().sort((a, b) => (getTaskDueDate(b) || new Date()) - (getTaskDueDate(a) || new Date())).slice(0, 4);
  const total = tasks.length || 1;
  const percentage = Math.round((completed.length / total) * 100);
  const hour = new Date().getHours();

  $("#todayDate").textContent = formatDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${state.name}`;
  $("#summary").textContent = overdue.length
    ? `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""} need attention.`
    : pending.length
      ? `You have ${pending.length} task${pending.length > 1 ? "s" : ""} still pending.`
      : "You’re all caught up.";
  $("#todayCount").textContent = `${today.length} planned`;
  $("#doneCount").textContent = completed.length;
  $("#todayList").innerHTML = listHTML(today, "Nothing scheduled for today.");
  $("#upcomingList").innerHTML = listHTML(upcoming, "No upcoming tasks.");
  $("#doneList").innerHTML = listHTML(donePreview, "Completed tasks will show up here.");

  $("#ringPct").textContent = `${percentage}%`;
  requestAnimationFrame(() => {
    $("#ringFg").style.strokeDashoffset = String(326.7 * (1 - percentage / 100));
  });

  const weekActivity = [3, 5, 2, 6, 4, 1, 2];
  const max = Math.max(...weekActivity);
  const todayIndex = (new Date().getDay() + 6) % 7;
  $("#week").innerHTML = ["M", "T", "W", "T", "F", "S", "S"]
    .map((day, index) => `<div class="${index === todayIndex ? "on" : ""}"><i style="height:${(weekActivity[index] / max) * 100}%"></i>${day}</div>`)
    .join("");

  $("#navCount").textContent = pending.length;
}

function renderTasks() {
  const query = state.query.trim().toLowerCase();
  const filtered = tasks.filter((task) => {
    const haystack = `${task.title} ${task.description} ${task.category}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);

    if (!matchesQuery) return false;

    switch (state.filter) {
      case "active": return !task.done;
      case "done": return task.done;
      case "overdue": return !task.done && isTaskOverdue(task);
      default: return true;
    }
  }).sort(byDue);

  $("#taskList").innerHTML = listHTML(filtered, "No tasks match this filter.");
  $$("#filters .chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.filter === state.filter));

  const pending = tasks.filter((task) => !task.done).length;
  const completed = tasks.filter((task) => task.done).length;
  const overdue = tasks.filter((task) => isTaskOverdue(task)).length;
  $("#statPending").textContent = pending;
  $("#statCompleted").textContent = completed;
  $("#statOverdue").textContent = overdue;
}

function getCalendarViewDates() {
  if (state.calendarView === "week") {
    const weekStart = new Date(state.selected);
    const offset = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - offset);
    weekStart.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return date;
    });
  }

  if (state.calendarView === "day") {
    return [new Date(state.selected)];
  }

  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, month, 1 - offset + index);
    days.push(date);
  }
  return days;
}

function getTaskMinutes(value = "00:00") {
  const [hours = 0, minutes = 0] = String(value).split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function formatMinutes(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function getScheduleConflicts(task) {
  if (!task.dueDate || !task.dueTime) return [];
  return tasks.filter((other) => {
    if (other.id === task.id || !other.dueDate || !other.dueTime) return false;
    if (other.dueDate !== task.dueDate) return false;
    return Math.abs(getTaskMinutes(task.dueTime) - getTaskMinutes(other.dueTime)) < 30;
  });
}

function suggestAlternativeTime(task) {
  if (!task.dueDate) return null;

  const busyTimes = tasks
    .filter((other) => other.id !== task.id && other.dueDate === task.dueDate)
    .map((other) => getTaskMinutes(other.dueTime || "09:00"));

  const preferredStart = getTaskMinutes(task.dueTime || "09:00");
  const proposals = [];

  for (let minute = 8 * 60; minute <= 20 * 60; minute += 30) {
    const isBusy = busyTimes.some((busy) => Math.abs(busy - minute) < 30);
    if (!isBusy) proposals.push(minute);
  }

  const nextFree = proposals.find((minute) => minute >= preferredStart) || proposals[0];
  return nextFree ? formatMinutes(nextFree) : null;
}

function findNextAvailableSlot(task, minutesFromNow = 30) {
  const base = getTaskDueDate(task) || new Date(`${isoDate(state.selected)}T09:00:00`);
  let cursor = new Date(base.getTime() + minutesFromNow * 60000);

  for (let index = 0; index < 80; index += 1) {
    const candidateDate = isoDate(cursor);
    const candidateTime = cursor.toTimeString().slice(0, 5);
    const conflicts = tasks.filter((other) => {
      if (other.id === task.id || !other.dueDate || !other.dueTime) return false;
      if (other.dueDate !== candidateDate) return false;
      return Math.abs(getTaskMinutes(candidateTime) - getTaskMinutes(other.dueTime)) < 30;
    });

    if (!conflicts.length) {
      return { dueDate: candidateDate, dueTime: candidateTime };
    }

    cursor = new Date(cursor.getTime() + 30 * 60000);
  }

  return { dueDate: isoDate(cursor), dueTime: "09:00" };
}

function postponeTask(taskId, minutes = 30) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  const nextSlot = findNextAvailableSlot(task, minutes);
  task.dueDate = nextSlot.dueDate;
  task.dueTime = nextSlot.dueTime;
  saveTasks();
  renderAll();
}

function renderCalendar() {
  const viewDates = getCalendarViewDates();
  const year = state.month.getFullYear();
  const month = state.month.getMonth();

  if (state.calendarView === "month") {
    $("#calTitle").textContent = formatDate(state.month, { month: "long", year: "numeric" });
  } else if (state.calendarView === "week") {
    const start = viewDates[0];
    const end = viewDates[viewDates.length - 1];
    $("#calTitle").textContent = `${formatDate(start, { month: "short", day: "numeric" })} – ${formatDate(end, { month: "short", day: "numeric" })}`;
  } else {
    $("#calTitle").textContent = formatDate(state.selected, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  $$(".calendar-view").forEach((button) => {
    const active = button.dataset.calendarView === state.calendarView;
    button.classList.toggle("active", active);
  });

  const dayTasks = tasks.filter((task) => task.dueDate && sameDay(task.dueDate, state.selected)).sort(byDue);
  const conflicts = dayTasks.filter((task) => getScheduleConflicts(task).length);
  const status = conflicts.length
    ? `${conflicts.length} scheduling conflict${conflicts.length > 1 ? "s" : ""} on this day.`
    : dayTasks.length
      ? `${dayTasks.length} task${dayTasks.length > 1 ? "s" : ""} scheduled.`
      : "No tasks scheduled for this date.";
  $("#calendarStatus").textContent = status;
  $("#dayTitle").textContent = formatDate(state.selected, { weekday: "long", day: "numeric", month: "long" });

  if (state.calendarView === "month") {
    $("#calGrid").className = "cal-grid month-view";
    $("#calGrid").style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
    $("#calGrid").innerHTML = viewDates.map((currentDate) => {
      const dateTasks = tasks.filter((task) => task.dueDate && sameDay(task.dueDate, currentDate)).sort(byDue).slice(0, 3);
      const classes = [
        "cal-day",
        currentDate.getMonth() !== month && "out",
        sameDay(currentDate, new Date()) && "today",
        sameDay(currentDate, state.selected) && "sel",
        dateTasks.length && "has-task",
      ].filter(Boolean).join(" ");

      const dots = dateTasks.map((task) => `<span class="task-dot dot-${task.priority}"></span>`).join("");

      return `
        <button class="${classes}" data-date="${isoDate(currentDate)}" type="button">
          <span class="day-number">${currentDate.getDate()}</span>
          <span class="task-dots">${dots || '<span class="task-dot empty-dot"></span>'}</span>
        </button>
      `;
    }).join("");
  } else if (state.calendarView === "week") {
    $("#calGrid").className = "cal-grid week-view";
    $("#calGrid").style.gridTemplateColumns = "repeat(7, minmax(0, 1fr))";
    $("#calGrid").innerHTML = viewDates.map((currentDate) => {
      const dateTasks = tasks.filter((task) => task.dueDate && sameDay(task.dueDate, currentDate)).sort(byDue);
      const selectedClass = sameDay(currentDate, state.selected) ? "sel" : "";

      return `
        <div class="week-column ${selectedClass}">
          <button class="week-day-head" type="button" data-date="${isoDate(currentDate)}">
            <span>${formatDate(currentDate, { weekday: "short" })}</span>
            <strong>${currentDate.getDate()}</strong>
          </button>
          <div class="week-day-tasks">
            ${dateTasks.length ? dateTasks.map((task) => `
              <div class="week-task ${task.done ? "done" : ""}">
                <span class="mini-dot dot-${task.priority}"></span>
                <div>
                  <strong>${escapeHtml(task.title)}</strong>
                  <small>${task.dueTime || "Any time"}</small>
                </div>
              </div>
            `).join("") : '<div class="week-empty">No tasks</div>'}
          </div>
        </div>
      `;
    }).join("");
  } else {
    $("#calGrid").className = "cal-grid day-view";
    $("#calGrid").style.gridTemplateColumns = "1fr";

    if (!dayTasks.length) {
      $("#calGrid").innerHTML = `<div class="timeline-empty">No scheduled tasks for this day.</div>`;
    } else {
      const timelineMarkup = dayTasks.map((task) => {
        const minutes = getTaskMinutes(task.dueTime || "09:00");
        const top = Math.min(Math.max((minutes / 1440) * 100, 4), 96);
        const taskConflicts = getScheduleConflicts(task);
        const alt = suggestAlternativeTime(task);
        const note = taskConflicts.length
          ? `<span class="timeline-note conflict">Conflict</span>`
          : alt && (taskConflicts.length || isTaskOverdue(task))
            ? `<span class="timeline-note suggestion">Suggested ${alt}</span>`
            : "";

        return `
          <div class="timeline-row" style="top:${top}%">
            <div class="timeline-time">${task.dueTime || "All day"}</div>
            <div class="timeline-card ${task.done ? "done" : ""}">
              <div class="timeline-card-head">
                <strong>${escapeHtml(task.title)}</strong>
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
              </div>
              <small>${escapeHtml(task.description || "No description")}</small>
              ${note}
            </div>
          </div>
        `;
      }).join("");

      const hourlyLabels = Array.from({ length: 24 }, (_, hour) => `<div class="hour-line"><span>${String(hour).padStart(2, "0")}:00</span></div>`).join("");
      $("#calGrid").innerHTML = `
        <div class="timeline-shell">
          <div class="timeline-hours">${hourlyLabels}</div>
          <div class="timeline-events">${timelineMarkup}</div>
        </div>
      `;
    }
  }

  $("#dayList").innerHTML = dayTasks.length
    ? dayTasks.map((task) => {
        const taskConflicts = getScheduleConflicts(task);
        const alternative = suggestAlternativeTime(task);
        const conflictMarkup = taskConflicts.length
          ? `<small class="schedule-conflict">Conflict with ${taskConflicts.map((item) => item.title).slice(0, 2).join(", ")}</small>`
          : "";
        const suggestionMarkup = (taskConflicts.length || isTaskOverdue(task)) && alternative
          ? `<small class="schedule-suggestion">Suggested time: ${alternative}</small>`
          : "";

        return `
          <li class="task ${task.done ? "done" : ""}">
            <input class="check" type="checkbox" data-id="${task.id}" ${task.done ? "checked" : ""} aria-label="Mark ${escapeHtml(task.title)} as done">
            <div class="body task-schedule">
              <div class="title-row">
                <div class="title">${escapeHtml(task.title)}</div>
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
              </div>
              <small>${dueLabel(task)}</small>
              ${conflictMarkup}
              ${suggestionMarkup}
            </div>
            <div class="task-actions">
              <button class="task-btn subtle" type="button" data-action="postpone" data-id="${task.id}" data-minutes="30">+30m</button>
              <button class="task-btn subtle" type="button" data-action="edit" data-id="${task.id}">Edit</button>
              <button class="task-btn warning" type="button" data-action="delete" data-id="${task.id}">Delete</button>
            </div>
          </li>
        `;
      }).join("")
    : "<li class=\"empty\">No tasks on this day.</li>";
}

function renderDashboardTabs() {
  const tabs = $$(".dashboard-tab");
  const panels = $$(".dashboard-panel");

  tabs.forEach((tab) => {
    const isActive = tab.dataset.dashboardTab === state.dashboardTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.dashboardPanel === state.dashboardTab;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

function renderAll() {
  renderDashboard();
  renderTasks();
  renderCalendar();
  renderDashboardTabs();
}

const assistantState = {
  messages: [
    { role: "assistant", text: "Hi! I can help plan your day, check your schedule, create tasks, and reorganize anything that slipped." },
  ],
};

function appendAssistantMessage(role, text) {
  if (!text) return;
  assistantState.messages.push({ role, text });
  renderAssistantMessages();
}

function renderAssistantMessages() {
  const chatLog = document.getElementById("chatLog");
  if (!chatLog) return;

  chatLog.innerHTML = assistantState.messages
    .map((message) => `<div class="msg ${message.role === "assistant" ? "bot" : "me"}">${escapeHtml(message.text)}</div>`)
    .join("");

  chatLog.scrollTop = chatLog.scrollHeight;
}

function getPriorityOrder(priority) {
  return { urgent: 4, high: 3, medium: 2, low: 1 }[priority] || 0;
}

function parseTimeFromMessage(message) {
  const match = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const period = match[3].toLowerCase();

  if (period === "pm" && hours < 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;

  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
}

function findBestTaskMatch(message) {
  const normalized = message.toLowerCase();
  const scored = tasks
    .map((task) => {
      const title = task.title.toLowerCase();
      let score = 0;

      if (title.includes(normalized)) score += 100;
      if (normalized.includes(title.toLowerCase())) score += 80;

      const phrases = ["coding", "code", "study", "design", "report", "email", "work", "gym", "appointment", "call", "invoice", "review", "meeting", "plan"];
      phrases.forEach((phrase) => {
        if (title.includes(phrase) && normalized.includes(phrase)) score += 25;
      });

      if (task.priority) score += getPriorityOrder(task.priority);
      return { task, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.task || null;
}

function buildAssistantFallback(message) {
  const lower = message.toLowerCase();
  const localTasks = tasks.map((task) => ({ ...task }));

  if (lower.includes("what do i have planned for today") || lower.includes("what's planned for today") || lower.includes("what do i have planned") || lower.includes("today's schedule") || lower.includes("what do i have today")) {
    const scheduled = localTasks.filter((task) => task.dueDate && sameDay(task.dueDate, new Date()) && !task.done).sort(byDue);
    if (!scheduled.length) {
      return { reply: "You do not have any tasks scheduled for today.", tasks: localTasks };
    }

    const summary = scheduled.map((task) => `${task.title} at ${task.dueTime || "any time"}`).join("; ");
    return { reply: `Today you have ${scheduled.length} task${scheduled.length > 1 ? "s" : ""}: ${summary}.`, tasks: localTasks };
  }

  if (lower.includes("what should i focus on first") || lower.includes("what should i do first") || lower.includes("focus on first")) {
    const next = localTasks.filter((task) => !task.done).sort((a, b) => {
      const priorityDiff = getPriorityOrder(b.priority) - getPriorityOrder(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return (getTaskDueDate(a) || new Date()) - (getTaskDueDate(b) || new Date());
    })[0];

    if (!next) return { reply: "You are all caught up. There is nothing urgent left to do.", tasks: localTasks };
    return { reply: `Start with "${next.title}" because it is your highest-priority task${next.dueTime ? ` scheduled for ${next.dueTime}` : ""}.`, tasks: localTasks };
  }

  if (/mark .* as done|mark .* done|complete .*|done with .*|finish .*?/i.test(message)) {
    const target = findBestTaskMatch(message.replace(/^(mark|complete|finish|done with)\s+/i, ""));
    if (!target) {
      return { reply: "I could not find a matching task to mark complete.", tasks: localTasks };
    }

    target.done = true;
    return { reply: `I marked "${target.title}" as done.`, tasks: localTasks };
  }

  if (/delete .*task|remove .*task|delete .*|remove .*/i.test(message)) {
    const target = findBestTaskMatch(message.replace(/^(delete|remove)\s+/i, ""));
    if (!target) {
      return { reply: "I could not find a matching task to delete.", tasks: localTasks };
    }

    const filtered = localTasks.filter((task) => task.id !== target.id);
    return { reply: `I deleted "${target.title}".`, tasks: filtered };
  }

  if (lower.includes("move my") || lower.includes("move ") || lower.includes("reschedule") || lower.includes("reschedule my") || lower.includes("move my coding session")) {
    const target = findBestTaskMatch(message.replace(/^(move|reschedule)\s+(my\s+)?/i, ""));
    const time = parseTimeFromMessage(message);

    if (!target) {
      return { reply: "I could not identify which task you want moved.", tasks: localTasks };
    }

    if (time) {
      target.dueTime = time;
      return { reply: `I moved "${target.title}" to ${time}.`, tasks: localTasks };
    }

    target.dueDate = isoDate(dayOffset(1));
    return { reply: `I moved "${target.title}" to tomorrow.`, tasks: localTasks };
  }

  if (lower.includes("missed") || lower.includes("help me rearrange") || lower.includes("rearrange them") || lower.includes("i missed")) {
    const missed = localTasks.filter((task) => !task.done && !task.dueTime).slice(0, 3);
    const pending = localTasks.filter((task) => !task.done).sort(byDue).slice(0, 3);
    const suggestions = pending.map((task, index) => `${index + 1}. ${task.title} at ${task.dueTime || "any time"}`).join("; ");
    return { reply: `I can help you reorganize. Start with: ${suggestions}.`, tasks: localTasks };
  }

  if (/remind me to|add |create |schedule |plan |set /i.test(message)) {
    const content = message.replace(/^(remind me to|add|create|schedule|plan|set)\s+/i, "");
    const time = parseTimeFromMessage(message) || "09:00";
    const dueDate = lower.includes("tomorrow") ? isoDate(dayOffset(1)) : lower.includes("yesterday") ? isoDate(dayOffset(-1)) : isoDate(dayOffset(0));

    const title = content
      .replace(/\b(tomorrow|today|yesterday)\b/ig, "")
      .replace(/\b(at|on)\b\s*\d{1,2}(?::\d{2})?\s*(am|pm)?/ig, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title) {
      return { reply: "I need a task title and time to create it.", tasks: localTasks };
    }

    const newTask = {
      id: `task-${Date.now()}`,
      title,
      description: "Created by assistant.",
      category: "General",
      priority: "medium",
      dueDate,
      dueTime: time,
      done: false,
    };

    localTasks.push(newTask);
    return { reply: `I created "${title}" for ${dueDate} at ${time}.`, tasks: localTasks };
  }

  const todayTasks = localTasks.filter((task) => task.dueDate && sameDay(task.dueDate, new Date()) && !task.done).sort(byDue);
  if (todayTasks.length) {
    return {
      reply: `You currently have ${todayTasks.length} active task${todayTasks.length > 1 ? "s" : ""} today: ${todayTasks.map((task) => task.title).join(", ")}.`,
      tasks: localTasks,
    };
  }

  return { reply: "I can help with scheduling, planning, and task changes. Try asking about today’s schedule or creating a new task.", tasks: localTasks };
}

async function sendAssistantMessage(message) {
  const input = document.getElementById("assistantInput");
  const status = document.getElementById("assistantStatus");
  const trimmed = message.trim();

  if (!trimmed) return;

  appendAssistantMessage("me", trimmed);
  if (input) input.value = "";
  if (status) status.textContent = "Thinking...";

  try {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: trimmed,
        tasks: tasks.map((task) => ({ ...task })),
        userName: state.name,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const payload = await response.json();

    if (Array.isArray(payload.tasks)) {
      tasks = payload.tasks.map((task) => ({ ...task }));
      saveTasks();
      renderAll();
    }

    appendAssistantMessage("assistant", payload.reply || "I am ready to help.");
  } catch (error) {
    console.warn("Assistant API failed, using local fallback.", error);
    const fallback = buildAssistantFallback(trimmed);

    if (Array.isArray(fallback.tasks)) {
      tasks = fallback.tasks.map((task) => ({ ...task }));
      saveTasks();
      renderAll();
    }

    appendAssistantMessage("assistant", fallback.reply || "I could not process that request.");
  } finally {
    if (status) status.textContent = "Ready";
  }
}

function navigate() {
  const view = location.hash.slice(1);
  state.view = titles[view] ? view : "dashboard";
  $$(".view").forEach((section) => {
    section.hidden = section.id !== `view-${state.view}`;
  });
  $$(".nav a").forEach((link) => link.classList.toggle("active", link.dataset.view === state.view));
  $("#pageTitle").textContent = titles[state.view];
  closeMenu();
  window.scrollTo(0, 0);
}

const openMenu = () => {
  $("#sidebar").classList.add("open");
  $("#scrim").classList.add("show");
};

const closeMenu = () => {
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("show");
};

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("doable-theme", theme);
  $$("#themeChoice .chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.theme === theme));
}

function setName(name) {
  state.name = (name || "").trim() || "there";
  localStorage.setItem("doable-name", state.name);
  $("#sideName").textContent = state.name;
  $("#avatar").textContent = state.name.charAt(0).toUpperCase();
  renderDashboard();
}

function openTaskModal(taskId = null) {
  const form = $("#taskForm");
  const modal = $("#taskModalBackdrop");
  const title = $("#taskModalTitle");
  const task = tasks.find((item) => item.id === taskId);

  form.reset();
  $("#taskId").value = task ? task.id : "";
  $("#taskPriority").value = "medium";
  title.textContent = task ? "Edit task" : "New task";

  if (task) {
    $("#taskTitle").value = task.title;
    $("#taskDescription").value = task.description || "";
    $("#taskCategory").value = task.category || "";
    $("#taskPriority").value = task.priority || "medium";
    $("#taskDueDate").value = task.dueDate || "";
    $("#taskDueTime").value = task.dueTime || "";
    $("#taskDone").checked = Boolean(task.done);
  } else {
    $("#taskDueDate").value = isoDate(state.selected || new Date());
    $("#taskDueTime").value = "09:00";
  }

  modal.hidden = false;
  requestAnimationFrame(() => $("#taskTitle").focus());
}

function closeTaskModal() {
  $("#taskModalBackdrop").hidden = true;
  $("#taskForm").reset();
}

function handleTaskSubmit(event) {
  event.preventDefault();

  const title = $("#taskTitle").value.trim();
  if (!title) {
    $("#taskTitle").focus();
    return;
  }

  const id = $("#taskId").value || `task-${Date.now()}`;
  const taskIndex = tasks.findIndex((item) => item.id === id);
  const nextTask = {
    id,
    title,
    description: $("#taskDescription").value.trim(),
    category: $("#taskCategory").value.trim() || "General",
    priority: $("#taskPriority").value,
    dueDate: $("#taskDueDate").value || "",
    dueTime: $("#taskDueTime").value || "",
    done: $("#taskDone").checked,
  };

  if (taskIndex >= 0) {
    tasks[taskIndex] = { ...tasks[taskIndex], ...nextTask };
  } else {
    tasks.push(nextTask);
  }

  saveTasks();
  renderAll();
  closeTaskModal();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  saveTasks();
  renderAll();
}

document.addEventListener("change", (event) => {
  if (!event.target.classList.contains("check")) return;

  const task = tasks.find((item) => item.id === event.target.dataset.id);
  if (!task) return;

  task.done = event.target.checked;
  saveTasks();
  renderAll();
});

$("#filters").addEventListener("click", (event) => {
  const filter = event.target.dataset.filter;
  if (!filter) return;
  state.filter = filter;
  renderTasks();
});

$$(".dashboard-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.dashboardTab = tab.dataset.dashboardTab;
    renderDashboardTabs();
  });
});

$("#taskSearch").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderTasks();
});

$("#assistantForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("assistantInput");
  if (!input) return;
  sendAssistantMessage(input.value);
});

$$(".assistant-prompt").forEach((button) => {
  button.addEventListener("click", () => sendAssistantMessage(button.dataset.prompt || ""));
});

$("#newTaskBtn").addEventListener("click", () => openTaskModal());
$("#cancelTaskBtn").addEventListener("click", closeTaskModal);
$("#closeTaskModal").addEventListener("click", closeTaskModal);
$("#taskModalBackdrop").addEventListener("click", (event) => {
  if (event.target === $("#taskModalBackdrop")) closeTaskModal();
});
$("#taskForm").addEventListener("submit", handleTaskSubmit);

document.addEventListener("click", (event) => {
  const reminderAction = event.target.closest("[data-reminder-action]");
  if (reminderAction) {
    const taskId = reminderAction.dataset.taskId;
    const action = reminderAction.dataset.reminderAction;
    if (action === "dismiss") {
      dismissReminder(taskId);
    }
    if (action === "snooze") {
      snoozeTask(taskId, Number(reminderAction.dataset.minutes || 10));
    }
    if (action === "reschedule") {
      openTaskModal(taskId);
      dismissReminder(taskId);
    }
    return;
  }

  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;

  const { action, id } = trigger.dataset;
  if (action === "edit") {
    openTaskModal(id);
  }

  if (action === "delete") {
    deleteTask(id);
  }

  if (action === "postpone") {
    postponeTask(id, Number(trigger.dataset.minutes || 30));
  }
});

$("#calGrid").addEventListener("click", (event) => {
  const button = event.target.closest(".cal-day");
  if (!button) return;
  state.selected = new Date(button.dataset.date);
  state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
  renderCalendar();
});

$$(".calendar-view").forEach((button) => {
  button.addEventListener("click", () => {
    state.calendarView = button.dataset.calendarView;
    renderCalendar();
  });
});

$("#calPrev").addEventListener("click", () => {
  if (state.calendarView === "day") {
    state.selected = new Date(state.selected.getTime() - 24 * 60 * 60 * 1000);
    state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
  } else if (state.calendarView === "week") {
    state.selected = new Date(state.selected.getTime() - 7 * 24 * 60 * 60 * 1000);
    state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
  } else {
    state.month.setMonth(state.month.getMonth() - 1);
    state.selected = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
  }
  renderCalendar();
});

$("#calNext").addEventListener("click", () => {
  if (state.calendarView === "day") {
    state.selected = new Date(state.selected.getTime() + 24 * 60 * 60 * 1000);
    state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
  } else if (state.calendarView === "week") {
    state.selected = new Date(state.selected.getTime() + 7 * 24 * 60 * 60 * 1000);
    state.month = new Date(state.selected.getFullYear(), state.selected.getMonth(), 1);
  } else {
    state.month.setMonth(state.month.getMonth() + 1);
    state.selected = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
  }
  renderCalendar();
});

$("#themeBtn").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

$("#themeChoice").addEventListener("click", (event) => {
  const theme = event.target.dataset.theme;
  if (!theme) return;
  setTheme(theme);
});
$("#notificationsToggle").addEventListener("change", (event) => {
  const settings = getReminderSettings();
  settings.enabled = event.target.checked;
  saveReminderSettings(settings);
  updateNotificationStatus();
  if (settings.enabled) checkForReminders();
});
$("#upcomingAlertsToggle").addEventListener("change", (event) => {
  const settings = getReminderSettings();
  settings.upcomingAlerts = event.target.checked;
  saveReminderSettings(settings);
  if (settings.enabled) checkForReminders();
});
$("#reminderLeadTime").addEventListener("change", (event) => {
  const settings = getReminderSettings();
  settings.reminderLeadMinutes = Number(event.target.value || 10);
  saveReminderSettings(settings);
  if (settings.enabled) checkForReminders();
});
$("#requestNotificationPermissionBtn").addEventListener("click", () => {
  requestNotificationPermission();
});
$("#registerBtn").addEventListener("click", () => registerOrLogin("register"));
$("#loginBtn").addEventListener("click", () => registerOrLogin("login"));
$("#logoutBtn").addEventListener("click", logoutUser);

$("#nameInput").addEventListener("input", (event) => setName(event.target.value));
$("#menuBtn").addEventListener("click", openMenu);
$("#scrim").addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closeTaskModal();
  }
});
window.addEventListener("hashchange", navigate);
window.addEventListener("focus", checkForReminders);
setInterval(checkForReminders, 30000);

const persistedUser = getCurrentUser();
if (persistedUser) {
  state.name = persistedUser.name || state.name;
  updateAuthStatus(`Signed in as ${persistedUser.name || persistedUser.email || "your account"}.`, false);
}

$("#nameInput").value = state.name;
applyReminderSettingValues();
setTheme(document.documentElement.dataset.theme);
setName(state.name);
renderAssistantMessages();
renderAll();
if (getAuthToken()) {
  syncLoggedInUserData();
}
navigate();
