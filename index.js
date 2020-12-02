/**
 * A webpack plugin to run esdoc on compile / recompile.
 * @file
 */
const webpack = require('webpack');
const path = require('path');
const spawn = require('child_process').spawnSync;
const fse = require('fs-extra');
const chalk = require('chalk');
const validateOptions = require('schema-utils');

/**
 * ESDoc Plugin
 *
 * @class
 * @classdesc The primary entry point of the Webpack plugin.
 */
module.exports = class Plugin {
    /**
     * Instantiates the Plugin class.
     *
     * @param {Object} opts - The options passed to the plugin from Webpack configuration.
     * @param {string} [opts.source='./src'] - The directory in which to look for files to process.
     * @param {string} [opts.destination='./docs'] - A default value for destination, just in case.
     */
    constructor(opts = {source: './src', destination: './docs'}) {
        // Validate the opts the constructor received.
        validateOptions(this.schema(), opts, 'ESDoc Webpack plugin');
        // Define default options.
        const defaultOptions = {
            conf: '.esdoc.json', // Default config file name.
            cwd: opts.cwd || './', // Default path for lookup.
            preserveTmpFile: true, // Keep the generated temporary settings file?
            showOutput: false, // Show all the output from esdoc?
            // ESDoc option defaults, just in case.
            source: './src',
            destination: './docs',
            excludes: ['\\.config\\.js', '\\.babel\\.js'],
            plugins: [{
                name: 'esdoc-standard-plugin',
            }],
        };

        /**
         * Merge the opts and defaultOptions objects, letting any passed information from
         * opts override a corresponding defaultOptions version.
         *
         * @type {Object}
         * @property {Object} options.defaultOptions - A default set of options.
         * @property {Object} options.opts - The options passed to the constructor from Webpack.
         */
        this.options = {...defaultOptions, ...opts};
        /**
         * The name of the Plugin.
         *
         * @type {string}
         */
        this.pluginName = 'ESDocPlugin';

        // If the user has chosen to show output, output information about the finalized
        // options the plugin will use.
        if (this.options.showOutput) {
            console.log(chalk.yellow(`${this.pluginName}:`), 'Initializing with Options:', this.options);
        }
    }
    /**
     * Defines the schema to validate against for the Plugin constructor's parameters .
     *
     * @return {Object} An Object containing schema definitions.
     * @property {string} type - What type to expect.
     * @property {Object} properties - The properties to validate in the constructor.
     */
    schema() {
        return {
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
    }

    /**
     * Converts milliseconds to minutes:seconds.
     *
     * @param {number} millis - A millisecond value.
     * @return {string} - A string in the format mm:ss.
     */
    millisToMinutesAndSeconds(millis) {
        var minutes = Math.floor(millis / 60000);
        var seconds = ((millis % 60000) / 1000).toFixed(0);
        return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }

    /**
     * Reads the ESDoc config.
     *
     * @param {string} filepath - The path to the file.
     * @return {(Object | null)} - Either a JSON object or null.
     */
    readConfigFile(filepath) {
        delete require.cache[filepath];
        return fse.readJsonSync(filepath, { throws: false });
    };

    /**
     * Checks whether or not Node's process.platform returns a string beginning with "win".
     * If it's true, it can be inferred that Webpack is running on a Windows system.
     *
     * @return {boolean} - Whether or not the plugin is running on a Windows environment.
     */
    isWindowsEnv() {
        return /^win/.test(process.platform);
    }
    /**
     * Sets the location for the ESDoc files.
     *
     * @return {Array<string>} An array of normal locations for the ESDoc executabble.
     */
    getESDocFiles() {
        return this.isWindowsEnv() ? [
            'node_modules/.bin/jsdoc.cmd'
        ] : [
            'node_modules/.bin/esdoc',
            'node_modules/esdoc/esdoc.js',
        ];
    }

    /**
     * Gets the longest shared directory from an array of filepaths.
     *
     * @param {array} s - An array of filepaths.
     * @return {string} The longest shared directory from s.
     */
    getLongestCommonSharedDirectory(s) {
        let k = s[0].length;
        for (let i = 1; i < s.length; i++) {
            k = Math.min(k, s[i].length);
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
     * Looks for files given two arrays
     *
     * @param {Array<string>} files - An array of files.
     * @param {Array<string>} dirs - An array of directories.
     * @return {(null | boolean)} Whether or not a file was found.
     */
    lookupFile(files, dirs) {
        let found = null;

        // On each of the files array items (as filename), concat an empty array on the dirs array.
        [].concat(files).some(function (filename) {
            // On each item in that (as dirname) array, create an absolute filepath using dirname and filename.
            return [].concat(dirs).some(function (dirname) {
                var file = path.resolve(path.join(dirname, filename));

                // If that file exists on the filesystem, set found to true.
                if (fse.existsSync(file)) {
                    return found = file;
                }
            });
        });

        // Return whether or not found was true.
        return found;
    };
    /**
     * Runs the ESDoc executable.
     *
     * @param {string} cmd - The path of the ESDoc executable.
     * @param {Array<string>} esdocArgs - An array of arguments to pass to the ESDoc executable.
     * @param {string} esdocConfigDir - The directory in which ESDoc's configuration lives. This should be where ESDocPlugin outputs the tmpFile.
     * @param {string} tmpFile - The full path to the tmpFile. Used for checking whether it exists or not.
     * @return {Promise} The Promise returned by the function.
     */
    Esdoc(cmd, esdocArgs, esdocConfigDir, tmpFile) {
        let esdocErrors = [];
        const esdoc = spawn(cmd, esdocArgs, {
            cwd: esdocConfigDir,
        });

        // If showOutput is true, collect the socket output from esdoc, turning
        // the buffer into something readable.
        if (this.options.showOutput) {

            let received = '';

            // Tell the user it's about to start.
            console.log(chalk.yellow(`${this.pluginName}:`), 'Beginning output.');

            // Show the data.
            const esdocOutput = esdoc.stdout;
            received += esdocOutput;
            const messages = received.split('\n');
            // Try to make the buffer data look nicer by coloring parts.
            const setOutputPrefixColor = (str) => {
                let prefixes = {resolve: 'cyan', output: 'blue', parse: 'green'};
                let prefix = str;
                for (const key in prefixes) {
                    if (str === key) {
                        prefix = chalk[prefixes[key]](str);
                        break;
                    }
                }
                return prefix;
            }
            if (messages.length > 1) {
                let printed = '';
                for (let message of messages) {
                    if (message !== '') {
                        let split = (message.toString().split(':'));
                        console.log(`${setOutputPrefixColor(split[0])}: ${chalk.dim(split[1])}`);
                        received = '';
                    }
                }
            }
        }

        // Remove that tmp file, if one exists, and the user has chosen not to preserve it.
        if (tmpFile && !this.options.preserveTmpFile) {
            console.log(chalk.yellow(`${this.pluginName}:`), 'Removing temporary esdoc config file...');
            if (fse.existsSync(tmpFile)) {
                fse.unlinkSync(tmpFile);
            }
        }
        if ( esdoc.stderr.length > 0) {
            console.error('ERR toString', esdoc.stderr.toString());
            return new Error(chalk.yellow(`${this.pluginName}:`), 'Exited with code ' + esdoc.status);
        } else {
            console.log(chalk.yellow(`${this.pluginName}:`), 'Emitted files to output directory.');
            return true;
        }
    }
    /**
     * The apply method Webpack plugins must declare.
     *
     * @param {object} compiler - The Webpack compiler object.
     * @see https://webpack.js.org/contribute/writing-a-plugin/#basic-plugin-architecture
     * @todo Look into AsyncSeriesHook, it might help make things cleaner.
     */
    apply(compiler) {
        const self = this;
        const options = self.options;
        const cwd = process.cwd();
        const esdocFiles = self.getESDocFiles();
        const givenDirectory = options.cwd;
        const files = [];
        const pluginName = self.pluginName;
        const preserveTmpFile = options.preserveTmpFile;

        let cmd,
            esdoc,
            esdocArgs,
            esdocConfig = path.resolve(givenDirectory, options.conf),
            esdocConfigDir = path.dirname(esdocConfig),
            obj = {},
            tmpFile = null,
            tmp,
            tmpFilename,
            tmpFilepath;

        /**
         * Hooks into emit using tapAsync().
         *
         * @external {compiler.hooks.emit} https://webpack.js.org/api/compiler-hooks/#emit
         */
        compiler.hooks.emit.tapAsync(pluginName, (compilation, callback) => {
            // Let the user know ESDocPlugin is running.
            console.log(chalk.yellow(`${pluginName}:`), 'Compiling...');

            // Look for ESDoc and when found, set it to cmd.
            cmd = self.lookupFile(esdocFiles, [
                // config dir
                esdocConfigDir,
                // given dir
                givenDirectory,
                // called from
                cwd,
                // Here
                __dirname,
            ]);

            // If the ESDoc executable was not found, exit.
            if (!cmd) {
                callback(new Error(chalk.yellow(`${pluginName}:`), 'ESDoc was not found, exiting.'));
            }
            // See if esdocConfig exists, if it does, set it to obj, otherwise have an exception.
            if (fse.existsSync(esdocConfig)) {
                try {
                    obj = self.readConfigFile(esdocConfig);
                } catch (exception) {
                    callback(exception);
                    return;
                }
            }

            // If there is a config file, use it. Otherwise handle it.
            if (obj.source && obj.includes) {
                console.log(chalk.yellow(`${pluginName}:`), 'Pulling data from the configuration file.');
                // Merge the configuration file with the options object sent from Webpack.
                // If a user decided to set some options when they called `new Plugin()`,
                // and still pointed to a config file, it can be assumed that the instance
                // settings passed should take priority.
                // Some of the keys that end up in here may not be useful.
                obj = {...obj, ...options}; // lodash would be better for this because it can do deep merges, but I just don't want it.
            }
            else {
                console.log(chalk.yellow(`${pluginName}:`), 'Provided configuration either not found or does not contain an includes key. Generating from the bundles.')
                // If our options object doesn't have includes, let's generate them from the bundles.
                compilation.fileDependencies.forEach((filepath, i) => {
                    // Excludes this expression from out file path collection.
                    var exception = /\/node_modules\//.test(filepath);
                    var inclusion = /index.js$/.test(filepath);

                    // Collect all our js files.
                    if (!exception && inclusion && !files.includes(filepath)) {
                        files.push(filepath);
                    }
                });

                // Get the shared parent directory of all our files, that's the src.
                obj.source = self.getLongestCommonSharedDirectory(files);
                obj = {...obj, ...options};
            }

            // Since a config file is being generated, store it in a tmp file to pass to the ESDoc executable.
            tmp = path.parse(esdocConfig);
            tmpFilename = tmp.base;
            tmpFilepath = tmp.dir;
            if (/\.tmp$/.test(tmpFilename)) {
                tmpFile = tmpFilepath + '/' + tmpFilename;
            } else {
                tmpFile = tmpFilepath + '/' + tmpFilename + '.tmp';
            }
            // Let the user know ESDocPlugin is writing a file.
            console.log(chalk.yellow(`${pluginName}:`), 'Writing temporary file at: ', tmpFile);
            fse.writeFileSync(tmpFile, JSON.stringify(obj));
            esdocConfig = tmpFile;

            // Alert the user that ESDocPlugin is going to be reading the file that was written.
            console.log(chalk.yellow(`${pluginName}:`), 'Using esdoc located at', cmd);

            // Set the command line options for ESDoc. Point to the created config file.
            esdocArgs = ['-c', esdocConfig];

            // End the emit hook.
            try {
                this.Esdoc(cmd, esdocArgs, esdocConfigDir, tmpFile, obj);
            } catch (err) {
                return new Error(pluginName, 'There was a problem running ESDoc.');
            }
            callback();
        });

        /**
         * Hooks into done using tap().
         *
         * @external {compiler.hooks.done} https://webpack.js.org/api/compiler-hooks/#done
         */
        compiler.hooks.done.tap(pluginName, (stats) => {
            console.log(chalk.yellow(`${pluginName}:`), 'Total run time ', chalk.green(self.millisToMinutesAndSeconds(stats.endTime - stats.startTime)));
        });

    }
};

