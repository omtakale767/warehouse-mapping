
/* =========================================
   WAREFLOW - WAREHOUSE ROUTING ENGINE
   Dijkstra + Min Heap + Interactive SVG
   ========================================= */

"use strict";

const graph = {
    A: { B: 4, D: 3 },
    B: { A: 4, C: 2, E: 5 },
    C: { B: 5, F: 4 },
    D: { A: 3, E: 3, G: 5 },
    E: { B: 5, D: 3, F: 2, H: 4 },
    F: { C: 4, E: 2, I: 3 },
    G: { D: 5, H: 2, J: 4 },
    H: { E: 4, G: 2, I: 3, K: 5 },
    I: { F: 8, H: 3, L: 7 },
    J: { G: 4, K: 3 },
    K: { H: 5, J: 3, L: 9, M: 4 },
    L: { I: 4, K: 2, M: 3 },
    M: { K: 4, L: 3 }
};

const BLOCKED_PATHS = ["B-E", "H-I"];
const CONGESTED_PATHS = ["C-F", "E-F", "G-H", "K-L"];

let congestionEnabled = false;
let blockedEnabled = false;
let toastTimer = null;

const sourceSelect = document.getElementById("source");
const destinationSelect = document.getElementById("destination");
const aiMode = document.getElementById("aiMode");
const blockMode = document.getElementById("blockMode");
const resultContainer = document.getElementById("result");
const sidebar = document.getElementById("sidebar");
const toastElement = document.getElementById("toast");

/* -----------------------------------------
   MIN HEAP PRIORITY QUEUE
   ----------------------------------------- */

class MinHeap {
    constructor() {
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(item) {
        this.items.push(item);
        this.bubbleUp(this.items.length - 1);
    }

    pop() {
        if (this.items.length === 0) return null;

        const minimum = this.items[0];
        const last = this.items.pop();

        if (this.items.length > 0) {
            this.items[0] = last;
            this.bubbleDown(0);
        }

        return minimum;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);

            if (this.items[parent].cost <= this.items[index].cost) {
                break;
            }

            [this.items[parent], this.items[index]] =
                [this.items[index], this.items[parent]];

            index = parent;
        }
    }

    bubbleDown(index) {
        while (true) {
            let smallest = index;
            const left = index * 2 + 1;
            const right = index * 2 + 2;

            if (
                left < this.items.length &&
                this.items[left].cost < this.items[smallest].cost
            ) {
                smallest = left;
            }

            if (
                right < this.items.length &&
                this.items[right].cost < this.items[smallest].cost
            ) {
                smallest = right;
            }

            if (smallest === index) break;

            [this.items[index], this.items[smallest]] =
                [this.items[smallest], this.items[index]];

            index = smallest;
        }
    }
}

/* -----------------------------------------
   PATH HELPERS
   ----------------------------------------- */

function edgeKey(a, b) {
    return [a, b].sort().join("-");
}

function edgeElementId(a, b) {
    return `edge-${edgeKey(a, b)}`;
}

function getEdgeCost(a, b, baseCost) {
    const key = edgeKey(a, b);

    if (congestionEnabled && CONGESTED_PATHS.includes(key)) {
        return baseCost * 2;
    }

    return baseCost;
}

/* -----------------------------------------
   DIJKSTRA SHORTEST-PATH ALGORITHM
   ----------------------------------------- */

function findShortestPath(start, destination) {
    if (!graph[start] || !graph[destination]) {
        return null;
    }

    const distances = {};
    const previous = {};
    const heap = new MinHeap();

    for (const node of Object.keys(graph)) {
        distances[node] = Infinity;
        previous[node] = null;
    }

    distances[start] = 0;
    heap.push({ node: start, cost: 0 });

    while (heap.size > 0) {
        const current = heap.pop();
        const node = current.node;

        // Ignore an outdated priority queue entry.
        if (current.cost !== distances[node]) {
            continue;
        }

        if (node === destination) {
            break;
        }

        for (const neighbor in graph[node]) {
            const key = edgeKey(node, neighbor);

            // Ignore closed pathways.
            if (blockedEnabled && BLOCKED_PATHS.includes(key)) {
                continue;
            }

            const weight = getEdgeCost(
                node,
                neighbor,
                graph[node][neighbor]
            );

            const newCost = distances[node] + weight;

            if (newCost < distances[neighbor]) {
                distances[neighbor] = newCost;
                previous[neighbor] = node;

                heap.push({
                    node: neighbor,
                    cost: newCost
                });
            }
        }
    }

    if (distances[destination] === Infinity) {
        return null;
    }

    const path = [];
    let currentNode = destination;

    while (currentNode !== null) {
        path.unshift(currentNode);
        currentNode = previous[currentNode];
    }

    return {
        path,
        cost: distances[destination],
        stops: path.length,
        connections: path.length - 1
    };
}

