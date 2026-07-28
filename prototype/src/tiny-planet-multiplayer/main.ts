import '../tiny-planet-prototype/styles.css'
import './styles.css'
import { tinyPlanetConfig } from '../tiny-planet-prototype/config'
import { createTinyPlanetStage } from '../tiny-planet-prototype/stage'
import {
  createSphereMixer,
  type SphereAudioState,
  type SphereMixer,
} from '../tiny-planet-prototype/sphereMixer'
import { createPresetSoundBank } from '../spatial-prototype/presetSoundBank'
import {
  PlanetRoomClient,
  type NetworkEncounterSnapshot,
  type NetworkPlayerSnapshot,
  type NetworkRelationshipSnapshot,
  type NetworkResponseSnapshot,
  type NetworkStatus,
  type RoomSnapshot,
} from './networkClient'
import { decideMovementReconciliation } from './movementReconciliation'
import {
  createNetworkSourceDirections,
  userIdForVoice,
} from './voiceBindings'
import { createVirtualJoystick, type VirtualJoystick } from './virtualJoystick'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('找不到多人球形声音世界挂载节点。')

const parameters = new URLSearchParams(window.location.search)
const allowedUsers = ['dev-a', 'dev-b', 'dev-c', 'dev-d'] as const
type DevelopmentUser = typeof allowedUsers[number]
const requestedUser = parameters.get('user')
const userId: DevelopmentUser = allowedUsers.includes(requestedUser as DevelopmentUser)
  ? requestedUser as DevelopmentUser
  : 'dev-a'
const backendOrigin = parameters.get('backend') ?? 'http://127.0.0.1:8787'
const debugEnabled = parameters.get('debug') === '1'
const requestedInputMode = parameters.get('input')
const inputMode = requestedInputMode === 'wasd' || requestedInputMode === 'joystick'
  ? requestedInputMode
  : 'click'
const movementHint = inputMode === 'wasd'
  ? 'WASD 连续移动 · 按住鼠标拖动镜头 · 单击地面不移动'
  : inputMode === 'joystick'
    ? '左侧摇杆移动 · 拖动场景转动镜头'
    : '点击可见球面移动 · WASD 在本模式下无效'

root.innerHTML = `
  <main class="planet-shell">
    <div class="planet-canvas" data-planet-canvas></div>
    <aside class="prototype-label" aria-label="Prototype 说明">
      <strong>小型球形声音世界 · 多人技术验证</strong>
      <span>在线玩家的位置直接决定彼此声音的远近</span>
    </aside>
    <aside class="multiplayer-panel" aria-label="多人开发状态">
      <label>
        <span>本标签页身份</span>
        <select data-user>
          ${allowedUsers.map((value) => `
            <option value="${value}" ${value === userId ? 'selected' : ''}>${value}${value === 'dev-d' ? '（观察者）' : '（有声音）'}</option>
          `).join('')}
        </select>
      </label>
      <label class="input-mode-label">
        <span>操作对照</span>
        <select data-input-mode>
          <option value="click" ${inputMode === 'click' ? 'selected' : ''}>点击移动</option>
          <option value="wasd" ${inputMode === 'wasd' ? 'selected' : ''}>WASD</option>
          <option value="joystick" ${inputMode === 'joystick' ? 'selected' : ''}>手机摇杆</option>
        </select>
      </label>
      <div class="connection-state" data-network-state data-status="connecting">
        <span class="connection-dot"></span>
        <span data-network-copy>正在连接星球…</span>
      </div>
      <span class="network-detail" data-network-detail>星球：dev-planet</span>
    </aside>
    <div class="movement-hint">${movementHint}</div>
    <div class="encounter-notice" data-encounter-notice hidden>
      <span>共同停留</span>
      <strong data-encounter-title></strong>
      <p data-encounter-copy></p>
      <div class="encounter-actions">
        <button type="button" data-encounter-send hidden>发出回应</button>
        <button type="button" data-encounter-accept hidden>接受回应</button>
        <button type="button" data-encounter-dismiss hidden>稍后</button>
      </div>
      <p class="encounter-error" data-encounter-error hidden></p>
    </div>
    ${inputMode === 'joystick' ? `
      <div class="virtual-joystick" data-joystick data-active="false" aria-label="移动摇杆">
        <div class="virtual-joystick__ring"></div>
        <div class="virtual-joystick__knob" data-joystick-knob></div>
      </div>
    ` : ''}
    ${debugEnabled ? `
      <aside class="debug-panel" data-debug-panel>
        <h2>多人快照</h2>
        <div class="local-render-row" data-local-render>本机渲染：等待场景</div>
        <div data-debug-rows>等待权威房间…</div>
        <div class="network-audio-rows" data-audio-rows>玩家声音：未开始</div>
        <div class="encounter-debug" data-encounter-debug>相遇：无</div>
        <div class="zone-badge" data-zone>当前可听玩家：0</div>
      </aside>
    ` : ''}
    <section class="start-layer" data-start-layer>
      <div class="start-card">
        <h1>进入同一颗声音星球</h1>
        <p>移动同步会自动连接。戴上耳机并开启声音后，靠近在线玩家才会听见对应声音。</p>
        <button type="button" data-start>开启声音体验</button>
        <p class="error" data-error hidden></p>
      </div>
    </section>
  </main>
`

