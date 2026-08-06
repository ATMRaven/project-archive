import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// Enable CORS for all API requests
app.use("/api/*", cors());

// In-memory cache for pending AI actions waiting for user confirmation
const pendingAiConfirmations = new Map();

// ----------------------------------------------------------------------------
// Helper: Execute D1 queries safely
// ----------------------------------------------------------------------------
async function getDb(c) {
  return c.env.DB;
}

// ----------------------------------------------------------------------------
// Helper: Clean HTML entity encoding & string sanitization
// ----------------------------------------------------------------------------
function decodeHtmlEntities(str = "") {
  if (!str) return "";
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}

function safeTrim(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  return String(val).trim();
}

// ----------------------------------------------------------------------------
// Helper: Robust Metadata Scraper for URLs
// ----------------------------------------------------------------------------
async function scrapeUrlMetadata(rawUrl) {
  let title = "";
  let description = "";
  const formattedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(formattedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();

      const ogTitleMatch =
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
        html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i);
      
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

      if (ogTitleMatch && ogTitleMatch[1]) {
        title = ogTitleMatch[1].trim();
      } else if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }

      const ogDescMatch =
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
      
      if (ogDescMatch && ogDescMatch[1]) {
        description = ogDescMatch[1].trim();
      }
    }
  } catch (err) {
    console.warn("[Scraper] Metadata scrape fallback:", err.message);
  }

  title = decodeHtmlEntities(title);
  description = decodeHtmlEntities(description);

  if (title) {
    title = title.replace(/\s*[\-\|•]\s*(GitHub|Twitter|X|Medium|YouTube|Vite|React|DEV Community)$/i, "").trim();
  } else {
    try {
      const parsed = new URL(formattedUrl);
      const hostParts = parsed.hostname.replace(/^www\./, "").split(".");
      title = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
    } catch {
      title = "New Project";
    }
  }

  return { title, description, formattedUrl };
}

// ----------------------------------------------------------------------------
// API: App Version & Remote Update Endpoint
// ----------------------------------------------------------------------------
app.get("/api/version", (c) => {
  return c.json({
    latestVersion: "1.6.0",
    minSupportedVersion: "1.0.0",
    releaseDate: "2026-08-06",
    title: "📱 Version 1.6.0 Shake Gesture Release",
    releaseNotes: [
      "Shake Device Gesture to unlock Admin Login popup",
      "Heavy haptic response on shake trigger",
      "Native hardware back button & performance updates",
    ],
    downloadUrl: "https://github.com/ATMRaven/project-archive/releases/latest",
    apkUrl: "https://github.com/ATMRaven/project-archive/releases/latest/download/project-archive.apk",
    forceUpdate: false,
  });
});

