var _ = require('underscore'),
    fs = require('fs'),
    md5 = require('MD5'),
    Config = require('./config'),
    Component = require('./component'),
    Resource;

Resource = function(configFile) {
    this.config = new Config(configFile);
    this.config.read();

    this.resources = null;
    this.resourcesConfigs = null;
    this.resourcesBasePath = fs.realpathSync(configFile + '/../') + '/';
};

Resource.prototype._md5Files = function(files) {
    var hash = '',
        basePath = this.resourcesBasePath;

    _.each(files, function(file) {
        file = basePath + file;
        hash += md5(file + fs.lstatSync(file).mtime);
    });

    return md5(hash).substr(0, 32);
};

Resource.prototype.getConfigs = function() {
    var resourcesConfigs = this.resourcesConfigs,
        configInstance,
        globalConfigs,
        resourcesConfigsPath,
        resourcesFiles;

    if (resourcesConfigs === null) {
        configInstance = this.config;
        resourcesConfigsPath = configInstance.get('path', 'resources_config');
        if (typeof resourcesConfigsPath === 'undefined') {
            return null;
        }
        resourcesConfigsPath = this.resourcesBasePath + resourcesConfigsPath;
        if (fs.lstatSync(resourcesConfigsPath).isFile()) {
            resourcesConfigs = configInstance.getByFile(resourcesConfigsPath);
        } else {
            resourcesFiles = fs.readdirSync(resourcesConfigsPath);
            if (_.size(resourcesFiles) <= 0) {
                return null;
            }

            globalConfigs = null;
            resourcesConfigs = {};
            _.each(resourcesFiles, function(resourcesFile) {
                var configs = configInstance.getByFile(resourcesConfigsPath + '/' + resourcesFile);
                if (configs !== null) {
                    _.each(configs, function(config, key) {
                        var globalJavascript,
                            javascript,
                            globalCss,
                            css;

                        if (key === 'global') {
                            globalConfigs = config;
                        } else {
                            if (globalConfigs === null) {
                                resourcesConfigs[key] = config;
                            } else {
                                globalJavascript = globalConfigs.javascript;
                                globalCss = globalConfigs.css;

                                if (typeof globalJavascript !== 'undefined') {
                                    javascript = config.javascript;
                                    if (typeof javascript === 'undefined') {
                                        javascript = globalJavascript;
                                    } else {
                                        javascript = _.union(globalJavascript, javascript);
                                    }
                                }

                                if (typeof globalCss !== 'undefined') {
                                    css = config.css;
                                    if (typeof css === 'undefined') {
                                        css = globalCss;
                                    } else {
                                        css = _.union(globalCss, css);
                                    }
                                }

                                resourcesConfigs[key] = {
                                    javascript: (typeof javascript !== 'undefined' ? javascript : []),
                                    css: (typeof css !== 'undefined' ? css : [])
                                };

                                if (typeof config.dest_prefix !== 'undefined') {
                                    resourcesConfigs[key]['dest_prefix'] = config.dest_prefix;
                                }
                            }
                        }
                    });
                }
            });

            this.resourcesConfigs = resourcesConfigs;
        }
    }

    return resourcesConfigs;
};

Resource.prototype.parse = function() {
    var _this = this,
        resources = _this.resources,
        resourcesBasePath = _this.resourcesBasePath,
        resourcesConfigs = _this.getConfigs(),
        configInstance,
        componentInstance,
        prefixConfig,
        tmp;

    if (resourcesConfigs === null) {
        return null;
    }

    if (resources === null) {
        configInstance = _this.config;
        componentInstance = new Component(
            resourcesBasePath + configInstance.get('path', 'components_config')
        );
        componentInstance.configs = componentInstance.parse();
        componentInstance.components = null;
        resources = componentInstance.parse(null, resourcesConfigs);

        tmp = {};
        prefixConfig = configInstance.get('prefix');
        _.each(resources, function(resource, key) {
            var javascript = resource.javascript,
                javascriptPathPrefix = prefixConfig['resources_javascript'],
                css = resource.css,
                cssPathPrefix = prefixConfig['resources_css'],
                resourceKeyPrefix = prefixConfig['resources_controller'],
                javascriptHash,
                cssHash,
                destPrefix;

            javascript = _.map(javascript, function(fileName) {
                return javascriptPathPrefix + '/' + fileName;
            });
            javascriptHash = _this._md5Files(javascript);

            css = _.map(css, function(fileName) {
                return cssPathPrefix + '/' + fileName;
            });
            cssHash = _this._md5Files(css);

            if (typeof resourcesConfigs[key]['dest_prefix'] === 'undefined') {
                destPrefix = resourceKeyPrefix + '/' + key;
            } else {
                destPrefix = resourcesConfigs[key]['dest_prefix'];
            }

            tmp[resourceKeyPrefix + '/' + key] = {
                javascript: javascript,
                css: css,
                dest: {
                    javascript: destPrefix + '_' + javascriptHash + '.js',
                    css: destPrefix + '_' + cssHash + '.css'
                }
            };
        });

        this.resources = resources = tmp;
    }

    fs.writeFileSync(resourcesBasePath + 'build.lock', JSON.stringify(resources));

    return resources;
};

module.exports = Resource;