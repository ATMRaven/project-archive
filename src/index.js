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
// API: Projects List
// ----------------------------------------------------------------------------
app.get("/api/projects", async (c) => {
  try {
    const db = await getDb(c);
    const isAdmin = c.req.query("isAdmin") === "true";

    let projectsQuery = "SELECT * FROM projects ORDER BY display_order ASC, created_at DESC";
    if (!isAdmin) {
      projectsQuery = "SELECT * FROM projects WHERE hidden = 0 ORDER BY display_order ASC, created_at DESC";
    }

    const [projectsRes, categoryOrdersRes] = await Promise.all([
      db.prepare(projectsQuery).all(),
      db.prepare("SELECT * FROM category_orders ORDER BY display_order ASC").all(),
    ]);

    const projects = (projectsRes.results || []).map((p) => ({
      ...p,
      hidden: Boolean(p.hidden),
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
    const res = await db
      .prepare(
        "INSERT INTO projects (id, title, description, url, category, hidden) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
      )
      .bind(id, title.trim(), description.trim(), url.trim(), category ? category.trim() : null, isHidden)
      .first();

    return c.json({ success: true, project: { ...res, hidden: Boolean(res?.hidden) } }, 201);
  } catch (err) {
    console.error("[API] Error creating project:", err);
    return c.json({ error: "Failed to create project", details: err.message }, 500);
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

// Export default Worker handler + Scheduled event trigger
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    console.log(`[cron] Running scheduled keep-alive ping at ${new Date().toISOString()}`);
    ctx.waitUntil(executeKeepAlivePing(env.DB));
  },
};
