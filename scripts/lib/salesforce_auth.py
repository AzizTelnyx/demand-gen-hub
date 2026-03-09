"""
Salesforce auth helper — auto-refreshes token via sfdx CLI.
Usage:
    from lib.salesforce_auth import get_sf_session
    instance_url, headers = get_sf_session()
"""
import json, os, subprocess, sys

CREDS_PATH = os.path.expanduser("~/.config/salesforce/credentials.json")
SFDX_ALIAS = "telnyx-prod"
SFDX_USERNAME = "marketing.squad@telnyx.com"

def _load_creds():
    with open(CREDS_PATH) as f:
        return json.load(f)

def _refresh_token():
    """Get a fresh token from sfdx and update credentials file."""
    result = subprocess.run(
        ["sfdx", "force:org:display", "--targetusername", SFDX_USERNAME, "--json"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"sfdx refresh failed: {result.stderr}")
    
    data = json.loads(result.stdout).get("result", {})
    if not data.get("accessToken"):
        raise RuntimeError("sfdx returned no access token — re-auth with: sfdx auth:web:login -a telnyx-prod")
    
    creds = {
        "instance_url": data["instanceUrl"],
        "access_token": data["accessToken"],
        "username": data["username"],
        "api_version": "65.0",
        "auth_method": "sfdx",
        "sfdx_alias": SFDX_ALIAS,
    }
    with open(CREDS_PATH, "w") as f:
        json.dump(creds, f, indent=2)
    
    return creds

def get_sf_session(force_refresh=False):
    """
    Returns (instance_url, headers) with a valid token.
    Auto-refreshes via sfdx on 401 or if force_refresh=True.
    """
    if force_refresh:
        creds = _refresh_token()
    else:
        creds = _load_creds()
    
    instance_url = creds["instance_url"]
    headers = {
        "Authorization": f"Bearer {creds['access_token']}",
        "Content-Type": "application/json",
    }
    return instance_url, headers

def get_sf_session_with_retry():
    """
    Try current token, refresh on 401.
    Returns (instance_url, headers).
    """
    import urllib.request, urllib.error
    
    creds = _load_creds()
    instance_url = creds["instance_url"]
    headers = {
        "Authorization": f"Bearer {creds['access_token']}",
        "Content-Type": "application/json",
    }
    
    # Quick test
    req = urllib.request.Request(
        f"{instance_url}/services/data/v65.0/limits",
        headers=headers
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        return instance_url, headers
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print("SF token expired, refreshing via sfdx...", file=sys.stderr)
            creds = _refresh_token()
            headers["Authorization"] = f"Bearer {creds['access_token']}"
            return creds["instance_url"], headers
        raise
