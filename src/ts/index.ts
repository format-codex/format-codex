
import { Transform, Duplex } from "./typed-streams";

export interface OffsetHolder {
  offset: number;
}

interface FormatCommonBase<T> {
  createEncodingStream(): Duplex<T, Buffer>;
  createDecodingStream(): Duplex<Buffer, T>;
  measureByteLength(value: T): number;
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: T): void;
}

export interface GreedyFormat<T> extends FormatCommonBase<T> {
  readonly isGreedy: true;
}

export interface NonGreedyFormat<T> extends FormatCommonBase<T> {
  readonly isGreedy: false;
  readonly minByteLength: number;
  readonly maxByteLength: number;
  findEndOffset(source: Buffer, startOffset: number): number;
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): T;
}

export interface RangedFormat<T> extends NonGreedyFormat<T> {
  readonly minValue: T;
  readonly maxValue: T;
}

export type Format<T> = GreedyFormat<T> | NonGreedyFormat<T>;

type OrderedTupleMembers = ArrayLike<NonGreedyFormat<unknown>>;
type NamedTupleMembers = {[memberName: string]: NonGreedyFormat<unknown>};

type OrderedTupleRecord<TMembers extends OrderedTupleMembers> = {
  readonly [P in keyof TMembers]: TMembers[P] extends NonGreedyFormat<infer U> ? U : never;
};

type NamedTupleRecord<TMembers extends NamedTupleMembers> = {
  readonly [P in keyof TMembers]: TMembers[P] extends NonGreedyFormat<infer U> ? U : never;
};

export interface OrderedTuple<TMembers extends OrderedTupleMembers> extends NonGreedyFormat<OrderedTupleRecord<TMembers>> {
  readonly members: ArrayLike<NonGreedyFormat<unknown>>;
}

export interface NamedTuple<TMembers extends NamedTupleMembers> extends NonGreedyFormat<NamedTupleRecord<TMembers>> {
  readonly members: ArrayLike<{readonly name:string, readonly format:NonGreedyFormat<unknown>}>;
}

export interface Sequence<T> {
  readonly elementFormat: NonGreedyFormat<T>;
}

export interface NonGreedySequence<T> extends NonGreedyFormat<Iterable<T>>, Sequence<T> {
}

export interface GreedySequence<T> extends GreedyFormat<Iterable<T>>, Sequence<T> {
}

export interface FixedCountSequence<T> extends NonGreedySequence<T> {
  readonly fixedCount: number;
}

export interface CountPrefixSequence<TElement> extends NonGreedySequence<TElement> {
  readonly countFormat: NonGreedyFormat<number>;
  readonly minCount: number;
  readonly maxCount: number;
}

export interface SelfTerminatingSequence<T> extends NonGreedySequence<T> {
  isTerminator(v: T): boolean;
  createTerminator(): T;
  decodesToTerminator(buffer: Buffer, offset: number): boolean;
}

class OrderedTupleImpl<TMembers extends OrderedTupleMembers> implements OrderedTuple<TMembers> {
  constructor(
    readonly members:TMembers) {
  }
  get isGreedy(): false { return false; }
  get minByteLength() {
    let minByteLength = 0;
    for (let i = 0; i < this.members.length; i++) {
      minByteLength += this.members[i].minByteLength;
    }
    return minByteLength;
  }
  get maxByteLength() {
    let maxByteLength = 0;
    for (let i = 0; i < this.members.length; i++) {
      maxByteLength += this.members[i].maxByteLength;
    }
    return maxByteLength;
  }
  findEndOffset(source: Buffer, offset: number): number {
    for (let i = 0; i < this.members.length; i++) {
      offset = this.members[i].findEndOffset(source, offset);
      if (offset < 0) return offset;
      if (offset >= source.length) return -offset;
    }
    return offset;
  }
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): OrderedTupleRecord<TMembers> {
    const values = new Array(this.members.length);
    for (let i = 0; i < values.length; i++) {
      values[i] = this.members[i].decodeFrom(source, offsetHolder);
    }
    return <unknown>values as OrderedTupleRecord<TMembers>;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: OrderedTupleRecord<TMembers>): void {
    for (let i = 0; i < value.length; i++) {
      this.members[i].encodeTo(target, offsetHolder, value[i]);
    }
  }
  createEncodingStream(): Duplex<OrderedTupleRecord<TMembers>, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, OrderedTupleRecord<TMembers>> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: OrderedTupleRecord<TMembers>): number {
    let len = 0;
    for (let i = 0; i < value.length; i++) {
      len += this.members[i].measureByteLength(value[i]);
    }
    return len;
  }
}

