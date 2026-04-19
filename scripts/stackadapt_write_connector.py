#!/usr/bin/env python3
"""
StackAdapt Write Connector
============================
Handles writing ABM audience data to StackAdapt via their GraphQL API.

Capabilities:
1. create_abm_audience(name, description) → audience_id
2. update_audience_with_domains(audience_id, domains[]) → success
3. attach_audience_to_campaign(audience_id, campaign_id) → success
4. list_audiences() → [{id, name, size}]
5. get_campaign_id_by_name(campaign_name) → campaign_id

Uses StackAdapt GraphQL API (production environment).
Rate limit: 10 requests/second.

Run as module: from stackadapt_write_connector import StackAdaptConnector
"""

import json
import os
import sys
import time
import logging
from datetime import datetime, timezone

# ─── Config ───────────────────────────────────────────

SA_CREDENTIALS_PATH = os.path.expanduser("~/.config/stackadapt/credentials.json")
SA_GRAPHQL_URL = "https://api.stackadapt.com/graphql"  # Correct GraphQL endpoint
SA_ADVERTISER_ID = "93053"  # Telnyx advertiser ID (not 197373 from config)
RATE_LIMIT_DELAY = 0.15  # 150ms between requests (~6.7 req/s)

logger = logging.getLogger("stackadapt-connector")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(handler)


