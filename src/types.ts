export type WidgetType = 'overview' | 'links' | 'todo' | 'calendar' | 'notes'

export type Priority = 'low' | 'normal' | 'high'

export type ThemeMode = 'light' | 'dark' | 'system'

/** 视觉风格：与深浅色正交，只影响材质、圆角、阴影与字体 */
export type UIStyle = 'apple' | 'win11'

export interface LinkItem {
  id: string
  title: string
  url: string
}

/** 链接分组，对应链接组件顶部的标签页 */
export interface LinkGroup {
  id: string
  name: string
  links: LinkItem[]
}

/**
 * 书签文件夹的展示配置。
 * 只保存「要不要显示」这一层，链接本体始终从浏览器书签实时读取，
 * 因此从导航里移除文件夹或链接都不会动到书签。
 */
export interface BookmarkFolder {
  /** chrome bookmarks 节点 id */
  id: string
  title: string
  /** 完整路径，用于区分同名文件夹 */
  path: string
  enabled: boolean
}

export interface SubTask {
  id: string
  text: string
  done: boolean
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  priority: Priority
  /** YYYY-MM-DD，空字符串表示不设截止日 */
  due: string
  /** 绑定一个网址：点「开始」直接打开，专注计时也能带上它 */
  url?: string
  subtasks: SubTask[]
  createdAt: number
}

/**
 * 专注计时（番茄钟）的持久化状态。
 * 只存「结束时间戳」而不是每秒倒计时，关掉标签页再打开也能接上；
 * 秒级刷新完全由组件本地完成，不写盘。
 */
export interface FocusState {
  /** 单轮时长（分钟） */
  minutes: number
  /** 运行中：结束时间戳；未运行为 0 */
  endsAt: number
  /** 暂停 / 重置后的剩余秒数；0 表示一整轮还没开始 */
  remaining: number
  running: boolean
  /** 关联的待办 id，空字符串表示自由专注 */
  todoId: string
  /** 今日完成的轮数 */
  completed: number
  /** completed 对应的日期 YYYY-MM-DD */
  day: string
  /** 最近一次完成的时间戳，用于让卡片弹一次「本轮完成」提示 */
  lastDoneAt: number
}

export interface NoteItem {
  id: string
  text: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

/** 某一天的标注：法定节假日 / 调休补班 */
export type DayMark = 'holiday' | 'workday'

export interface WidgetItem {
  id: string
  type: WidgetType
  x: number
  y: number
  w: number
  h: number
  /** 仅 links 组件使用：当前选中的标签页，本地分组为 groupId，书签文件夹为 `bm:<节点 id>` */
  groupId?: string
}

export interface LayoutConfig {
  /** 拖动时吸附到其它卡片与画布边缘，并显示参考线 */
  snapToEdges: boolean
  /** 松手后把其它卡片上移，填掉被拖走 / 删掉的空位 */
  autoCompact: boolean
}

export interface WallpaperConfig {
  type: 'gradient' | 'image'
  gradient: string
  image: string
  blur: number
  /** 浅色主题下是「白色提亮」的强度，深色主题下是「压暗」的强度 */
  dim: number
}

export interface AppConfig {
  version: number
  theme: ThemeMode
  style: UIStyle
  wallpaper: WallpaperConfig
  layout: LayoutConfig
  search: {
    engine: string
    /** 搜索结果与命令面板里的网址是否新开标签页 */
    openInNewTab: boolean
  }
  weather: {
    city: string
    lat: number
    lon: number
  }
  showSeconds: boolean
  groups: LinkGroup[]
  /** 书签文件夹导航 */
  bookmarks: {
    folders: BookmarkFolder[]
    /** 从导航隐藏的书签节点 id，按文件夹 id 分组；只影响导航，不影响书签本体 */
    hidden: Record<string, string[]>
    /** 只加进导航、没写进浏览器书签的补充链接，按文件夹 id 分组 */
    extras: Record<string, LinkItem[]>
  }
  todos: TodoItem[]
  notes: NoteItem[]
  calendar: {
    /** 手动标注的日期，键为 YYYY-MM-DD，优先级最高 */
    overrides: Record<string, DayMark>
  }
  focus: FocusState
  widgets: WidgetItem[]
}
