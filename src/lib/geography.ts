// Geography mapping - Cities to Regions with geo-targeting support

export interface GeoTarget {
  regions: string[];      // Campaign-level regions (US, UK, EMEA, etc.)
  countries: string[];    // Specific countries
  cities: string[];       // Cities for platform geo-targeting
}

// City to country/region mapping
export const CITY_MAPPING: Record<string, { country: string; region: string }> = {
  // US Cities
  'san francisco': { country: 'US', region: 'AMER' },
  'sf': { country: 'US', region: 'AMER' },
  'new york': { country: 'US', region: 'AMER' },
  'nyc': { country: 'US', region: 'AMER' },
  'los angeles': { country: 'US', region: 'AMER' },
  'la': { country: 'US', region: 'AMER' },
  'chicago': { country: 'US', region: 'AMER' },
  'boston': { country: 'US', region: 'AMER' },
  'seattle': { country: 'US', region: 'AMER' },
  'austin': { country: 'US', region: 'AMER' },
  'denver': { country: 'US', region: 'AMER' },
  'miami': { country: 'US', region: 'AMER' },
  'atlanta': { country: 'US', region: 'AMER' },
  'dallas': { country: 'US', region: 'AMER' },
  'houston': { country: 'US', region: 'AMER' },
  'phoenix': { country: 'US', region: 'AMER' },
  'silicon valley': { country: 'US', region: 'AMER' },
  
  // UK Cities
  'london': { country: 'UK', region: 'EMEA' },
  'manchester': { country: 'UK', region: 'EMEA' },
  'birmingham': { country: 'UK', region: 'EMEA' },
  'edinburgh': { country: 'UK', region: 'EMEA' },
  'glasgow': { country: 'UK', region: 'EMEA' },
  'bristol': { country: 'UK', region: 'EMEA' },
  'leeds': { country: 'UK', region: 'EMEA' },
  'cambridge': { country: 'UK', region: 'EMEA' },
  
  // Germany
  'berlin': { country: 'Germany', region: 'EMEA' },
  'munich': { country: 'Germany', region: 'EMEA' },
  'frankfurt': { country: 'Germany', region: 'EMEA' },
  'hamburg': { country: 'Germany', region: 'EMEA' },
  'cologne': { country: 'Germany', region: 'EMEA' },
  'dusseldorf': { country: 'Germany', region: 'EMEA' },
  
  // France
  'paris': { country: 'France', region: 'EMEA' },
  'lyon': { country: 'France', region: 'EMEA' },
  'marseille': { country: 'France', region: 'EMEA' },
  
  // Netherlands
  'amsterdam': { country: 'Netherlands', region: 'EMEA' },
  'rotterdam': { country: 'Netherlands', region: 'EMEA' },
  
  // Spain
  'madrid': { country: 'Spain', region: 'EMEA' },
  'barcelona': { country: 'Spain', region: 'EMEA' },
  
  // Italy
  'milan': { country: 'Italy', region: 'EMEA' },
  'rome': { country: 'Italy', region: 'EMEA' },
  
  // Ireland
  'dublin': { country: 'Ireland', region: 'EMEA' },
  
  // Nordics
  'stockholm': { country: 'Sweden', region: 'EMEA' },
  'copenhagen': { country: 'Denmark', region: 'EMEA' },
  'oslo': { country: 'Norway', region: 'EMEA' },
  'helsinki': { country: 'Finland', region: 'EMEA' },
  
  // Switzerland
  'zurich': { country: 'Switzerland', region: 'EMEA' },
  'geneva': { country: 'Switzerland', region: 'EMEA' },
  
  // Middle East
  'dubai': { country: 'UAE', region: 'MENA' },
  'abu dhabi': { country: 'UAE', region: 'MENA' },
  'riyadh': { country: 'Saudi Arabia', region: 'MENA' },
  'jeddah': { country: 'Saudi Arabia', region: 'MENA' },
  'doha': { country: 'Qatar', region: 'MENA' },
  'tel aviv': { country: 'Israel', region: 'MENA' },
  
  // APAC
  'sydney': { country: 'Australia', region: 'APAC' },
  'melbourne': { country: 'Australia', region: 'APAC' },
  'brisbane': { country: 'Australia', region: 'APAC' },
  'perth': { country: 'Australia', region: 'APAC' },
  'auckland': { country: 'New Zealand', region: 'APAC' },
  'singapore': { country: 'Singapore', region: 'APAC' },
  'tokyo': { country: 'Japan', region: 'APAC' },
  'osaka': { country: 'Japan', region: 'APAC' },
  'seoul': { country: 'South Korea', region: 'APAC' },
  'hong kong': { country: 'Hong Kong', region: 'APAC' },
  'bangalore': { country: 'India', region: 'APAC' },
  'mumbai': { country: 'India', region: 'APAC' },
  'delhi': { country: 'India', region: 'APAC' },
  'hyderabad': { country: 'India', region: 'APAC' },
  'manila': { country: 'Philippines', region: 'APAC' },
  'bangkok': { country: 'Thailand', region: 'APAC' },
  'jakarta': { country: 'Indonesia', region: 'APAC' },
  'kuala lumpur': { country: 'Malaysia', region: 'APAC' },
  'ho chi minh': { country: 'Vietnam', region: 'APAC' },
  'taipei': { country: 'Taiwan', region: 'APAC' },
  
  // Canada
  'toronto': { country: 'Canada', region: 'AMER' },
  'vancouver': { country: 'Canada', region: 'AMER' },
  'montreal': { country: 'Canada', region: 'AMER' },
  
  // LATAM
  'mexico city': { country: 'Mexico', region: 'LATAM' },
  'sao paulo': { country: 'Brazil', region: 'LATAM' },
  'rio de janeiro': { country: 'Brazil', region: 'LATAM' },
  'buenos aires': { country: 'Argentina', region: 'LATAM' },
  'bogota': { country: 'Colombia', region: 'LATAM' },
  'santiago': { country: 'Chile', region: 'LATAM' },
};

