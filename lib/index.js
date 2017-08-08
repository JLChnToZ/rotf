'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.requireOTF = requireOTF;
exports.stopTrackAll = stopTrackAll;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var defaultOptions = {
  encoding: 'utf8',
  method: 'native',
  deferred: false,
  resume: false,
  forceReload: false,
  interval: 5000,
  reloadDelay: 100
},
    proxyHandler = Object.getOwnPropertyNames(Reflect).reduce(function (handler, trap) {
  var applyTrap = Function.prototype.apply.bind(Reflect[trap], null);
  handler[trap] = function (target) {
    arguments[0] = target.value;
    return applyTrap(arguments);
  };
  return handler;
}, {}),
    primitiveTypeNames = ['undefined', 'boolean', 'number', 'string', 'symbol'],
    deferredResolver = {
  get: function get() {
    Object.defineProperty(this, 'value', preventCircular);
    return Object.defineProperties(this, {
      value: { value: Wrapper.wrap(this.resolved()) },
      resolved: { value: undefined }
    }).value;
  },

  configurable: true
},
    preventCircular = {
  get: function get() {
    throw new ReferenceError('Deferred object is not yet resolved');
  },

  configurable: true
},
    globalProps = {
  enabled: true
},
    extensions = {
  stopTrackAll: stopTrackAll,
  stopTrack: function stopTrack(module) {
    var resolvedName = this.resolve(module);
    if (resolvedName in handlerCache) handlerCache[resolvedName].raw.stop();
  },
  resumeTrack: function resumeTrack(module, forceReload) {
    if (!globalProps.enabled) return;
    var resolvedName = this.resolve(module);
    if (resolvedName in handlerCache) handlerCache[resolvedName].raw.resume(forceReload);
  },
  unload: function unload(module, clean, deep) {
    _unload(this.resolve(module), clean && this.cache, deep);
  }
},
    extensionProps = {
  enabled: {
    get: function get() {
      return globalProps.enabled;
    },
    set: function set(value) {
      globalProps.enabled = value;
      if (!value) stopTrackAll();
    }
  }
},
    handlerCache = {},
    handlingPaths = new Set();

var Wrapper = function () {
  function Wrapper(value) {
    _classCallCheck(this, Wrapper);

    this.value = value;
  }

  _createClass(Wrapper, [{
    key: 'valueOf',
    value: function valueOf() {
      return this.value;
    }
  }, {
    key: 'toJSON',
    value: function toJSON() {
      return this.value;
    }
  }, {
    key: 'toString',
    value: function toString() {
      return this.value.toString();
    }
  }], [{
    key: 'isWrapable',
    value: function isWrapable(value) {
      return value === null || primitiveTypeNames.indexOf(typeof value === 'undefined' ? 'undefined' : _typeof(value)) >= 0;
    }
  }, {
    key: 'wrap',
    value: function wrap(value) {
      return Wrapper.isWrapable(value) ? new Wrapper(value) : value;
    }
  }]);

  return Wrapper;
}();

