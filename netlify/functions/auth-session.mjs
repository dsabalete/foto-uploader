import { getSessionFromRequest } from "./_auth.mjs";

export const config = {
  path: "/api/auth/session"
};

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(
    JSON.stringify({
      authenticated: getSessionFromRequest(request)
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
