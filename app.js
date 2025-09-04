// Autonomous Edge-Intelligent Swarm OS Dashboard
class SwarmDashboard {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.agents = [];
        this.obstacles = [];
        this.chargingStations = [];
        this.missions = [];
        this.selectedAgent = null;
        this.isRunning = false;
        this.simulationSpeed = 1.0;
        this.agentCount = 100;
        this.communicationLinks = [];
        this.agentTrails = new Map();
        this.showGrid = true;
        this.showTrails = false;
        
        // Performance metrics
        this.metrics = {
            simulation_time: 0,
            agents: { total: 100, active: 96, failed: 4, average_energy: 0.73 },
            missions: { active: 3, completed: 12, success_rate: 0.89 },
            communication: { total_messages: 1847, packet_delivery_rate: 0.94 },
            performance: { energy_efficiency: 0.82, system_uptime: 0.96 }
        };
        
        // Chart data
        this.chartData = {
            energy_history: [0.89, 0.87, 0.85, 0.83, 0.81, 0.79, 0.76, 0.74, 0.73],
            active_agents_history: [100, 99, 98, 98, 97, 97, 96, 96, 96],
            mission_success_history: [0.85, 0.86, 0.87, 0.87, 0.88, 0.88, 0.89, 0.89, 0.89]
        };
        
