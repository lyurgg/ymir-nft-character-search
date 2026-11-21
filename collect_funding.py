"""Optional bounded native-WEMIX collector. Never part of the NFT scrape loop."""
import argparse
import os
import time
from datetime import datetime, timezone
from pathlib import Path
import requests
from funding import native_transfer, scan_native_transfer, purchase_records, funding_branches
from json_store import load_json, save_json


def collect(nft_ids, page_limit=3, max_depth=1, lookback_days=7, wallet_limit=100, provider="scan"):
    if max_depth not in (1, 2, 3) or wallet_limit < 1 or lookback_days < 1 or page_limit < 1 or provider not in ("scan", "legacy"):
        raise ValueError("Depth must be 1–3; wallet limit and lookback must be positive")
    history = load_json(Path("character_history.json"))
    purchases = purchase_records(history, nft_ids)
    result = {"schema_version": 1, "chain_id": 1111, "asset": "WEMIX",
              "checked_at": datetime.now(timezone.utc).isoformat(), "transfers": [], "coverage": [],
              "source": "WEMIX Scan API (CertiK)" if provider == "scan" else "WEMIX Explorer API", "scope": "external native WEMIX transfers only"}
    api_key = os.environ.get("WEMIX_EXPLORER_API_KEY")
    if provider == "legacy" and not api_key:
        raise RuntimeError("Set WEMIX_EXPLORER_API_KEY to use the transaction-history API; NFT scraping does not require it")
    session = requests.Session()
    if provider == "legacy":
        session.headers["api-key"] = api_key
    path = Path("funding_history.json")
    old = load_json(path) if path.exists() else {}
    if old and (old.get("chain_id") != 1111 or old.get("asset") != "WEMIX"):
        raise ValueError("Existing funding history is for a different chain or asset")
    all_transfers = {row["tx_hash"]: row for row in old.get("transfers", [])}
    saved_coverage = {row["wallet"]: row for row in old.get("coverage", [])}
    fetched = set()
    result.update(max_depth=max_depth, lookback_days=lookback_days, wallet_limit_reached=False, search_limit_reached=False)
    for layer in range(max_depth):
        _, required, truncated = funding_branches(purchases, list(all_transfers.values()), lookback_days=lookback_days, max_depth=max_depth)
        result["search_limit_reached"] |= truncated
        pending = sorted(required - fetched)
        if not pending:
            break
        remaining = wallet_limit - len(fetched)
        if len(pending) > remaining:
            result["wallet_limit_reached"] = True
        for wallet in pending[:remaining]:
            seen = 0
            coverage = {"wallet": wallet, "complete": False, "records_checked": 0}
            try:
                for page in range(min(page_limit, 10) if provider == "scan" else page_limit):
                    # The documented API permits 120 requests/minute.
                    time.sleep(.55)
                    if provider == "scan":
                        response = session.get(f"https://scan.wemix.com/api/account/{wallet}/tx-list",
                                               params={"chain": "wemix", "page": page + 1, "offset": 1000, "sort": "desc"}, timeout=(5, 20))
                        response.raise_for_status()
                        data = response.json()
                        rows = data.get("transactions")
                        if not isinstance(rows, list):
                            raise ValueError("WEMIX Scan history schema changed")
                        seen += len(rows)
                        coverage.update(records_checked=seen)
                        complete = len(rows) < 1000
                        normalizer = scan_native_transfer
                    else:
                        response = session.get(f"https://explorerapi.wemix.com/v1/accounts/{wallet}/transactions",
                                               params={"limit": 1000, "offset": page * 1000}, timeout=(5, 20))
                        response.raise_for_status()
                        payload = response.json()
                        if str(payload.get("status")) != "200":
                            raise ValueError("History API returned an unsuccessful response")
                        data = payload["results"]
                        rows = data["data"]
                        if not isinstance(rows, list):
                            raise ValueError("History API response schema changed")
                        seen += len(rows)
                        coverage.update(records_checked=seen, reported_total=int(data["count"]))
                        complete = seen >= int(data["count"])
                        normalizer = native_transfer
                    for row in rows:
                        transfer = normalizer(row)
                        if transfer:
                            all_transfers[transfer["tx_hash"]] = transfer
                    if complete:
                        coverage["complete"] = True
                        break
                    if not rows:
                        break
            except (requests.RequestException, KeyError, ValueError, TypeError) as error:
                coverage["error"] = str(error)
            saved_coverage[wallet] = coverage
            fetched.add(wallet)
    result["transfers"] = list(all_transfers.values())
    result["coverage"] = list(saved_coverage.values())
    result["status"] = "partial" if result["wallet_limit_reached"] or result["search_limit_reached"] or any(not row["complete"] for row in result["coverage"]) else "collected"
    save_json(path, result, list_field="transfers")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--nft-ids", type=int, nargs="+", required=True)
    parser.add_argument("--max-pages", type=int, default=3)
    parser.add_argument("--provider", choices=["scan", "legacy"], default="scan")
    parser.add_argument("--max-depth", type=int, choices=[1, 2, 3], default=1)
    parser.add_argument("--lookback-days", type=int, default=7)
    parser.add_argument("--max-wallets", type=int, default=100)
    args = parser.parse_args()
    if args.max_pages < 1 or args.lookback_days < 1 or args.max_wallets < 1:
        parser.error("--max-pages must be positive")
    result = collect(args.nft_ids, args.max_pages, args.max_depth, args.lookback_days, args.max_wallets, args.provider)
    print(f"Saved {len(result['transfers'])} transfers; coverage: {result['status']}")
