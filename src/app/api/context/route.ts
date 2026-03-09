import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');

// Files that compose the operational context, in order
const CONTEXT_FILES = [
  'telnyx-strategy.md',
  'standards/ad-copy-rules.md',
  'brand/brand-messaging-q1-2026.md',
  'product-groups.md',
];

export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get('section'); // optional filter
  const files = request.nextUrl.searchParams.get('files'); // comma-separated file list

  try {
    let filesToLoad = CONTEXT_FILES;

    if (files) {
      filesToLoad = files.split(',').map(f => f.trim());
    }

    if (section) {
      // Load specific section: "strategy", "standards", "brand", "campaigns", etc.
      const sectionDir = path.join(KNOWLEDGE_DIR, section);
      if (fs.existsSync(sectionDir) && fs.statSync(sectionDir).isDirectory()) {
        filesToLoad = fs.readdirSync(sectionDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join(section, f));
      } else {
        // Try as a single file
        const sectionFile = `${section}.md`;
        if (fs.existsSync(path.join(KNOWLEDGE_DIR, sectionFile))) {
          filesToLoad = [sectionFile];
        } else {
          return NextResponse.json({ error: `Section "${section}" not found` }, { status: 404 });
        }
      }
    }

    const context: { file: string; content: string }[] = [];

    for (const file of filesToLoad) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      if (fs.existsSync(filePath)) {
        context.push({
          file,
          content: fs.readFileSync(filePath, 'utf-8'),
        });
      }
    }

    // Also return a combined text version for easy injection into prompts
    const combined = context.map(c => c.content).join('\n\n---\n\n');

    return NextResponse.json({
      files: context.map(c => c.file),
      context: context,
      combined,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
