import sys
import requests
from bs4 import BeautifulSoup


def get_character_name(nft_id: int) -> str | None:
    url = f"https://www.legendofymir.com/en/blockchain/nft/{nft_id}"

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/151.0.0.0 Safari/537.36"
        )
    }

    response = requests.get(
        url,
        headers=headers,
        timeout=30,
    )

    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    character_name_element = soup.find(
        "div",
        class_=lambda classes: (
            classes
            and "sectionCharacter_characterName" in classes
        )
    )

    if character_name_element is None:
        return None

    return character_name_element.get_text(strip=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <nft_id>")
        sys.exit(1)

    nft_id = int(sys.argv[1])

    character_name = get_character_name(nft_id)

    if character_name is None:
        print(f"Character name not found for NFT {nft_id}")
    else:
        print(character_name)