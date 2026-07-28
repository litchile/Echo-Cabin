var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/auth.ts
var DEVELOPMENT_USERS = /* @__PURE__ */ new Set(["dev-a", "dev-b", "dev-c", "dev-d"]);
var SESSION_LIFETIME_MS = 5 * 60 * 1e3;
var textEncoder = new TextEncoder();
var toBase64Url = /* @__PURE__ */ __name((bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}, "toBase64Url");
var fromBase64Url = /* @__PURE__ */ __name((value) => {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}, "fromBase64Url");
var importSigningKey = /* @__PURE__ */ __name((secret) => crypto.subtle.importKey(
  "raw",
  textEncoder.encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
), "importSigningKey");
var isDevelopmentUser = /* @__PURE__ */ __name((value) => typeof value === "string" && DEVELOPMENT_USERS.has(value), "isDevelopmentUser");
var createDevelopmentSession = /* @__PURE__ */ __name(async (userId, secret, nowMs = Date.now()) => {
  if (!isDevelopmentUser(userId)) throw new Error("Invalid development user");
  const payload = {
    userId,
    expiresAtMs: nowMs + SESSION_LIFETIME_MS,
    nonce: crypto.randomUUID()
  };
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload));
  return {
    token: `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`,
    expiresAtMs: payload.expiresAtMs
  };
}, "createDevelopmentSession");
var verifyDevelopmentSession = /* @__PURE__ */ __name(async (token, secret, nowMs = Date.now()) => {
  if (!token || !secret) return null;
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra !== void 0) return null;
  const signature = fromBase64Url(encodedSignature);
  const payloadBytes = fromBase64Url(encodedPayload);
  if (!signature || !payloadBytes) return null;
  const key = await importSigningKey(secret);
  const signatureBuffer = signature.slice().buffer;
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBuffer,
    textEncoder.encode(encodedPayload)
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!isDevelopmentUser(payload.userId)) return null;
    const expiresAtMs = payload.expiresAtMs;
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs === void 0 || expiresAtMs <= nowMs) {
      return null;
    }
    if (typeof payload.nonce !== "string" || payload.nonce.length < 1) return null;
    return payload.userId;
  } catch {
    return null;
  }
}, "verifyDevelopmentSession");

// src/sphereMath.ts
var EPSILON = 1e-8;
var clamp = /* @__PURE__ */ __name((value, min, max) => Math.min(max, Math.max(min, value)), "clamp");
var isFiniteDirection = /* @__PURE__ */ __name((value) => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  return [candidate.x, candidate.y, candidate.z].every(Number.isFinite);
}, "isFiniteDirection");
var normalizeDirection = /* @__PURE__ */ __name((direction) => {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(magnitude) || magnitude < EPSILON) return null;
  return {
    x: direction.x / magnitude,
    y: direction.y / magnitude,
    z: direction.z / magnitude
  };
}, "normalizeDirection");
var angleBetweenDirections = /* @__PURE__ */ __name((first, second) => {
  const a = normalizeDirection(first);
  const b = normalizeDirection(second);
  if (!a || !b) return Number.NaN;
  return Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1));
}, "angleBetweenDirections");
var rotateDirectionToward = /* @__PURE__ */ __name((current, target, maxAngleRadians) => {
  const from = normalizeDirection(current);
  const to = normalizeDirection(target);
  if (!from || !to) throw new Error("A surface direction cannot be zero");
  const angle = angleBetweenDirections(from, to);
  if (angle <= maxAngleRadians || angle < EPSILON) return to;
  const ratio = clamp(maxAngleRadians / angle, 0, 1);
  const sinAngle = Math.sin(angle);
  if (Math.abs(sinAngle) < 1e-6) {
    const blended = normalizeDirection({
      x: from.x * (1 - ratio) + to.x * ratio,
      y: from.y * (1 - ratio) + to.y * ratio,
      z: from.z * (1 - ratio) + to.z * ratio
    });
    return blended ?? to;
  }
  const fromWeight = Math.sin((1 - ratio) * angle) / sinAngle;
  const toWeight = Math.sin(ratio * angle) / sinAngle;
  return normalizeDirection({
    x: from.x * fromWeight + to.x * toWeight,
    y: from.y * fromWeight + to.y * toWeight,
    z: from.z * fromWeight + to.z * toWeight
  }) ?? to;
}, "rotateDirectionToward");

