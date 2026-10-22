export async function downloadAttachment(event, url, name, token) {
  if (!url.startsWith("/api/uploads/files/")) return;
  event.preventDefault();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Attachment is unavailable or access was denied.");
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl; link.download = name || "attachment"; link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
