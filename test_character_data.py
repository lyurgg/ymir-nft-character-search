import copy
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from bs4 import BeautifulSoup
from character_history import load_history, observe, save_history, clean_price
from extract_name_parallel import get_streamed_field, discovery_frontier, scan_batch, refresh, history_due, get_character_info
from marketplace import COLLECTION, parse_marketplace, token_price, parse_transfers

TOKEN = "0x7d72b22a74a216af4a002a1095c8c707d6ec1c5f"


def market_html(**changes):
    info = dict(tid=8, collectionAddress=COLLECTION, onSale=0,
                currentStatus=dict(isAuction=False, isSales=False,
                                   isBidding=False, isBidOngoing=False, isPossibleOffer=True),
                lastCurrency=TOKEN, orderCurrency=TOKEN,
                lastPrice=dict(amount="1200000000000000000000", valid=True),
                orderPrice=dict(amount="1200000000000000000000", valid=True))
    info.update(changes)
    return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps(
        dict(props=dict(pageProps=dict(nftInfo=info)))) + '</script>'


class MarketTests(unittest.TestCase):
    def test_previous_price_is_not_listing(self):
        market = parse_marketplace(market_html(), 8)
        self.assertEqual(market["listed_price"], "")
        self.assertEqual(market["previous_price"], "1,200")
        self.assertEqual(market["status"], "Open to offers")
        self.assertTrue(market["can_offer"])
        self.assertFalse(market["can_bid"])

    def test_sale_auction_and_blocked(self):
        for flags, expected in [(dict(isSales=True), "Listed"),
                                (dict(isAuction=True, isBidOngoing=True), "Auction")]:
            market = parse_marketplace(market_html(currentStatus=flags), 8)
            self.assertEqual(market["status"], expected)
            self.assertEqual(market["listed_price"], "1,200")
        blocked = parse_marketplace(market_html(isBlock=True), 8)
        self.assertEqual(blocked["status"], "Unavailable")
        self.assertFalse(blocked["can_offer"])

    def test_unknown_and_mismatched_data(self):
        market = parse_marketplace(market_html(currentStatus={}, onSale=None), 8)
        self.assertEqual(market["status"], "Unknown")
        self.assertIsNone(market["can_bid"])
        self.assertIsNone(market["can_offer"])
        for html in ["<html>Maintenance</html>", market_html(tid=9)]:
            with self.assertRaises(ValueError):
                parse_marketplace(html, 8)

    def test_expired_auction_overrides_stale_flags(self):
        market = parse_marketplace(market_html(currentStatus=dict(isAuction=True, isBidOngoing=True), auctionEndTime=100), 8, now=101)
        self.assertEqual(market["status"], "Auction ended")
        self.assertFalse(market["can_bid"])
        self.assertEqual(market["listed_price"], "")

    def test_precise_prices_and_unknown_currency(self):
        self.assertEqual(token_price(dict(amount="1234567890123456789", valid=True), TOKEN), "1.234567890123456789")
        self.assertEqual(token_price(dict(amount="0", valid=True), TOKEN), "0")
        self.assertEqual(token_price(dict(amount="1000", valid=True), "new-token"), "")
        self.assertEqual(clean_price("-"), "")

    def test_direct_and_streamed_fields(self):
        direct = '<div hidden id="S:b"><div><div class="sectionCharacter_property__x">Starting Price</div><div class="sectionCharacter_value__x">1,200</div></div></div>'
        self.assertEqual(get_streamed_field(BeautifulSoup(direct, "html.parser"), "Starting Price"), "1,200")
        old = '<div hidden id="S:b"><div class="sectionCharacter_property__x">Server</div></div><div><template id="P:b"></template><div class="sectionCharacter_value__x">Chess</div></div>'
        self.assertEqual(get_streamed_field(BeautifulSoup(old, "html.parser"), "Server"), "Chess")


