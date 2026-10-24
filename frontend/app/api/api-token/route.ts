// Hands the browser a short-lived token that proves to the Express backend
// who is signed in. The backend never trusts a userId sent by the browser;
// it only trusts the user id inside this signed token.
//
// API_AUTH_SECRET must match the backend's value and must NOT have the
// NEXT_PUBLIC_ prefix, so it stays on the server and never reaches the browser.

import { SignJWT } from "jose";
import { auth } from "@/auth";

const TOKEN_ISSUER = "interview-prep-web";
const TOKEN_AUDIENCE = "interview-prep-api";
const TOKEN_LIFETIME = "5m";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const secret = process.env.API_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    console.error("API_AUTH_SECRET is missing or shorter than 32 characters.");
    return Response.json(
      { error: true, message: "Sign-in is not configured on the server." },
      { status: 500, headers: NO_STORE }
    );
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return Response.json(
      { error: true, message: "You are signed out. Please sign in again." },
      { status: 401, headers: NO_STORE }
    );
  }

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(new TextEncoder().encode(secret));

  return Response.json({ token }, { headers: NO_STORE });
}
