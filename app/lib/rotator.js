'use strict';

const assert = require('assert');
const fs = require('mz/fs');
const debug = require('debug')('egg-logrotator:rotator');


class Rotator {

  constructor(options) {
    this.options = options || {};
    assert(this.options.app, 'options.app is required');
    this.app = this.options.app;
    this.logger = this.app.coreLogger;
  }

  getRotateFiles() {
    throw new Error('not implement');
  }

  * rotate() {
    const files = yield this.getRotateFiles();
    assert(files instanceof Map, 'getRotateFiles should return a Map');
    const rotatedFile = [];
    for (const file of files.values()) {
      try {
        debug('rename from %s to %s', file.srcPath, file.targetPath);
        yield renameOrDelete(file.srcPath, file.targetPath);
        rotatedFile.push(`${file.srcPath} -> ${file.targetPath}`);
      } catch (err) {
        err.message = `[egg-logrotator] rename ${file.srcPath}, found exception: ` + err.message;
        this.logger.error(err);
      }
    }

    // 因为tafnode中只有worker定时任务, 所有存在多个worker同时操作日志的竞争情况, 此时只有一个worker能够更新日志, 但其他所有的worker都需要重新加载日志    
    // if (rotatedFile.length) { 
      // tell every one to reload logger
    this.logger.info('[egg-logrotator] broadcast log-reload');
    this.app.messenger.sendToApp('log-reload');
    this.app.messenger.sendToAgent('log-reload');
    // }

    this.logger.info('[egg-logrotator] rotate files success by %s, files %j',
      this.constructor.name, rotatedFile);
  }
}

module.exports = Rotator;

// rename from srcPath to targetPath, for example foo.log.1 > foo.log.2
function* renameOrDelete(srcPath, targetPath) {
  if (srcPath === targetPath) {
    return;
  }
  const srcExists = yield fs.exists(srcPath);
  if (!srcExists) {
    return;
  }
  const targetExists = yield fs.exists(targetPath);
  // if target file exists, then throw
  // because the target file always be renamed first.
  // 因为nodinx是单进程的设计, 所以每个worker都会执行日志切割, 此时如果有一个worker切割完了, 
  // 就会导致其他的进程报下面的错误
  if (targetExists) {
    // const err = new Error(`targetFile ${targetPath} exists!!!`);
    // throw err;
    return;
  }
  yield fs.rename(srcPath, targetPath);
}
