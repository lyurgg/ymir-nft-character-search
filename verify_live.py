"""Small live validation; daily full refresh remains extract_name_parallel.py."""
from concurrent.futures import ThreadPoolExecutor
from character_history import load_history, observe, save_history
from extract_name_parallel import get_character_info


if __name__ == "__main__":
    history = load_history()
    with ThreadPoolExecutor(max_workers=3) as pool:
        for character in pool.map(get_character_info, [7, 8, 9]):
            if character["status"] != "found" or character["market"].get("error"):
                raise RuntimeError(str(character))
            observe(history, character, character["observed_at"])
            print(character["nft_id"], character["market"])
    save_history(history)
