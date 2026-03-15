#!/usr/bin/env python3
"""
Update sitelinks on Google Ads campaigns.
Uses campaign IDs from our database.

Usage:
    python3 update_sitelinks.py --dry-run    # Preview changes
    python3 update_sitelinks.py              # Apply changes
"""

import argparse
import os
import sys
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

# Campaign ID → sitelinks mapping (IDs from our DB)
SITELINK_PLAN = {
    # Vapi campaigns
    23584242475: {  # 202602 TOFU AI Agent Vapi SA AMER
        "name": "Vapi SA AMER",
        "sitelinks": [
            ("Own the Stack End-to-End", "https://telnyx.com/voice-ai"),
            ("AI + Telephony, One Network", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Migrate Without Downtime", "https://telnyx.com/voice-ai"),
        ]
    },
    23584242652: {  # 202602 TOFU AI Agent Vapi SA EMEA
        "name": "Vapi SA EMEA",
        "sitelinks": [
            ("Own the Stack End-to-End", "https://telnyx.com/voice-ai"),
            ("AI + Telephony, One Network", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Migrate Without Downtime", "https://telnyx.com/voice-ai"),
        ]
    },
    23583186449: {  # 202602 TOFU AI Agent Vapi SA APAC
        "name": "Vapi SA APAC",
        "sitelinks": [
            ("Own the Stack End-to-End", "https://telnyx.com/voice-ai"),
            ("AI + Telephony, One Network", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Migrate Without Downtime", "https://telnyx.com/voice-ai"),
        ]
    },
    
    # ElevenLabs campaigns
    23574277866: {  # 202602 TOFU AI Agent ElevenLabs SA AMER
        "name": "ElevenLabs SA AMER",
        "sitelinks": [
            ("AI + Telephony, Same Edge", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Start Building Now", "https://telnyx.com/sign-up"),
        ]
    },
    23584242697: {  # 202602 TOFU AI Agent ElevenLabs SA EMEA
        "name": "ElevenLabs SA EMEA",
        "sitelinks": [
            ("AI + Telephony, Same Edge", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Start Building Now", "https://telnyx.com/sign-up"),
        ]
    },
    23583187406: {  # 202602 TOFU AI Agent ElevenLabs SA APAC
        "name": "ElevenLabs SA APAC",
        "sitelinks": [
            ("AI + Telephony, Same Edge", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Start Building Now", "https://telnyx.com/sign-up"),
        ]
    },
    
    # LiveKit campaigns
    23583479504: {  # 202602 TOFU AI Agent LiveKit SA AMER
        "name": "LiveKit SA AMER",
        "sitelinks": [
            ("Voice AI on Private Network", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops, No Jitter", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("See Pricing", "https://telnyx.com/pricing"),
        ]
    },
    23583479729: {  # 202602 TOFU AI Agent LiveKit SA EMEA
        "name": "LiveKit SA EMEA",
        "sitelinks": [
            ("Voice AI on Private Network", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops, No Jitter", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("See Pricing", "https://telnyx.com/pricing"),
        ]
    },
    23577831282: {  # 202602 TOFU AI Agent LiveKit SA APAC
        "name": "LiveKit SA APAC",
        "sitelinks": [
            ("Voice AI on Private Network", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops, No Jitter", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("See Pricing", "https://telnyx.com/pricing"),
        ]
    },
    
    # Retell campaigns
    23583187088: {  # 202602 TOFU Retell AI Agent SA APAC
        "name": "Retell SA APAC",
        "sitelinks": [
            ("Voice AI on Private Network", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops, No Jitter", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("See Pricing", "https://telnyx.com/pricing"),
        ]
    },
    23642786782: {  # 202603 TOFU Retell AI Agent SA EMEA
        "name": "Retell SA EMEA",
        "sitelinks": [
            ("Voice AI on Private Network", "https://telnyx.com/voice-ai"),
            ("No Carrier Hops, No Jitter", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("See Pricing", "https://telnyx.com/pricing"),
        ]
    },
    
    # TTS/STT campaigns
    23277159104: {  # 202511 TOFU AI Agents TTS API Global
        "name": "TTS API Global",
        "sitelinks": [
            ("TTS + Telephony, Same Edge", "https://telnyx.com/products/ai-tts"),
            ("HD Voice + Noise Suppression", "https://telnyx.com/voice-ai"),
            ("OpenAI, ElevenLabs, Deepgram", "https://telnyx.com/products/ai-models"),
            ("See the Docs", "https://telnyx.com/docs"),
        ]
    },
    23372928600: {  # 202512 TOFU AI Agent STT API SA GLOBAL
        "name": "STT API Global",
        "sitelinks": [
            ("STT + Telephony, Same Edge", "https://telnyx.com/products/ai-stt"),
            ("HD Voice + Noise Suppression", "https://telnyx.com/voice-ai"),
            ("Deepgram, OpenAI, AssemblyAI", "https://telnyx.com/products/ai-models"),
            ("Developer Portal", "https://developers.telnyx.com"),
        ]
    },
    
    # BOFU DA
    22634140704: {  # 202506 BOFU AI Agent DA VA GLOBAL
        "name": "BOFU AI Agent DA GLOBAL",
        "sitelinks": [
            ("AI Agents That Act on Calls", "https://telnyx.com/voice-ai"),
            ("Built for Real Traffic", "https://telnyx.com/voice-ai"),
            ("Claude, GPT-4o, Gemini, More", "https://telnyx.com/products/ai-models"),
            ("Watch Demo", "https://telnyx.com/voice-ai#demo"),
        ]
    },
    
    # Contact Center campaigns
    23578096203: {  # 202602 TOFU AI Agent Contact Center SA AMER
        "name": "Contact Center SA AMER",
        "sitelinks": [
            ("AI Agents That Act on Calls", "https://telnyx.com/products/contact-center"),
            ("Built for Real Traffic", "https://telnyx.com/products/contact-center"),
            ("Integrates Mid-Call", "https://telnyx.com/products/contact-center"),
            ("Talk to Sales", "https://telnyx.com/contact-us"),
        ]
    },
    23583442793: {  # 202602 TOFU AI Agent Contact Center SA EMEA
        "name": "Contact Center SA EMEA",
        "sitelinks": [
            ("AI Agents That Act on Calls", "https://telnyx.com/products/contact-center"),
            ("Built for Real Traffic", "https://telnyx.com/products/contact-center"),
            ("Integrates Mid-Call", "https://telnyx.com/products/contact-center"),
            ("Talk to Sales", "https://telnyx.com/contact-us"),
        ]
    },
    23578113243: {  # 202602 TOFU AI Agent Contact Center SA APAC
        "name": "Contact Center SA APAC",
        "sitelinks": [
            ("AI Agents That Act on Calls", "https://telnyx.com/products/contact-center"),
            ("Built for Real Traffic", "https://telnyx.com/products/contact-center"),
            ("Integrates Mid-Call", "https://telnyx.com/products/contact-center"),
            ("Talk to Sales", "https://telnyx.com/contact-us"),
        ]
    },
    
    # MOFU campaigns
    23579649257: {  # 202602 MOFU AI Agent SA AMER
        "name": "MOFU AI Agent SA AMER",
        "sitelinks": [
            ("See the Architecture Diff", "https://telnyx.com/voice-ai"),
            ("Voice AI Without the Hacks", "https://telnyx.com/voice-ai"),
            ("Global Coverage, One Contract", "https://telnyx.com/voice-ai"),
            ("Compare Platforms", "https://telnyx.com/voice-ai#compare"),
        ]
    },
    23584242154: {  # 202602 MOFU AI Agent SA EMEA
        "name": "MOFU AI Agent SA EMEA",
        "sitelinks": [
            ("See the Architecture Diff", "https://telnyx.com/voice-ai"),
            ("Voice AI Without the Hacks", "https://telnyx.com/voice-ai"),
            ("Global Coverage, One Contract", "https://telnyx.com/voice-ai"),
            ("Compare Platforms", "https://telnyx.com/voice-ai#compare"),
        ]
    },
    23583187853: {  # 202602 MOFU AI Agent SA APAC
        "name": "MOFU AI Agent SA APAC",
        "sitelinks": [
            ("See the Architecture Diff", "https://telnyx.com/voice-ai"),
            ("Voice AI Without the Hacks", "https://telnyx.com/voice-ai"),
            ("Global Coverage, One Contract", "https://telnyx.com/voice-ai"),
            ("Compare Platforms", "https://telnyx.com/voice-ai#compare"),
        ]
    },
    23588051725: {  # 202602 MOFU AI Agent SA MENA
        "name": "MOFU AI Agent SA MENA",
        "sitelinks": [
            ("See the Architecture Diff", "https://telnyx.com/voice-ai"),
            ("Voice AI Without the Hacks", "https://telnyx.com/voice-ai"),
            ("Global Coverage, One Contract", "https://telnyx.com/voice-ai"),
            ("Compare Platforms", "https://telnyx.com/voice-ai#compare"),
        ]
    },
    
    # Twilio campaigns
    21778360532: {  # 202211 TOFU Voice API Twilio SA AMER
        "name": "Twilio SA AMER",
        "sitelinks": [
            ("99.999% on Owned Network", "https://telnyx.com/products/voice"),
            ("Private Backbone, Not AWS", "https://telnyx.com/products/voice"),
            ("Drop-In Twilio Migration", "https://telnyx.com/solutions/twilio-alternative"),
            ("See Pricing", "https://telnyx.com/pricing/voice"),
        ]
    },
    20304732701: {  # 202305 TOFU Voice API Twilio SA EMEA
        "name": "Twilio SA EMEA",
        "sitelinks": [
            ("99.999% on Owned Network", "https://telnyx.com/products/voice"),
            ("Private Backbone, Not AWS", "https://telnyx.com/products/voice"),
            ("Drop-In Twilio Migration", "https://telnyx.com/solutions/twilio-alternative"),
            ("See Pricing", "https://telnyx.com/pricing/voice"),
        ]
    },
    20315106470: {  # 202306 BOFU Voice API Twilio DA GLOBAL
        "name": "Twilio DA GLOBAL",
        "sitelinks": [
            ("99.999% on Owned Network", "https://telnyx.com/products/voice"),
            ("Private Backbone, Not AWS", "https://telnyx.com/products/voice"),
            ("Drop-In Twilio Migration", "https://telnyx.com/solutions/twilio-alternative"),
            ("See Pricing", "https://telnyx.com/pricing/voice"),
        ]
    },
    23577831258: {  # 202602 TOFU Voice API Twilio SA APAC
        "name": "Twilio SA APAC",
        "sitelinks": [
            ("99.999% on Owned Network", "https://telnyx.com/products/voice"),
            ("Private Backbone, Not AWS", "https://telnyx.com/products/voice"),
            ("Drop-In Twilio Migration", "https://telnyx.com/solutions/twilio-alternative"),
            ("See Pricing", "https://telnyx.com/pricing/voice"),
        ]
    },
}

CUSTOMER_ID = "2356650573"  # Client account (not MCC)


def get_existing_campaign_sitelinks(client, customer_id, campaign_id):
    """Get existing sitelink assets linked to a campaign."""
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT 
            campaign_asset.resource_name,
            campaign_asset.asset,
            asset.sitelink_asset.link_text,
            asset.sitelink_asset.final_urls
        FROM campaign_asset
        WHERE campaign_asset.campaign = 'customers/{customer_id}/campaigns/{campaign_id}'
        AND campaign_asset.field_type = 'SITELINK'
        AND campaign_asset.status != 'REMOVED'
    """
    sitelinks = []
    try:
        response = ga_service.search(customer_id=customer_id, query=query)
        for row in response:
            sitelinks.append({
                "resource_name": row.campaign_asset.resource_name,
                "asset": row.campaign_asset.asset,
                "text": row.asset.sitelink_asset.link_text,
                "url": row.asset.sitelink_asset.final_urls[0] if row.asset.sitelink_asset.final_urls else None
            })
    except GoogleAdsException as ex:
        print(f"    Warning: Could not fetch existing sitelinks: {ex.error.code().name}")
    return sitelinks


def create_sitelink_asset(client, customer_id, link_text, final_url):
    """Create a sitelink asset at account level."""
    asset_service = client.get_service("AssetService")
    asset_operation = client.get_type("AssetOperation")
    asset = asset_operation.create
    
    asset.sitelink_asset.link_text = link_text[:25]  # Max 25 chars
    asset.final_urls.append(final_url)  # final_urls is on Asset, not SitelinkAsset
    
    response = asset_service.mutate_assets(
        customer_id=customer_id, operations=[asset_operation]
    )
    return response.results[0].resource_name


def link_sitelink_to_campaign(client, customer_id, campaign_id, asset_resource_name):
    """Link a sitelink asset to a campaign."""
    campaign_asset_service = client.get_service("CampaignAssetService")
    campaign_asset_operation = client.get_type("CampaignAssetOperation")
    campaign_asset = campaign_asset_operation.create
    
    campaign_asset.campaign = f"customers/{customer_id}/campaigns/{campaign_id}"
    campaign_asset.asset = asset_resource_name
    campaign_asset.field_type = client.enums.AssetFieldTypeEnum.SITELINK
    
    response = campaign_asset_service.mutate_campaign_assets(
        customer_id=customer_id, operations=[campaign_asset_operation]
    )
    return response.results[0].resource_name


def remove_campaign_sitelinks(client, customer_id, sitelinks_to_remove):
    """Remove sitelinks from a campaign."""
    if not sitelinks_to_remove:
        return
    
    campaign_asset_service = client.get_service("CampaignAssetService")
    operations = []
    
    for sitelink in sitelinks_to_remove:
        operation = client.get_type("CampaignAssetOperation")
        operation.remove = sitelink["resource_name"]
        operations.append(operation)
    
    campaign_asset_service.mutate_campaign_assets(
        customer_id=customer_id, operations=operations
    )


def main():
    parser = argparse.ArgumentParser(description="Update sitelinks on Google Ads campaigns")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without applying")
    args = parser.parse_args()
    
    client = GoogleAdsClient.load_from_storage(
        path=os.path.expanduser("~/.config/google-ads/google-ads.yaml")
    )
    
    print(f"{'[DRY RUN] ' if args.dry_run else ''}Updating sitelinks for {len(SITELINK_PLAN)} campaigns\n")
    
    success_count = 0
    error_count = 0
    
    for campaign_id, config in SITELINK_PLAN.items():
        print(f"\n{'='*60}")
        print(f"Campaign: {config['name']} (ID: {campaign_id})")
        
        # Get existing sitelinks
        existing = get_existing_campaign_sitelinks(client, CUSTOMER_ID, campaign_id)
        print(f"  Existing sitelinks: {len(existing)}")
        for s in existing:
            print(f"    - {s['text']}")
        
        # New sitelinks to add
        print(f"  New sitelinks:")
        for text, url in config["sitelinks"]:
            print(f"    + {text} → {url}")
        
        if args.dry_run:
            print(f"  [DRY RUN] Would remove {len(existing)} existing and add {len(config['sitelinks'])} new")
            success_count += 1
            continue
        
        try:
            # Remove existing sitelinks first
            if existing:
                print(f"  Removing {len(existing)} existing sitelinks...")
                remove_campaign_sitelinks(client, CUSTOMER_ID, existing)
                print(f"    ✓ Removed")
            
            # Create and link new sitelinks
            for text, url in config["sitelinks"]:
                # Create asset
                asset_resource = create_sitelink_asset(client, CUSTOMER_ID, text, url)
                # Link to campaign
                link_sitelink_to_campaign(client, CUSTOMER_ID, campaign_id, asset_resource)
                print(f"    ✓ Added: {text}")
            
            success_count += 1
            print(f"  ✅ Updated successfully")
            
        except GoogleAdsException as ex:
            error_count += 1
            print(f"  ❌ Error: {ex.error.code().name}")
            for error in ex.failure.errors:
                print(f"     {error.message}")
    
    print(f"\n{'='*60}")
    print(f"Summary: {success_count} successful, {error_count} errors")
    
    if args.dry_run:
        print("\nThis was a dry run. Run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()
