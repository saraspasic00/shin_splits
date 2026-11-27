import json
import os
import sys
import urllib.parse
import urllib.request

# Disallow redirects so a bearer credential never follows a redirected URL.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def main():
    url = os.environ["APP_URL"].rstrip("/")
    if not url.startswith("https://"):
        raise ValueError("Set APP_URL to the HTTPS origin of your deployment")
    endpoint = url + "/api/internal/weekly-plans"
    cursor = None
    failures = created = updated = 0
    client = urllib.request.build_opener(NoRedirect)
    while True:
        page = endpoint + ("?" + urllib.parse.urlencode({"after": cursor}) if cursor else "")
        request = urllib.request.Request(page, method="POST", headers={
            "Authorization": "Bearer " + os.environ["WEEKLY_JOB_SECRET"]
        })
        with client.open(request, timeout=60) as response:
            result = json.load(response)
        failures += result["failed"]
        created += result["created"]
        updated += result.get("updated", 0)
        cursor = result["after"]
        if not cursor:
            break
    print(f"Created {created} weekly plans. Updated {updated}. Failed attempts: {failures}.")
    return int(failures > 0)

if __name__ == "__main__":
    sys.exit(main())
