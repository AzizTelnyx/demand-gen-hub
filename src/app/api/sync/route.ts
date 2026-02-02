import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // This endpoint triggers a sync via the external Python script
  // In production, this would call the sync script or a background job
  
  // For now, return a message indicating the sync should be triggered externally
  return NextResponse.json({
    message: "Sync triggered. Run the sync script on the server.",
    instruction: "Run: python ~/demand-gen-hub/scripts/sync_campaigns.py",
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "Use POST to trigger a sync",
  });
}