const canvasContainer = root.querySelector<HTMLElement>('[data-planet-canvas]')
const startLayer = root.querySelector<HTMLElement>('[data-start-layer]')
const startButton = root.querySelector<HTMLButtonElement>('[data-start]')
const errorMessage = root.querySelector<HTMLElement>('[data-error]')
const userSelect = root.querySelector<HTMLSelectElement>('[data-user]')
const inputModeSelect = root.querySelector<HTMLSelectElement>('[data-input-mode]')
const networkState = root.querySelector<HTMLElement>('[data-network-state]')
const networkCopy = root.querySelector<HTMLElement>('[data-network-copy]')
const networkDetail = root.querySelector<HTMLElement>('[data-network-detail]')
const debugRows = root.querySelector<HTMLElement>('[data-debug-rows]')
const localRenderRow = root.querySelector<HTMLElement>('[data-local-render]')
const audioRows = root.querySelector<HTMLElement>('[data-audio-rows]')
const zoneLabel = root.querySelector<HTMLElement>('[data-zone]')
const encounterNotice = root.querySelector<HTMLElement>('[data-encounter-notice]')
const encounterTitle = root.querySelector<HTMLElement>('[data-encounter-title]')
const encounterCopy = root.querySelector<HTMLElement>('[data-encounter-copy]')
const encounterSend = root.querySelector<HTMLButtonElement>('[data-encounter-send]')
const encounterAccept = root.querySelector<HTMLButtonElement>('[data-encounter-accept]')
const encounterDismiss = root.querySelector<HTMLButtonElement>('[data-encounter-dismiss]')
const encounterError = root.querySelector<HTMLElement>('[data-encounter-error]')
const encounterDebug = root.querySelector<HTMLElement>('[data-encounter-debug]')
const joystickRoot = root.querySelector<HTMLElement>('[data-joystick]')

if (!canvasContainer || !startLayer || !startButton || !errorMessage ||
  !userSelect || !inputModeSelect || !networkState || !networkCopy || !networkDetail) {
  throw new Error('多人球形声音世界页面结构不完整。')
}

const statusCopy: Record<NetworkStatus, string> = {
  connecting: '正在连接星球…',
  connected: '已连接同一颗星球',
  disconnected: '连接已断开',
  error: '连接出现问题',
}

