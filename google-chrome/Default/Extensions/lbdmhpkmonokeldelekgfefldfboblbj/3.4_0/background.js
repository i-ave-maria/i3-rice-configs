
function DeadProxyStorage(ttlMilliseconds) {
    var _ttlMilliseconds = ttlMilliseconds;
    var _servers = {};

    this.getAll = function() {
        cleanExpired();

        return Object.keys(_servers);
    };

    this.add = function(server) {
        _servers[server] = (new Date()).getTime();
    };

    function cleanExpired() {
        var nowTime = (new Date()).getTime();

        for (var server in _servers) {
            if (nowTime - _servers[server] > _ttlMilliseconds) {
                delete _servers[server];
            }
        }
    }
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), options.timeout);
    const response = await fetch(url, {
        mode: "cors",
        signal: controller.signal
    });
    clearTimeout(id);

    return await response.text();
}


async function XHR(options) {
    let url = options.url;
    let timeout = options.timeout || 10000; // 10 sec default
    let response;

    if (options.data) {
        url += '?' + new URLSearchParams(options.data).toString();
    }

    try {
        const response = await fetchWithTimeout(url, {timeout: timeout});

        return JSON.parse(response);
    } catch (error) {
        return {
            error: error,
            body: response
        };
    }
}


function createPac(server, proxy_hosts) {
    var host_matches = proxy_hosts.map(function(host) {
        return "shExpMatch(host, '" + host + "')";
    }).join(' || ');

    var protocol = ('http' === server.protocol)
        ? 'PROXY'
        : server.protocol.toUpperCase() ;

    var host = server.host;
    var port = parseInt(server.port, 10);
    var proxy = protocol + ' ' + host + ':' + port;

    return  "function FindProxyForURL(url, host) {" +
        "if ( " + host_matches + " ) {" +
        "return '" + proxy + "';" +
        "}" +
        "return 'DIRECT';" +
        "}";
}

function isControllableProxySettings(details) {
    return details && details.hasOwnProperty('levelOfControl') && 'controllable_by_this_extension' === details.levelOfControl || 'controlled_by_this_extension' === details.levelOfControl;
}

function clearProxy() {
    chrome.proxy.settings.clear({scope:'regular'});
    console.log('Proxy has been cleared');
}

function applyProxy(server, proxyHosts) {
    var config = {
        mode: "pac_script",
        pacScript: {
            data: createPac(server, proxyHosts)
        }
    };

    /* callback hell :( */
    chrome.proxy.settings.set({value: config, scope: 'regular'}, function() {
        console.log('Proxy has been set');

        chrome.browsingData.removeCache({since:getOneDayAgoTimestamp()}, function() {
            console.log('Cache has been cleared');

            chrome.tabs.query({currentWindow: true, active: true}, function(tabs) {
                tabs.forEach(function(tab) {
                    if (tab.url && isProxyHost(tab.url, proxyHosts)) {
                        chrome.tabs.reload(tab.id);
                        console.log('Active tab has been reloaded');
                    }
                });
            });
        });
    });
}

function isAvailableUpdate(current_v, actual_v) {
    return ('string' === typeof current_v && 'string' === typeof actual_v && current_v && actual_v && current_v < actual_v);
}

function setProblemIcon() {
    chrome.action.setBadgeText({"text":"?"});
    chrome.action.setBadgeBackgroundColor({"color":"red"});
    chrome.action.setIcon({
        path: {
            19: "images/rutracker19.png",
            38: "images/rutracker38.png"
        }
    });
}

function setInactiveIcon() {
    chrome.action.setBadgeText({"text":""});
    chrome.action.setIcon({
        path: {
            19: "images/rutracker-inactive19.png",
            38: "images/rutracker-inactive38.png"
        }
    });
}

function setDefaultIcon() {
    chrome.action.setBadgeText({"text":""});
    chrome.action.setIcon({
        path: {
            19: "images/rutracker19.png",
            38: "images/rutracker38.png"
        }
    });
}

function getOneDayAgoTimestamp() {
    return (new Date()).getTime() - (1000 * 60 * 60 * 24 * 1);
}