class HistoryTests(unittest.TestCase):
    def test_failed_check_retains_freshness_and_last_price_time(self):
        history = {}
        original = dict(nft_id=8, character_name="First", market=dict(listed_price="100", status="Listed", checked_at="2026-11-01T00:00:00Z", owner="0x" + "a" * 40))
        observe(history, original, "2026-11-01T00:00:00Z")
        observe(history, dict(nft_id=8, character_name="First", market=dict(error="outage")), "2026-11-02T00:00:00Z")
        entry = history["8"]
        self.assertEqual(entry["character"]["market"]["checked_at"], "2026-11-01T00:00:00Z")
        self.assertEqual(entry["last_known_price_at"], "2026-11-01T00:00:00Z")
        self.assertEqual(len(entry["prices"]), 1)
        self.assertEqual(len(entry["owners"]), 1)

    def test_listing_price_history_deduplicates_and_records_removal(self):
        history = {}
        for day, price in [(1, "100"), (2, "100"), (3, "90"), (4, ""), (5, "100")]:
            at = f"2026-11-0{day}T00:00:00Z"
            observe(history, dict(nft_id=8, character_name="One", market=dict(
                listed_price=price, listed_currency=TOKEN, checked_at=at,
                status="Listed" if price else "Not listed")), at)
        self.assertEqual([row["price"] for row in history["8"]["prices"]], ["100", "90", "", "100"])
        self.assertEqual(history["8"]["prices"][0]["last_seen"], "2026-11-02T00:00:00Z")

    def test_transfer_validation_and_merge_preserves_old_events(self):
        row = dict(tid=8, txHash="0x" + "1" * 64, event="User-Transfer", date=100,
                   chainName="mainnet", **{"from": "0x" + "a" * 40, "to": "0x" + "b" * 40})
        result = parse_transfers(dict(result=0, data=dict(history=[row], totalCount=2)), 8)
        self.assertFalse(result["all_returned"])
        history = {}
        character = dict(nft_id=8, character_name="One", market={}, transfers={**result, "checked_at": "then"})
        observe(history, character, "then")
        observe(history, character, "later")
        self.assertEqual(len(history["8"]["transfers"]), 1)
        character["transfers"] = dict(error="offline")
        observe(history, character, "later")
        self.assertEqual(len(history["8"]["transfers"]), 1)
        self.assertEqual(history["8"]["transfer_check"]["checked_at"], "then")
        with self.assertRaises(ValueError):
            parse_transfers(dict(result=0, data=dict(history=[{**row, "tid": 9}], totalCount=1)), 8)

    def test_rename_reversion_and_failed_market_keep_price(self):
        history = {}
        character = dict(nft_id=8, character_name="First", market=dict(listed_price="100"))
        observe(history, copy.deepcopy(character), "2026-11-01T00:00:00Z")
        character["market"] = dict(status="Unknown")
        observe(history, copy.deepcopy(character), "2026-11-02T00:00:00Z")
        character["character_name"] = "Second"
        observe(history, copy.deepcopy(character), "2026-11-03T00:00:00Z")
        character["character_name"] = "First"
        observe(history, copy.deepcopy(character), "2026-11-04T00:00:00Z")
        self.assertEqual([item["name"] for item in history["8"]["names"]], ["First", "Second", "First"])
        self.assertEqual(history["8"]["last_known_price"], "100")
        self.assertEqual(history["8"]["last_known_price_at"], "2026-11-01T00:00:00Z")

    def test_legacy_and_persistence(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "history.json"
            csv = Path(folder) / "characters.csv"
            csv.write_text("nft_id,character_name,starting_price\n8,Old,-\n", encoding="utf-8")
            history = load_history(path, csv)
            self.assertIsNone(history["8"]["names"][0]["first_seen"])
            self.assertEqual(history["8"]["last_known_price"], "")
            save_history(history, path)
            self.assertEqual(load_history(path, csv), history)


class CollectionTests(unittest.TestCase):
    def test_recent_character_comes_from_json_without_html(self):
        info = json.loads(BeautifulSoup(market_html(), "html.parser").script.string)["props"]["pageProps"]["nftInfo"]
        info.update(tid=4200, nftName="Recent character", metaData={"attributes": [
            {"key": "Class", "value": "Warlord"}, {"key": "Server", "value": "ASIA - SAKURA"},
            {"key": "GrowthPower", "value": 385832}]})
        with patch("extract_name_parallel.fetch_nft_data", return_value=info), patch("extract_name_parallel.fetch_transfers", return_value={"events": [], "total_count": 0, "all_returned": True}):
            result = get_character_info(4200)
        self.assertEqual(result["status"], "found")
        self.assertEqual(result["server"], "SAKURA")
        self.assertEqual(result["gp"], "385,832")
        self.assertEqual(result["character_name"], "Recent character")

    def test_history_refreshes_for_new_owner_old_cache_or_partial_response(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 21, tzinfo=timezone.utc)
        entry = {"character": {"market": {"owner": "wallet-a"}},
                 "transfer_check": {"checked_at": "2026-11-20T00:00:00Z", "all_returned": True}}
        self.assertFalse(history_due(entry, "wallet-a", now))
        self.assertTrue(history_due(entry, "wallet-b", now))
        entry["transfer_check"]["all_returned"] = False
        self.assertTrue(history_due(entry, "wallet-a", now))
        entry["transfer_check"] = {"checked_at": "2026-11-01T00:00:00Z"}
        self.assertTrue(history_due(entry, "wallet-a", now))

    def test_discovery_follows_archive_past_5000(self):
        self.assertEqual(discovery_frontier({"6501": {}}), 6501)
        self.assertEqual(discovery_frontier({}), 5000)

    def test_worker_exception_is_a_failed_request(self):
        def fail(_):
            raise ValueError("network")
        result = scan_batch([8], fetch=fail, workers=1)
        self.assertEqual(result[0]["status"], "failed")

    def test_retry_replaces_failure_and_retains_archived_character(self):
        found = dict(nft_id=8, character_name="Recovered", status="found", market={}, transfers={}, observed_at="now")
        history = {}
        with patch("extract_name_parallel.scan_batch", side_effect=[
            [dict(nft_id=8, status="failed")], [found]
        ]) as batch:
            result = refresh([8], history)
        self.assertEqual(batch.call_count, 2)
        self.assertEqual(result[0]["status"], "found")
        self.assertEqual(history["8"]["character"]["character_name"], "Recovered")


if __name__ == "__main__":
    unittest.main()