export function createOrderedTuple<TMembers extends OrderedTupleMembers>(members:TMembers): OrderedTuple<TMembers> {
  return new OrderedTupleImpl(members);
}

class NamedTupleImpl<TMembers extends NamedTupleMembers> implements NamedTuple<TMembers> {
  constructor(
      membersObject:TMembers) {
    this.members = Object.keys(membersObject).map(name => ({name, format: membersObject[name]}));
  }
  members: ArrayLike<{readonly name:string, readonly format:NonGreedyFormat<unknown>}>;
  get isGreedy(): false { return false; }
  get minByteLength() {
    let minByteLength = 0;
    for (let i = 0; i < this.members.length; i++) {
      minByteLength += this.members[i].format.minByteLength;
    }
    return minByteLength;
  }
  get maxByteLength() {
    let maxByteLength = 0;
    for (let i = 0; i < this.members.length; i++) {
      maxByteLength += this.members[i].format.maxByteLength;
    }
    return maxByteLength;
  }
  findEndOffset(source: Buffer, offset: number): number {
    for (let i = 0; i < this.members.length; i++) {
      offset = this.members[i].format.findEndOffset(source, offset);
      if (offset < 0) return offset;
      if (offset >= source.length) return -offset;
    }
    return offset;
  }
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): NamedTupleRecord<TMembers> {
    const values = Object.create(null);
    for (let i = 0; i < values.length; i++) {
      values[this.members[i].name] = this.members[i].format.decodeFrom(source, offsetHolder);
    }
    return <unknown>values as NamedTupleRecord<TMembers>;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: NamedTupleRecord<TMembers>): void {
    for (let i = 0; i < value.length; i++) {
      this.members[i].format.encodeTo(target, offsetHolder, value[this.members[i].name]);
    }
  }
  createEncodingStream(): Duplex<NamedTupleRecord<TMembers>, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, NamedTupleRecord<TMembers>> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: NamedTupleRecord<TMembers>): number {
    let len = 0;
    for (let i = 0; i < value.length; i++) {
      len += this.members[i].format.measureByteLength(value[this.members[i].name]);
    }
    return len;
  }
}

export function createNamedTuple<TMembers extends NamedTupleMembers>(members:TMembers): NamedTuple<TMembers> {
  return new NamedTupleImpl(members);
}

abstract class SelfTerminatingSequenceImpl<T> implements SelfTerminatingSequence<T> {
  constructor(
      readonly elementFormat: NonGreedyFormat<T>) {
  }
  abstract isTerminator(v: T): boolean;
  abstract createTerminator(): T;
  abstract decodesToTerminator(buffer: Buffer, offset: number): boolean;
  get isGreedy(): false { return false; }
  get minByteLength() { return this.elementFormat.measureByteLength(this.createTerminator()); };
  get maxByteLength() { return Infinity; }
  findEndOffset(source: Buffer, offset: number): number {
    for (;;) {
      const endOffset = this.elementFormat.findEndOffset(source, offset);
      if (endOffset < 0) return endOffset;
      if (endOffset >= source.length) return -endOffset;
      if (this.decodesToTerminator(source, offset)) {
        return endOffset;
      }
      offset = endOffset;
    }
  }
  *decodeFrom(source: Buffer, offsetHolder: OffsetHolder): Iterable<T> {
    for (;;) {
      const el = this.elementFormat.decodeFrom(source, offsetHolder);
      if (this.isTerminator(el)) break;
      yield el;
    }
  }
  createEncodingStream(): Duplex<Iterable<T>, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, Iterable<T>> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: Iterable<T>): number {
    let byteLength = 0;
    for (const el of value) byteLength += this.elementFormat.measureByteLength(el);
    byteLength += this.elementFormat.measureByteLength(this.createTerminator());
    return byteLength;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: Iterable<T>): void {
    for (const el of value) {
      this.elementFormat.encodeTo(target, offsetHolder, el);
    }
    this.elementFormat.encodeTo(target, offsetHolder, this.createTerminator());
  }
}

