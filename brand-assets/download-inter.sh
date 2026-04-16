#!/bin/bash
# Download Inter font from Google Drive

echo "Downloading Inter.zip from Google Drive..."
curl -L "https://drive.usercontent.google.com/uc?id=1Vtv-uqF_dGYfjkZpWfTjsMRR-c6opRDO&export=download" -o fonts/Inter.zip

if [ -f fonts/Inter.zip ]; then
  echo "✓ Downloaded Inter.zip"
  
  echo "Extracting..."
  unzip -q fonts/Inter.zip -d fonts/
  
  echo "✓ Inter font files extracted to brand-assets/fonts/"
  ls -lh fonts/*.{ttf,otf,woff,woff2} 2>/dev/null | head -10
else
  echo "✗ Download failed - you may need to download manually"
  echo ""
  echo "Manual steps:"
  echo "1. Open this link in a browser on the Mac Mini:"
  echo "   https://drive.google.com/file/d/1Vtv-uqF_dGYfjkZpWfTjsMRR-c6opRDO/view"
  echo "2. Download Inter.zip"
  echo "3. Move it to: ~/.openclaw/workspace/demand-gen-hub/brand-assets/fonts/"
  echo "4. Unzip it: unzip Inter.zip"
fi
