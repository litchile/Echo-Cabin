import type { ObservationSnapshot, ObservationZoneKind } from './observationTracker'

export interface ObservationPanel {
  element: HTMLElement
  render(snapshot: ObservationSnapshot): void
}

const zoneLabels: Record<ObservationZoneKind, string> = {
  quiet: '安静区',
  single: '单声区',
  double: '双声区',
  triple: '三声区',
}

const formatSeconds = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)}s`

export function createObservationPanel(): ObservationPanel {
  const element = document.createElement('aside')
  element.className = 'observation-panel'
  element.dataset.collapsed = 'false'
  element.setAttribute('aria-label', '开发观察面板')
  element.innerHTML = `
    <div class="observation-panel__header">
      <div><small>DEV ONLY</small><strong>行为观察</strong></div>
      <button type="button" aria-label="折叠观察面板">收起</button>
    </div>
    <div class="observation-panel__body">
      <dl class="observation-panel__live">
        <div><dt>会话</dt><dd data-field="elapsed">0.0s</dd></div>
        <div><dt>当前区域</dt><dd data-field="zone">安静区</dd></div>
        <div><dt>可听角色</dt><dd data-field="audible">0 · —</dd></div>
        <div><dt>最近角色</dt><dd data-field="nearest">—</dd></div>
      </dl>
      <div class="observation-panel__dwell">
        <span>区域停留</span>
        <div><i></i><label>安静</label><b data-dwell="quiet">0.0s</b></div>
        <div><i></i><label>单声</label><b data-dwell="single">0.0s</b></div>
        <div><i></i><label>双声</label><b data-dwell="double">0.0s</b></div>
        <div><i></i><label>三声</label><b data-dwell="triple">0.0s</b></div>
      </div>
      <dl class="observation-panel__counts">
        <div><dt>明显折返</dt><dd data-field="reversals">0</dd></div>
        <div><dt>重复靠近</dt><dd data-field="repeats">0</dd></div>
      </dl>
      <p class="observation-panel__summary" data-field="summary">等待声音启动…</p>
    </div>
  `

  const toggle = element.querySelector<HTMLButtonElement>('button')!
  toggle.addEventListener('click', () => {
    const collapsed = element.dataset.collapsed === 'true'
    element.dataset.collapsed = String(!collapsed)
    toggle.textContent = collapsed ? '收起' : '展开'
  })

  const setText = (selector: string, value: string): void => {
    const target = element.querySelector<HTMLElement>(selector)
    if (target) target.textContent = value
  }

  return {
    element,
    render(snapshot) {
      setText('[data-field="elapsed"]', formatSeconds(snapshot.elapsedMs))
      setText('[data-field="zone"]', zoneLabels[snapshot.currentZone])
      setText(
        '[data-field="audible"]',
        `${snapshot.audibleFriendIds.length} · ${snapshot.audibleFriendNames.join('、') || '—'}`,
      )
      setText(
        '[data-field="nearest"]',
        `${snapshot.nearestFriendName} · ${Math.round(snapshot.nearestDistance)}u`,
      )
      Object.entries(snapshot.dwellMs).forEach(([zone, milliseconds]) => {
        setText(`[data-dwell="${zone}"]`, formatSeconds(milliseconds))
      })
      setText('[data-field="reversals"]', String(snapshot.reversals))
      setText('[data-field="repeats"]', String(snapshot.repeatApproaches))
      setText(
        '[data-field="summary"]',
        snapshot.running
          ? `摘要：安静 ${formatSeconds(snapshot.dwellMs.quiet)} / 单声 ${formatSeconds(snapshot.dwellMs.single)} / 双声 ${formatSeconds(snapshot.dwellMs.double)} / 三声 ${formatSeconds(snapshot.dwellMs.triple)}`
          : '等待声音启动…',
      )
    },
  }
}
