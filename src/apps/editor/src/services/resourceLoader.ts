export async function loadResourceLevel(path: string, baseUrl: string = "http://localhost:4000"): Promise<string> {
  const url = `${baseUrl}/api/resources/content?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load resource ${path}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

export const DEFAULT_LEVEL_PATH = "levels/grasslands.json";

export async function saveResourceLevel(path: string, content: string, baseUrl: string = "http://localhost:4000"): Promise<void> {
  const url = `${baseUrl}/api/resources/content?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save resource ${path}: ${res.status} ${res.statusText}`);
  }
}