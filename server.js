const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Anthropic = require("@anthropic-ai/sdk");
const { randomUUID } = require("crypto");
require("dotenv").config();

const {
  createUser,
  getUserByEmail,
  getUserById,
  listTasksByUser,
  replaceTasksForUser,
  getPreferences,
  savePreferences,
  addAiMessage,
  getAiHistory,
} = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-production";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const ALLOWED_ORIGINS = ["http://127.0.0.1:5500"];
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS blocked for this origin."));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
app.use("/api/chat", rateLimit({ windowMs: 60 * 1000, max: 20 }));

function isoDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function getPriorityWeight(priority) {
  return { urgent: 4, high: 3, medium: 2, low: 1 }[priority] || 0;
}

function byDue(a, b) {
  const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || "00:00"}:00`) : new Date(8640000000000000);
  const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || "00:00"}:00`) : new Date(8640000000000000);
  return aDate - bDate;
}

function parseTimeFromMessage(message) {
  const match = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const period = match[3].toLowerCase();

  if (period === "pm" && hours < 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function findBestTaskMatch(message, tasks) {
  const value = String(message || "").toLowerCase();
  const scored = tasks
    .map((task) => {
      let score = 0;
      const title = String(task.title || "").toLowerCase();
      if (title.includes(value)) score += 100;
      if (value.includes(title)) score += 80;

      ["coding", "code", "study", "design", "report", "email", "gym", "appointment", "call", "invoice", "review", "meeting", "plan"].forEach((phrase) => {
        if (title.includes(phrase) && value.includes(phrase)) score += 25;
      });

      score += getPriorityWeight(task.priority);
      return { task, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.task || null;
}

function fallbackAssistantLogic({ message, tasks, userName = "there" }) {
  const normalized = String(message || "").trim();
  const lower = normalized.toLowerCase();
  const nextTasks = Array.isArray(tasks) ? tasks.map((task) => ({ ...task })) : [];

  if (lower.includes("what do i have planned for today") || lower.includes("what do i have today") || lower.includes("what do i have planned") || lower.includes("today's schedule")) {
    const scheduled = nextTasks.filter((task) => task.dueDate && sameDay(task.dueDate, new Date()) && !task.done).sort(byDue);
    if (!scheduled.length) {
      return { reply: `You have no tasks scheduled for today, ${userName}.`, tasks: nextTasks };
    }

    return {
      reply: `Today you have ${scheduled.length} task${scheduled.length > 1 ? "s" : ""}: ${scheduled.map((task) => `${task.title} at ${task.dueTime || "any time"}`).join("; ")}.`,
      tasks: nextTasks,
    };
  }

  if (lower.includes("what should i focus on first") || lower.includes("focus on first") || lower.includes("what should i do first")) {
    const next = nextTasks.filter((task) => !task.done).sort((a, b) => {
      const priorityDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || "23:59"}:00`) : new Date(8640000000000000);
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || "23:59"}:00`) : new Date(8640000000000000);
      return aDate - bDate;
    })[0];

    if (!next) {
      return { reply: "You are all caught up. Nothing urgent is left.", tasks: nextTasks };
    }

    return {
      reply: `Start with "${next.title}". It is the highest-priority item${next.dueTime ? ` scheduled for ${next.dueTime}` : ""}.`,
      tasks: nextTasks,
    };
  }

  if (/mark .* as done|mark .* done|complete .*|done with .*|finish .*/i.test(normalized)) {
    const text = normalized.replace(/^(mark|complete|finish|done with)\s+/i, "");
    const target = findBestTaskMatch(text, nextTasks);
    if (!target) {
      return { reply: "I could not find a matching task to mark as complete.", tasks: nextTasks };
    }

    target.done = true;
    return { reply: `I marked "${target.title}" as completed.`, tasks: nextTasks };
  }

  if (/delete .*task|remove .*task|delete .*|remove .*/i.test(normalized)) {
    const text = normalized.replace(/^(delete|remove)\s+/i, "");
    const target = findBestTaskMatch(text, nextTasks);
    if (!target) {
      return { reply: "I could not find a matching task to delete.", tasks: nextTasks };
    }

    const filtered = nextTasks.filter((task) => task.id !== target.id);
    return { reply: `I deleted "${target.title}".`, tasks: filtered };
  }

  if (lower.includes("move my") || lower.includes("move ") || lower.includes("reschedule") || lower.includes("rearrange") || lower.includes("postpone")) {
    const text = normalized.replace(/^(move|reschedule|postpone)\s+(my\s+)?/i, "");
    const target = findBestTaskMatch(text, nextTasks) || nextTasks.find((task) => task.title.toLowerCase().includes("coding"));
    const time = parseTimeFromMessage(normalized);

    if (!target) {
      return { reply: "I could not identify which task you want to move.", tasks: nextTasks };
    }

    if (time) {
      target.dueTime = time;
      return { reply: `I moved "${target.title}" to ${time}.`, tasks: nextTasks };
    }

    target.dueDate = isoDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    return { reply: `I moved "${target.title}" to tomorrow.`, tasks: nextTasks };
  }

  if (lower.includes("missed") || lower.includes("help me rearrange") || lower.includes("rearrange them") || lower.includes("i missed")) {
    const pending = nextTasks.filter((task) => !task.done).sort(byDue).slice(0, 3);
    const summary = pending.length
      ? pending.map((task, index) => `${index + 1}. ${task.title} at ${task.dueTime || "any time"}`).join("; ")
      : "There are no missed tasks right now.";

    return { reply: `Here is the best rearrangement: ${summary}.`, tasks: nextTasks };
  }

  if (/remind me to|add |create |schedule |plan |set /i.test(normalized)) {
    const content = normalized.replace(/^(remind me to|add|create|schedule|plan|set)\s+/i, "");
    const time = parseTimeFromMessage(normalized) || "09:00";
    const date = lower.includes("tomorrow") ? isoDate(new Date(Date.now() + 24 * 60 * 60 * 1000)) : lower.includes("yesterday") ? isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000)) : isoDate(new Date());

    const title = content
      .replace(/\b(tomorrow|today|yesterday)\b/ig, "")
      .replace(/\b(at|on)\b\s*\d{1,2}(?::\d{2})?\s*(am|pm)?/ig, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title) {
      return { reply: "I need a task title and a time to add it.", tasks: nextTasks };
    }

    const task = {
      id: `task-${Date.now()}`,
      title,
      description: "Created by assistant.",
      category: "General",
      priority: "medium",
      dueDate: date,
      dueTime: time,
      done: false,
    };

    nextTasks.push(task);
    return { reply: `I created "${title}" for ${date} at ${time}.`, tasks: nextTasks };
  }

  if (lower.includes("what do i have planned for this week") || lower.includes("weekly schedule") || lower.includes("week schedule")) {
    const upcoming = nextTasks.filter((task) => !task.done).sort(byDue).slice(0, 5);
    if (!upcoming.length) return { reply: "You have no tasks scheduled for this week.", tasks: nextTasks };
    return {
      reply: `This week your priority list is: ${upcoming.map((task) => `${task.title} (${task.dueDate})`).join("; ")}.`,
      tasks: nextTasks,
    };
  }

  return {
    reply: `I can help with scheduling, task creation, edits, rescheduling, and productivity planning. Try asking: "What do I have planned for today?" or "Remind me to study JavaScript tomorrow at 5 PM."`,
    tasks: nextTasks,
  };
}

async function askOpenAI({ message, tasks, userName }) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!key) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "You are Doable Assistant, a helpful personal productivity assistant. Work with the provided task list. If the user asks to create, update, delete, or reschedule tasks, return only a concise reply and do not expose any API keys. Do not claim tasks were created unless you are actually updating the tasks array in the response.",
        },
        {
          role: "user",
          content: JSON.stringify({ userName, message, tasks }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() || null;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getUserById(decoded.sub);
    if (!user) {
      return res.status(401).json({ message: "Invalid session." });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Doable Assistant", database: "sqlite" });
});

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Name, valid email, and a password of at least 6 characters are required." });
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: "An account with that email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = createUser({ id: randomUUID(), name, email, passwordHash });
  const token = signToken(user);

  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const row = require("./db").db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
  const isMatch = await bcrypt.compare(password, row.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
}));

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email } });
});

