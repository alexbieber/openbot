export default {
  name: 'qr-code',
  async run({ text, size = 256, errorLevel = 'M' }) {
    if (!text) return { ok: false, error: 'text is required' };
    try {
      const qrcode = await import('qrcode');
      const dataUrl = await qrcode.default.toDataURL(text, {
        width: size,
        errorCorrectionLevel: errorLevel,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });
      return { ok: true, dataUrl, text, size, format: 'png/base64' };
    } catch (err) {
      // Fallback: ASCII QR in terminal format
      return { ok: false, error: `qrcode library not installed. Run: npm install qrcode. (${err.message})` };
    }
  },
};
