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

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
    db = client[db_name]
    logger.info("Connected to MongoDB")
except Exception as e:
    logger.warning(f"Failed to connect to MongoDB: {e}")
    db = None

app = FastAPI()
api_router = APIRouter(prefix="/api")

# RapidAPI Cricbuzz Configuration - Correct hosts as per user specs
RAPIDAPI_PROVIDERS = [
    {
        "base": "https://cricbuzz-cricket.p.rapidapi.com",
        "host": "cricbuzz-cricket.p.rapidapi.com",
        "name": "Primary"
    },
    {
        "base": "https://cricbuzz.p.rapidapi.com",
        "host": "cricbuzz.p.rapidapi.com",
        "name": "Secondary"
    }
]

# 10 API Keys with rotation
RAPIDAPI_KEYS = [
    "90023f4cffmsh601a9c68cd49cc7p181c2ajsn5bc8b2d875fc",
    "d5dc9c8512mshe9bec708eb2b011p14ac97jsn4a79d9ec6dc4",
    "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
    "59b9249be3mshcab753fe794baa3p14e78cjsne1da55eef3aa",
    "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
    "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
    "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
    "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
    "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
    "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
]

current_key_index = 0

# 3-Minute Cache System
class CacheEntry:
    def __init__(self, data: Any, ttl_seconds: int = 180):
        self.data = data
        self.expires_at = time.time() + ttl_seconds

    def is_valid(self) -> bool:
        return time.time() < self.expires_at

api_cache: Dict[str, CacheEntry] = {}
CACHE_TTL = 180

def get_from_cache(key: str) -> Optional[Any]:
    entry = api_cache.get(key)
    if entry and entry.is_valid():
        logger.info(f"Cache HIT for {key}")
        return entry.data
    return None

def save_to_cache(key: str, data: Any):
    api_cache[key] = CacheEntry(data, CACHE_TTL)
    logger.info(f"Cache SAVED for {key} (TTL: {CACHE_TTL}s)")

def get_current_key():
    return RAPIDAPI_KEYS[current_key_index]

def rotate_key():
    global current_key_index
    current_key_index = (current_key_index + 1) % len(RAPIDAPI_KEYS)
    logger.info(f"API Key rotated to index {current_key_index}")
    return RAPIDAPI_KEYS[current_key_index]

async def make_cricbuzz_request(endpoint: str):
    global current_key_index
    keys_tried = set()

    for attempt in range(len(RAPIDAPI_KEYS) * len(RAPIDAPI_PROVIDERS)):
        if len(keys_tried) >= len(RAPIDAPI_KEYS):
            break

        current_key = RAPIDAPI_KEYS[current_key_index]
        keys_tried.add(current_key_index)

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
                            if any(kw in msg for kw in ['exceeded', 'not subscribed', 'quota', "doesn't exist", 'not found', 'invalid']):
                                logger.warning(f"API error on key {current_key_index} with {provider['name']}: {msg}")
                                continue

                        # Verify data has expected structure
                        if isinstance(data, dict) and not data.get('typeMatches') and not data.get('matchInfo') and not data.get('commentaryList') and not data.get('matchHeader'):
                            if len(data) <= 1:
                                logger.warning(f"Empty/invalid response from {provider['name']}: {list(data.keys())}")
                                continue

                        logger.info(f"SUCCESS with key {current_key_index} on {provider['name']}")
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

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

@api_router.get("/")
async def root():
    return {"message": "CricApp Backend API", "status": "running", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "cache_entries": len(api_cache), "current_key_index": current_key_index}

@api_router.get("/cricket/matches/live")
async def get_live_matches():
    try:
        cache_key = "matches_live"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        data = await make_cricbuzz_request("/matches/v1/live")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logger.error(f"Error fetching live matches: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cricket/matches/recent")
async def get_recent_matches():
    try:
        cache_key = "matches_recent"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        data = await make_cricbuzz_request("/matches/v1/recent")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logger.error(f"Error fetching recent matches: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cricket/matches/upcoming")
