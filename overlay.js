const params = new URLSearchParams(window.location.search);
const state = {
  socket: null,
  reconnectTimer: null,
  unit: params.get("unit") || "kph",
  latestSpeed: null,
  peakSpeed: 0,
  reconnectDelayMs: 1200,
};

const elements = {
  overlay: document.querySelector("#overlay"),
  statusDot: document.querySelector("#statusDot"),
  labelText: document.querySelector("#labelText"),
  speedValue: document.querySelector("#speedValue"),
  speedUnit: document.querySelector("#speedUnit"),
  peakRow: document.querySelector("#peakRow"),
  peakValue: document.querySelector("#peakValue"),
};

const theme = params.get("theme") || "panel";
const showPeak = ["1", "true", "yes"].includes((params.get("peak") || "").toLowerCase());
const label = params.get("label");

elements.overlay.dataset.theme = theme;
elements.peakRow.hidden = !showPeak;

if (label) {
  elements.labelText.textContent = label;
}

function socketUrl() {
  const explicitSocket = params.get("socket");

  if (explicitSocket) {
    return explicitSocket;
  }

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/rl`;
  }

  return "ws://127.0.0.1:5173/rl";
}

function kphToMph(speed) {
  return speed * 0.621371;
}

function convertSpeed(speed, unit = state.unit) {
  if (!Number.isFinite(speed)) {
    return null;
  }

  if (unit === "mph") {
    return kphToMph(speed);
  }

  return speed;
}

function unitLabel(unit = state.unit) {
  return unit === "mph" ? "MPH" : unit === "api" ? "API" : "KPH";
}

function formatSpeed(speed, unit = state.unit) {
  const converted = convertSpeed(speed, unit);
  return converted === null ? "--.--" : converted.toFixed(2);
}

function setLive(isLive) {
  elements.statusDot.dataset.status = isLive ? "live" : "waiting";
}

function updateReadout() {
  elements.speedValue.textContent = formatSpeed(state.latestSpeed);
  elements.speedUnit.textContent = unitLabel();
  elements.peakValue.textContent = `${formatSpeed(state.peakSpeed)} ${unitLabel()}`;
}

function readSpeedFromMessage(message) {
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

function handleMessage(event) {
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
    return;
  }

  state.latestSpeed = speed;
  state.peakSpeed = Math.max(state.peakSpeed, speed);
  setLive(true);
  updateReadout();
}

function connect() {
  if (state.socket) {
    state.socket.close();
  }

  let socket;

  try {
    socket = new WebSocket(socketUrl());
  } catch {
    setLive(false);
    state.reconnectTimer = window.setTimeout(connect, state.reconnectDelayMs);
    return;
  }

  state.socket = socket;

  socket.addEventListener("open", () => setLive(true));
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", () => {
    if (state.socket !== socket) {
      return;
    }

    setLive(false);
    state.reconnectTimer = window.setTimeout(connect, state.reconnectDelayMs);
  });
  socket.addEventListener("error", () => setLive(false));
}

updateReadout();
connect();
