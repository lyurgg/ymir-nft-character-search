import csv
import random
import threading
import time
import requests
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone
from character_history import load_history, observe, save_history, record_scan_failure
from marketplace import fetch_marketplace, fetch_transfers, fetch_nft_data, parse_market_info

from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ============================================================
# Configuration
# ============================================================

START_NFT_ID = 1
END_NFT_ID = 5000

MAX_WORKERS = 8
MAX_RETRIES = 2

OUTPUT_CSV = "characters.csv"

BASE_URL = "https://www.legendofymir.com/en/blockchain/nft/"


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


# ============================================================
# Thread-local sessions
# ============================================================

_thread_local = threading.local()


def create_session():
    retry = Retry(
        total=MAX_RETRIES,
        connect=MAX_RETRIES,
        read=MAX_RETRIES,
        status=MAX_RETRIES,
        backoff_factor=1,
        status_forcelist=[
            429,
            500,
            502,
            503,
            504,
        ],
        allowed_methods=["GET"],
        respect_retry_after_header=True,
    )

    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=1,
        pool_maxsize=1,
    )

    session = requests.Session()

    session.headers.update(HEADERS)

    session.mount(
        "https://",
        adapter,
    )

    return session


def get_session():

    if not hasattr(
        _thread_local,
        "session",
    ):
        _thread_local.session = create_session()

    return _thread_local.session


# ============================================================
# Helper: Find streamed field
# ============================================================

def get_streamed_field(soup: BeautifulSoup, field_name: str) -> str | None:

    property_elements = soup.find_all(
        "div",
        class_=lambda classes: (
            classes
            and "sectionCharacter_property" in classes
        ),
    )

    property_element = None

    for element in property_elements:

        text = element.get_text(
            strip=True
        )

        if text.lower() == field_name.lower():

            property_element = element
            break


    if property_element is None:
        return None

    # New markup renders the complete label/value row inside S:<id>.
    direct_value = property_element.parent.find(
        "div", class_=lambda classes: classes and "sectionCharacter_value" in classes,
    )
    if direct_value is not None:
        return direct_value.get_text(strip=True) or None


    streamed_container = property_element.parent
    streamed_id = streamed_container.get("id")

    if not streamed_id or not streamed_id.startswith("S:"):
        return None


    # The page streams each label into S:<id> and leaves a matching
    # P:<id> placeholder in the actual stats row.
    placeholder = soup.find(
        "template",
        id=f"P:{streamed_id[2:]}",
    )

    if placeholder is None or placeholder.parent is None:
        return None


    row = placeholder.parent


    # Server and Starting Price currently have their value directly
    # inside the row.
    value_element = row.find(
        "div",
        class_=lambda classes: (
            classes
            and "sectionCharacter_value" in classes
        ),
    )

    if value_element is not None:
        return value_element.get_text(strip=True) or None


    # Class is streamed separately: the next P:<id> in the same row
    # points to an S:<id> container holding sectionCharacter_value.
    passed_property_placeholder = False

    for candidate in row.find_all("template"):

        if candidate is placeholder:
            passed_property_placeholder = True
            continue

        if not passed_property_placeholder:
            continue

        candidate_id = candidate.get("id", "")

        if not candidate_id.startswith("P:"):
            continue

        value_container = soup.find(
            id=f"S:{candidate_id[2:]}",
        )

        if value_container is None:
            continue

        value_element = value_container.find(
            "div",
            class_=lambda classes: (
                classes
                and "sectionCharacter_value" in classes
            ),
        )

        if value_element is not None:
            return value_element.get_text(strip=True) or None


    return None


# ============================================================
# Get character information
# ============================================================

def history_due(entry, owner, now=None):
    now = now or datetime.now(timezone.utc)
    check = entry.get("transfer_check", {})
    if check.get("error") or check.get("all_returned") is False:
        return True
    if entry.get("character", {}).get("market", {}).get("owner") != owner:
        return True
    try:
        checked = datetime.fromisoformat(check["checked_at"].replace("Z", "+00:00"))
        return (now - checked).total_seconds() >= 7 * 86400
    except (KeyError, ValueError, TypeError):
        return True


