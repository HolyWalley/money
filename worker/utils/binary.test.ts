import { describe, it, expect } from 'vitest'
import { BinaryUtils } from './binary'

describe('BinaryUtils.fromSqlBlob', () => {
  it('decodes an ArrayBuffer into a Uint8Array with the same bytes', () => {
    const source = new Uint8Array([0, 1, 196, 231, 255])
    const result = BinaryUtils.fromSqlBlob(source.buffer as ArrayBuffer, 'update')

    expect(result).toBeInstanceOf(Uint8Array)
    expect(Array.from(result)).toEqual([0, 1, 196, 231, 255])
  })

  it('decodes an empty ArrayBuffer', () => {
    expect(Array.from(BinaryUtils.fromSqlBlob(new ArrayBuffer(0), 'state'))).toEqual([])
  })

  it('throws on a string, naming the column and the received type', () => {
    expect(() => BinaryUtils.fromSqlBlob('not bytes', 'update')).toThrow(
      'Expected BLOB for column "update", received string'
    )
  })

  it('throws on a number, naming the column and the received type', () => {
    expect(() => BinaryUtils.fromSqlBlob(42, 'state')).toThrow(
      'Expected BLOB for column "state", received number'
    )
  })

  it('throws on null rather than reporting it as an object', () => {
    expect(() => BinaryUtils.fromSqlBlob(null, 'update')).toThrow(
      'Expected BLOB for column "update", received null'
    )
  })
})