class GreedySequenceImpl<T> implements GreedySequence<T> {
  constructor(
      readonly elementFormat: NonGreedyFormat<T>) {
  }
  get isGreedy(): true { return true; }
  createEncodingStream(): Duplex<Iterable<T>, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, Iterable<T>> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: Iterable<T>): number {
    let byteLength = 0;
    for (const el of value) byteLength += this.elementFormat.measureByteLength(el);
    return byteLength;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: Iterable<T>): void {
    for (const el of value) {
      this.elementFormat.encodeTo(target, offsetHolder, el);
    }
  }
}

export function createGreedySequence<T>(elementFormat:NonGreedyFormat<T>): GreedySequence<T> {
  return new GreedySequenceImpl<T>(elementFormat);
}

class FixedCountSequenceImpl<T> implements NonGreedySequence<T> {
  constructor(
      readonly fixedCount: number,
      readonly elementFormat: NonGreedyFormat<T>) {
  }
  get isGreedy(): false { return false; }
  get minByteLength() { return this.elementFormat.minByteLength * this.fixedCount; }
  get maxByteLength() { return this.elementFormat.maxByteLength * this.fixedCount; }
  findEndOffset(source: Buffer, offset: number): number {
    if (this.elementFormat.minByteLength === this.elementFormat.maxByteLength) {
      return offset + this.elementFormat.minByteLength * this.fixedCount;
    }
    for (let i = 0; i < this.fixedCount; i++) {
      offset = this.elementFormat.findEndOffset(source, offset);
    }
    return offset;
  }
  *decodeFrom(source: Buffer, offsetHolder: OffsetHolder): Iterable<T> {
    for (let i = 0; i < this.fixedCount; i++) {
      yield this.elementFormat.decodeFrom(source, offsetHolder);
    }
  }
  createEncodingStream(): Duplex<Iterable<T>, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, Iterable<T>> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: Iterable<T>): number {
    if (this.elementFormat.minByteLength === this.elementFormat.maxByteLength) {
      return this.elementFormat.minByteLength * this.fixedCount;
    }
    let byteLength = 0;
    for (const element of value) {
      byteLength += this.elementFormat.measureByteLength(element);
    }
    return byteLength;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: Iterable<T>): void {
    for (const element of value) {
      this.elementFormat.encodeTo(target, offsetHolder, element);
    }
  }
}

export function createFixedCountSequence<TElement> (
  fixedCount:number,
  elementFormat: NonGreedyFormat<TElement>
): FixedCountSequence<TElement> {
  return new FixedCountSequenceImpl(fixedCount, elementFormat);
}

