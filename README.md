# esdoc-webpack-plugin
![A rectangle with colors indicating the state of coverage](https://doc.esdoc.org/github.com/carwin/esdoc-webpack-plugin/badge.svg)

Run [`ESDoc`](https://esdoc.org) with Webpack!

## Installation
```
npm install --save-dev esdoc-webpack-plugin
```

## Configuration

`esdoc-webpack-plugin` has a handful of configuration options for itself, and
also accepts options to pass directly to ESDoc itself, though it will try to
read your configuration file if you've got one and fill in any gaps.

```js
// webpack.config.js
const ESDocPlugin = require('esdoc-webpack-plugin');

// ...

plugins: [
    new ESDocPlugin({
        cwd: '.'
        showOutput: false,
        source: './src',
        destination: './docs',
    })
]

// ...
```

### Options

Option          | Type    | Purpose
--------------- | ------- | --------------------------------------------------------------
conf            | string  | The configuration filename to look for.
cwd             | string  | Where to start looking for the ESDoc executable.
preserveTmpFile | boolean | The plugin creates a temporary file to use for configuration during ESDoc runtime based on options from Webpack and your config. Set this to true if you want to keep it around.
showOutput      | boolean | Prints ESDoc output if true.

