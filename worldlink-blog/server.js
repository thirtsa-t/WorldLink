const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const slugify = require('slugify');
const { marked } = require('marked');
const fse = require('fs-extra');
const { getDB } = require('./db/db');

const app = express();
const PORT = 3000;

// ── FILE UPLOAD SETUP ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'admin/uploads/'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static('admin/uploads'));
app.use('/output', express.static('output'));

// ── CORS (allow Live Server on port 5500 to fetch from here) ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── PUBLIC API ────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
  try {
    const db = await getDB();
    const posts = await db.query(`SELECT * FROM posts WHERE status = 'published' ORDER BY created_at DESC`);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts/:slug', async (req, res) => {
  try {
    const db = await getDB();
    const rows = await db.query(`SELECT * FROM posts WHERE slug = ? AND status = 'published'`, [req.params.slug]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD ─────────────────────────────────────────────────
app.get('/', async (req, res) => {
  const db = await getDB();
  const posts      = await db.query(`SELECT * FROM posts ORDER BY created_at DESC`);
  const categories = await db.query(`SELECT * FROM categories ORDER BY name`);
  const published  = posts.filter(p => p.status === 'published').length;
  const drafts     = posts.filter(p => p.status === 'draft').length;
  const recent     = posts.slice(0, 6);

  res.send(shell('Dashboard', `
<div class="page-header">
  <div>
    <h1 class="page-title">Dashboard</h1>
    <p class="page-sub">Welcome back — WorldLink Supply Chain Blog</p>
  </div>
  <a href="/posts/new" class="btn-primary">+ New Post</a>
</div>

<div class="stats-row">
  <div class="stat-box" style="--accent:#22c55e">
    <div class="stat-icon">📰</div>
    <div class="stat-body"><div class="stat-num">${posts.length}</div><div class="stat-lbl">Total Posts</div></div>
  </div>
  <div class="stat-box" style="--accent:#3b82f6">
    <div class="stat-icon">✅</div>
    <div class="stat-body"><div class="stat-num">${published}</div><div class="stat-lbl">Published</div></div>
  </div>
  <div class="stat-box" style="--accent:#f59e0b">
    <div class="stat-icon">📝</div>
    <div class="stat-body"><div class="stat-num">${drafts}</div><div class="stat-lbl">Drafts</div></div>
  </div>
  <div class="stat-box" style="--accent:#8b5cf6">
    <div class="stat-icon">🏷️</div>
    <div class="stat-body"><div class="stat-num">${categories.length}</div><div class="stat-lbl">Categories</div></div>
  </div>
</div>

<div class="grid-2col">
  <div class="card">
    <div class="card-head">
      <h2>Recent Posts</h2>
      <a href="/posts" class="link-btn">View all →</a>
    </div>
    <div class="post-list">
      ${recent.length === 0
        ? '<div class="empty-state">No posts yet. <a href="/posts/new">Write your first post →</a></div>'
        : recent.map(p => `
        <div class="post-row">
          <div class="post-thumb">
            ${p.featured_image ? `<img src="${p.featured_image}" alt="">` : '<div class="thumb-placeholder">📦</div>'}
          </div>
          <div class="post-meta">
            <div class="post-title-sm">${p.title}</div>
            <div class="post-details">
              <span class="cat-tag">${p.category || 'Uncategorised'}</span>
              <span class="status-dot ${p.status}">${p.status}</span>
              <span class="post-date">${new Date(p.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>
            </div>
          </div>
          <div class="post-actions">
            <a href="/posts/edit/${p.id}" class="icon-btn" title="Edit">✏️</a>
            <a href="/posts/delete/${p.id}" class="icon-btn danger" title="Delete" onclick="return confirm('Delete this post?')">🗑️</a>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <div class="side-col">
    <div class="card">
      <div class="card-head"><h2>Quick Actions</h2></div>
      <div class="qa-grid">
        <a href="/posts/new" class="qa-btn orange"><span class="qa-icon">✍️</span><span>Write Post</span></a>
        <a href="/posts" class="qa-btn blue"><span class="qa-icon">📋</span><span>All Posts</span></a>
        <a href="/categories" class="qa-btn purple"><span class="qa-icon">🏷️</span><span>Categories</span></a>
        <a href="/publish-all" class="qa-btn green"><span class="qa-icon">🚀</span><span>Publish All</span></a>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Categories</h2></div>
      <div class="cat-list">
        ${categories.map(c => {
          const count = posts.filter(p => p.category === c.name).length;
          return `<div class="cat-item"><span>${c.name}</span><span class="cat-count">${count} posts</span></div>`;
        }).join('')}
      </div>
      <a href="/categories" class="link-btn" style="margin-top:12px;display:inline-block">Manage →</a>
    </div>
    <div class="card tip-card">
      <div class="card-head"><h2>💡 SEO Tip</h2></div>
      <p>Include your <strong>target keyword in the first 100 words</strong> of every post. Add "Kigali", "Rwanda", "East Africa" to rank locally on Google.</p>
    </div>
  </div>
</div>
  `));
});

// ── ALL POSTS ─────────────────────────────────────────────────
app.get('/posts', async (req, res) => {
  const db = await getDB();
  const { status, category, q } = req.query;
  let sql = `SELECT * FROM posts WHERE 1=1`;
  const params = [];
  if (status)   { sql += ` AND status = ?`;   params.push(status); }
  if (category) { sql += ` AND category = ?`; params.push(category); }
  if (q)        { sql += ` AND title LIKE ?`; params.push(`%${q}%`); }
  sql += ` ORDER BY created_at DESC`;
  const posts      = await db.query(sql, params);
  const categories = await db.query(`SELECT * FROM categories ORDER BY name`);

  res.send(shell('All Posts', `
<div class="page-header">
  <div>
    <h1 class="page-title">All Posts</h1>
    <p class="page-sub">${posts.length} post${posts.length !== 1 ? 's' : ''} found</p>
  </div>
  <a href="/posts/new" class="btn-primary">+ New Post</a>
</div>
<div class="filter-bar">
  <form method="GET" action="/posts" style="display:flex;gap:10px;flex-wrap:wrap;width:100%">
    <input class="filter-input" name="q" placeholder="🔍  Search posts..." value="${q || ''}">
    <select class="filter-select" name="status">
      <option value="">All Status</option>
      <option ${status === 'published' ? 'selected' : ''} value="published">Published</option>
      <option ${status === 'draft' ? 'selected' : ''} value="draft">Draft</option>
    </select>
    <select class="filter-select" name="category">
      <option value="">All Categories</option>
      ${categories.map(c => `<option ${category === c.name ? 'selected' : ''} value="${c.name}">${c.name}</option>`).join('')}
    </select>
    <button type="submit" class="btn-primary">Search</button>
    <a href="/posts" class="btn-ghost">Clear</a>
  </form>
</div>
<div class="card" style="padding:0;overflow:hidden">
  <table class="data-table">
    <thead>
      <tr><th style="width:50px"></th><th>Title</th><th>Category</th><th>SEO Title</th><th>Status</th><th>Date</th><th>Actions</th></tr>
    </thead>
    <tbody>
      ${posts.length === 0
        ? `<tr><td colspan="7" class="empty-cell">No posts found. <a href="/posts/new">Create one →</a></td></tr>`
        : posts.map(p => `
        <tr>
          <td>${p.featured_image ? `<img src="${p.featured_image}" style="width:40px;height:40px;object-fit:cover;border-radius:6px">` : `<div style="width:40px;height:40px;background:#f0f2f5;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px">📦</div>`}</td>
          <td><div style="font-weight:600;color:#0d1117">${p.title}</div><div style="font-size:12px;color:#aaa;margin-top:2px">${p.slug}</div></td>
          <td><span class="cat-tag">${p.category || '—'}</span></td>
          <td style="font-size:12px;color:#555;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.seo_title || '<em style="color:#ccc">Not set</em>'}</td>
          <td><span class="status-badge ${p.status}">${p.status}</span></td>
          <td style="font-size:13px;color:#888;white-space:nowrap">${new Date(p.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</td>
          <td><div style="display:flex;gap:6px"><a href="/posts/edit/${p.id}" class="tbl-btn blue">✏️ Edit</a><a href="/posts/delete/${p.id}" class="tbl-btn red" onclick="return confirm('Delete this post?')">🗑️</a></div></td>
        </tr>`).join('')}
    </tbody>
  </table>
</div>
  `));
});

// ── NEW POST ──────────────────────────────────────────────────
app.get('/posts/new', async (req, res) => {
  const db = await getDB();
  const categories = await db.query(`SELECT * FROM categories ORDER BY name`);
  res.send(shell('New Post', postEditor(categories, null)));
});

// ── EDIT POST ─────────────────────────────────────────────────
app.get('/posts/edit/:id', async (req, res) => {
  const db = await getDB();
  const rows = await db.query(`SELECT * FROM posts WHERE id = ?`, [req.params.id]);
  if (!rows || rows.length === 0) return res.redirect('/posts');
  const categories = await db.query(`SELECT * FROM categories ORDER BY name`);
  res.send(shell('Edit Post', postEditor(categories, rows[0])));
});

// ── SAVE POST ─────────────────────────────────────────────────
app.post('/posts/save', upload.single('featuredImage'), async (req, res) => {
  const db = await getDB();
  const { id, title, content, category, status, seoTitle, seoDescription, tags } = req.body;
  const slug  = slugify(title || 'untitled', { lower: true, strict: true });
  const now   = new Date().toISOString();
  const image = req.file ? '/uploads/' + req.file.filename : (req.body.existingImage || '');

  if (id) {
    await db.query(`
      UPDATE posts SET title=?, slug=?, content=?, category=?, status=?,
      seo_title=?, seo_description=?, tags=?,
      featured_image=CASE WHEN ? != '' THEN ? ELSE featured_image END,
      updated_at=? WHERE id=?`,
      [title, slug, content, category, status, seoTitle, seoDescription, tags, image, image, now, id]
    );
  } else {
    await db.query(`
      INSERT INTO posts (title,slug,content,category,status,seo_title,seo_description,tags,featured_image,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [title, slug, content, category, status, seoTitle, seoDescription, tags, image, now, now]
    );
  }
  res.redirect('/posts');
});

// ── DELETE POST ───────────────────────────────────────────────
app.get('/posts/delete/:id', async (req, res) => {
  const db = await getDB();
  await db.query(`DELETE FROM posts WHERE id = ?`, [req.params.id]);
  res.redirect('/posts');
});

// ── CATEGORIES ────────────────────────────────────────────────
app.get('/categories', async (req, res) => {
  const db = await getDB();
  const categories = await db.query(`SELECT * FROM categories ORDER BY name`);
  const posts      = await db.query(`SELECT category FROM posts`);

  res.send(shell('Categories', `
<div class="page-header">
  <div><h1 class="page-title">Categories</h1><p class="page-sub">Organise your blog posts</p></div>
</div>
<div class="grid-2col" style="grid-template-columns:380px 1fr">
  <div class="card">
    <div class="card-head"><h2>Add New Category</h2></div>
    <form method="POST" action="/categories/add">
      <div class="field-wrap">
        <label class="field-label">Category Name</label>
        <input class="field-input" name="name" placeholder="e.g. Cold Chain Logistics" required>
      </div>
      <button type="submit" class="btn-primary" style="margin-top:8px">Add Category</button>
    </form>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="card-head" style="padding:20px 24px"><h2>All Categories</h2></div>
    <table class="data-table">
      <thead><tr><th>Name</th><th>Posts</th><th>Action</th></tr></thead>
      <tbody>
        ${categories.map(c => {
          const count = posts.filter(p => p.category === c.name).length;
          return `<tr><td style="font-weight:600">${c.name}</td><td><span class="cat-tag">${count}</span></td><td><a href="/categories/delete/${encodeURIComponent(c.name)}" class="tbl-btn red" onclick="return confirm('Delete category?')">🗑️ Delete</a></td></tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
</div>
  `));
});

app.post('/categories/add', async (req, res) => {
  const db = await getDB();
  if (req.body.name) await db.query(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [req.body.name.trim()]);
  res.redirect('/categories');
});

app.get('/categories/delete/:name', async (req, res) => {
  const db = await getDB();
  await db.query(`DELETE FROM categories WHERE name = ?`, [decodeURIComponent(req.params.name)]);
  res.redirect('/categories');
});

// ── PUBLISH ALL ───────────────────────────────────────────────
app.get('/publish-all', async (req, res) => {
  const db       = await getDB();
  const posts    = await db.query(`SELECT * FROM posts WHERE status='published' ORDER BY created_at DESC`);
  const allPosts = await db.query(`SELECT * FROM posts ORDER BY created_at DESC`);

  fse.ensureDirSync('output/blog');
  if (fs.existsSync('admin/uploads')) fse.copySync('admin/uploads', 'output/assets/images/blog');
  for (const post of posts) fs.writeFileSync(`output/blog/${post.slug}.html`, genPostHTML(post, allPosts));
  fs.writeFileSync('output/blog/index.html', genIndexHTML(posts));

  res.send(shell('✅ Published!', `
<div style="max-width:560px;margin:60px auto;text-align:center">
  <div style="font-size:72px;margin-bottom:20px">🚀</div>
  <h2 style="font-size:28px;font-weight:800;color:#22c55e;margin-bottom:8px">All Done!</h2>
  <p style="color:#666;margin-bottom:32px">${posts.length} post${posts.length !== 1 ? 's' : ''} exported to <code>output/blog/</code></p>
  <div class="publish-steps">
    <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Open terminal</strong> in worldlink-blog folder</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Push to GitHub:</strong>
      <div class="code-block"><pre>git add output/ db/
git commit -m "Blog update ${new Date().toLocaleDateString()}"
git push origin main</pre></div>
    </div></div>
    <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Blog is live</strong> on GitHub Pages 🎉</div></div>
  </div>
  <div style="display:flex;gap:12px;justify-content:center;margin-top:32px">
    <a href="/" class="btn-primary">← Dashboard</a>
    <a href="/output/blog/index.html" target="_blank" class="btn-ghost">Preview Blog</a>
  </div>
</div>
  `));
});

// ── POST EDITOR ───────────────────────────────────────────────
function postEditor(categories, post) {
  const isEdit = !!post;
  return `
<div class="page-header">
  <div>
    <h1 class="page-title">${isEdit ? 'Edit Post' : 'New Post'}</h1>
    <p class="page-sub">${isEdit ? `Editing: ${post.title}` : 'Write and publish a new blog post'}</p>
  </div>
  <a href="/posts" class="btn-ghost">← Back to Posts</a>
</div>
<form method="POST" action="/posts/save" enctype="multipart/form-data" id="postForm">
  ${isEdit ? `<input type="hidden" name="id" value="${post.id}">` : ''}
  ${isEdit && post.featured_image ? `<input type="hidden" name="existingImage" value="${post.featured_image}">` : ''}
  <div class="editor-layout">
    <div class="editor-main">
      <div class="card editor-card">
        <div class="field-wrap">
          <label class="field-label">Post Title *</label>
          <input class="field-input title-input" name="title" id="titleInput" value="${isEdit ? post.title : ''}" placeholder="e.g. 5 Tips for Faster Customs Clearance in Rwanda" required>
          <div style="margin-top:8px;font-size:12px;color:#aaa">URL slug: <span id="slugPreview" style="color:#ff5e14;font-family:monospace">${isEdit ? post.slug : ''}</span></div>
        </div>
      </div>
      <div class="card editor-card">
        <label class="field-label" style="margin-bottom:12px;display:block">Content *</label>
        <div class="editor-toolbar">
          <button type="button" class="tb-btn" onclick="insertMD('**','**')"><b>B</b></button>
          <button type="button" class="tb-btn" onclick="insertMD('*','*')"><i>I</i></button>
          <button type="button" class="tb-btn" onclick="insertMD('## ','')">H2</button>
          <button type="button" class="tb-btn" onclick="insertMD('### ','')">H3</button>
          <button type="button" class="tb-btn" onclick="insertMD('- ','')">• List</button>
          <button type="button" class="tb-btn" onclick="insertMD('> ','')">❝ Quote</button>
          <button type="button" class="tb-btn" onclick="insertMD('[','](url)')">🔗 Link</button>
          <div class="tb-sep"></div>
          <button type="button" class="tb-btn" onclick="togglePreview()" id="previewBtn">👁 Preview</button>
          <span style="margin-left:auto;font-size:12px;color:#aaa" id="wordCount">0 words</span>
        </div>
        <textarea name="content" id="contentEditor" class="content-editor" placeholder="Write your blog post here...">${isEdit ? (post.content || '') : ''}</textarea>
        <div id="contentPreview" class="content-preview" style="display:none"></div>
      </div>
      <div class="card editor-card">
        <div class="seo-header">
          <div class="seo-icon">🔍</div>
          <div><h3 style="margin:0;font-size:16px;font-weight:700">SEO Manager</h3><p style="margin:0;font-size:13px;color:#888">Optimise how Google shows this post</p></div>
        </div>
        <div class="google-preview">
          <div class="gp-label">Google Preview</div>
          <div class="gp-box">
            <div class="gp-title" id="gpTitle">${isEdit && post.seo_title ? post.seo_title : isEdit ? post.title : 'Your SEO Title Will Appear Here'}</div>
            <div class="gp-url">worldlinksupplychain.com › blog › <span id="gpSlug">${isEdit ? post.slug : 'your-post-slug'}</span></div>
            <div class="gp-desc" id="gpDesc">${isEdit && post.seo_description ? post.seo_description : 'Your meta description will appear here.'}</div>
          </div>
        </div>
        <div class="seo-fields">
          <div class="field-wrap">
            <label class="field-label">SEO Title <span class="char-badge" id="seoTitleBadge">0/60</span></label>
            <input class="field-input" name="seoTitle" id="seoTitle" value="${isEdit ? (post.seo_title || '') : ''}" placeholder="Leave blank to use post title" maxlength="60">
            <div class="seo-bar"><div class="seo-bar-fill" id="seoTitleBar"></div></div>
          </div>
          <div class="field-wrap">
            <label class="field-label">Meta Description <span class="char-badge" id="seoDescBadge">0/160</span></label>
            <textarea class="field-input" name="seoDescription" id="seoDesc" rows="3" maxlength="160" placeholder="Brief summary shown in Google results">${isEdit ? (post.seo_description || '') : ''}</textarea>
            <div class="seo-bar"><div class="seo-bar-fill" id="seoDescBar"></div></div>
          </div>
          <div class="field-wrap">
            <label class="field-label">Tags <span style="color:#aaa;font-weight:400">(comma separated)</span></label>
            <input class="field-input" name="tags" value="${isEdit ? (post.tags || '') : ''}" placeholder="e.g. freight, logistics, Rwanda, customs clearance">
          </div>
        </div>
      </div>
    </div>
    <div class="editor-sidebar">
      <div class="card editor-card">
        <h3 class="sidebar-section-title">📤 Publish</h3>
        <div class="field-wrap">
          <label class="field-label">Status</label>
          <select class="field-input" name="status" id="statusSelect">
            <option value="draft" ${isEdit && post.status === 'draft' ? 'selected' : ''}>📝 Draft</option>
            <option value="published" ${isEdit && post.status === 'published' ? 'selected' : ''}>✅ Published</option>
          </select>
        </div>
        <button type="submit" class="btn-primary btn-full">💾 Save Post</button>
        <button type="submit" class="btn-publish btn-full" style="margin-top:8px" onclick="document.getElementById('statusSelect').value='published'">🚀 Save & Publish</button>
      </div>
      <div class="card editor-card">
        <h3 class="sidebar-section-title">🏷️ Category</h3>
        <div class="field-wrap">
          <select class="field-input" name="category" id="catSelect" required>
            <option value="">-- Select Category --</option>
            ${categories.map(c => `<option value="${c.name}" ${isEdit && post.category === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <a href="/categories" style="font-size:12px;color:#ff5e14;text-decoration:none">+ Add new category</a>
      </div>
      <div class="card editor-card">
        <h3 class="sidebar-section-title">🖼️ Featured Image</h3>
        <div class="img-upload-area" id="imgUploadArea" onclick="document.getElementById('imgInput').click()">
          ${isEdit && post.featured_image
            ? `<img src="${post.featured_image}" style="width:100%;height:160px;object-fit:cover;border-radius:8px">`
            : `<div id="imgPlaceholder" style="text-align:center"><div style="font-size:36px;margin-bottom:8px">🖼️</div><div style="font-size:14px;font-weight:600;color:#555">Click to upload</div><div style="font-size:12px;color:#aaa;margin-top:4px">JPG, PNG, WebP — Max 5MB</div></div>`}
        </div>
        <input type="file" name="featuredImage" id="imgInput" accept="image/*" style="display:none">
      </div>
      <div class="card editor-card">
        <h3 class="sidebar-section-title">📊 SEO Score</h3>
        <div style="text-align:center">
          <div class="seo-score-circle">
            <svg viewBox="0 0 36 36" class="score-ring">
              <path d="M18 2.0845 a15.9155 15.9155 0 0 1 0 31.831 a15.9155 15.9155 0 0 1 0-31.831" fill="none" stroke="#e5e7eb" stroke-width="3"/>
              <path id="scoreArc" d="M18 2.0845 a15.9155 15.9155 0 0 1 0 31.831 a15.9155 15.9155 0 0 1 0-31.831" fill="none" stroke="#22c55e" stroke-width="3" stroke-dasharray="0,100"/>
            </svg>
            <div class="score-num" id="seoScoreNum">0</div>
          </div>
          <div class="seo-checks">
            <div class="seo-check" id="chk-title">⬜ SEO title set</div>
            <div class="seo-check" id="chk-desc">⬜ Meta description</div>
            <div class="seo-check" id="chk-tags">⬜ Tags added</div>
            <div class="seo-check" id="chk-img">⬜ Featured image</div>
            <div class="seo-check" id="chk-len">⬜ 300+ words</div>
            <div class="seo-check" id="chk-cat">⬜ Category selected</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</form>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.2/marked.min.js"></script>
<script>
function makeSlug(str){return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
document.getElementById('titleInput').addEventListener('input',function(){
  const slug=makeSlug(this.value);
  document.getElementById('slugPreview').textContent=slug;
  document.getElementById('gpSlug').textContent=slug;
  if(!document.getElementById('seoTitle').value) document.getElementById('gpTitle').textContent=this.value||'Your SEO Title Will Appear Here';
});
document.getElementById('seoTitle').addEventListener('input',function(){
  const len=this.value.length;
  document.getElementById('seoTitleBadge').textContent=len+'/60';
  document.getElementById('seoTitleBar').style.width=(len/60*100)+'%';
  document.getElementById('seoTitleBar').style.background=len>50?'#ef4444':'#22c55e';
  document.getElementById('gpTitle').textContent=this.value||document.getElementById('titleInput').value||'Your SEO Title Will Appear Here';
  updateScore();
});
document.getElementById('seoDesc').addEventListener('input',function(){
  const len=this.value.length;
  document.getElementById('seoDescBadge').textContent=len+'/160';
  document.getElementById('seoDescBar').style.width=(len/160*100)+'%';
  document.getElementById('seoDescBar').style.background=len>140?'#ef4444':'#22c55e';
  document.getElementById('gpDesc').textContent=this.value||'Your meta description will appear here.';
  updateScore();
});
const editor=document.getElementById('contentEditor');
editor.addEventListener('input',function(){
  const words=this.value.trim().split(/\s+/).filter(Boolean).length;
  document.getElementById('wordCount').textContent=words+' words';
  updateScore();
});
function insertMD(before,after){
  const start=editor.selectionStart,end=editor.selectionEnd;
  const selected=editor.value.substring(start,end);
  editor.value=editor.value.substring(0,start)+before+selected+after+editor.value.substring(end);
  editor.focus();
  editor.setSelectionRange(start+before.length,end+before.length+selected.length);
  editor.dispatchEvent(new Event('input'));
}
let previewOn=false;
function togglePreview(){
  previewOn=!previewOn;
  editor.style.display=previewOn?'none':'block';
  const prev=document.getElementById('contentPreview');
  prev.style.display=previewOn?'block':'none';
  if(previewOn&&typeof marked!=='undefined') prev.innerHTML=marked.parse(editor.value);
  document.getElementById('previewBtn').textContent=previewOn?'✏️ Edit':'👁 Preview';
}
document.getElementById('imgInput').addEventListener('change',function(){
  if(this.files&&this.files[0]){
    const reader=new FileReader();
    reader.onload=e=>{document.getElementById('imgUploadArea').innerHTML='<img src="'+e.target.result+'" style="width:100%;height:160px;object-fit:cover;border-radius:8px">';};
    reader.readAsDataURL(this.files[0]);
    updateScore();
  }
});
document.getElementById('catSelect').addEventListener('change',updateScore);
function updateScore(){
  const checks={
    'chk-title':!!document.getElementById('seoTitle').value.trim(),
    'chk-desc':!!document.getElementById('seoDesc').value.trim(),
    'chk-tags':!!document.querySelector('[name="tags"]').value.trim(),
    'chk-img':!!(document.getElementById('imgInput').files.length${isEdit && post && post.featured_image ? '||true' : ''}),
    'chk-len':editor.value.trim().split(/\s+/).filter(Boolean).length>=300,
    'chk-cat':!!document.getElementById('catSelect').value,
  };
  const labels={'chk-title':'SEO title set','chk-desc':'Meta description','chk-tags':'Tags added','chk-img':'Featured image','chk-len':'300+ words','chk-cat':'Category selected'};
  let score=0;
  Object.keys(checks).forEach(k=>{
    const ok=checks[k];if(ok)score++;
    const el=document.getElementById(k);
    if(el)el.textContent=(ok?'✅ ':'⬜ ')+labels[k];
  });
  const pct=Math.round(score/6*100);
  document.getElementById('seoScoreNum').textContent=pct;
  const color=pct>=80?'#22c55e':pct>=50?'#f59e0b':'#ef4444';
  document.getElementById('scoreArc').style.stroke=color;
  document.getElementById('scoreArc').setAttribute('stroke-dasharray',pct+', 100');
  document.getElementById('seoScoreNum').style.color=color;
}
['seoTitle','seoDesc'].forEach(id=>document.getElementById(id).dispatchEvent(new Event('input')));
editor.dispatchEvent(new Event('input'));
updateScore();
</script>`;
}

// ── STATIC GENERATORS ─────────────────────────────────────────
function genPostHTML(post, allPosts) {
  const contentHTML = marked(post.content || '');
  const related = allPosts.filter(p => p.status === 'published' && p.id !== post.id && p.category === post.category).slice(0, 3);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${post.seo_title || post.title} | WorldLink Supply Chain</title>
<meta name="description" content="${(post.seo_description || '').replace(/"/g,'&quot;')}">
<meta property="og:title" content="${(post.seo_title || post.title).replace(/"/g,'&quot;')}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://worldlinksupplychain.com/blog/${post.slug}.html">
<link rel="stylesheet" href="../assets/css/bootstrap.min.css">
<link rel="stylesheet" href="../assets/css/style.css">
<link rel="stylesheet" href="../assets/css/responsive.css">
<style>
.post-hero{background:linear-gradient(135deg,#0a1027 0%,#0f1c3f 100%);padding:80px 0 60px;color:#fff}
.cat-badge{background:#ff5e14;color:#fff;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600;display:inline-block;margin-bottom:16px}
.post-hero h1{font-size:clamp(26px,5vw,46px);font-weight:800;line-height:1.2;margin-bottom:16px}
.post-hero .meta{color:rgba(255,255,255,.65);font-size:14px}
.post-body{padding:60px 0}
.featured{width:100%;max-height:480px;object-fit:cover;border-radius:12px;margin-bottom:40px}
.blog-content{font-size:17px;line-height:1.85;color:#333}
.blog-content h2{font-size:26px;font-weight:700;margin:36px 0 16px;color:#0a1027}
.blog-content h3{font-size:21px;font-weight:600;margin:28px 0 12px}
.blog-content p{margin-bottom:20px}
.blog-content ul,.blog-content ol{padding-left:24px;margin-bottom:20px}
.blog-content blockquote{border-left:4px solid #ff5e14;padding:16px 24px;background:#fff8f5;margin:28px 0;border-radius:0 8px 8px 0;font-style:italic;color:#555}
.tag{display:inline-block;background:#f0f4ff;color:#3b52a0;padding:4px 12px;border-radius:20px;font-size:13px;margin:4px}
.share-box{background:#0a1027;color:#fff;padding:32px;border-radius:12px;margin-top:40px;text-align:center}
.share-btn{display:inline-block;padding:10px 22px;border-radius:6px;font-weight:600;text-decoration:none;margin:6px;color:#fff}
</style></head><body>
<section class="post-hero"><div class="container">
  <span class="cat-badge">${post.category || 'Logistics'}</span>
  <h1>${post.title}</h1>
  <div class="meta">By <strong>WorldLink Supply Chain</strong> &nbsp;•&nbsp; ${new Date(post.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}${post.tags?' &nbsp;•&nbsp; '+post.tags:''}</div>
</div></section>
<section class="post-body"><div class="container"><div class="row justify-content-center"><div class="col-lg-8">
  ${post.featured_image?`<img class="featured" src="${post.featured_image}" alt="${post.title}">`:''}
  <div class="blog-content">${contentHTML}</div>
  ${post.tags?`<div style="margin-top:40px;padding-top:24px;border-top:1px solid #eee"><strong>Tags: </strong>${post.tags.split(',').map(t=>`<span class="tag">${t.trim()}</span>`).join('')}</div>`:''}
  <div class="share-box">
    <h4 style="margin-bottom:16px">Share this article</h4>
    <a class="share-btn" style="background:#1877f2" href="https://facebook.com/sharer/sharer.php?u=https://worldlinksupplychain.com/blog/${post.slug}.html" target="_blank">Facebook</a>
    <a class="share-btn" style="background:#1da1f2" href="https://twitter.com/intent/tweet?url=https://worldlinksupplychain.com/blog/${post.slug}.html" target="_blank">Twitter</a>
    <a class="share-btn" style="background:#0a66c2" href="https://linkedin.com/sharing/share-offsite/?url=https://worldlinksupplychain.com/blog/${post.slug}.html" target="_blank">LinkedIn</a>
    <a class="share-btn" style="background:#25d366" href="https://api.whatsapp.com/send?text=${encodeURIComponent(post.title+' https://worldlinksupplychain.com/blog/'+post.slug+'.html')}" target="_blank">WhatsApp</a>
  </div>
</div></div></div></section>
<script src="../assets/js/bootstrap.min.js"></script>
</body></html>`;
}

function genIndexHTML(posts) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blog | WorldLink Supply Chain</title>
<meta name="description" content="Latest news and insights from WorldLink Supply Chain Ltd.">
<link rel="stylesheet" href="../assets/css/bootstrap.min.css">
<link rel="stylesheet" href="../assets/css/style.css">
<link rel="stylesheet" href="../assets/css/responsive.css">
<style>
.blog-hero{background:linear-gradient(135deg,#0a1027 0%,#0f1c3f 100%);padding:80px 0;color:#fff;text-align:center}
.blog-hero h1{font-size:clamp(32px,5vw,48px);font-weight:800;margin-bottom:16px}
.blog-grid{padding:60px 0}
.blog-card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08);margin-bottom:32px;transition:transform .3s}
.blog-card:hover{transform:translateY(-6px)}
.blog-card img{width:100%;height:220px;object-fit:cover}
.no-img{background:linear-gradient(135deg,#ff5e14,#c94200);height:220px;display:flex;align-items:center;justify-content:center;font-size:48px}
.blog-card-body{padding:24px}
.cat{color:#ff5e14;font-size:12px;font-weight:700;text-transform:uppercase;margin-bottom:8px}
.blog-card-body h3{font-size:20px;font-weight:700;margin-bottom:12px}
.blog-card-body h3 a{color:#0a1027;text-decoration:none}
.blog-card-body h3 a:hover{color:#ff5e14}
.blog-card-body p{color:#666;font-size:15px;margin-bottom:16px}
.read-more{color:#ff5e14;font-weight:600;text-decoration:none}
</style></head><body>
<section class="blog-hero"><div class="container"><h1>Latest News & Insights</h1><p style="color:rgba(255,255,255,.7);font-size:18px;max-width:600px;margin:0 auto">Stay updated with the latest in logistics and supply chain across East Africa.</p></div></section>
<section class="blog-grid"><div class="container"><div class="row">
  ${posts.map(p=>`
  <div class="col-lg-4 col-md-6">
    <div class="blog-card">
      ${p.featured_image?`<img src="${p.featured_image}" alt="${p.title}">`:'<div class="no-img">📦</div>'}
      <div class="blog-card-body">
        <div class="cat">${p.category||'Logistics'}</div>
        <h3><a href="${p.slug}.html">${p.title}</a></h3>
        <p>${p.seo_description||''}</p>
        <div style="color:#999;font-size:13px;margin-bottom:12px">${new Date(p.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
        <a class="read-more" href="${p.slug}.html">Read More →</a>
      </div>
    </div>
  </div>`).join('')}
</div></div></section>
<script src="../assets/js/bootstrap.min.js"></script>
</body></html>`;
}

// ── LAYOUT SHELL ──────────────────────────────────────────────
function shell(title, content) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — WorldLink Blog Admin</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f7;color:#1a1a2e;display:flex;min-height:100vh}
.sidebar{width:248px;background:#0d1117;flex-shrink:0;position:fixed;top:0;left:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column;z-index:100}
.sidebar-brand{padding:20px;border-bottom:1px solid rgba(255,255,255,.08)}
.brand-name{color:#fff;font-size:17px;font-weight:800}
.brand-sub{color:rgba(255,255,255,.4);font-size:11px;margin-top:2px}
.nav-section{padding:16px 16px 6px;color:rgba(255,255,255,.3);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}
.sidebar a{display:flex;align-items:center;gap:10px;padding:10px 16px;color:rgba(255,255,255,.65);text-decoration:none;font-size:13.5px;font-weight:500;border-radius:8px;margin:1px 8px;transition:all .15s}
.sidebar a:hover{background:rgba(255,255,255,.07);color:#fff}
.sidebar-footer{padding:16px;border-top:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.3);font-size:11px;line-height:1.5}
.main{margin-left:248px;flex:1;display:flex;flex-direction:column}
.topbar{background:#fff;height:64px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e8eaf0;position:sticky;top:0;z-index:50}
.topbar-title{font-size:17px;font-weight:700;color:#0d1117}
.topbar-right{display:flex;align-items:center;gap:12px}
.avatar{width:38px;height:38px;background:linear-gradient(135deg,#ff5e14,#c94200);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px}
.content{padding:28px;flex:1}
.page-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:16px}
.page-title{font-size:22px;font-weight:800;color:#0d1117}
.page-sub{font-size:13px;color:#888;margin-top:3px}
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.stat-box{background:#fff;border-radius:12px;padding:18px 20px;display:flex;align-items:center;gap:14px;border-left:4px solid var(--accent);box-shadow:0 1px 6px rgba(0,0,0,.05)}
.stat-icon{font-size:26px}.stat-num{font-size:26px;font-weight:800;color:#0d1117;line-height:1}.stat-lbl{font-size:12px;color:#888;margin-top:2px}
.grid-2col{display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.card-head h2{font-size:15px;font-weight:700}
.link-btn{font-size:13px;color:#ff5e14;text-decoration:none;font-weight:500}
.post-list{display:flex;flex-direction:column}
.post-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f2f5}
.post-row:last-child{border-bottom:none}
.post-thumb{flex-shrink:0;width:44px;height:44px;border-radius:8px;overflow:hidden;background:#f0f2f5;display:flex;align-items:center;justify-content:center;font-size:18px}
.post-thumb img{width:100%;height:100%;object-fit:cover}
.post-meta{flex:1;min-width:0}
.post-title-sm{font-size:14px;font-weight:600;color:#0d1117;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.post-details{display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap}
.cat-tag{background:#f0f4ff;color:#3b52a0;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
.status-dot{font-size:11px;font-weight:600;text-transform:capitalize}
.status-dot.published{color:#22c55e}.status-dot.draft{color:#f59e0b}
.post-date{font-size:11px;color:#aaa}
.post-actions{display:flex;gap:4px;flex-shrink:0}
.icon-btn{padding:5px 8px;border-radius:6px;text-decoration:none;font-size:14px;background:#f5f5f5;transition:background .15s}
.icon-btn:hover{background:#e5e7eb}.icon-btn.danger:hover{background:#fee2e2}
.qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qa-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 10px;border-radius:10px;text-decoration:none;font-size:12px;font-weight:700;transition:all .2s;text-transform:uppercase;letter-spacing:.5px}
.qa-btn:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.12)}
.qa-icon{font-size:22px}
.qa-btn.orange{background:#fff5f0;color:#ff5e14}.qa-btn.blue{background:#eff6ff;color:#2563eb}
.qa-btn.purple{background:#f5f3ff;color:#7c3aed}.qa-btn.green{background:#f0fdf4;color:#16a34a}
.cat-list{display:flex;flex-direction:column}
.cat-item{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f2f5;font-size:13px}
.cat-item:last-child{border-bottom:none}
.cat-count{background:#f0f2f5;color:#666;padding:2px 8px;border-radius:10px;font-size:11px}
.tip-card p{font-size:13px;color:#555;line-height:1.65}
.filter-bar{background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.filter-input,.filter-select{padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:13.5px;background:#fff}
.filter-input{flex:1;min-width:180px}
.data-table{width:100%;border-collapse:collapse}
.data-table thead{background:#f8f9ff}
.data-table th{padding:12px 16px;text-align:left;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e8eaf0}
.data-table td{padding:14px 16px;border-bottom:1px solid #f0f2f5;font-size:14px;vertical-align:middle}
.data-table tr:last-child td{border-bottom:none}
.data-table tr:hover td{background:#fafbff}
.status-badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase}
.status-badge.published{background:#dcfce7;color:#16a34a}.status-badge.draft{background:#fef3c7;color:#d97706}
.tbl-btn{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;display:inline-block}
.tbl-btn.blue{background:#eff6ff;color:#2563eb}.tbl-btn.blue:hover{background:#dbeafe}
.tbl-btn.red{background:#fee2e2;color:#dc2626}.tbl-btn.red:hover{background:#fecaca}
.empty-cell{text-align:center;padding:48px;color:#888}
.btn-primary{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#ff5e14;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;transition:background .15s}
.btn-primary:hover{background:#e0530f;color:#fff}
.btn-ghost{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:#f0f2f5;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .15s}
.btn-ghost:hover{background:#e5e7eb}
.btn-publish{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 20px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer;transition:background .15s}
.btn-publish:hover{background:#16a34a}
.btn-full{width:100%;justify-content:center}
.editor-layout{display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start}
.editor-main,.editor-sidebar{display:flex;flex-direction:column;gap:16px}
.editor-card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.title-input{font-size:18px;font-weight:600;padding:12px 14px;width:100%;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit}
.title-input:focus{outline:none;border-color:#ff5e14;box-shadow:0 0 0 3px rgba(255,94,20,.1)}
.editor-toolbar{display:flex;align-items:center;gap:4px;padding:8px 10px;background:#f8f9ff;border-radius:8px 8px 0 0;border:1px solid #e5e7eb;border-bottom:none;flex-wrap:wrap}
.tb-btn{padding:5px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:pointer;transition:all .15s;font-family:inherit}
.tb-btn:hover{background:#f0f2f5}
.tb-sep{width:1px;height:20px;background:#e5e7eb;margin:0 4px}
.content-editor{width:100%;min-height:380px;padding:16px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;font-size:15px;font-family:'Courier New',monospace;line-height:1.8;resize:vertical;color:#333}
.content-editor:focus{outline:none;border-color:#ff5e14}
.content-preview{min-height:380px;padding:16px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;font-size:15px;line-height:1.8;color:#333;background:#fafbff}
.content-preview h2{font-size:22px;font-weight:700;margin:24px 0 12px}
.content-preview h3{font-size:18px;font-weight:600;margin:18px 0 8px}
.content-preview p{margin-bottom:14px}
.content-preview ul,.content-preview ol{padding-left:20px;margin-bottom:14px}
.content-preview blockquote{border-left:3px solid #ff5e14;padding:10px 16px;background:#fff8f5;margin:16px 0;border-radius:0 6px 6px 0;color:#555;font-style:italic}
.seo-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0f2f5}
.seo-icon{width:40px;height:40px;background:#f0f9ff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.google-preview{background:#f8f9ff;border-radius:10px;padding:16px;margin-bottom:20px}
.gp-label{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.gp-title{font-size:17px;color:#1a0dab;margin-bottom:2px}
.gp-url{font-size:13px;color:#006621;margin-bottom:4px}
.gp-desc{font-size:13px;color:#545454;line-height:1.55}
.seo-fields{display:flex;flex-direction:column;gap:14px}
.char-badge{background:#f0f2f5;color:#666;padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px;font-weight:400}
.seo-bar{height:3px;background:#e5e7eb;border-radius:2px;margin-top:4px}
.seo-bar-fill{height:100%;border-radius:2px;background:#22c55e;width:0;transition:width .3s,background .3s}
.field-wrap{margin-bottom:12px}
.field-label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
.field-input{width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;transition:border-color .15s}
.field-input:focus{outline:none;border-color:#ff5e14;box-shadow:0 0 0 3px rgba(255,94,20,.08)}
.sidebar-section-title{font-size:14px;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f0f2f5;color:#0d1117}
.img-upload-area{border:2px dashed #e5e7eb;border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:border-color .15s;min-height:110px;display:flex;align-items:center;justify-content:center}
.img-upload-area:hover{border-color:#ff5e14;background:#fff8f5}
.seo-score-circle{position:relative;width:80px;height:80px;margin:0 auto 16px}
.score-ring{transform:rotate(-90deg)}
.score-num{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;font-weight:800}
.seo-checks{display:flex;flex-direction:column;gap:6px;text-align:left}
.seo-check{font-size:12px;color:#555;padding:4px 0;border-bottom:1px solid #f5f5f5}
.publish-steps{display:flex;flex-direction:column;gap:16px;text-align:left;margin-top:24px}
.step{display:flex;align-items:flex-start;gap:14px}
.step-num{width:28px;height:28px;background:#ff5e14;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;margin-top:2px}
.step-body{font-size:14px;color:#444;flex:1}
.code-block{background:#0d1117;border-radius:8px;padding:14px;margin-top:10px}
.code-block pre{color:#22d3ee;font-size:13px;font-family:'Courier New',monospace;white-space:pre-wrap}
.empty-state{padding:24px;text-align:center;color:#888;font-size:14px}
.empty-state a{color:#ff5e14;text-decoration:none}
.side-col{display:flex;flex-direction:column;gap:16px}
@media(max-width:1100px){.stats-row{grid-template-columns:repeat(2,1fr)}.grid-2col{grid-template-columns:1fr}.editor-layout{grid-template-columns:1fr}}
</style></head><body>
<aside class="sidebar">
  <div class="sidebar-brand"><div class="brand-name">WorldLink Blog</div><div class="brand-sub">Admin Dashboard</div></div>
  <nav>
    <div class="nav-section">Overview</div>
    <a href="/"><span>📊</span> Dashboard</a>
    <div class="nav-section">Content</div>
    <a href="/posts/new"><span>✍️</span> New Post</a>
    <a href="/posts"><span>📰</span> All Posts</a>
    <a href="/categories"><span>🏷️</span> Categories</a>
    <div class="nav-section">Publishing</div>
    <a href="/publish-all"><span>🚀</span> Generate & Publish</a>
    <a href="/output/blog/index.html" target="_blank"><span>👁</span> Preview Blog</a>
  </nav>
  <div class="sidebar-footer">WorldLink Supply Chain Ltd<br>Blog System v2.0</div>
</aside>
<div class="main">
  <div class="topbar">
    <div class="topbar-title">${title}</div>
    <div class="topbar-right">
      <a href="/posts/new" class="btn-primary">+ New Post</a>
      <div class="avatar">W</div>
    </div>
  </div>
  <div class="content">${content}</div>
</div>
</body></html>`;
}

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   WorldLink Blog Admin is running!           ║');
  console.log('║   Open: http://localhost:3000                ║');
  console.log('╚══════════════════════════════════════════════╝\n');
});