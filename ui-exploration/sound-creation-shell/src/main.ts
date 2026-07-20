import './styles.css'
import '@phosphor-icons/web/regular'

type SourceKind = 'recording' | 'import'
type Screen =
  | 'scene-empty'
  | 'scene'
  | 'identity'
  | 'source'
  | 'record-intro-create'
  | 'record-intro-edit'
  | 'mic-denied-create'
  | 'mic-denied-edit'
  | 'recording-create'
  | 'recording-edit'
  | 'import-picker-create'
  | 'import-picker-edit'
  | 'importing-create'
  | 'importing-edit'
  | 'candidate-create'
  | 'candidate-edit'
  | 'import-error-create'
  | 'import-error-edit'
  | 'saving-create'
  | 'saving-edit'
  | 'save-error-create'
  | 'save-error-edit'
  | 'cancel-create'
  | 'discard-edit'
  | 'edit-current'

interface Character {
  id: string
  name: string
}

const app = document.querySelector<HTMLElement>('#app')
if (!app) throw new Error('Missing #app')

let screen: Screen = 'scene-empty'
let previousScreen: Screen = 'scene-empty'
let candidateSource: SourceKind = 'recording'
let candidatePlayed = false
let playing = false
let recordingSeconds = 0
let operationId = 0
let asyncTimer: number | null = null
let recordingTimer: number | null = null
let rolePopoverOpen = false
let currentCharacterId = 'char-1'
let draftName = '小岚'
let nameError = ''
let characters: Character[] = [
  { id: 'char-1', name: '小岚' },
  { id: 'char-2', name: '小岚 2' },
]

const characterImage = '/assets/echo-character-front.png'
const roomImage = '/assets/echo-cabin-room.jpg'

const demoCharacters = (): Character[] => [
  { id: 'char-1', name: '小岚' },
  { id: 'char-2', name: '小岚 2' },
]

const currentCharacter = (): Character =>
  characters.find((character) => character.id === currentCharacterId) ??
  characters[0] ??
  { id: 'draft', name: draftName || '新角色' }

const clearRuntime = (): void => {
  playing = false
  if (recordingTimer !== null) window.clearInterval(recordingTimer)
  recordingTimer = null
  if (asyncTimer !== null) window.clearTimeout(asyncTimer)
  asyncTimer = null
  operationId += 1
}

const go = (next: Screen): void => {
  clearRuntime()
  previousScreen = screen
  screen = next
  rolePopoverOpen = false
  if (screen === 'recording-create' || screen === 'recording-edit') {
    recordingSeconds = 0
    recordingTimer = window.setInterval(() => {
      recordingSeconds += 1
      const timer = document.querySelector<HTMLElement>('[data-recording-time]')
      if (timer) timer.textContent = `00:${String(recordingSeconds).padStart(2, '0')}`
    }, 1000)
  }
  render()
}

const isCreation = (): boolean =>
  !screen.includes('edit') && !screen.includes('scene')

const shellTitle = (): string => {
  if (screen === 'identity') return '创建角色'
  if (screen.includes('edit') || screen === 'edit-current' || screen === 'discard-edit') {
    return '编辑角色声音'
  }
  return '为角色添加声音'
}

const stepper = (): string => {
  if (!isCreation()) return ''
  const identityActive = screen === 'identity'
  return `
    <nav class="stepper" aria-label="创建进度">
      <span class="stepper__step" data-current="${identityActive}">
        <strong>${identityActive ? '1' : '已完成'}</strong><span>身份</span>
      </span>
      <span class="stepper__line" aria-hidden="true"></span>
      <span class="stepper__step" data-current="${!identityActive}">
        <strong>2</strong><span>声音</span>
      </span>
    </nav>`
}

const characterSummary = (label = '你的角色'): string => {
  const summaryName = isCreation() ? (draftName || '新角色') : currentCharacter().name
  return `
  <aside class="character-summary">
    <p class="eyebrow">${label}</p>
    <img class="character-summary__image" src="${characterImage}" alt="${currentCharacter().name} 的全身形象" />
    <strong>${summaryName}</strong>
    <span class="soft-status">${screen.includes('edit') || screen === 'edit-current' ? '当前声音保持生效' : '身份已准备好'}</span>
  </aside>`
}

