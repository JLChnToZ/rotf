'use strict';
import fs from 'fs';
import path from 'path';

const defaultOptions = {
  encoding: 'utf8',
  method: 'native',
  deferred: false,
  resume: false,
  forceReload: false,
  interval: 5000,
  reloadDelay: 100,
},
proxyHandler = Object.getOwnPropertyNames(Reflect).reduce((handler, trap) => {
  const applyTrap = Function.prototype.apply.bind(Reflect[trap], null);
  handler[trap] = function(target) {
    arguments[0] = target.value;
    return applyTrap(arguments);
  };
  return handler;
}, {}),
primitiveTypeNames = ['undefined', 'boolean', 'number', 'string', 'symbol'],
deferredResolver = {
  get() {
    Object.defineProperty(this, 'value', preventCircular);
    return Object.defineProperties(this, {
      value: { value: Wrapper.wrap(this.resolved()) },
      resolved: { value: undefined }
    }).value;
  },
  configurable: true
},
preventCircular = {
  get() {
    throw new ReferenceError('Deferred object is not yet resolved');
  },
  configurable: true
},
globalProps = {
  enabled: true
},
extensions = {
  stopTrackAll,
  stopTrack(module) {
    const resolvedName = this.resolve(module);
    if(resolvedName in handlerCache)
      handlerCache[resolvedName].raw.stop();
  },
  resumeTrack(module, forceReload) {
    if(!globalProps.enabled) return;
    const resolvedName = this.resolve(module);
    if(resolvedName in handlerCache)
      handlerCache[resolvedName].raw.resume(forceReload);
  },
  unload(module, clean, deep) {
    unload(this.resolve(module), clean && this.cache, deep);
  }
},
extensionProps = {
  enabled: {
    get() { return globalProps.enabled },
    set(value) {
      globalProps.enabled = value;
      if(!value) stopTrackAll();
    }
  }
},
handlerCache = {},
handlingPaths = new Set();

class Wrapper {
  constructor(value) { this.value = value; }
  valueOf() { return this.value; }
  toJSON() { return this.value; }
  toString() { return this.value.toString(); }
  static isWrapable(value) {
    return value === null || primitiveTypeNames.indexOf(typeof value) >= 0;
  }
  static wrap(value) {
    return Wrapper.isWrapable(value) ? new Wrapper(value) : value;
  }
}

class RequireOTFHandler {
  constructor(require, module, resolvedName, options) {
    Object.assign(this, defaultOptions, options, {
      require, module, resolvedName,
      fileChanged: this.fileChanged.bind(this)
    });
    if(this.deferred) this.deferHandled = true;
  }
  stop() {
    this.stopped = true;
    if(!('watcher' in this)) return;
    if(typeof this.watcher === 'string')
      fs.unwatchFile(this.watcher, this.fileChanged);
    else
      this.watcher.close();
    delete this.watcher;
  }
  resume(forceReload) {
    this.stop();
    this.stopped = false;
    const { require, method, resolvedName, fileChanged } = this;
    switch(method) {
      case 'native':
        this.resolvedBaseName = path.basename(resolvedName);
        this.watcher = fs.watch(resolvedName, fileChanged);
        break;
      case 'polling':
        this.watcher = resolvedName;
        fs.watchFile(resolvedName, this, fileChanged);
        break;
    }
    if(forceReload) this.forceReload();
  }
  forceReload() {
    if(this.updateFileLock || this.deferHandled) return;
    this.updateFileLock = true;
    this.stopDeferredFileChanged();
    const { require, module, resolvedName, onload, onunload, rawValue, wrappedValue } = this,
      allCache = require.cache,
      reload = resolvedName in allCache,
      currentCache = allCache[resolvedName];
    try {
      if(reload)
        tryCall(onunload, this.rawValue);
      delete this.wrappedValue;
      delete allCache[resolvedName];
      this.rawValue = require(module);
      this.wrappedValue = Wrapper.wrap(this.rawValue);
      tryCall(onload, this.rawValue);
    } catch(err) {
      if(reload) {
        allCache[resolvedName] = currentCache;
        this.rawValue = rawValue;
        this.wrappedValue = wrappedValue;
      }
      console.error(err.stack || err);
    } finally {
      this.updateFileLock = false;
    }
  }
  fileChanged(a, b, deferred) {
    const { reloadDelay, resolvedBaseName, fileChanged, updateFileLock } = this;
    if((a instanceof fs.Stats) ?
      a.mtime === b.mtime :
      b !== resolvedBaseName)
      return;
    if(reloadDelay) {
      this.stopDeferredFileChanged();
      if(!deferred && !updateFileLock) {
        this.fileChangeTimeout = setTimeout(fileChanged, reloadDelay, a, b, true);
        return;
      }
    }
    this.forceReload();
  }
  stopDeferredFileChanged() {
    if(!this.fileChangeTimeout) return;
    clearTimeout(this.fileChangeTimeout);
    delete this.fileChangeTimeout;
  }
  get value() {
    if(!('wrappedValue' in this)) {
      if(this.updateFileLock)
        throw new ReferenceError('Object is not yet resolved.');
      if(!this.deferHandled) this.forceReload();
      else {
        this.deferHandled = false;
        if(this.stopped) this.forceReload();
        else this.resume(true);
      }
    }
    return this.wrappedValue;
  }
}

