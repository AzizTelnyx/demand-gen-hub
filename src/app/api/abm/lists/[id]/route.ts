import { NextRequest, NextResponse } from 'next/server';

// Mock domains for lists
const mockListDomains: Record<string, Array<{
  domain: string;
  company: string;
  relevanceScore: number;
  addedAt: string;
  addedBy: string;
}>> = {
  'list-1': [
    { domain: 'epic.com', company: 'Epic Systems', relevanceScore: 0.94, addedAt: '2024-02-05', addedBy: 'expander' },
    { domain: 'cerner.com', company: 'Cerner (Oracle Health)', relevanceScore: 0.92, addedAt: '2024-02-05', addedBy: 'expander' },
    { domain: 'medidata.com', company: 'Medidata Solutions', relevanceScore: 0.88, addedAt: '2024-02-10', addedBy: 'aziz@telnyx.com' },
    { domain: 'veeva.com', company: 'Veeva Systems', relevanceScore: 0.86, addedAt: '2024-02-10', addedBy: 'expander' },
    { domain: 'athenahealth.com', company: 'athenahealth', relevanceScore: 0.85, addedAt: '2024-02-12', addedBy: 'expander' },
    { domain: 'healthgrades.com', company: 'Healthgrades', relevanceScore: 0.78, addedAt: '2024-02-15', addedBy: 'aziz@telnyx.com' },
    { domain: 'zocdoc.com', company: 'Zocdoc', relevanceScore: 0.76, addedAt: '2024-02-18', addedBy: 'expander' },
    { domain: 'teladoc.com', company: 'Teladoc Health', relevanceScore: 0.82, addedAt: '2024-02-20', addedBy: 'expander' },
    { domain: 'amwell.com', company: 'Amwell', relevanceScore: 0.79, addedAt: '2024-02-22', addedBy: 'aziz@telnyx.com' },
    { domain: 'doximity.com', company: 'Doximity', relevanceScore: 0.74, addedAt: '2024-02-25', addedBy: 'expander' },
    { domain: 'practicefusion.com', company: 'Practice Fusion', relevanceScore: 0.71, addedAt: '2024-03-01', addedBy: 'expander' },
    { domain: 'kareo.com', company: 'Kareo', relevanceScore: 0.68, addedAt: '2024-03-05', addedBy: 'aziz@telnyx.com' },
    { domain: 'patientpop.com', company: 'PatientPop', relevanceScore: 0.65, addedAt: '2024-03-08', addedBy: 'expander' },
    { domain: 'solutionreach.com', company: 'Solutionreach', relevanceScore: 0.72, addedAt: '2024-03-10', addedBy: 'expander' },
    { domain: 'phreesia.com', company: 'Phreesia', relevanceScore: 0.77, addedAt: '2024-03-12', addedBy: 'aziz@telnyx.com' },
  ],
  'list-2': [
    { domain: 'fidelity.com', company: 'Fidelity Investments', relevanceScore: 0.91, addedAt: '2024-01-20', addedBy: 'expander' },
    { domain: 'schwab.com', company: 'Charles Schwab', relevanceScore: 0.89, addedAt: '2024-01-20', addedBy: 'expander' },
    { domain: 'vanguard.com', company: 'Vanguard', relevanceScore: 0.87, addedAt: '2024-01-22', addedBy: 'marketing@telnyx.com' },
    { domain: 'tdameritrade.com', company: 'TD Ameritrade', relevanceScore: 0.85, addedAt: '2024-01-25', addedBy: 'expander' },
    { domain: 'etrade.com', company: 'E*TRADE', relevanceScore: 0.83, addedAt: '2024-01-28', addedBy: 'expander' },
    { domain: 'robinhood.com', company: 'Robinhood', relevanceScore: 0.75, addedAt: '2024-02-01', addedBy: 'marketing@telnyx.com' },
    { domain: 'betterment.com', company: 'Betterment', relevanceScore: 0.72, addedAt: '2024-02-05', addedBy: 'expander' },
    { domain: 'wealthfront.com', company: 'Wealthfront', relevanceScore: 0.70, addedAt: '2024-02-08', addedBy: 'expander' },
    { domain: 'sofi.com', company: 'SoFi', relevanceScore: 0.78, addedAt: '2024-02-10', addedBy: 'marketing@telnyx.com' },
    { domain: 'chime.com', company: 'Chime', relevanceScore: 0.74, addedAt: '2024-02-12', addedBy: 'expander' },
  ],
  'list-3': [
    { domain: 'samsara.com', company: 'Samsara', relevanceScore: 0.95, addedAt: '2024-01-25', addedBy: 'expander' },
    { domain: 'geotab.com', company: 'Geotab', relevanceScore: 0.93, addedAt: '2024-01-25', addedBy: 'expander' },
    { domain: 'fleetcomplete.com', company: 'Fleet Complete', relevanceScore: 0.88, addedAt: '2024-01-28', addedBy: 'aziz@telnyx.com' },
    { domain: 'keeptruckin.com', company: 'KeepTruckin', relevanceScore: 0.86, addedAt: '2024-02-01', addedBy: 'expander' },
    { domain: 'omnitracs.com', company: 'Omnitracs', relevanceScore: 0.84, addedAt: '2024-02-05', addedBy: 'expander' },
    { domain: 'lytx.com', company: 'Lytx', relevanceScore: 0.82, addedAt: '2024-02-08', addedBy: 'aziz@telnyx.com' },
    { domain: 'teletrac.com', company: 'Teletrac Navman', relevanceScore: 0.80, addedAt: '2024-02-10', addedBy: 'expander' },
    { domain: 'calamp.com', company: 'CalAmp', relevanceScore: 0.78, addedAt: '2024-02-12', addedBy: 'expander' },
  ],
  'list-4': [
    { domain: 'concentrix.com', company: 'Concentrix', relevanceScore: 0.91, addedAt: '2024-04-02', addedBy: 'aziz@telnyx.com' },
    { domain: 'ttec.com', company: 'TTEC', relevanceScore: 0.89, addedAt: '2024-04-02', addedBy: 'expander' },
    { domain: 'teleperformance.com', company: 'Teleperformance', relevanceScore: 0.87, addedAt: '2024-04-03', addedBy: 'expander' },
    { domain: 'alorica.com', company: 'Alorica', relevanceScore: 0.85, addedAt: '2024-04-05', addedBy: 'aziz@telnyx.com' },
    { domain: 'sitel.com', company: 'Sitel Group', relevanceScore: 0.83, addedAt: '2024-04-08', addedBy: 'expander' },
  ],
  'list-5': [
    { domain: 'sidewalklabs.com', company: 'Sidewalk Labs', relevanceScore: 0.88, addedAt: '2024-03-12', addedBy: 'marketing@telnyx.com' },
    { domain: 'cityofboston.gov', company: 'City of Boston', relevanceScore: 0.85, addedAt: '2024-03-15', addedBy: 'expander' },
    { domain: 'columbus.gov', company: 'City of Columbus', relevanceScore: 0.82, addedAt: '2024-03-18', addedBy: 'expander' },
    { domain: 'smartdublin.ie', company: 'Smart Dublin', relevanceScore: 0.79, addedAt: '2024-03-20', addedBy: 'marketing@telnyx.com' },
    { domain: 'barcelona.cat', company: 'Barcelona City', relevanceScore: 0.76, addedAt: '2024-03-22', addedBy: 'expander' },
  ],
  'list-6': [
    { domain: 'nordstrom.com', company: 'Nordstrom', relevanceScore: 0.84, addedAt: '2024-04-11', addedBy: 'aziz@telnyx.com' },
    { domain: 'macys.com', company: "Macy's", relevanceScore: 0.81, addedAt: '2024-04-12', addedBy: 'expander' },
    { domain: 'target.com', company: 'Target', relevanceScore: 0.79, addedAt: '2024-04-13', addedBy: 'expander' },
    { domain: 'kohls.com', company: "Kohl's", relevanceScore: 0.75, addedAt: '2024-04-14', addedBy: 'aziz@telnyx.com' },
  ],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const domains = mockListDomains[id] || [];

  return NextResponse.json({
    domains,
    total: domains.length,
  });
}