const player = (label: string, duration = '00:04'): string => `
  <div class="sound-player" data-playing="${playing}">
    <button class="play-button" type="button" data-action="toggle-play" aria-label="${playing ? '暂停试听' : '播放试听'}">
      <i class="ph ${playing ? 'ph-pause' : 'ph-play'}" aria-hidden="true"></i><span>${playing ? '暂停' : '播放'}</span>
    </button>
    <div class="sound-player__track">
      <div class="sound-player__labels"><strong>${label}</strong><span>${duration}</span></div>
      <progress max="100" value="${playing ? 48 : 0}"></progress>
    </div>
  </div>`

const card = (body: string, footer = ''): string => `
  <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="screen-title">
    ${stepper()}
    <div class="modal-card__heading">
      <p class="brand-kicker">ECHO CABIN</p>
      <h1 id="screen-title">${shellTitle()}</h1>
    </div>
    <div class="modal-card__content">${body}</div>
    ${footer ? `<footer class="modal-card__footer">${footer}</footer>` : ''}
  </section>`

const renderIdentity = (): string => card(`
  <div class="identity-layout">
    <div class="identity-form">
      <label class="field-label" for="character-name">你的名字</label>
      <input id="character-name" class="text-input" value="${draftName}" maxlength="12" autocomplete="off" />
      <p class="field-error" aria-live="polite">${nameError}</p>
      <p class="eyebrow">选择形象</p>
      <button class="avatar-choice" type="button" aria-pressed="true">
        <img src="${characterImage}" alt="蓝发角色全身形象" />
        <span><strong>小屋旅伴</strong><small>已选择</small></span>
      </button>
      <p class="quiet-note">更多形象会在后续开放</p>
    </div>
    <div class="identity-preview">
      <img src="${characterImage}" alt="当前选择的角色形象预览" />
      <span>全身形象预览</span>
    </div>
  </div>`, `
    <button class="button button--quiet" type="button" data-action="cancel-create">取消创建</button>
    <button class="button button--primary" type="button" data-action="identity-next">下一步</button>`)

const sourceChoice = (): string => card(`
  <div class="split-layout">
    ${characterSummary()}
    <div class="flow-content">
      <p class="eyebrow">添加一段代表你的声音</p>
      <h2>你想怎样留下声音？</h2>
      <p class="supporting-copy">两种方式都可以随时重新选择。当前预览只模拟交互，不会启用麦克风或读取文件。</p>
      <div class="source-grid">
        <button class="source-card" type="button" data-action="record-create">
          <i class="ph ph-microphone" aria-hidden="true"></i><strong>现场录音</strong><span>在小屋里录下一句声音</span>
        </button>
        <button class="source-card" type="button" data-action="import-create">
          <i class="ph ph-folder-open" aria-hidden="true"></i><strong>本地导入</strong><span>选择设备里已有的音频</span>
        </button>
      </div>
    </div>
  </div>`, `
    <button class="button button--quiet" type="button" data-action="back-identity">返回身份</button>
    <button class="button button--quiet" type="button" data-action="cancel-create">取消创建</button>`)

const recordIntro = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel">
    <p class="eyebrow">现场录音</p>
    <h2>录下一句代表你的声音</h2>
    <p>建议录制 2–5 秒，在安静的地方效果更好。只有点击“开始录音”后，浏览器才会请求麦克风权限。</p>
    <div class="notice-box"><strong>这是模拟预览</strong><span>不会请求真实麦克风权限，也不会保存任何声音。</span></div>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="start-record-${mode}">开始录音</button>
      ${mode === 'create'
        ? '<button class="button button--secondary" type="button" data-action="back-source">返回声音来源</button>'
        : '<button class="button button--secondary" type="button" data-action="back-edit-current">返回当前声音</button>'}
    </div>
  </div>`)

const micDenied = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel focus-panel--error">
    <p class="eyebrow">麦克风权限</p>
    <h2>无法使用麦克风</h2>
    <p>请检查浏览器的麦克风权限，然后重新尝试。你的角色资料和现有声音没有改变。</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="retry-mic-${mode}">再试一次</button>
      <button class="button button--secondary" type="button" data-action="${mode === 'create' ? 'back-source' : 'back-edit-current'}">${mode === 'create' ? '返回声音来源' : '返回当前声音'}</button>
    </div>
  </div>`)

