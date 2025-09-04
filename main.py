
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
import asyncio
import json
import time
import threading
from typing import List, Dict, Any, Set
from datetime import datetime
import logging

# Import our swarm simulation classes (would be in separate modules)
# For demo purposes, including minimal versions here

import numpy as np
import random
import math
from dataclasses import dataclass, asdict
from enum import Enum
from collections import defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === CORE CLASSES (Simplified versions for demo) ===

class AgentState(Enum):
    IDLE = "idle"
    MOVING = "moving"
    PROCESSING = "processing"
    COMMUNICATING = "communicating"
    CHARGING = "charging"
    FAILED = "failed"

@dataclass
class Vector3D:
    x: float
    y: float
    z: float

    def distance_to(self, other: 'Vector3D') -> float:
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2 + (self.z - other.z)**2)

class SimpleAgent:
    def __init__(self, agent_id: int, x: float = 0, y: float = 0, z: float = 0):
        self.agent_id = agent_id
        self.position = Vector3D(x, y, z)
        self.velocity = Vector3D(
            random.uniform(-2, 2),
            random.uniform(-2, 2),
            random.uniform(-0.5, 0.5)
        )
        self.state = AgentState.MOVING
        self.energy = random.uniform(0.3, 1.0)
        self.target = None
        self.completed_tasks = random.randint(0, 10)
        self.assigned_tasks = random.randint(0, 3)
        self.communications = 0
        self.distance_traveled = 0.0
        self.power_consumption = random.uniform(10, 50)
        self.harvesting_rate = random.uniform(5, 25)

    def update(self, dt: float, environment_size: float = 100):
        # Simple movement and boundary checking
        prev_pos = Vector3D(self.position.x, self.position.y, self.position.z)

        # Random walk with momentum
        if random.random() < 0.1:  # Change direction 10% of time
            self.velocity.x += random.uniform(-0.5, 0.5)
            self.velocity.y += random.uniform(-0.5, 0.5)

        # Apply velocity
        self.position.x += self.velocity.x * dt
        self.position.y += self.velocity.y * dt
        self.position.z += self.velocity.z * dt

        # Boundary checking
        half_size = environment_size / 2
        if abs(self.position.x) > half_size:
            self.velocity.x *= -0.8
            self.position.x = math.copysign(half_size, self.position.x)
        if abs(self.position.y) > half_size:
            self.velocity.y *= -0.8
            self.position.y = math.copysign(half_size, self.position.y)
        if self.position.z < 0:
            self.position.z = 0
            self.velocity.z = abs(self.velocity.z)
        elif self.position.z > 20:
            self.position.z = 20
            self.velocity.z = -abs(self.velocity.z)

        # Update distance traveled
        self.distance_traveled += prev_pos.distance_to(self.position)

        # Update energy
        energy_change = (self.harvesting_rate - self.power_consumption) * dt / 3600.0
        self.energy = max(0.0, min(1.0, self.energy + energy_change / 100.0))

        # Handle low energy
        if self.energy < 0.1:
            self.state = AgentState.CHARGING if random.random() < 0.3 else AgentState.FAILED
        elif self.energy < 0.3:
            self.state = AgentState.CHARGING
        else:
            self.state = AgentState.MOVING if abs(self.velocity.x) + abs(self.velocity.y) > 0.1 else AgentState.IDLE

    def to_dict(self):
        return {
            "agent_id": self.agent_id,
            "position": asdict(self.position),
            "velocity": asdict(self.velocity),
            "state": self.state.value,
            "energy": {
                "current": self.energy,
                "power_consumption": self.power_consumption,
                "harvesting_rate": self.harvesting_rate
            },
            "mission": {
                "assigned_tasks": self.assigned_tasks,
                "completed_tasks": self.completed_tasks
            },
            "performance": {
                "distance_traveled": self.distance_traveled,
                "communications": self.communications
            }
        }

