/**
 * @file A webpack plugin to run esdoc on compile / recompile.
 */

const webpack = require('webpack');
const path = require('path');
const spawn = require('child_process').spawn;
const fse = require('fs-extra');
const chalk = require('chalk');

const validateOptions = require('schema-utils');

// Schema for options object.
const schema = {
    type: 'object',
    properties: {
        conf: {
            type: 'string',
        },
        cwd: {
            type: 'string',
        },
        preserveTmpFile: {
            type: 'boolean',
        },
        showOutput: {
            type: 'boolean',
        }
    },
};

const isWindows = /^win/.test(process.platform);

const PLUGIN_NAME = 'ESDocPlugin';

const ESDOC_FILES = isWindows ? [] : [
    'node_modules/.bin/esdoc',
    'node_modules/esdoc/esdoc.js',
];

/**
 * Look for files in directories.
 */
const lookupFile = (files, dirs) => {
    let found = null;

    [].concat(files).some(function (filename) {
        return [].concat(dirs).some(function (dirname) {
            var file = path.resolve(path.join(dirname, filename));

            if (fse.existsSync(file)) {
                return found = file;
            }
        });
    });

    return found;
};

const getLongestCommonSharedDirectory = (s) => {
    let k = s[0].Length;
    for (let i = 1; i < s.length; i++) {
        k = Math.Min(k, s[i].length);
        for (let j = 0; j < k; j++) {
            if (s[i][j] != s[0][j]) {
                k = j;
                break;
            }
        }
    }
    const fullPath = s[0].substring(0, k);
    return fullPath.substring(0, fullPath.lastIndexOf('/'));
}

/**
 * Reads the esdoc config
 *
 * @param {string} filepath - The path to the file.
 * @returns {any}
 */
const readConfigFile = (filepath) => {
    delete require.cache[filepath];
    return require(filepath);
};

/**
 * Converts milliseconds to minutes:seconds.
 *
 * @param {number} millis - A millisecond value.
 * @returns {string} - A string in the format mm:ss.
 */
const millisToMinutesAndSeconds = (millis) => {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
};

/**
 * Defines the main ESDocPlugin.
 *
 * @class
 * @type {WebpackPlugin}
 * @todo Running webpack in watch mode causes compile to happen twice.
 * @todo Validate constructor options.
 * @todo Cleanly merge options passed to the constructor with default options. Lodash's merge is nice, but I don't want another dep.
 * @todo Test it.
 * @todo Try setting some params from the webpack plugin instance.
 * @todo Handle cases where we can't find the config file.
 */