const remoteUsers = new Set<string>()
let roomClient: PlanetRoomClient | null = null
let mixer: SphereMixer | null = null
let started = false
let latestPlayers: NetworkPlayerSnapshot[] = []
let latestLocalMoveSequence = -1
let latestAudioStates: SphereAudioState[] = []
let joystick: VirtualJoystick | null = null
const acceptedNoticesShown = new Set<string>()
const dismissedPendingResponses = new Set<string>()
const responseCreateKeys = new Map<string, string>()
const responseAcceptKeys = new Map<string, string>()
let activeEncounterId: string | null = null
let activeResponseId: string | null = null
let encounterNoticeTimer: ReturnType<typeof setTimeout> | null = null

const updateNetworkStatus = (status: NetworkStatus, detail?: string): void => {
  networkState.dataset.status = status
  networkCopy.textContent = statusCopy[status]
  networkDetail.textContent = detail ?? `身份：${userId} · 星球：dev-planet`
}

const renderAudioDebug = (): void => {
  if (!audioRows || !zoneLabel) return
  audioRows.innerHTML = latestAudioStates.map((state) => {
    const voiceUserId = userIdForVoice(state.friendId)
    const distance = Number.isFinite(state.distance) ? state.distance.toFixed(2) : '离线/自己'
    return `
      <div class="debug-row">
        <span>${voiceUserId ?? state.friendId}</span>
        <span>${state.active ? `弧长 ${distance} · gain ${state.gain.toFixed(2)}` : distance}${state.speaking ? ' · 发声' : ''}</span>
      </div>
    `
  }).join('')
  const audibleCount = latestAudioStates.filter((state) => state.active && state.gain >= 0.08).length
  zoneLabel.textContent = `当前可听玩家：${audibleCount}`
}

const stage = createTinyPlanetStage(
  canvasContainer,
  tinyPlanetConfig,
  (direction) => {
    if (mixer?.getMode() === 'spatial') {
      latestAudioStates = mixer.update(
        direction,
        createNetworkSourceDirections(userId, latestPlayers),
      )
      renderAudioDebug()
    }
    if (localRenderRow) {
      localRenderRow.textContent =
        `本机渲染：(${direction.x.toFixed(3)}, ${direction.y.toFixed(3)}, ${direction.z.toFixed(3)})`
    }
  },
  {
    showFixedFriends: false,
    inputMode,
    onMoveTarget: (direction) => {
      const sequence = roomClient?.sendMoveTarget(direction) ?? null
      if (sequence === null) {
        updateNetworkStatus('disconnected', '尚未连入权威房间，移动暂时只在本地显示')
      } else {
        latestLocalMoveSequence = sequence
      }
    },
    onMoveCancel: () => {
      const sequence = roomClient?.sendMoveCancel() ?? null
      if (sequence !== null) latestLocalMoveSequence = sequence
    },
  },
)
stage.setDebugVisible(debugEnabled)
stage.start()
if (inputMode === 'joystick' && joystickRoot) {
  joystick = createVirtualJoystick(joystickRoot, ({ horizontal, vertical }) => {
    stage.setContinuousInput(horizontal, vertical)
  })
}

const hideEncounterNotice = (): void => {
  if (!encounterNotice) return
  encounterNotice.dataset.visible = 'false'
  setTimeout(() => { encounterNotice.hidden = true }, 300)
}

const showEncounterNotice = (
  title: string,
  copy: string,
  actions: { send?: boolean; accept?: boolean; dismiss?: boolean },
): void => {
  if (!encounterNotice || !encounterTitle || !encounterCopy ||
    !encounterSend || !encounterAccept || !encounterDismiss || !encounterError) return
  encounterTitle.textContent = title
  encounterCopy.textContent = copy
  encounterSend.hidden = !actions.send
  encounterAccept.hidden = !actions.accept
  encounterDismiss.hidden = !actions.dismiss
  encounterError.hidden = true
  encounterNotice.hidden = false
  requestAnimationFrame(() => encounterNotice.dataset.visible = 'true')
}

