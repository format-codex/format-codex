
import { promisify } from 'util'
import { createReadStream, createWriteStream, promises, opendir, stat } from 'fs'
import { FileSystem, createFileSystemInterface } from './index'
import { Readable, Writable } from './typed-streams'
import { resolve } from 'path'

const opendir_p = promisify(opendir)
const stat_p = promisify(stat);

const FS: FileSystem = {
  readFile(this: void, path: string): Promise<Buffer> {
    return promises.readFile(path);
  },
  writeFile(this: void, path: string, data: Buffer): Promise<void> {
    return promises.writeFile(path, data);
  },
  createReadStream(this: void, path: string): Readable<Buffer> {
    return <unknown>createReadStream(path) as Readable<Buffer>;
  },
  createWriteStream(this: void, path: string): Writable<Buffer> {
    return <unknown>createWriteStream(path) as Writable<Buffer>;
  },
  getParentPath(this: void, childPath: string): Promise<string> {
    return Promise.resolve(resolve(childPath, '..'));
  },
  async *eachChildPath(this: void, parentPath: string): AsyncIterator<string> {
    for await (const dirent of await opendir_p(parentPath)) {
      yield dirent.name;
    }
  },
  async getFileSize(this: void, path: string): Promise<number | bigint> {
    return (await stat_p(path, {bigint:true})).size;
  },
};

export = FS;
