'use client';

import { useState } from 'react';
import { BriefInput } from './steps/BriefInput';
import { BriefReview } from './steps/BriefReview';
import { AudienceResearch } from './steps/AudienceResearch';
import { ChannelBudget } from './steps/ChannelBudget';
import { CampaignPlan } from './steps/CampaignPlan';
import { AdCopyReview } from './steps/AdCopyReview';
import { FinalReview } from './steps/FinalReview';
import { BuildProgress } from './steps/BuildProgress';

export interface BriefData {
  notes: string;
  googleDocs: string[];
  googleSheets: string[];
  uploadedFiles: File[];
}

export interface ExtractedBrief {
  product: string;
  targetAudience: string;
  goal: 'awareness' | 'leads' | 'pipeline';
  regions: string[];
  budget: { type: 'specified' | 'recommend'; amount?: number };
  funnelFocus: 'tofu' | 'mofu' | 'bofu' | 'full';
  timeline: { start: string; durationMonths: number };
  abm: { type: 'broad' | 'list' | 'build'; listUrl?: string };
}

export interface IcpAnalysis {
  jobTitles: string[];
  industries: string[];
  companySize: string;
  painPoints: string[];
  buyingStage: string;
  competitorsEvaluating: string[];
}

export interface ChannelResearch {
  channel: string;
  recommended: boolean;
  rationale: string;
  targeting: Record<string, any>;
  audienceSize: number;
  estimatedCpm?: number;
  estimatedCpc?: number;
  keywords?: Array<{ keyword: string; volume: number; cpc: number; intent: string }>;
  budgetCalculation: {
    formula: string;
    result: number;
  };
  recommendedBudget: number;
}

export interface CampaignPlanItem {
  id: string;
  name: string;
  platform: 'google_ads' | 'linkedin' | 'stackadapt' | 'reddit';
  funnel: 'tofu' | 'mofu' | 'bofu' | 'retargeting';
  budget: number;
  adGroups?: Array<{ name: string; keywords?: string[]; targeting?: string }>;
  status: 'planned' | 'building' | 'created' | 'error';
}

export interface AdCopy {
  campaignId: string;
  headlines: string[];
  descriptions: string[];
  brandCheckPassed: boolean;
  factCheckPassed: boolean;
}

const STEPS = [
  { id: 1, name: 'Brief' },
  { id: 2, name: 'Review' },
  { id: 3, name: 'Audience' },
  { id: 4, name: 'Channels' },
  { id: 5, name: 'Plan' },
  { id: 6, name: 'Copy' },
  { id: 7, name: 'Launch' },
];

export function CampaignBuilder() {
  const [currentStep, setCurrentStep] = useState(1);
  const [briefData, setBriefData] = useState<BriefData | null>(null);
  const [extractedBrief, setExtractedBrief] = useState<ExtractedBrief | null>(null);
  const [icpAnalysis, setIcpAnalysis] = useState<IcpAnalysis | null>(null);
  const [channelResearch, setChannelResearch] = useState<ChannelResearch[]>([]);
  const [campaignPlan, setCampaignPlan] = useState<CampaignPlanItem[]>([]);
  const [adCopy, setAdCopy] = useState<AdCopy[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);

  const handleBriefSubmit = async (data: BriefData) => {
    setBriefData(data);
    // TODO: Call API to parse brief
    setCurrentStep(2);
  };

  const handleBriefConfirm = async (data: ExtractedBrief) => {
    setExtractedBrief(data);
    // TODO: Call audience research API
    setCurrentStep(3);
  };

  const handleIcpConfirm = async (data: IcpAnalysis) => {
    setIcpAnalysis(data);
    // TODO: Call channel research API
    setCurrentStep(4);
  };

  const handleChannelConfirm = async (data: ChannelResearch[]) => {
    setChannelResearch(data);
    // TODO: Generate campaign plan
    setCurrentStep(5);
  };

  const handlePlanConfirm = async (data: CampaignPlanItem[]) => {
    setCampaignPlan(data);
    // TODO: Generate ad copy
    setCurrentStep(6);
  };

  const handleCopyConfirm = async (data: AdCopy[]) => {
    setAdCopy(data);
    setCurrentStep(7);
  };

  const handleLaunch = async () => {
    setIsBuilding(true);
    // TODO: Call build API
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <BriefInput onSubmit={handleBriefSubmit} />;
      case 2:
        return (
          <BriefReview
            briefData={briefData}
            onConfirm={handleBriefConfirm}
            onBack={() => setCurrentStep(1)}
          />
        );
      case 3:
        return (
          <AudienceResearch
            extractedBrief={extractedBrief}
            icpAnalysis={icpAnalysis}
            onConfirm={handleIcpConfirm}
            onBack={() => setCurrentStep(2)}
          />
        );
      case 4:
        return (
          <ChannelBudget
            extractedBrief={extractedBrief}
            icpAnalysis={icpAnalysis}
            channelResearch={channelResearch}
            onConfirm={handleChannelConfirm}
            onBack={() => setCurrentStep(3)}
          />
        );
      case 5:
        return (
          <CampaignPlan
            channelResearch={channelResearch}
            campaignPlan={campaignPlan}
            onConfirm={handlePlanConfirm}
            onBack={() => setCurrentStep(4)}
          />
        );
      case 6:
        return (
          <AdCopyReview
            campaignPlan={campaignPlan}
            adCopy={adCopy}
            onConfirm={handleCopyConfirm}
            onBack={() => setCurrentStep(5)}
          />
        );
      case 7:
        if (isBuilding) {
          return <BuildProgress campaignPlan={campaignPlan} />;
        }
        return (
          <FinalReview
            extractedBrief={extractedBrief}
            channelResearch={channelResearch}
            campaignPlan={campaignPlan}
            onLaunch={handleLaunch}
            onBack={() => setCurrentStep(6)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Progress Steps */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  currentStep === step.id
                    ? 'bg-blue-600 text-white'
                    : currentStep > step.id
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {currentStep > step.id ? '✓' : step.id}
              </div>
              <span
                className={`ml-2 text-sm ${
                  currentStep === step.id ? 'text-white' : 'text-gray-400'
                }`}
              >
                {step.name}
              </span>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-4 ${
                    currentStep > step.id ? 'bg-green-600' : 'bg-gray-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">{renderStep()}</div>
      </div>
    </div>
  );
}
