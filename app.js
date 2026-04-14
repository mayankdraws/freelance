const STORAGE_KEY = "lwf_data_v1";
const REVIEW_REMINDER_MS = 24 * 60 * 60 * 1000;

const defaultData = { projects: [] };
let data = loadData();
let selectedProjectId = null;

const state = {
  shareToken: new URLSearchParams(window.location.search).get("share"),
  isViewOnly: false
};

const refs = {
  modeBadge: document.getElementById("modeBadge"),
  newProjectForm: document.getElementById("newProjectForm"),
  projectNameInput: document.getElementById("projectNameInput"),
  projectList: document.getElementById("projectList"),
  fileInput: document.getElementById("fileInput"),
  lockHint: document.getElementById("lockHint"),
  versionList: document.getElementById("versionList"),
  createShareLinkBtn: document.getElementById("createShareLinkBtn"),
  shareLinkOutput: document.getElementById("shareLinkOutput"),
  projectTitle: document.getElementById("projectTitle"),
  statusBadge: document.getElementById("statusBadge"),
  reminderBanner: document.getElementById("reminderBanner"),
  sendReminderBtn: document.getElementById("sendReminderBtn"),
  canvasWrapper: document.getElementById("canvasWrapper"),
  emptyState: document.getElementById("emptyState"),
  designImage: document.getElementById("designImage"),
  pinLayer: document.getElementById("pinLayer"),
  toReviewBtn: document.getElementById("toReviewBtn"),
  approveBtn: document.getElementById("approveBtn"),
  changeRequestInput: document.getElementById("changeRequestInput"),
  requestChangesBtn: document.getElementById("requestChangesBtn"),
  approvalProof: document.getElementById("approvalProof"),
  commentList: document.getElementById("commentList"),
  timelineList: document.getElementById("timelineList"),
  workspacePanel: document.getElementById("workspacePanel")
};

wireEvents();
hydrateMode();
render();

function wireEvents() {
  refs.newProjectForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.isViewOnly) return;
    const name = refs.projectNameInput.value.trim();
    if (!name) return;

    const id = uid();
    const project = {
      id,
      name,
      status: "Draft",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      currentVersionId: null,
      approval: null,
      files: [],
      comments: [],
      reviewRequests: [],
      shareLinks: [],
      activity: []
    };
    addActivity(project, "project_created", `Project created: ${name}`);
    data.projects.unshift(project);
    selectedProjectId = id;
    refs.projectNameInput.value = "";
    persist();
    render();
  });

  refs.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const project = currentProject();
    if (!project || !canEdit(project)) return;

    const content = await fileToDataURL(file);
    const versionNumber = project.files.length + 1;
    const fileVersion = {
      id: uid(),
      version: versionNumber,
      name: file.name,
      mimeType: file.type,
      content,
      createdAt: nowISO()
    };
    project.files.push(fileVersion);
    project.currentVersionId = fileVersion.id;
    project.updatedAt = nowISO();
    addActivity(project, "file_uploaded", `Version v${versionNumber} uploaded (${file.name})`, { version: versionNumber });
    refs.fileInput.value = "";
    persist();
    render();
  });

  refs.createShareLinkBtn.addEventListener("click", () => {
    const project = currentProject();
    if (!project || state.isViewOnly) return;

    const token = uid();
    const record = { token, createdAt: nowISO(), mode: "view" };
    project.shareLinks.push(record);
    addActivity(project, "share_link_created", "Public view-only share link created");

    const link = `${window.location.origin}${window.location.pathname}?share=${token}`;
    refs.shareLinkOutput.value = link;
    persist();
    render();
  });

  refs.toReviewBtn.addEventListener("click", () => {
    const project = currentProject();
    if (!project || !canEdit(project)) return;
    project.status = "Review";
    project.updatedAt = nowISO();
    project.reviewRequests.push({ id: uid(), type: "review_requested", at: nowISO(), message: "Ready for review" });
    addActivity(project, "review_requested", "Moved to Review");
    persist();
    render();
  });

  refs.requestChangesBtn.addEventListener("click", () => {
    const project = currentProject();
    if (!project || !canEdit(project)) return;
    if (project.status !== "Review") return;

    const prompt = refs.changeRequestInput.value.trim();
    if (!prompt) {
      alert("Please describe what should change.");
      return;
    }
    project.status = "Draft";
    project.approval = null;
    project.updatedAt = nowISO();
    project.reviewRequests.push({ id: uid(), type: "changes_requested", at: nowISO(), message: prompt });
    addActivity(project, "changes_requested", `Changes requested: ${prompt}`);
    refs.changeRequestInput.value = "";
    persist();
    render();
  });

  refs.approveBtn.addEventListener("click", () => {
    const project = currentProject();
    if (!project || !canEdit(project)) return;
    if (project.status !== "Review") return;
    const version = currentVersion(project);
    if (!version) {
      alert("Upload a file before approving.");
      return;
    }

    project.status = "Approved";
    project.approval = {
      approvedAt: nowISO(),
      version: version.version
    };
    project.updatedAt = nowISO();
    addActivity(project, "approved", `Approved version v${version.version}`, { version: version.version });
    persist();
    render();
  });

  refs.sendReminderBtn.addEventListener("click", () => {
    const project = currentProject();
    if (!project || state.isViewOnly) return;
    if (project.status !== "Review") return;

    addActivity(project, "review_reminder", "Feedback reminder sent");
    project.updatedAt = nowISO();
    persist();
    render();
  });

  refs.pinLayer.addEventListener("click", (e) => {
    const project = currentProject();
    if (!project || !canEdit(project)) return;
    if (!currentVersion(project)) return;

    const rect = refs.pinLayer.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const text = window.prompt("Comment");
    if (!text || !text.trim()) return;

    const comment = {
      id: uid(),
      versionId: project.currentVersionId,
      x,
      y,
      text: text.trim(),
      createdAt: nowISO()
    };

    project.comments.push(comment);
    addActivity(project, "comment_added", "Contextual comment added", { version: currentVersion(project)?.version || null });
    persist();
    render();
  });

  setInterval(() => renderReminderOnly(), 30 * 1000);
}

