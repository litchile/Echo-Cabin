import type {
  CharacterAvatarPreset,
  CharacterStateSnapshot,
} from '../characters/characterTypes'

export interface CharacterControlActions {
  getSnapshot(): CharacterStateSnapshot
  beginDraft(): void
  updateDraftIdentity(name: string, avatarId: string): void
  completeDraftWithPlaceholderSound(): void
  cancelDraft(): void
  switchCharacter(characterId: string): void
  onStateChanged(): void
}

export interface CharacterControls {
  element: HTMLElement
  refresh(): void
}

export function createCharacterControls(
  avatars: readonly CharacterAvatarPreset[],
  actions: CharacterControlActions,
): CharacterControls {
  const element = document.createElement('section')
  element.className = 'character-controls'
  element.dataset.interactive = 'true'
  element.setAttribute('aria-label', '角色创建与切换')

  let creationStep: 'identity' | 'sound' = 'identity'
  let switcherOpen = false
  let confirmingCancel = false
  let message = ''

  const runAction = (action: () => void): boolean => {
    try {
      action()
      message = ''
      actions.onStateChanged()
      return true
    } catch (error) {
      message = error instanceof Error ? error.message : '操作失败，请重试'
      return false
    }
  }

  const createButton = (
    label: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  const renderToolbar = (snapshot: CharacterStateSnapshot): HTMLElement => {
    const toolbar = document.createElement('div')
    toolbar.className = 'character-controls__toolbar'

    const count = document.createElement('span')
    count.className = 'character-controls__count'
    count.textContent = `${snapshot.activeCharacters.length}/${snapshot.capacity} 位角色`

    const create = createButton('创建角色', 'character-controls__button', () => {
      if (runAction(actions.beginDraft)) {
        creationStep = 'identity'
        confirmingCancel = false
        switcherOpen = false
      }
      refresh()
    })
    create.disabled =
      snapshot.activeCharacters.length >= snapshot.capacity || snapshot.draft !== null

    const switcher = createButton('切换角色', 'character-controls__button', () => {
      switcherOpen = !switcherOpen
      refresh()
    })
    switcher.disabled = snapshot.activeCharacters.length < 2 || snapshot.draft !== null

    toolbar.append(count, create, switcher)
    return toolbar
  }

  const renderIdentityStep = (snapshot: CharacterStateSnapshot): HTMLElement => {
    const draft = snapshot.draft
    if (!draft) {
      throw new Error('Draft character is required for the identity step.')
    }

    const form = document.createElement('form')
    form.className = 'character-panel'

    const title = document.createElement('h2')
    title.textContent = snapshot.activeCharacters.length === 0
      ? '创建第一个角色'
      : '替朋友创建角色'

    const description = document.createElement('p')
    description.textContent = import.meta.env.DEV
      ? '阶段 3 开发测试：先设置角色身份，再验证声音保存后的提交流程。'
      : '先设置角色名字和形象，随后添加属于这个角色的声音。'

    const nameLabel = document.createElement('label')
    nameLabel.className = 'character-panel__field'
    nameLabel.textContent = '角色名字'

    const nameInput = document.createElement('input')
    nameInput.name = 'character-name'
    nameInput.maxLength = 24
    nameInput.required = true
    nameInput.autocomplete = 'off'
    nameInput.value = draft.name
    nameInput.placeholder = '输入一个名字'
    nameLabel.append(nameInput)

    const avatarGroup = document.createElement('fieldset')
    avatarGroup.className = 'character-panel__avatars'
    const legend = document.createElement('legend')
    legend.textContent = '预设形象'
    avatarGroup.append(legend)

    for (const avatar of avatars) {
      const label = document.createElement('label')
      label.className = 'character-panel__avatar'
      label.dataset.avatar = avatar.id

      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'avatar'
      input.value = avatar.id
      input.checked = avatar.id === draft.avatarId

      const swatch = document.createElement('span')
      swatch.setAttribute('aria-hidden', 'true')
      const text = document.createElement('span')
      text.textContent = avatar.label
      label.append(input, swatch, text)
      avatarGroup.append(label)
    }

    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions'
    actionsRow.append(
      createButton('取消', 'character-controls__button character-controls__button--quiet', () => {
        confirmingCancel = Boolean(nameInput.value.trim())
        if (!confirmingCancel) {
          runAction(actions.cancelDraft)
        }
        refresh()
      }),
    )

    const next = document.createElement('button')
    next.type = 'submit'
    next.className = 'character-controls__button character-controls__button--primary'
    next.textContent = '下一步'
    actionsRow.append(next)

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const selectedAvatar = form.querySelector<HTMLInputElement>('input[name="avatar"]:checked')
      if (!nameInput.value.trim() || !selectedAvatar) {
        message = '请填写名字并选择一个预设形象'
        refresh()
        return
      }
      if (runAction(() => actions.updateDraftIdentity(nameInput.value, selectedAvatar.value))) {
        creationStep = 'sound'
        confirmingCancel = false
      }
      refresh()
    })

    form.append(title, description, nameLabel, avatarGroup, actionsRow)
    return form
  }

  const renderSoundStep = (snapshot: CharacterStateSnapshot): HTMLElement => {
    const draft = snapshot.draft
    if (!draft) {
      throw new Error('Draft character is required for the sound step.')
    }

    const panel = document.createElement('section')
    panel.className = 'character-panel'

    const title = document.createElement('h2')
    title.textContent = `${draft.name} 的声音`
    const description = document.createElement('p')
    description.textContent = '请录制或导入一段声音后完成创建。声音录制与导入将在下一阶段接入。'

    const placeholder = document.createElement('div')
    placeholder.className = 'character-panel__sound-placeholder'
    placeholder.textContent = '当前尚未提供声音录制或导入入口'

    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions'
    actionsRow.append(
      createButton('返回身份', 'character-controls__button character-controls__button--quiet', () => {
        creationStep = 'identity'
        refresh()
      }),
      createButton('取消创建', 'character-controls__button character-controls__button--quiet', () => {
        confirmingCancel = true
        refresh()
      }),
    )

    if (import.meta.env.DEV) {
      const developmentLabel = document.createElement('span')
      developmentLabel.className = 'character-panel__development-label'
      developmentLabel.textContent = '仅开发测试'
      actionsRow.append(developmentLabel)
      actionsRow.append(createButton(
        '模拟声音已保存并完成',
        'character-controls__button character-controls__button--primary',
        () => {
          if (runAction(actions.completeDraftWithPlaceholderSound)) {
            creationStep = 'identity'
            switcherOpen = false
          }
          refresh()
        },
      ))
    }

    panel.append(title, description, placeholder, actionsRow)
    return panel
  }

  const renderCancelConfirmation = (): HTMLElement => {
    const panel = document.createElement('section')
    panel.className = 'character-panel character-panel--confirmation'
    const title = document.createElement('h2')
    title.textContent = '放弃这个角色草稿？'
    const description = document.createElement('p')
    description.textContent = '草稿不会占用角色容量或出生位置。放弃后本次内容会被清除。'
    const actionsRow = document.createElement('div')
    actionsRow.className = 'character-panel__actions'
    actionsRow.append(
      createButton('继续编辑', 'character-controls__button character-controls__button--quiet', () => {
        confirmingCancel = false
        refresh()
      }),
      createButton('确认放弃', 'character-controls__button character-controls__button--danger', () => {
        if (runAction(actions.cancelDraft)) {
          confirmingCancel = false
          creationStep = 'identity'
        }
        refresh()
      }),
    )
    panel.append(title, description, actionsRow)
    return panel
  }

  const renderSwitcher = (snapshot: CharacterStateSnapshot): HTMLElement => {
    const panel = document.createElement('section')
    panel.className = 'character-switcher'
    const title = document.createElement('h2')
    title.textContent = '切换当前角色'
    panel.append(title)

    for (const character of snapshot.activeCharacters) {
      const button = createButton(
        character.name,
        'character-switcher__character',
        () => {
          if (runAction(() => actions.switchCharacter(character.id))) {
            switcherOpen = false
          }
          refresh()
        },
      )
      button.dataset.avatar = character.avatarId
      button.dataset.current = String(character.id === snapshot.currentCharacterId)
      button.disabled = character.id === snapshot.currentCharacterId
      panel.append(button)
    }
    return panel
  }

  const refresh = (): void => {
    const snapshot = actions.getSnapshot()
    const content: HTMLElement[] = [renderToolbar(snapshot)]

    if (snapshot.draft) {
      content.push(
        confirmingCancel
          ? renderCancelConfirmation()
          : creationStep === 'identity'
            ? renderIdentityStep(snapshot)
            : renderSoundStep(snapshot),
      )
    } else if (switcherOpen) {
      content.push(renderSwitcher(snapshot))
    }

    if (message) {
      const feedback = document.createElement('p')
      feedback.className = 'character-controls__message'
      feedback.textContent = message
      content.push(feedback)
    }

    element.replaceChildren(...content)
  }

  return { element, refresh }
}