// src/roomEngine.ts
var DEFAULT_STARTS = [
  { x: 0, y: 1, z: 0 },
  { x: 0.1, y: 0.99, z: 0 },
  { x: -0.1, y: 0.99, z: 0 },
  { x: 0, y: 0.99, z: 0.1 }
];
var RoomEngine = class {
  constructor(options) {
    this.options = options;
  }
  options;
  static {
    __name(this, "RoomEngine");
  }
  players = /* @__PURE__ */ new Map();
  encounters = /* @__PURE__ */ new Map();
  responses = /* @__PURE__ */ new Map();
  relationships = /* @__PURE__ */ new Map();
  lastKnownDirections = /* @__PURE__ */ new Map();
  snapshotSequence = 0;
  connect(userId, connectionId, nowMs = Date.now()) {
    const existing = this.players.get(userId);
    if (existing) {
      existing.connectionId = connectionId;
      existing.targetDirection = null;
      existing.lastActiveAtMs = nowMs;
      return this.toSnapshot(existing);
    }
    const start = this.lastKnownDirections.get(userId) ?? normalizeDirection(
      DEFAULT_STARTS[this.players.size % DEFAULT_STARTS.length]
    ) ?? { x: 0, y: 1, z: 0 };
    const player = {
      userId,
      connectionId,
      direction: start,
      targetDirection: null,
      lastClientSequence: -1,
      lastActiveAtMs: nowMs
    };
    this.players.set(userId, player);
    return this.toSnapshot(player);
  }
  disconnect(userId, connectionId) {
    const player = this.players.get(userId);
    if (!player || player.connectionId !== connectionId) return false;
    this.lastKnownDirections.set(userId, player.direction);
    this.players.delete(userId);
    for (const [pairKey, encounter] of this.encounters) {
      if (encounter.userIds.includes(userId)) this.encounters.delete(pairKey);
    }
    return true;
  }
  exportPersistentState() {
    const directions = new Map(this.lastKnownDirections);
    for (const player of this.players.values()) {
      directions.set(player.userId, player.direction);
    }
    return {
      version: 2,
      playerDirections: Object.fromEntries(directions),
      responses: [...this.responses.values()],
      relationships: [...this.relationships.values()]
    };
  }
  restorePersistentState(value) {
    if (typeof value !== "object" || value === null) return;
    const state = value;
    if (state.version !== 1 && state.version !== 2 || typeof state.playerDirections !== "object" || state.playerDirections === null) return;
    for (const [userId, rawDirection] of Object.entries(state.playerDirections)) {
      if (!isFiniteDirection(rawDirection)) continue;
      const direction = normalizeDirection(rawDirection);
      if (direction) this.lastKnownDirections.set(userId, direction);
    }
    if (state.version === 2 && Array.isArray(state.responses)) {
      for (const response of state.responses) {
        if (!response || typeof response.responseId !== "string") continue;
        this.responses.set(response.responseId, response);
      }
    }
    if (state.version === 2 && Array.isArray(state.relationships)) {
      for (const relationship of state.relationships) {
        if (!relationship || !Array.isArray(relationship.userIds)) continue;
        this.relationships.set(relationship.userIds.join(":"), relationship);
      }
    }
  }
  setMoveTarget(userId, connectionId, clientSequence, rawTarget, nowMs = Date.now()) {
    const player = this.players.get(userId);
    if (!player || player.connectionId !== connectionId) return "stale_connection";
    if (!Number.isSafeInteger(clientSequence) || clientSequence <= player.lastClientSequence) {
      return "stale_sequence";
    }
    if (!isFiniteDirection(rawTarget)) return "invalid_direction";
    const target = normalizeDirection(rawTarget);
    if (!target) return "invalid_direction";
    player.lastClientSequence = clientSequence;
    player.targetDirection = target;
    player.lastActiveAtMs = nowMs;
    return null;
  }
  cancelMove(userId, connectionId, clientSequence, nowMs = Date.now()) {
    const player = this.players.get(userId);
    if (!player || player.connectionId !== connectionId) return "stale_connection";
    if (!Number.isSafeInteger(clientSequence) || clientSequence <= player.lastClientSequence) {
      return "stale_sequence";
    }
    player.lastClientSequence = clientSequence;
    player.targetDirection = null;
    player.lastActiveAtMs = nowMs;
    return null;
  }
  markActivity(userId, connectionId, nowMs = Date.now()) {
    const player = this.players.get(userId);
    if (!player || player.connectionId !== connectionId) return false;
    player.lastActiveAtMs = nowMs;
    return true;
  }
  createResponse(userId, encounterId, idempotencyKey) {
    if (!idempotencyKey) return { reason: "missing_idempotency_key" };
    const encounter = [...this.encounters.values()].find((value) => value.encounterId === encounterId);
    if (!encounter || encounter.status !== "qualified") return { reason: "encounter_not_qualified" };
    if (!encounter.userIds.includes(userId)) return { reason: "not_encounter_member" };
    const existing = [...this.responses.values()].find((response2) => response2.encounterId === encounterId);
    if (existing) return { response: existing };
    const toUserId = encounter.userIds.find((value) => value !== userId);
    if (!toUserId) return { reason: "invalid_encounter" };
    const response = {
      responseId: `response:${encounterId}`,
      encounterId,
      fromUserId: userId,
      toUserId,
      status: "pending",
      resonanceAdded: false,
      createIdempotencyKey: idempotencyKey,
      acceptIdempotencyKey: null
    };
    this.responses.set(response.responseId, response);
    return { response };
  }
  acceptResponse(userId, responseId, idempotencyKey, nowMs = Date.now()) {
    if (!idempotencyKey) return { reason: "missing_idempotency_key" };
    const response = this.responses.get(responseId);
    if (!response) return { reason: "response_not_found" };
    if (response.toUserId !== userId) return { reason: "not_response_recipient" };
    const userIds = [response.fromUserId, response.toUserId].sort();
    const pairKey = userIds.join(":");
    const relationship = this.relationships.get(pairKey) ?? {
      userIds,
      resonance: 0,
      lastResonanceAtMs: null
    };
    if (response.status === "accepted") return { response, relationship };
    response.status = "accepted";
    response.acceptIdempotencyKey = idempotencyKey;
    const dailyLimitPassed = relationship.lastResonanceAtMs === null || nowMs - relationship.lastResonanceAtMs >= 24 * 60 * 60 * 1e3;
    if (dailyLimitPassed) {
      relationship.resonance += 1;
      relationship.lastResonanceAtMs = nowMs;
      response.resonanceAdded = true;
    }
    this.relationships.set(pairKey, relationship);
    return { response, relationship };
  }
  tick(deltaSeconds, nowMs = Date.now()) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const maxAngle = this.options.movementSpeed * deltaSeconds / this.options.sphereRadius;
    const arrivalAngle = this.options.arrivalDistance / this.options.sphereRadius;
    for (const player of this.players.values()) {
      if (!player.targetDirection) continue;
      const remaining = angleBetweenDirections(player.direction, player.targetDirection);
      if (remaining <= arrivalAngle || remaining <= maxAngle) {
        player.direction = player.targetDirection;
        player.targetDirection = null;
        continue;
      }
      player.direction = rotateDirectionToward(
        player.direction,
        player.targetDirection,
        maxAngle
      );
    }
    this.updateEncounters(deltaSeconds * 1e3, nowMs);
  }
  createSnapshot(serverTimeMs, viewerUserId) {
    this.snapshotSequence += 1;
    return {
      type: "room.snapshot",
      serverTimeMs,
      sequence: this.snapshotSequence,
      players: [...this.players.values()].map((player) => this.toSnapshot(player)),
      encounters: [...this.encounters.values()].map((encounter) => ({
        encounterId: encounter.encounterId,
        userIds: encounter.userIds,
        status: encounter.status
      })),
      responses: [...this.responses.values()].filter((response) => !viewerUserId || response.fromUserId === viewerUserId || response.toUserId === viewerUserId).map(({ createIdempotencyKey: _createKey, acceptIdempotencyKey: _acceptKey, ...response }) => response),
      relationships: [...this.relationships.values()].filter((relationship) => !viewerUserId || relationship.userIds.includes(viewerUserId)).map(({ lastResonanceAtMs: _lastResonanceAtMs, ...relationship }) => relationship)
    };
  }
  updateEncounters(deltaMs, nowMs) {
    const players = [...this.players.values()];
    const encounterDistance = this.options.encounterDistance ?? 2.2;
    const dwellMs = this.options.encounterDwellMs ?? 2e4;
    const leaveGraceMs = this.options.encounterLeaveGraceMs ?? 3e3;
    const recentActivityMs = this.options.recentActivityMs ?? 6e4;
    const activePairKeys = /* @__PURE__ */ new Set();
    for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < players.length; secondIndex += 1) {
        const first = players[firstIndex];
        const second = players[secondIndex];
        const userIds = [first.userId, second.userId].sort();
        const pairKey = userIds.join(":");
        activePairKeys.add(pairKey);
        const distance = angleBetweenDirections(first.direction, second.direction) * this.options.sphereRadius;
        const existing = this.encounters.get(pairKey);
        if (distance <= encounterDistance) {
          const encounter = existing ?? {
            encounterId: `${pairKey}:${Math.floor(nowMs)}`,
            userIds,
            status: "candidate",
            accumulatedMs: 0,
            outsideSinceMs: null
          };
          encounter.outsideSinceMs = null;
          const recentlyActive = nowMs - first.lastActiveAtMs <= recentActivityMs && nowMs - second.lastActiveAtMs <= recentActivityMs;
          if (recentlyActive && encounter.status === "candidate") {
            encounter.accumulatedMs += deltaMs;
            if (encounter.accumulatedMs >= dwellMs) encounter.status = "qualified";
          }
          this.encounters.set(pairKey, encounter);
          continue;
        }
        if (!existing) continue;
        existing.outsideSinceMs ??= nowMs;
        if (nowMs - existing.outsideSinceMs > leaveGraceMs) {
          this.encounters.delete(pairKey);
          for (const [responseId, response] of this.responses) {
            if (response.encounterId === existing.encounterId && response.status === "pending") {
              this.responses.delete(responseId);
            }
          }
        }
      }
    }
    for (const pairKey of this.encounters.keys()) {
      if (!activePairKeys.has(pairKey)) this.encounters.delete(pairKey);
    }
  }
  toSnapshot(player) {
    return {
      userId: player.userId,
      direction: player.direction,
      moving: player.targetDirection !== null,
      lastProcessedClientSequence: player.lastClientSequence
    };
  }
};