app.get("/api/preferences", authMiddleware, (req, res) => {
  res.json({ preferences: getPreferences(req.user.id) });
});

app.put("/api/preferences", authMiddleware, (req, res) => {
  const preferences = savePreferences(req.user.id, req.body || {});
  res.json({ preferences });
});

app.get("/api/tasks", authMiddleware, (req, res) => {
  res.json({ tasks: listTasksByUser(req.user.id) });
});

app.post("/api/tasks/sync", authMiddleware, (req, res) => {
  const incoming = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
  const tasks = replaceTasksForUser(req.user.id, incoming);
  res.json({ tasks });
});

app.put("/api/tasks/:id", authMiddleware, (req, res) => {
  const existing = listTasksByUser(req.user.id).find((task) => task.id === req.params.id);
  if (!existing) {
    return res.status(404).json({ message: "Task not found." });
  }

  const nextTasks = listTasksByUser(req.user.id).map((task) => task.id === req.params.id ? { ...task, ...req.body, id: req.params.id } : task);
  const tasks = replaceTasksForUser(req.user.id, nextTasks);
  res.json({ task: tasks.find((task) => task.id === req.params.id), tasks });
});

app.delete("/api/tasks/:id", authMiddleware, (req, res) => {
  const target = listTasksByUser(req.user.id).find((task) => task.id === req.params.id);
  if (!target) {
    return res.status(404).json({ message: "Task not found." });
  }

  const tasks = listTasksByUser(req.user.id).filter((task) => task.id !== req.params.id);
  replaceTasksForUser(req.user.id, tasks);
  res.json({ deleted: true, tasks });
});

