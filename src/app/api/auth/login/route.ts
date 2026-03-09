import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  
  // Simple shared password auth - trim any whitespace
  const validPassword = (process.env.APP_PASSWORD || "telnyx-dg-2026").trim();
  const inputPassword = (password || "").trim();
  
  if (inputPassword === validPassword) {
    // Set a simple session cookie
    const cookieStore = await cookies();
    cookieStore.set("dg-hub-session", "authenticated", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    
    return NextResponse.json({ success: true });
  }
  
  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