class CountPrefixSequenceImpl<TElement> implements CountPrefixSequence<TElement> {
  constructor(
      readonly countFormat: NonGreedyFormat<number>,
      readonly elementFormat: NonGreedyFormat<TElement>,
      readonly minCount: number,
      readonly maxCount: number) {
  }
  get isGreedy(): false { return false; }
  get minByteLength() {
    return this.countFormat.measureByteLength(this.minCount)
      + this.elementFormat.minByteLength * this.minCount;
  }
  get maxByteLength() {
    return this.countFormat.measureByteLength(this.maxCount)
      + this.elementFormat.maxByteLength * this.maxCount;
  }
  findEndOffset(source: Buffer, offset: number): number {
    const afterCount = this.countFormat.findEndOffset(source, offset);
    if (afterCount < 0) return afterCount;
    if (afterCount > source.length) return -afterCount;
    let offsetHolder = {offset};
    let count = this.countFormat.decodeFrom(source, offsetHolder);
    if (this.elementFormat.minByteLength === this.elementFormat.maxByteLength) {
      return afterCount + this.elementFormat.minByteLength * count;
    }
    while (count-- > 0) {
      offset = this.elementFormat.findEndOffset(source, offset);
    }
    return offset;
  }
  *decodeFrom(source: Buffer, offsetHolder: OffsetHolder): Iterable<TElement> {
    let count = this.countFormat.decodeFrom(source, offsetHolder);
    while (count-- > 0) {
      yield this.elementFormat.decodeFrom(source, offsetHolder);
    }
  }
  createEncodingStream(): Duplex<Iterable<TElement>, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, Iterable<TElement>> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: Iterable<TElement>): number {
    let count = 0;
    let byteLength = 0;
    for (const element of value) {
      count++;
      byteLength += this.elementFormat.measureByteLength(element);
    }
    return this.countFormat.measureByteLength(count) + byteLength;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: Iterable<TElement>): void {
    const values = [...value];
    this.countFormat.encodeTo(target, offsetHolder, values.length);
    for (const element of values) {
      this.elementFormat.encodeTo(target, offsetHolder, element);
    }
  }
}

export function createCountPrefixSequence<TElement>(
  countFormat: NonGreedyFormat<number>,
  elementFormat: NonGreedyFormat<TElement>,
  minCount: number,
  maxCount: number
): CountPrefixSequence<TElement> {
  return new CountPrefixSequenceImpl(countFormat, elementFormat, minCount, maxCount);
}

type TypedArray = Uint8Array | Int8Array | Uint8ClampedArray | Uint16Array | Int16Array |
  Int32Array | Uint32Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array;

type TypedArrayConstructor
  = Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int8ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;

export abstract class FixedCountTypedArray<
  TTypedArray extends TypedArray & {[i:number]: numeric_t},
  numeric_t extends number|bigint = number
>
implements NonGreedyFormat<TTypedArray>, Sequence<numeric_t> {
  constructor(
      readonly ArrayType: {
        new(length:number): TTypedArray;
        new(buffer:ArrayBuffer, offset:number, length:number): TTypedArray;
        BYTES_PER_ELEMENT: number;
      },
      readonly fixedCount: number) {
  }
  get isGreedy(): false { return false; }
  get minByteLength() { return this.ArrayType.BYTES_PER_ELEMENT * this.fixedCount; }
  get maxByteLength() { return this.ArrayType.BYTES_PER_ELEMENT * this.fixedCount; }
  initArray(array:TTypedArray) { }
  findEndOffset(_: Buffer, startOffset: number): number {
    return startOffset + this.ArrayType.BYTES_PER_ELEMENT * this.fixedCount;
  }
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): TTypedArray {
    const array = new this.ArrayType(
      source.buffer,
      source.byteOffset + offsetHolder.offset,
      this.fixedCount);
    offsetHolder.offset += this.ArrayType.BYTES_PER_ELEMENT * this.fixedCount;
    return array; // TODO: slice
  }
  createEncodingStream(): Duplex<TTypedArray, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, TTypedArray> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: TTypedArray): number {
    return value.length * this.ArrayType.BYTES_PER_ELEMENT;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: TTypedArray): void {
    Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(target, offsetHolder.offset);
    offsetHolder.offset += value.byteLength;
  }
  elementFormat: NonGreedyFormat<numeric_t>;
}

export class FixedCountUint8Array extends FixedCountTypedArray<Uint8Array> {
  constructor(fixedCount:number) {
    super(Uint8Array, fixedCount);
  }
}

export class FixedCountInt8Array extends FixedCountTypedArray<Int8Array> {
  constructor(fixedCount:number) {
    super(Int8Array, fixedCount);
  }
}

export class FixedCountUint16LEArray extends FixedCountTypedArray<Uint16Array> {
  constructor(fixedCount:number) { super(Uint16Array, fixedCount); }
}

export class FixedCountUint16BEArray extends FixedCountTypedArray<Uint16Array> {
  constructor(fixedCount:number) { super(Uint16Array, fixedCount); }
}