def get_character_info(nft_id: int, entry=None):
    session = get_session()
    try:
        info = fetch_nft_data(session, nft_id)
        if info is None:
            return {"nft_id": nft_id, "status": "not_found", "error": None}
        metadata = info.get("metaData") or {}
        name = str(info.get("nftName") or metadata.get("name") or "").strip()
        if not name:
            return {"nft_id": nft_id, "status": "failed", "error": "NFT exists but character metadata is unavailable"}
        attributes = {str(row.get("key")): row.get("value") for row in metadata.get("attributes") or []}
        checked_at = datetime.now(timezone.utc).isoformat()
        market = {**parse_market_info(info, nft_id), "checked_at": checked_at}
        gp = attributes.get("GrowthPower", "")
        try:
            gp = format(int(gp), ",")
        except (ValueError, TypeError):
            gp = str(gp or "")
        server = str(attributes.get("Server") or "").split(" - ", 1)[-1]
        transfers = None
        if history_due(entry or {}, market.get("owner")):
            try:
                transfers = {**fetch_transfers(session, nft_id), "checked_at": datetime.now(timezone.utc).isoformat()}
            except (requests.RequestException, ValueError, TypeError, KeyError) as error:
                transfers = {"error": str(error), "attempted_at": checked_at}
        return {"nft_id": nft_id, "status": "found", "character_name": name,
                "server": server, "gp": gp, "character_class": str(attributes.get("Class") or ""),
                "starting_price": market.get("listed_price", ""), "market": market,
                "observed_at": checked_at, "transfers": transfers, "error": None}
    except (requests.RequestException, ValueError, TypeError, KeyError) as error:
        return {"nft_id": nft_id, "status": "failed", "error": str(error)}


# ============================================================
# Main
# ============================================================

def scan_batch(ids, fetch=get_character_info, workers=MAX_WORKERS):
    results = []
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch, nft_id): nft_id for nft_id in ids}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as error:
                result = {"nft_id": futures[future], "status": "failed", "error": str(error)}
            results.append(result)
            if len(results) % 50 == 0 or len(results) == len(futures):
                print(f"Fetched {len(results)}/{len(futures)} in {time.monotonic()-started:.0f}s", flush=True)
    return results


def refresh(ids, history):
    fetch = lambda nft_id: get_character_info(nft_id, history.get(str(nft_id), {}))
    results = scan_batch(ids, fetch=fetch)
    # Retry failed source pages separately, without refetching successful pages.
    failed_ids = [r["nft_id"] for r in results if r["status"] == "failed"]
    if failed_ids:
        retries = {r["nft_id"]: r for r in scan_batch(failed_ids, fetch=fetch)}
        results = [retries.get(r["nft_id"], r) for r in results]
    for result in results:
        nft_id = result["nft_id"]
        if result["status"] == "found":
            result["starting_price"] = result["market"].get("listed_price", "")
            observe(history, result, result["observed_at"])
        else:
            record_scan_failure(history, nft_id, result["status"], datetime.now(timezone.utc).isoformat())

    return results


def discovery_frontier(history, minimum=END_NFT_ID):
    return max([minimum, *(int(nft_id) for nft_id in history)])


def main():
    parser = argparse.ArgumentParser(description="Refresh character and ownership data within IDs 1 through 5000")
    parser.add_argument("--ids", type=int, nargs="+", help="Refresh selected IDs only")
    parser.add_argument("--end-id", type=int, default=5000, help="Inclusive scan ceiling (default: 5000)")
    args = parser.parse_args()
    if not 1 <= args.end_id <= 5000 or (args.ids and (min(args.ids) < 1 or max(args.ids) > args.end_id)):
        parser.error("Scan IDs must be between 1 and --end-id (maximum 5000)")
    started = time.monotonic()
    history = load_history()
    before = set(history)
    frontier = args.end_id
    results = refresh(args.ids if args.ids else range(START_NFT_ID, frontier + 1), history)
    discovery = {"mode": "selected IDs" if args.ids else "bounded scan", "ceiling": frontier,
                 "start": min(args.ids) if args.ids else START_NFT_ID, "last_probed": max(args.ids) if args.ids else frontier, "limit_reached": False}
    successful = sum(r["status"] == "found" for r in results)
    if not successful:
        raise RuntimeError("No characters fetched; preserving previous archive and scan report")
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(), "duration_seconds": round(time.monotonic() - started, 1), "attempted": len(results),
        "successful": successful, "archived": len(history), "new_characters": len(set(history) - before),
        "failed_ids": [r["nft_id"] for r in results if r["status"] == "failed"],
        "missing_archived_ids": [r["nft_id"] for r in results if r["status"] == "not_found" and str(r["nft_id"]) in before],
        "market_failed_ids": [r["nft_id"] for r in results if r.get("market", {}).get("error")],
        "history_failed_ids": [r["nft_id"] for r in results if (r.get("transfers") or {}).get("error")],
        "discovery": discovery,
    }
    fields = ["nft_id", "character_name", "server", "gp", "character_class", "starting_price"]
    temporary = Path(OUTPUT_CSV).with_suffix(".tmp")
    with temporary.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=fields)
        writer.writeheader()
        for nft_id, entry in sorted(history.items(), key=lambda item: int(item[0])):
            old = entry.get("character", {})
            writer.writerow({key: int(nft_id) if key == "nft_id" else old.get(key, "") for key in fields})
    save_history(history)
    temporary.replace(OUTPUT_CSV)
    Path("scan_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
