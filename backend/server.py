from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import httpx
import asyncio
import time

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging FIRST
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection - use mongomock if real MongoDB unavailable
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'cricapp')

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
    db = client[db_name]
    logger.info(f"Connected to MongoDB at {mongo_url}")
except Exception as e:
    logger.warning(f"Failed to connect to MongoDB: {e}, using mongomock")
    import mongomock
    import motor.motor_asyncio
    client = mongomock.MongoClient()
    db = client[db_name]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# RapidAPI Cricbuzz Configuration - Support multiple providers
RAPIDAPI_PROVIDERS = [
    {
        "base": "https://cricbuzz-cricket2.p.rapidapi.com",
        "host": "cricbuzz-cricket2.p.rapidapi.com",
        "name": "Provider 2"
    },
    {
        "base": "https://cricbuzz-cricket.p.rapidapi.com",
        "host": "cricbuzz-cricket.p.rapidapi.com",
        "name": "Provider 1"
    }
]

# Dynamic Key Rotation System - NEW KEYS
RAPIDAPI_KEYS = [
    # NEW KEYS (provided 2026-03-27) - PRIORITY
    "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",  # NEW
    "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",  # NEW
    "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",  # NEW
    "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",  # NEW
    
    # OLD KEYS (fallback)
    "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
    "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
    "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
    "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
    "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
    "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
]

# Current key index (rotates on 429 errors)
current_key_index = 0

# ============================================
# 3-MINUTE CACHE SYSTEM FOR API KEY LONGEVITY
# ============================================
class CacheEntry:
    def __init__(self, data: Any, ttl_seconds: int = 180):  # 3 minutes = 180 seconds
        self.data = data
        self.expires_at = time.time() + ttl_seconds

    def is_valid(self) -> bool:
        return time.time() < self.expires_at

# Cache storage
api_cache: Dict[str, CacheEntry] = {}
CACHE_TTL = 180  # 3 minutes cache for API key longevity

def get_from_cache(key: str) -> Optional[Any]:
    """Get data from cache if valid"""
    entry = api_cache.get(key)
    if entry and entry.is_valid():
        logger.info(f"✅ Cache HIT for {key}")
        return entry.data
    return None

def save_to_cache(key: str, data: Any):
    """Save data to cache"""
    api_cache[key] = CacheEntry(data, CACHE_TTL)
    logger.info(f"💾 Cache SAVED for {key} (TTL: {CACHE_TTL}s)")

def get_current_key():
    """Get current RapidAPI key"""
    return RAPIDAPI_KEYS[current_key_index]

def rotate_key():
    """Rotate to next API key after 429 error"""
    global current_key_index
    current_key_index = (current_key_index + 1) % len(RAPIDAPI_KEYS)
    logger.info(f"API Key rotated to index {current_key_index}")
    return RAPIDAPI_KEYS[current_key_index]

async def make_cricbuzz_request(endpoint: str, max_retries: int = 3):
    """Make request with automatic key rotation and provider fallback"""
    global current_key_index
    last_error = None
    keys_tried = set()
    
    # Try all combinations of keys and providers
    for attempt in range(len(RAPIDAPI_KEYS) * len(RAPIDAPI_PROVIDERS)):
        if len(keys_tried) >= len(RAPIDAPI_KEYS):
            break
            
        current_key = RAPIDAPI_KEYS[current_key_index]
        keys_tried.add(current_key_index)
        
        # Try each provider for this key
        for provider in RAPIDAPI_PROVIDERS:
            try:
                async with httpx.AsyncClient(timeout=15.0) as http_client:
                    url = f"{provider['base']}{endpoint}"
                    response = await http_client.get(
                        url,
                        headers={
                            "x-rapidapi-host": provider['host'],
                            "x-rapidapi-key": current_key,
                        }
                    )
                    
                    if response.status_code in [429, 403]:
                        logger.warning(f"Error {response.status_code} on key {current_key_index} with {provider['name']}")
                        continue
                    
                    try:
                        data = response.json()
                        if isinstance(data, dict) and 'message' in data:
                            msg = data.get('message', '').lower()
                            if 'exceeded' in msg or 'not subscribed' in msg or 'quota' in msg:
                                logger.warning(f"API limit on key {current_key_index} with {provider['name']}")
                                continue
                        
                        logger.info(f"✅ SUCCESS with key {current_key_index} on {provider['name']}")
                        return data
                    except Exception:
                        response.raise_for_status()
                        return response.json()
                    
            except httpx.HTTPStatusError as e:
                if e.response.status_code in [429, 403]:
                    continue
                logger.error(f"HTTP error: {e}")
            except Exception as e:
                logger.error(f"Request failed: {e}")
                continue
        
        rotate_key()
    
    raise HTTPException(status_code=500, detail="All API keys exhausted or unavailable")

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# ============================================
# CRICBUZZ API PROXY ENDPOINTS
# ============================================

@api_router.get("/cricket/matches/live")
async def get_live_matches():
    """Proxy endpoint for live cricket matches with caching and key rotation"""
    try:
        cache_key = "matches_live"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        
        data = await make_cricbuzz_request("/matches/v1/live")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logging.error(f"Error fetching live matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching live matches: {str(e)}")

@api_router.get("/cricket/matches/recent")
async def get_recent_matches():
    """Proxy endpoint for recent cricket matches with caching and key rotation"""
    try:
        cache_key = "matches_recent"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        
        data = await make_cricbuzz_request("/matches/v1/recent")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logging.error(f"Error fetching recent matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching recent matches: {str(e)}")

@api_router.get("/cricket/matches/upcoming")
async def get_upcoming_matches():
    """Proxy endpoint for upcoming cricket matches with caching and key rotation"""
    try:
        cache_key = "matches_upcoming"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        
        data = await make_cricbuzz_request("/matches/v1/upcoming")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logging.error(f"Error fetching upcoming matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching upcoming matches: {str(e)}")

@api_router.get("/cricket/match/{match_id}/commentary")
async def get_match_commentary(match_id: str, page: int = 0):
    """Proxy endpoint for match commentary with pagination and caching"""
    try:
        cache_key = f"commentary_{match_id}_page_{page}"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        
        # Cricbuzz commentary endpoint supports pagination via timestamp
        endpoint = f"/mcenter/v1/{match_id}/comm"
        data = await make_cricbuzz_request(endpoint)
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logging.error(f"Error fetching match commentary: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching match commentary: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
