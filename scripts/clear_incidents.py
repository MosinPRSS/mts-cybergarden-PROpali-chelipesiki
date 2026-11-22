#!/usr/bin/env python3
"""Root wrapper for backend/scripts/clear_incidents.py."""

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure working directory is backend for relative .env loading if needed
from scripts.clear_incidents import main
import asyncio

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
