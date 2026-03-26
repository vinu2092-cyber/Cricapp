from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import httpx

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

# RapidAPI Cricbuzz Configuration
RAPIDAPI_BASE = "https://cricbuzz-cricket2.p.rapidapi.com"
RAPIDAPI_HOST = "cricbuzz-cricket2.p.rapidapi.com"

# Dynamic Key Rotation System - 8 Keys
RAPIDAPI_KEYS = [
    "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61",
    "2a21f65881msh680271f280de7p182fbdjsn151d068c6392",
    "cd6ae88bddmsh5dcf84f0286d14cp1af3f9jsn7d2de7fe2a03",
    "4223543bdbmsh7962a0ecb8d4e7fp1132a3jsn8f9a656e2b32",
    "ba8052cb25msh6ea2297ebf719dcp14bc6ejsn51e281c87482",
    "d5dc9c8512msh89bec708eb2b011p14ac97jsn4a79d9ec6dc4",
    "7a2524853emsh5f7b21ec1386710p17ba7djsn8c535a072237",
    "db67e8004emsh40add8626f58e58p183678jsne28298b94c3b",
]

# Current key index (rotates on 429 errors)
current_key_index = 0

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
    """Make request with automatic key rotation on 429/403 errors"""
    global current_key_index
    last_error = None
    keys_tried = set()
    
    for attempt in range(len(RAPIDAPI_KEYS) * 2):  # Try each key up to 2 times
        if len(keys_tried) >= len(RAPIDAPI_KEYS):
            break  # All keys have been tried
            
        current_key = RAPIDAPI_KEYS[current_key_index]
        keys_tried.add(current_key_index)
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                response = await http_client.get(
                    f"{RAPIDAPI_BASE}{endpoint}",
                    headers={
                        "x-rapidapi-host": RAPIDAPI_HOST,
                        "x-rapidapi-key": current_key,
                    }
                )
                
                # Handle rate limit (429) or forbidden (403) or quota exceeded
                if response.status_code in [429, 403]:
                    logger.warning(f"Error {response.status_code} on key index {current_key_index}, rotating...")
                    rotate_key()
                    continue
                
                # Check if response contains error messages
                try:
                    data = response.json()
                    if isinstance(data, dict) and 'message' in data:
                        msg = data.get('message', '').lower()
                        if 'exceeded' in msg or 'not subscribed' in msg or 'quota' in msg:
                            logger.warning(f"API limit/subscription issue on key index {current_key_index}: {data.get('message')}")
                            rotate_key()
                            continue
                    return data
                except:
                    response.raise_for_status()
                    return response.json()
                
        except httpx.HTTPStatusError as e:
            if e.response.status_code in [429, 403]:
                logger.warning(f"HTTP {e.response.status_code} on key index {current_key_index}, rotating...")
                rotate_key()
                continue
            last_error = e
            logger.error(f"HTTP error on attempt {attempt + 1}: {e}")
            rotate_key()
        except httpx.HTTPError as e:
            last_error = e
            logger.error(f"HTTP error on attempt {attempt + 1}: {e}")
            rotate_key()
    
    raise HTTPException(status_code=500, detail=f"All API keys exhausted or unavailable")

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
    """Proxy endpoint for live cricket matches with key rotation"""
    try:
        return await make_cricbuzz_request("/matches/v1/live")
    except Exception as e:
        logging.error(f"Error fetching live matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching live matches: {str(e)}")

@api_router.get("/cricket/matches/recent")
async def get_recent_matches():
    """Proxy endpoint for recent cricket matches with key rotation"""
    try:
        return await make_cricbuzz_request("/matches/v1/recent")
    except Exception as e:
        logging.error(f"Error fetching recent matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching recent matches: {str(e)}")

@api_router.get("/cricket/matches/upcoming")
async def get_upcoming_matches():
    """Proxy endpoint for upcoming cricket matches with key rotation"""
    try:
        return await make_cricbuzz_request("/matches/v1/upcoming")
    except Exception as e:
        logging.error(f"Error fetching upcoming matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching upcoming matches: {str(e)}")

@api_router.get("/cricket/match/{match_id}/commentary")
async def get_match_commentary(match_id: str):
    """Proxy endpoint for match commentary with key rotation"""
    try:
        return await make_cricbuzz_request(f"/mcenter/v1/{match_id}/comm")
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