export class FixedCountInt16LEArray extends FixedCountTypedArray<Int16Array> {
  constructor(fixedCount:number) { super(Int16Array, fixedCount); }
}

export class FixedCountInt16BEArray extends FixedCountTypedArray<Int16Array> {
  constructor(fixedCount:number) { super(Int16Array, fixedCount); }
}

export class FixedCountUint32LEArray extends FixedCountTypedArray<Uint32Array> {
  constructor(fixedCount:number) { super(Uint32Array, fixedCount); }
}

export class FixedCountUint32BEArray extends FixedCountTypedArray<Uint32Array> {
  constructor(fixedCount:number) { super(Uint32Array, fixedCount); }
}

export class FixedCountInt32LEArray extends FixedCountTypedArray<Int32Array> {
  constructor(fixedCount:number) { super(Int32Array, fixedCount); }
}

export class FixedCountInt32BEArray extends FixedCountTypedArray<Int32Array> {
  constructor(fixedCount:number) { super(Int32Array, fixedCount); }
}

export class FixedCountFloat32LEArray extends FixedCountTypedArray<Float32Array> {
  constructor(fixedCount:number) { super(Float32Array, fixedCount); }
}

export class FixedCountFloat32BEArray extends FixedCountTypedArray<Float32Array> {
  constructor(fixedCount:number) { super(Float32Array, fixedCount); }
}

export class FixedCountFloat64LEArray extends FixedCountTypedArray<Float64Array> {
  constructor(fixedCount:number) { super(Float64Array, fixedCount); }
}

export class FixedCountFloat64BEArray extends FixedCountTypedArray<Float64Array> {
  constructor(fixedCount:number) { super(Float64Array, fixedCount); }
}

export class FixedCountBigUint64LEArray extends FixedCountTypedArray<BigUint64Array, bigint> {
  constructor(fixedCount:number) { super(BigUint64Array, fixedCount); }
}

export class FixedCountBigUint64BEArray extends FixedCountTypedArray<BigUint64Array, bigint> {
  constructor(fixedCount:number) { super(BigUint64Array, fixedCount); }
}

export class FixedCountBigInt64LEArray extends FixedCountTypedArray<BigInt64Array, bigint> {
  constructor(fixedCount:number) { super(BigInt64Array, fixedCount); }
}

export class FixedCountBigInt64BEArray extends FixedCountTypedArray<BigInt64Array, bigint> {
  constructor(fixedCount:number) { super(BigInt64Array, fixedCount); }
}

const swap16 = (array:Int16Array | Uint16Array) => {
  Buffer.from(array.buffer, array.byteOffset, array.byteLength).swap16();
};

const swap32 = (array:Int32Array | Uint32Array | Float32Array) => {
  Buffer.from(array.buffer, array.byteOffset, array.byteLength).swap32();
};

const swap64 = (array:BigInt64Array | BigUint64Array | Float64Array) => {
  Buffer.from(array.buffer, array.byteOffset, array.byteLength).swap64();
};

if (new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1) {
  // little endian
  FixedCountUint16BEArray.prototype.initArray
  = FixedCountInt16BEArray.prototype.initArray
  = swap16;

  FixedCountUint32BEArray.prototype.initArray
  = FixedCountInt32BEArray.prototype.initArray
  = FixedCountFloat32BEArray.prototype.initArray
  = swap32;

  FixedCountBigUint64BEArray.prototype.initArray
  = FixedCountBigInt64BEArray.prototype.initArray
  = FixedCountFloat64BEArray.prototype.initArray
  = swap64;
}
else {
  // big endian
  FixedCountUint16LEArray.prototype.initArray
  = FixedCountInt16LEArray.prototype.initArray
  = swap16;

  FixedCountUint32LEArray.prototype.initArray
  = FixedCountInt32LEArray.prototype.initArray
  = FixedCountFloat32LEArray.prototype.initArray
  = swap32;

  FixedCountBigUint64LEArray.prototype.initArray
  = FixedCountBigInt64LEArray.prototype.initArray
  = FixedCountFloat64LEArray.prototype.initArray
  = swap64;
}