function getHost(url) {
    //do not cut the port
    return url && url.match(/^https?:\/\//)
        ? url.replace(/^https?:\/\//, '').split(/[/?#]/)[0]
        : false;
}

function isProxyHost(url, proxyHosts) {
    var host = getHost(url);

    return host
        ? host.match(buildRegex(proxyHosts))
        : false;
}

function buildRegex(hosts) {
    var regex = [];

    hosts.forEach(function(host) {
        regex.push(host.replace(/^\*\./, '\\w+\\.'));
    });

    return new RegExp('^(?:' + regex.join('|') + ')$');
}

(function() {

    var version = chrome.runtime.getManifest().version;
    var browserName = "chrome";
    var actualVersion = version;
    var deadProxies = new DeadProxyStorage(1 * 60 * 60 * 1000); //1 h
    var isControllableSettings;
    var isEnabled = true;
    var validateDelay = 2 * 1000; //2 sec
    var checkHealthzDelay = 1 * 60 * 25 * 1000; //25 min
    var validateInterval;
    var checkHealthzInterval;

    var proxyHosts = [
        'rutracker.org',
        '*.rutracker.org',
        '*.rutracker.cc'
    ];

    // Default
    var server = {
        protocol: 'https',
        host: 'rtk1.pass.xzvpn.net',
        port: 443
    };

    function processPlugin(forceReload) {
        if (isEnabled) {
            chrome.proxy.settings.get({incognito: false}, function(details) {
                var isControllableSettingsRuntime = isControllableProxySettings(details);

                if (forceReload || isControllableSettingsRuntime !== isControllableSettings) {
                    isControllableSettings = isControllableSettingsRuntime;
                    validatePopupIfOpened();
                    processIcon();

                    if (isControllableSettings) {
                        processProxy();
                    }
                }
            });
        }
        else {
            processIcon();
            clearProxy();
        }
    }

    async function processHealthz() {
        const response = await XHR({
            url: "http://rutracker.org/healthz",
            timeout: 5000
        });

        if (response.status === 'ok') {
            console.log('Proxy ' + server.host + ' is alive');
        } else {
            deadProxies.add(server.host);
            processPlugin(true);

            console.log('Proxy ' + server.host + ' seems to be dead', response);
        }

        var dp = deadProxies.getAll();

        console.log('Dead proxies are: ' + (dp.length ? dp.join(',') : 'none'));
    }

    async function processProxy() {
        // Download remote configuration
        const response = await XHR({
            url: "https://rtk.rmcontrol.net",
            timeout: 2000,
            data: {
                api_version: 2,
                browser_name: browserName,
                plugin_version: version,
                exclusions: deadProxies.getAll().join(',')
            }
        });

        if (!response.error && response.protocol && response.host && response.port) {
            server = {
                protocol: response.protocol,
                host: response.host,
                port: response.port
            };
            actualVersion = response.actual_plugin_version;

            validatePopupIfOpened();
            processIcon();
        } else {
            console.log('Failed to load remote configuration', response);
        }

        applyProxy(server, proxyHosts);
    }

    function processIcon() {
        if (!isEnabled) {
            setInactiveIcon();
        }
        else if (!isControllableSettings) {
            setProblemIcon();
        }
        else if (isAvailableUpdate(version, actualVersion)) {
            setProblemIcon();
        }
        else {
            setDefaultIcon();
        }
    }

    function validatePopupIfOpened() {
        chrome.runtime.sendMessage(
            {command: 'validate_popup', "isEnabled": isEnabled},
            function (response) {
                if (chrome.runtime.lastError) {
                    console.log('Popup is closed')
                } else {
                    console.log('Popup has been validated');
                }
            }
        );
    }

    function enableTimers() {
        validateInterval = setInterval(processPlugin, validateDelay);
        checkHealthzInterval = setInterval(processHealthz, checkHealthzDelay);
    }

    function disableTimers() {
        clearInterval(validateInterval);
        clearInterval(checkHealthzInterval);
    }

    // Register popup messages listener
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        /* getters */
        if ('is_enabled_proxy' === request.get) {
            sendResponse({
                is_enabled_proxy: isEnabled
            });
            return;
        }

        if ('current_state' === request.get) {
            sendResponse({
                is_enabled_proxy: isEnabled,
                is_available_update: isAvailableUpdate(version, actualVersion),
                is_controllable_settings: isControllableSettings
            });
            return;
        }

        /* setters */
        if ('is_enabled_proxy' === request.set) {
            // if changed
            if (request.value !== isEnabled) {
                chrome.storage.local.set({ is_enabled_proxy: request.value }).then(() => {
                    isEnabled = request.value;
                    disableTimers();
                    processPlugin(true);

                    if (isEnabled) {
                        enableTimers();
                    }
                });
            }
        }

        sendResponse();
    });

    chrome.storage.local
        .get(["is_enabled_proxy"])
        .then((result) => {
            if ("undefined" === typeof result.is_enabled_proxy) {
                chrome.storage.local.set({ is_enabled_proxy: true }).then(() => {
                    isEnabled = true;
                    processPlugin();
                    enableTimers();
                });
            } else {
                isEnabled = result.is_enabled_proxy;
                processPlugin();

                if (isEnabled) {
                    enableTimers();
                }
            }
        });
})();
