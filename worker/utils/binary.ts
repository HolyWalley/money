/**
 * Utility functions for handling binary data conversions between Uint8Array and Array
 * for JSON serialization and database storage
 */

export class BinaryUtils {
  /**
   * Convert Uint8Array to regular array for JSON serialization
   */
  static toArray(data: Uint8Array): number[] {
    return Array.from(data);
  }

  /**
   * Convert array back to Uint8Array
   */
  static fromArray(data: number[]): Uint8Array {
    return new Uint8Array(data);
  }

  /**
   * Convert Uint8Array or ArrayBuffer to array for JSON serialization
   */
  static serializeForJson(data: Uint8Array | ArrayBuffer | number[]): number[] {
    if (Array.isArray(data)) {
      return data;
    }
    if (data instanceof Uint8Array) {
      return Array.from(data);
    }
    if (data instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(data));
    }
    throw new Error('Unsupported binary data type');
  }

  /**
   * Convert array or other format back to Uint8Array
   */
  static deserializeFromJson(data: number[] | Uint8Array): Uint8Array {
    console.debug(`[BinaryUtils] deserializeFromJson: input type=${data.constructor.name}, length=${data.length}`);

    if (data instanceof Uint8Array) {
      console.debug(`[BinaryUtils] Input is already Uint8Array, returning as-is`);
      return data;
    }
    if (Array.isArray(data)) {
      console.debug(`[BinaryUtils] Converting array to Uint8Array`);
      // Validate array contains only numbers
      for (let i = 0; i < Math.min(data.length, 10); i++) {
        if (typeof data[i] !== 'number' || data[i] < 0 || data[i] > 255) {
          console.error(`[BinaryUtils] Invalid array element at index ${i}: ${data[i]} (type: ${typeof data[i]})`);
          throw new Error(`Invalid array element at index ${i}: expected number 0-255, got ${data[i]}`);
        }
      }
      const result = new Uint8Array(data);
      console.debug(`[BinaryUtils] Successfully converted to Uint8Array, length=${result.length}`);
      return result;
    }
    console.error(`[BinaryUtils] Unsupported data format:`, data);
    throw new Error(`Unsupported data format for deserialization: ${data.constructor.name}`);
  }
}

