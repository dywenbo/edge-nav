/**
 * 本地壁纸压缩。
 * chrome.storage.local 默认配额 10MB（已申请 unlimitedStorage），但把 4K 原图直接塞进去
 * 会让每次读写都变慢，所以先等比缩放到最长边 2560px，再按质量递减压到 1.5MB 以内。
 */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }

  const bitmap = await createImageBitmap(file)
  const maxSide = 2560
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前环境不支持 Canvas')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const toDataUrl = (quality: number): string =>
    canvas.toDataURL('image/jpeg', quality)

  let quality = 0.86
  let dataUrl = toDataUrl(quality)
  while (dataUrl.length > 1.5 * 1024 * 1024 && quality > 0.4) {
    quality -= 0.12
    dataUrl = toDataUrl(quality)
  }
  return dataUrl
}
