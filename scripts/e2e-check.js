(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const log = {}

  const setInput = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // 1. 打开「添加快捷方式」弹窗
  document.querySelector('.link--add').click()
  await sleep(120)
  log.dialogOpened = !!document.querySelector('.dlg__panel')

  // 2. 填入名称与网址并提交
  const inputs = document.querySelectorAll('.dlg__panel input')
  setInput(inputs[0], 'Vue 官方文档')
  setInput(inputs[1], 'cn.vuejs.org/guide')
  await sleep(80)
  document.querySelector('.dlg__panel').requestSubmit()
  await sleep(500)

  const saved = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  log.dialogClosed = !document.querySelector('.dlg__panel')
  log.linkCount = saved.links?.length
  log.lastLink = saved.links?.[saved.links.length - 1]

  // 3. 调整天气卡片宽度
  const weatherShell = document.querySelector('.shell:has(.weather)')
  weatherShell.querySelector('.shell__tools button[title="变宽"]').click()
  await sleep(400)
  const saved2 = JSON.parse(localStorage.getItem('edge-nav:config') || '{}')
  log.weatherColSpan = saved2.widgets?.find((w) => w.type === 'weather')?.colSpan

  // 4. 校验标题容器颜色已修复
  log.addTileColor = getComputedStyle(document.querySelector('.link--add .link__title')).color

  // 5. 卡片是否溢出容器（滚动条判定）
  log.overflow = [...document.querySelectorAll('.shell')].map((shell) => {
    const body = shell.querySelector('.shell__body')
    return {
      type: shell.querySelector('.weather')
        ? 'weather'
        : shell.querySelector('.todo')
          ? 'todo'
          : 'links',
      scrollH: body.scrollHeight,
      clientH: body.clientHeight,
      clipped: body.scrollHeight > body.clientHeight + 2,
    }
  })

  return log
})()
