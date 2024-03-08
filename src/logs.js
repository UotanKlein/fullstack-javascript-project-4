import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

function getCurrentTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function getCurrentTimeStringForFile() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export default class Logs {
  constructor(savePath) {
    const logsDir = path.join(savePath, 'logs');

    fs.mkdir(logsDir, { recursive: true }, (error) => {
      if (error) {
        console.error('Error creating the logs directory:', error);
        throw error;
      }
    });

    this.savePath = logsDir;
    this.logs = [];
  }

  addLog(content) {
    this.logs.push(`${getCurrentTimeString()}: ${content}`);
  }

  toString() {
    return this.logs.reduce((acc, log) => `${acc}\n${log}`, '').slice(1);
  }

  async saveLogs(logName = 'log') {
    try {
      await fsp.writeFile(path.join(this.savePath, `${logName}-${getCurrentTimeStringForFile()}.log`), this.toString(), 'utf8');
    } catch (error) {
      console.error('Error reading the directory or saving the logs:', error);
      throw error;
    }
  }

  logsClear() {
    this.logs = [];
  }
}
