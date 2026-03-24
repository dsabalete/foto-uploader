import { buildClearAuthCookie } from "./_auth.mjs";

export const config = {
  path: "/api/auth/logout"
};

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildClearAuthCookie()
    }
  });
}
