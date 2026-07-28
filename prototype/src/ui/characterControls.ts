import type { SoundAsset, SoundCaptureService } from '../audio/soundCapture'
import { SoundCaptureError } from '../audio/soundCapture'
import type {
  ActiveCharacter,
  CharacterAvatarPreset,
  CharacterStateSnapshot,
  SavedCharacterSoundRef,
} from '../characters/characterTypes'

export interface CharacterControlActions {
  getSnapshot(): CharacterStateSnapshot
  beginDraft(): void
  updateDraftIdentity(name: string, avatarId: string): void
  completeDraftWithSound(soundRef: SavedCharacterSoundRef): ActiveCharacter
  replaceCharacterSound(characterId: string, soundRef: SavedCharacterSoundRef): SavedCharacterSoundRef
  cancelDraft(): void
  switchCharacter(characterId: string): void
  onStateChanged(): void
  onPanelVisibilityChanged?(isOpen: boolean): void
}

export interface CharacterControls {
  element: HTMLElement
  refresh(): void
  destroy(): void
}

type Mode = 'idle' | 'create' | 'edit'
type Step =
  | 'identity'
  | 'source'
  | 'record-intro'
  | 'recording'
  | 'candidate'
  | 'current-sound'
  | 'error'
  | 'confirm-exit'