/* -----------------------------------------
   MAP VISUALIZATION
   ----------------------------------------- */

function clearRouteHighlights() {
    document.querySelectorAll("#warehouseSvg .route-edge")
        .forEach(edge => edge.classList.remove("route-edge"));

    document.querySelectorAll("#warehouseSvg .route-node")
        .forEach(node => node.classList.remove("route-node"));
}

function updateMapStatus() {
    document.querySelectorAll("#warehouseSvg .edge")
        .forEach(edge => {
            const key = edge.id.replace("edge-", "");

            edge.classList.remove("congested", "blocked");

            if (blockedEnabled && BLOCKED_PATHS.includes(key)) {
                edge.classList.add("blocked");
            } else if (
                congestionEnabled &&
                CONGESTED_PATHS.includes(key)
            ) {
                edge.classList.add("congested");
            }
        });
}

function highlightRoute(path) {
    clearRouteHighlights();

    path.forEach(nodeName => {
        document.getElementById(`node-${nodeName}`)
            ?.classList.add("route-node");
    });

    for (let i = 0; i < path.length - 1; i++) {
        const edge = document.getElementById(
            edgeElementId(path[i], path[i + 1])
        );

        if (edge) {
            edge.classList.add("route-edge");
        }
    }
}

/* -----------------------------------------
   ROUTE RESULT DISPLAY
   ----------------------------------------- */

function showResult(result, start, destination) {
    if (!result) {
        resultContainer.innerHTML = `
            <div class="error-message">
                <strong>
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    No route available
                </strong>
                <p>
                    No available route was found from ${start} to
                    ${destination}. Try changing the destination or
                    disabling the simulated blocked paths.
                </p>
            </div>
        `;
        return;
    }

    const routeChips = result.path.map((node, index) => `
        ${index > 0 ? '<span class="route-arrow">→</span>' : ""}
        <span class="route-chip">${node}</span>
    `).join("");

    resultContainer.innerHTML = `
        <div class="result-card">
            <h3>
                <i class="fa-solid fa-circle-check"></i>
                Optimized Route Found
            </h3>

            <div class="result-metrics">
                <div class="result-metric">
                    <small>Total Route Cost</small>
                    <strong>${result.cost} units</strong>
                </div>

                <div class="result-metric">
                    <small>Locations Visited</small>
                    <strong>${result.stops}</strong>
                </div>

                <div class="result-metric">
                    <small>Connections Used</small>
                    <strong>${result.connections}</strong>
                </div>
            </div>

            <p>
                <strong>Source:</strong> ${start}
                &nbsp;&nbsp;
                <strong>Destination:</strong> ${destination}
            </p>

            <p><strong>Route sequence</strong></p>
            <div class="route-sequence">${routeChips}</div>

            <p class="result-note">
                Calculated using Dijkstra's algorithm and a Min Heap.
                ${congestionEnabled ? "Congestion adjustment is enabled." : ""}
                ${blockedEnabled ? "Blocked pathways are excluded." : ""}
            </p>
        </div>
    `;
}

/* -----------------------------------------
   CALCULATE AND DISPLAY ROUTE
   ----------------------------------------- */

function calculateRoute(showNotification = false) {
    const start = sourceSelect.value;
    const destination = destinationSelect.value;

    if (!start || !destination) {
        notify("Please select a source and destination.");
        return;
    }

    if (start === destination) {
        clearRouteHighlights();

        document.getElementById(`node-${start}`)
            ?.classList.add("route-node");

        resultContainer.innerHTML = `
            <div class="result-card">
                <h3>
                    <i class="fa-solid fa-location-dot"></i>
                    Already at destination
                </h3>
                <p>
                    Source and destination are both ${start}.
                    No movement is required. Total cost: 0 units.
                </p>
            </div>
        `;

        if (showNotification) {
            notify("Source and destination are identical.");
        }

        return;
    }

    const result = findShortestPath(start, destination);

    if (result) {
        highlightRoute(result.path);
        showResult(result, start, destination);

        if (showNotification) {
            notify(`Route calculated: ${result.cost} cost units.`);
        }
    } else {
        clearRouteHighlights();
        showResult(null, start, destination);

        if (showNotification) {
            notify("No route available. Check blocked pathways.");
        }
    }
}

/* -----------------------------------------
   ROUTE OPTIMIZER BUTTON
   ----------------------------------------- */

document.getElementById("findRoute")
    .addEventListener("click", () => {
        calculateRoute(true);
    });

sourceSelect.addEventListener("change", () => {
    calculateRoute();
});

destinationSelect.addEventListener("change", () => {
    calculateRoute();
});

