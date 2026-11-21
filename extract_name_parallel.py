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
from marketplace import fetch_marketplace, fetch_transfers

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

def get_character_info(nft_id: int):

    url = f"{BASE_URL}{nft_id}"

    session = get_session()

    try:

        # Small random jitter prevents all workers from
        # hammering the server at exactly the same time.
        time.sleep(
            random.uniform(
                0,
                0.15,
            )
        )

        response = session.get(
            url,

            # 10 sec connection timeout
            # 45 sec response/read timeout
            timeout=(
                10,
                45,
            ),
        )

        response.raise_for_status()


        soup = BeautifulSoup(
            response.text,
            "html.parser",
        )


        # ====================================================
        # Character Name
        # ====================================================

        name_element = soup.find(
            "div",
            class_=lambda classes: (
                classes
                and "sectionCharacter_characterName" in classes
            ),
        )


        # Actual successful HTTP response,
        # but NFT does not exist.
        if name_element is None:

            return {
                "nft_id": nft_id,
                "status": "not_found",
                "character_name": None,
                "server": None,
                "gp": None,
                "character_class": None,
                "starting_price": None,
                "error": None,
            }


        character_name = name_element.get_text(
            strip=True
        )


        # ====================================================
        # GP
        # ====================================================

        gp_element = soup.find(
            "div",
            class_=lambda classes: (
                classes
                and "sectionCharacter_breakAll" in classes
            ),
        )


        gp = (
            gp_element.get_text(
                strip=True
            )
            if gp_element
            else None
        )


        # ====================================================
        # Server
        # ====================================================

        server = get_streamed_field(
            soup,
            "Server",
        )


        # ====================================================
        # Class / Job
        # ====================================================

        character_class = get_streamed_field(
            soup,
            "Class",
        )


        # ====================================================
        # YMIR's Starting Price can be a previous price; WEMIX is authoritative.
        # ====================================================

        checked_at = datetime.now(timezone.utc).isoformat()
        try:
            market = fetch_marketplace(session, nft_id)
            market["checked_at"] = checked_at
        except (requests.RequestException, ValueError, TypeError, KeyError) as error:
            market = {"status": "Unknown", "error": str(error), "checked_at": None,
                      "attempted_at": checked_at}
        starting_price = market.get("listed_price", "")
        try:
            transfers = fetch_transfers(session, nft_id)
            transfers["checked_at"] = datetime.now(timezone.utc).isoformat()
        except (requests.RequestException, ValueError, TypeError, KeyError) as error:
            transfers = {"error": str(error), "attempted_at": checked_at}


        return {
            "nft_id": nft_id,
            "status": "found",
            "character_name": character_name,
            "server": server,
            "gp": gp,
            "character_class": character_class,
            "starting_price": starting_price,
            "market": market,
            "observed_at": checked_at,
            "transfers": transfers,
            "error": None,
        }


    except requests.RequestException as e:

        return {
            "nft_id": nft_id,
            "status": "failed",
            "character_name": None,
            "server": None,
            "gp": None,
            "character_class": None,
            "starting_price": None,
            "error": str(e),
        }


# ============================================================
# Main
# ============================================================

def scan_batch(ids, fetch=get_character_info, workers=MAX_WORKERS):
    results = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fetch, nft_id): nft_id for nft_id in ids}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as error:
                result = {"nft_id": futures[future], "status": "failed", "error": str(error)}
            results.append(result)
    return results


def refresh(ids, history):
    results = scan_batch(ids)
    # Retry failed source pages separately, without refetching successful pages.
    failed_ids = [r["nft_id"] for r in results if r["status"] == "failed"]
    if failed_ids:
        retries = {r["nft_id"]: r for r in scan_batch(failed_ids)}
        results = [retries.get(r["nft_id"], r) for r in results]
    for result in results:
        nft_id = result["nft_id"]
        if result["status"] == "found":
            # Retry market/history independently so a market outage cannot erase data.
            for key, fetcher in [("market", fetch_marketplace), ("transfers", fetch_transfers)]:
                if result.get(key, {}).get("error"):
                    try:
                        value = fetcher(get_session(), nft_id)
                        value["checked_at"] = datetime.now(timezone.utc).isoformat()
                        result[key] = value
                    except (requests.RequestException, ValueError, TypeError, KeyError):
                        pass
            result["starting_price"] = result["market"].get("listed_price", "")
            observe(history, result, result["observed_at"])
        else:
            record_scan_failure(history, nft_id, result["status"], datetime.now(timezone.utc).isoformat())
        print(f"{nft_id}: {result['status']}", flush=True)
    return results


def discovery_frontier(history, minimum=END_NFT_ID):
    return max([minimum, *(int(nft_id) for nft_id in history)])


def main():
    parser = argparse.ArgumentParser(description="Refresh the archive and discover newer NFT IDs")
    parser.add_argument("--ids", type=int, nargs="+", help="Refresh selected IDs only")
    parser.add_argument("--discovery-batch", type=int, default=100)
    parser.add_argument("--discovery-limit", type=int, default=1000,
                        help="Maximum new sequential IDs to probe per full run")
    args = parser.parse_args()
    if args.discovery_batch < 1 or args.discovery_limit < 1 or (args.ids and min(args.ids) < 1):
        parser.error("IDs and discovery settings must be positive")
    history = load_history()
    before = set(history)
    frontier = discovery_frontier(history)
    results = refresh(args.ids if args.ids else range(START_NFT_ID, frontier + 1), history)
    discovery = {"mode": "selected IDs" if args.ids else "sequential probes",
                 "start": frontier + 1, "last_probed": frontier, "limit_reached": False}
    if not args.ids:
        for offset in range(0, args.discovery_limit, args.discovery_batch):
            start = frontier + 1 + offset
            end = min(start + args.discovery_batch, frontier + 1 + args.discovery_limit)
            batch = refresh(range(start, end), history)
            results.extend(batch)
            discovery["last_probed"] = end - 1
            # Stop at a full batch of empty pages, never at a failed request.
            if all(r["status"] == "not_found" for r in batch):
                discovery["stop_reason"] = "Batch of empty NFT pages; higher IDs beyond gaps may exist"
                break
        else:
            discovery["limit_reached"] = True
            discovery["stop_reason"] = "Discovery budget reached; increase --discovery-limit to probe farther"
    successful = sum(r["status"] == "found" for r in results)
    if not successful:
        raise RuntimeError("No characters fetched; preserving previous archive and scan report")
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(), "attempted": len(results),
        "successful": successful, "archived": len(history), "new_characters": len(set(history) - before),
        "failed_ids": [r["nft_id"] for r in results if r["status"] == "failed"],
        "missing_archived_ids": [r["nft_id"] for r in results if r["status"] == "not_found" and str(r["nft_id"]) in before],
        "market_failed_ids": [r["nft_id"] for r in results if r.get("market", {}).get("error")],
        "history_failed_ids": [r["nft_id"] for r in results if r.get("transfers", {}).get("error")],
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