abstract class FixedLengthFormatImpl<T> implements NonGreedyFormat<T> {
  constructor(
    readonly fixedByteLength:number) {
  }
  get minByteLength() { return this.fixedByteLength; }
  get maxByteLength() { return this.fixedByteLength; }
  get isGreedy(): false { return false; }
  findEndOffset(_: Buffer, startOffset: number): number {
    return startOffset + this.fixedByteLength;
  }
  measureByteLength(_: T): number {
    return this.fixedByteLength;
  }
  abstract read(source:Buffer, offset:number): T;
  abstract write(target:Buffer, offset:number, value:T): void;
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): T {
    const v = this.read(source, offsetHolder.offset);
    offsetHolder.offset += this.fixedByteLength;
    return v;
  }
  createEncodingStream(): Duplex<T, Buffer> {
    const len = this.fixedByteLength;
    return new Transform({
      transform(chunk, _, callback) {
        const buf = Buffer.alloc(len);
        this.write(buf, 0, chunk);
        callback(null, buf);
      },
    });
  }
  createDecodingStream(): Duplex<Buffer, T> {
    const overflow = Buffer.alloc(this.fixedByteLength);
    const len = this.fixedByteLength;
    const self = this;
    let overflowOffset = 0;
    return new Transform({
      transform(buffer, _, callback) {
        if (overflowOffset > 0) {
          const copied = buffer.copy(overflow, overflowOffset);
          if ((overflowOffset += copied) < len) {
            return;
          }
          this.push(self.read(buffer, 0));
          overflowOffset = 0;
          buffer = buffer.subarray(copied);
        }
        const crop = buffer.length % len;
        if (crop) {
          overflowOffset += buffer.copy(overflow, 0, buffer.length - crop);
          buffer = buffer.subarray(0, buffer.length - crop);
        }
        for (let i = 0; i < buffer.length; i += len) {
          this.push(self.read(buffer, i));
        }
        callback();
      },
      flush(callback) {
        if (overflowOffset > 0) {
          callback(new Error('unexpected bytes: ' + overflowOffset));
        }
        else {
          callback();
        }
      },
    });
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: T): void {
    this.write(target, offsetHolder.offset, value);
    offsetHolder.offset += this.fixedByteLength;
  }
}

export const UINT8 = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(1); }
  read(source: Buffer, offset: number): number { return source[offset]; }
  write(target: Buffer, offset: number, value: number): void { target[offset] = value; }
  get minValue() { return 0x00; }
  get maxValue() { return 0xff; }
})();

export const INT8 = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(1); }
  read(source: Buffer, offset: number): number { return source[offset] << 24 >> 24; }
  write(target: Buffer, offset: number, value: number): void { target[offset] = value; }
  get minValue() { return -0x80; }
  get maxValue() { return  0x7f; }
})();

export const UINT8_CLAMPED = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(1); }
  read(source: Buffer, offset: number): number { return source[offset]; }
  write(target: Buffer, offset: number, value: number): void { target[offset] = Math.min(255, Math.max(0, value)); }
  get minValue() { return 0x00; }
  get maxValue() { return 0xff; }
})();

export const UINT16BE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(2); }
  read(source: Buffer, offset: number): number { return source.readUInt16BE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeUInt16BE(value, offset); }
  get minValue() { return 0x0000; }
  get maxValue() { return 0xffff; }
})();

export const UINT16LE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(2); }
  read(source: Buffer, offset: number): number { return source.readUInt16LE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeUInt16LE(value, offset); }
  get minValue() { return 0x0000; }
  get maxValue() { return 0xffff; }
})();

export const INT16BE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(2); }
  read(source: Buffer, offset: number): number { return source.readInt16BE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeInt16BE(value, offset); }
  get minValue() { return -0x8000; }
  get maxValue() { return  0x7fff; }
})();

export const INT16LE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(2); }
  read(source: Buffer, offset: number): number { return source.readInt16LE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeInt16LE(value, offset); }
  get minValue() { return -0x8000; }
  get maxValue() { return  0x7fff; }
})();

