import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const PYTHON_VENV = '/home/telnyx-user/.venv/bin/python3';
const SCRIPT_PATH = '/home/telnyx-user/demand-gen-hub/scripts/google-ads-launch.py';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, plan, adCopy, channelResearch, landingPage, customerId } = body;
    
    // Validate action
    if (!['preview', 'launch', 'test'].includes(action)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid action. Use: preview, launch, or test' 
      }, { status: 400 });
    }
    
    // For test action, just check connection
    if (action === 'test') {
      const { stdout, stderr } = await execAsync(`${PYTHON_VENV} ${SCRIPT_PATH} test`);
      const result = JSON.parse(stdout);
      return NextResponse.json(result);
    }
    
    // Prepare data for the script
    const scriptData = {
      plan,
      adCopy,
      channelResearch,
      landingPage: landingPage || 'https://telnyx.com',
      customerId: customerId || '235-665-0573'
    };
    
    // Write to temp file (safer than stdin for large payloads)
    const tempFile = path.join(os.tmpdir(), `hub-launch-${Date.now()}.json`);
    await fs.writeFile(tempFile, JSON.stringify(scriptData));
    
    try {
      const { stdout, stderr } = await execAsync(
        `${PYTHON_VENV} ${SCRIPT_PATH} ${action} ${tempFile}`,
        { timeout: 60000 } // 60 second timeout
      );
      
      if (stderr) {
        console.error('Script stderr:', stderr);
      }
      
      const result = JSON.parse(stdout);
      
      // Add helpful context
      if (action === 'preview') {
        result.message = 'Preview generated. Review warnings before launching.';
        result.nextStep = 'Call this endpoint with action=launch to create the campaign';
      } else if (action === 'launch' && result.success) {
        result.message = 'Campaign created successfully! It is PAUSED - review and enable in Google Ads.';
        result.googleAdsUrl = `https://ads.google.com/aw/campaigns?campaignId=${extractCampaignId(result.campaign?.resourceName)}`;
      }
      
      return NextResponse.json({ success: true, ...result });
      
    } finally {
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
    }
    
  } catch (error: any) {
    console.error('Launch error:', error);
    
    // Parse error message if it's JSON
    let errorDetails = error.message;
    try {
      if (error.stdout) {
        errorDetails = JSON.parse(error.stdout);
      }
    } catch {}
    
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to execute Google Ads script',
      details: errorDetails
    }, { status: 500 });
  }
}

function extractCampaignId(resourceName: string | undefined): string {
  if (!resourceName) return '';
  // Format: customers/123/campaigns/456 -> 456
  const match = resourceName.match(/campaigns\/(\d+)/);
  return match ? match[1] : '';
}

// GET endpoint to check status
export async function GET() {
  try {
    const { stdout } = await execAsync(`${PYTHON_VENV} ${SCRIPT_PATH} test`);
    const result = JSON.parse(stdout);
    return NextResponse.json({
      connected: result.success,
      message: result.success ? 'Google Ads API connected' : result.error,
      accounts: [
        { id: '235-665-0573', name: 'Marketing Telnyx', currency: 'USD' },
        { id: '448-345-6029', name: 'Political Comms', currency: 'EUR' }
      ]
    });
  } catch (error: any) {
    return NextResponse.json({
      connected: false,
      error: error.message
    });
  }
}
