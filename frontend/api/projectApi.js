const BASE = "/api/projects";

export async function getProjects({ search = "", category = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  params.set("page", page);
  const res = await fetch(`${BASE}?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch projects");
  return data;
}

export async function getProject(id) {
  const res = await fetch(`${BASE}/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Project not found");
  return data;
}

export async function createProject(payload, token) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to create project");
  return data;
}

export async function updateProject(id, payload, token) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update project");
  return data;
}

export async function deleteProject(id, token) {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to delete project");
  return data;
}

export async function getBidsForProject(id, token) {
  const res = await fetch(`${BASE}/${id}/bids`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch bids");
  return data;
}

export async function placeBid(projectId, payload, token) {
  const res = await fetch(`${BASE}/${projectId}/bids`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to place bid");
  return data;
}