const recording = (mode: 'create' | 'edit'): string => card(`
  <div class="recording-panel" aria-live="polite">
    <p class="eyebrow">正在录音</p>
    <i class="ph ph-microphone recording-icon" aria-hidden="true"></i>
    <strong class="recording-time" data-recording-time>00:${String(recordingSeconds).padStart(2, '0')}</strong>
    <p>说完后点击停止。你可以先试听确认，也可以直接保存这段声音。</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="stop-record-${mode}">停止录音</button>
      <button class="button button--secondary" type="button" data-action="cancel-record-${mode}">取消录音</button>
    </div>
  </div>`)

const candidate = (mode: 'create' | 'edit'): string => {
  const isRecord = candidateSource === 'recording'
  return card(`
    <div class="split-layout split-layout--sound">
      ${characterSummary(mode === 'create' ? '你的角色' : '正在编辑')}
      <div class="flow-content">
        <p class="eyebrow">${mode === 'create' ? '声音已准备好' : '试听新声音'}</p>
        <h2>${isRecord ? '刚刚录下的声音' : '刚刚导入的声音'}</h2>
        ${player('候选声音')}
        <p class="listening-hint">${candidatePlayed ? '已试听。确认合适后可以保存。' : '试听是可选的；你也可以直接保存。'}</p>
        <div class="button-row">
          <button class="button button--secondary" type="button" data-action="${isRecord ? `record-${mode}` : `import-${mode}`}">${isRecord ? '重新录音' : '重新选择文件'}</button>
          <button class="button button--text" type="button" data-action="change-source-${mode}">更换声音来源</button>
        </div>
      </div>
    </div>`, `
      <button class="button button--quiet" type="button" data-action="${mode === 'create' ? 'back-identity' : 'exit-edit'}">${mode === 'create' ? '返回身份' : '返回场景'}</button>
      <button class="button button--primary" type="button" data-action="save-${mode}">${mode === 'create' ? '保存声音并创建角色' : '替换声音'}</button>`)
}

const importPicker = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel">
    <p class="eyebrow">本地导入</p>
    <h2>从设备选择声音文件</h2>
    <p>正式阶段会由浏览器打开系统文件选择器，并在本机读取与检查音频；不需要后端。这个 UI Shell 不会读取你的真实文件。</p>
    <div class="mock-file-picker" aria-label="模拟文件选择器">
      <i class="ph ph-file-audio" aria-hidden="true"></i>
      <span><strong>尚未选择文件</strong><small>支持格式与大小会在阶段 4 集中校验</small></span>
    </div>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="choose-import-${mode}">模拟选择 echo-demo.m4a</button>
      <button class="button button--secondary" type="button" data-action="cancel-import-${mode}">模拟关闭文件选择器</button>
    </div>
  </div>`, `
    <button class="button button--quiet" type="button" data-action="${mode === 'create' ? 'back-source' : 'back-edit-current'}">${mode === 'create' ? '返回声音来源' : '返回当前声音'}</button>`)

const importing = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel">
    <p class="eyebrow">本地导入</p>
    <h2>正在读取声音文件</h2>
    <p>请稍等片刻。处理完成前不会重复打开文件选择，也不会改变已有声音。</p>
    <progress class="loading-progress" max="100" value="62"></progress>
    <button class="button button--quiet" type="button" disabled>处理中</button>
  </div>`)

const importError = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel focus-panel--error">
    <p class="eyebrow">本地导入</p>
    <h2>无法读取这个声音文件</h2>
    <p>请重新选择一个常见格式的音频文件。${mode === 'edit' ? '角色原来的声音仍在使用。' : '你的角色资料仍然保留。'}</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="import-${mode}">重新选择文件</button>
      <button class="button button--secondary" type="button" data-action="${mode === 'create' ? 'back-source' : 'back-edit-current'}">${mode === 'create' ? '返回声音来源' : '返回当前声音'}</button>
    </div>
  </div>`)

const saving = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel">
    <p class="eyebrow">${mode === 'create' ? '正在创建角色' : '正在替换声音'}</p>
    <h2>正在把声音安放好</h2>
    <p>这个过程只用于预览保存状态。处理中已暂时关闭返回与重复提交。</p>
    <progress class="loading-progress" max="100" value="76"></progress>
  </div>`)