// Country to region mapping
export const COUNTRY_TO_REGION: Record<string, string> = {
  // Americas
  'us': 'AMER', 'usa': 'AMER', 'united states': 'AMER',
  'canada': 'AMER',
  'mexico': 'LATAM', 'brazil': 'LATAM', 'argentina': 'LATAM',
  'colombia': 'LATAM', 'chile': 'LATAM',
  
  // Europe
  'uk': 'EMEA', 'united kingdom': 'EMEA', 'britain': 'EMEA', 'england': 'EMEA',
  'germany': 'EMEA', 'france': 'EMEA', 'netherlands': 'EMEA', 'holland': 'EMEA',
  'ireland': 'EMEA', 'spain': 'EMEA', 'italy': 'EMEA', 'portugal': 'EMEA',
  'belgium': 'EMEA', 'austria': 'EMEA', 'switzerland': 'EMEA',
  'sweden': 'EMEA', 'norway': 'EMEA', 'denmark': 'EMEA', 'finland': 'EMEA',
  'poland': 'EMEA', 'czech republic': 'EMEA',
  
  // Middle East
  'uae': 'MENA', 'united arab emirates': 'MENA',
  'saudi arabia': 'MENA', 'ksa': 'MENA',
  'qatar': 'MENA', 'israel': 'MENA', 'bahrain': 'MENA', 'kuwait': 'MENA',
  
  // APAC
  'australia': 'APAC', 'new zealand': 'APAC',
  'singapore': 'APAC', 'japan': 'APAC', 'south korea': 'APAC', 'korea': 'APAC',
  'hong kong': 'APAC', 'india': 'APAC',
  'philippines': 'APAC', 'thailand': 'APAC', 'vietnam': 'APAC',
  'indonesia': 'APAC', 'malaysia': 'APAC', 'taiwan': 'APAC',
};

// Meta-regions
export const META_REGIONS = ['AMER', 'EMEA', 'APAC', 'MENA', 'LATAM', 'GLOBAL'];

/**
 * Parse geographic text and extract regions, countries, and cities
 */
export function parseGeography(text: string): GeoTarget {
  const lower = text.toLowerCase();
  const regions = new Set<string>();
  const countries = new Set<string>();
  const cities: string[] = [];
  
  // Check for cities first (more specific)
  for (const [cityName, info] of Object.entries(CITY_MAPPING)) {
    // Use word boundary matching for short city names
    const regex = new RegExp(`\\b${cityName.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(lower)) {
      cities.push(cityName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      countries.add(info.country);
      regions.add(info.region);
    }
  }
  
  // Check for countries
  for (const [countryName, region] of Object.entries(COUNTRY_TO_REGION)) {
    if (countryName.length <= 3) {
      const regex = new RegExp(`\\b${countryName}\\b`, 'i');
      if (regex.test(lower)) {
        // Map common names to proper names
        const properName = countryName === 'us' || countryName === 'usa' ? 'US' :
                          countryName === 'uk' ? 'UK' :
                          countryName === 'uae' ? 'UAE' :
                          countryName === 'ksa' ? 'Saudi Arabia' :
                          countryName.charAt(0).toUpperCase() + countryName.slice(1);
        countries.add(properName);
        regions.add(region);
      }
    } else if (lower.includes(countryName)) {
      const properName = countryName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      countries.add(properName);
      regions.add(region);
    }
  }
  
  // Check for meta-regions
  for (const metaRegion of META_REGIONS) {
    if (lower.includes(metaRegion.toLowerCase())) {
      regions.add(metaRegion);
    }
  }
  
  // Check for "global" or "worldwide"
  if (lower.includes('global') || lower.includes('worldwide')) {
    regions.add('GLOBAL');
  }
  
  return {
    regions: Array.from(regions),
    countries: Array.from(countries),
    cities,
  };
}

/**
 * Format geography for campaign naming
 */
export function formatGeographyForName(geo: GeoTarget): string {
  // Prefer meta-regions for naming
  const metaRegions = geo.regions.filter(r => META_REGIONS.includes(r));
  if (metaRegions.length > 0) {
    return metaRegions.includes('GLOBAL') ? 'GLOBAL' : metaRegions.join('/');
  }
  
  // Fall back to countries
  if (geo.countries.length > 0) {
    return geo.countries.slice(0, 2).join('/');
  }
  
  return 'GLOBAL';
}
