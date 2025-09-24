# main.py - AgriGuard FastAPI Backend
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import json
from datetime import datetime
import sqlite3
import os
from contextlib import asynccontextmanager

# Database setup
DATABASE_PATH = "agriguard.db"

def init_db():
    """Initialize SQLite database with required tables"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS robots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            battery_level INTEGER DEFAULT 0,
            is_online BOOLEAN DEFAULT FALSE,
            last_seen TIMESTAMP,
            latitude REAL,
            longitude REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            robot_id TEXT,
            temperature REAL,
            humidity REAL,
            soil_moisture REAL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (robot_id) REFERENCES robots (id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS planting_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            robot_id TEXT,
            latitude REAL,
            longitude REAL,
            depth REAL,
            status TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (robot_id) REFERENCES robots (id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS weather_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_type TEXT,
            message TEXT,
            severity TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    print("Database initialized")
    yield
    # Shutdown
    print("Shutting down...")

# FastAPI app
app = FastAPI(
    title="AgriGuard API",
    description="Precision Agriculture Monitoring System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class Robot(BaseModel):
    id: str
    name: str
    battery_level: int = 0
    is_online: bool = False
    last_seen: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class SensorReading(BaseModel):
    robot_id: str
    temperature: float
    humidity: float
    soil_moisture: Optional[float] = None
    timestamp: Optional[datetime] = None

class PlantingLog(BaseModel):
    robot_id: str
    latitude: float
    longitude: float
    depth: float
    status: str  # OK, Shallow, Deep
    timestamp: Optional[datetime] = None

class WeatherAlert(BaseModel):
    alert_type: str
    message: str
    severity: str  # low, medium, high
    is_active: bool = True

class RobotStatus(BaseModel):
    robot_id: str
    battery_level: int
    latitude: float
    longitude: float
    is_online: bool = True

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

# Database helper functions
def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# API Endpoints

@app.get("/")
async def root():
    return {"message": "AgriGuard API is running", "status": "online"}

@app.get("/api/dashboard")
async def get_dashboard_data():
    """Get complete dashboard data"""
    conn = get_db_connection()
    
    # Get robot status
    robots = conn.execute("SELECT * FROM robots LIMIT 1").fetchone()
    
    # Get latest sensor readings
    latest_sensor = conn.execute(
        "SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    
    # Get recent planting logs
    recent_logs = conn.execute(
        "SELECT * FROM planting_logs ORDER BY timestamp DESC LIMIT 10"
    ).fetchall()
    
    # Get active weather alerts
    alerts = conn.execute(
        "SELECT * FROM weather_alerts WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    
    conn.close()
    
    # Format response
    dashboard_data = {
        "robot": {
            "battery_level": robots["battery_level"] if robots else 0,
            "is_online": robots["is_online"] if robots else False,
            "last_seen": robots["last_seen"] if robots else None,
            "location": {
                "latitude": robots["latitude"] if robots else None,
                "longitude": robots["longitude"] if robots else None
            }
        },
        "weather": {
            "temperature": latest_sensor["temperature"] if latest_sensor else 20.6,
            "humidity": latest_sensor["humidity"] if latest_sensor else 66,
            "alert": alerts["message"] if alerts else "No current alerts"
        },
        "planting_logs": [
            {
                "time": log["timestamp"],
                "depth": f"{log['depth']} cm",
                "status": log["status"]
            } for log in recent_logs
        ]
    }
    
    return dashboard_data

@app.post("/api/robots")
async def create_robot(robot: Robot):
    """Register a new robot"""
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO robots (id, name, battery_level, is_online, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)",
            (robot.id, robot.name, robot.battery_level, robot.is_online, robot.latitude, robot.longitude)
        )
        conn.commit()
        
        # Broadcast update
        await manager.broadcast(json.dumps({
            "type": "robot_registered",
            "data": robot.dict()
        }))
        
        return {"message": "Robot registered successfully"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Robot ID already exists")
    finally:
        conn.close()

@app.put("/api/robots/{robot_id}/status")
async def update_robot_status(robot_id: str, status: RobotStatus):
    """Update robot status (battery, location, online status)"""
    conn = get_db_connection()
    
    conn.execute(
        "UPDATE robots SET battery_level = ?, latitude = ?, longitude = ?, is_online = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?",
        (status.battery_level, status.latitude, status.longitude, status.is_online, robot_id)
    )
    conn.commit()
    
    if conn.total_changes == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Robot not found")
    
    conn.close()
    
    # Broadcast update
    await manager.broadcast(json.dumps({
        "type": "robot_status_update",
        "robot_id": robot_id,
        "data": status.dict()
    }))
    
    return {"message": "Robot status updated"}

@app.post("/api/sensors/reading")
async def add_sensor_reading(reading: SensorReading):
    """Add new sensor reading"""
    conn = get_db_connection()
    
    conn.execute(
        "INSERT INTO sensor_readings (robot_id, temperature, humidity, soil_moisture) VALUES (?, ?, ?, ?)",
        (reading.robot_id, reading.temperature, reading.humidity, reading.soil_moisture)
    )
    conn.commit()
    conn.close()
    
    # Broadcast update
    await manager.broadcast(json.dumps({
        "type": "sensor_reading",
        "data": reading.dict()
    }))
    
    return {"message": "Sensor reading recorded"}

@app.get("/api/sensors/readings/{robot_id}")
async def get_sensor_readings(robot_id: str, limit: int = 100):
    """Get sensor readings for a robot"""
    conn = get_db_connection()
    
    readings = conn.execute(
        "SELECT * FROM sensor_readings WHERE robot_id = ? ORDER BY timestamp DESC LIMIT ?",
        (robot_id, limit)
    ).fetchall()
    
    conn.close()
    
    return [dict(row) for row in readings]

@app.post("/api/planting/log")
async def add_planting_log(log: PlantingLog):
    """Add planting log entry"""
    conn = get_db_connection()
    
    conn.execute(
        "INSERT INTO planting_logs (robot_id, latitude, longitude, depth, status) VALUES (?, ?, ?, ?, ?)",
        (log.robot_id, log.latitude, log.longitude, log.depth, log.status)
    )
    conn.commit()
    conn.close()
    
    # Broadcast update
    await manager.broadcast(json.dumps({
        "type": "planting_log",
        "data": log.dict()
    }))
    
    return {"message": "Planting log recorded"}

@app.get("/api/planting/logs/{robot_id}")
async def get_planting_logs(robot_id: str, limit: int = 50):
    """Get planting logs for a robot"""
    conn = get_db_connection()
    
    logs = conn.execute(
        "SELECT * FROM planting_logs WHERE robot_id = ? ORDER BY timestamp DESC LIMIT ?",
        (robot_id, limit)
    ).fetchall()
    
    conn.close()
    
    return [dict(row) for row in logs]

@app.post("/api/weather/alert")
async def create_weather_alert(alert: WeatherAlert):
    """Create weather alert"""
    conn = get_db_connection()
    
    # Deactivate previous alerts of same type
    conn.execute(
        "UPDATE weather_alerts SET is_active = FALSE WHERE alert_type = ?",
        (alert.alert_type,)
    )
    
    # Insert new alert
    conn.execute(
        "INSERT INTO weather_alerts (alert_type, message, severity) VALUES (?, ?, ?)",
        (alert.alert_type, alert.message, alert.severity)
    )
    conn.commit()
    conn.close()
    
    # Broadcast alert
    await manager.broadcast(json.dumps({
        "type": "weather_alert",
        "data": alert.dict()
    }))
    
    return {"message": "Weather alert created"}

@app.get("/api/weather/alerts")
async def get_active_alerts():
    """Get active weather alerts"""
    conn = get_db_connection()
    
    alerts = conn.execute(
        "SELECT * FROM weather_alerts WHERE is_active = TRUE ORDER BY created_at DESC"
    ).fetchall()
    
    conn.close()
    
    return [dict(row) for row in alerts]

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back or handle specific commands
            await manager.send_personal_message(f"Message received: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)