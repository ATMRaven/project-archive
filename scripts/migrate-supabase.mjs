import fs from "fs";

const SUPABASE_URL = "https://ziepzteuywchkmbjelbt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppZXB6dGV1eXdjaGttYmplbGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwODUxMTEsImV4cCI6MjA5ODY2MTExMX0.qD4JypSs8UuJQinq6vlI1f7Jq7TfzbXOYUfIUHjQQWY";

async function migrate() {
  console.log("Fetching existing data from Supabase...");

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const [projectsRes, categoryOrdersRes, pingLogsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/projects?select=*`, { headers }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/category_orders?select=*`, { headers }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/ping_logs?select=*&order=created_at.desc&limit=50`, { headers }).then((r) => r.json()),
  ]);

  console.log("Projects count from Supabase:", Array.isArray(projectsRes) ? projectsRes.length : projectsRes);
  console.log("Category Orders count:", Array.isArray(categoryOrdersRes) ? categoryOrdersRes.length : categoryOrdersRes);
  console.log("Ping Logs count:", Array.isArray(pingLogsRes) ? pingLogsRes.length : pingLogsRes);

  let sql = "DELETE FROM projects;\nDELETE FROM category_orders;\nDELETE FROM ping_logs;\n";

  if (Array.isArray(projectsRes) && projectsRes.length > 0) {
    for (const p of projectsRes) {
      const id = `'${p.id}'`;
      const title = (p.title || "").replace(/'/g, "''");
      const desc = p.description ? `'${p.description.replace(/'/g, "''")}'` : "NULL";
      const url = (p.url || "").replace(/'/g, "''");
      const cat = p.category ? `'${p.category.replace(/'/g, "''")}'` : "NULL";
      const hidden = p.hidden ? 1 : 0;
      const order = p.display_order ?? 999999;
      const created = p.created_at ? `'${p.created_at}'` : "CURRENT_TIMESTAMP";

      sql += `INSERT INTO projects (id, title, description, url, category, hidden, display_order, created_at) VALUES (${id}, '${title}', ${desc}, '${url}', ${cat}, ${hidden}, ${order}, ${created});\n`;
    }
  }

  if (Array.isArray(categoryOrdersRes) && categoryOrdersRes.length > 0) {
    for (const co of categoryOrdersRes) {
      const cat = (co.category || "").replace(/'/g, "''");
      const order = co.display_order ?? 0;
      sql += `INSERT INTO category_orders (category, display_order) VALUES ('${cat}', ${order});\n`;
    }
  }

  if (Array.isArray(pingLogsRes) && pingLogsRes.length > 0) {
    for (const pl of pingLogsRes) {
      const msg = (pl.message || "").replace(/'/g, "''");
      const status = pl.status || 200;
      const created = pl.created_at ? `'${pl.created_at}'` : "CURRENT_TIMESTAMP";
      sql += `INSERT INTO ping_logs (status, message, created_at) VALUES (${status}, '${msg}', ${created});\n`;
    }
  }

  fs.writeFileSync("seed_data.sql", sql);
  console.log("Exported seed_data.sql successfully!");
}

migrate().catch(console.error);
