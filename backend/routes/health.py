from fastapi import APIRouter
from backend.config import settings

router = APIRouter(tags=["Health"])

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "roundtable-acoustic-mesh",
        "version": "1.0.0",
        "geminiLiveConfigured": bool(settings.GEMINI_API_KEY),
        "model": settings.GEMINI_MODEL
    }