var RequireOTFHandler = function () {
  function RequireOTFHandler(require, module, resolvedName, options) {
    _classCallCheck(this, RequireOTFHandler);

    Object.assign(this, defaultOptions, options, {
      require: require, module: module, resolvedName: resolvedName,
      fileChanged: this.fileChanged.bind(this)
    });
    if (this.deferred) this.deferHandled = true;
  }

  _createClass(RequireOTFHandler, [{
    key: 'stop',
    value: function stop() {
      this.stopped = true;
      if (!('watcher' in this)) return;
      if (typeof this.watcher === 'string') _fs2.default.unwatchFile(this.watcher, this.fileChanged);else this.watcher.close();
      delete this.watcher;
    }
  }, {
    key: 'resume',
    value: function resume(forceReload) {
      this.stop();
      this.stopped = false;
      var require = this.require,
          method = this.method,
          resolvedName = this.resolvedName,
          fileChanged = this.fileChanged;

      switch (method) {
        case 'native':
          this.resolvedBaseName = _path2.default.basename(resolvedName);
          this.watcher = _fs2.default.watch(resolvedName, fileChanged);
          break;
        case 'polling':
          this.watcher = resolvedName;
          _fs2.default.watchFile(resolvedName, this, fileChanged);
          break;
      }
      if (forceReload) this.forceReload();
    }
  }, {
    key: 'forceReload',
    value: function forceReload() {
      if (this.updateFileLock || this.deferHandled) return;
      this.updateFileLock = true;
      this.stopDeferredFileChanged();
      var require = this.require,
          module = this.module,
          resolvedName = this.resolvedName,
          onload = this.onload,
          onunload = this.onunload,
          rawValue = this.rawValue,
          wrappedValue = this.wrappedValue,
          allCache = require.cache,
          reload = resolvedName in allCache,
          currentCache = allCache[resolvedName];

      try {
        if (reload) tryCall(onunload, this.rawValue);
        delete this.wrappedValue;
        delete allCache[resolvedName];
        this.rawValue = require(module);
        this.wrappedValue = Wrapper.wrap(this.rawValue);
        tryCall(onload, this.rawValue);
      } catch (err) {
        if (reload) {
          allCache[resolvedName] = currentCache;
          this.rawValue = rawValue;
          this.wrappedValue = wrappedValue;
        }
        console.error(err.stack || err);
      } finally {
        this.updateFileLock = false;
      }
    }
  }, {
    key: 'fileChanged',
    value: function fileChanged(a, b, deferred) {
      var reloadDelay = this.reloadDelay,
          resolvedBaseName = this.resolvedBaseName,
          fileChanged = this.fileChanged,
          updateFileLock = this.updateFileLock;

      if (a instanceof _fs2.default.Stats ? a.mtime === b.mtime : b !== resolvedBaseName) return;
      if (reloadDelay) {
        this.stopDeferredFileChanged();
        if (!deferred && !updateFileLock) {
          this.fileChangeTimeout = setTimeout(fileChanged, reloadDelay, a, b, true);
          return;
        }
      }
      this.forceReload();
    }
  }, {
    key: 'stopDeferredFileChanged',
    value: function stopDeferredFileChanged() {
      if (!this.fileChangeTimeout) return;
      clearTimeout(this.fileChangeTimeout);
      delete this.fileChangeTimeout;
    }
  }, {
    key: 'value',
    get: function get() {
      if (!('wrappedValue' in this)) {
        if (this.updateFileLock) throw new ReferenceError('Object is not yet resolved.');
        if (!this.deferHandled) this.forceReload();else {
          this.deferHandled = false;
          if (this.stopped) this.forceReload();else this.resume(true);
        }
      }
      return this.wrappedValue;
    }
  }]);

  return RequireOTFHandler;
}();

function tryCall(fn, arg) {
  try {
    if (typeof fn === 'function') fn.call(null, arg);
  } catch (err) {
    console.error(err.stack || err);
  }
}

function _unload(resolvedName, cache, deep) {
  if (resolvedName in handlerCache) {
    var _handlerCache$resolve = handlerCache[resolvedName],
        revoke = _handlerCache$resolve.revoke,
        raw = _handlerCache$resolve.raw;

    try {
      if (cache && typeof raw.onunload === 'function') raw.onunload.call(null, raw.rawValue);
    } finally {
      raw.stop();
      revoke();
      delete handlerCache[resolvedName];
    }
  }
  if (cache && resolvedName in cache) {
    if (deep) {
      var children = cache[resolvedName].children;

      for (var i = 0; i < children.length; i++) {
        _unload(children[i].fileName, cache, deep);
      }
    }
    delete cache[resolvedName];
  }
}

function doRequire(module, resolvedName) {
  if (handlingPaths.has(resolvedName)) throw new ReferenceError('Object is not yet resolved.');
  try {
    handlingPaths.add(resolvedName);
    return this(module);
  } finally {
    handlingPaths.delete(resolvedName);
  }
}

function doRequireOTF(module, options) {
  if (!enabled) return this(module);
  var resolvedName = this.resolve(module);
  if (!_fs2.default.existsSync(resolvedName)) return Wrapper.isWrapable(options) && options.deferred || handlingPaths.has(resolvedName) ? new Proxy(Object.create(null, {
    value: deferredResolver,
    resolved: {
      value: doRequire.bind(this, module),
      configurable: true
    }
  }), proxyHandler) : doRequire.call(this, module);
  if (!(resolvedName in handlerCache)) {
    var raw = new RequireOTFHandler(this, module, resolvedName, options);
    handlerCache[resolvedName] = Object.assign({ raw: raw }, Proxy.revocable(raw, proxyHandler));
    raw.resume(true);
  } else if (!Wrapper.isWrapable(options)) {
    if (options.resume) handlerCache[resolvedName].raw.resume(options.forceReload);else if (options.forceReload) handlerCache[resolvedName].raw.forceReload();
  }
  return handlerCache[resolvedName].proxy;
}

function requireOTF(require) {
  return Object.defineProperties(Object.assign(doRequireOTF.bind(require), extensions, require), extensionProps);
}

function stopTrackAll() {
  for (var key in handlerCache) {
    handlerCache[resolvedName].raw.stop();
  }
}
//# sourceMappingURL=index.js.map