const renderEncounters = (
  encounters: NetworkEncounterSnapshot[],
  responses: NetworkResponseSnapshot[],
  relationships: NetworkRelationshipSnapshot[],
): void => {
  const localEncounters = encounters.filter((encounter) => encounter.userIds.includes(userId))
  if (encounterDebug) {
    encounterDebug.textContent = localEncounters.length === 0
      ? '相遇：无'
      : `相遇：${localEncounters.map((encounter) => `${encounter.userIds.find((id) => id !== userId)} · ${encounter.status}`).join(' / ')}`
  }
  const qualified = localEncounters.find((encounter) => encounter.status === 'qualified')
  if (!qualified) {
    activeEncounterId = null
    activeResponseId = null
    hideEncounterNotice()
    return
  }

  const otherUser = qualified.userIds.find((id) => id !== userId) ?? '朋友'
  const response = responses.find((value) => value.encounterId === qualified.encounterId)
  const relationship = relationships.find((value) => value.userIds.includes(otherUser))
  activeEncounterId = qualified.encounterId
  activeResponseId = response?.responseId ?? null

  if (!response) {
    showEncounterNotice(
      `你和 ${otherUser} 安静地待在了一起`,
      '这次相遇可以留下一个回应，但不会自动增加共鸣。',
      { send: true },
    )
    return
  }
  if (response.status === 'pending') {
    if (dismissedPendingResponses.has(response.responseId)) {
      hideEncounterNotice()
      return
    }
    if (response.fromUserId === userId) {
      showEncounterNotice(
        `回应已经送给 ${otherUser}`,
        '等待对方决定是否接受。',
        { dismiss: true },
      )
    } else {
      showEncounterNotice(
        `${otherUser} 回应了这次相遇`,
        '接受后，你们的关系共鸣会增加。',
        { accept: true, dismiss: true },
      )
    }
    return
  }
  if (acceptedNoticesShown.has(response.responseId)) return
  acceptedNoticesShown.add(response.responseId)
  showEncounterNotice(
    '你们回应了彼此',
    response.resonanceAdded
      ? `关系共鸣 +1 · 当前 ${relationship?.resonance ?? 1}`
      : `今天已经获得过共鸣 · 当前 ${relationship?.resonance ?? 0}`,
    {},
  )
  if (encounterNoticeTimer) clearTimeout(encounterNoticeTimer)
  encounterNoticeTimer = setTimeout(hideEncounterNotice, 6_000)
}

const applySnapshot = ({ players, encounters, responses, relationships }: RoomSnapshot): void => {
  latestPlayers = players
  renderEncounters(encounters ?? [], responses ?? [], relationships ?? [])
  const presentRemoteUsers = new Set<string>()
  for (const player of players) {
    if (player.userId === userId) {
      const reconciliation = decideMovementReconciliation(
        player.lastProcessedClientSequence,
        latestLocalMoveSequence,
        player.moving,
      )
      if (reconciliation.applySnapshot) {
        stage.setAuthoritativePlayerDirection(
          player.direction,
          player.moving,
          reconciliation.preserveLocalPrediction,
        )
      }
    } else {
      presentRemoteUsers.add(player.userId)
      remoteUsers.add(player.userId)
      stage.upsertRemotePlayer(player.userId, player.direction)
    }
  }
  for (const remoteUser of remoteUsers) {
    if (!presentRemoteUsers.has(remoteUser)) {
      stage.removeRemotePlayer(remoteUser)
      remoteUsers.delete(remoteUser)
    }
  }

  if (debugRows) {
    debugRows.innerHTML = latestPlayers.map((player) => `
      <div class="debug-row">
        <span>${player.userId}</span>
        <span>${player.moving ? '移动中' : '停留'} · (${player.direction.x.toFixed(2)}, ${player.direction.y.toFixed(2)}, ${player.direction.z.toFixed(2)})</span>
      </div>
    `).join('') || '当前没有在线玩家'
  }
  if (mixer?.getMode() === 'spatial') {
    latestAudioStates = mixer.update(
      stage.getPlayerDirection(),
      createNetworkSourceDirections(userId, latestPlayers),
    )
    renderAudioDebug()
  }
}