class SwarmSimulation:
    def __init__(self, num_agents: int = 100, environment_size: float = 200):
        self.num_agents = num_agents
        self.environment_size = environment_size
        self.agents = []
        self.obstacles = []
        self.charging_stations = []
        self.missions = []
        self.simulation_time = 0.0
        self.is_running = False

        self.initialize_environment()

    def initialize_environment(self):
        # Create agents
        self.agents = []
        for i in range(self.num_agents):
            x = random.uniform(-self.environment_size/2, self.environment_size/2)
            y = random.uniform(-self.environment_size/2, self.environment_size/2)
            z = random.uniform(0, 10)
            agent = SimpleAgent(i, x, y, z)
            self.agents.append(agent)

        # Create obstacles
        self.obstacles = []
        num_obstacles = random.randint(10, 25)
        for i in range(num_obstacles):
            obstacle = {
                "id": i,
                "position": {
                    "x": random.uniform(-self.environment_size/2, self.environment_size/2),
                    "y": random.uniform(-self.environment_size/2, self.environment_size/2),
                    "z": random.uniform(0, 8)
                },
                "size": random.uniform(3, 10),
                "type": random.choice(["static", "dynamic"])
            }
            self.obstacles.append(obstacle)

        # Create charging stations
        self.charging_stations = []
        num_stations = max(3, self.num_agents // 15)
        for i in range(num_stations):
            station = {
                "id": i,
                "position": {
                    "x": random.uniform(-self.environment_size/2, self.environment_size/2),
                    "y": random.uniform(-self.environment_size/2, self.environment_size/2),
                    "z": 0
                },
                "charging_rate": random.uniform(30, 60),
                "capacity": random.randint(5, 12)
            }
            self.charging_stations.append(station)

        # Create initial missions
        self.missions = []
        mission_types = ["mapping", "object_detection", "data_aggregation", "formation_control"]
        for i in range(3):
            mission = {
                "id": i,
                "type": random.choice(mission_types),
                "target_area": {
                    "center": {
                        "x": random.uniform(-self.environment_size/3, self.environment_size/3),
                        "y": random.uniform(-self.environment_size/3, self.environment_size/3),
                        "z": random.uniform(2, 8)
                    },
                    "radius": random.uniform(10, 25)
                },
                "assigned_agents": random.sample(range(min(20, self.num_agents)), random.randint(3, 8)),
                "status": "active",
                "completion_progress": random.uniform(0.2, 0.8)
            }
            self.missions.append(mission)

        logger.info(f"Environment initialized: {self.num_agents} agents, {len(self.obstacles)} obstacles, {len(self.charging_stations)} charging stations")

    def step(self, dt: float = 0.016):
        if not self.is_running:
            return

        # Update all agents
        for agent in self.agents:
            agent.update(dt, self.environment_size)

        # Update missions progress
        for mission in self.missions:
            if mission["status"] == "active":
                mission["completion_progress"] = min(1.0, mission["completion_progress"] + random.uniform(0.0, 0.01))
                if mission["completion_progress"] >= 1.0:
                    mission["status"] = "completed"

        # Occasionally create new missions
        if random.random() < 0.002 and len([m for m in self.missions if m["status"] == "active"]) < 5:
            self.create_random_mission()

        self.simulation_time += dt

    def create_random_mission(self):
        mission_types = ["mapping", "object_detection", "data_aggregation", "formation_control"]
        mission_id = len(self.missions)
        mission = {
            "id": mission_id,
            "type": random.choice(mission_types),
            "target_area": {
                "center": {
                    "x": random.uniform(-self.environment_size/3, self.environment_size/3),
                    "y": random.uniform(-self.environment_size/3, self.environment_size/3),
                    "z": random.uniform(2, 8)
                },
                "radius": random.uniform(10, 25)
            },
            "assigned_agents": random.sample(range(min(30, self.num_agents)), random.randint(2, 6)),
            "status": "active",
            "completion_progress": 0.0
        }
        self.missions.append(mission)
        return mission

    def create_mission_at_position(self, x: float, y: float, mission_type: str = "mapping"):
        mission_id = len(self.missions)
        mission = {
            "id": mission_id,
            "type": mission_type,
            "target_area": {
                "center": {"x": x, "y": y, "z": 5.0},
                "radius": 15.0
            },
            "assigned_agents": random.sample(range(min(20, self.num_agents)), random.randint(3, 8)),
            "status": "active",
            "completion_progress": 0.0
        }
        self.missions.append(mission)
        return mission

    def get_metrics(self):
        active_agents = len([a for a in self.agents if a.state != AgentState.FAILED])
        failed_agents = self.num_agents - active_agents
        avg_energy = sum(a.energy for a in self.agents) / self.num_agents

        active_missions = len([m for m in self.missions if m["status"] == "active"])
        completed_missions = len([m for m in self.missions if m["status"] == "completed"])
        total_missions = max(1, len(self.missions))
        success_rate = completed_missions / total_missions

        return {
            "simulation_time": round(self.simulation_time, 1),
            "agents": {
                "total": self.num_agents,
                "active": active_agents,
                "failed": failed_agents,
                "average_energy": round(avg_energy, 3)
            },
            "missions": {
                "active": active_missions,
                "completed": completed_missions,
                "success_rate": round(success_rate, 3)
            },
            "communication": {
                "total_messages": sum(a.communications for a in self.agents),
                "packet_delivery_rate": round(random.uniform(0.85, 0.98), 3)
            },
            "performance": {
                "energy_efficiency": round(avg_energy * active_agents / max(1, sum(a.distance_traveled for a in self.agents)), 3),
                "system_uptime": round(active_agents / self.num_agents, 3)
            }
        }

    def get_state(self):
        return {
            "agents": [agent.to_dict() for agent in self.agents],
            "obstacles": self.obstacles,
            "charging_stations": self.charging_stations,
            "active_missions": [m for m in self.missions if m["status"] == "active"],
            "metrics": self.get_metrics(),
            "simulation_time": self.simulation_time
        }

# === FASTAPI APPLICATION ===

app = FastAPI(title="Autonomous Edge-Intelligent Swarm OS", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global simulation instance
simulation = SwarmSimulation(num_agents=100, environment_size=200)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                disconnected.append(connection)

        # Remove disconnected connections
        for connection in disconnected:
            self.active_connections.remove(connection)

manager = ConnectionManager()

# Background task to run simulation and broadcast updates
simulation_task = None
async def simulation_loop():
    while simulation.is_running:
        simulation.step()

        # Broadcast state to all connected clients
        state_update = {
            "type": "state_update",
            "data": simulation.get_state()
        }
        await manager.broadcast(state_update)

        # Sleep to maintain ~60 FPS
        await asyncio.sleep(0.016)

# === API ROUTES ===

@app.get("/")
async def get_dashboard():
    # Serve the dashboard HTML
    html_content = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>Autonomous Edge-Intelligent Swarm OS</title>
        <meta charset="UTF-8">
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                background: #0a0a0a; 
                color: white;
            }
            .container { 
                max-width: 1200px; 
                margin: 0 auto; 
            }
            .header { 
                text-align: center; 
                margin-bottom: 30px; 
            }
            .status-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin: 20px 0;
            }
            .status-card {
                background: #1a1a1a;
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #333;
            }
            .metric-value {
                font-size: 2em;
                font-weight: bold;
                color: #00bcd4;
            }
            .controls {
                text-align: center;
                margin: 30px 0;
            }
            .btn {
                background: #00bcd4;
                color: white;
                border: none;
                padding: 10px 20px;
                margin: 5px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            }
            .btn:hover {
                background: #0097a7;
            }
            .btn:disabled {
                background: #555;
                cursor: not-allowed;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🤖 Autonomous Edge-Intelligent Swarm OS</h1>
                <p>Real-time monitoring and control dashboard</p>
            </div>

            <div class="controls">
                <button class="btn" onclick="startSimulation()">▶️ Start Simulation</button>
                <button class="btn" onclick="stopSimulation()">⏸️ Stop Simulation</button>
                <button class="btn" onclick="resetSimulation()">🔄 Reset</button>
                <button class="btn" onclick="openFullDashboard()">🚀 Open Advanced Dashboard</button>
            </div>

            <div class="status-grid" id="metrics">
                <div class="status-card">
                    <h3>📊 System Status</h3>
                    <div class="metric-value" id="system-status">Initializing...</div>
                </div>
                <div class="status-card">
                    <h3>🤖 Active Agents</h3>
                    <div class="metric-value" id="active-agents">0 / 0</div>
                </div>
                <div class="status-card">
                    <h3>⚡ Average Energy</h3>
                    <div class="metric-value" id="avg-energy">0%</div>
                </div>
                <div class="status-card">
                    <h3>🎯 Active Missions</h3>
                    <div class="metric-value" id="active-missions">0</div>
                </div>
                <div class="status-card">
                    <h3>📡 Packet Delivery</h3>
                    <div class="metric-value" id="packet-delivery">0%</div>
                </div>
                <div class="status-card">
                    <h3>⏱️ System Uptime</h3>
                    <div class="metric-value" id="system-uptime">0%</div>
                </div>
            </div>

            <div style="margin: 30px 0; text-align: center;">
                <h3>🔗 WebSocket Status: <span id="ws-status" style="color: #ff5722;">Disconnected</span></h3>
                <p>Real-time updates: <span id="update-count">0</span></p>
            </div>
        </div>

        <script>
            let ws = null;
            let updateCount = 0;

            function connectWebSocket() {
                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = wsProtocol + '//' + window.location.host + '/ws';

                ws = new WebSocket(wsUrl);

                ws.onopen = function() {
                    document.getElementById('ws-status').textContent = 'Connected';
                    document.getElementById('ws-status').style.color = '#4caf50';
                };

                ws.onmessage = function(event) {
                    const data = JSON.parse(event.data);
                    if (data.type === 'state_update') {
                        updateMetrics(data.data);
                        updateCount++;
                        document.getElementById('update-count').textContent = updateCount;
                    }
                };

                ws.onclose = function() {
                    document.getElementById('ws-status').textContent = 'Disconnected';
                    document.getElementById('ws-status').style.color = '#ff5722';
                    setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
                };
            }

            function updateMetrics(data) {
                const metrics = data.metrics;
                document.getElementById('system-status').textContent = 'Online';
                document.getElementById('active-agents').textContent = `${metrics.agents.active} / ${metrics.agents.total}`;
                document.getElementById('avg-energy').textContent = `${Math.round(metrics.agents.average_energy * 100)}%`;
                document.getElementById('active-missions').textContent = metrics.missions.active;
                document.getElementById('packet-delivery').textContent = `${Math.round(metrics.communication.packet_delivery_rate * 100)}%`;
                document.getElementById('system-uptime').textContent = `${Math.round(metrics.performance.system_uptime * 100)}%`;
            }

            async function startSimulation() {
                try {
                    const response = await fetch('/api/simulation/start', { method: 'POST' });
                    const result = await response.json();
                    console.log('Simulation started:', result);
                } catch (error) {
                    console.error('Error starting simulation:', error);
                }
            }

            async function stopSimulation() {
                try {
                    const response = await fetch('/api/simulation/stop', { method: 'POST' });
                    const result = await response.json();
                    console.log('Simulation stopped:', result);
                } catch (error) {
                    console.error('Error stopping simulation:', error);
                }
            }

            async function resetSimulation() {
                try {
                    const response = await fetch('/api/simulation/reset', { method: 'POST' });
                    const result = await response.json();
                    console.log('Simulation reset:', result);
                } catch (error) {
                    console.error('Error resetting simulation:', error);
                }
            }

            function openFullDashboard() {
                window.open('/dashboard', '_blank');
            }

            // Initialize WebSocket connection
            connectWebSocket();
        </script>
    </body>
    </html>
    '''
    return HTMLResponse(content=html_content)

@app.get("/dashboard")
async def get_full_dashboard():
    return FileResponse("dashboard.html")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial state
        initial_state = {
            "type": "initial_state",
            "data": simulation.get_state()
        }
        await websocket.send_text(json.dumps(initial_state))

        # Keep connection alive
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/simulation/start")
async def start_simulation():
    global simulation_task
    simulation.is_running = True

    if simulation_task is None or simulation_task.done():
        simulation_task = asyncio.create_task(simulation_loop())

    return {"status": "started", "message": "Simulation started successfully"}

@app.post("/api/simulation/stop")
async def stop_simulation():
    simulation.is_running = False
    return {"status": "stopped", "message": "Simulation stopped successfully"}

@app.post("/api/simulation/reset")
async def reset_simulation():
    global simulation_task
    simulation.is_running = False

    if simulation_task and not simulation_task.done():
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass

    simulation.initialize_environment()
    simulation.simulation_time = 0.0

    return {"status": "reset", "message": "Simulation reset successfully"}

@app.get("/api/state")
async def get_current_state():
    return {"status": "success", "data": simulation.get_state()}

@app.get("/api/metrics")
async def get_metrics():
    return {"status": "success", "data": simulation.get_metrics()}

@app.post("/api/mission/create")
async def create_mission(mission_data: dict):
    try:
        mission = simulation.create_mission_at_position(
            x=mission_data.get("x", 0),
            y=mission_data.get("y", 0),
            mission_type=mission_data.get("type", "mapping")
        )
        return {"status": "success", "mission": mission}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/agent/{agent_id}")
async def get_agent_details(agent_id: int):
    if 0 <= agent_id < len(simulation.agents):
        return {"status": "success", "agent": simulation.agents[agent_id].to_dict()}
    else:
        raise HTTPException(status_code=404, detail="Agent not found")

@app.put("/api/agent/{agent_id}")
async def modify_agent(agent_id: int, modifications: dict):
    if 0 <= agent_id < len(simulation.agents):
        agent = simulation.agents[agent_id]

        if "energy" in modifications:
            agent.energy = max(0.0, min(1.0, float(modifications["energy"])))

        if "position" in modifications:
            pos = modifications["position"]
            agent.position.x = pos.get("x", agent.position.x)
            agent.position.y = pos.get("y", agent.position.y)
            agent.position.z = pos.get("z", agent.position.z)

        return {"status": "success", "agent": agent.to_dict()}
    else:
        raise HTTPException(status_code=404, detail="Agent not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