        this.charts = {};
        this.animationId = null;
        this.lastUpdateTime = 0;
        this.missionCreationMode = false;
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        this.initThreeJS();
        this.createEnvironment();
        this.initializeAgents();
        this.setupEventListeners();
        this.initCharts();
        this.updateUI();
        this.startSimulation();
    }
    
    initThreeJS() {
        const container = document.getElementById('threejs-container');
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);
        this.scene.fog = new THREE.Fog(0x0a0a0a, 50, 200);
        
        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(0, 0, 0);
        
        // Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        // Controls
        this.setupCameraControls();
        
        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    setupCameraControls() {
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousedown', (event) => {
            isDragging = true;
            previousMousePosition.x = event.clientX;
            previousMousePosition.y = event.clientY;
        });
        
        canvas.addEventListener('mousemove', (event) => {
            if (!isDragging) return;
            
            const deltaMove = {
                x: event.clientX - previousMousePosition.x,
                y: event.clientY - previousMousePosition.y
            };
            
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(this.camera.position);
            
            spherical.theta -= deltaMove.x * 0.01;
            spherical.phi += deltaMove.y * 0.01;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            
            this.camera.position.setFromSpherical(spherical);
            this.camera.lookAt(0, 0, 0);
            
            previousMousePosition.x = event.clientX;
            previousMousePosition.y = event.clientY;
        });
        
        canvas.addEventListener('mouseup', (event) => {
            if (!isDragging) {
                // Handle click for agent selection only if not dragging
                this.onCanvasClick(event);
            }
            isDragging = false;
        });
        
        canvas.addEventListener('wheel', (event) => {
            const distance = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
            const zoomSpeed = distance * 0.001;
            
            if (event.deltaY > 0) {
                this.camera.position.multiplyScalar(1 + zoomSpeed);
            } else {
                this.camera.position.multiplyScalar(1 - zoomSpeed);
            }
            
            const minDistance = 10;
            const maxDistance = 200;
            const currentDistance = this.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
            if (currentDistance < minDistance || currentDistance > maxDistance) {
                this.camera.position.normalize().multiplyScalar(Math.max(minDistance, Math.min(maxDistance, currentDistance)));
            }
            
            event.preventDefault();
        });
    }
    
    createEnvironment() {
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Grid helper
        this.gridHelper = new THREE.GridHelper(200, 50, 0x32b8c6, 0x333333);
        this.scene.add(this.gridHelper);
        
        // Create obstacles
        this.createObstacles();
        this.createChargingStations();
    }
    
    createObstacles() {
        const obstacleData = [
            { id: 0, position: { x: 10, y: 15, z: 2.5 }, size: 5.0, type: "static" },
            { id: 1, position: { x: -20, y: -8, z: 3.2 }, size: 7.5, type: "dynamic" },
            { id: 2, position: { x: 30, y: 30, z: 4.0 }, size: 6.0, type: "static" },
            { id: 3, position: { x: -40, y: 20, z: 3.5 }, size: 5.5, type: "static" }
        ];
        
        obstacleData.forEach(obstacle => {
            const geometry = new THREE.BoxGeometry(obstacle.size, obstacle.size, obstacle.size);
            const material = new THREE.MeshLambertMaterial({
                color: obstacle.type === 'dynamic' ? 0x8b4513 : 0x696969,
                transparent: true,
                opacity: 0.7
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(obstacle.position.x, obstacle.position.z, obstacle.position.y);
            mesh.castShadow = true;
            mesh.userData = obstacle;
            this.scene.add(mesh);
            this.obstacles.push(mesh);
        });
    }
    
    createChargingStations() {
        const stationData = [
            { id: 0, position: { x: -30, y: 25, z: 0 }, charging_rate: 45.0, capacity: 8 },
            { id: 1, position: { x: 35, y: -15, z: 0 }, charging_rate: 38.5, capacity: 6 },
            { id: 2, position: { x: -10, y: -35, z: 0 }, charging_rate: 42.0, capacity: 10 }
        ];
        
        stationData.forEach(station => {
            const geometry = new THREE.CylinderGeometry(3, 3, 8);
            const material = new THREE.MeshLambertMaterial({ color: 0x32c832 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(station.position.x, 4, station.position.y);
            mesh.castShadow = true;
            mesh.userData = station;
            this.scene.add(mesh);
            this.chargingStations.push(mesh);
        });
    }
    
    initializeAgents() {
        const agentGeometry = new THREE.SphereGeometry(0.8, 12, 8); // Slightly larger for easier clicking
        
        for (let i = 0; i < this.agentCount; i++) {
            const agent = this.createAgent(i, agentGeometry);
            this.agents.push(agent);
            this.scene.add(agent.mesh);
        }
    }
    
    createAgent(id, geometry) {
        const states = ['moving', 'idle', 'charging', 'failed'];
        const state = states[Math.floor(Math.random() * (states.length - 1))]; // Avoid 'failed' for most agents
        
        const agent = {
            agent_id: id,
            position: {
                x: (Math.random() - 0.5) * 180,
                y: (Math.random() - 0.5) * 180,
                z: Math.random() * 10 + 2
            },
            velocity: {
                x: (Math.random() - 0.5) * 3,
                y: (Math.random() - 0.5) * 3,
                z: (Math.random() - 0.5) * 0.5
            },
            state: state,
            energy: {
                current: Math.random() * 0.8 + 0.2,
                power_consumption: Math.random() * 20 + 10,
                harvesting_rate: Math.random() * 30 + 10
            },
            mission: {
                assigned_tasks: Math.floor(Math.random() * 3),
                completed_tasks: Math.floor(Math.random() * 8)
            },
            performance: {
                distance_traveled: Math.random() * 200,
                communications: Math.floor(Math.random() * 50)
            },
            target: null,
            trail: []
        };
        
        // Create mesh
        const color = this.getAgentColor(agent);
        const material = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(agent.position.x, agent.position.z, agent.position.y);
        mesh.castShadow = true;
        mesh.userData = { type: 'agent', agent: agent }; // Proper userData structure
        
        agent.mesh = mesh;
        
        return agent;
    }
    
    getAgentColor(agent) {
        if (agent.state === 'failed') return 0x888888;
        if (agent.state === 'charging') return 0x32c832;
        if (agent.energy.current < 0.3) return 0xff5459;
        if (agent.energy.current < 0.6) return 0xffc185;
        return 0x32b8c6;
    }
    
    setupEventListeners() {
        // Simulation controls
        const playPauseBtn = document.getElementById('playPauseBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.toggleSimulation());
        }
        
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetSimulation());
        }
        
        // Parameter controls
        const speedSlider = document.getElementById('speedSlider');
        const agentCountSlider = document.getElementById('agentCountSlider');
        
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.simulationSpeed = parseFloat(e.target.value);
                const speedValue = document.getElementById('speedValue');
                if (speedValue) {
                    speedValue.textContent = this.simulationSpeed.toFixed(1) + 'x';
                }
            });
        }
        
        if (agentCountSlider) {
            agentCountSlider.addEventListener('input', (e) => {
                const newCount = parseInt(e.target.value);
                const agentCountValue = document.getElementById('agentCountValue');
                if (agentCountValue) {
                    agentCountValue.textContent = newCount;
                }
                this.updateAgentCount(newCount);
            });
        }
        
        // View controls
        const toggleGridBtn = document.getElementById('toggleGridBtn');
        const toggleTrailsBtn = document.getElementById('toggleTrailsBtn');
        const resetCameraBtn = document.getElementById('resetCameraBtn');
        
        if (toggleGridBtn) {
            toggleGridBtn.addEventListener('click', () => this.toggleGrid());
        }
        
        if (toggleTrailsBtn) {
            toggleTrailsBtn.addEventListener('click', () => this.toggleTrails());
        }
        
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', () => this.resetCamera());
        }
        
        // Mission controls - Fixed event listeners
        const createMissionBtn = document.getElementById('createMissionBtn');
        const closeMissionModal = document.getElementById('closeMissionModal');
        const cancelMission = document.getElementById('cancelMission');
        const confirmMission = document.getElementById('confirmMission');
        
        if (createMissionBtn) {
            createMissionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openMissionModal();
            });
        }
        
        if (closeMissionModal) {
            closeMissionModal.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeMissionModal();
            });
        }
        
        if (cancelMission) {
            cancelMission.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeMissionModal();
            });
        }
        
        if (confirmMission) {
            confirmMission.addEventListener('click', (e) => {
                e.preventDefault();
                this.confirmMission();
            });
        }
    }
    
    initCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#ccc', font: { size: 10 } }
                }
            }
        };
        
        // Energy Chart
        const energyChart = document.getElementById('energyChart');
        if (energyChart) {
            this.charts.energy = new Chart(energyChart, {
                type: 'line',
                data: {
                    labels: Array.from({ length: 20 }, (_, i) => i),
                    datasets: [{
                        label: 'Average Energy',
                        data: this.chartData.energy_history.concat(Array(11).fill(0.73)),
                        borderColor: '#32b8c6',
                        backgroundColor: 'rgba(50, 184, 198, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { 
                    ...chartOptions,
                    plugins: {
                        ...chartOptions.plugins,
                        title: { display: true, text: 'Energy Levels (%)', color: '#fff' }
                    }
                }
            });
        }
        
        // Active Agents Chart
        const agentsChart = document.getElementById('agentsChart');
        if (agentsChart) {
            this.charts.agents = new Chart(agentsChart, {
                type: 'line',
                data: {
                    labels: Array.from({ length: 20 }, (_, i) => i),
                    datasets: [{
                        label: 'Active Agents',
                        data: this.chartData.active_agents_history.concat(Array(11).fill(96)),
                        borderColor: '#32c832',
                        backgroundColor: 'rgba(50, 200, 50, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    ...chartOptions,
                    plugins: {
                        ...chartOptions.plugins,
                        title: { display: true, text: 'Active Agents', color: '#fff' }
                    }
                }
            });
        }
        
        // Mission Success Chart
        const missionChart = document.getElementById('missionChart');
        if (missionChart) {
            this.charts.mission = new Chart(missionChart, {
                type: 'line',
                data: {
                    labels: Array.from({ length: 20 }, (_, i) => i),
                    datasets: [{
                        label: 'Mission Success Rate',
                        data: this.chartData.mission_success_history.concat(Array(11).fill(0.89)),
                        borderColor: '#ffc185',
                        backgroundColor: 'rgba(255, 193, 133, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    ...chartOptions,
                    plugins: {
                        ...chartOptions.plugins,
                        title: { display: true, text: 'Mission Success (%)', color: '#fff' }
                    }
                }
            });
        }
    }
    
    updateSimulation(deltaTime) {
        if (!this.isRunning) return;
        
        // Update agents
        this.agents.forEach(agent => this.updateAgent(agent, deltaTime));
        
        // Update communication links
        this.updateCommunicationLinks();
        
        // Update metrics
        this.updateMetrics();
        
        // Update UI periodically
        if (Date.now() - this.lastUpdateTime > 100) {
            this.updateUI();
            this.updateCharts();
            this.lastUpdateTime = Date.now();
        }
    }
    
    updateAgent(agent, deltaTime) {
        if (agent.state === 'failed') return;
        
        const speed = this.simulationSpeed * deltaTime * 0.001;
        
        // Simple flocking behavior
        if (agent.state === 'moving') {
            // Random walk with some direction
            if (Math.random() < 0.01) {
                agent.velocity.x += (Math.random() - 0.5) * 0.2;
                agent.velocity.y += (Math.random() - 0.5) * 0.2;
            }
            
            // Boundary avoidance
            const boundary = 90;
            if (Math.abs(agent.position.x) > boundary) {
                agent.velocity.x *= -0.5;
            }
            if (Math.abs(agent.position.y) > boundary) {
                agent.velocity.y *= -0.5;
            }
            
            // Update position
            agent.position.x += agent.velocity.x * speed;
            agent.position.y += agent.velocity.y * speed;
            agent.position.z += agent.velocity.z * speed * 0.1;
            
            // Keep agents at reasonable height
            agent.position.z = Math.max(1, Math.min(15, agent.position.z));
            
            // Update energy
            agent.energy.current -= agent.energy.power_consumption * speed * 0.0001;
        } else if (agent.state === 'charging') {
            // Recharge energy
            agent.energy.current += agent.energy.harvesting_rate * speed * 0.0001;
        }
        
        // State transitions
        if (agent.energy.current <= 0.2 && agent.state === 'moving') {
            // Find nearest charging station
            const nearestStation = this.findNearestChargingStation(agent);
            if (nearestStation) {
                agent.state = 'charging';
            }
        } else if (agent.energy.current >= 0.8 && agent.state === 'charging') {
            agent.state = 'moving';
        }
        
        // Clamp energy
        agent.energy.current = Math.max(0, Math.min(1, agent.energy.current));
        
        // Update mesh position and color
        agent.mesh.position.set(agent.position.x, agent.position.z, agent.position.y);
        agent.mesh.material.color.setHex(this.getAgentColor(agent));
        
        // Update performance metrics
        agent.performance.distance_traveled += Math.sqrt(
            agent.velocity.x ** 2 + agent.velocity.y ** 2
        ) * speed;
    }
    
    findNearestChargingStation(agent) {
        let nearest = null;
        let minDistance = Infinity;
        
        this.chargingStations.forEach(station => {
            const distance = Math.sqrt(
                (agent.position.x - station.position.x) ** 2 +
                (agent.position.y - station.position.z) ** 2
            );
            if (distance < minDistance) {
                minDistance = distance;
                nearest = station;
            }
        });
        
        return nearest;
    }
    
    updateCommunicationLinks() {
        // Clear existing links
        this.communicationLinks.forEach(link => {
            this.scene.remove(link);
        });
        this.communicationLinks = [];
        
        // Create new links between nearby agents
        const commRange = 20;
        for (let i = 0; i < this.agents.length; i++) {
            for (let j = i + 1; j < this.agents.length; j++) {
                const agent1 = this.agents[i];
                const agent2 = this.agents[j];
                
                if (agent1.state === 'failed' || agent2.state === 'failed') continue;
                
                const distance = Math.sqrt(
                    (agent1.position.x - agent2.position.x) ** 2 +
                    (agent1.position.y - agent2.position.y) ** 2 +
                    (agent1.position.z - agent2.position.z) ** 2
                );
                
                if (distance < commRange && Math.random() < 0.1) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(agent1.position.x, agent1.position.z, agent1.position.y),
                        new THREE.Vector3(agent2.position.x, agent2.position.z, agent2.position.y)
                    ]);
                    const material = new THREE.LineBasicMaterial({
                        color: 0x32b8c6,
                        transparent: true,
                        opacity: 0.3
                    });
                    const line = new THREE.Line(geometry, material);
                    this.scene.add(line);
                    this.communicationLinks.push(line);
                }
            }
        }
    }
    
    updateMetrics() {
        // Calculate real-time metrics
        const activeAgents = this.agents.filter(a => a.state !== 'failed').length;
        const totalEnergy = this.agents.reduce((sum, a) => sum + a.energy.current, 0);
        const avgEnergy = totalEnergy / this.agents.length;
        
        this.metrics.agents.active = activeAgents;
        this.metrics.agents.failed = this.agents.length - activeAgents;
        this.metrics.agents.average_energy = avgEnergy;
        this.metrics.simulation_time += 0.1;
        
        // Simulate other metrics
        this.metrics.communication.total_messages += Math.floor(Math.random() * 10);
        this.metrics.communication.packet_delivery_rate = 0.92 + Math.random() * 0.06;
    }
    
    updateUI() {
        // Update metric displays
        const activeAgentsEl = document.getElementById('activeAgents');
        const avgEnergyEl = document.getElementById('avgEnergy');
        const missionSuccessEl = document.getElementById('missionSuccess');
        const packetDeliveryEl = document.getElementById('packetDelivery');
        const totalMessagesEl = document.getElementById('totalMessages');
        const rlncEfficiencyEl = document.getElementById('rlncEfficiency');
        const networkLatencyEl = document.getElementById('networkLatency');
        
        if (activeAgentsEl) activeAgentsEl.textContent = this.metrics.agents.active;
        if (avgEnergyEl) avgEnergyEl.textContent = Math.round(this.metrics.agents.average_energy * 100) + '%';
        if (missionSuccessEl) missionSuccessEl.textContent = Math.round(this.metrics.missions.success_rate * 100) + '%';
        if (packetDeliveryEl) packetDeliveryEl.textContent = Math.round(this.metrics.communication.packet_delivery_rate * 100) + '%';
        
        if (totalMessagesEl) totalMessagesEl.textContent = this.metrics.communication.total_messages.toLocaleString();
        if (rlncEfficiencyEl) rlncEfficiencyEl.textContent = Math.round(this.metrics.communication.packet_delivery_rate * 100) + '%';
        if (networkLatencyEl) networkLatencyEl.textContent = Math.floor(Math.random() * 20 + 8) + 'ms';
        
        // Update mission list
        this.updateMissionList();
    }
    
    updateMissionList() {
        const missionList = document.getElementById('missionList');
        if (!missionList) return;
        
        missionList.innerHTML = '';
        
        // Sample missions
        const missions = [
            { id: 1, type: 'Mapping', progress: 65, agents: 4, status: 'Active' },
            { id: 2, type: 'Surveillance', progress: 89, agents: 6, status: 'Active' },
            { id: 3, type: 'Data Collection', progress: 100, agents: 3, status: 'Complete' }
        ];
        
        missions.forEach(mission => {
            const missionItem = document.createElement('div');
            missionItem.className = 'mission-item';
            missionItem.innerHTML = `
                <h4>${mission.type} Mission #${mission.id}</h4>
                <div class="mission-progress">
                    <div class="mission-progress-fill" style="width: ${mission.progress}%"></div>
                </div>
                <div class="mission-stats">
                    <span>Agents: ${mission.agents}</span>
                    <span>${mission.progress}% Complete</span>
                </div>
            `;
            missionList.appendChild(missionItem);
        });
    }
    
    updateCharts() {
        // Update chart data
        Object.values(this.charts).forEach(chart => {
            const dataset = chart.data.datasets[0];
            dataset.data.shift();
            
            if (chart === this.charts.energy) {
                dataset.data.push(this.metrics.agents.average_energy);
            } else if (chart === this.charts.agents) {
                dataset.data.push(this.metrics.agents.active);
            } else if (chart === this.charts.mission) {
                dataset.data.push(this.metrics.missions.success_rate);
            }
            
            chart.update('none');
        });
    }
    
    onCanvasClick(event) {
        if (this.missionCreationMode) {
            // Handle mission creation
            this.createMissionAt(event);
            return;
        }
        
        // Handle agent selection - Fixed raycasting
        const mouse = new THREE.Vector2();
        const rect = this.renderer.domElement.getBoundingClientRect();
        
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        const agentMeshes = this.agents.map(a => a.mesh);
        const intersects = raycaster.intersectObjects(agentMeshes);
        
        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            const agentData = selectedMesh.userData;
            
            // Make sure we have the agent reference
            if (agentData && agentData.agent) {
                this.selectedAgent = agentData.agent;
            } else {
                // Fallback: find agent by mesh
                this.selectedAgent = this.agents.find(a => a.mesh === selectedMesh);
            }
            
            if (this.selectedAgent) {
                this.updateAgentDetails(this.selectedAgent);
                
                // Highlight selected agent
                this.agents.forEach(agent => {
                    agent.mesh.material.emissive.setHex(0x000000);
                });
                selectedMesh.material.emissive.setHex(0x444444);
            }
        } else {
            // Deselect if clicking empty space
            this.selectedAgent = null;
            this.agents.forEach(agent => {
                agent.mesh.material.emissive.setHex(0x000000);
            });
            
            const detailsPanel = document.getElementById('agentDetails');
            if (detailsPanel) {
                detailsPanel.innerHTML = '<p class="text-muted">Click an agent to view details</p>';
            }
        }
    }
    
    updateAgentDetails(agent) {
        const detailsPanel = document.getElementById('agentDetails');
        if (!detailsPanel || !agent) return;
        
        detailsPanel.innerHTML = `
            <div class="agent-detail-item">
                <span class="agent-detail-label">Agent ID:</span>
                <span class="agent-detail-value">#${agent.agent_id}</span>
            </div>
            <div class="agent-detail-item">
                <span class="agent-detail-label">Status:</span>
                <span class="agent-detail-value">${agent.state}</span>
            </div>
            <div class="agent-detail-item">
                <span class="agent-detail-label">Energy:</span>
                <span class="agent-detail-value">${Math.round(agent.energy.current * 100)}%</span>
            </div>
            <div class="agent-detail-item">
                <span class="agent-detail-label">Position:</span>
                <span class="agent-detail-value">${agent.position.x.toFixed(1)}, ${agent.position.y.toFixed(1)}, ${agent.position.z.toFixed(1)}</span>
            </div>
            <div class="agent-detail-item">
                <span class="agent-detail-label">Tasks:</span>
                <span class="agent-detail-value">${agent.mission.completed_tasks}/${agent.mission.completed_tasks + agent.mission.assigned_tasks}</span>
            </div>
            <div class="agent-detail-item">
                <span class="agent-detail-label">Distance:</span>
                <span class="agent-detail-value">${agent.performance.distance_traveled.toFixed(1)}m</span>
            </div>
            <div class="agent-detail-item">
                <span class="agent-detail-label">Communications:</span>
                <span class="agent-detail-value">${agent.performance.communications}</span>
            </div>
        `;
    }
    
    toggleSimulation() {
        this.isRunning = !this.isRunning;
        const btn = document.getElementById('playPauseBtn');
        if (btn) {
            btn.textContent = this.isRunning ? '⏸ Pause' : '▶ Start';
        }
    }
    
    resetSimulation() {
        this.isRunning = false;
        const btn = document.getElementById('playPauseBtn');
        if (btn) {
            btn.textContent = '▶ Start';
        }
        
        // Reset agent positions and states
        this.agents.forEach(agent => {
            agent.position = {
                x: (Math.random() - 0.5) * 180,
                y: (Math.random() - 0.5) * 180,
                z: Math.random() * 10 + 2
            };
            agent.energy.current = Math.random() * 0.8 + 0.2;
            agent.state = 'moving';
            agent.performance.distance_traveled = 0;
        });
        
        this.metrics.simulation_time = 0;
    }
    
    updateAgentCount(newCount) {
        const currentCount = this.agents.length;
        
        if (newCount > currentCount) {
            // Add new agents
            const agentGeometry = new THREE.SphereGeometry(0.8, 12, 8);
            for (let i = currentCount; i < newCount; i++) {
                const agent = this.createAgent(i, agentGeometry);
                this.agents.push(agent);
                this.scene.add(agent.mesh);
            }
        } else if (newCount < currentCount) {
            // Remove excess agents
            for (let i = currentCount - 1; i >= newCount; i--) {
                this.scene.remove(this.agents[i].mesh);
                this.agents.splice(i, 1);
            }
        }
        
        this.agentCount = newCount;
        this.metrics.agents.total = newCount;
    }
    
    toggleGrid() {
        this.showGrid = !this.showGrid;
        if (this.gridHelper) {
            this.gridHelper.visible = this.showGrid;
        }
    }
    
    toggleTrails() {
        this.showTrails = !this.showTrails;
        // Implementation for agent trails would go here
    }
    
    resetCamera() {
        this.camera.position.set(50, 50, 50);
        this.camera.lookAt(0, 0, 0);
    }
    
    openMissionModal() {
        const modal = document.getElementById('missionModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.missionCreationMode = true;
        }
    }
    
    closeMissionModal() {
        const modal = document.getElementById('missionModal');
        if (modal) {
            modal.classList.add('hidden');
            this.missionCreationMode = false;
        }
    }
    
    confirmMission() {
        const typeSelect = document.getElementById('missionType');
        const prioritySelect = document.getElementById('missionPriority');
        
        if (typeSelect && prioritySelect) {
            const type = typeSelect.value;
            const priority = prioritySelect.value;
            
            // In a real implementation, this would create a mission at the clicked location
            console.log(`Creating ${priority} priority ${type} mission`);
            
            // Add to metrics
            this.metrics.missions.active++;
        }
        
        this.closeMissionModal();
    }
    
    createMissionAt(event) {
        // Handle mission creation at clicked location
        console.log('Creating mission at clicked location');
        this.missionCreationMode = false;
    }
    
    onWindowResize() {
        const container = document.getElementById('threejs-container');
        if (container && this.camera && this.renderer) {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        }
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime;
        
        this.updateSimulation(deltaTime);
        
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    startSimulation() {
        this.lastUpdateTime = Date.now();
        this.animate();
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SwarmDashboard();
});