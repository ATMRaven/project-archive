import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

// Enable CORS for all API requests
app.use("/api/*", cors());

// ----------------------------------------------------------------------------
// Helper: Execute D1 queries safely
// ----------------------------------------------------------------------------
async function getDb(c) {
  return c.env.DB;
}

// ----------------------------------------------------------------------------
// Helper: Scrape page title and meta description from URL
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
      // Extract title tag
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim().replace(/\s+/g, " ");
      }

      // Extract OG / Meta description
      const ogDescMatch =
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
      if (ogDescMatch && ogDescMatch[1]) {
        description = ogDescMatch[1].trim().replace(/\s+/g, " ");
      }
    }
  } catch (err) {
    console.warn("[Scraper] Metadata scrape fallback:", err.message);
  }

  // Fallback title from hostname if no title tag found
  if (!title) {
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
// API: Projects List (Ordered by created_at DESC so newest appear first!)
// ----------------------------------------------------------------------------
app.get("/api/projects", async (c) => {
  try {
    const db = await getDb(c);
    const isAdmin = c.req.query("isAdmin") === "true";

    let projectsQuery = "SELECT * FROM projects ORDER BY created_at DESC, display_order ASC";
    if (!isAdmin) {
      projectsQuery = "SELECT * FROM projects WHERE hidden = 0 ORDER BY created_at DESC, display_order ASC";
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

    const res = await db
      .prepare(
        "INSERT INTO projects (id, title, description, url, category, hidden, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?) RETURNING *"
      )
      .bind(id, title.trim(), description.trim(), url.trim(), category ? category.trim() : null, isHidden, nowIso)
      .first();

    return c.json({ success: true, project: { ...res, hidden: Boolean(res?.hidden) } }, 201);
  } catch (err) {
    console.error("[API] Error creating project:", err);
    return c.json({ error: "Failed to create project", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: 100% Free AI Admin Agent Assistant
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
    console.log(`[AI Agent] Processing command: "${userCommand}"`);

    // Fetch existing projects & categories for context
    const [projectsRes, categoriesRes] = await Promise.all([
      db.prepare("SELECT id, title, category, hidden, url FROM projects").all(),
      db.prepare("SELECT DISTINCT category FROM projects WHERE category IS NOT NULL").all(),
    ]);

    const existingProjects = projectsRes.results || [];
    const existingCategories = (categoriesRes.results || []).map((r) => r.category);

    // Extract URL if present in the user's natural language command
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

    // Call Cloudflare Workers AI (100% Free daily tier) if bound, else smart fallback
    let aiParsed = null;
    if (c.env.AI) {
      try {
        const systemPrompt = `You are Raven AI Admin Agent for a Web Project Archive application.
Your job is to parse the admin's natural language request and return ONLY valid JSON matching this exact structure:
{
  "intent": "add_project" | "hide_project" | "show_project" | "delete_project" | "sort_view" | "general_chat",
  "url": "extracted URL or null",
  "title": "suggested project title",
  "description": "suggested short description",
  "category": "suggested category based on existing categories: [${existingCategories.join(", ")}]",
  "targetQuery": "name/keyword of project to modify",
  "sortMode": "newest" | "oldest" | "popular" | "alphabetical",
  "reply": "Friendly concise confirmation message of what action was taken"
}

Context:
- User Command: "${userCommand}"
- Extracted URL: ${extractedUrl || "None"}
- Scraped Title: "${scrapedTitle}"
- Scraped Description: "${scrapedDesc}"
- Existing Categories: ${JSON.stringify(existingCategories)}
- Total Projects in DB: ${existingProjects.length}

Return ONLY raw JSON, no markdown formatting or commentary.`;

        const aiRes = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userCommand },
          ],
          max_tokens: 350,
          temperature: 0.2,
        });

        const textOutput = aiRes.response || "";
        const jsonMatch = textOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiParsed = JSON.parse(jsonMatch[0]);
        }
      } catch (aiErr) {
        console.warn("[AI Agent] Workers AI inference error, using intelligent parser fallback:", aiErr.message);
      }
    }

    // Fallback parser logic if Workers AI json wasn't extracted
    if (!aiParsed) {
      const lowerCmd = userCommand.toLowerCase();
      if (extractedUrl || lowerCmd.includes("add") || lowerCmd.includes("create")) {
        aiParsed = {
          intent: "add_project",
          url: extractedUrl || "https://example.com",
          title: scrapedTitle || "New Project",
          description: scrapedDesc || "Added via AI Assistant.",
          category: existingCategories[0] || "Web Tool",
          reply: `Added project "${scrapedTitle || "New Project"}" to your archive.`,
        };
      } else if (lowerCmd.includes("hide")) {
        const query = userCommand.replace(/hide/gi, "").trim();
        aiParsed = {
          intent: "hide_project",
          targetQuery: query,
          reply: `Hidden projects matching "${query}".`,
        };
      } else if (lowerCmd.includes("show") || lowerCmd.includes("unhide")) {
        const query = userCommand.replace(/show|unhide/gi, "").trim();
        aiParsed = {
          intent: "show_project",
          targetQuery: query,
          reply: `Unhidden projects matching "${query}".`,
        };
      } else if (lowerCmd.includes("delete") || lowerCmd.includes("remove")) {
        const query = userCommand.replace(/delete|remove/gi, "").trim();
        aiParsed = {
          intent: "delete_project",
          targetQuery: query,
          reply: `Deleted projects matching "${query}".`,
        };
      } else if (lowerCmd.includes("sort") || lowerCmd.includes("popular") || lowerCmd.includes("newest")) {
        let mode = "newest";
        if (lowerCmd.includes("popular")) mode = "popular";
        if (lowerCmd.includes("oldest")) mode = "oldest";
        if (lowerCmd.includes("alpha")) mode = "alphabetical";
        aiParsed = {
          intent: "sort_view",
          sortMode: mode,
          reply: `Sorted list by ${mode}.`,
        };
      } else {
        aiParsed = {
          intent: "general_chat",
          reply: `I received: "${userCommand}". You can ask me to add links, hide/show projects, or sort your archive!`,
        };
      }
    }

    // Execute database operations based on parsed intent
    let actionResult = null;

    if (aiParsed.intent === "add_project") {
      const id = crypto.randomUUID();
      const targetUrl = aiParsed.url || extractedUrl || "https://example.com";
      const finalTitle = (aiParsed.title || scrapedTitle || "New Entry").trim();
      const finalDesc = (aiParsed.description || scrapedDesc || "").trim();
      const finalCat = (aiParsed.category || "General").trim();
      const nowIso = new Date().toISOString();

      actionResult = await db
        .prepare(
          "INSERT INTO projects (id, title, description, url, category, hidden, display_order, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?) RETURNING *"
        )
        .bind(id, finalTitle, finalDesc, targetUrl, finalCat, nowIso)
        .first();

      aiParsed.reply = `✨ Created & added project "${finalTitle}" under category "${finalCat}"!`;
    } else if (aiParsed.intent === "hide_project") {
      const q = `%${(aiParsed.targetQuery || "").toLowerCase().trim()}%`;
      const res = await db
        .prepare("UPDATE projects SET hidden = 1 WHERE LOWER(title) LIKE ? OR LOWER(category) LIKE ?")
        .bind(q, q)
        .run();
      aiParsed.reply = `🙈 Hidden ${res.meta?.changes || 0} project(s) matching "${aiParsed.targetQuery}".`;
    } else if (aiParsed.intent === "show_project") {
      const q = `%${(aiParsed.targetQuery || "").toLowerCase().trim()}%`;
      const res = await db
        .prepare("UPDATE projects SET hidden = 0 WHERE LOWER(title) LIKE ? OR LOWER(category) LIKE ?")
        .bind(q, q)
        .run();
      aiParsed.reply = `👁️ Unhidden ${res.meta?.changes || 0} project(s) matching "${aiParsed.targetQuery}".`;
    } else if (aiParsed.intent === "delete_project") {
      const q = `%${(aiParsed.targetQuery || "").toLowerCase().trim()}%`;
      const res = await db
        .prepare("DELETE FROM projects WHERE LOWER(title) LIKE ? OR LOWER(category) LIKE ?")
        .bind(q, q)
        .run();
      aiParsed.reply = `🗑️ Removed ${res.meta?.changes || 0} project(s) matching "${aiParsed.targetQuery}".`;
    }

    return c.json({
      success: true,
      intent: aiParsed.intent,
      reply: aiParsed.reply,
      sortMode: aiParsed.sortMode || null,
      project: actionResult ? { ...actionResult, hidden: Boolean(actionResult.hidden) } : null,
    });
  } catch (err) {
    console.error("[AI Agent] Error executing AI command:", err);
    return c.json({ error: "Failed to process AI command", details: err.message }, 500);
  }
});

// ----------------------------------------------------------------------------
// API: Increment Project Click/Popularity Count
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

    const title = body.title !== undefined ? body.title.trim() : existing.title;
    const description = body.description !== undefined ? body.description.trim() : existing.description;
    const url = body.url !== undefined ? body.url.trim() : existing.url;
    const category = body.category !== undefined ? (body.category ? body.category.trim() : null) : existing.category;
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
// API: Delete Project
// ----------------------------------------------------------------------------
app.delete("/api/projects/:id", async (c) => {
  try {
    const db = await getDb(c);
    const id = c.req.param("id");

    await db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
    return c.json({ success: true });
  } catch (err) {
    console.error("[API] Error deleting project:", err);
    return c.json({ error: "Failed to delete project", details: err.message }, 500);
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
    const check = await db.prepare("SELECT COUNT(*) as count FROM projects").first();
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
