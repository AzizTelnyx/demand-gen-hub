# Creative Generator - Quick Start Guide

## 🚀 Generate a Creative (2 minutes)

### Step 1: Run the Generator
```bash
npm run create-manual-creative
```

### Step 2: Find Your Files
```bash
ls -lh output/creatives/test-healthcare-hipaa-*/
```

**You'll see:**
- `1200x627.png` - LinkedIn landscape
- `1200x1200.png` - LinkedIn square
- `628x1200.png` - LinkedIn vertical
- `copy.json` - Copy metadata
- 3 HTML files for preview

### Step 3: Preview
Open any PNG file to see your creative

### Step 4: Upload to LinkedIn
1. Go to LinkedIn Campaign Manager
2. Create new campaign
3. Upload all 3 PNG files
4. Launch!

---

## 📝 Customize the Creative

Edit `scripts/create-manual-creative.ts`:

```typescript
const TEST_CREATIVE: Creative = {
  headline: "Your Headline Here",
  description: "Your description...",
  cta: "Your CTA",
  dataPoint: "Your Data Point",
};
```

Then run again:
```bash
npm run create-manual-creative
```

---

## 🎨 Brand Settings

All in `brand-assets/brand-config.json`:
- Colors: #0A0A0A (dark), #00CE9C (green)
- Fonts: PP Formula (headlines), Inter (body)
- Pillars: Trust, Infrastructure, Physics

---

## 📊 Platform Sizes

**LinkedIn:**
- 1200x627 (landscape)
- 1200x1200 (square)
- 628x1200 (vertical)

**Coming Soon:**
- StackAdapt Native
- StackAdapt Display
- Reddit
- Google Display

---

## 🆘 Troubleshooting

**PNG files not generated?**
```bash
npm install -D puppeteer --legacy-peer-deps
```

**Want different sizes?**
Edit the `sizes` array in `scripts/create-manual-creative.ts`

**Need different design?**
Edit the `generateHTML()` function styling

---

## 💡 Tips

1. **Generate multiple variations** - Change headline/description, re-run
2. **Test in browser first** - Open HTML files before checking PNGs
3. **Use data points** - Numbers perform better (99.999% uptime, <200ms, etc.)
4. **Keep headlines short** - Under 70 characters for best impact

---

## 📁 File Locations

**Scripts:**
- `scripts/create-manual-creative.ts` - Manual generator (working)
- `scripts/generate-creative.ts` - AI generator (auth pending)

**Brand Assets:**
- `brand-assets/fonts/` - All fonts
- `brand-assets/brand-config.json` - Brand specs
- `brand-assets/telnyx-assets/` - Asset library (109 folders)

**Output:**
- `output/creatives/[timestamp]/` - Your generated files

---

**Ready to create your first ad? Run:**
```bash
npm run create-manual-creative
```