// src/planetRoom.ts
var TICK_MS = 50;
var SNAPSHOT_MS = 100;
var PERSIST_MS = 1e3;
var ROOM_STATE_KEY = "room-state-v1";
var PlanetRoom = class {
  constructor(state) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get(ROOM_STATE_KEY);
      this.engine.restorePersistentState(saved);
    });
  }
  state;
  static {
    __name(this, "PlanetRoom");
  }
  engine = new RoomEngine({
    sphereRadius: 10,
    movementSpeed: 2.4,
    arrivalDistance: 0.08
  });
  tickTimer = null;
  lastTickMs = Date.now();
  lastSnapshotMs = 0;
  lastPersistMs = 0;
  async fetch(request) {
    const userId = request.headers.get("X-Echo-Verified-User");
    if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return this.handleHttpWrite(request, userId);
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connectionId = crypto.randomUUID();
    const attachment = { userId, connectionId };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server, [userId]);
    this.engine.connect(userId, connectionId, Date.now());
    this.send(server, { type: "room.joined", userId });
    this.broadcast({ type: "player.joined", userId }, server);
    this.broadcastSnapshot();
    this.persistSoon();
    this.ensureTicking();
    return new Response(null, { status: 101, webSocket: client });
  }
  async handleHttpWrite(request, userId) {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }
    const url = new URL(request.url);
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? "";
    const createMatch = url.pathname.match(/\/encounters\/([^/]+)\/responses$/);
    if (createMatch) {
      const result = this.engine.createResponse(
        userId,
        decodeURIComponent(createMatch[1]),
        idempotencyKey
      );
      if ("reason" in result) return this.domainError(result.reason);
      this.persistSoon();
      this.broadcastSnapshot();
      return Response.json({
        response: {
          responseId: result.response.responseId,
          encounterId: result.response.encounterId,
          fromUserId: result.response.fromUserId,
          toUserId: result.response.toUserId,
          status: result.response.status,
          resonanceAdded: result.response.resonanceAdded
        }
      });
    }
    const acceptMatch = url.pathname.match(/\/responses\/([^/]+)\/accept$/);
    if (acceptMatch) {
      const result = this.engine.acceptResponse(
        userId,
        decodeURIComponent(acceptMatch[1]),
        idempotencyKey,
        Date.now()
      );
      if ("reason" in result) return this.domainError(result.reason);
      this.persistSoon();
      this.broadcastSnapshot();
      return Response.json({
        response: {
          responseId: result.response.responseId,
          encounterId: result.response.encounterId,
          fromUserId: result.response.fromUserId,
          toUserId: result.response.toUserId,
          status: result.response.status,
          resonanceAdded: result.response.resonanceAdded
        },
        relationship: {
          userIds: result.relationship.userIds,
          resonance: result.relationship.resonance
        }
      });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  domainError(reason) {
    const status = reason === "not_response_recipient" || reason === "not_encounter_member" ? 403 : reason.endsWith("_not_found") ? 404 : 409;
    return Response.json({ error: reason }, { status });
  }
  webSocketMessage(socket, message) {
    const attachment = socket.deserializeAttachment();
    if (!attachment || typeof message !== "string") return;
    let command;
    try {
      command = JSON.parse(message);
    } catch {
      this.reject(socket, "unknown", "invalid_json");
      return;
    }
    switch (command.type) {
      case "move.target": {
        const reason = this.engine.setMoveTarget(
          attachment.userId,
          attachment.connectionId,
          command.clientSequence,
          command.targetDirection,
          Date.now()
        );
        if (reason) this.reject(socket, command.type, reason);
        break;
      }
      case "move.cancel": {
        const reason = this.engine.cancelMove(
          attachment.userId,
          attachment.connectionId,
          command.clientSequence,
          Date.now()
        );
        if (reason) this.reject(socket, command.type, reason);
        break;
      }
      case "presence.ping":
        this.engine.markActivity(attachment.userId, attachment.connectionId, Date.now());
        break;
      default:
        this.reject(socket, "unknown", "unknown_command");
    }
  }
  webSocketClose(socket) {
    this.removeSocket(socket);
  }
  webSocketError(socket) {
    this.removeSocket(socket);
  }
  removeSocket(socket) {
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;
    if (this.engine.disconnect(attachment.userId, attachment.connectionId)) {
      this.broadcast({ type: "player.left", userId: attachment.userId }, socket);
      this.broadcastSnapshot();
      this.persistSoon();
    }
  }
  ensureTicking() {
    if (this.tickTimer !== null) return;
    this.lastTickMs = Date.now();
    const tick = /* @__PURE__ */ __name(() => {
      const now = Date.now();
      const deltaSeconds = Math.min((now - this.lastTickMs) / 1e3, 0.25);
      this.lastTickMs = now;
      this.engine.tick(deltaSeconds, now);
      if (now - this.lastSnapshotMs >= SNAPSHOT_MS) {
        this.lastSnapshotMs = now;
        this.broadcastSnapshot();
      }
      if (now - this.lastPersistMs >= PERSIST_MS) {
        this.lastPersistMs = now;
        this.persistSoon();
      }
      if (this.state.getWebSockets().length === 0) {
        this.tickTimer = null;
        return;
      }
      this.tickTimer = setTimeout(tick, TICK_MS);
    }, "tick");
    this.tickTimer = setTimeout(tick, TICK_MS);
  }
  broadcastSnapshot() {
    const now = Date.now();
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment) this.send(socket, this.engine.createSnapshot(now, attachment.userId));
    }
  }
  broadcast(message, except) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket !== except) socket.send(payload);
    }
  }
  send(socket, message) {
    socket.send(JSON.stringify(message));
  }
  reject(socket, commandType, reason) {
    this.send(socket, { type: "command.rejected", commandType, reason });
  }
  persistSoon() {
    this.state.waitUntil(
      this.state.storage.put(ROOM_STATE_KEY, this.engine.exportPersistentState())
    );
  }
};

