'use strict';
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('craveDesktop', {
  isDesktop: true,
  platform: process.platform
});