/* -----------------------------------------
   CONGESTION SIMULATION
   ----------------------------------------- */

aiMode.addEventListener("change", event => {
    congestionEnabled = event.target.checked;

    updateMapStatus();
    calculateRoute();

    notify(
        congestionEnabled
            ? "Congestion adjustment enabled."
            : "Congestion adjustment disabled."
    );

    updateRoutingMode();
});

/* -----------------------------------------
   BLOCKED-PATH SIMULATION
   ----------------------------------------- */

blockMode.addEventListener("change", event => {
    blockedEnabled = event.target.checked;

    updateMapStatus();
    calculateRoute();

    notify(
        blockedEnabled
            ? "Demo blocked pathways activated."
            : "Blocked pathways cleared."
    );

    updateRoutingMode();
});

/* -----------------------------------------
   ROUTING MODE STATISTIC
   ----------------------------------------- */

function updateRoutingMode() {
    const mode = document.getElementById("routingMode");
    const description = document.getElementById("routingModeDescription");

    if (congestionEnabled && blockedEnabled) {
        mode.textContent = "Adaptive";
        description.textContent = "Congestion + blocked paths";
    } else if (congestionEnabled) {
        mode.textContent = "AI Adjusted";
        description.textContent = "Congestion costs enabled";
    } else if (blockedEnabled) {
        mode.textContent = "Restricted";
        description.textContent = "Blocked paths excluded";
    } else {
        mode.textContent = "Standard";
        description.textContent = "Normal path costs";
    }
}

/* -----------------------------------------
   SIDEBAR NAVIGATION
   ----------------------------------------- */

document.getElementById("menuToggle")
    .addEventListener("click", () => {
        sidebar.classList.toggle("open");
    });

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(item => {
            item.classList.remove("active");
        });

        link.classList.add("active");
        sidebar.classList.remove("open");
    });
});

// Update the active navigation link as sections enter view.
if ("IntersectionObserver" in window) {
    const sections = document.querySelectorAll(
        "#overview, #optimizer, #warehouse-map, #routing-result, #features"
    );

    const observer = new IntersectionObserver(entries => {
        const visibleSections = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (!visibleSections.length) return;

        const sectionId = visibleSections[0].target.id;

        document.querySelectorAll(".nav-link").forEach(link => {
            link.classList.toggle(
                "active",
                link.getAttribute("href") === `#${sectionId}`
            );
        });
    }, {
        rootMargin: "-100px 0px -40% 0px",
        threshold: [0.1, 0.3, 0.6]
    });

    sections.forEach(section => observer.observe(section));
}

// Close the mobile sidebar when clicking outside it.
document.addEventListener("click", event => {
    const menuToggle = document.getElementById("menuToggle");

    if (
        window.innerWidth <= 760 &&
        sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
    ) {
        sidebar.classList.remove("open");
    }
});

/* -----------------------------------------
   RESET DASHBOARD
   ----------------------------------------- */

function resetDashboard() {
    sourceSelect.value = "A";
    destinationSelect.value = "M";

    aiMode.checked = false;
    blockMode.checked = false;

    congestionEnabled = false;
    blockedEnabled = false;

    clearRouteHighlights();
    updateMapStatus();
    updateRoutingMode();

    resultContainer.innerHTML = `
        <div class="empty-result">
            <span class="empty-icon">
                <i class="fa-solid fa-route"></i>
            </span>
            <p>
                Select a source and destination, then click
                <b>Find Optimized Route</b>.
            </p>
        </div>
    `;

    notify("Dashboard reset successfully.");
}

document.getElementById("resetDashboard")
    .addEventListener("click", resetDashboard);

/* -----------------------------------------
   REFRESH DASHBOARD
   ----------------------------------------- */

document.getElementById("refreshDashboard")
    .addEventListener("click", () => {
        updateMapStatus();
        updateRoutingMode();
        calculateRoute();

        notify("Dashboard refreshed.");
    });

/* -----------------------------------------
   TOAST NOTIFICATIONS
   ----------------------------------------- */

function notify(message) {
    if (!toastElement) return;

    toastElement.textContent = message;
    toastElement.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toastElement.classList.remove("show");
    }, 2600);
}

/* -----------------------------------------
   INITIALIZE DASHBOARD
   ----------------------------------------- */

function initializeDashboard() {
    document.getElementById("locationCount").textContent =
        Object.keys(graph).length;

    const edgeCount = Object.values(graph)
        .reduce((total, neighbors) => {
            return total + Object.keys(neighbors).length;
        }, 0) / 2;

    document.getElementById("connectionCount").textContent = edgeCount;

    updateMapStatus();
    updateRoutingMode();
    calculateRoute();
}

initializeDashboard();