async def get_upcoming_matches():
    try:
        cache_key = "matches_upcoming"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        data = await make_cricbuzz_request("/matches/v1/upcoming")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logger.error(f"Error fetching upcoming matches: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cricket/match/{match_id}")
async def get_match_detail(match_id: str):
    try:
        cache_key = f"match_{match_id}"
        cached = get_from_cache(cache_key)
        if cached:
            return cached
        data = await make_cricbuzz_request(f"/mcenter/v1/{match_id}")
        save_to_cache(cache_key, data)
        return data
    except Exception as e:
        logger.error(f"Error fetching match detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cricket/match/{match_id}/commentary")
async def get_match_commentary(match_id: str):
    try:
        cache_key = f"commentary_{match_id}"
        cached = get_from_cache(cache_key)
        if cached:
            return cached

        raw_data = await make_cricbuzz_request(f"/mcenter/v1/{match_id}/comm")

        # Transform the raw cricbuzz response into a normalized format
        commentary_list = []
        comwrapper = raw_data.get('comwrapper', [])
        if isinstance(comwrapper, list):
            for wrapper in comwrapper:
                comm = wrapper.get('commentary')
                if isinstance(comm, dict):
                    commentary_list.append(comm)
                elif isinstance(comm, list):
                    commentary_list.extend(comm)

        # Build normalized commentary
        import re
        normalized_commentary = []
        for c in commentary_list:
            if not isinstance(c, dict):
                continue
            text = c.get('commtxt', '')
            if not text or text.startswith('I0$'):
                formats = c.get('commentaryformats', [])
                for fmt in formats:
                    for val in fmt.get('value', []):
                        if isinstance(val, dict) and val.get('value'):
                            text = val['value']
                            break
                    if text and not text.startswith('I0$'):
                        break
            if not text or text.startswith('I0$'):
                continue
            # Clean up B0$, B1$, I0$ and similar inline format markers
            text = re.sub(r'[A-Z]\d+\$,?\s*', '', text).strip()
            if not text:
                continue
            normalized_commentary.append({
                'commText': text,
                'overNumber': c.get('overnum', 0),
                'event': c.get('eventtype', 'NONE').lower(),
                'ballNumber': c.get('ballnbr', 0),
                'timestamp': c.get('timestamp', 0),
            })

        # Build match header info
        match_header = raw_data.get('matchheaders', {})
        miniscore = raw_data.get('miniscore', {})

        result = {
            'commentaryList': normalized_commentary,
            'matchHeader': match_header,
            'miniscore': miniscore,
        }

        save_to_cache(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error fetching match commentary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/cricket/match/{match_id}/events")
async def get_match_events(match_id: str, lastScore: str = "", lastWickets: int = 0, lastOvers: str = ""):
    """Detect match events (wickets, boundaries, milestones) by comparing current state with client's last known state."""
    import re as regex_mod
    try:
        # Get current match commentary data
        cache_key = f"commentary_{match_id}"
        cached = get_from_cache(cache_key)
        if not cached:
            raw_data = await make_cricbuzz_request(f"/mcenter/v1/{match_id}/comm")
            # Parse commentary
            commentary_list_raw = []
            comwrapper = raw_data.get('comwrapper', [])
            if isinstance(comwrapper, list):
                for wrapper in comwrapper:
                    comm = wrapper.get('commentary')
                    if isinstance(comm, dict):
                        commentary_list_raw.append(comm)
                    elif isinstance(comm, list):
                        commentary_list_raw.extend(comm)

            normalized = []
            for c in commentary_list_raw:
                if not isinstance(c, dict):
                    continue
                text = c.get('commtxt', '')
                if not text or text.startswith('I0$'):
                    formats = c.get('commentaryformats', [])
                    for fmt in formats:
                        for val in fmt.get('value', []):
                            if isinstance(val, dict) and val.get('value'):
                                text = val['value']
                                break
                        if text and not text.startswith('I0$'):
                            break
                if not text or text.startswith('I0$'):
                    continue
                text = regex_mod.sub(r'[A-Z]\d+\$,?\s*', '', text).strip()
                if not text:
                    continue
                normalized.append({
                    'commText': text,
                    'overNumber': c.get('overnum', 0),
                    'event': (c.get('eventtype') or 'NONE').lower(),
                    'ballNumber': c.get('ballnbr', 0),
                })

            miniscore = raw_data.get('miniscore', {})
            match_header = raw_data.get('matchheaders', {})
            cached = {
                'commentaryList': normalized,
                'matchHeader': match_header,
                'miniscore': miniscore,
            }
            save_to_cache(cache_key, cached)

        comms = cached.get('commentaryList', [])
        miniscore = cached.get('miniscore', {})
        match_header = cached.get('matchHeader', {})

        # Extract current score from inningsscores
        innings_data = miniscore.get('inningsscores', {})
        innings_list = innings_data.get('inningsscore', []) if isinstance(innings_data, dict) else []
        
        # Current innings = highest inningsid (most recent)
        current_innings = {}
        prev_innings = {}
        if innings_list:
            sorted_innings = sorted(innings_list, key=lambda x: x.get('inningsid', 0))
            current_innings = sorted_innings[-1]  # Highest inningsid = current
            if len(sorted_innings) > 1:
                prev_innings = sorted_innings[-2]
        
        current_runs = current_innings.get('runs')
        current_wickets = current_innings.get('wickets', 0)
        current_overs = str(current_innings.get('overs', '0'))
        bat_team = current_innings.get('batteamshortname', 'BAT')

        # Get bowling team from previous innings (for future use in notifications)
        _ = prev_innings.get('batteamshortname', '')

        score_str = f"{current_runs}/{current_wickets}" if current_runs is not None else ""

        events = []

        # Detect wickets
        if current_wickets and int(current_wickets) > int(lastWickets or 0):
            wicket_comm = next((c for c in comms if 'wicket' in c.get('event', '') or 'out' in c.get('event', '')), None)
            events.append({
                'type': 'wicket',
                'message': f"WICKET! {bat_team} {score_str} ({current_overs} ov). {wicket_comm['commText'][:80] if wicket_comm else 'Batsman out!'}",
                'score': score_str,
            })

        # Detect boundaries from recent commentary
        for c in comms[:5]:
            event_type = c.get('event', '')
            if 'six' in event_type:
                events.append({
                    'type': 'six',
                    'message': f"SIX! {bat_team} {score_str} ({current_overs} ov). {c['commText'][:80]}",
                    'score': score_str,
                })
                break
            elif 'four' in event_type or 'boundary' in event_type:
                events.append({
                    'type': 'four',
                    'message': f"FOUR! {bat_team} {score_str} ({current_overs} ov). {c['commText'][:80]}",
                    'score': score_str,
                })
                break

        # Detect milestones (50, 100, 150, 200)
        if current_runs is not None and lastScore:
            try:
                prev_runs = int(lastScore.split('/')[0]) if '/' in lastScore else int(lastScore)
                curr_runs = int(current_runs)
                for milestone in [50, 100, 150, 200, 250, 300]:
                    if prev_runs < milestone <= curr_runs:
                        events.append({
                            'type': 'milestone',
                            'message': f"{bat_team} crosses {milestone}! Score: {score_str} ({current_overs} ov)",
                            'score': score_str,
                        })
            except (ValueError, TypeError):
                pass

        # Detect match result
        match_state = match_header.get('state', '').lower()
        if 'complete' in match_state:
            status = match_header.get('status', 'Match completed')
            events.append({
                'type': 'result',
                'message': f"RESULT: {status}",
                'score': score_str,
            })

        return {
            'events': events[:3],  # Max 3 events per poll to avoid spam
            'currentScore': {
                'score': score_str,
                'wickets': current_wickets,
                'overs': current_overs,
                'batTeam': bat_team,
            },
        }
    except Exception as e:
        logger.error(f"Error detecting match events: {e}")
        return {'events': [], 'currentScore': None}


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
    if db:
        client.close()
