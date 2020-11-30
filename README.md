# esdoc-webpack-plugin

Run [`esdoc`](https://esdoc.org) with webpack!

## Installation
```
npm install --save-dev esdoc-webpack-plugin
```

## Configuration

`esdoc-webpack-plugin` has a handful of configuration options for itself, and
also accepts options to pass directly to esdoc itself, though it will try to
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
conf            | string  | The config filename to look for.
cwd             | string  | Where to start looking for the esdoc executable.
preserveTmpFile | boolean | The plugin creates a temporary file to use for configuration during esdoc runtime based on options from webpack and your config. Set this to true if you want to keep it around.
showOutput      | boolean | Prints esdoc output if true.

