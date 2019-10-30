
import TypedEventEmitter from 'typed-emitter'

interface ReadableMembers<TChunk> {
  destroy(err?: Error): this;
  readonly destroyed : boolean;
  isPaused(): boolean;
  pause(): this;
  pipe<T extends Writable<TChunk>>(destination: T, options?: {end?: boolean}) : T;
  read(size?: number): TChunk | null;
  readonly readable: boolean;
  readonly readableEncoding?: string | null;
  readonly readableEnded: boolean;
  readonly readableFlowing: boolean;
  readonly readableHighWaterMark: number;
  readonly readableLength: number;
  readonly readableObjectMode: boolean;
  resume(): this;
  setEncoding(encoding: string): this;
  unpipe(destination?: Writable<TChunk>): this;
  unshift(chunk:TChunk, encoding?: string): void;
  [Symbol.asyncIterator](): AsyncIterator<TChunk>;
}

interface ReadableEvents<TChunk> {
  close: () => void;
  data: (chunk:TChunk) => void;
  end: () => void;
  error: (error:Error) => void;
  pause: () => void;
  readable: () => void;
  resume: () => void;
}

export type Readable<TChunk = Buffer|string>
  = ReadableMembers<TChunk> & TypedEventEmitter<ReadableEvents<TChunk>>;

export const Readable: {
  prototype: Readable<any>,
  new<T>(options?: {
    highWaterMark?: number,
    encoding?: string,
    objectMode?: boolean,
    emitClose?: boolean,
    read?: (size:number) => void,
    destroy?: (error: Error|null, callback :(error?: Error) => void) => void,
    autoDestroy?: boolean,
  }): Readable<T>,
};

interface WritableMembers<TChunk> {
  cork(): void;
  destroy(err?: Error): this;
  readonly destroyed: boolean;
  end(chunk:TChunk, encoding?: string, callback?: () => void): void;
  end(callback?: () => void): void;
  setDefaultEncoding(encoding: string): this;
  uncork(): void;
  readonly writable: boolean;
  readonly writableEnded: boolean;
  readonly writableFinished: boolean;
  readonly writableHighWaterMark: number;
  readonly writableLength: number;
  readonly writableObjectMode: boolean;
  write(chunk:TChunk, encoding?: string, callback?: () => void): boolean;
}

interface WritableEvents<TChunk> {
  close: () => void;
  drain: () => void;
  error: (error:Error) => void;
  finish: () => void;
  pipe: (stream:Readable<TChunk>) => void;
  unpipe: (stream:Readable<TChunk>) => void;
}

export type Writable<TChunk = Buffer|string>
  = WritableMembers<TChunk> & TypedEventEmitter<WritableEvents<TChunk>>;

export const Writable: {
  prototype: Writable<any>,
  new<T>(options?: {
    highWaterMark?: number,
    decodeStrings?: boolean,
    defaultEncoding?: string,
    objectMode?: boolean,
    emitClose?: boolean,
    write?: (chunk: T, encoding: string, callback: (error?: Error) => void) => void,
    writev?: (chunks: Array<{chunk:T, encoding:string}>, callback: (error?: Error) => void) => void,
    destroy?: (err:Error | null, callback: (error?: Error) => void) => void,
    final?: (callback: (error?: Error) => void) => void,
    autoDestroy?: boolean,
  }): Writable<T>,
};

export type Duplex<TIn=Buffer|string, TOut=Buffer|string>
  = WritableMembers<TIn> & ReadableMembers<TOut>
    & TypedEventEmitter<ReadableEvents<TIn> & WritableEvents<TOut>>;

export const Duplex: {
  prototype: Duplex<any, any>,
  new<T1,T2>(): Duplex<T1,T2>,
}

export interface Transform<TIn=Buffer|string, TOut=Buffer|string> extends Duplex<TIn,TOut> {

}

export const Transform: {
  prototype: Duplex<any, any>,
  new<T1,T2>(options?: {
    transform?: (chunk: T1, encoding: string, callback: (error?: Error|null, value?: T2) => void) => void,
    flush?: (callback: (error?: Error|null, value?: T2) => void) => void,
  }): Duplex<T1,T2>,
}