const saveError = (mode: 'create' | 'edit'): string => card(`
  <div class="split-layout split-layout--sound">
    ${characterSummary(mode === 'create' ? '角色草稿' : '正在编辑')}
    <div class="flow-content flow-content--error">
      <p class="eyebrow">保存没有完成</p>
      <h2>暂时无法保存${mode === 'edit' ? '新声音' : ''}</h2>
      <p>${mode === 'edit' ? '原来的声音仍在使用，新声音也已保留。' : '角色还没有创建，候选声音仍然保留。'}</p>
      <div class="button-row">
        <button class="button button--primary" type="button" data-action="retry-save-${mode}">重新尝试保存</button>
        <button class="button button--secondary" type="button" data-action="return-candidate-${mode}">返回试听</button>
        ${mode === 'create' ? '<button class="button button--text" type="button" data-action="cancel-create">取消创建</button>' : ''}
      </div>
    </div>
  </div>`)

const confirmPanel = (mode: 'create' | 'edit'): string => card(`
  <div class="focus-panel">
    <p class="eyebrow">${mode === 'create' ? '取消创建' : '退出声音编辑'}</p>
    <h2>${mode === 'create' ? '放弃创建这个角色吗？' : '放弃这段尚未保存的新声音吗？'}</h2>
    <p>${mode === 'create' ? '已填写的信息和未保存的声音将不会保留。' : '当前角色原来的声音不会受到影响。'}</p>
    <div class="button-row button-row--center">
      <button class="button button--primary" type="button" data-action="continue-${mode}">继续${mode === 'create' ? '创建' : '编辑'}</button>
      <button class="button button--secondary" type="button" data-action="discard-${mode}">确认放弃</button>
    </div>
  </div>`)

const editCurrent = (): string => card(`
  <div class="split-layout split-layout--sound">
    ${characterSummary('当前角色')}
    <div class="flow-content">
      <p class="eyebrow">当前正式声音</p>
      <h2>${currentCharacter().name} 的声音</h2>
      ${player('当前声音')}
      <p class="supporting-copy">新声音保存成功前，这段声音会继续使用。</p>
      <div class="source-grid source-grid--compact">
        <button class="source-card" type="button" data-action="record-edit"><i class="ph ph-microphone" aria-hidden="true"></i><strong>重新录音</strong><span>录制一段候选新声音</span></button>
        <button class="source-card" type="button" data-action="import-edit"><i class="ph ph-folder-open" aria-hidden="true"></i><strong>重新导入</strong><span>从设备选择候选声音</span></button>
      </div>
    </div>
  </div>`, `<button class="button button--quiet" type="button" data-action="back-scene">返回场景</button>`)

const rolePopover = (): string => {
  if (!rolePopoverOpen) return ''
  return `
    <section class="role-popover" aria-label="角色切换">
      <p><strong>${characters.length} / 4 个角色</strong><span>选择头像即可切换</span></p>
      <div class="role-list">
        ${characters.map((character) => `
          <button class="role-option" type="button" data-action="switch-role" data-character-id="${character.id}" data-current="${character.id === currentCharacterId}">
            <img src="${characterImage}" alt="${character.name}" /><span>${character.name}</span>
          </button>`).join('')}
      </div>
      <div class="role-popover__actions">
        <button class="button button--secondary" type="button" data-action="edit-current">编辑角色声音</button>
        <button class="button button--primary" type="button" data-action="add-character" ${characters.length >= 4 ? 'disabled' : ''}>${characters.length >= 4 ? '已达到角色上限' : '添加角色'}</button>
      </div>
    </section>`
}

const scene = (empty: boolean): string => `
  <div class="scene-stage" aria-label="Echo Cabin 房间场景">
    <img class="scene-stage__background" src="${roomImage}" alt="温暖的小屋房间" />
    ${!empty ? characters.map((character, index) => `
      <div class="scene-character scene-character--${index + 1}" data-current="${character.id === currentCharacterId}">
        <img src="${characterImage}" alt="${character.name}" /><span>${character.name}</span>
      </div>`).join('') : ''}
    <header class="scene-brand"><strong>Echo Cabin</strong><span>把朋友的声音放进小屋</span></header>
    ${empty ? `
      <section class="empty-entry">
        <p>小屋正在等第一位旅伴</p>
        <button class="button button--primary" type="button" data-action="create-first">创建第一个角色</button>
      </section>` : `
      <button class="current-role-button" type="button" data-action="toggle-role-popover" aria-expanded="${rolePopoverOpen}">
        <img src="${characterImage}" alt="当前角色：${currentCharacter().name}" />
        <span>${currentCharacter().name}</span>
      </button>
      ${rolePopover()}`}
  </div>`

