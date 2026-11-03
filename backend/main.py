import os
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

app = FastAPI(title="Speedtest API")

# Allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1 MB chunk of zero bytes for fast generation
CHUNK_SIZE = 1024 * 1024  # 1MB
CHUNK_DATA = b"0" * CHUNK_SIZE

@app.get("/api/ping")
def ping():
    """Simple lightweight endpoint to measure RTT latency."""
    return {"status": "ok"}

@app.get("/api/download")
def download(size_mb: int = 25):
    """
    Stream size_mb Megabytes of dummy data to test download speed.
    Client measures transfer time against byte count.
    """
    # Cap size between 1MB and 250MB for safety
    size_mb = max(1, min(size_mb, 250))

    def generate_chunks():
        for _ in range(size_mb):
            yield CHUNK_DATA

    return StreamingResponse(
        generate_chunks(),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(size_mb * CHUNK_SIZE),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )

@app.post("/api/upload")
async def upload(request: Request):
    """
    Consumes uploaded payload chunk by chunk to calculate upload speed.
    """
    total_bytes = 0
    async for chunk in request.stream():
        total_bytes += len(chunk)

    return JSONResponse(content={
        "status": "success",
        "received_bytes": total_bytes
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