// src/index.ts
var PLANET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
var LOCAL_ORIGINS = /* @__PURE__ */ new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);
var developmentCorsHeaders = /* @__PURE__ */ __name((request, env) => {
  const headers = new Headers();
  if (env.ENVIRONMENT === "production") return headers;
  const origin = request.headers.get("Origin");
  if (origin && LOCAL_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
    headers.set("Vary", "Origin");
  }
  return headers;
}, "developmentCorsHeaders");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && (url.pathname === "/v1/dev/sessions" || url.pathname.startsWith("/v1/planets/"))) {
      return new Response(null, {
        status: 204,
        headers: developmentCorsHeaders(request, env)
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "echo-cabin-multiplayer-backend" });
    }
    if (request.method === "POST" && url.pathname === "/v1/dev/sessions") {
      if (env.ENVIRONMENT === "production") {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "invalid_json" }, { status: 400 });
      }
      if (!isDevelopmentUser(body.userId)) {
        return Response.json({ error: "invalid_development_user" }, { status: 400 });
      }
      const session = await createDevelopmentSession(
        body.userId,
        env.DEV_SESSION_SECRET
      );
      return Response.json(
        { userId: body.userId, ...session },
        { headers: developmentCorsHeaders(request, env) }
      );
    }
    const connectMatch = url.pathname.match(/^\/v1\/planets\/([^/]+)\/connect$/);
    const createResponseMatch = url.pathname.match(
      /^\/v1\/planets\/([^/]+)\/encounters\/[^/]+\/responses$/
    );
    const acceptResponseMatch = url.pathname.match(
      /^\/v1\/planets\/([^/]+)\/responses\/[^/]+\/accept$/
    );
    const writeMatch = createResponseMatch ?? acceptResponseMatch;
    const match = connectMatch ?? writeMatch;
    const validMethod = connectMatch ? request.method === "GET" : request.method === "POST";
    if (!match || !validMethod) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    const planetId = match[1];
    if (!PLANET_ID_PATTERN.test(planetId)) {
      return Response.json({ error: "invalid_planet_id" }, { status: 400 });
    }
    if (env.ENVIRONMENT === "production") {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const authorization = request.headers.get("Authorization");
    const sessionToken = connectMatch ? url.searchParams.get("session") : authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const userId = await verifyDevelopmentSession(
      sessionToken,
      env.DEV_SESSION_SECRET
    );
    if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
    const headers = new Headers(request.headers);
    headers.set("X-Echo-Verified-User", userId);
    const room = env.PLANET_ROOMS.get(env.PLANET_ROOMS.idFromName(planetId));
    const response = await room.fetch(new Request(request, { headers }));
    if (connectMatch) return response;
    const responseHeaders = new Headers(response.headers);
    developmentCorsHeaders(request, env).forEach((value, key) => {
      responseHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-SXpHIG/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-SXpHIG/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  PlanetRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