function hydrateMode() {
  if (!state.shareToken) return;
  const project = data.projects.find((p) => p.shareLinks.some((s) => s.token === state.shareToken));
  if (!project) return;

  state.isViewOnly = true;
  selectedProjectId = project.id;
  refs.modeBadge.textContent = "View-only";
  refs.modeBadge.className = "badge review";
  refs.workspacePanel.classList.add("hidden");
}

function currentProject() {
  if (!selectedProjectId && data.projects.length) selectedProjectId = data.projects[0].id;
  return data.projects.find((p) => p.id === selectedProjectId) || null;
}

function currentVersion(project) {
  return project.files.find((f) => f.id === project.currentVersionId) || null;
}

function canEdit(project) {
  return !state.isViewOnly && project.status !== "Approved";
}

function render() {
  renderProjects();
  renderProjectView();
}

function renderProjects() {
  refs.projectList.innerHTML = "";
  for (const project of data.projects) {
    const li = document.createElement("li");
    li.className = `item${project.id === selectedProjectId ? " active" : ""}`;
    li.textContent = project.name;
    li.title = `Status: ${project.status}`;
    li.addEventListener("click", () => {
      selectedProjectId = project.id;
      render();
    });
    refs.projectList.appendChild(li);
  }
}

function renderProjectView() {
  const project = currentProject();
  if (!project) {
    refs.projectTitle.textContent = "Select a project";
    refs.statusBadge.textContent = "No status";
    refs.statusBadge.className = "badge muted";
    refs.lockHint.textContent = "";
    refs.versionList.innerHTML = "";
    refs.commentList.innerHTML = "";
    refs.timelineList.innerHTML = "";
    refs.approvalProof.textContent = "";
    refs.canvasWrapper.classList.add("empty");
    refs.designImage.style.display = "none";
    refs.emptyState.classList.remove("hidden");
    refs.pinLayer.innerHTML = "";
    return;
  }

  refs.projectTitle.textContent = project.name;
  refs.statusBadge.textContent = project.status;
  refs.statusBadge.className = `badge ${project.status.toLowerCase()}`;

  const editable = canEdit(project);
  refs.lockHint.textContent = editable ? "" : "Approved projects are locked from edits.";
  refs.fileInput.disabled = !editable;
  refs.toReviewBtn.disabled = !editable || project.status !== "Draft";
  refs.requestChangesBtn.disabled = !editable || project.status !== "Review";
  refs.approveBtn.disabled = !editable || project.status !== "Review";
  refs.changeRequestInput.disabled = !editable || project.status !== "Review";

  const versions = [...project.files].sort((a, b) => b.version - a.version);
  refs.versionList.innerHTML = versions
    .map((v) => `<li class="item">v${v.version} · ${escapeHtml(v.name)}<br><small class="muted">${formatDate(v.createdAt)}</small></li>`)
    .join("");

  const version = currentVersion(project);
  if (version) {
    refs.canvasWrapper.classList.remove("empty");
    refs.designImage.src = version.content;
    refs.designImage.style.display = "block";
    refs.emptyState.classList.add("hidden");
  } else {
    refs.canvasWrapper.classList.add("empty");
    refs.designImage.removeAttribute("src");
    refs.designImage.style.display = "none";
    refs.emptyState.classList.remove("hidden");
  }

  renderPins(project);
  renderComments(project);
  renderTimeline(project);
  renderApprovalProof(project);
  renderReminderOnly();
}

