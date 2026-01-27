import { cookies } from "next/headers";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || "http://backend:8000";

export async function fetchServerApi(path, options = {}) {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  const headers = {
    ...(options.headers || {}),
    cookie
  };

  return fetch(`${API_INTERNAL_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store"
  });
}
