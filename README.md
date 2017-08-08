Require-OTF
===========

Require-OTF (Require on-the-fly) - A Node.js module brings ability to hot-reloading and lazy-loading on other modules. Written in new ES6 flavor.

Usage
-----

You can just use the requireOTF as normal `require()` like this:
```javascript
const requireOTF = require('require-otf').requireOTF(require);
const whatever = requireOTF('./path/to/module');

// ...
```

When you edit and save the module file that required like above, it will auto reloaded, unless it is a native module.

Additional you may pass an object with these optional parameters at the second argument to control the behaviour:
- `method`: string, must be `'native'` or `'polling'`, default is `'native'`, defines what method to determine the changes of JSON file. `'native'` mode will use system API to detect, and `'polling'` mode will poll the modefied time of the JSON file. In the most case 'native' is more efficient, but some of the operating system does not support this, in this case `'polling'` should be used as fallback.
- `deferred`: boolean, set it to `true` to not start loading the module until the first access on its properties, default is `false`.
- `resume`: boolean, resume tracking if there are any slept file change tracker on the module required, default is `false`.
- `forceReload`: boolean, force to reload the module even it is already loaded, default is `false`.
- `interval`: integer, the checking interval if `'polling'` mode is used. Default is `5000` milliseconds.
- `reloadDelay`: integer, the delay between the file change notification received and reloading the module, default is `100` milliseconds.

Besides the functions and properties provided in native `require()` from Node, Require-OTF also provided these functions in the instances, you may use `requireOTF.xxx` to use them:
- `stopTrackAll()`: Stop all module file change trackers.
- `stopTrack(module)`: Stop file change tracker belongs to the module path provided.
  - `module`: string, the path to the module in current scope.
- `resumeTrack(module, forceReload)`: Resume/restart file change tracker belongs to the module path provided.
  - `module`: string, the path to the module in current scope.
  - `forceReload`: boolean, `true` to force reload the module whatever it has been modified.
- `unload(module)`: Unloads a module from cache, stops its file change tracker if available. All references to this module through Require-OTF will be invalid.
  - `module`: string, the path to the module in current scope.
- `enabled`: boolean, set to `false` to bypass everything, except for required modules, it is a global property and changing it will affect all Require-OTF instances in your application, default is `true`.

Install
-------

With NPM:
```sh
$ npm i --save require-otf
```

License
-------
[MIT](LICENSE)