import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { getAgentWorkspace } from "@/lib/agent-workspaces";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const workspace = getAgentWorkspace(slug);
  if (!workspace) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const wfDir = path.join(workspace, "workflows");
  try {
    const files = await readdir(wfDir);
    const lobsterFiles = files.filter(f => f.endsWith(".lobster"));
    const workflows = await Promise.all(
      lobsterFiles.map(async (filename) => {
        const content = await readFile(path.join(wfDir, filename), "utf-8");
        const nameLine = content.match(/^name:\s*(.+)/m);
        const descLine = content.match(/^description:\s*(.+)/m);
        return {
          filename,
          name: nameLine?.[1]?.trim() || filename.replace(".lobster", ""),
          description: descLine?.[1]?.trim() || "",
        };
      })
    );
    return NextResponse.json({ workflows });
  } catch {
    return NextResponse.json({ workflows: [] });
  }
}