const formatDuration = (seconds: number): string => {
  const rounded = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const describeError = (error: unknown): string => {
  if (!(error instanceof SoundCaptureError)) return '操作没有完成，请重试。'
  switch (error.code) {
    case 'microphone-denied': return '无法使用麦克风。请检查浏览器权限后重试。'
    case 'microphone-unavailable': return '没有找到可用的麦克风。'
    case 'recording-unsupported': return '当前浏览器不支持现场录音，请返回选择本地导入。'
    case 'file-too-large': return '声音文件超过 25 MB，请选择更小的文件。'
    case 'file-unsupported': return '无法读取这个声音文件，请选择常见音频格式。'
    default: return '声音处理没有完成，请重试。'
  }
}

export function createCharacterControls(
  avatars: readonly CharacterAvatarPreset[],
  actions: CharacterControlActions,
  sounds: SoundCaptureService,
): CharacterControls {
  const element = document.createElement('section')
  element.className = 'character-controls'
  element.dataset.interactive = 'true'
  element.setAttribute('aria-label', '角色创建与切换')

  let mode: Mode = 'idle'
  let step: Step = 'identity'
  let switcherOpen = false
  let message = ''
  let candidate: SoundAsset | null = null
  let targetCharacterId: string | null = null
  let playingSoundId: string | null = null
  let recordingSeconds = 0
  let recordingTimer: number | null = null
  let operationId = 0
  let returnStep: Step = 'source'
  let busy = false
  let notifiedPanelOpen = false

  const snapshot = (): CharacterStateSnapshot => actions.getSnapshot()

  const bumpOperation = (): number => ++operationId

  const stopRecordingTimer = (): void => {
    if (recordingTimer !== null) window.clearInterval(recordingTimer)
    recordingTimer = null
  }

  const stopPlayback = (): void => {
    sounds.stopPlayback()
    playingSoundId = null
  }

  const releaseCandidate = (): void => {
    if (candidate) sounds.release(candidate.ref.id)
    candidate = null
  }

  const render = (): void => {
    const state = snapshot()
    if (state.draft && mode === 'idle') {
      mode = 'create'
      step = 'identity'
    }
    const panelOpen = mode !== 'idle' || switcherOpen
    if (panelOpen !== notifiedPanelOpen) {
      notifiedPanelOpen = panelOpen
      actions.onPanelVisibilityChanged?.(panelOpen)
    }

    const toolbar = document.createElement('div')
    toolbar.className = 'character-controls__toolbar'
    toolbar.replaceChildren()

    const roleButton = document.createElement('button')
    roleButton.type = 'button'
    roleButton.className = 'character-controls__role-button'
    const current = state.activeCharacters.find((item) => item.id === state.currentCharacterId)
    roleButton.setAttribute('aria-label', current ? `当前角色：${current.name}。打开角色列表` : '打开角色列表')
    const currentAvatar = avatars.find((avatar) => avatar.id === current?.avatarId)
    if (current && currentAvatar) {
      const image = document.createElement('img')
      image.src = currentAvatar.imageUrl
      image.alt = ''
      const label = document.createElement('span')
      label.textContent = current.name
      const caret = document.createElement('i')
      caret.className = 'ph ph-caret-down'
      caret.setAttribute('aria-hidden', 'true')
      roleButton.append(image, label, caret)
    } else {
      roleButton.textContent = '角色'
    }
    roleButton.disabled = mode !== 'idle'
    roleButton.addEventListener('click', () => {
      switcherOpen = !switcherOpen
      render()
    })
    if (state.activeCharacters.length > 0) toolbar.append(roleButton)

    const create = document.createElement('button')
    create.type = 'button'
    create.className = 'character-controls__button character-controls__button--primary'
    create.textContent = state.activeCharacters.length === 0 ? '创建第一个角色' : '添加角色'
    create.disabled = mode !== 'idle' || state.activeCharacters.length >= state.capacity
    create.addEventListener('click', () => {
      try {
        actions.beginDraft()
        mode = 'create'
        step = 'identity'
        switcherOpen = false
        message = ''
        render()
      } catch (error) {
        message = error instanceof Error ? error.message : '无法开始创建'
        render()
      }
    })
    if (state.activeCharacters.length === 0) toolbar.append(create)

    const content: HTMLElement[] = [toolbar]
    if (mode === 'idle' && switcherOpen) content.push(renderSwitcher(state))
    if (mode !== 'idle') content.push(renderOverlay(state))
    if (message && mode === 'idle') {
      const feedback = document.createElement('p')
      feedback.className = 'character-controls__message'
      feedback.textContent = message
      content.push(feedback)
    }
    element.replaceChildren(...content)
  }

  const makeButton = (
    label: string,
    kind: 'primary' | 'secondary' | 'quiet' | 'danger',
    action: () => void | Promise<void>,
  ): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `character-controls__button character-controls__button--${kind}`
    button.textContent = label
    button.disabled = busy
    button.addEventListener('click', () => void action())
    return button
  }

  const renderSwitcher = (state: CharacterStateSnapshot): HTMLElement => {
    const panel = document.createElement('section')
    panel.className = 'character-switcher'
    panel.innerHTML = `<div class="character-switcher__heading"><strong>${state.activeCharacters.length} / ${state.capacity} 个角色</strong><span>选择头像即可切换</span></div>`
    const list = document.createElement('div')
    list.className = 'character-switcher__list'
    for (const character of state.activeCharacters) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'character-switcher__character'
      button.dataset.current = String(character.id === state.currentCharacterId)
      const avatar = avatars.find((item) => item.id === character.avatarId)
      if (avatar) {
        const image = document.createElement('img')
        image.src = avatar.imageUrl
        image.alt = ''
        button.append(image)
      }
      const label = document.createElement('span')
      label.textContent = character.name
      button.append(label)
      button.addEventListener('click', () => {
        stopPlayback()
        actions.switchCharacter(character.id)
        switcherOpen = false
        actions.onStateChanged()
        render()
      })
      button.disabled = character.id === state.currentCharacterId
      list.append(button)
    }
    panel.append(list)
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-switcher__actions'
    if (state.currentCharacterId) {
      actionsRow.append(makeButton('编辑角色声音', 'secondary', () => {
        mode = 'edit'
        step = 'current-sound'
        targetCharacterId = state.currentCharacterId
        switcherOpen = false
        message = ''
        render()
      }))
    }
    const add = makeButton(state.activeCharacters.length >= state.capacity ? '已达到角色上限' : '添加角色', 'primary', () => {
      actions.beginDraft()
      mode = 'create'
      step = 'identity'
      switcherOpen = false
      message = ''
      render()
    })
    add.disabled = state.activeCharacters.length >= state.capacity
    actionsRow.append(add)
    panel.append(actionsRow)
    return panel
  }

  const renderOverlay = (state: CharacterStateSnapshot): HTMLElement => {
    const overlay = document.createElement('div')
    overlay.className = 'character-controls__overlay'
    const panel = document.createElement('section')
    panel.className = 'character-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-labelledby', 'character-panel-title')
    panel.append(renderPanelContent(state))
    overlay.append(panel)
    return overlay
  }

  const renderStepper = (): HTMLElement | null => {
    if (mode !== 'create') return null
    const identityActive = step === 'identity'
    const stepper = document.createElement('nav')
    stepper.className = 'character-panel__stepper'
    stepper.setAttribute('aria-label', '创建进度')
    stepper.innerHTML = `
      <span class="character-panel__step" data-current="${identityActive}">
        <strong>${identityActive ? '1' : '✓'}</strong><span>身份</span>
      </span>
      <span class="character-panel__step-line" aria-hidden="true"></span>
      <span class="character-panel__step" data-current="${!identityActive}">
        <strong>2</strong><span>声音</span>
      </span>`
    return stepper
  }

  const getAvatar = (avatarId: string): CharacterAvatarPreset | undefined =>
    avatars.find((avatar) => avatar.id === avatarId)

  const renderCharacterSummary = (
    state: CharacterStateSnapshot,
    label: string,
  ): HTMLElement => {
    const character = mode === 'create'
      ? null
      : state.activeCharacters.find((item) => item.id === targetCharacterId)
    const name = character?.name ?? state.draft?.name ?? '新角色'
    const avatar = getAvatar(character?.avatarId ?? state.draft?.avatarId ?? avatars[0]?.id ?? '')
    const summary = document.createElement('aside')
    summary.className = 'character-panel__summary'
    const eyebrow = document.createElement('p')
    eyebrow.className = 'character-panel__eyebrow'
    eyebrow.textContent = label
    summary.append(eyebrow)
    if (avatar) {
      const image = document.createElement('img')
      image.className = 'character-panel__summary-image'
      image.src = avatar.imageUrl
      image.alt = `${name} 的全身形象`
      summary.append(image)
    }
    const strong = document.createElement('strong')
    strong.textContent = name
    const status = document.createElement('span')
    status.className = 'character-panel__soft-status'
    status.textContent = mode === 'edit' ? '当前声音保持生效' : '身份已准备好'
    summary.append(strong, status)
    return summary
  }

  const renderPlayer = (
    asset: SoundAsset,
    label: string,
  ): HTMLElement => {
    const player = document.createElement('div')
    player.className = 'character-panel__player'
    const preview = makeButton(
      playingSoundId === asset.ref.id ? '暂停' : '播放',
      'secondary',
      () => togglePlayback(asset),
    )
    preview.classList.add('character-panel__play-button')
    preview.innerHTML = `<i class="ph ${playingSoundId === asset.ref.id ? 'ph-pause' : 'ph-play'}" aria-hidden="true"></i><span>${playingSoundId === asset.ref.id ? '暂停' : '播放'}</span>`
    const track = document.createElement('div')
    track.className = 'character-panel__player-track'
    track.innerHTML = `<div><strong>${escapeHtml(label)}</strong><span>${formatDuration(asset.durationSeconds)}</span></div><progress max="100" value="${playingSoundId === asset.ref.id ? '48' : '0'}"></progress>`
    player.append(preview, track)
    return player
  }

  const wrapScreen = (
    content: HTMLElement,
    footerButtons: HTMLElement[] = [],
  ): HTMLElement => {
    const screen = document.createElement('section')
    screen.className = 'character-panel__screen'
    const contentRegion = document.createElement('div')
    contentRegion.className = 'character-panel__content'
    contentRegion.append(content)
    screen.append(contentRegion)
    if (footerButtons.length > 0) {
      const footer = document.createElement('footer')
      footer.className = 'character-panel__footer'
      footer.append(...footerButtons)
      screen.append(footer)
    }
    return screen
  }

  const renderPanelContent = (state: CharacterStateSnapshot): DocumentFragment => {
    const fragment = document.createDocumentFragment()
    const stepper = renderStepper()
    if (stepper) fragment.append(stepper)
    const heading = document.createElement('header')
    heading.className = 'character-panel__heading'
    heading.innerHTML = `<span>ECHO CABIN</span><h2 id="character-panel-title">${mode === 'create' ? (step === 'identity' ? '创建角色' : '为角色添加声音') : '编辑角色声音'}</h2>`
    fragment.append(heading)

    if (message) {
      const feedback = document.createElement('p')
      feedback.className = 'character-panel__feedback'
      feedback.textContent = message
      fragment.append(feedback)
    }

    if (step === 'identity') fragment.append(renderIdentity(state))
    else if (step === 'source') fragment.append(renderSourceChoice())
    else if (step === 'record-intro') fragment.append(renderRecordIntro())
    else if (step === 'recording') fragment.append(renderRecording())
    else if (step === 'candidate') fragment.append(renderCandidate())
    else if (step === 'current-sound') fragment.append(renderCurrentSound(state))
    else if (step === 'error') fragment.append(renderError())
    else if (step === 'confirm-exit') fragment.append(renderExitConfirmation())
    return fragment
  }

  const renderIdentity = (state: CharacterStateSnapshot): HTMLElement => {
    const draft = state.draft
    if (!draft) throw new Error('draft-missing')
    const form = document.createElement('form')
    form.className = 'character-panel__identity-layout'
    form.innerHTML = `
      <div class="character-panel__identity-form">
        <label class="character-panel__field">你的名字
          <input name="character-name" maxlength="24" required autocomplete="off" value="${escapeHtml(draft.name)}" placeholder="输入一个名字">
        </label>
        <fieldset class="character-panel__avatars"><legend>选择形象</legend></fieldset>
        <p class="character-panel__quiet-note">更多形象会在后续开放</p>
      </div>
      <div class="character-panel__identity-preview" aria-label="当前选择的角色形象预览"></div>`
    const avatarGroup = form.querySelector('fieldset') as HTMLFieldSetElement
    const preview = form.querySelector('.character-panel__identity-preview') as HTMLDivElement
    avatars.forEach((avatar) => {
      const label = document.createElement('label')
      label.className = 'character-panel__avatar'
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'avatar'
      input.value = avatar.id
      input.checked = avatar.id === draft.avatarId
      const image = document.createElement('img')
      image.src = avatar.imageUrl
      image.alt = `${avatar.label} 全身形象`
      const text = document.createElement('span')
      const strong = document.createElement('strong')
      strong.textContent = avatar.label
      const status = document.createElement('small')
      status.textContent = input.checked ? '已选择' : '选择'
      text.append(strong, status)
      label.append(input, image, text)
      avatarGroup.append(label)
      if (input.checked) {
        const previewImage = document.createElement('img')
        previewImage.src = avatar.imageUrl
        previewImage.alt = `${avatar.label} 全身形象预览`
        const previewLabel = document.createElement('span')
        previewLabel.textContent = '全身形象预览'
        preview.append(previewImage, previewLabel)
      }
    })
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'character-controls__button character-controls__button--primary'
    next.textContent = '下一步'
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const data = new FormData(form)
      const name = String(data.get('character-name') ?? '').trim()
      const avatarId = String(data.get('avatar') ?? '')
      try {
        actions.updateDraftIdentity(name, avatarId)
        step = 'source'
        message = ''
        actions.onStateChanged()
      } catch {
        message = '请填写名字并选择一个形象。'
      }
      render()
    })
    next.addEventListener('click', () => form.requestSubmit())
    return wrapScreen(form, [
      makeButton('取消创建', 'quiet', () => { step = 'confirm-exit'; render() }),
      next,
    ])
  }

  const renderSourceChoice = (): HTMLElement => {
    const state = snapshot()
    const body = document.createElement('div')
    body.className = 'character-panel__split-layout'
    body.append(renderCharacterSummary(state, '你的角色'))
    const flow = document.createElement('div')
    flow.className = 'character-panel__flow'
    flow.innerHTML = `<p class="character-panel__eyebrow">添加一段代表角色的声音</p><h3>你想怎样留下声音？</h3><p>现场录音和本地导入都在浏览器本机完成，不需要后端。</p>`
    const choices = document.createElement('div')
    choices.className = 'character-panel__source-grid'
    const recordingChoice = makeButton('现场录音', 'secondary', () => {
      step = 'record-intro'
      message = ''
      render()
    })
    if (!sounds.isRecordingSupported()) {
      recordingChoice.disabled = true
      recordingChoice.textContent = '当前浏览器不支持现场录音'
    }
    recordingChoice.classList.add('character-panel__source-card')
    recordingChoice.innerHTML = '<i class="ph ph-microphone" aria-hidden="true"></i><strong>现场录音</strong><span>在小屋里录下一句声音</span>'
    const importChoice = makeButton('本地导入', 'secondary', () => openFilePicker())
    importChoice.classList.add('character-panel__source-card')
    importChoice.innerHTML = '<i class="ph ph-folder-open" aria-hidden="true"></i><strong>本地导入</strong><span>选择设备里已有的音频</span>'
    choices.append(recordingChoice, importChoice)
    flow.append(choices)
    body.append(flow)
    return wrapScreen(body, [
      makeButton('返回身份', 'quiet', () => { step = 'identity'; render() }),
      makeButton('取消创建', 'quiet', () => { step = 'confirm-exit'; render() }),
    ])
  }

  const renderRecordIntro = (): HTMLElement => {
    const body = document.createElement('div')
    body.className = 'character-panel__focus'
    body.innerHTML = `<p class="character-panel__eyebrow">现场录音</p><i class="ph ph-microphone-stage character-panel__focus-icon" aria-hidden="true"></i><h3>录下一句代表角色的声音</h3><p>建议录制 2–5 秒，在安静的地方效果更好。只有点击“开始录音”后，浏览器才会请求麦克风权限。</p>`
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions character-panel__actions--center'
    actionsRow.append(
      makeButton('开始录音', 'primary', startRecording),
      makeButton(mode === 'create' ? '返回声音来源' : '返回当前声音', 'quiet', () => {
        step = candidate ? 'candidate' : mode === 'create' ? 'source' : 'current-sound'
        render()
      }),
    )
    body.append(actionsRow)
    return wrapScreen(body)
  }

  const renderRecording = (): HTMLElement => {
    const body = document.createElement('div')
    body.className = 'character-panel__focus'
    body.innerHTML = `<p class="character-panel__eyebrow">正在录音</p><i class="ph ph-microphone character-panel__recording-icon" aria-hidden="true"></i><div class="character-panel__recording">${formatDuration(recordingSeconds)}</div><p>说完后点击停止。试听是可选的，你也可以直接保存。</p>`
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions character-panel__actions--center'
    actionsRow.append(
      makeButton('停止录音', 'primary', stopRecording),
      makeButton('取消录音', 'secondary', () => {
        bumpOperation()
        sounds.cancelRecording()
        stopRecordingTimer()
        step = mode === 'create' ? 'source' : 'current-sound'
        render()
      }),
    )
    body.append(actionsRow)
    return wrapScreen(body)
  }

  const renderCandidate = (): HTMLElement => {
    if (!candidate) throw new Error('candidate-missing')
    const state = snapshot()
    const body = document.createElement('div')
    body.className = 'character-panel__split-layout character-panel__split-layout--sound'
    body.append(renderCharacterSummary(state, mode === 'create' ? '你的角色' : '正在编辑'))
    const flow = document.createElement('div')
    flow.className = 'character-panel__flow'
    flow.innerHTML = `<p class="character-panel__eyebrow">${mode === 'create' ? '声音已准备好' : '试听新声音'}</p><h3>${candidate.source === 'recording' ? '刚刚录下的声音' : '刚刚导入的声音'}</h3><p>${escapeHtml(candidate.fileName ?? candidate.mimeType)} · ${formatDuration(candidate.durationSeconds)}</p>`
    flow.append(renderPlayer(candidate, '候选声音'))
    const hint = document.createElement('p')
    hint.className = 'character-panel__listening-hint'
    hint.textContent = '试听是可选的；你也可以直接保存。'
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions character-panel__actions--wrap'
    actionsRow.append(
      makeButton(candidate.source === 'recording' ? '重新录音' : '重新选择文件', 'secondary', () => {
        if (candidate?.source === 'recording') {
          step = 'record-intro'
          render()
        } else {
          openFilePicker()
        }
      }),
      makeButton('更换声音来源', 'quiet', () => {
        step = mode === 'create' ? 'source' : 'current-sound'
        render()
      }),
    )
    flow.append(hint, actionsRow)
    body.append(flow)
    const footer: HTMLElement[] = []
    if (mode === 'edit') {
      footer.push(makeButton('返回场景', 'quiet', () => { step = 'confirm-exit'; render() }))
    } else {
      footer.push(
        makeButton('返回身份', 'quiet', () => { step = 'identity'; render() }),
        makeButton('取消创建', 'quiet', () => { step = 'confirm-exit'; render() }),
      )
    }
    footer.push(makeButton(mode === 'create' ? '保存声音并创建角色' : '替换声音', 'primary', saveCandidate))
    return wrapScreen(body, footer)
  }

  const renderCurrentSound = (state: CharacterStateSnapshot): HTMLElement => {
    const character = state.activeCharacters.find((item) => item.id === targetCharacterId)
    if (!character) throw new Error('character-not-found')
    const currentAsset: SoundAsset = {
      ref: character.soundRef,
      source: character.soundRef.source === 'import' ? 'import' : 'recording',
      mimeType: '', durationSeconds: 0, fileName: null,
    }
    const body = document.createElement('div')
    body.className = 'character-panel__split-layout character-panel__split-layout--sound'
    body.append(renderCharacterSummary(state, '当前角色'))
    const flow = document.createElement('div')
    flow.className = 'character-panel__flow'
    flow.innerHTML = `<p class="character-panel__eyebrow">当前正式声音</p><h3>${escapeHtml(character.name)} 的声音</h3>`
    flow.append(renderPlayer(currentAsset, '当前声音'))
    const note = document.createElement('p')
    note.textContent = '新声音保存成功前，这段声音会继续使用。'
    flow.append(note)
    const sources = document.createElement('div')
    sources.className = 'character-panel__source-grid'
    const record = makeButton('重新录音', 'secondary', () => { step = 'record-intro'; render() })
    record.classList.add('character-panel__source-card')
    record.innerHTML = '<i class="ph ph-microphone" aria-hidden="true"></i><strong>重新录音</strong><span>录制一段候选新声音</span>'
    const imported = makeButton('重新导入', 'secondary', () => openFilePicker())
    imported.classList.add('character-panel__source-card')
    imported.innerHTML = '<i class="ph ph-folder-open" aria-hidden="true"></i><strong>重新导入</strong><span>从设备选择候选声音</span>'
    sources.append(record, imported)
    flow.append(sources)
    body.append(flow)
    return wrapScreen(body, [makeButton('返回场景', 'quiet', closeEditor)])
  }

  const renderError = (): HTMLElement => {
    const body = document.createElement('div')
    body.className = 'character-panel__focus character-panel__focus--error'
    body.innerHTML = `<p class="character-panel__eyebrow">操作没有完成</p><i class="ph ph-warning-circle character-panel__focus-icon" aria-hidden="true"></i><h3>${escapeHtml(message)}</h3><p>已经保存的角色和声音不会受到影响。</p>`
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions character-panel__actions--center'
    actionsRow.append(
      makeButton('返回并重试', 'primary', () => { step = returnStep; message = ''; render() }),
      makeButton(candidate ? '返回候选声音' : mode === 'create' ? '返回声音来源' : '返回当前声音', 'quiet', () => {
        step = candidate ? 'candidate' : mode === 'create' ? 'source' : 'current-sound'
        message = ''
        render()
      }),
    )
    body.append(actionsRow)
    return wrapScreen(body)
  }

  const renderExitConfirmation = (): HTMLElement => {
    const body = document.createElement('div')
    body.className = 'character-panel__focus'
    body.innerHTML = `<p class="character-panel__eyebrow">${mode === 'create' ? '取消创建' : '退出编辑'}</p><h3>${mode === 'create' ? '放弃创建这个角色吗？' : '放弃尚未保存的新声音吗？'}</h3><p>${mode === 'create' ? '角色资料和声音不会保留。' : '原来的声音不会受到影响。'}</p>`
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions character-panel__actions--center'
    actionsRow.append(
      makeButton('继续编辑', 'primary', () => { step = candidate ? 'candidate' : mode === 'create' ? 'identity' : 'current-sound'; render() }),
      makeButton('确认放弃', 'danger', () => {
        bumpOperation()
        stopPlayback()
        releaseCandidate()
        if (mode === 'create') actions.cancelDraft()
        mode = 'idle'
        step = 'identity'
        targetCharacterId = null
        actions.onStateChanged()
        render()
      }),
    )
    body.append(actionsRow)
    return wrapScreen(body)
  }

  const startRecording = async (): Promise<void> => {
    const token = bumpOperation()
    stopPlayback()
    message = ''
    busy = true
    render()
    try {
      await sounds.startRecording()
      if (token !== operationId) {
        busy = false
        sounds.cancelRecording()
        return
      }
      step = 'recording'
      busy = false
      recordingSeconds = 0
      stopRecordingTimer()
      recordingTimer = window.setInterval(() => {
        recordingSeconds += 1
        const readout = element.querySelector('.character-panel__recording')
        if (readout) readout.textContent = formatDuration(recordingSeconds)
      }, 1000)
    } catch (error) {
      busy = false
      message = describeError(error)
      returnStep = candidate ? 'candidate' : 'record-intro'
      step = 'error'
    }
    render()
  }

  const stopRecording = async (): Promise<void> => {
    const token = operationId
    stopRecordingTimer()
    try {
      const nextCandidate = await sounds.stopRecording()
      if (token !== operationId) {
        sounds.release(nextCandidate.ref.id)
        return
      }
      releaseCandidate()
      candidate = nextCandidate
      step = 'candidate'
      message = ''
    } catch (error) {
      if (error instanceof SoundCaptureError && error.code === 'recording-cancelled') return
      message = describeError(error)
      returnStep = 'record-intro'
      step = 'error'
    }
    render()
  }

  const openFilePicker = (): void => {
    stopPlayback()
    element.querySelectorAll('.character-controls__file-input').forEach((input) => input.remove())
    const input = document.createElement('input')
    input.type = 'file'
    input.className = 'character-controls__file-input'
    input.accept = 'audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac,.flac'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) {
        input.remove()
        return
      }
      const token = bumpOperation()
      busy = true
      message = '正在读取声音文件…'
      render()
      try {
        const nextCandidate = await sounds.importFile(file)
        if (token !== operationId) {
          busy = false
          sounds.release(nextCandidate.ref.id)
          return
        }
        releaseCandidate()
        candidate = nextCandidate
        step = 'candidate'
        message = ''
      } catch (error) {
        message = describeError(error)
        returnStep = candidate ? 'candidate' : mode === 'create' ? 'source' : 'current-sound'
        step = 'error'
      }
      busy = false
      input.remove()
      render()
    }, { once: true })
    element.append(input)
    input.click()
  }

  const togglePlayback = async (asset: SoundAsset): Promise<void> => {
    if (playingSoundId === asset.ref.id) {
      stopPlayback()
      render()
      return
    }
    stopPlayback()
    try {
      playingSoundId = asset.ref.id
      await sounds.play(asset.ref.id, () => {
        playingSoundId = null
        render()
      })
    } catch (error) {
      playingSoundId = null
      message = describeError(error)
    }
    render()
  }

  const saveCandidate = (): void => {
    if (!candidate) return
    stopPlayback()
    try {
      if (mode === 'create') {
        const created = actions.completeDraftWithSound(candidate.ref)
        candidate = null
        message = `${created.name} 已完成创建`
      } else if (targetCharacterId) {
        const previous = actions.replaceCharacterSound(targetCharacterId, candidate.ref)
        sounds.release(previous.id)
        candidate = null
        message = '角色声音已替换'
      }
      mode = 'idle'
      step = 'identity'
      targetCharacterId = null
      actions.onStateChanged()
    } catch (error) {
      message = error instanceof Error ? error.message : '保存失败，请重试。'
    }
    render()
  }

  const closeEditor = (): void => {
    stopPlayback()
    mode = 'idle'
    step = 'identity'
    targetCharacterId = null
    render()
  }

  const refresh = (): void => render()

  const destroy = (): void => {
    bumpOperation()
    stopRecordingTimer()
    stopPlayback()
    releaseCandidate()
    sounds.destroy()
  }

  return { element, refresh, destroy }
}
