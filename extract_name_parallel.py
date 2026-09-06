import csv
import random
import threading
import time
import requests

from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ============================================================
# Configuration
# ============================================================

START_NFT_ID = 1
END_NFT_ID = 5000

MAX_WORKERS = 25
MAX_RETRIES = 5

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
        # Current marketplace starting price
        # ====================================================

        starting_price = get_streamed_field(
            soup,
            "Starting Price",
        )


        return {
            "nft_id": nft_id,
            "status": "found",
            "character_name": character_name,
            "server": server,
            "gp": gp,
            "character_class": character_class,
            "starting_price": starting_price,
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

def main():

    results = []
    failed = []


    with ThreadPoolExecutor(
        max_workers=MAX_WORKERS
    ) as executor:


        futures = {

            executor.submit(
                get_character_info,
                nft_id,
            ): nft_id

            for nft_id in range(
                START_NFT_ID,
                END_NFT_ID + 1,
            )
        }


        total = len(futures)


        for i, future in enumerate(
            as_completed(futures),
            start=1,
        ):

            result = future.result()

            nft_id = result["nft_id"]


            # =================================================
            # Found
            # =================================================

            if result["status"] == "found":

                results.append({
                    "nft_id": nft_id,
                    "character_name": result["character_name"],
                    "server": result["server"],
                    "gp": result["gp"],
                    "character_class": result["character_class"],
                    "starting_price": result["starting_price"],
                })


                print(
                    f"[{i:4d}/{total}] "
                    f"{nft_id:4d} -> "
                    f"{result['character_name']} | "
                    f"{result['server']} | "
                    f"{result['gp']} | "
                    f"{result['character_class']} | "
                    f"{result['starting_price'] or 'NOT LISTED'}"
                )


            # =================================================
            # Real not found
            # =================================================

            elif result["status"] == "not_found":

                print(
                    f"[{i:4d}/{total}] "
                    f"{nft_id:4d} -> "
                    f"NOT FOUND"
                )


            # =================================================
            # Network failure
            # =================================================

            else:

                failed.append(
                    nft_id
                )

                print(
                    f"[{i:4d}/{total}] "
                    f"{nft_id:4d} -> "
                    f"FAILED: {result['error']}"
                )


    # ========================================================
    # Sort
    # ========================================================

    results.sort(
        key=lambda x: x["nft_id"]
    )


    # ========================================================
    # Write CSV
    # ========================================================

    with open(
        OUTPUT_CSV,
        "w",
        newline="",
        encoding="utf-8",
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=[
                "nft_id",
                "character_name",
                "server",
                "gp",
                "character_class",
                "starting_price",
            ],
        )

        writer.writeheader()

        writer.writerows(
            results
        )


    # ========================================================
    # Summary
    # ========================================================

    print()

    print(
        f"Found {len(results):,} characters."
    )

    print(
        f"Failed requests: {len(failed):,}"
    )

    if failed:

        print(
            f"Failed NFT IDs: {failed}"
        )

    print(
        f"Saved to {OUTPUT_CSV}"
    )


if __name__ == "__main__":
    main()
