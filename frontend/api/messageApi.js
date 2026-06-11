const BASE = "/api/messages";

export async function sendMessage(projectId, content, token) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ projectId, content }),
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.message || "Failed to send message");
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function getMessages(projectId, token, page = 1, limit = 20) {
  const res = await fetch(`${BASE}/${projectId}?page=${page}&limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.message || "Failed to fetch messages");
    error.status = res.status;
    throw error;
  }
  return data; // returns { messages: [], pagination: {} }
}
