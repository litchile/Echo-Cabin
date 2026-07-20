export interface SceneImage {
  element: HTMLImageElement
  ready: Promise<void>
}

export function createSceneImage(url: string): SceneImage {
  const element = document.createElement('img')
  element.className = 'stage__background'
  element.alt = 'Echo Cabin 固定室内场景'
  element.draggable = false

  const ready = new Promise<void>((resolve, reject) => {
    element.addEventListener('load', () => resolve(), { once: true })
    element.addEventListener(
      'error',
      () => reject(new Error(`Scene asset failed to load: ${url}`)),
      { once: true },
    )
  })

  element.src = url
  return { element, ready }
}
