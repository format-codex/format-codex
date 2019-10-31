
import { createReadStream, createWriteStream, promises } from 'fs'
import { createFileSystemInterface } from './index'
import { Readable, Writable } from './typed-streams'

export = createFileSystemInterface<string | Buffer | URL>({
  readFile: promises.readFile,
  writeFile: promises.writeFile,
  createReadStream: <unknown>createReadStream as (path:string | Buffer | URL) => Readable<Buffer>,
  createWriteStream: <unknown>createWriteStream as (path:string | Buffer | URL) => Writable<Buffer>,
});