export const UINT32BE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(4); }
  read(source: Buffer, offset: number): number { return source.readUInt32BE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeUInt32BE(value, offset); }
  get minValue() { return 0x00000000; }
  get maxValue() { return 0xffffffff; }
})();

export const UINT32LE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(4); }
  read(source: Buffer, offset: number): number { return source.readUInt32LE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeUInt32LE(value, offset); }
  get minValue() { return 0x00000000; }
  get maxValue() { return 0xffffffff; }
})();

export const INT32BE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(4); }
  read(source: Buffer, offset: number): number { return source.readInt32BE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeInt32BE(value, offset); }
  get minValue() { return -0x80000000; }
  get maxValue() { return  0x7fffffff; }
})();

export const INT32LE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(4); }
  read(source: Buffer, offset: number): number { return source.readInt32LE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeInt32LE(value, offset); }
  get minValue() { return -0x80000000; }
  get maxValue() { return  0x7fffffff; }
})();

export const FLOAT32BE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(4); }
  read(source: Buffer, offset: number): number { return source.readFloatBE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeFloatBE(value, offset); }
})();

export const FLOAT32LE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(4); }
  read(source: Buffer, offset: number): number { return source.readFloatLE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeFloatLE(value, offset); }
})();

export const FLOAT64BE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(8); }
  read(source: Buffer, offset: number): number { return source.readDoubleBE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeDoubleBE(value, offset); }
})();

export const FLOAT64LE = new (class extends FixedLengthFormatImpl<number> {
  constructor() { super(8); }
  read(source: Buffer, offset: number): number { return source.readDoubleLE(offset); }
  write(target: Buffer, offset: number, value: number): void { target.writeDoubleLE(value, offset); }
})();

export const BIGUINT64BE = new (class extends FixedLengthFormatImpl<bigint> {
  constructor() { super(8); }
  read(source: Buffer, offset: number): bigint { return source.readBigUInt64BE(offset); }
  write(target: Buffer, offset: number, value: bigint): void { target.writeBigUInt64BE(value, offset); }
  get minValue() { return 0x0000000000000000n; }
  get maxValue() { return 0xffffffffffffffffn; }
})();

export const BIGUINT64LE = new (class extends FixedLengthFormatImpl<bigint> {
  constructor() { super(8); }
  read(source: Buffer, offset: number): bigint { return source.readBigUInt64LE(offset); }
  write(target: Buffer, offset: number, value: bigint): void { target.writeBigUInt64LE(value, offset); }
  get minValue() { return 0x0000000000000000n; }
  get maxValue() { return 0xffffffffffffffffn; }
})();

export const BIGINT64BE = new (class extends FixedLengthFormatImpl<bigint> {
  constructor() { super(8); }
  read(source: Buffer, offset: number): bigint { return source.readBigInt64BE(offset); }
  write(target: Buffer, offset: number, value: bigint): void { target.writeBigInt64BE(value, offset); }
  get minValue() { return -0x8000000000000000n; }
  get maxValue() { return  0x7fffffffffffffffn; }
})();

export const BIGINT64LE = new (class extends FixedLengthFormatImpl<bigint> {
  constructor() { super(8); }
  read(source: Buffer, offset: number): bigint { return source.readBigInt64LE(offset); }
  write(target: Buffer, offset: number, value: bigint): void { target.writeBigInt64LE(value, offset); }
  get minValue() { return -0x8000000000000000n; }
  get maxValue() { return  0x7fffffffffffffffn; }
})();

