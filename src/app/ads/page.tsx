'use client';

import { useState, useEffect } from 'react';
import {
  Search, Image, Type, ExternalLink, Loader2, Sparkles,
  Monitor, LayoutGrid, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';

interface Ad {
  platform: string;
  campaignName: string;
  adGroupName: string;
  adId: string;
  adName: string;
  adType: string;
  status: string;
  headlines: string[];
  descriptions: string[];
  finalUrls: string[];
  images: string[];
  videos?: { thumbnail?: string; videoId?: string; url?: string }[];
  dimensions?: string[];
  previewUnavailable?: boolean;
}

const platformColors: Record<string, string> = {
  google_ads: "bg-blue-900/30 text-blue-400 border-blue-800/30",
  stackadapt: "bg-violet-900/30 text-violet-400 border-violet-800/30",
  reddit: "bg-orange-900/30 text-orange-400 border-orange-800/30",
  linkedin: "bg-sky-900/30 text-sky-400 border-sky-800/30",
};
const platformLabels: Record<string, string> = {
  google_ads: "Google Ads", stackadapt: "StackAdapt", linkedin: "LinkedIn", reddit: "Reddit",
};

import PlatformIcon from "@/components/PlatformIcon";

const adTypeIcons: Record<string, any> = {
  "Responsive Search": Type,
  "Responsive Display": LayoutGrid,
  "Expanded Text": Type,
  "Image": Image,
  "Native": Monitor,
  "native": Monitor,
  "display": LayoutGrid,
  "Display": LayoutGrid,
  "video": Monitor,
  "Video": Monitor,
  "Video (YouTube)": Monitor,
  "Video (In-Stream)": Monitor,
  "DOOH": Monitor,
};

function AdCard({ ad }: { ad: Ad }) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = adTypeIcons[ad.adType] || Monitor;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl overflow-hidden hover:border-[var(--border-primary)] transition-colors">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-muted)]">
          <TypeIcon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={ad.platform} size={14} showLabel />
            <span className="text-[10px] text-[var(--text-muted)]">{ad.adType}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${
              ad.status === 'ENABLED' || ad.status === 'active' || ad.status === 'live' ? 'bg-emerald-900/30 text-emerald-400' :
              ad.status === 'PAUSED' || ad.status === 'paused' ? 'bg-amber-900/30 text-amber-400' :
              ad.status === 'ended' ? 'bg-red-900/30 text-red-400' :
              'bg-[var(--bg-primary)] text-[var(--text-muted)]'
            }`}>
              {ad.status}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{ad.campaignName}{ad.adGroupName ? ` › ${ad.adGroupName}` : ''}</p>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-[var(--text-muted)] hover:text-[var(--text-muted)] transition">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Preview */}
      <div className="px-4 pb-3">
        {/* Preview unavailable placeholder */}
        {ad.previewUnavailable && ad.headlines.length === 0 && ad.descriptions.length === 0 && ad.images.length === 0 && (
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-[var(--bg-primary)]/50 border border-dashed border-[var(--border-primary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--text-muted)] shrink-0"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            <span className="text-[10px] text-[var(--text-muted)]">
              Preview unavailable — Sponsored Content creative data requires additional LinkedIn API permissions
            </span>
          </div>
        )}

        {/* Headlines */}
        {ad.headlines.length > 0 && (
          <div className="space-y-1 mb-2">
            {ad.headlines.slice(0, expanded ? 15 : 3).map((h, i) => (
              <p key={i} className={`${i === 0 ? 'text-sm text-indigo-300 font-medium' : 'text-xs text-blue-400'}`}>{h}</p>
            ))}
            {!expanded && ad.headlines.length > 3 && (
              <p className="text-[10px] text-[var(--text-muted)]">+{ad.headlines.length - 3} more headlines</p>
            )}
          </div>
        )}

        {/* Descriptions */}
        {ad.descriptions.length > 0 && (
          <div className="space-y-1 mb-2">
            {ad.descriptions.slice(0, expanded ? 10 : 2).map((d, i) => (
              <p key={i} className="text-xs text-[var(--text-muted)] leading-relaxed">{d}</p>
            ))}
          </div>
        )}

        {/* Images */}
        {ad.images.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {ad.images.slice(0, expanded ? 20 : 4).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] overflow-hidden hover:border-indigo-500/50 transition">
                <img src={url} alt="" className="max-h-40 max-w-full object-contain rounded-lg" onError={e => (e.currentTarget.parentElement!.style.display = 'none')} />
              </a>
            ))}
            {!expanded && ad.images.length > 4 && (
              <div className="w-20 h-20 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-[var(--text-muted)] text-xs">
                +{ad.images.length - 4}
              </div>
            )}
          </div>
        )}

        {/* Dimensions */}
        {ad.dimensions && ad.dimensions.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {ad.dimensions.map((d, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[9px] text-[var(--text-muted)] font-mono">{d}</span>
            ))}
          </div>
        )}

        {/* Videos */}
        {ad.videos && ad.videos.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {ad.videos.slice(0, expanded ? 10 : 4).map((v, i) => (
              <a key={i} href={v.videoId ? `https://youtube.com/watch?v=${v.videoId}` : v.url || '#'}
                target="_blank" rel="noopener noreferrer"
                className="relative block w-40 h-24 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] overflow-hidden hover:border-indigo-500/50 transition group">
                {(v.thumbnail || v.url) && <img src={v.thumbnail || v.url} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition">
                  <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                    <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-l-[8px] border-transparent border-l-white ml-0.5" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* URLs */}
        {expanded && ad.finalUrls.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <ExternalLink size={10} className="text-[var(--text-muted)]" />
            {ad.finalUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--text-muted)] hover:text-indigo-400 truncate max-w-[300px]">
                {url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type StatusFilter = 'active' | 'paused' | 'all';
type PlatformFilter = 'all' | 'google_ads' | 'stackadapt' | 'linkedin' | 'reddit';
type AdTypeFilter = 'all' | 'search' | 'display' | 'video' | 'native';

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${active ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-primary)]'}`}>
      {label}
    </button>
  );
}