app.get("/api/assistant/history", authMiddleware, (req, res) => {
  res.json({ history: getAiHistory(req.user.id, 30) });
});

app.post("/api/assistant/chat", authMiddleware, async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ message: "Please send a message to the assistant." });
  }

  const tasks = listTasksByUser(req.user.id);
  const userName = req.user.name || "there";

  try {
    const aiReply = await askOpenAI({ message, tasks, userName });
    if (aiReply) {
      addAiMessage(req.user.id, "user", message);
      addAiMessage(req.user.id, "assistant", aiReply);
      return res.json({ reply: aiReply, tasks });
    }
  } catch (error) {
    console.warn("OpenAI unavailable, using local fallback logic.", error.message);
  }

  const fallback = fallbackAssistantLogic({ message, tasks, userName });
  addAiMessage(req.user.id, "user", message);
  addAiMessage(req.user.id, "assistant", fallback.reply);
  replaceTasksForUser(req.user.id, fallback.tasks || tasks);
  return res.json({ reply: fallback.reply, tasks: fallback.tasks || tasks });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return res.status(400).json({ error: "Message is too long." });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Anthropic API key is not configured on the server." });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 300,
      system: "You are Doable's task assistant. Help the user plan their day using the tasks provided. Be brief.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            message,
            tasks,
          }),
        },
      ],
    });

    const reply = response.content?.[0]?.text || "I am ready to help.";
    return res.json({ reply });
  } catch (error) {
    console.error("Anthropic request failed:", error);
    return res.status(500).json({ error: "The assistant could not answer right now." });
  }
});

app.use(express.static(__dirname));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === "production" ? "Internal server error." : err.message;
  res.status(status).json({ message });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Doable AI server running at http://localhost:${PORT}`);
});
