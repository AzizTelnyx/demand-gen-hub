import { NextRequest, NextResponse } from "next/server";
import { getAgentWorkspace } from "@/lib/agent-workspaces";

const HOOKS_TOKEN = process.env.OPENCLAW_HOOKS_TOKEN || "gde-hooks-a2a-2026";
const HOOKS_URL = "http://localhost:18789/hooks/agent";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!getAgentWorkspace(slug)) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const { message } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const res = await fetch(HOOKS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HOOKS_TOKEN}`,
      },
      body: JSON.stringify({ agentId: slug, message }),
    });
    const data = await res.json().catch(() => ({ status: res.status }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
