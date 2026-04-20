import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

/**
 * POST /api/abm/exclusions/push
 * Push unpushed exclusions for a product to StackAdapt
 * Calls the Python abm_exclusion_push.py script
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const { product } = body;

    if (!product) {
      return NextResponse.json({ error: 'Product is required' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'abm_exclusion_push.py');
    const pythonPath = '/Users/azizalsinafi/.venv/bin/python3';

    const cmd = `${pythonPath} ${scriptPath} --product "${product}"`;

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error && error.code !== 0) {
          resolve({ stdout, stderr: stderr || error.message, exitCode: error.code ?? 1 });
          return;
        }
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 });
      });
    });

    if (result.exitCode !== 0) {
      console.error('SA push error:', result.stderr);
      return NextResponse.json({
        error: 'Failed to push to StackAdapt',
        details: result.stderr.slice(0, 500),
      }, { status: 500 });
    }

    // Parse output for results
    const output = result.stdout;
    const pushedMatch = output.match(/pushed\s+(\d+)\s+domains/i);
    const audienceMatch = output.match(/audience.*?(\d+)/i);

    return NextResponse.json({
      success: true,
      product,
      pushedCount: pushedMatch ? parseInt(pushedMatch[1]) : 0,
      audienceId: audienceMatch ? audienceMatch[1] : null,
      output: output.slice(0, 1000),
    });
  } catch (error) {
    console.error('Error pushing exclusions to SA:', error);
    return NextResponse.json({ error: 'Failed to push exclusions' }, { status: 500 });
  }
}
