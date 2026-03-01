# """
# config.py — reads all settings from .env (or environment variables)
# Copy .env.example to .env and fill in your values.
# """

# import os
# from pathlib import Path
# from dotenv import load_dotenv

# load_dotenv(Path(__file__).parent / ".env")

# def _require(key: str) -> str:
#     val = os.getenv(key)
#     if not val:
#         raise RuntimeError(f"Missing required env variable: {key}. Check your .env file.")
#     return val

# DATABASE_URL = _require("DATABASE_URL")
# SECRET_KEY   = _require("SECRET_KEY")
# BOT_TOKEN    = _require("BOT_TOKEN")

# # Gmail credentials are now per-user (stored in DB settings).
# # No global GMAIL_USER / GMAIL_APP_PASSWORD needed here.



"""
config.py — reads all settings from .env (or environment variables).
Copy .env.example to .env and fill in your values.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def _require(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise RuntimeError(
            f"Missing required env variable: {key}. Check your .env file."
        )
    return val


DATABASE_URL = _require("DATABASE_URL")
SECRET_KEY   = _require("SECRET_KEY")
BOT_TOKEN    = _require("BOT_TOKEN")
FERNET_KEY   = _require("FERNET_KEY")

# Gmail credentials are per-user (stored encrypted in DB settings).