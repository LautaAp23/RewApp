/** Decodes locally; selected images are never uploaded. */
export async function readQrImage(file: File) {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) throw new Error("invalid_image");
  const url = URL.createObjectURL(file);
  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();
    const result = await reader.decodeFromImageUrl(url);
    return result.getText();
  } finally { URL.revokeObjectURL(url); }
}