const debugNavigator = (): string => `
  <details class="debug-nav">
    <summary>预览状态</summary>
    <div class="debug-nav__grid">
      <button data-jump="scene-empty">空场景</button><button data-jump="scene">角色场景</button>
      <button data-jump="identity">身份</button><button data-jump="source">声音来源</button>
      <button data-jump="mic-denied-create">权限拒绝</button><button data-jump="recording-create">录音中</button>
      <button data-jump="candidate-create">创建试听</button><button data-jump="import-error-create">导入失败</button>
      <button data-jump="save-error-create">创建保存失败</button><button data-jump="edit-current">当前声音</button>
      <button data-jump="candidate-edit">替换试听</button><button data-jump="save-error-edit">替换失败</button>
    </div>
  </details>`

const renderScreen = (): string => {
  switch (screen) {
    case 'scene-empty': return scene(true)
    case 'scene': return scene(false)
    case 'identity': return scene(characters.length === 0) + `<div class="scrim">${renderIdentity()}</div>`
    case 'source': return scene(characters.length === 0) + `<div class="scrim">${sourceChoice()}</div>`
    case 'record-intro-create': return scene(characters.length === 0) + `<div class="scrim">${recordIntro('create')}</div>`
    case 'record-intro-edit': return scene(false) + `<div class="scrim">${recordIntro('edit')}</div>`
    case 'mic-denied-create': return scene(characters.length === 0) + `<div class="scrim">${micDenied('create')}</div>`
    case 'mic-denied-edit': return scene(false) + `<div class="scrim">${micDenied('edit')}</div>`
    case 'recording-create': return scene(characters.length === 0) + `<div class="scrim">${recording('create')}</div>`
    case 'recording-edit': return scene(false) + `<div class="scrim">${recording('edit')}</div>`
    case 'import-picker-create': return scene(characters.length === 0) + `<div class="scrim">${importPicker('create')}</div>`
    case 'import-picker-edit': return scene(false) + `<div class="scrim">${importPicker('edit')}</div>`
    case 'importing-create': return scene(characters.length === 0) + `<div class="scrim">${importing('create')}</div>`
    case 'importing-edit': return scene(false) + `<div class="scrim">${importing('edit')}</div>`
    case 'candidate-create': return scene(characters.length === 0) + `<div class="scrim">${candidate('create')}</div>`
    case 'candidate-edit': return scene(false) + `<div class="scrim">${candidate('edit')}</div>`
    case 'import-error-create': return scene(characters.length === 0) + `<div class="scrim">${importError('create')}</div>`
    case 'import-error-edit': return scene(false) + `<div class="scrim">${importError('edit')}</div>`
    case 'saving-create': return scene(characters.length === 0) + `<div class="scrim">${saving('create')}</div>`
    case 'saving-edit': return scene(false) + `<div class="scrim">${saving('edit')}</div>`
    case 'save-error-create': return scene(characters.length === 0) + `<div class="scrim">${saveError('create')}</div>`
    case 'save-error-edit': return scene(false) + `<div class="scrim">${saveError('edit')}</div>`
    case 'cancel-create': return scene(characters.length === 0) + `<div class="scrim">${confirmPanel('create')}</div>`
    case 'discard-edit': return scene(false) + `<div class="scrim">${confirmPanel('edit')}</div>`
    case 'edit-current': return scene(false) + `<div class="scrim">${editCurrent()}</div>`
  }
}

const render = (): void => {
  app.innerHTML = `<main class="prototype-shell">${renderScreen()}${debugNavigator()}</main>`
  const input = document.querySelector<HTMLInputElement>('#character-name')
  input?.addEventListener('input', () => {
    draftName = input.value
    nameError = ''
  })
}

