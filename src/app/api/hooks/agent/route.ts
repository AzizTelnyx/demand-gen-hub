import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = 'http://127.0.0.1:18789/hooks/agent';
const HOOKS_TOKEN = process.env.OPENCLAW_HOOKS_TOKEN || 'gde-hooks-a2a-2026';

/**
 * Proxy for OpenClaw gateway hooks/agent endpoint.
 * Allows the GDE to dispatch tasks to paid media agents via the hub's public URL.
 *
 * POST /api/hooks/agent
 * Headers: Authorization: Bearer <token>
 * Body: { message, agentId, sessionKey?, deliver?, timeoutSeconds? }
 */
export async function POST(req: NextRequest) {
  // Validate auth - accept either the hooks token or the gateway token
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing authorization' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.message) {
      return NextResponse.json({ ok: false, error: 'Missing required field: message' }, { status: 400 });
    }

    // Forward to gateway
    const resp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HOOKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[hooks/agent proxy] Error:', message);
    return NextResponse.json({ ok: false, error: `Gateway proxy error: ${message}` }, { status: 502 });
  }
}

// Return available agent IDs
export async function GET() {
  return NextResponse.json({
    agents: [
      { id: 'main', name: 'Ares (Orchestrator)', role: 'orchestrator' },
      { id: 'neg-keyword', name: 'Negative Keyword Agent', role: 'specialist' },
      { id: 'keyword-bid-optimizer', name: 'Keyword & Bid Optimizer', role: 'specialist' },
      { id: 'budget-pacing', name: 'Budget & Pacing Manager', role: 'specialist' },
      { id: 'creative-qa', name: 'Creative & QA', role: 'specialist' },
      { id: 'stackadapt-ops', name: 'StackAdapt & ABM Ops', role: 'specialist' },
    ],
    usage: {
      method: 'POST',
      headers: { 'Authorization': 'Bearer <token>', 'Content-Type': 'application/json' },
      body: { message: 'string (required)', agentId: 'string (optional, defaults to main)', sessionKey: 'string (optional)', timeoutSeconds: 'number (optional)' },
    },
  });
}
