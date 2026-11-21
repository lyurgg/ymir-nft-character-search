import unittest
import tempfile
import json
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from funding import native_transfer, scan_native_transfer, common_funders, purchase_records

A, B, C = ["0x" + letter * 40 for letter in "abc"]


class FundingTests(unittest.TestCase):
    def test_buyer_as_zero_hop_source_is_optional_and_not_a_transfer(self):
        purchases = [dict(nft_id=1, buyer=B, at=1000), dict(nft_id=2, buyer=C, at=2000)]
        transfer = dict(asset="WEMIX", chain_id=1111, **{"from": B, "to": C}, at=1900, amount_wei=str(60025 * 10**18))
        self.assertEqual(common_funders(purchases, [transfer]), [])
        match, = common_funders(purchases, [transfer], include_buyer_roots=True)
        self.assertEqual(match["source"], B)
        self.assertEqual([row["depth"] for row in match["evidence"]], [0, 1])
        self.assertEqual(match["evidence"][0]["path"], [])
        self.assertIsNone(match["evidence"][0]["funding"])
        self.assertEqual(common_funders(purchases, [transfer], include_buyer_roots=True, excluded=[B]), [])
        shared_buyer = [{**p, "buyer": B} for p in purchases]
        self.assertEqual(common_funders(shared_buyer, [], include_buyer_roots=True)[0]["source"], B)

    def test_current_scan_schema_is_normalized_without_rounding(self):
        row = dict(transactionStatus="0x1", **{"from": A, "to": B}, timestamp="1794262326",
                   value="60025000000000000000001", hash="0x" + "1" * 64, blockNumber=123)
        transfer = scan_native_transfer(row)
        self.assertEqual(transfer["amount_wei"], row["value"])
        self.assertEqual(transfer["at"], 1794262326)
        self.assertIsNone(scan_native_transfer({**row, "transactionStatus": "0x0"}))
        self.assertIsNone(scan_native_transfer({**row, "timestamp": "invalid"}))

    def test_current_scan_collector_pages_without_an_api_key(self):
        import collect_funding
        history = {str(nft): {"transfers": [dict(event="Auction-Buy", chain="mainnet", to=buyer, at=2000, tx_hash="buy" + str(nft))]}
                   for nft, buyer in [(1, B), (2, C)]}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "character_history.json").write_text(json.dumps(history))
            session, fetched = MagicMock(), []
            def get(url, **kwargs):
                wallet = url.split("/account/")[1].split("/")[0]
                page = kwargs["params"]["page"]
                fetched.append((wallet, page))
                self.assertEqual(kwargs["params"]["sort"], "desc")
                rows = [] if page == 2 else [dict(transactionStatus="0x1", **{"from": A, "to": wallet},
                         timestamp="1900", value=str(10**18), hash="0x" + ("1" if wallet == B else "2") * 64)]
                if wallet == B and page == 1:
                    rows += [dict(transactionStatus="0x0")] * 999
                response = MagicMock()
                response.json.return_value = dict(transactions=rows)
                return response
            session.get.side_effect = get
            with patch.object(collect_funding, "Path", side_effect=lambda name: root / name), \
                 patch.object(collect_funding.requests, "Session", return_value=session), \
                 patch.object(collect_funding.time, "sleep"), \
                 patch.dict(collect_funding.os.environ, {"WEMIX_EXPLORER_API_KEY": ""}):
                result = collect_funding.collect([1, 2])
            self.assertEqual(fetched, [(B, 1), (B, 2), (C, 1)])
            self.assertEqual(result["status"], "collected")
            self.assertEqual(len(result["transfers"]), 2)
            self.assertEqual(common_funders(purchase_records(history, [1, 2]), result["transfers"])[0]["source"], A)

    def test_collector_fetches_intermediate_wallets_and_honors_wallet_limit(self):
        import collect_funding
        x, y = ["0x" + c * 40 for c in "ef"]
        history = {str(nft): {"transfers": [dict(event="Auction-Buy", chain="mainnet", to=buyer, at=1000, tx_hash="buy" + str(nft))]}
                   for nft, buyer in [(1, B), (2, C)]}
        records = {}
        for index, (sender, recipient, at) in enumerate([(x, B, 900), (y, C, 900), (A, x, 800), (A, y, 800)]):
            records[recipient] = [dict(sender=sender, receiver=recipient, value=str(10**18), tx_status="1",
                                       timestamp=datetime.fromtimestamp(at, timezone.utc).isoformat(),
                                       transaction_hash="0x" + str(index + 1) * 64)]
        for limit in (100, 2):
            with self.subTest(wallet_limit=limit), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "character_history.json").write_text(json.dumps(history))
                fetched = []
                session = MagicMock()
                def get(url, **kwargs):
                    wallet = url.split("/accounts/")[1].split("/")[0]
                    fetched.append(wallet)
                    rows = records.get(wallet, [])
                    response = MagicMock()
                    response.json.return_value = dict(status="200", results=dict(count=len(rows), data=rows))
                    return response
                session.get.side_effect = get
                with patch.object(collect_funding, "Path", side_effect=lambda name: root / name), \
                     patch.object(collect_funding.requests, "Session", return_value=session), \
                     patch.object(collect_funding.time, "sleep"), \
                     patch.dict(collect_funding.os.environ, {"WEMIX_EXPLORER_API_KEY": "test-key"}):
                    result = collect_funding.collect([1, 2], max_depth=2, wallet_limit=limit, provider="legacy")
                if limit == 100:
                    self.assertEqual(set(fetched), {B, C, x, y})
                    self.assertEqual(result["status"], "collected")
                else:
                    self.assertEqual(len(fetched), 2)
                    self.assertTrue(result["wallet_limit_reached"])
                    self.assertEqual(result["status"], "partial")

    def test_upstream_depth_chronology_and_exclusions(self):
        from funding import funding_branches
        x, y, z = ["0x" + c * 40 for c in "ef9"]
        purchases = [dict(nft_id=1, buyer=B, at=1000000), dict(nft_id=2, buyer=C, at=2000000)]
        def hop(sender, receiver, at):
            return dict(asset="WEMIX", chain_id=1111, **{"from": sender, "to": receiver}, at=at, amount_wei=str(2 * 10**18))
        transfers = [hop(A, x, 999000), hop(x, B, 999500), hop(A, y, 1999000), hop(y, C, 1999500)]
        self.assertEqual(common_funders(purchases, transfers), [])
        matches = common_funders(purchases, transfers, max_depth=2)
        self.assertEqual(matches[0]["source"], A)
        self.assertEqual([r["depth"] for r in matches[0]["evidence"]], [2, 2])
        self.assertEqual(matches[0]["evidence"][0]["path"][0]["from"], A)
        self.assertEqual(matches[0]["evidence"][0]["path"][-1]["to"], B)
        self.assertEqual(common_funders(purchases, transfers, max_depth=2, excluded=[x]), [])
        wrong_order = [{**t, "at": t["at"] + 600} if t["from"] == A else t for t in transfers]
        self.assertEqual(common_funders(purchases, wrong_order, max_depth=2), [])
        three = [*transfers, hop(z, A, 998000)]
        self.assertFalse(any(m["source"] == z for m in common_funders(purchases, three, max_depth=2)))
        self.assertTrue(any(m["source"] == z for m in common_funders(purchases, three, max_depth=3, lookback_days=30)))
        _, searched, truncated = funding_branches(purchases, transfers, max_depth=2)
        self.assertTrue({x, y}.issubset(searched))
        self.assertFalse(truncated)
        self.assertTrue(funding_branches(purchases, transfers, max_depth=3, max_search_steps=1)[2])

    def test_two_different_purchase_buyers_share_a_source(self):
        purchases = [dict(nft_id=1358, buyer=B, at=1000000), dict(nft_id=3871, buyer=C, at=2000000)]
        transfers = [dict(asset="WEMIX", chain_id=1111, **{"from": A, "to": B}, at=999000, amount_wei=str(58000 * 10**18)),
                     dict(asset="WEMIX", chain_id=1111, **{"from": A, "to": C}, at=1999000, amount_wei=str(57000 * 10**18))]
        matches = common_funders(purchases, transfers)
        self.assertEqual(matches[0]["source"], A)
        self.assertEqual(len(matches[0]["evidence"]), 2)
        self.assertEqual(common_funders(purchases, transfers, excluded=[A]), [])
        self.assertEqual(common_funders(purchases, [{**t, "at": 2000100} for t in transfers]), [])
        self.assertEqual(common_funders(purchases, [{**t, "amount_wei": "1"} for t in transfers]), [])
        self.assertEqual(common_funders([{**p, "buyer": B} for p in purchases], transfers), [])

    def test_only_successful_positive_native_transactions(self):
        row = dict(sender=A, receiver=B, timestamp="2026-11-01T00:00:00Z",
                   value="1000000000000000001", tx_status="1", transaction_hash="0x" + "1" * 64)
        transfer = native_transfer(row)
        self.assertEqual(transfer["amount_wei"], "1000000000000000001")
        self.assertEqual(transfer["asset"], "WEMIX")
        self.assertIsNone(native_transfer({**row, "tx_status": "0"}))
        self.assertIsNone(native_transfer({**row, "value": "0"}))

    def test_purchase_buyer_is_not_replaced_with_current_owner(self):
        history = {"1358": {"character": {"market": {"owner": C}}, "transfers": [
            dict(event="Auction-Buy", chain="mainnet", to=B, at=100, tx_hash="tx", price="58000"),
            dict(event="User-Transfer", chain="mainnet", to=C, at=200, tx_hash="later")]}}
        purchases = purchase_records(history, [1358])
        self.assertEqual(len(purchases), 1)
        self.assertEqual(purchases[0]["buyer"], B)


if __name__ == "__main__":
    unittest.main()
