from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# RapidAPI Cricbuzz Configuration
RAPIDAPI_BASE = "https://cricbuzz-cricket2.p.rapidapi.com"
RAPIDAPI_KEY = "c651c7e717msh7d7c4d05cae7b6dp17500bjsn1e00d9cf8d61"
RAPIDAPI_HOST = "cricbuzz-cricket2.p.rapidapi.com"

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
    """Proxy endpoint for live cricket matches"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.get(
                f"{RAPIDAPI_BASE}/matches/v1/live",
                headers={
                    "x-rapidapi-host": RAPIDAPI_HOST,
                    "x-rapidapi-key": RAPIDAPI_KEY,
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logging.error(f"Error fetching live matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching live matches: {str(e)}")

@api_router.get("/cricket/matches/recent")
async def get_recent_matches():
    """Proxy endpoint for recent cricket matches"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.get(
                f"{RAPIDAPI_BASE}/matches/v1/recent",
                headers={
                    "x-rapidapi-host": RAPIDAPI_HOST,
                    "x-rapidapi-key": RAPIDAPI_KEY,
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logging.error(f"Error fetching recent matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching recent matches: {str(e)}")

@api_router.get("/cricket/matches/upcoming")
async def get_upcoming_matches():
    """Proxy endpoint for upcoming cricket matches"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.get(
                f"{RAPIDAPI_BASE}/matches/v1/upcoming",
                headers={
                    "x-rapidapi-host": RAPIDAPI_HOST,
                    "x-rapidapi-key": RAPIDAPI_KEY,
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        logging.error(f"Error fetching upcoming matches: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching upcoming matches: {str(e)}")

@api_router.get("/cricket/match/{match_id}/commentary")
async def get_match_commentary(match_id: str):
    """Proxy endpoint for match commentary"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.get(
                f"{RAPIDAPI_BASE}/mcenter/v1/{match_id}/comm",
                headers={
                    "x-rapidapi-host": RAPIDAPI_HOST,
                    "x-rapidapi-key": RAPIDAPI_KEY,
                }
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
