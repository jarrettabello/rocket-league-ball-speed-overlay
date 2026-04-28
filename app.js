const state = {
  socket: null,
  reconnectTimer: null,
  staleTimer: null,
  reconnectDelayMs: 1200,
  unit: "kph",
  latestRawSpeed: null,
  peakRawSpeed: 0,
  lastMessageAt: 0,
  samples: [],
};

const elements = {
  connectionStatus: document.querySelector("#connectionStatus"),
  connectionText: document.querySelector("#connectionText"),
  speedValue: document.querySelector("#speedValue"),
  speedUnit: document.querySelector("#speedUnit"),
  rawSpeed: document.querySelector("#rawSpeed"),
  peakSpeed: document.querySelector("#peakSpeed"),
  lastEvent: document.querySelector("#lastEvent"),
  socketUrl: document.querySelector("#socketUrl"),
  connectButton: document.querySelector("#connectButton"),
  resetButton: document.querySelector("#resetButton"),
  chart: document.querySelector("#speedChart"),
};

const chartContext = elements.chart.getContext("2d");
const maxSamples = 180;

if (window.location.protocol === "http:" || window.location.protocol === "https:") {
  elements.socketUrl.value = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/rl`;
}

function kphToMph(speed) {
  return speed * 0.621371;
}

function convertSpeed(speed, unit = state.unit) {
  if (speed === null || Number.isNaN(speed)) {
    return null;
  }

  if (unit === "mph") {
    return kphToMph(speed);
  }

  if (unit === "api") {
    return speed;
  }

  return speed;
}

function formatSpeed(speed, unit = state.unit) {
  const converted = convertSpeed(speed, unit);

  if (converted === null) {
    return "--";
  }

  return converted.toFixed(2);
}

function unitLabel(unit = state.unit) {
  return unit === "api" ? "API" : unit;
}

function setStatus(status, text) {
  elements.connectionStatus.dataset.status = status;
  elements.connectionText.textContent = text;
}

function updateReadout() {
  elements.speedValue.textContent = formatSpeed(state.latestRawSpeed);
  elements.speedUnit.textContent = unitLabel();
  elements.rawSpeed.textContent =
    state.latestRawSpeed === null ? "--" : `${state.latestRawSpeed.toFixed(2)}`;
  elements.peakSpeed.textContent =
    state.peakRawSpeed > 0 ? `${formatSpeed(state.peakRawSpeed)} ${unitLabel()}` : `-- ${unitLabel()}`;
}

function noteSample(rawSpeed) {
  state.latestRawSpeed = rawSpeed;
  state.peakRawSpeed = Math.max(state.peakRawSpeed, rawSpeed);
  state.lastMessageAt = Date.now();
  state.samples.push({ speed: rawSpeed, at: state.lastMessageAt });

  if (state.samples.length > maxSamples) {
    state.samples.shift();
  }

  updateReadout();
  drawChart();
}

function readSpeedFromMessage(message) {
  if (message.Event === "BridgeStatus") {
    elements.lastEvent.textContent = message.Data?.Status || "Bridge";
    return null;
  }

  if (message.Event === "UpdateState") {
    return message.Data?.Game?.Ball?.Speed;
  }

  if (message.Event === "BallHit") {
    return message.Data?.Ball?.PostHitSpeed;
  }

  if (message.Event === "CrossbarHit") {
    return message.Data?.BallSpeed;
  }

  if (message.Event === "GoalScored") {
    return message.Data?.GoalSpeed;
  }

  return null;
}

function handleSocketMessage(event) {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (typeof message.Data === "string") {
    try {
      message = { ...message, Data: JSON.parse(message.Data) };
    } catch {
      return;
    }
  }

  const speed = Number(readSpeedFromMessage(message));

  if (!Number.isFinite(speed)) {
    if (message.Event === "BridgeStatus") {
      const bridgeStatus = message.Data?.Status || "Bridge";
      setStatus(
        bridgeStatus === "RocketLeagueConnected" ? "live" : "stale",
        bridgeStatus === "RocketLeagueConnected" ? "Bridge Live" : "Waiting RL",
      );
    }

    return;
  }

  elements.lastEvent.textContent = message.Event || "Update";
  noteSample(speed);
  setStatus("live", "Live");
}

function connect() {
  disconnect();
  setStatus("connecting", "Connecting");

  let socket;

  try {
    socket = new WebSocket(elements.socketUrl.value.trim());
  } catch {
    setStatus("error", "Bad Socket URL");
    return;
  }

  state.socket = socket;

  socket.addEventListener("open", () => {
    setStatus("live", "Connected");
  });

  socket.addEventListener("message", handleSocketMessage);

  socket.addEventListener("close", () => {
    if (state.socket !== socket) {
      return;
    }

    setStatus("error", "Reconnecting");
    state.reconnectTimer = window.setTimeout(connect, state.reconnectDelayMs);
  });

  socket.addEventListener("error", () => {
    setStatus("error", "Socket Error");
  });
}

function disconnect(clearReconnect = true) {
  if (clearReconnect && state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
  }

  if (state.socket) {
    const socket = state.socket;
    state.socket = null;
    socket.close();
  }
}

function resizeChartForDisplay() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(elements.chart.clientWidth * ratio);
  const height = Math.floor(elements.chart.clientHeight * ratio);

  if (elements.chart.width !== width || elements.chart.height !== height) {
    elements.chart.width = width;
    elements.chart.height = height;
  }

  chartContext.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawChart() {
  resizeChartForDisplay();

  const width = elements.chart.clientWidth;
  const height = elements.chart.clientHeight;
  chartContext.clearRect(0, 0, width, height);

  chartContext.strokeStyle = "rgba(247, 247, 242, 0.08)";
  chartContext.lineWidth = 1;

  for (let index = 1; index < 4; index += 1) {
    const y = (height / 4) * index;
    chartContext.beginPath();
    chartContext.moveTo(0, y);
    chartContext.lineTo(width, y);
    chartContext.stroke();
  }

  if (state.samples.length < 2) {
    chartContext.fillStyle = "rgba(170, 177, 189, 0.78)";
    chartContext.font = "14px Inter, system-ui, sans-serif";
    chartContext.fillText("Waiting for Rocket League data...", 18, 34);
    return;
  }

  const visible = state.samples.slice(-maxSamples);
  const highest = Math.max(1000, ...visible.map((sample) => sample.speed), state.peakRawSpeed);

  chartContext.beginPath();
  visible.forEach((sample, index) => {
    const x = (index / (visible.length - 1)) * width;
    const y = height - (sample.speed / highest) * (height - 18) - 9;

    if (index === 0) {
      chartContext.moveTo(x, y);
    } else {
      chartContext.lineTo(x, y);
    }
  });

  chartContext.strokeStyle = "#28a7ff";
  chartContext.lineWidth = 3;
  chartContext.lineJoin = "round";
  chartContext.lineCap = "round";
  chartContext.stroke();
}

function checkStaleData() {
  const hasSocket = state.socket && state.socket.readyState === WebSocket.OPEN;
  const hasRecentData = Date.now() - state.lastMessageAt < 2200;

  if (hasSocket && state.lastMessageAt && !hasRecentData) {
    setStatus("stale", "No Data");
  }
}

document.querySelectorAll('input[name="unit"]').forEach((input) => {
  input.addEventListener("change", (event) => {
    state.unit = event.target.value;
    updateReadout();
  });
});

elements.connectButton.addEventListener("click", connect);
elements.resetButton.addEventListener("click", () => {
  state.peakRawSpeed = Math.max(0, state.latestRawSpeed || 0);
  updateReadout();
});

window.addEventListener("resize", drawChart);

state.staleTimer = window.setInterval(checkStaleData, 500);
drawChart();
