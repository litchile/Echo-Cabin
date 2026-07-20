export function createOrientationHint(): HTMLElement {
  const hint = document.createElement('aside')
  hint.className = 'orientation-hint'
  hint.setAttribute('role', 'status')
  hint.innerHTML = '<span aria-hidden="true">↻</span><span>横屏体验效果更佳</span>'
  return hint
}