function renderPins(project) {
  refs.pinLayer.innerHTML = "";
  const comments = project.comments.filter((c) => c.versionId === project.currentVersionId);
  comments.forEach((comment, index) => {
    const pin = document.createElement("div");
    pin.className = "pin";
    pin.style.left = `${comment.x * 100}%`;
    pin.style.top = `${comment.y * 100}%`;
    pin.textContent = String(index + 1);
    pin.title = comment.text;
    refs.pinLayer.appendChild(pin);
  });
}

function renderComments(project) {
  const comments = [...project.comments]
    .filter((c) => c.versionId === project.currentVersionId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  refs.commentList.innerHTML = comments.length
    ? comments
        .map(
          (c, i) =>
            `<li class="item"><strong>#${i + 1}</strong> ${escapeHtml(c.text)}<br><small class="muted">${formatDate(c.createdAt)}</small></li>`
        )
        .join("")
    : `<li class="item muted">No comments for this version.</li>`;
}

function renderTimeline(project) {
  const events = [...project.activity].sort((a, b) => new Date(b.at) - new Date(a.at));
  refs.timelineList.innerHTML = events.length
    ? events
        .map((e) => `<li class="item">${escapeHtml(e.message)}<br><small class="muted">${formatDate(e.at)}</small></li>`)
        .join("")
    : `<li class="item muted">No activity yet.</li>`;
}

function renderApprovalProof(project) {
  if (project.approval) {
    refs.approvalProof.textContent = `Approved at ${formatDate(project.approval.approvedAt)} for version v${project.approval.version}.`;
    return;
  }
  refs.approvalProof.textContent = "No approval recorded yet.";
}

function renderReminderOnly() {
  const project = currentProject();
  if (!project || project.status !== "Review") {
    refs.reminderBanner.classList.add("hidden");
    return;
  }
  const lastActionAt = getLastReviewActionAt(project);
  const isStale = Date.now() - new Date(lastActionAt).getTime() > REVIEW_REMINDER_MS;
  refs.reminderBanner.classList.toggle("hidden", !isStale);
}

function getLastReviewActionAt(project) {
  const reviewEvents = project.activity
    .filter((e) => ["review_requested", "review_reminder", "changes_requested", "approved"].includes(e.type))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  return reviewEvents[0]?.at || project.updatedAt || project.createdAt;
}

function addActivity(project, type, message, meta = {}) {
  project.activity.push({ id: uid(), type, message, at: nowISO(), ...meta });
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultData);
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return structuredClone(defaultData);
    return parsed;
  } catch {
    return structuredClone(defaultData);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function nowISO() {
  return new Date().toISOString();
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
