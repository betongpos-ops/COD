// Compress image using Canvas API before uploading to Supabase Storage
export async function compressImage(
  file: File,
  maxWidth = 1200,
  quality  = 0.75
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target!.result as string
      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width  = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else      reject(new Error('Image compression failed'))
          },
          'image/jpeg',
          quality
        )
      }
      img.onerror = reject
    }
    reader.onerror = reject
  })
}
