import version from './version';

const logger = (debug: boolean): ((...msgs: any) => void) => {
  const log = (...msgs: any): void => {
    if (debug) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const hour = now.getHours();
      const min = now.getMinutes();
      const s = now.getSeconds();
      const nowString = `${year}-${month}-${day} ${hour}:${min}:${s}`;
      console.log(`[NRTCCalling Message ${version} ${nowString}]: `, ...msgs);
    }
  };

  return log;
};

export default logger;