export default function AdsLibraryPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [adTypeFilter, setAdTypeFilter] = useState<AdTypeFilter>('all');
  const [initialLoad, setInitialLoad] = useState(true);

  // Load active ads on page mount
  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '', status: 'active', platform: 'all', adType: 'all' }),
        });
        const data = await res.json();
        setResults(data);
      } catch (e) { console.error(e); }
      setLoading(false);
      setInitialLoad(false);
    };
    loadInitial();
  }, []);

  // Re-search when filters change (after initial load)
  useEffect(() => {
    if (initialLoad) return;
    const doSearch = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim(), status: statusFilter, platform: platformFilter, adType: adTypeFilter }),
        });
        setResults(await res.json());
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    doSearch();
  }, [statusFilter, platformFilter, adTypeFilter]);

  const search = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          status: statusFilter,
          platform: platformFilter,
          adType: adTypeFilter,
        }),
      });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-[1400px] space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Ads Library</h1>
        <p className="text-[var(--text-muted)] text-sm mt-0.5">Search ad creatives across all platforms with natural language</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Status</span>
          <div className="flex gap-1">
            <FilterPill label="Active" active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
            <FilterPill label="Paused" active={statusFilter === 'paused'} onClick={() => setStatusFilter('paused')} />
            <FilterPill label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Platform</span>
          <div className="flex gap-1">
            <FilterPill label="All" active={platformFilter === 'all'} onClick={() => setPlatformFilter('all')} />
            <FilterPill label="Google Ads" active={platformFilter === 'google_ads'} onClick={() => setPlatformFilter('google_ads')} />
            <FilterPill label="LinkedIn" active={platformFilter === 'linkedin'} onClick={() => setPlatformFilter('linkedin')} />
            <FilterPill label="StackAdapt" active={platformFilter === 'stackadapt'} onClick={() => setPlatformFilter('stackadapt')} />
            <FilterPill label="Reddit" active={platformFilter === 'reddit'} onClick={() => setPlatformFilter('reddit')} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Type</span>
          <div className="flex gap-1">
            <FilterPill label="All" active={adTypeFilter === 'all'} onClick={() => setAdTypeFilter('all')} />
            <FilterPill label="Search" active={adTypeFilter === 'search'} onClick={() => setAdTypeFilter('search')} />
            <FilterPill label="Display" active={adTypeFilter === 'display'} onClick={() => setAdTypeFilter('display')} />
            <FilterPill label="Video" active={adTypeFilter === 'video'} onClick={() => setAdTypeFilter('video')} />
            <FilterPill label="Native" active={adTypeFilter === 'native'} onClick={() => setAdTypeFilter('native')} />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Sparkles size={14} className="absolute left-3.5 top-3.5 text-indigo-500" />
            <input
              type="text"
              placeholder="e.g. &quot;Show me all AI agents campaigns&quot; or &quot;SIP trunking display ads&quot;"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              className="w-full pl-10 pr-4 py-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button onClick={search} disabled={loading || !query.trim()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-[var(--bg-primary)] disabled:text-[var(--text-muted)] text-[var(--text-primary)] text-sm font-medium rounded-xl transition-colors flex items-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {/* Example queries */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {["AI agents campaigns", "SIP trunking", "display ads", "EMEA campaigns", "voice API"].map(q => (
            <button key={q} onClick={() => { setQuery(q); }}
              className="px-2.5 py-1 text-[11px] text-[var(--text-muted)] bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg hover:text-[var(--text-secondary)] hover:border-[var(--border-primary)] transition">
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Fallback notice */}
          {results.fallback && (
            <div className="bg-amber-950/40 border border-amber-800/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs text-amber-300">{results.fallback}</span>
            </div>
          )}

          {/* Summary */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2">
              <Eye size={14} className="text-[var(--text-muted)]" />
              <span className="text-lg font-semibold text-[var(--text-primary)]">{results.totalAds || 0}</span>
              <span className="text-xs text-[var(--text-muted)]">ads across</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">{results.totalCampaigns || 0}</span>
              <span className="text-xs text-[var(--text-muted)]">campaigns</span>
            </div>
            {results.keywords?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-[var(--text-muted)]">Matched:</span>
                {results.keywords.map((k: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-indigo-900/20 text-indigo-400 text-[10px] border border-indigo-800/20">{k}</span>
                ))}
              </div>
            )}
          </div>

          {/* Grouped by campaign */}
          {results.byCampaign && Object.keys(results.byCampaign).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(results.byCampaign).map(([campaign, ads]: [string, any]) => (
                <div key={campaign}>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">{campaign}</h3>
                    <span className="text-[10px] text-[var(--text-muted)]">{ads.length} ad{ads.length !== 1 ? 's' : ''}</span>
                    <div className="flex-1 h-px bg-[var(--bg-primary)]" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {ads.map((ad: Ad, i: number) => (
                      <AdCard key={`${ad.adId}-${i}`} ad={ad} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-12 text-center">
              <Image size={24} className="text-[var(--text-muted)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-muted)]">No ads found for &quot;{query}&quot;</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Try different keywords or check if campaigns are active</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