function tryCall(fn, arg) {
  try {
    if(typeof fn === 'function')
      fn.call(null, arg);
  } catch(err) {
    console.error(err.stack || err);
  }
}

function unload(resolvedName, cache, deep) {
  if(resolvedName in handlerCache) {
    const { revoke, raw } = handlerCache[resolvedName];
    try {
      if(cache && (typeof raw.onunload === 'function'))
        raw.onunload.call(null, raw.rawValue);
    } finally {
      raw.stop();
      revoke();
      delete handlerCache[resolvedName];
    }
  }
  if(cache && (resolvedName in cache)) {
    if(deep) {
      const { children } = cache[resolvedName];
      for(let i = 0; i < children.length; i++)
        unload(children[i].fileName, cache, deep);
    }
    delete cache[resolvedName];
  }
}

function doRequire(module, resolvedName) {
  if(handlingPaths.has(resolvedName))
    throw new ReferenceError('Object is not yet resolved.');
  try {
    handlingPaths.add(resolvedName);
    return this(module);
  } finally {
    handlingPaths.delete(resolvedName);
  }
}

function doRequireOTF(module, options) {
  if(!enabled) return this(module);
  const resolvedName = this.resolve(module);
  if(!fs.existsSync(resolvedName))
    return (Wrapper.isWrapable(options) && options.deferred || handlingPaths.has(resolvedName)) ?
      new Proxy(Object.create(null, {
        value: deferredResolver,
        resolved: {
          value: doRequire.bind(this, module),
          configurable: true
        }
      }), proxyHandler) :
      doRequire.call(this, module);
  if(!(resolvedName in handlerCache)) {
    const raw = new RequireOTFHandler(this, module, resolvedName, options);
    handlerCache[resolvedName] = Object.assign({ raw }, Proxy.revocable(raw, proxyHandler));
    raw.resume(true);
  } else if(!Wrapper.isWrapable(options)) {
    if(options.resume)
      handlerCache[resolvedName].raw.resume(options.forceReload);
    else if(options.forceReload)
      handlerCache[resolvedName].raw.forceReload();
  }
  return handlerCache[resolvedName].proxy;
}

export function requireOTF(require) {
  return Object.defineProperties(Object.assign(doRequireOTF.bind(require), extensions, require), extensionProps);
}

export function stopTrackAll() {
  for(let key in handlerCache)
    handlerCache[resolvedName].raw.stop();
}
