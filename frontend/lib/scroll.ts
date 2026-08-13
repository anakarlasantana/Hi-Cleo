/**
 * Faz scroll suave até um elemento, centralizando-o verticalmente na tela.
 * Se o elemento é maior que a viewport, alinha pelo topo com margem.
 * Adapta-se automaticamente ao tamanho da tela.
 */
export function scrollToCenter(elementId: string) {
  const element = document.getElementById(elementId)
  if (!element) return

  const elementRect = element.getBoundingClientRect()
  const elementHeight = elementRect.height
  const viewportHeight = window.innerHeight
  const navbarHeight = 64 // altura fixa da navbar

  let targetScrollY: number

  if (elementHeight >= viewportHeight - navbarHeight) {
    // Seção maior que a tela: alinha pelo topo com margem da navbar
    targetScrollY = window.scrollY + elementRect.top - navbarHeight - 16
  } else {
    // Seção menor que a tela: centraliza verticalmente
    const availableHeight = viewportHeight - navbarHeight
    const offset = (availableHeight - elementHeight) / 2
    targetScrollY = window.scrollY + elementRect.top - navbarHeight - offset
  }

  window.scrollTo({
    top: Math.max(0, targetScrollY),
    behavior: 'smooth',
  })
}