class AlignedFormatImpl<T> implements NonGreedyFormat<T> {
  constructor(
    readonly innerFormat: NonGreedyFormat<T>,
    readonly padAlignment: number
  ) {
  }
  get isGreedy(): false { return false; }
  get minByteLength() { return Math.ceil(this.innerFormat.minByteLength/this.padAlignment) * this.padAlignment; }
  get maxByteLength() { return Math.ceil(this.innerFormat.maxByteLength/this.padAlignment) * this.padAlignment; }
  findEndOffset(source: Buffer, startOffset: number): number {
    const endOffset = this.innerFormat.findEndOffset(source, startOffset);
    if (endOffset < 0) return endOffset;
    return Math.ceil(endOffset/this.padAlignment) * this.padAlignment;
  }
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): T {
    const startOffset = offsetHolder.offset;
    const v = this.innerFormat.decodeFrom(source, offsetHolder);
    offsetHolder.offset = startOffset + Math.ceil((offsetHolder.offset - startOffset)/this.padAlignment)*this.padAlignment;
    return v;
  }
  createEncodingStream(): Duplex<T, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, T> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: T): number {
    return Math.ceil(this.innerFormat.measureByteLength(value) / this.padAlignment) * this.padAlignment;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: T): void {
    const startOffset = offsetHolder.offset;
    this.innerFormat.encodeTo(target, offsetHolder, value);
    offsetHolder.offset = startOffset + Math.ceil((offsetHolder.offset - startOffset)/this.padAlignment)*this.padAlignment;
  }
}

export function getAlignedFormat<T>(innerFormat:NonGreedyFormat<T>, padAlignment:number): NonGreedyFormat<T> {
  padAlignment = Math.max(1, Math.floor(padAlignment));
  if (innerFormat.minByteLength === innerFormat.maxByteLength) {
    if (innerFormat.minByteLength%padAlignment === 0) return innerFormat;
  }
  return new AlignedFormatImpl(innerFormat, padAlignment);
}

export class ExactMatchBytes implements NonGreedyFormat<boolean> {
  constructor(source:Buffer);
  constructor(source:string, encoding?: BufferEncoding);
  constructor(source:Buffer | string, encoding?: BufferEncoding) {
    if (typeof source === 'string') {
      this.source = Buffer.from(source, encoding);
    }
    else {
      this.source = source;
    }
    if (this.source.length === 0) {
      throw new Error('match buffer must be at least 1 byte long');
    }
  }
  readonly source: Buffer;
  decodeFrom(source:Buffer, offsetHolder:OffsetHolder): boolean {
    offsetHolder.offset += this.source.length;
    return source.subarray(offsetHolder.offset - this.source.length, offsetHolder.offset).equals(source);
  }
  get isGreedy(): false { return false; }
  get minByteLength(): number { return this.source.length; }
  get maxByteLength(): number { return this.source.length; }
  findEndOffset(_: Buffer, startOffset: number): number {
    return startOffset + this.source.length;
  }
  createEncodingStream(): Duplex<boolean, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, boolean> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(_: boolean): number {
    return this.source.length;
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: boolean): void {
    if (!value) {
      target.fill(this.source[0] ? 0 : 0xff, offsetHolder.offset, offsetHolder.offset + this.source.length);
    }
    else {
      this.source.copy(target, offsetHolder.offset);
      offsetHolder.offset += this.source.length;
    }
  }
}

export class ExactMatch<T> implements NonGreedyFormat<boolean> {
  constructor(
    readonly innerFormat: NonGreedyFormat<T>,
    readonly matchValue: T,
    readonly nonMatchValue: T
  ) {
  }
  get isGreedy(): false { return false; }
  get minByteLength() { return this.innerFormat.minByteLength; }
  get maxByteLength() { return this.innerFormat.maxByteLength; }
  findEndOffset(source: Buffer, startOffset: number): number {
    return this.innerFormat.findEndOffset(source, startOffset);
  }
  decodeFrom(source: Buffer, offsetHolder: OffsetHolder): boolean {
    return this.innerFormat.decodeFrom(source, offsetHolder) === this.matchValue;
  }
  createEncodingStream(): Duplex<boolean, Buffer> {
    throw new Error("Method not implemented.");
  }
  createDecodingStream(): Duplex<Buffer, boolean> {
    throw new Error("Method not implemented.");
  }
  measureByteLength(value: boolean): number {
    return this.innerFormat.measureByteLength(value ? this.matchValue : this.nonMatchValue);
  }
  encodeTo(target: Buffer, offsetHolder: OffsetHolder, value: boolean): void {
    this.innerFormat.encodeTo(target, offsetHolder, value ? this.matchValue : this.nonMatchValue);
  }

}
