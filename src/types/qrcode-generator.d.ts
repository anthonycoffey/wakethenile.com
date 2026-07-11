declare module 'qrcode-generator' {
  interface QRCode {
    addData(data: string, mode?: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
    createSvgTag(opts?: { cellSize?: number; margin?: number; scalable?: boolean; alt?: string; title?: string }): string;
    createDataURL(cellSize?: number, margin?: number): string;
  }
  type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
  /** typeNumber 0 = auto-fit. */
  function qrcode(typeNumber: number, errorCorrectionLevel: ErrorCorrectionLevel): QRCode;
  export default qrcode;
}
