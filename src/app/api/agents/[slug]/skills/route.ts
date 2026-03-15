import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { getAgentWorkspace } from "@/lib/agent-workspaces";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const workspace = getAgentWorkspace(slug);
  if (!workspace) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const skillsDir = path.join(workspace, "skills");
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skills = await Promise.all(
      entries.filter(e => e.isDirectory()).map(async (dir) => {
        const skillPath = path.join(skillsDir, dir.name);
        const files = await readdir(skillPath);
        const hasSkillMd = files.includes("SKILL.md");
        let description = "";
        if (hasSkillMd) {
          const md = await readFile(path.join(skillPath, "SKILL.md"), "utf-8");
          const firstLine = md.split("\n").find(l => l.trim() && !l.startsWith("#"));
          description = firstLine?.trim() || "";
        }
        const scripts = files.filter(f => !f.startsWith(".") && f !== "SKILL.md");
        return { name: dir.name, description, scripts, hasSkillMd };
      })
    );
    return NextResponse.json({ skills });
  } catch {
    return NextResponse.json({ skills: [] });
  }
}