roomClient = new PlanetRoomClient({
  backendOrigin,
  planetId: 'dev-planet',
  userId,
  onSnapshot: applySnapshot,
  onStatus: updateNetworkStatus,
})
void roomClient.connect().catch(() => undefined)

encounterSend?.addEventListener('click', async () => {
  if (!activeEncounterId || !roomClient) return
  encounterSend.disabled = true
  const key = responseCreateKeys.get(activeEncounterId) ?? crypto.randomUUID()
  responseCreateKeys.set(activeEncounterId, key)
  try {
    await roomClient.createResponse(activeEncounterId, key)
  } catch (error: unknown) {
    if (encounterError) {
      encounterError.textContent = error instanceof Error ? error.message : '回应发送失败'
      encounterError.hidden = false
    }
  } finally {
    encounterSend.disabled = false
  }
})

encounterAccept?.addEventListener('click', async () => {
  if (!activeResponseId || !roomClient) return
  encounterAccept.disabled = true
  const key = responseAcceptKeys.get(activeResponseId) ?? crypto.randomUUID()
  responseAcceptKeys.set(activeResponseId, key)
  try {
    await roomClient.acceptResponse(activeResponseId, key)
  } catch (error: unknown) {
    if (encounterError) {
      encounterError.textContent = error instanceof Error ? error.message : '回应接受失败'
      encounterError.hidden = false
    }
  } finally {
    encounterAccept.disabled = false
  }
})

encounterDismiss?.addEventListener('click', () => {
  if (activeResponseId) dismissedPendingResponses.add(activeResponseId)
  hideEncounterNotice()
})

userSelect.addEventListener('change', () => {
  const next = new URL(window.location.href)
  next.searchParams.set('user', userSelect.value)
  window.location.assign(next)
})

inputModeSelect.addEventListener('change', () => {
  const next = new URL(window.location.href)
  next.searchParams.set('input', inputModeSelect.value)
  window.location.assign(next)
})

const soundBank = createPresetSoundBank(tinyPlanetConfig.friends)
startButton.addEventListener('click', async () => {
  if (started) return
  startButton.disabled = true
  startButton.textContent = '正在加载声音…'
  errorMessage.hidden = true
  try {
    await soundBank.initialize()
    mixer = createSphereMixer(
      soundBank,
      tinyPlanetConfig.friends,
      tinyPlanetConfig.radius,
      tinyPlanetConfig.audio,
      (friendId, speaking) => {
        const voiceUserId = userIdForVoice(friendId)
        if (!voiceUserId || voiceUserId === userId) return
        const online = latestPlayers.some((player) => player.userId === voiceUserId)
        stage.setRemotePlayerSpeaking(voiceUserId, online && speaking)
      },
    )
    const sourceDirections = createNetworkSourceDirections(userId, latestPlayers)
    mixer.start(stage.getPlayerDirection(), sourceDirections)
    latestAudioStates = mixer.update(stage.getPlayerDirection(), sourceDirections)
    renderAudioDebug()
    started = true
    startLayer.remove()
  } catch (error: unknown) {
    startButton.disabled = false
    startButton.textContent = '重新加载声音'
    errorMessage.textContent = error instanceof Error ? error.message : '声音加载失败，请刷新后重试。'
    errorMessage.hidden = false
  }
})

window.addEventListener('beforeunload', () => {
  roomClient?.close()
  mixer?.destroy()
  joystick?.destroy()
  if (encounterNoticeTimer) clearTimeout(encounterNoticeTimer)
  stage.destroy()
  void soundBank.destroy()
}, { once: true })
