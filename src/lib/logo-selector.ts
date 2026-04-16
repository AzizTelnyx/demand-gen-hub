/**
 * Smart Logo Selector
 *
 * Automatically selects the correct logo variant (white/black/green)
 * based on background color for optimal contrast and brand consistency.
 */

import { promises as fs } from "fs";
import path from "path";

interface BrandAssets {
  logos: {
    white: { path: string };
    black: { path: string };
    green: { path: string };
  };
  logoSelectionRules: {
    default: string;
    onDarkBackgrounds: string;
    onLightBackgrounds: string;
    onBrandGreen: string;
  };
}

interface BrandColors {
  neutrals: Record<string, { hex: string; logoColor?: string }>;
  brand: {
    primary: { hex: string; logoColor?: string };
  };
  products: Record<string, {
    background: { hex: string; logoColor?: string };
  }>;
}

let brandAssets: BrandAssets | null = null;
let brandColors: BrandColors | null = null;

/**
 * Load brand assets configuration
 */
async function loadBrandAssets(): Promise<BrandAssets> {
  if (brandAssets) return brandAssets;

  const assetsPath = path.join(process.cwd(), "config", "brand-assets.json");
  const assetsContent = await fs.readFile(assetsPath, "utf-8");
  brandAssets = JSON.parse(assetsContent);
  return brandAssets!;
}

/**
 * Load brand colors configuration
 */
async function loadBrandColors(): Promise<BrandColors> {
  if (brandColors) return brandColors;

  const colorsPath = path.join(process.cwd(), "config", "brand-colors.json");
  const colorsContent = await fs.readFile(colorsPath, "utf-8");
  brandColors = JSON.parse(colorsContent);
  return brandColors!;
}

/**
 * Calculate luminance of a hex color (0-255)
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 128; // Default to middle gray

  // Relative luminance formula (ITU-R BT.709)
  const [r, g, b] = rgb.map(val => {
    val /= 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255;
}

/**
 * Convert hex color to RGB array
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : null;
}

/**
 * Determine if background is dark (returns true if dark, false if light)
 */
function isDarkBackground(backgroundColor: string): boolean {
  const luminance = getLuminance(backgroundColor);
  return luminance < 128; // Threshold: below 128 is dark
}

/**
 * Select logo variant based on background color
 *
 * @param backgroundColor - Hex color of the background (e.g., "#000000", "#FEFDF5")
 * @param forceVariant - Optional: force a specific variant ("white", "black", "green")
 * @returns Path to the selected logo file
 */
export async function selectLogo(
  backgroundColor: string,
  forceVariant?: "white" | "black" | "green"
): Promise<string> {
  const assets = await loadBrandAssets();
  const colors = await loadBrandColors();

  // If variant is forced, return it
  if (forceVariant) {
    return assets.logos[forceVariant].path;
  }

  // Check if backgroundColor matches a known brand color with logoColor specified
  const allColors = {
    ...colors.neutrals,
    brandPrimary: colors.brand.primary,
  };

  // Check neutrals
  for (const [name, colorInfo] of Object.entries(colors.neutrals)) {
    if (colorInfo.hex.toLowerCase() === backgroundColor.toLowerCase() && colorInfo.logoColor) {
      const variant = colorInfo.logoColor === "white" ? "white" : "black";
      return assets.logos[variant].path;
    }
  }

  // Check brand primary
  if (colors.brand.primary.hex.toLowerCase() === backgroundColor.toLowerCase()) {
    return assets.logos.white.path; // White logo on brand green
  }

  // Check product backgrounds
  for (const [product, productInfo] of Object.entries(colors.products)) {
    if (productInfo.background.hex.toLowerCase() === backgroundColor.toLowerCase()) {
      const variant = productInfo.background.logoColor === "white" ? "white" : "black";
      return assets.logos[variant].path;
    }
  }

  // Fallback: determine by luminance
  const dark = isDarkBackground(backgroundColor);
  return dark ? assets.logos.white.path : assets.logos.black.path;
}

/**
 * Select logo for template composition pattern
 */
export async function selectLogoForPattern(
  pattern: "cleanSaaS" | "productHighlight" | "darkMode" | "custom",
  customBackground?: string
): Promise<string> {
  const assets = await loadBrandAssets();
  const colors = await loadBrandColors();

  switch (pattern) {
    case "cleanSaaS":
      // Cream background → black logo
      return assets.logos.black.path;

    case "productHighlight":
      // Product tint background → black logo
      return assets.logos.black.path;

    case "darkMode":
      // Black background → white logo
      return assets.logos.white.path;

    case "custom":
      if (customBackground) {
        return selectLogo(customBackground);
      }
      return assets.logos.black.path; // Default

    default:
      return assets.logos.black.path;
  }
}

/**
 * Get all available logo variants
 */
export async function getAllLogos(): Promise<{
  white: string;
  black: string;
  green: string;
}> {
  const assets = await loadBrandAssets();
  return {
    white: assets.logos.white.path,
    black: assets.logos.black.path,
    green: assets.logos.green.path,
  };
}
