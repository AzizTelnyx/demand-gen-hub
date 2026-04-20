import { NextResponse } from 'next/server';

// Mock builder lists
const mockLists = [
  {
    id: 'list-1',
    name: 'Healthcare AI Targets Q2',
    domainCount: 234,
    status: 'active' as const,
    platforms: ['stackadapt'],
    createdAt: '2024-02-01T10:00:00Z',
    updatedAt: '2024-04-15T14:30:00Z',
    createdBy: 'aziz@telnyx.com',
  },
  {
    id: 'list-2',
    name: 'FinServ Contact Centers',
    domainCount: 189,
    status: 'pushed' as const,
    platforms: ['stackadapt', 'google_ads'],
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-04-10T11:00:00Z',
    createdBy: 'marketing@telnyx.com',
  },
  {
    id: 'list-3',
    name: 'IoT Fleet Management',
    domainCount: 156,
    status: 'pushed' as const,
    platforms: ['stackadapt'],
    createdAt: '2024-01-20T14:00:00Z',
    updatedAt: '2024-04-12T09:00:00Z',
    createdBy: 'aziz@telnyx.com',
  },
  {
    id: 'list-4',
    name: 'Twilio Conquest - BPO',
    domainCount: 78,
    status: 'draft' as const,
    platforms: [],
    createdAt: '2024-04-01T16:00:00Z',
    updatedAt: '2024-04-14T10:00:00Z',
    createdBy: 'aziz@telnyx.com',
  },
  {
    id: 'list-5',
    name: 'Smart City IoT',
    domainCount: 92,
    status: 'active' as const,
    platforms: ['stackadapt'],
    createdAt: '2024-03-10T11:00:00Z',
    updatedAt: '2024-04-13T15:00:00Z',
    createdBy: 'marketing@telnyx.com',
  },
  {
    id: 'list-6',
    name: 'Voice AI - Retail',
    domainCount: 45,
    status: 'draft' as const,
    platforms: [],
    createdAt: '2024-04-10T09:00:00Z',
    updatedAt: '2024-04-14T16:00:00Z',
    createdBy: 'aziz@telnyx.com',
  },
];

export async function GET() {
  return NextResponse.json({
    lists: mockLists,
    total: mockLists.length,
  });
}
