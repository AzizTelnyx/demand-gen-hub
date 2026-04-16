import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const CREDS_PATH = path.join(os.homedir(), ".config/linkedin-ads/credentials.json");

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(
      `<h2>❌ OAuth Error: ${error}</h2><p>${req.nextUrl.searchParams.get("error_description") || ""}</p>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new NextResponse("<h2>No authorization code received</h2>", {
      headers: { "Content-Type": "text/html" },
    });
  }

  try {
    const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf-8"));
    const redirectUri = `https://telnyx-dg-hub.ngrok.app/api/auth/linkedin/callback`;

    // Exchange code for token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: creds.client_id,
        client_secret: creds.client_secret,
      }).toString(),
    });

    const tokenJson = await tokenRes.json();

    if (tokenJson.access_token) {
      // Update credentials
      creds.access_token = tokenJson.access_token;
      creds.refresh_token = tokenJson.refresh_token || creds.refresh_token;
      creds.expires_in = tokenJson.expires_in;
      creds.token_obtained_at = Math.floor(Date.now() / 1000);
      creds.scopes = "r_ads,r_ads_reporting,r_organization_social,r_organization,rw_ads";

      fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));

      return new NextResponse(
        `<h2>✅ LinkedIn connected with write access!</h2>
         <p>Scopes: r_ads, r_ads_reporting, r_organization_social, r_organization, rw_ads</p>
         <p>Token expires in: ${Math.floor(tokenJson.expires_in / 86400)} days</p>
         <p>You can close this tab.</p>`,
        { headers: { "Content-Type": "text/html" } }
      );
    } else {
      return new NextResponse(
        `<h2>❌ Token exchange failed</h2><pre>${JSON.stringify(tokenJson, null, 2)}</pre>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }
  } catch (e: any) {
    return new NextResponse(`<h2>❌ Error</h2><pre>${e.message}</pre>`, {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
}