// ----------------------------------------------------------------------------
// API: Active Projects List (Excludes soft-deleted items)
// ----------------------------------------------------------------------------
app.get("/api/projects", async (c) => {
  try {
    const db = await getDb(c);
    const isAdmin = c.req.query("isAdmin") === "true";

    let projectsQuery = "SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC, display_order ASC";
    if (!isAdmin) {
      projectsQuery = "SELECT * FROM projects WHERE hidden = 0 AND deleted_at IS NULL ORDER BY created_at DESC, display_order ASC";
    }

    const [projectsRes, categoryOrdersRes] = await Promise.all([
      db.prepare(projectsQuery).all(),
      db.prepare("SELECT * FROM category_orders ORDER BY display_order ASC").all(),
    ]);

    const projects = (projectsRes.results || []).map((p) => ({
      ...p,
      hidden: Boolean(p.hidden),
      clicks: p.clicks || 0,
    }));

    return c.json({
      projects,
      categoryOrders: categoryOrdersRes.results || [],
    });
  } catch (err) {
    console.error("[API] Error fetching projects:", err);
    return c.json({ error: "Failed to load projects", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Recently Deleted Trash Bin Projects List
// ----------------------------------------------------------------------------
app.get("/api/projects/deleted", async (c) => {
  try {
    const isAdmin = c.req.query("isAdmin") === "true";
    if (!isAdmin) {
      return c.json({ error: "Admin authorization required" }, 403);
    }
    const db = await getDb(c);
    const res = await db.prepare("SELECT * FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all();
    return c.json({ deletedProjects: res.results || [] });
  } catch (err) {
    console.error("[API] Error fetching deleted projects:", err);
    return c.json({ error: "Failed to fetch deleted projects", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Restore Soft-Deleted Project
// ----------------------------------------------------------------------------
app.post("/api/projects/:id/restore", async (c) => {
  try {
    const db = await getDb(c);
    const id = c.req.param("id");

    await db.prepare("UPDATE projects SET deleted_at = NULL WHERE id = ?").bind(id).run();
    return c.json({ success: true });
  } catch (err) {
    console.error("[API] Error restoring project:", err);
    return c.json({ error: "Failed to restore project", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Create Project
// ----------------------------------------------------------------------------
app.post("/api/projects", async (c) => {
  try {
    const db = await getDb(c);
    const body = await c.req.json();
    const { title, description = "", url, category = null, hidden = false } = body;

    if (!title || !url) {
      return c.json({ error: "Title and URL are required" }, 400);
    }

    const id = crypto.randomUUID();
    const isHidden = hidden ? 1 : 0;
    const nowIso = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO projects (id, title, description, url, category, hidden, display_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL)"
      )
      .bind(id, safeTrim(title), safeTrim(description), safeTrim(url), category ? safeTrim(category) : null, isHidden, nowIso)
      .run();

    const newProject = {
      id,
      title: safeTrim(title),
      description: safeTrim(description),
      url: safeTrim(url),
      category: category ? safeTrim(category) : null,
      hidden: Boolean(hidden),
      display_order: 0,
      created_at: nowIso,
    };

    return c.json({ success: true, project: newProject }, 201);
  } catch (err) {
    console.error("[API] Error creating project:", err);
    return c.json({ error: "Failed to create project", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Confirm Pending AI Action
// ----------------------------------------------------------------------------
app.post("/api/ai/confirm", async (c) => {
  try {
    const db = await getDb(c);
    const body = await c.req.json();
    const { pendingId, confirm } = body;

    if (!pendingId) {
      return c.json({ error: "Pending confirmation ID is required" }, 400);
    }

    const pendingData = pendingAiConfirmations.get(pendingId);
    if (!pendingData) {
      return c.json({ error: "Confirmation request expired or not found" }, 404);
    }

    pendingAiConfirmations.delete(pendingId);

    if (!confirm) {
      return c.json({ success: true, reply: "❌ Action cancelled by admin. No changes were made." });
    }

    // Execute approved actions on Cloudflare D1
    let createdProjectResult = null;
    let sortMode = null;

    for (const act of pendingData.actions) {
      try {
        if (act.action === "create_project") {
          const id = crypto.randomUUID();
          const finalUrl = safeTrim(act.url, "https://example.com");
          const finalTitle = safeTrim(act.title, "New Project");
          const finalDesc = safeTrim(act.description, "");
          const finalCat = safeTrim(act.category, "General");
          const isHidden = act.hidden ? 1 : 0;
          const nowIso = new Date().toISOString();

          await db
            .prepare(
              "INSERT INTO projects (id, title, description, url, category, hidden, display_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL)"
            )
            .bind(id, finalTitle, finalDesc, finalUrl, finalCat, isHidden, nowIso)
            .run();

          createdProjectResult = {
            id,
            title: finalTitle,
            description: finalDesc,
            url: finalUrl,
            category: finalCat,
            hidden: isHidden === 1,
            display_order: 0,
            created_at: nowIso,
          };
        } else if (act.action === "update_project" && act.id) {
          const existing = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(act.id).first();
          if (existing) {
            const title = act.title !== undefined ? safeTrim(act.title, existing.title) : existing.title;
            const description = act.description !== undefined ? safeTrim(act.description, existing.description) : existing.description;
            const url = act.url !== undefined ? safeTrim(act.url, existing.url) : existing.url;
            const category = act.category !== undefined ? safeTrim(act.category, existing.category) : existing.category;
            const hidden = act.hidden !== undefined ? (act.hidden ? 1 : 0) : (existing.hidden ? 1 : 0);

            await db
              .prepare("UPDATE projects SET title = ?, description = ?, url = ?, category = ?, hidden = ? WHERE id = ?")
              .bind(title, description, url, category, hidden, act.id)
              .run();
          }
        } else if (act.action === "delete_project" && act.id) {
          const nowIso = new Date().toISOString();
          await db.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").bind(nowIso, act.id).run();
        } else if (act.action === "restore_project" && act.id) {
          await db.prepare("UPDATE projects SET deleted_at = NULL WHERE id = ?").bind(act.id).run();
        } else if (act.action === "sort_archive") {
          sortMode = act.mode || "newest";
        }
      } catch (actErr) {
        console.error(`[AI Confirm] Error executing action ${act.action}:`, actErr.message);
      }
    }

    return c.json({
      success: true,
      reply: pendingData.successReply || "✅ Action confirmed and executed successfully!",
      sortMode,
      project: createdProjectResult ? { ...createdProjectResult, hidden: Boolean(createdProjectResult.hidden) } : null,
    });
  } catch (err) {
    console.error("[API] Error confirming AI action:", err);
    return c.json({ error: "Failed to confirm action", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Conversational & Confirmation-Gated AI Admin Agent
// ----------------------------------------------------------------------------
app.post("/api/ai/command", async (c) => {
  try {
    const db = await getDb(c);
    const body = await c.req.json();
    const { command } = body;

    if (!command || typeof command !== "string" || !command.trim()) {
      return c.json({ error: "Command string is required" }, 400);
    }

    const userCommand = command.trim();
    const lowerCmd = userCommand.toLowerCase();

    // 1. Fetch active & deleted projects for context
    const [projectsRes, deletedRes, categoriesRes] = await Promise.all([
      db.prepare("SELECT id, title, description, category, hidden, url, display_order, created_at FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC").all(),
      db.prepare("SELECT id, title, description, category, hidden, url, deleted_at FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(),
      db.prepare("SELECT DISTINCT category FROM projects WHERE category IS NOT NULL AND deleted_at IS NULL").all(),
    ]);

    const existingProjects = (projectsRes.results || []).map((p) => ({ ...p, hidden: Boolean(p.hidden) }));
    const deletedProjects = (deletedRes.results || []).map((p) => ({ ...p, hidden: Boolean(p.hidden) }));
    const existingCategories = (categoriesRes.results || []).map((r) => r.category);

    // 2. Extract URL & scrape web page if present
    const urlPattern = /(https?:\/\/[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\S*)/i;
    const urlMatch = userCommand.match(urlPattern);
    let extractedUrl = urlMatch ? urlMatch[0] : null;
    let scrapedTitle = "";
    let scrapedDesc = "";

    if (extractedUrl) {
      const scraped = await scrapeUrlMetadata(extractedUrl);
      extractedUrl = scraped.formattedUrl;
      scrapedTitle = scraped.title;
      scrapedDesc = scraped.description;
    }

    // 3. Workers AI Processing with Llama 3.2 3B
    let actionsToExecute = [];
    let agentReply = "";
    let aiHandled = false;

    if (c.env.AI) {
      try {
        const compactProjects = existingProjects.slice(0, 8).map(p => ({
          id: p.id,
          title: p.title,
          category: p.category || "General"
        }));

        const compactDeleted = deletedProjects.slice(0, 5).map(p => ({
          id: p.id,
          title: p.title
        }));

        const systemPrompt = `You are Raven AI, an intelligent conversational portfolio assistant for a web archive of ${existingProjects.length} active projects across ${existingCategories.length} categories.

Database Context:
Active Projects: ${JSON.stringify(compactProjects)}
Deleted Projects in Trash: ${JSON.stringify(compactDeleted)}
Categories: ${JSON.stringify(existingCategories)}
Extracted URL: ${extractedUrl ? `"${extractedUrl}"` : "None"}

Write your natural conversational answer in "replyMessage".
If proposing database modifications, put actions in "actions".

Return ONLY raw JSON:
{
  "actions": [
    // { "action": "create_project", "title": "...", "description": "...", "url": "...", "category": "..." }
    // { "action": "update_project", "id": "exact_id", "title": "...", "description": "...", "category": "...", "hidden": boolean }
    // { "action": "delete_project", "id": "exact_id" }
    // { "action": "restore_project", "id": "exact_id" }
    // { "action": "sort_archive", "mode": "newest" | "popular" }
  ],
  "replyMessage": "Your conversational answer."
}`;

        const aiRes = await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userCommand },
          ],
          stream: false,
          max_tokens: 500,
          temperature: 0.3,
        });

        const textOutput = (aiRes.response || (aiRes.choices && aiRes.choices[0] && aiRes.choices[0].message ? aiRes.choices[0].message.content : "") || "").trim();

        if (textOutput) {
          const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed.actions)) actionsToExecute = parsed.actions;
              
              const replyStr = parsed.replyMessage || parsed.message || parsed.reply || parsed.response || parsed.text || parsed.answer;
              if (replyStr && typeof replyStr === "string" && replyStr.trim().length > 0) {
                agentReply = replyStr.trim();
                aiHandled = true;
              } else {
                for (const [k, v] of Object.entries(parsed)) {
                  if (k !== "actions" && typeof v === "string" && v.trim().length > 3) {
                    agentReply = v.trim();
                    aiHandled = true;
                    break;
                  }
                }
              }
            } catch {
              const matchReply = textOutput.match(/"(?:replyMessage|message|reply|response|text|answer|description)"\s*:\s*"([\s\S]*?)"(?=\s*\}|\s*,\s*"actions")/i) || textOutput.match(/"(?:replyMessage|message|reply|response|text|answer|description)"\s*:\s*"([^"]+)"/i);
              if (matchReply && matchReply[1]) {
                agentReply = matchReply[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
                aiHandled = true;
              }
            }
          }

          if (!aiHandled) {
            agentReply = textOutput.replace(/```json/gi, "").replace(/```/g, "").replace(/\{[\s\S]*?\}/g, "").trim() || textOutput;
            if (agentReply) aiHandled = true;
          }
        }
      } catch (aiErr) {
        console.warn("[AI Agent] Workers AI warning:", aiErr.message);
      }
    }

    // 4. Smart Dynamic Conversational Synthesis & Intelligent Auto-Categorization
    if (lowerCmd.includes("rework categor") || lowerCmd.includes("fix categor") || lowerCmd.includes("organize categor") || lowerCmd.includes("auto categor")) {
      actionsToExecute = existingProjects.map((p) => {
        const titleLower = (p.title || "").toLowerCase();
        const urlLower = (p.url || "").toLowerCase();
        let smartCat = "Personal Projects";

        if (titleLower.includes("github") || titleLower.includes("vite") || titleLower.includes("react") || urlLower.includes("github") || titleLower.includes("tool") || titleLower.includes("api")) {
          smartCat = "Developer Tools";
        } else if (titleLower.includes("fit") || titleLower.includes("gym") || titleLower.includes("vitaliaa") || titleLower.includes("health")) {
          smartCat = "Health & Fitness";
        } else if (titleLower.includes("beauty") || titleLower.includes("salon") || titleLower.includes("amira") || titleLower.includes("shop") || titleLower.includes("client")) {
          smartCat = "Business & Services";
        } else if (titleLower.includes("game") || titleLower.includes("play")) {
          smartCat = "Games & Fun";
        } else if (titleLower.includes("demo") || titleLower.includes("test") || titleLower.includes("experiment")) {
          smartCat = "Experiments";
        }

        return {
          action: "update_project",
          id: p.id,
          category: smartCat,
        };
      });

      agentReply = `I propose reorganizing your ${existingProjects.length} projects into 5 smart categories: Developer Tools, Health & Fitness, Business & Services, Games & Fun, and Personal Projects.`;
      aiHandled = true;
    } else if (!aiHandled || !agentReply || agentReply.length < 5) {
      if (lowerCmd.includes("project") || lowerCmd.includes("have") || lowerCmd.includes("list") || lowerCmd.includes("show")) {
        const topTitles = existingProjects.slice(0, 5).map(p => `• ${p.title} (${p.category || 'General'})`).join('\n');
        agentReply = `You currently have ${existingProjects.length} active project(s) indexed across ${existingCategories.length} categories:\n${topTitles}${existingProjects.length > 5 ? `\n...and ${existingProjects.length - 5} more!` : ''}`;
      } else if (lowerCmd.includes("description") || lowerCmd.includes("better") || lowerCmd.includes("think")) {
        agentReply = `I completely agree! Adding detailed, descriptive summaries to your portfolio items makes your archive much more engaging. Would you like me to write improved descriptions for your top projects?`;
      } else if (lowerCmd.includes("how many") || lowerCmd.includes("count") || lowerCmd.includes("total")) {
        agentReply = `You currently have ${existingProjects.length} active project(s) and ${deletedProjects.length} in the Trash Bin.`;
      } else if (lowerCmd.includes("delete") && (lowerCmd.includes("new") || lowerCmd.includes("last") || lowerCmd.includes("recent"))) {
        const newest = existingProjects[0];
        if (newest) {
          actionsToExecute.push({ action: "delete_project", id: newest.id });
          agentReply = `I propose deleting the most recent project "${newest.title}".`;
        }
      } else if (lowerCmd.includes("restore") || lowerCmd.includes("recover")) {
        const newestDeleted = deletedProjects[0];
        if (newestDeleted) {
          actionsToExecute.push({ action: "restore_project", id: newestDeleted.id });
          agentReply = `I propose restoring project "${newestDeleted.title}" from Trash.`;
        }
      } else if (extractedUrl || lowerCmd.includes("add") || lowerCmd.includes("create")) {
        let title = scrapedTitle;
        if (!title) {
          title = userCommand.replace(/add|create|website|pls|please|under|category/gi, "").trim();
          title = title.charAt(0).toUpperCase() + title.slice(1) || "New Project";
        }
        const finalUrl = extractedUrl || `https://example.com/${title.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        
        actionsToExecute.push({
          action: "create_project",
          url: finalUrl,
          title: title,
          description: scrapedDesc || "Added via AI Admin Assistant.",
          category: existingCategories[0] || "General",
          hidden: false,
        });
        agentReply = `I propose adding website "${title}" to your archive.`;
      } else if (lowerCmd.includes("show") || lowerCmd.includes("unhide")) {
        const queryStr = userCommand.replace(/show|unhide|reveal|project|all/gi, "").trim().toLowerCase();
        const targets = existingProjects.filter(p => p.title.toLowerCase().includes(queryStr) || (p.category && p.category.toLowerCase().includes(queryStr)));
        targets.forEach(p => actionsToExecute.push({ action: "update_project", id: p.id, hidden: false }));
        agentReply = `Unhidden ${targets.length} project(s) matching "${queryStr || "all"}".`;
      } else if (lowerCmd.includes("hide")) {
        const queryStr = userCommand.replace(/hide|mask|project|all/gi, "").trim().toLowerCase();
        const targets = existingProjects.filter(p => p.title.toLowerCase().includes(queryStr) || (p.category && p.category.toLowerCase().includes(queryStr)));
        targets.forEach(p => actionsToExecute.push({ action: "update_project", id: p.id, hidden: true }));
        agentReply = `Hidden ${targets.length} project(s) matching "${queryStr || "all"}".`;
      } else if (lowerCmd.includes("delete") || lowerCmd.includes("remove")) {
        const queryStr = userCommand.replace(/delete|remove|erase|project|all/gi, "").trim().toLowerCase();
        const targets = existingProjects.filter(p => p.title.toLowerCase().includes(queryStr) || (p.category && p.category.toLowerCase().includes(queryStr)));
        targets.forEach(p => actionsToExecute.push({ action: "delete_project", id: p.id }));
        agentReply = `Deleted ${targets.length} project(s) matching "${queryStr || "all"}".`;
      } else if (lowerCmd.includes("sort") || lowerCmd.includes("popular") || lowerCmd.includes("newest")) {
        let mode = "newest";
        if (lowerCmd.includes("popular")) mode = "popular";
        if (lowerCmd.includes("oldest")) mode = "oldest";
        if (lowerCmd.includes("alpha")) mode = "alphabetical";
        actionsToExecute.push({ action: "sort_archive", mode });
        agentReply = `Sorted project archive by ${mode}.`;
      } else {
        agentReply = `Hey there! How can I help you with your project archive today?`;
      }
    }

    // 5. Confirmation Gate: If actions contain DB modifications, create a Pending Confirmation Card!
    const isDbModification = actionsToExecute.some(a => ["create_project", "update_project", "delete_project", "restore_project"].includes(a.action));

    if (isDbModification) {
      const pendingId = crypto.randomUUID();
      pendingAiConfirmations.set(pendingId, {
        actions: actionsToExecute,
        successReply: agentReply || "✅ Proposed actions confirmed and executed!",
      });

      return c.json({
        success: true,
        reply: agentReply || "I propose the following changes. Please confirm or cancel:",
        pendingConfirmation: {
          pendingId,
          summary: actionsToExecute.map(a => `${a.action.replace('_', ' ').toUpperCase()}: ${a.title || a.id || ''}`).join(', '),
          actions: actionsToExecute,
        },
      });
    }

    // If pure sort or Q&A (read-only), execute immediately
    let sortMode = null;
    for (const act of actionsToExecute) {
      if (act.action === "sort_archive") sortMode = act.mode;
    }

    return c.json({
      success: true,
      reply: agentReply || "Done!",
      sortMode,
    });
  } catch (err) {
    console.error("[AI Agent] Error executing intelligent AI command:", err.message);
    return c.json({ error: "Failed to process AI command", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Soft Delete Project directly via Admin UI
// ----------------------------------------------------------------------------
app.delete("/api/projects/:id", async (c) => {
  try {
    const db = await getDb(c);
    const id = c.req.param("id");
    const nowIso = new Date().toISOString();

    await db.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").bind(nowIso, id).run();
    return c.json({ success: true });
  } catch (err) {
    console.error("[API] Error soft-deleting project:", err);
    return c.json({ error: "Failed to delete project", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Increment Project Click Count
// ----------------------------------------------------------------------------
app.post("/api/projects/:id/click", async (c) => {
  try {
    const db = await getDb(c);
    const id = c.req.param("id");

    await db.prepare("UPDATE projects SET clicks = COALESCE(clicks, 0) + 1 WHERE id = ?").bind(id).run();
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------------------------------
// API: Update Project
// ----------------------------------------------------------------------------
app.put("/api/projects/:id", async (c) => {
  try {
    const db = await getDb(c);
    const id = c.req.param("id");
    const body = await c.req.json();

    const existing = await db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
    if (!existing) {
      return c.json({ error: "Project not found" }, 404);
    }

    const title = body.title !== undefined ? safeTrim(body.title) : existing.title;
    const description = body.description !== undefined ? safeTrim(body.description) : existing.description;
    const url = body.url !== undefined ? safeTrim(body.url) : existing.url;
    const category = body.category !== undefined ? (body.category ? safeTrim(body.category) : null) : existing.category;
    const hidden = body.hidden !== undefined ? (body.hidden ? 1 : 0) : existing.hidden;

    await db
      .prepare(
        "UPDATE projects SET title = ?, description = ?, url = ?, category = ?, hidden = ? WHERE id = ?"
      )
      .bind(title, description, url, category, hidden, id)
      .run();

    return c.json({ success: true });
  } catch (err) {
    console.error("[API] Error updating project:", err);
    return c.json({ error: "Failed to update project", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Category Orders
// ----------------------------------------------------------------------------
app.get("/api/categories/orders", async (c) => {
  try {
    const db = await getDb(c);
    const res = await db.prepare("SELECT * FROM category_orders ORDER BY display_order ASC").all();
    return c.json({ categoryOrders: res.results || [] });
  } catch (err) {
    console.error("[API] Error fetching category orders:", err);
    return c.json({ error: "Failed to fetch category orders", details: err.message }, 500);
  }
});

app.put("/api/categories/orders", async (c) => {
  try {
    const db = await getDb(c);
    const body = await c.req.json();
    const orders = body.categoryOrders || [];

    const statements = orders.map((item) =>
      db
        .prepare(
          "INSERT INTO category_orders (category, display_order) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET display_order = excluded.display_order"
        )
        .bind(item.category, item.display_order)
    );

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return c.json({ success: true });
  } catch (err) {
    console.error("[API] Error updating category orders:", err);
    return c.json({ error: "Failed to save category orders", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Ping Logs & Keep-Alive
// ----------------------------------------------------------------------------
async function executeKeepAlivePing(db) {
  let status = 200;
  let message = "Cloudflare D1 Health check active";

  try {
    const check = await db.prepare("SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL").first();
    message = `Pinged Cloudflare D1 DB — status 200 (${check ? check.count : 0} projects indexed)`;
  } catch (err) {
    status = 500;
    message = `D1 Health check failed: ${err.message}`;
  }

  try {
    await db.prepare("INSERT INTO ping_logs (status, message) VALUES (?, ?)").bind(status, message).run();
  } catch (logErr) {
    console.error("[keep-alive] Failed to record ping log:", logErr);
  }

  return { status, message };
}

app.get("/api/ping-logs", async (c) => {
  try {
    const db = await getDb(c);
    const res = await db.prepare("SELECT * FROM ping_logs ORDER BY created_at DESC LIMIT 50").all();
    return c.json(res.results || []);
  } catch (err) {
    console.error("[API] Error fetching ping logs:", err);
    return c.json({ error: "Failed to fetch ping logs", details: err.message }, 500);
  }
});

app.post("/api/ping", async (c) => {
  try {
    const db = await getDb(c);
    const result = await executeKeepAlivePing(db);
    return c.json(result);
  } catch (err) {
    return c.json({ error: "Failed to execute ping", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// Fallback: Pass non-API requests to Cloudflare Assets Binding
// ----------------------------------------------------------------------------
app.all("*", async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Not Found", 404);
});

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    console.log(`[cron] Running scheduled keep-alive ping at ${new Date().toISOString()}`);
    ctx.waitUntil(executeKeepAlivePing(env.DB));
  },
};