const startAsync = (next: Screen, complete: () => void): void => {
  go(next)
  const token = operationId
  asyncTimer = window.setTimeout(() => {
    if (token !== operationId) return
    asyncTimer = null
    complete()
  }, 900)
}

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-jump]')
  if (!target) return

  const jump = target.dataset.jump as Screen | undefined
  if (jump) {
    if ((jump.includes('edit') || jump === 'scene') && characters.length === 0) {
      characters = demoCharacters()
      currentCharacterId = characters[0].id
    }
    candidateSource = jump.includes('import') ? 'import' : 'recording'
    candidatePlayed = jump.includes('candidate') || jump.includes('save-error')
    go(jump)
    return
  }

  const action = target.dataset.action
  switch (action) {
    case 'create-first': characters = []; currentCharacterId = ''; go('identity'); break
    case 'add-character': go('identity'); break
    case 'identity-next': {
      const normalized = draftName.trim()
      if (!normalized) {
        nameError = '请输入角色名字'
        render()
        document.querySelector<HTMLInputElement>('#character-name')?.focus()
      } else {
        draftName = normalized
        go('source')
      }
      break
    }
    case 'cancel-create': previousScreen = screen; go('cancel-create'); break
    case 'continue-create': go(previousScreen === 'cancel-create' ? 'identity' : previousScreen); break
    case 'discard-create': draftName = ''; candidatePlayed = false; go(characters.length ? 'scene' : 'scene-empty'); break
    case 'back-identity': go('identity'); break
    case 'back-source': go('source'); break
    case 'record-create':
    case 'change-source-create': candidateSource = 'recording'; candidatePlayed = false; go(action === 'change-source-create' ? 'source' : 'record-intro-create'); break
    case 'record-edit': candidateSource = 'recording'; candidatePlayed = false; go('record-intro-edit'); break
    case 'change-source-edit': candidateSource = candidateSource === 'recording' ? 'import' : 'recording'; candidatePlayed = false; go(candidateSource === 'recording' ? 'record-intro-edit' : 'import-picker-edit'); break
    case 'start-record-create': go('recording-create'); break
    case 'start-record-edit': go('recording-edit'); break
    case 'retry-mic-create': go('record-intro-create'); break
    case 'retry-mic-edit': go('record-intro-edit'); break
    case 'stop-record-create': candidateSource = 'recording'; candidatePlayed = false; go('candidate-create'); break
    case 'stop-record-edit': candidateSource = 'recording'; candidatePlayed = false; go('candidate-edit'); break
    case 'cancel-record-create': go('source'); break
    case 'cancel-record-edit': go('edit-current'); break
    case 'import-create': candidateSource = 'import'; candidatePlayed = false; go('import-picker-create'); break
    case 'import-edit': candidateSource = 'import'; candidatePlayed = false; go('import-picker-edit'); break
    case 'choose-import-create': startAsync('importing-create', () => go('candidate-create')); break
    case 'choose-import-edit': startAsync('importing-edit', () => go('candidate-edit')); break
    case 'cancel-import-create': go('source'); break
    case 'cancel-import-edit': go('edit-current'); break
    case 'toggle-play': playing = !playing; candidatePlayed = true; render(); break
    case 'save-create': startAsync('saving-create', () => {
      const name = draftName || `角色 ${characters.length + 1}`
      const createdCharacter: Character = {
        id: `char-${characters.length + 1}`,
        name,
      }
      characters = [...characters, createdCharacter].slice(0, 4)
      currentCharacterId = characters.at(-1)?.id ?? currentCharacterId
      go('scene')
    }); break
    case 'save-edit': startAsync('saving-edit', () => go('edit-current')); break
    case 'retry-save-create': startAsync('saving-create', () => go('scene')); break
    case 'retry-save-edit': startAsync('saving-edit', () => go('edit-current')); break
    case 'return-candidate-create': go('candidate-create'); break
    case 'return-candidate-edit': go('candidate-edit'); break
    case 'back-edit-current': go('edit-current'); break
    case 'back-scene': go('scene'); break
    case 'exit-edit': previousScreen = 'candidate-edit'; go('discard-edit'); break
    case 'continue-edit': go('candidate-edit'); break
    case 'discard-edit': candidatePlayed = false; go('scene'); break
    case 'toggle-role-popover': rolePopoverOpen = !rolePopoverOpen; render(); break
    case 'switch-role': {
      const id = target.dataset.characterId
      if (id) currentCharacterId = id
      rolePopoverOpen = false
      clearRuntime()
      render()
      break
    }
    case 'edit-current': go('edit-current'); break
  }
})

render()
