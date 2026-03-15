import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { getAgentWorkspace } from "@/lib/agent-workspaces";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const workspace = getAgentWorkspace(slug);
  if (!workspace) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const filePath = path.join(workspace, "SOUL.md");
  try {
    const content = await readFile(filePath, "utf-8");
    return NextResponse.json({ content, path: filePath });
  } catch {
    return NextResponse.json({ content: "", path: filePath, exists: false });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const workspace = getAgentWorkspace(slug);
  if (!workspace) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const { content } = await request.json();
  const filePath = path.join(workspace, "SOUL.md");
  try {
    await writeFile(filePath, content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