class StackAdaptConnector:
    """StackAdapt GraphQL API connector for ABM audience management."""

    def __init__(self, credentials_path=None):
        self.credentials = self._load_credentials(credentials_path or SA_CREDENTIALS_PATH)
        self.api_token = self.credentials["graphql"]["token"]
        self.advertiser_id = SA_ADVERTISER_ID  # Use correct Telnyx ID
        self.rest_api_key = self.credentials.get("rest_api_key", "")
        self._last_request_time = 0

    def _load_credentials(self, path):
        """Load StackAdapt credentials from JSON file."""
        if not os.path.exists(path):
            raise FileNotFoundError(f"StackAdapt credentials not found at {path}")
        with open(path) as f:
            return json.load(f)

    def _rate_limit(self):
        """Enforce rate limit between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            time.sleep(RATE_LIMIT_DELAY - elapsed)
        self._last_request_time = time.time()

    def _graphql_request(self, query, variables=None):
        """Execute a GraphQL request against the StackAdapt API."""
        self._rate_limit()

        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        import urllib.request
        data = json.dumps(payload).encode()

        req = urllib.request.Request(
            SA_GRAPHQL_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_token}",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode())
                if "errors" in result:
                    logger.error(f"GraphQL errors: {result['errors']}")
                    raise Exception(f"GraphQL error: {result['errors'][0]['message']}")
                return result.get("data", {})
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            logger.error(f"HTTP {e.code}: {body[:200]}")
            raise

    # ─── Audience Management ────────────────────────────

    def create_abm_audience(self, name, domains=None, countries=None):
        """
        Create a new ABM audience in StackAdapt using the Bombora domains-list provider.
        
        Args:
            name: Audience name
            domains: list of domain strings (up to 1000)
            countries: list of country codes (e.g., ["US", "GB"]). Defaults to ["US"]
        
        Returns: audience_id (str)
        """
        if not countries:
            countries = ["US"]
        if not domains:
            domains = []
        
        query = """
        mutation createAbmAudience($input: CreateAbmAudienceWithDomainsListInput!) {
            createAbmAudienceWithDomainsList(input: $input) {
                abmAudience {
                    id
                    name
                    size
                }
            }
        }
        """
        variables = {
            "input": {
                "bombora": {
                    "name": name,
                    "domainsList": domains[:1000],  # Max 1000 per request
                    "countries": countries,
                }
            }
        }
        result = self._graphql_request(query, variables)
        audience = result.get("createAbmAudienceWithDomainsList", {}).get("abmAudience", {})
        logger.info(f"Created ABM audience: {audience.get('name')} (id={audience.get('id')}, size={audience.get('size')})")
        return audience.get("id")

    def update_audience_with_domains(self, audience_id, domains, action="ADD"):
        """
        Update an existing ABM audience with domains using the Bombora domains-list provider.
        
        Args:
            audience_id: StackAdapt ABM audience ID
            domains: list of domain strings (up to 1000 per batch)
            action: "ADD" or "REPLACE" (REPLACE = full overwrite)
        
        Returns: success (bool)
        """
        if not domains:
            logger.warning("No domains provided for audience update")
            return False

        batch_size = 1000  # StackAdapt max per request
        all_success = True

        for i in range(0, len(domains), batch_size):
            batch = domains[i:i + batch_size]
            
            query = """
            mutation updateAbmAudience($input: UpdateAbmAudienceWithDomainsListInput!) {
                updateAbmAudienceWithDomainsList(input: $input) {
                    abmAudience {
                        id
                        name
                        size
                    }
                }
            }
            """
            
            variables = {
                "input": {
                    "bombora": {
                        "id": str(audience_id),
                        "domainsList": batch,
                        "countries": ["US"],
                    }
                }
            }
            
            try:
                result = self._graphql_request(query, variables)
                audience = result.get("updateAbmAudienceWithDomainsList", {}).get("abmAudience", {})
                logger.info(f"Updated audience {audience.get('id')}: size={audience.get('size')}")
            except Exception as e:
                logger.error(f"Error updating audience {audience_id}: {e}")
                all_success = False

        return all_success

    def attach_audience_to_campaign(self, audience_id, campaign_id):
        """
        Attach an ABM audience to a campaign via upsertCampaign.
        Reads current audience settings, adds the new segment ID, and updates.
        
        Args:
            audience_id: StackAdapt custom segment ID
            campaign_id: StackAdapt campaign ID
        
        Returns: success (bool)
        """
        # 1. Read current campaign audience settings
        query = """
        {
          campaigns(filterBy: {ids: [%s]}, first: 1) {
            nodes {
              id
              audience {
                customSegments { nodes { id name } }
                customSegmentExclusions { nodes { id name } }
              }
            }
          }
        }
        """ % campaign_id
        
        result = self._graphql_request(query)
        campaigns = result.get("campaigns", {}).get("nodes", [])
        
        if not campaigns:
            logger.error(f"Campaign {campaign_id} not found")
            return False
        
        target = campaigns[0]
        
        # 2. Build updated segment list (add new one)
        current_segments = target.get("audience", {}).get("customSegments", {}).get("nodes", [])
        current_ids = [str(s["id"]) for s in current_segments]
        
        if str(audience_id) in current_ids:
            logger.info(f"Audience {audience_id} already attached to campaign {campaign_id}")
            return True
        
        new_ids = current_ids + [str(audience_id)]
        
        # 3. Upsert campaign with updated audience
        upsert = """
        mutation upsertCampaign($input: CampaignInput!) {
          upsertCampaign(input: $input) {
            campaign { id name }
          }
        }
        """
        
        variables = {
            "input": {
                "display": {
                    "id": str(campaign_id),
                    "advertiserId": str(self.advertiser_id),
                    "audience": {
                        "customSegmentIds": new_ids
                    }
                }
            }
        }
        
        try:
            result = self._graphql_request(upsert, variables)
            campaign = result.get("upsertCampaign", {}).get("campaign", {})
            logger.info(f"Attached audience {audience_id} to campaign {campaign.get('id')} ({campaign.get('name')})")
            return True
        except Exception as e:
            logger.error(f"Error attaching audience to campaign: {e}")
            return False

    def detach_audience_from_campaign(self, audience_id, campaign_id):
        """
        Remove an ABM audience from a campaign via upsertCampaign.
        Reads current audience settings, removes the segment ID, and updates.
        
        Args:
            audience_id: StackAdapt custom segment ID
            campaign_id: StackAdapt campaign ID
        
        Returns: success (bool)
        """
        # 1. Read current campaign audience settings
        query = """
        {
          campaigns(filterBy: {ids: [%s]}, first: 1) {
            nodes {
              id
              audience {
                customSegments { nodes { id name } }
                customSegmentExclusions { nodes { id name } }
              }
            }
          }
        }
        """ % campaign_id
        
        result = self._graphql_request(query)
        campaigns = result.get("campaigns", {}).get("nodes", [])
        
        if not campaigns:
            logger.error(f"Campaign {campaign_id} not found")
            return False
        
        target = campaigns[0]
        
        # 2. Build updated segment list (remove the one)
        current_segments = target.get("audience", {}).get("customSegments", {}).get("nodes", [])
        current_ids = [str(s["id"]) for s in current_segments]
        
        if str(audience_id) not in current_ids:
            logger.info(f"Audience {audience_id} not attached to campaign {campaign_id}")
            return True
        
        new_ids = [sid for sid in current_ids if sid != str(audience_id)]
        
        # 3. Upsert campaign with updated audience
        upsert = """
        mutation upsertCampaign($input: CampaignInput!) {
          upsertCampaign(input: $input) {
            campaign { id name }
          }
        }
        """
        
        variables = {
            "input": {
                "display": {
                    "id": str(campaign_id),
                    "advertiserId": str(self.advertiser_id),
                    "audience": {
                        "customSegmentIds": new_ids
                    }
                }
            }
        }
        
        try:
            result = self._graphql_request(upsert, variables)
            campaign = result.get("upsertCampaign", {}).get("campaign", {})
            logger.info(f"Detached audience {audience_id} from campaign {campaign.get('id')} ({campaign.get('name')})")
            return True
        except Exception as e:
            logger.error(f"Error detaching audience from campaign: {e}")
            return False

    def add_exclusion_to_campaign(self, exclusion_segment_id, campaign_id):
        """
        Add a segment as an exclusion target on a campaign.
        Used by Negative Builder to push exclusion lists.
        
        Args:
            exclusion_segment_id: StackAdapt custom segment ID to use as exclusion
            campaign_id: StackAdapt campaign ID
        
        Returns: success (bool)
        """
        # 1. Read current campaign audience settings
        query = """
        {
          campaigns(filterBy: {ids: [%s]}, first: 1) {
            nodes {
              id
              audience {
                customSegments { nodes { id name } }
                customSegmentExclusions { nodes { id name } }
              }
            }
          }
        }
        """ % campaign_id
        
        result = self._graphql_request(query)
        campaigns = result.get("campaigns", {}).get("nodes", [])
        
        if not campaigns:
            logger.error(f"Campaign {campaign_id} not found")
            return False
        
        target = campaigns[0]
        
        # 2. Build updated exclusion list
        current_exclusions = target.get("audience", {}).get("customSegmentExclusions", {}).get("nodes", []) or []
        current_excl_ids = [str(e.get("id", e)) for e in current_exclusions]
        
        if str(exclusion_segment_id) in current_excl_ids:
            logger.info(f"Exclusion {exclusion_segment_id} already on campaign {campaign_id}")
            return True
        
        new_excl_ids = current_excl_ids + [str(exclusion_segment_id)]
        
        # 3. Upsert campaign with updated exclusions
        upsert = """
        mutation upsertCampaign($input: CampaignInput!) {
          upsertCampaign(input: $input) {
            campaign { id name }
          }
        }
        """
        
        variables = {
            "input": {
                "display": {
                    "id": str(campaign_id),
                    "advertiserId": str(self.advertiser_id),
                    "audience": {
                        "customSegmentExclusionIds": new_excl_ids
                    }
                }
            }
        }
        
        try:
            result = self._graphql_request(upsert, variables)
            campaign = result.get("upsertCampaign", {}).get("campaign", {})
            logger.info(f"Added exclusion {exclusion_segment_id} to campaign {campaign.get('id')}")
            return True
        except Exception as e:
            logger.error(f"Error adding exclusion to campaign: {e}")
            return False

    def delete_audience(self, audience_id):
        """
        Delete a custom segment (ABM audience) from StackAdapt.
        
        Args:
            audience_id: StackAdapt custom segment ID
        
        Returns: success (bool)
        """
        query = """
        mutation deleteSegment($input: DeleteCustomSegmentInput!) {
          deleteCustomSegment(input: $input) {
            customSegment { id name }
          }
        }
        """
        
        variables = {
            "input": {
                "id": str(audience_id)
            }
        }
        
        try:
            result = self._graphql_request(query, variables)
            segment = result.get("deleteCustomSegment", {}).get("customSegment", {})
            logger.info(f"Deleted segment: {segment.get('name')} (id={segment.get('id')})")
            return True
        except Exception as e:
            logger.error(f"Error deleting segment: {e}")
            return False

    # ─── Read Operations ────────────────────────────────

    def list_audiences(self, limit=200):
        """
        List all custom segments (ABM audiences) for the advertiser.
        Uses the root-level campaigns query to find attached segments,
        then deduplicates to get unique audience list.
        Returns: list of {id, name, size}
        """
        query = """
        {
          campaigns(filterBy: {advertiserIds: [%s]}, first: 200) {
            nodes {
              audience {
                customSegments { nodes { id name size duidSize } }
              }
            }
          }
        }
        """ % self.advertiser_id
        
        result = self._graphql_request(query)
        campaigns = result.get("campaigns", {}).get("nodes", [])
        
        # Deduplicate segments by ID
        seen = {}
        for camp in campaigns:
            segments = camp.get("audience", {}).get("customSegments", {}).get("nodes", [])
            for seg in segments:
                if seg["id"] not in seen:
                    seen[seg["id"]] = seg
        
        return list(seen.values())

    def get_campaign_by_name(self, campaign_name):
        """
        Find a campaign by name via the daaMetadata/search API.
        Note: StackAdapt GraphQL doesn't support campaign name filtering.
        Use list_campaigns() and filter client-side instead.
        Returns: campaign_id (str) or None
        """
        campaigns = self.list_campaigns()
        for c in campaigns:
            if c.get("name") == campaign_name:
                return c["id"]
        return None

    def list_campaigns(self, status=None, limit=200):
        """
        List campaigns for the advertiser.
        Uses the root-level campaigns query with filterBy.
        Returns: list of {id, name, status}
        """
        query = """
        {
          campaigns(filterBy: {advertiserIds: [%s]}, first: %d) {
            nodes {
              id
              name
            }
          }
        }
        """ % (self.advertiser_id, limit)
        
        result = self._graphql_request(query)
        campaigns = result.get("campaigns", {}).get("nodes", [])
        
        if status:
            campaigns = [c for c in campaigns if c.get("status") == status]
        
        return campaigns

    # ─── Convenience Methods ────────────────────────────

    def sync_domains_to_audience(self, audience_name, domains, campaign_name=None):
        """
        Full sync workflow: create/update audience + optionally attach to campaign.
        
        Args:
            audience_name: Name for the audience (e.g., "ABM AI Agent Healthcare")
            domains: list of domain strings
            campaign_name: optional campaign to attach to
        
        Returns: dict with audience_id, domains_added, attached_to_campaign
        """
        result = {
            "audience_id": None,
            "domains_added": 0,
            "attached_to_campaign": False,
            "errors": [],
        }

        # 1. Find or create audience
        existing = self.list_audiences()
        matching = [a for a in existing if a["name"] == audience_name]
        
        if matching:
            audience_id = matching[0]["id"]
            logger.info(f"Found existing audience: {audience_name} (id={audience_id})")
        else:
            try:
                audience_id = self.create_abm_audience(
                    audience_name,
                    description=f"ABM audience managed by DG Hub — {datetime.now().strftime('%Y-%m-%d')}"
                )
            except Exception as e:
                result["errors"].append(f"Failed to create audience: {e}")
                return result
        
        result["audience_id"] = audience_id

        # 2. Add domains
        try:
            success = self.update_audience_with_domains(audience_id, domains, action="ADD")
            if success:
                result["domains_added"] = len(domains)
            else:
                result["errors"].append("Failed to add some domains")
        except Exception as e:
            result["errors"].append(f"Failed to add domains: {e}")

        # 3. Attach to campaign if specified
        if campaign_name:
            campaign_id = self.get_campaign_by_name(campaign_name)
            if campaign_id:
                try:
                    attached = self.attach_audience_to_campaign(audience_id, campaign_id)
                    result["attached_to_campaign"] = attached
                except Exception as e:
                    result["errors"].append(f"Failed to attach to campaign: {e}")
            else:
                result["errors"].append(f"Campaign not found: {campaign_name}")

        return result


# ─── CLI Interface ─────────────────────────────────────

def main():
    """CLI interface for testing the connector."""
    import argparse
    parser = argparse.ArgumentParser(description="StackAdapt Write Connector")
    parser.add_argument("--list-audiences", action="store_true", help="List all audiences")
    parser.add_argument("--list-campaigns", action="store_true", help="List all campaigns")
    parser.add_argument("--create-audience", type=str, help="Create audience with name")
    parser.add_argument("--test", action="store_true", help="Run connection test")
    args = parser.parse_args()
    
    connector = StackAdaptConnector()
    
    if args.test:
        print("Testing StackAdapt connection...")
        audiences = connector.list_audiences(limit=5)
        print(f"✅ Connected! Found {len(audiences)} audiences")
        for a in audiences[:5]:
            print(f"  - {a['name']} (id={a['id']}, size={a.get('size', '?')})")
    
    elif args.list_audiences:
        audiences = connector.list_audiences()
        print(f"Found {len(audiences)} audiences:")
        for a in audiences:
            print(f"  - {a['name']} (id={a['id']}, size={a.get('size', '?')})")
    
    elif args.list_campaigns:
        campaigns = connector.list_campaigns()
        print(f"Found {len(campaigns)} campaigns:")
        for c in campaigns[:20]:
            print(f"  - {c['name']} (id={c['id']}, status={c.get('status', '?')})")
    
    elif args.create_audience:
        audience_id = connector.create_abm_audience(args.create_audience)
        print(f"Created audience: {args.create_audience} (id={audience_id})")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
