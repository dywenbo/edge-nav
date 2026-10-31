export interface GradientPreset {
  id: string
  name: string
  css: string
  /** 深色专用渐变：给了就不再对浅色版本做压暗处理（见 WallpaperLayer） */
  cssDark?: string
}

/**
 * 渐变壁纸：零网络请求、无版权风险。
 * 前两张与两种视觉风格配套（切换风格时会一起切），后面是通用备选。
 */
export const GRADIENTS: GradientPreset[] = [
  {
    id: 'apple',
    name: '苹果光晕',
    css:
      'radial-gradient(760px 620px at 8% -6%, #ffc2d8, transparent 64%),' +
      'radial-gradient(820px 660px at 92% 2%, #b4bcff, transparent 66%),' +
      'radial-gradient(900px 720px at 76% 100%, #9fd6ff, transparent 64%),' +
      'radial-gradient(700px 620px at 12% 96%, #ffdcaa, transparent 64%),' +
      'linear-gradient(160deg, #e2e9ff 0%, #d3ddfb 45%, #e6efff 100%)',
    cssDark:
      'radial-gradient(760px 620px at 10% -4%, rgba(255, 110, 170, 0.55), transparent 62%),' +
      'radial-gradient(820px 660px at 92% 4%, rgba(120, 110, 255, 0.6), transparent 64%),' +
      'radial-gradient(900px 720px at 74% 102%, rgba(52, 176, 255, 0.42), transparent 62%),' +
      'linear-gradient(158deg, #221a3e 0%, #161a3c 38%, #0a1122 100%)',
  },
  {
    id: 'win11',
    name: 'Win11 蓝',
    css:
      'radial-gradient(940px 660px at 14% -8%, #a6cdf6, transparent 64%),' +
      'radial-gradient(880px 640px at 88% 6%, #bcdcff, transparent 64%),' +
      'radial-gradient(1050px 760px at 48% 116%, #dcecfd, transparent 64%),' +
      'linear-gradient(152deg, #e2eefc 0%, #c9dcf3 46%, #dceaf9 100%)',
    cssDark:
      'radial-gradient(1000px 700px at 16% -2%, rgba(30, 120, 190, 0.55), transparent 62%),' +
      'radial-gradient(900px 680px at 86% 8%, rgba(24, 150, 175, 0.42), transparent 62%),' +
      'radial-gradient(1100px 800px at 50% 114%, #03080f, transparent 60%),' +
      'linear-gradient(155deg, #071a2d 0%, #0a2744 48%, #05131f 100%)',
  },
  {
    id: 'morning',
    name: '晨雾',
    css: 'linear-gradient(150deg, #eef2ff 0%, #e0e7ff 45%, #f8fafc 100%)',
  },
  {
    id: 'paper',
    name: '纸感',
    css: 'linear-gradient(160deg, #fafaf9 0%, #f1f5f9 60%, #e2e8f0 100%)',
  },
  {
    id: 'mint',
    name: '薄荷',
    css: 'linear-gradient(150deg, #ecfdf5 0%, #d1fae5 50%, #f0fdfa 100%)',
  },
  {
    id: 'peach',
    name: '杏色',
    css: 'linear-gradient(150deg, #fff7ed 0%, #ffedd5 50%, #fef3c7 100%)',
  },
  {
    id: 'lilac',
    name: '淡紫',
    css: 'linear-gradient(150deg, #f5f3ff 0%, #ede9fe 50%, #faf5ff 100%)',
  },
  {
    id: 'sky',
    name: '天青',
    css: 'linear-gradient(150deg, #f0f9ff 0%, #e0f2fe 50%, #f8fafc 100%)',
  },
]

export const getGradient = (id: string): GradientPreset =>
  GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0]

/** 与视觉风格配套的壁纸 id，切换风格时若当前是配套壁纸会一起切 */
export const STYLE_WALLPAPER: Record<string, string> = {
  apple: 'apple',
  win11: 'win11',
}

export const isPairedWallpaper = (id: string): boolean => id in STYLE_WALLPAPER
