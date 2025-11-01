/**
 * Utility functions for handling binary data conversions between Uint8Array and base64
 * for JSON serialization and database storage
 */

export class BinaryUtils {
  /**
   * Convert Uint8Array to base64 string for JSON serialization
   */
  static toBase64(data: Uint8Array): string {
    let binaryString = '';
    const chunkSize = 8192; // Process in chunks to avoid stack overflow
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    return btoa(binaryString);
  }

  /**
   * Convert base64 string back to Uint8Array
   */
  static fromBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array or ArrayBuffer to base64 for JSON serialization
   */
  static serializeForJson(data: Uint8Array | ArrayBuffer | string): string {
    if (typeof data === 'string') {
      return data;
    }
    if (data instanceof Uint8Array) {
      return this.toBase64(data);
    }
    if (data instanceof ArrayBuffer) {
      return this.toBase64(new Uint8Array(data));
    }
    throw new Error('Unsupported binary data type');
  }

  /**
   * Convert base64 string or other format back to Uint8Array
   */
  static deserializeFromJson(data: string | Uint8Array): Uint8Array {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (typeof data === 'string') {
      return this.fromBase64(data);
    }
    throw new Error(`Unsupported data format for deserialization: ${typeof data}`);
  }

  /**
   * Convert Uint8Array to regular array for JSON serialization (legacy, for dump/import)
   */
  static toArray(data: Uint8Array): number[] {
    return Array.from(data);
  }

  /**
   * Convert array back to Uint8Array (legacy, for dump/import)
   */
  static fromArray(data: number[]): Uint8Array {
    return new Uint8Array(data);
  }
}

