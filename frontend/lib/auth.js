import { fetchServerApi } from "./serverApi";

export async function isAuthenticated() {
  const user = await getUser();
  return Boolean(user);
}

export async function getUser() {
  try {
    const res = await fetchServerApi("/api/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch (error) {
    return null;
  }
}
