import { BaseOptions } from '../types/common';
import EventEmitter from 'eventemitter3';
import logger from '../utils/logger';

class BaseController extends EventEmitter {
  public log: any = null; // 打印日志
  public debug = true; // 是否开启日志

  constructor({ debug }: BaseOptions) {
    super();
    this.debug = debug;
    this.log = logger(debug);
  }
}

export default BaseController;
