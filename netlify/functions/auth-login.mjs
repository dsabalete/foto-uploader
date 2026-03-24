import { createSessionToken, buildAuthCookie } from "./_auth.mjs";

export const config = {
  path: "/api/auth/login"
};

export default async function handler(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const password = process.env.APP_PASSWORD || "";
    const secret = process.env.APP_AUTH_SECRET || "";

    if (!password || !secret) {
      return new Response(
        JSON.stringify({ error: "Faltan variables APP_PASSWORD o APP_AUTH_SECRET" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const submittedPassword = String(body.password || "");

    if (submittedPassword !== password) {
      return new Response(JSON.stringify({ error: "Contraseña incorrecta" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const token = createSessionToken();

    return new Response(JSON.stringify({ authenticated: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildAuthCookie(token)
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    return new Response(JSON.stringify({ error: "No se pudo iniciar sesión" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