module.exports = class Plugin {
    constructor(opts = {source: './src', destination: './docs'}) {
        validateOptions(schema, opts, 'ESDoc webpack plugin');
        const defaultOptions = {
            conf: '.esdoc.json', // Default config file name.
            cwd: opts.cwd || './', // Default path for lookup.
            preserveTmpFile: true, // Keep the generated temporary settings file?
            showOutput: false, // Show all the output from esdoc?
            // esdoc option defaults, just in case.
            source: './src',
            destination: './docs',
            excludes: ['\\.config\\.js', '\\.babel\\.js'],
            plugins: [{
                name: 'esdoc-standard-plugin',
            }],
        };

        // Merge options
        // opts passed to the constructor will override default values.
        this.options = {...defaultOptions, ...opts};

        if (this.options.showOutput) {
            console.log(chalk.yellow('ESDocPlugin:'), 'Options', this.options);
        }
    }

    apply(compiler) {
        const self = this;
        const options = self.options;
        const cwd = process.cwd();
        const givenDirectory = options.cwd;
        let preserveTmpFile = options.preserveTmpFile;
        let esdocConfig = path.resolve(givenDirectory, options.conf);
        const esdocConfigDir = path.dirname(esdocConfig);
        const files = [];
        let cmd;
        let obj = {};
        let tmpFile;
        let esdocArgs;
        let esdoc;
        let esdocErrors = [];

        compiler.hooks.watchRun.tapAsync(PLUGIN_NAME, (compiler, callback) => {
            console.log(chalk.yellow('ESDocPlugin'), chalk.magenta('Watching for changes...'));
            callback();
        });

        const promiseEsdoc = (esdoc, cmd, esdocArgs, esdocConfigDir, esdocErrors, tmpFile) => new Promise((resolve, reject) => {
            esdoc = spawn(cmd, esdocArgs, {
                cwd: esdocConfigDir,
            });
            if (obj.showOutput) {
                // Collect the socket output from esdoc, turning the buffer into something readable.
                console.log(chalk.yellow('ESDocPlugin:'), 'Beginning output.');
                let received = '';
                esdoc.stdout.on('data', (data) => {
                    received += data;
                    const messages = received.split('\n');
                    if (messages.length > 1) {
                        let printed = '';
                        for (let message of messages) {
                            if (message !== '') {
                                let split = (message.toString().split(':'));
                                console.log(`${chalk.blue(split[0])}: ${chalk.green(split[1])}`);
                                received = '';
                            }
                        }
                    }
                });
            }
            esdoc.stderr.on('data', (data) => esdocErrors.push(data.toString()));
            esdoc.on('close', (closeCode) => {
                // Remove that tmp file if we have one and we aren't keeping it.
                if (tmpFile && !preserveTmpFile) {
                    console.log(chalk.yellow('ESDocPlugin:'), 'Removing temporary esdoc config file...');
                    fse.unlinkSync(tmpFile);
                    tmpFile = null;
                }
                if (esdocErrors.length > 0) {
                    esdocErrors.forEach((value) => console.error(value));
                    reject(new Error(chalk.yellow('ESDocPlugin:'), 'Exited with code ' + code));
                } else {
                    console.log(chalk.yellow('ESDocPlugin:'), 'Emitted files to output directory.');
                    resolve(true);
                }
            });
        });

        compiler.hooks.emit.tapAsync(PLUGIN_NAME, (compilation, callback) => {
            console.log(chalk.yellow('ESDocPlugin:'), 'Compiling...');
            console.log('EMITTING');

            // Look for esdoc and when we find it, set it to cmd.
            cmd = lookupFile(ESDOC_FILES, [
                // config dir
                esdocConfigDir,
                // given dir
                givenDirectory,
                // called from
                cwd,
                // Here
                __dirname,
            ]);
            // Wait a second... is esdoc installed?
            if (!cmd) {
                callback(new Error(chalk.yellow('ESDocPlugin:'), 'esdoc was not found.'));
            }
            // See if esdocConfig exists, if it does, set it to obj, otherwise have an exception.
            if (fse.existsSync(esdocConfig)) {
                try {
                    obj = readConfigFile(esdocConfig);
                } catch (exception) {
                    callback(exception);
                    return;
                }
            }

            // If we have a config file, use it. Otherwise handle it.
            if (obj.source && obj.includes) {
                console.log(chalk.yellow('ESDocPlugin:'), 'Pulling data from the configuration file.');
                // Merge the configuration file with the options object sent from webpack.
                // If a user decided to set some options when they called `new Plugin()`,
                // and still pointed to a config file, we can assume the instance settings
                // they passed should take priority.
                // Some of the keys that end up in here may not be useful.
                obj = {...obj, ...options}; // lodash would be better for this because it can do deep merges, but I just don't want it.
            }
            else {
                console.log(chalk.yellow('ESDocPlugin:'), 'Provided configuration either not found or does not contain an includes key. Generating from the bundles.')
                // If our options object doesn't have includes, let's generate them from the bundles.
                compilation.fileDependencies.forEach((filepath, i) => {
                    // Excludes this expression from out file path collection.
                    var exception = /\/node_modules\//.test(filepath);
                    var inclusion = /index.js$/.test(filepath);

                    // Collect all our js files.
                    if (!exception && inclusion) {
                        files.push(filepath);
                    }
                });

                // Get the shared parent directory of all our files, that's the src.
                obj.source = getLongestCommonSharedDirectory(files);
                obj = {...obj, ...options};
            }

            // Since we're generating config, we'll store it in a tmp file to pass to the esdoc executable.
            tmpFile = esdocConfig + '.tmp';
            console.log(chalk.yellow('ESDocPlugin:'), 'Writing temporary file at: ', tmpFile);
            fse.writeFileSync(tmpFile, JSON.stringify(obj));
            esdocConfig = tmpFile;

            console.log(chalk.yellow('ESDocPlugin:'), 'Using esdoc located at', cmd);

            // Esdoc doesn't actually have a lot of cli arguments.
            // Here we just point it to our config file.
            esdocArgs = ['-c', esdocConfig];

            callback();
        });

        // Report when finished.
        compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
            // @TODO: Really this run of esdoc as a child process should probably happen in the emit hook,
            //        but if it's there, watching makes emit trigger twice on startup. I'm guessing the
            //        reason this happens is that emit finishes before the subprocess has totally exited,
            //        so when it finally does end, the esdoc process creates/modifies files in the plugin
            //        output directory get created and compilation starts all over again.
            //        I need a way to ignore the output files or directory for this plugin during watch, we
            //        don't care if something happens there.
            promiseEsdoc(esdoc, cmd, esdocArgs, esdocConfigDir, esdocErrors, tmpFile)
            .then(response => {
                console.log(chalk.yellow('ESDocPlugin:'), 'Finished compiling.');
                console.log(chalk.yellow('ESDocPlugin:'), 'Total run time ', chalk.green(millisToMinutesAndSeconds(stats.endTime - stats.startTime)));
            })
        });


    }
};
