// Utility to load JSON content files

export async function loadContent<T>(filename: string): Promise<T> {
  const response = await fetch(`/content/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load content: ${filename}`);
  }
  return response.json();
}

// Cache for loaded content
const contentCache = new Map<string, unknown>();

export async function loadContentCached<T>(filename: string): Promise<T> {
  if (contentCache.has(filename)) {
    return contentCache.get(filename) as T;
  }
  const content = await loadContent<T>(filename);
  contentCache.set(filename, content);
  return content;
}
